import { describe, it, expect } from 'vitest';
import { evaluateCdn } from '../src/engine/components/cdnModel';
import { CdnConfig } from '../src/types/defenses';

describe('CDN & Edge Protection Model (Phase 8B)', () => {
  const baseConfig: CdnConfig = {
    enabled: true,
    staticContentShare: 60,
    edgeHitRatio: 85,
    edgeCapacityRps: 100000,
    ddosProtection: 'standard',
    ttlSeconds: 300,
    processingLatencyMs: 10,
  };

  it('offloads legitimate static traffic according to staticContentShare and hitRatio', () => {
    const res = evaluateCdn(baseConfig, 'legitimate');
    // 60% * 85% = 51% offloaded at edge
    expect(res.reason).toBe('EDGE_CACHE_HIT');
    expect(res.edgeHandledFraction).toBeCloseTo(0.51, 2);
    expect(res.forwardToOriginFraction).toBeCloseTo(0.49, 2);
  });

  it('scrubs volumetric floods within standard scrubbing capacity (20,000 RPS)', () => {
    // 10,000 RPS flood < 20,000 RPS standard capacity -> 100% scrubbed
    const res = evaluateCdn(baseConfig, 'malicious', 'volumetric-flood', false, 10000);
    expect(res.action).toBe('block');
    expect(res.reason).toBe('EDGE_DDOS_SCRUBBED');
    expect(res.edgeHandledFraction).toBe(1.0);
    expect(res.forwardToOriginFraction).toBe(0);
  });

  it('partially scrubs volumetric floods exceeding standard capacity', () => {
    // 40,000 RPS flood with 20,000 RPS capacity -> 50% scrubbed, 50% leaks to origin
    const res = evaluateCdn(baseConfig, 'malicious', 'volumetric-flood', false, 40000);
    expect(res.action).toBe('pass');
    expect(res.edgeHandledFraction).toBeCloseTo(0.5, 2);
    expect(res.forwardToOriginFraction).toBeCloseTo(0.5, 2);
  });

  it('advanced DDoS protection absorbs large floods up to 200,000 RPS', () => {
    const advConfig: CdnConfig = { ...baseConfig, ddosProtection: 'advanced' };
    const res = evaluateCdn(advConfig, 'malicious', 'volumetric-flood', false, 50000);
    expect(res.action).toBe('block');
    expect(res.edgeHandledFraction).toBe(1.0);
    expect(res.forwardToOriginFraction).toBe(0);
  });

  it('cache-busting scraper completely bypasses edge cache to origin', () => {
    const res = evaluateCdn(baseConfig, 'malicious', 'cache-busting-scraper', false, 500);
    expect(res.reason).toBe('CACHE_BYPASS_ORIGIN');
    expect(res.edgeHandledFraction).toBe(0);
    expect(res.forwardToOriginFraction).toBe(1.0);
  });

  it('passes all traffic directly to origin when disabled', () => {
    const disabledConfig: CdnConfig = { ...baseConfig, enabled: false };
    const res = evaluateCdn(disabledConfig, 'legitimate');
    expect(res.edgeHandledFraction).toBe(0);
    expect(res.forwardToOriginFraction).toBe(1.0);
    expect(res.addedLatencyMs).toBe(0);
  });
});
