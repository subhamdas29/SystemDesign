import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/engine/simulation';
import { hashEventStream } from '../src/engine/hashing';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';
import { createStarterGraph } from '../src/builder/placement';

describe('Phase 8A Regression: Legitimate-Only Pre-8A Behavior', () => {
  it('discrete mode: runs without campaign produce bit-for-bit identical hashes with fixed seed', () => {
    const starter = createStarterGraph();
    const traffic = { rps: 30, durationMs: 3000 };

    const sim1 = createSimulation({ graph: starter, traffic, seed: 42 });
    sim1.advanceTo(3000);
    const hash1 = hashEventStream(sim1.getAllEvents());
    const snap1 = sim1.getSnapshot();

    const sim2 = createSimulation({ graph: starter, traffic, seed: 42 });
    sim2.advanceTo(3000);
    const hash2 = hashEventStream(sim2.getAllEvents());
    const snap2 = sim2.getSnapshot();

    expect(hash1).toBe(hash2);
    expect(snap1.counters.created).toBe(snap2.counters.created);
    expect(snap1.counters.succeeded).toBe(snap2.counters.succeeded);
    expect(snap1.counters.rejected).toBe(snap2.counters.rejected);
    expect(snap1.latencySummary.averageMs).toBe(snap2.latencySummary.averageMs);

    // In legitimate-only run, legitimate counters equal overall counters
    expect(snap1.counters.legitimate?.created).toBe(snap1.counters.created);
    expect(snap1.counters.malicious?.created).toBe(0);
    expect(snap1.counters.malicious?.reachedTarget).toBe(0);
  });

  it('aggregate mode: runs without campaign satisfy fluid conservation and match deterministic state', () => {
    const starter = createStarterGraph();
    const trafficConfig = {
      peakRps: 800,
      durationMs: 4000,
      pattern: 'constant' as const,
      patternParams: { type: 'constant' as const },
      mode: 'aggregate' as const,
    };

    const sim1 = createAggregateSimulation({ graph: starter, traffic: trafficConfig, seed: 42 });
    const snap1 = sim1.advanceTo(4000);

    const sim2 = createAggregateSimulation({ graph: starter, traffic: trafficConfig, seed: 42 });
    const snap2 = sim2.advanceTo(4000);

    expect(snap1.counters.created).toBe(snap2.counters.created);
    expect(snap1.counters.succeeded).toBe(snap2.counters.succeeded);
    expect(snap1.counters.rejected).toBe(snap2.counters.rejected);
    expect(snap1.counters.inFlight).toBe(snap2.counters.inFlight);

    // Verify legitimate-only counters
    expect(snap1.counters.legitimate?.created).toBe(snap1.counters.created);
    expect(snap1.counters.malicious?.created).toBe(0);
  });
});
