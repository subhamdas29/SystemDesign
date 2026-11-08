import { describe, it, expect } from 'vitest';
import { createStarterGraph } from '../src/builder';
import { createSimulation } from '../src/engine/simulation';
import { PHASE_9_PRESETS } from '../src/scenarios/examples/presets';
import { getEffectiveRoutes } from '../src/types/routes';

describe('Phase 9: Regression and Backward Compatibility Suite', () => {
  it('preserves exact backward compatibility between readRatio and workload routes', () => {
    // 80% read ratio should produce 2 routes: 80% read, 20% write
    const routesDefault = getEffectiveRoutes({ readRatio: 80 });
    expect(routesDefault.length).toBe(2);
    expect(routesDefault[0]!.kind).toBe('read');
    expect(routesDefault[0]!.share).toBe(80);
    expect(routesDefault[1]!.kind).toBe('write');
    expect(routesDefault[1]!.share).toBe(20);

    // Custom routes override readRatio
    const custom = [
      { id: 'custom-1', label: 'Auth', share: 50, kind: 'auth' as const, costMultiplier: 1.0, cacheable: false },
      { id: 'custom-2', label: 'Static', share: 50, kind: 'static' as const, costMultiplier: 0.5, cacheable: true },
    ];
    const routesCustom = getEffectiveRoutes({ routes: custom, readRatio: 80 });
    expect(routesCustom).toEqual(custom);
  });

  it('produces deterministic snapshots across multiple runs on starter architecture', () => {
    const starterGraph = createStarterGraph();
    const trafficConfig = {
      peakRps: 100,
      durationMs: 4000,
      pattern: 'constant' as const,
      patternParams: { type: 'constant' as const },
    };

    const sim1 = createSimulation({ graph: starterGraph, traffic: trafficConfig, seed: 12345 });
    const snap1 = sim1.advanceTo(3000);

    const sim2 = createSimulation({ graph: starterGraph, traffic: trafficConfig, seed: 12345 });
    const snap2 = sim2.advanceTo(3000);

    expect(snap1.counters.created).toBe(snap2.counters.created);
    expect(snap1.counters.succeeded).toBe(snap2.counters.succeeded);
    expect(snap1.counters.rejected).toBe(snap2.counters.rejected);
    expect(snap1.counters.failed).toBe(snap2.counters.failed);
    expect(snap1.latencySummary.averageMs).toBe(snap2.latencySummary.averageMs);
  });

  it('successfully initializes and runs all 7 Phase 9 presets without throwing', () => {
    expect(PHASE_9_PRESETS.length).toBe(7);

    for (const preset of PHASE_9_PRESETS) {
      expect(preset.title).toBeDefined();
      expect(preset.description.length).toBeGreaterThan(15);
      expect(preset.educationalTakeaway.length).toBeGreaterThan(10);

      const graph = preset.configureGraph(createStarterGraph());
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);

      const sim = createSimulation({
        graph,
        traffic: preset.traffic,
        seed: 42,
        scenarioScript: preset.scenarioScript,
      });

      const snap = sim.advanceTo(2000);
      expect(snap.counters.created).toBeGreaterThan(0);
      expect(snap.runtimeNodes).toBeDefined();
    }
  });
});
