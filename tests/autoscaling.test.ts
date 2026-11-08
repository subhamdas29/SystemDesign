import { describe, it, expect } from 'vitest';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';
import { createStarterGraph } from '../src/builder/placement';
import { AppServerConfig, DatabaseConfig } from '../src/types';

describe('App Server Autoscaling (Phase 8B)', () => {
  it('scales out instances when utilization exceeds threshold and accumulates cost', () => {
    let graph = createStarterGraph();
    // Configure autoscaling on App Server
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'app-server') {
          return {
            ...n,
            config: {
              ...(n.config as AppServerConfig),
              maxThroughputRps: 200,
              autoscaling: {
                enabled: true,
                minInstances: 1,
                maxInstances: 5,
                scaleOutUtilizationPct: 70,
                scaleOutAfterSec: 1,
                provisioningDelaySec: 1,
                scaleInUtilizationPct: 30,
                cooldownSec: 5,
                costPerInstanceHour: 0.10,
              },
            },
          };
        }
        return n;
      }),
    };

    // Run high traffic (800 RPS) to trigger autoscaling
    const sim = createAggregateSimulation({
      graph,
      traffic: {
        peakRps: 800,
        durationMs: 8000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'aggregate',
      },
      seed: 42,
    });

    sim.advanceTo(8000);
    const snap = sim.getSnapshot();

    // Active instances should have scaled beyond 1
    expect(snap.counters.activeInstancesCount).toBeGreaterThan(1);
    expect(snap.counters.activeInstancesCount).toBeLessThanOrEqual(5);

    // Autoscaling cost should have accumulated
    expect(snap.counters.autoscalingCostDollars).toBeGreaterThan(0);
  });

  it('scaling app servers cannot resolve downstream database bottleneck', () => {
    let graph = createStarterGraph();
    // Severely bottleneck Database at 100 QPS
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...(n.config as DatabaseConfig),
              maxQueryThroughputQps: 100,
              connectionPoolSize: 20,
              queueLimit: 50,
            },
          };
        }
        if (n.type === 'app-server') {
          return {
            ...n,
            config: {
              ...(n.config as AppServerConfig),
              autoscaling: {
                enabled: true,
                minInstances: 1,
                maxInstances: 8,
                scaleOutUtilizationPct: 60,
                scaleOutAfterSec: 1,
                provisioningDelaySec: 1,
                scaleInUtilizationPct: 30,
                cooldownSec: 5,
                costPerInstanceHour: 0.10,
              },
            },
          };
        }
        return n;
      }),
    };

    const sim = createAggregateSimulation({
      graph,
      traffic: {
        peakRps: 1000,
        durationMs: 6000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'aggregate',
      },
      seed: 42,
    });

    sim.advanceTo(6000);
    const snap = sim.getSnapshot();

    // App servers scaled out
    expect(snap.counters.activeInstancesCount).toBeGreaterThan(1);

    // But system suffered rejections/failures due to database saturation
    expect(snap.counters.rejected + snap.counters.failed).toBeGreaterThan(0);
    const dbRuntime = snap.runtimeNodes['database-1'];
    expect(dbRuntime?.utilization).toBeGreaterThan(0.85);
  });
});
