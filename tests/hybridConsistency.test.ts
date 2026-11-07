import { describe, it, expect } from 'vitest';
import { createDiscreteSimulation } from '../src/engine/simulation';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';
import { createStarterGraph } from '../src/builder/placement';

describe('Discrete vs Aggregate Hybrid Consistency', () => {
  it('agrees within ±10% throughput and ±15% P50 latency at 200 RPS', () => {
    const starter = createStarterGraph();
    const durationMs = 5000;
    const peakRps = 200;

    const discreteSim = createDiscreteSimulation({
      graph: starter,
      traffic: {
        peakRps,
        durationMs,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'discrete',
      },
      seed: 42,
    });

    const aggregateSim = createAggregateSimulation({
      graph: starter,
      traffic: {
        peakRps,
        durationMs,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'aggregate',
      },
      seed: 42,
    });

    const discreteSnap = discreteSim.advanceTo(durationMs);
    const aggregateSnap = aggregateSim.advanceTo(durationMs);

    // 1. Throughput consistency within ±10%
    const discreteThroughput = discreteSnap.counters.succeeded;
    const aggregateThroughput = aggregateSnap.counters.succeeded;
    const throughputDiffRatio =
      Math.abs(discreteThroughput - aggregateThroughput) / Math.max(1, discreteThroughput);

    expect(throughputDiffRatio).toBeLessThanOrEqual(0.10);

    // 2. Latency consistency within ±15%
    const discreteP50 = discreteSnap.latencySummary.p50Ms;
    const aggregateP50 = aggregateSnap.latencySummary.p50Ms;
    const latencyDiffRatio = Math.abs(discreteP50 - aggregateP50) / Math.max(1, discreteP50);

    expect(latencyDiffRatio).toBeLessThanOrEqual(0.15);
  });
});
