import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/engine/simulation';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';
import { createStarterGraph } from '../src/builder/placement';
import { AttackCampaign } from '../src/types/attacks';

describe('Phase 8A: Multi-Class Conservation Invariant', () => {
  const sampleCampaign: AttackCampaign = {
    id: 'test-campaign',
    name: 'Multi-Class Mixed Test Campaign',
    description: 'Mixed legitimate and malicious load',
    phases: [
      {
        id: 'p1',
        scenarioId: 'volumetric-flood',
        startMs: 500,
        durationMs: 2000,
        intensityRps: 60,
        sourceCount: 500,
      },
      {
        id: 'p2',
        scenarioId: 'cache-busting-scraper',
        startMs: 1500,
        durationMs: 1500,
        intensityRps: 40,
        sourceCount: 100,
      },
    ],
  };

  it('discrete mode: strict conservation holds for all counter categories at each advance step', () => {
    const starter = createStarterGraph();
    const sim = createSimulation({
      graph: starter,
      traffic: { rps: 40, durationMs: 4000 },
      campaign: sampleCampaign,
      seed: 42,
    });

    for (let t = 500; t <= 4000; t += 500) {
      sim.advanceTo(t);
      const snap = sim.getSnapshot();
      const { created, inFlight, succeeded, rejected, timedOut, legitimate, malicious } = snap.counters;

      expect(legitimate).toBeDefined();
      expect(malicious).toBeDefined();

      if (legitimate && malicious) {
        expect(created).toBe(legitimate.created + malicious.created);
        expect(inFlight).toBe(legitimate.inFlight + malicious.inFlight);
        expect(succeeded).toBe(legitimate.succeeded + malicious.reachedTarget);
        expect(rejected).toBe(legitimate.rejected + malicious.rejected);
        expect(timedOut).toBe(legitimate.timedOut + malicious.timedOut);
      }
    }
  });

  it('aggregate mode: fluid conservation holds across mixed campaign execution', () => {
    const starter = createStarterGraph();
    const sim = createAggregateSimulation({
      graph: starter,
      traffic: {
        peakRps: 500,
        durationMs: 5000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'aggregate',
      },
      campaign: sampleCampaign,
      seed: 101,
    });

    const snap = sim.advanceTo(4000);
    const { created, inFlight, succeeded, rejected, timedOut, legitimate, malicious } = snap.counters;

    expect(legitimate).toBeDefined();
    expect(malicious).toBeDefined();

    if (legitimate && malicious) {
      // Split counters sum to total counters (within float rounding <= 2)
      expect(Math.abs(created - (legitimate.created + malicious.created))).toBeLessThanOrEqual(2);
      expect(Math.abs(inFlight - (legitimate.inFlight + malicious.inFlight))).toBeLessThanOrEqual(2);
      expect(Math.abs(succeeded - (legitimate.succeeded + malicious.reachedTarget))).toBeLessThanOrEqual(2);
      expect(Math.abs(rejected - (legitimate.rejected + malicious.rejected))).toBeLessThanOrEqual(2);
      expect(Math.abs(timedOut - (legitimate.timedOut + malicious.timedOut))).toBeLessThanOrEqual(2);

      // Both classes were generated
      expect(legitimate.created).toBeGreaterThan(0);
      expect(malicious.created).toBeGreaterThan(0);
    }
  });
});
