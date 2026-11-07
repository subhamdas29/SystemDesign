import { describe, it, expect } from 'vitest';
import {
  createEmptyHistogram,
  recordLatencyInHistogram,
  mergeHistograms,
  computePercentilesFromHistogram,
} from '../src/engine/metrics/histogram';

describe('Latency Histogram and Percentile Rollup', () => {
  it('records latencies and computes accurate percentiles on synthetic distribution', () => {
    const hist = createEmptyHistogram();

    // 80 requests at 10ms, 15 requests at 50ms, 5 requests at 200ms
    recordLatencyInHistogram(hist, 10, 80);
    recordLatencyInHistogram(hist, 50, 15);
    recordLatencyInHistogram(hist, 200, 5);

    const stats = computePercentilesFromHistogram(hist);

    // Total = 100 requests
    // P50 should be in the 10ms bucket (cumulative 80 >= 50)
    expect(stats.p50Ms).toBe(10);
    // P95 should be in the 50ms bucket (cumulative 95 >= 95)
    expect(stats.p95Ms).toBe(50);
    // P99 should be in the 200ms bucket (cumulative 100 >= 99)
    expect(stats.p99Ms).toBe(200);
    expect(stats.averageMs).toBeGreaterThan(15);
    expect(stats.averageMs).toBeLessThan(40);
  });

  it('merges multiple histograms across time buckets without averaging percentiles', () => {
    const hist1 = createEmptyHistogram();
    recordLatencyInHistogram(hist1, 5, 100);

    const hist2 = createEmptyHistogram();
    recordLatencyInHistogram(hist2, 500, 100);

    // If one naively averaged P50(5) and P50(500), they would get 252.5ms.
    // The merged histogram has 100 at 5ms and 100 at 500ms -> P50 is 5ms, P95 is 500ms.
    const merged = mergeHistograms([hist1, hist2]);
    const mergedStats = computePercentilesFromHistogram(merged);

    expect(mergedStats.p50Ms).toBe(5);
    expect(mergedStats.p95Ms).toBe(500);
    expect(mergedStats.p99Ms).toBe(500);
  });
});
