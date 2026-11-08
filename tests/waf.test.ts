import { describe, it, expect } from 'vitest';
import { evaluateWaf } from '../src/engine/components/wafModel';
import { WafConfig } from '../src/types/defenses';

describe('WAF Behavior Model (Phase 8B)', () => {
  const baseConfig: WafConfig = {
    enabled: true,
    sensitivity: 50,
    rulesets: {
      genericWebAttacks: true,
      botProtection: true,
      rateBasedRules: true,
    },
    failMode: 'open',
    capacityRps: 10000,
    processingLatencyMs: 5,
  };

  it('demonstrates sensitivity vs false positive trade-off', () => {
    // Low sensitivity (20): decent block rate, low false positive
    const lowCfg: WafConfig = { ...baseConfig, sensitivity: 20 };
    const lowMal = evaluateWaf(lowCfg, 'malicious', 'injection-attempts');
    const lowLegit = evaluateWaf(lowCfg, 'legitimate');
    expect(lowMal.blockedFraction).toBeGreaterThan(0.6);
    expect(lowLegit.blockedFraction).toBeLessThan(0.005);

    // High sensitivity (100): near-perfect attack block, but ~8% false positives
    const highCfg: WafConfig = { ...baseConfig, sensitivity: 100 };
    const highMal = evaluateWaf(highCfg, 'malicious', 'injection-attempts');
    const highLegit = evaluateWaf(highCfg, 'legitimate');
    expect(highMal.blockedFraction).toBe(0.99);
    expect(highLegit.blockedFraction).toBeGreaterThan(0.07);
  });

  it('honors ruleset selectivity: disabling ruleset allows attacks through', () => {
    const disabledSqliCfg: WafConfig = {
      ...baseConfig,
      rulesets: { genericWebAttacks: false, botProtection: true, rateBasedRules: true },
    };
    const res = evaluateWaf(disabledSqliCfg, 'malicious', 'injection-attempts');
    expect(res.action).toBe('pass');
    expect(res.blockedFraction).toBe(0);

    const botRes = evaluateWaf(disabledSqliCfg, 'malicious', 'credential-stuffing-distributed');
    expect(botRes.action).toBe('block');
    expect(botRes.reason).toBe('BOT_SIGNATURE');
  });

  it('fails open when overloaded: passes excess traffic uninspected', () => {
    const openCfg: WafConfig = { ...baseConfig, capacityRps: 2000, failMode: 'open' };
    // 4000 RPS inflow > 2000 RPS capacity -> passRatio = 0.5
    const res = evaluateWaf(openCfg, 'malicious', 'injection-attempts', 4000);
    const normalRes = evaluateWaf(openCfg, 'malicious', 'injection-attempts', 1000);
    expect(res.blockedFraction).toBeCloseTo(normalRes.blockedFraction * 0.5, 2);
  });

  it('fails closed when overloaded: drops traffic with OVERLOAD_FAIL_CLOSED', () => {
    const closedCfg: WafConfig = { ...baseConfig, capacityRps: 2000, failMode: 'closed' };
    const res = evaluateWaf(closedCfg, 'legitimate', undefined, 4000);
    expect(res.action).toBe('block');
    expect(res.reason).toBe('OVERLOAD_FAIL_CLOSED');
    expect(res.blockedFraction).toBe(1.0);
  });

  it('does not inspect network-layer volumetric floods (bypasses L7)', () => {
    const res = evaluateWaf(baseConfig, 'malicious', 'volumetric-flood');
    expect(res.action).toBe('pass');
    expect(res.blockedFraction).toBe(0);
  });
});
