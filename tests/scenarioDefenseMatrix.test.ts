import { describe, it, expect } from 'vitest';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';
import { createStarterGraph, addComponent } from '../src/builder/placement';
import { CdnConfig, WafConfig, DatabaseConfig } from '../src/types';
import { buildRunSummary } from '../src/engine/analysis/runSummary';

describe('Scenario Defense Matrix Verification (Phase 8B)', () => {
  it('volumetric flood: no defense vs recommended (CDN Anycast) vs irrelevant (WAF only)', () => {
    const starter = createStarterGraph();

    const traffic = {
      peakRps: 100,
      durationMs: 5000,
      pattern: 'constant' as const,
      patternParams: { type: 'constant' as const },
      mode: 'aggregate' as const,
    };

    const campaign = {
      id: 'vol-campaign',
      name: 'Volumetric Flood Test',
      description: 'Volumetric flood',
      phases: [
        {
          id: 'p1',
          scenarioId: 'volumetric-flood' as const,
          startMs: 0,
          durationMs: 5000,
          intensityRps: 15000,
          sourceCount: 10000,
        },
      ],
    };

    // 1. No Defense
    const simNoDef = createAggregateSimulation({
      graph: starter,
      traffic,
      campaign,
      seed: 42,
    });
    simNoDef.advanceTo(5000);
    const snapNoDef = simNoDef.getSnapshot();
    const summaryNoDef = buildRunSummary({
      graph: starter,
      traffic,
      seed: 42,
      samples: [],
      finalSnapshot: snapNoDef,
    }).summary;

    // 2. Recommended Defense: CDN with Advanced DDoS Protection
    let cdnGraph = addComponent(starter, 'cdn');
    cdnGraph = {
      ...cdnGraph,
      nodes: cdnGraph.nodes.map((n) => {
        if (n.type === 'cdn') {
          return {
            ...n,
            config: {
              ...(n.config as CdnConfig),
              ddosProtection: 'advanced',
              enabled: true,
            },
          };
        }
        return n;
      }),
    };

    const simRec = createAggregateSimulation({
      graph: cdnGraph,
      traffic,
      campaign,
      seed: 42,
    });
    simRec.advanceTo(5000);
    const snapRec = simRec.getSnapshot();
    const summaryRec = buildRunSummary({
      graph: cdnGraph,
      traffic,
      seed: 42,
      samples: [],
      finalSnapshot: snapRec,
      previousRunSummary: summaryNoDef,
    }).summary;

    // Recommended defense scrubs flood
    expect(snapRec.counters.blockedMalicious).toBeGreaterThan(0);
    const cdnReport = summaryRec.defenseReport?.defenses.find((d) => d.defenseKey === 'cdn');
    expect(cdnReport?.verdict).toBe('effective');
    expect(summaryRec.defenseReport?.previousRunDelta?.maliciousBlockedPercentDiff).toBeGreaterThan(0);

    // 3. Irrelevant Defense: WAF only without CDN
    const wafGraph = addComponent(starter, 'waf');
    const simIrr = createAggregateSimulation({
      graph: wafGraph,
      traffic,
      campaign,
      seed: 42,
    });
    simIrr.advanceTo(5000);
    const snapIrr = simIrr.getSnapshot();
    const summaryIrr = buildRunSummary({
      graph: wafGraph,
      traffic,
      seed: 42,
      samples: [],
      finalSnapshot: snapIrr,
    }).summary;

    const wafReport = summaryIrr.defenseReport?.defenses.find((d) => d.defenseKey === 'waf');
    // Volumetric flood bypasses L7 WAF
    expect(wafReport?.verdict).toBe('bypassed');
  });

  it('sql injection: no defense vs recommended (WAF + Parameterized Queries)', () => {
    const starter = createStarterGraph();
    const traffic = {
      peakRps: 50,
      durationMs: 4000,
      pattern: 'constant' as const,
      patternParams: { type: 'constant' as const },
      mode: 'aggregate' as const,
    };

    const campaign = {
      id: 'sqli-campaign',
      name: 'Injection Campaign',
      description: 'SQLi probes',
      phases: [
        {
          id: 'p1',
          scenarioId: 'injection-attempts' as const,
          startMs: 0,
          durationMs: 4000,
          intensityRps: 80,
          sourceCount: 20,
        },
      ],
    };

    // 1. No Defense
    const simNoDef = createAggregateSimulation({
      graph: starter,
      traffic,
      campaign,
      seed: 42,
    });
    simNoDef.advanceTo(4000);
    const snapNoDef = simNoDef.getSnapshot();
    expect(snapNoDef.counters.exposureEvents).toBeGreaterThan(0);

    // 2. Recommended Defense: WAF genericWebAttacks + Parameterized Queries
    let hardenedGraph = addComponent(starter, 'waf');
    hardenedGraph = {
      ...hardenedGraph,
      nodes: hardenedGraph.nodes.map((n) => {
        if (n.type === 'waf') {
          return {
            ...n,
            config: {
              ...(n.config as WafConfig),
              rulesets: { genericWebAttacks: true, botProtection: false, rateBasedRules: false },
              sensitivity: 80,
            },
          };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...(n.config as DatabaseConfig),
              hardening: {
                parameterizedQueries: true,
                leastPrivilegeDb: true,
                patchedSystem: true,
                networkSegmentation: false,
                autoQuarantine: false,
                quarantineDetectionLagMs: 3000,
                reimageDurationMs: 5000,
                egressFiltering: false,
              },
            },
          };
        }
        return n;
      }),
    };

    const simHardened = createAggregateSimulation({
      graph: hardenedGraph,
      traffic,
      campaign,
      seed: 42,
    });
    simHardened.advanceTo(4000);
    const snapHardened = simHardened.getSnapshot();

    // WAF blocks most attempts and parameterized queries protect DB
    expect(snapHardened.counters.blockedMalicious).toBeGreaterThan(0);
    expect(snapHardened.counters.exposureEvents).toBeLessThan(snapNoDef.counters.exposureEvents ?? 10);
  });
});
