import { describe, it, expect } from 'vitest';
import { createStarterGraph, addComponent } from '../src/builder';
import { createSimulation } from '../src/engine/simulation';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';

describe('Phase 9: Read Replicas, Lag, Staleness, and Failover Suite', () => {
  function buildReplicaGraph(overrides?: {
    readFromReplicasShare?: number;
    stalenessThresholdMs?: number;
    replicationApplyRate?: number;
    autoFailoverEnabled?: boolean;
    failoverDetectionMs?: number;
    failoverPromotionMs?: number;
  }) {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'database-replica');
    graph = addComponent(graph, 'database-replica');

    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'client') {
          return {
            ...n,
            config: {
              ...n.config,
              readRatio: 90, // Read-heavy to exercise replicas
            },
          };
        }
        if (n.type === 'cache') {
          return {
            ...n,
            config: {
              ...n.config,
              hitRatio: 50, // 50% misses hit database/replicas
            },
          };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              readFromReplicasShare: overrides?.readFromReplicasShare ?? 90,
              stalenessThresholdMs: overrides?.stalenessThresholdMs ?? 50,
              autoFailoverEnabled: overrides?.autoFailoverEnabled ?? true,
              failoverDetectionMs: overrides?.failoverDetectionMs ?? 1000,
              failoverPromotionMs: overrides?.failoverPromotionMs ?? 500,
              failover: {
                enabled: overrides?.autoFailoverEnabled ?? true,
                detectionMs: overrides?.failoverDetectionMs ?? 1000,
                promotionMs: overrides?.failoverPromotionMs ?? 500,
              },
            },
          };
        }
        if (n.type === 'database-replica') {
          return {
            ...n,
            config: {
              ...n.config,
              replicationApplyRate: overrides?.replicationApplyRate ?? 20,
              capacityQps: 800,
            },
          };
        }
        return n;
      }),
    };

    return graph;
  }

  it('routes read-miss queries to read replicas rather than primary database', () => {
    const graph = buildReplicaGraph({ readFromReplicasShare: 100 });
    const sim = createSimulation({
      graph,
      traffic: {
        peakRps: 60,
        durationMs: 4000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 42,
    });

    const snap = sim.advanceTo(3000);
    const replica1 = snap.runtimeNodes['database-replica-1'];
    const replica2 = snap.runtimeNodes['database-replica-2'];

    expect(replica1).toBeDefined();
    expect(replica2).toBeDefined();
    // Both replicas should have received queries
    expect(replica1!.currentRps + replica2!.currentRps).toBeGreaterThan(0);
  });

  it('accumulates replication lag and counts stale reads when lag exceeds staleness threshold', () => {
    // Low apply rate (5 writes/sec) and low staleness threshold (20ms)
    const graph = buildReplicaGraph({
      stalenessThresholdMs: 10,
      replicationApplyRate: 2,
    });

    // Client with writes to generate replication lag
    const writeGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.type === 'client' ? { ...n, config: { ...n.config, readRatio: 50 } } : n
      ),
    };

    const sim = createSimulation({
      graph: writeGraph,
      traffic: {
        peakRps: 80,
        durationMs: 4000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 101,
    });

    const snap = sim.advanceTo(3500);
    expect(snap.counters.replicationLagMs ?? 0).toBeGreaterThan(0);
    expect(snap.counters.staleReadsCount ?? 0).toBeGreaterThan(0);
  });

  it('handles primary database failure with detection and promotion window before write recovery', () => {
    const graph = buildReplicaGraph({
      autoFailoverEnabled: true,
      failoverDetectionMs: 1000,
      failoverPromotionMs: 500,
    });

    // Write-only traffic to observe write failure & recovery
    const writeGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.type === 'client' ? { ...n, config: { ...n.config, readRatio: 0 } } : n
      ),
    };

    const sim = createSimulation({
      graph: writeGraph,
      traffic: {
        peakRps: 50,
        durationMs: 5000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 202,
      scenarioScript: [
        {
          t: 1000,
          action: 'inject',
          failureType: 'db-crash',
          targetId: 'database-1',
          durationMs: 4000,
        },
      ],
    });

    // At t=1500: detecting failure (outage)
    const snapMidOutage = sim.advanceTo(1500);
    expect(snapMidOutage.counters.failed + snapMidOutage.counters.rejected).toBeGreaterThan(0);

    // At t=3500: promotion complete, promoted replica serves writes
    const snapPromoted = sim.advanceTo(3500);
    expect(snapPromoted.counters.failoverState).toBe('promoted');
    expect(snapPromoted.counters.succeeded).toBeGreaterThan(snapMidOutage.counters.succeeded);
  });

  it('models replica read offload and replication lag in aggregate simulation mode', () => {
    const graph = buildReplicaGraph({
      readFromReplicasShare: 80,
      replicationApplyRate: 5,
    });

    const aggSim = createAggregateSimulation({
      graph,
      traffic: {
        peakRps: 200,
        durationMs: 6000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 303,
    });

    const snap = aggSim.advanceTo(4000);
    expect(snap.counters.replicationLagMs ?? 0).toBeGreaterThan(0);
  });
});
