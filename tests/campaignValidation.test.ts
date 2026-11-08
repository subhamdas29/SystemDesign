import { describe, it, expect } from 'vitest';
import {
  CampaignPhaseSchema,
  AttackCampaignSchema,
  validateCampaign,
} from '../src/types/attacks';
import {
  CAMPAIGN_PRESETS,
  createDefaultCampaign,
} from '../src/scenarios/attacks';
import { createSimulation } from '../src/engine/simulation';
import { createStarterGraph } from '../src/builder/placement';

describe('Phase 8A: Campaign Validation and Determinism', () => {
  it('all 5 preset campaigns pass strict Zod validation', () => {
    expect(CAMPAIGN_PRESETS.length).toBe(5);

    for (const preset of CAMPAIGN_PRESETS) {
      const parseResult = AttackCampaignSchema.safeParse(preset);
      expect(parseResult.success).toBe(true);
      expect(parseResult.data).toBeDefined();
      expect(parseResult.data?.phases.length).toBeGreaterThan(0);

      const contextVal = validateCampaign(preset, 30000);
      expect(contextVal.valid).toBe(true);
    }
  });

  it('default campaign passes strict Zod validation', () => {
    const defaultCamp = createDefaultCampaign();
    const parseResult = AttackCampaignSchema.safeParse(defaultCamp);
    expect(parseResult.success).toBe(true);

    const contextVal = validateCampaign(defaultCamp, 30000);
    expect(contextVal.valid).toBe(true);
  });

  it('rejects invalid phase schemas (negative duration, invalid scenario ID, negative RPS)', () => {
    // Negative duration
    const invalidDuration = CampaignPhaseSchema.safeParse({
      id: 'p-bad',
      scenarioId: 'volumetric-flood',
      startMs: 0,
      durationMs: -500,
      intensityRps: 100,
      sourceCount: 1,
    });
    expect(invalidDuration.success).toBe(false);

    // Negative intensity
    const invalidIntensity = CampaignPhaseSchema.safeParse({
      id: 'p-bad-2',
      scenarioId: 'volumetric-flood',
      startMs: 0,
      durationMs: 1000,
      intensityRps: -50,
      sourceCount: 1,
    });
    expect(invalidIntensity.success).toBe(false);

    // Unknown scenario
    const invalidScenario = CampaignPhaseSchema.safeParse({
      id: 'p-bad-3',
      scenarioId: 'unknown-exploit',
      startMs: 0,
      durationMs: 1000,
      intensityRps: 100,
      sourceCount: 1,
    });
    expect(invalidScenario.success).toBe(false);
  });

  it('seeking determinism: seeking to time T in a campaign run produces identical state', () => {
    const starter = createStarterGraph();
    const campaign = CAMPAIGN_PRESETS[0];

    // Sim A advances straight to 2500ms
    const simA = createSimulation({
      graph: starter,
      traffic: { rps: 30, durationMs: 4000 },
      campaign,
      seed: 42,
    });
    simA.advanceTo(2500);
    const snapA = simA.getSnapshot();

    // Sim B advances to 4000ms then resets and seeks to 2500ms
    const simB = createSimulation({
      graph: starter,
      traffic: { rps: 30, durationMs: 4000 },
      campaign,
      seed: 42,
    });
    simB.advanceTo(4000);
    simB.reset();
    simB.advanceTo(2500);
    const snapB = simB.getSnapshot();

    expect(snapA.counters.created).toBe(snapB.counters.created);
    expect(snapA.counters.succeeded).toBe(snapB.counters.succeeded);
    expect(snapA.counters.rejected).toBe(snapB.counters.rejected);
    expect(snapA.counters.malicious?.created).toBe(snapB.counters.malicious?.created);
  });
});
