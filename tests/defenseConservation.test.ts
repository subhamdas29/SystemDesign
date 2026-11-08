import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/engine/simulation';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';
import { createStarterGraph, addComponent } from '../src/builder/placement';
import { AttackCampaign } from '../src/types/attacks';

describe('Defense Conservation Invariants (Phase 8B)', () => {
  const sampleCampaign: AttackCampaign = {
    id: 'defense-conservation-campaign',
    name: 'Conservation Under Defense Load',
    description: 'Attack mix with active edge defense',
    phases: [
      {
        id: 'p1',
        scenarioId: 'volumetric-flood',
        startMs: 200,
        durationMs: 2000,
        intensityRps: 100,
        sourceCount: 50,
      },
      {
        id: 'p2',
        scenarioId: 'injection-attempts',
        startMs: 1200,
        durationMs: 1500,
        intensityRps: 40,
        sourceCount: 10,
      },
    ],
  };

  it('discrete mode: strict conservation holds with active WAF, Firewall, and Rate Limiter', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'firewall');
    graph = addComponent(graph, 'waf');
    graph = addComponent(graph, 'rate-limiter');

    const sim = createSimulation({
      graph,
      traffic: { rps: 50, durationMs: 4000 },
      campaign: sampleCampaign,
      seed: 42,
    });

    for (let t = 500; t <= 4000; t += 500) {
      sim.advanceTo(t);
      const snap = sim.getSnapshot();
      const { created, legitimate, malicious } = snap.counters;

      expect(legitimate).toBeDefined();
      expect(malicious).toBeDefined();

      if (legitimate && malicious) {
        // Overall conservation
        expect(created).toBe(legitimate.created + malicious.created);

        // Malicious breakdown
        const malAccounted =
          malicious.inFlight +
          malicious.reachedTarget +
          malicious.rejected +
          malicious.timedOut +
          malicious.dropped;
        expect(malicious.created).toBe(malAccounted);

        // Legitimate breakdown
        const legitAccounted =
          legitimate.inFlight +
          legitimate.succeeded +
          legitimate.rejected +
          legitimate.timedOut +
          legitimate.failed;
        expect(legitimate.created).toBe(legitAccounted);
      }
    }
  });

  it('aggregate mode: fluid conservation holds with perimeter defense active', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'cdn');
    graph = addComponent(graph, 'waf');

    const sim = createAggregateSimulation({
      graph,
      traffic: {
        peakRps: 500,
        durationMs: 5000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'aggregate',
      },
      campaign: sampleCampaign,
      seed: 42,
    });

    for (let t = 1000; t <= 5000; t += 1000) {
      sim.advanceTo(t);
      const snap = sim.getSnapshot();
      const { created, legitimate, malicious } = snap.counters;

      if (legitimate && malicious) {
        expect(created).toBe(legitimate.created + malicious.created);
        expect(malicious.created).toBeGreaterThanOrEqual(0);
        expect(legitimate.created).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
