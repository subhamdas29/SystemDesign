import { describe, it, expect } from 'vitest';
import { createStarterGraph, addComponent } from '../src/builder';
import { createSimulation } from '../src/engine/simulation';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';
import {
  calculateZipfWeights,
  calculateShardedMaxThroughput,
} from '../src/engine/components/databaseModel';

describe('Phase 9: Database Sharding, Zipf Key Skew, and Hot Shards Suite', () => {
  it('correctly calculates normalized Zipf probabilities across shards', () => {
    const weights4Uniform = calculateZipfWeights(4, 0.0);
    expect(weights4Uniform.length).toBe(4);
    for (const w of weights4Uniform) {
      expect(w).toBeCloseTo(0.25, 2);
    }

    const weights4Skewed = calculateZipfWeights(4, 1.2);
    expect(weights4Skewed.length).toBe(4);
    // Hottest shard (index 0) receives highest share
    expect(weights4Skewed[0]).toBeGreaterThan(weights4Skewed[1]!);
    expect(weights4Skewed[1]).toBeGreaterThan(weights4Skewed[2]!);
    expect(weights4Skewed[2]).toBeGreaterThan(weights4Skewed[3]!);

    // Total probability sums to 1.0
    const sum = weights4Skewed.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('verifies hot shard throughput ceiling formula: RPS_max = Cap_total / (N * P_hot)', () => {
    const totalCapacity = 1000;
    const shardCount = 4;
    const skew = 1.5;

    const weights = calculateZipfWeights(shardCount, skew);
    const pHot = weights[0]!;

    const theoreticalMaxRps = calculateShardedMaxThroughput(
      totalCapacity,
      shardCount,
      'zipf-skewed',
      skew
    );

    const expectedFormulaRps = (totalCapacity / shardCount) / pHot;
    expect(theoreticalMaxRps.maxSustainableRps).toBe(Math.round(expectedFormulaRps));
    // Severely reduced compared to theoretical uniform 1000 RPS
    expect(theoreticalMaxRps.maxSustainableRps).toBeLessThan(totalCapacity * 0.5);
  });

  it('demonstrates hot shard saturation in discrete simulation mode', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'client') {
          return { ...n, config: { ...n.config, readRatio: 0 } }; // write queries direct to DB
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              shardCount: 4,
              shardKeyDistribution: 'zipf-skewed',
              zipfSkew: 1.5,
              maxQueryThroughputQps: 100, // 25 QPS per shard
            },
          };
        }
        return n;
      }),
    };

    const sim = createSimulation({
      graph,
      traffic: {
        peakRps: 60,
        durationMs: 4000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 888,
    });

    const snap = sim.advanceTo(3000);
    expect(snap.counters.shardLoads).toBeDefined();
    expect(snap.counters.shardLoads?.length).toBe(4);

    // Shard 0 load significantly exceeds Shard 3 load
    const shardLoads = snap.counters.shardLoads!;
    expect(shardLoads[0]!).toBeGreaterThan(shardLoads[3]!);
  });

  it('caps cluster throughput by the hottest shard in aggregate simulation mode', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'client') {
          return { ...n, config: { ...n.config, readRatio: 0 } };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              shardCount: 4,
              shardKeyDistribution: 'zipf-skewed',
              zipfSkew: 1.3,
              maxQueryThroughputQps: 200, // 50 QPS per shard
            },
          };
        }
        return n;
      }),
    };

    const aggSim = createAggregateSimulation({
      graph,
      traffic: {
        peakRps: 150,
        durationMs: 5000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 999,
    });

    const snap = aggSim.advanceTo(3000);
    expect(snap.counters.hotShardLoadPercent).toBeGreaterThan(50);
  });
});
