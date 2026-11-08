import { describe, it, expect } from 'vitest';
import { evaluateFirewall } from '../src/engine/components/firewallModel';
import { FirewallConfig } from '../src/types/defenses';

describe('Firewall Model (Phase 8B)', () => {
  const baseConfig: FirewallConfig = {
    enabled: true,
    maxBlocklistCoverage: 10000,
    detectionLagMs: 2000,
    learnRatePerSec: 100,
    capacityRps: 100000,
    processingLatencyMs: 2,
    falsePositiveRate: 0.005, // 0.5%
  };

  it('respects detection lag: zero malicious blocks before lag expires', () => {
    // Before lag: 1000ms < 2000ms
    const res = evaluateFirewall(baseConfig, 'malicious', 1000, 50);
    expect(res.action).toBe('pass');
    expect(res.blockedFraction).toBe(0);
    expect(res.reason).toBeUndefined();
  });

  it('learns malicious sources after detection lag elapses', () => {
    // 3000ms elapsed -> 1000ms past lag -> 100 IPs learned out of 500 total
    const res = evaluateFirewall(baseConfig, 'malicious', 3000, 500);
    expect(res.action).toBe('block');
    expect(res.blockedFraction).toBeCloseTo(100 / 500, 2);
  });

  it('blocks few-source attacks with near 100% efficacy', () => {
    // 5 attacker IPs: after 2000ms + 1000ms = 3000ms, all 5 IPs are learned
    const res = evaluateFirewall(baseConfig, 'malicious', 3000, 5);
    expect(res.action).toBe('block');
    expect(res.blockedFraction).toBe(1.0);
  });

  it('is bypassed by distributed botnets exceeding blocklist capacity', () => {
    // 100,000 botnet IPs with 10,000 blocklist cap -> max 10% blocked
    const res = evaluateFirewall(baseConfig, 'malicious', 200000, 100000);
    expect(res.action).toBe('block');
    expect(res.blockedFraction).toBeLessThanOrEqual(0.10);
  });

  it('applies configured false positive rate to legitimate traffic', () => {
    const res = evaluateFirewall(baseConfig, 'legitimate', 0, 1);
    expect(res.blockedFraction).toBe(0.005);
    expect(res.action).toBe('block');
  });

  it('passes all traffic when disabled', () => {
    const disabledCfg: FirewallConfig = { ...baseConfig, enabled: false };
    const res = evaluateFirewall(disabledCfg, 'malicious', 10000, 5);
    expect(res.action).toBe('pass');
    expect(res.blockedFraction).toBe(0);
  });
});
