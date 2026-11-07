import { describe, it, expect } from 'vitest';
import { createStarterGraph } from '../src/builder';
import { createSimulation } from '../src/engine';
import { ScenarioCommand } from '../src/scenarios/failures/types';

describe('Phase 7: Deterministic Chaos Scenario Scripts & Seek Consistency', () => {
  it('same seed + scenario script yields identical snapshot and counters bit-for-bit', () => {
    const graph = createStarterGraph();
    const script: ScenarioCommand[] = [
      {
        t: 1000,
        action: 'inject',
        failureType: 'db-slow',
        targetId: 'database-1',
        durationMs: 2000,
        params: { multiplier: 4 },
      },
      {
        t: 3500,
        action: 'inject',
        failureType: 'app-server-degraded',
        targetId: 'app-server-1',
        durationMs: 1500,
        params: { factor: 0.1 },
      },
    ];

    const run1 = createSimulation({
      graph,
      traffic: { peakRps: 100, durationMs: 6000, mode: 'discrete' },
      seed: 777,
      scenarioScript: script,
    });
    const snap1 = run1.advanceTo(5500);

    const run2 = createSimulation({
      graph,
      traffic: { peakRps: 100, durationMs: 6000, mode: 'discrete' },
      seed: 777,
      scenarioScript: script,
    });
    const snap2 = run2.advanceTo(5500);

    expect(snap1.counters).toEqual(snap2.counters);
    expect(snap1.latencySummary).toEqual(snap2.latencySummary);
    expect(snap1.recentEvents.length).toEqual(snap2.recentEvents.length);
  });

  it('seek/replay consistency: seeking produces identical state to advancing continuously', () => {
    const graph = createStarterGraph();
    const script: ScenarioCommand[] = [
      {
        t: 1500,
        action: 'inject',
        failureType: 'db-slow',
        targetId: 'database-1',
        durationMs: 2000,
        params: { multiplier: 3 },
      },
    ];

    const sim = createSimulation({
      graph,
      traffic: { peakRps: 80, durationMs: 5000, mode: 'discrete' },
      seed: 888,
      scenarioScript: script,
    });

    const continuousSnap = sim.advanceTo(3000);

    // Seek back to 1000ms, then seek forward to 3000ms
    sim.seek(1000);
    const seekedSnap = sim.seek(3000);

    expect(seekedSnap.counters).toEqual(continuousSnap.counters);
    expect(seekedSnap.latencySummary).toEqual(continuousSnap.latencySummary);
  });
});
