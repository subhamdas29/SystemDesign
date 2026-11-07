import { describe, it, expect } from 'vitest';
import { createStarterGraph } from '../src/builder';
import { createSimulation } from '../src/engine';
import { SCENARIO_PRESETS } from '../src/scenarios/examples/presets';

describe('Phase 7: Runnable Scenario Presets Suite', () => {
  it('contains all 6 required scenario presets with complete descriptions and takeaways', () => {
    expect(SCENARIO_PRESETS.length).toBe(6);
    const expectedIds = [
      'healthy-baseline',
      'slow-database-cascade',
      'slow-database-backoff',
      'cache-flush-stampede',
      'server-crash-detection',
      'lossy-network',
    ];

    for (const id of expectedIds) {
      const preset = SCENARIO_PRESETS.find((p) => p.id === id);
      expect(preset).toBeDefined();
      expect(preset?.title.length).toBeGreaterThan(3);
      expect(preset?.educationalTakeaway.length).toBeGreaterThan(10);
      expect(preset?.traffic.durationMs).toBeGreaterThan(0);
    }
  });

  it('successfully initializes and executes every scenario preset', () => {
    const baseGraph = createStarterGraph();

    for (const preset of SCENARIO_PRESETS) {
      const configuredGraph = preset.configureGraph(baseGraph);
      expect(configuredGraph.nodes.length).toBeGreaterThanOrEqual(baseGraph.nodes.length);

      const sim = createSimulation({
        graph: configuredGraph,
        traffic: preset.traffic,
        seed: 42,
        scenarioScript: preset.scenarioScript,
      });

      // Advance through a portion of the scenario
      const simAdvanceTarget = Math.min(preset.traffic.durationMs, 5000);
      const snap = sim.advanceTo(simAdvanceTarget);

      expect(snap.counters.created).toBeGreaterThan(0);
      expect(snap.runtimeNodes).toBeDefined();
    }
  });
});
