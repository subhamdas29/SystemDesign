/**
 * Mergeable Weighted Latency Histogram.
 * Enables exact multi-tier time rollup without averaging percentiles.
 * Decoupled from React and external libraries.
 */

export const LATENCY_HISTOGRAM_BUCKETS: readonly number[] = [
  1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 100, 125, 150, 200,
  250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000,
] as const;

export function createEmptyHistogram(): number[] {
  return new Array(LATENCY_HISTOGRAM_BUCKETS.length).fill(0);
}

/**
 * Record one or more latency measurements into the bucketed histogram.
 */
export function recordLatencyInHistogram(
  histogram: number[],
  latencyMs: number,
  count = 1
): void {
  if (count <= 0) return;
  const safeLatency = Math.max(0, latencyMs);

  for (let i = 0; i < LATENCY_HISTOGRAM_BUCKETS.length; i++) {
    if (safeLatency <= LATENCY_HISTOGRAM_BUCKETS[i]!) {
      histogram[i] = (histogram[i] ?? 0) + count;
      return;
    }
  }

  // Value exceeds the highest bucket; put in overflow (last bucket)
  const lastIndex = LATENCY_HISTOGRAM_BUCKETS.length - 1;
  histogram[lastIndex] = (histogram[lastIndex] ?? 0) + count;
}

/**
 * Merges multiple histograms into one by summing respective bucket frequencies.
 * Mathematical guarantee: Merging frequency distributions across time buckets preserves
 * the exact underlying distribution, preventing the statistical error of "averaging percentiles".
 */
export function mergeHistograms(histograms: number[][]): number[] {
  const merged = createEmptyHistogram();
  for (const hist of histograms) {
    const len = Math.min(merged.length, hist.length);
    for (let i = 0; i < len; i++) {
      merged[i] = (merged[i] ?? 0) + (hist[i] ?? 0);
    }
  }
  return merged;
}

/**
 * Computes quantiles (P50, P95, P99) and average latency directly from the histogram.
 */
export function computePercentilesFromHistogram(histogram: number[]): {
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
} {
  let totalCount = 0;
  let weightedSum = 0;

  for (let i = 0; i < histogram.length; i++) {
    const count = histogram[i] ?? 0;
    const bucketVal = LATENCY_HISTOGRAM_BUCKETS[i] ?? 10000;
    totalCount += count;
    weightedSum += count * bucketVal;
  }

  if (totalCount === 0) {
    return { averageMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  }

  const averageMs = Math.round((weightedSum / totalCount) * 10) / 10;

  function findQuantile(q: number): number {
    const target = totalCount * q;
    let accumulated = 0;

    for (let i = 0; i < histogram.length; i++) {
      accumulated += histogram[i] ?? 0;
      if (accumulated >= target) {
        return LATENCY_HISTOGRAM_BUCKETS[i] ?? 10000;
      }
    }
    return LATENCY_HISTOGRAM_BUCKETS[histogram.length - 1] ?? 10000;
  }

  return {
    averageMs,
    p50Ms: findQuantile(0.5),
    p95Ms: findQuantile(0.95),
    p99Ms: findQuantile(0.99),
  };
}
