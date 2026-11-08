import { describe, it, expect } from 'vitest';
import { evaluateRateLimiter } from '../src/engine/components/rateLimiterModel';
import { RateLimiterConfig } from '../src/types/defenses';

describe('Rate Limiter Behavior Model (Phase 8B)', () => {
  const basePerSourceConfig: RateLimiterConfig = {
    enabled: true,
    limitRps: 20,
    scope: 'per-source',
    burst: 20,
    algorithm: 'token-bucket',
    onExceed: 'reject-429',
    capacityRps: 50000,
    processingLatencyMs: 1,
  };

  it('per-source: blocks high-rate single/few source attackers', () => {
    // 2 sources generating 250 RPS = 125 RPS each (limit: 20)
    const res = evaluateRateLimiter(basePerSourceConfig, 250, 2);
    expect(res.action).toBe('block');
    expect(res.reason).toBe('RATE_LIMITED');
    expect(res.blockedFraction).toBeCloseTo((125 - 20) / 125, 2);
  });

  it('per-source: bypassed by distributed botnet where each source stays below limit', () => {
    // 500 sources generating 500 RPS = 1 RPS each (well below limit 20)
    const res = evaluateRateLimiter(basePerSourceConfig, 500, 500);
    expect(res.action).toBe('pass');
    expect(res.blockedFraction).toBe(0);
  });

  it('global scope: throttles volumetric surges but degrades legitimate traffic', () => {
    const globalConfig: RateLimiterConfig = {
      ...basePerSourceConfig,
      scope: 'global',
      limitRps: 200,
      burst: 200,
    };

    // 1000 RPS total arrival > 200 RPS limit
    const res = evaluateRateLimiter(globalConfig, 500, 100, 1000);
    expect(res.action).toBe('block');
    expect(res.reason).toBe('GLOBAL_RATE_LIMITED');
    expect(res.blockedFraction).toBeCloseTo((1000 - 200) / 1000, 2);
  });

  it('delays requests when onExceed is set to delay', () => {
    const delayConfig: RateLimiterConfig = {
      ...basePerSourceConfig,
      onExceed: 'delay',
    };

    // 1 source doing 100 RPS > 20 RPS limit
    const res = evaluateRateLimiter(delayConfig, 100, 1);
    expect(res.action).toBe('delay');
    expect(res.reason).toBe('RATE_LIMITED_DELAYED');
    expect(res.blockedFraction).toBe(0);
    expect(res.addedLatencyMs).toBeGreaterThan(1);
  });

  it('passes all traffic with zero delay when disabled', () => {
    const disabledConfig: RateLimiterConfig = {
      ...basePerSourceConfig,
      enabled: false,
    };

    const res = evaluateRateLimiter(disabledConfig, 1000, 1);
    expect(res.action).toBe('pass');
    expect(res.blockedFraction).toBe(0);
  });
});
