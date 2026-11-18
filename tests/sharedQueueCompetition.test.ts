import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/engine/simulation';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';
import { createStarterGraph } from '../src/builder/placement';
import { AppServerConfig } from '../src/types';
import { AttackCampaign } from '../src/types/attacks';

describe('Phase 8A: Shared Queue Competition (No Routing Hacks)', () => {
  it('discrete mode: malicious flood causes head-of-line blocking and rejections for legitimate requests', () => {
    // Create a constrained starter graph
    let graph = createStarterGraph();
    const serverNode = graph.nodes.find((n) => n.type === 'app-server')!;
    const constrainedConfig: Partial<AppServerConfig> = {
      maxThroughputRps: 50,
      maxConcurrentRequests: 4,
      avgProcessingTimeMs: 80,
      queueSize: 10,
    };
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.id === serverNode.id) return { ...n, config: { ...n.config, ...constrainedConfig } };
        if (n.type === 'cdn') return { ...n, config: { ...n.config, ddosProtection: 'none' } };
        return n;
      }),
    };

    // 1. Run baseline: 20 RPS legitimate traffic alone
    const simBaseline = createSimulation({
      graph,
      traffic: { rps: 20, durationMs: 3000 },
      seed: 42,
    });
    simBaseline.advanceTo(3500);
    const snapBaseline = simBaseline.getSnapshot();

    expect(snapBaseline.counters.rejected).toBe(0);
    expect(snapBaseline.counters.succeeded).toBe(snapBaseline.counters.created);

    // 2. Run with same 20 RPS legitimate traffic PLUS a 600 RPS volumetric flood
    const floodCampaign: AttackCampaign = {
      id: 'volumetric-test',
      name: 'Volumetric Competition Test',
      description: 'Shared queue flood',
      phases: [
        {
          id: 'p1',
          scenarioId: 'volumetric-flood',
          startMs: 0,
          durationMs: 3000,
          intensityRps: 600,
          sourceCount: 1000,
        },
      ],
    };

    const simFlood = createSimulation({
      graph,
      traffic: { rps: 20, durationMs: 3000 },
      campaign: floodCampaign,
      seed: 42,
    });
    simFlood.advanceTo(3500);
    const snapFlood = simFlood.getSnapshot();

    // Rejections must occur due to shared queue saturation
    expect(snapFlood.counters.rejected).toBeGreaterThan(0);
    expect(snapFlood.counters.malicious?.created).toBeGreaterThan(0);

    // Legitimate traffic is degraded by the competing traffic:
    // Legitimate requests are rejected and successful count is reduced
    const legitRejected = snapFlood.counters.legitimate?.rejected ?? 0;
    const legitSucceeded = snapFlood.counters.legitimate?.succeeded ?? 0;

    expect(legitRejected).toBeGreaterThan(0);
    expect(legitSucceeded).toBeLessThan(snapBaseline.counters.succeeded);
  });

  it('aggregate mode: shared queue competition proportionally drops both legitimate and malicious fluid', () => {
    const starter = createStarterGraph();
    const attackCampaign: AttackCampaign = {
      id: 'aggregate-comp',
      name: 'Aggregate Shared Queue Competition',
      description: 'Fluid competition',
      phases: [
        {
          id: 'p1',
          scenarioId: 'http-flood',
          startMs: 0,
          durationMs: 4000,
          intensityRps: 1500,
          sourceCount: 500,
        },
      ],
    };

    const sim = createAggregateSimulation({
      graph: starter,
      traffic: {
        peakRps: 500,
        durationMs: 4000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'aggregate',
      },
      campaign: attackCampaign,
      seed: 99,
    });

    const snap = sim.advanceTo(4000);
    const { legitimate, malicious } = snap.counters;

    expect(legitimate).toBeDefined();
    expect(malicious).toBeDefined();

    if (legitimate && malicious) {
      // Both legitimate and malicious flows must experience drops due to capacity limit
      expect(legitimate.rejected).toBeGreaterThan(0);
      expect(malicious.rejected).toBeGreaterThan(0);

      // Legitimate success rate must be less than 1.0 (degraded from 100%)
      const legitTotal = legitimate.created;
      const legitSucceeded = legitimate.succeeded;
      const legitSuccessRate = legitSucceeded / legitTotal;
      expect(legitSuccessRate).toBeLessThan(0.95);
    }
  });
});
