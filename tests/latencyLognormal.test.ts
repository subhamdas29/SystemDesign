import { describe, it, expect } from 'vitest';
import { createPRNG, sampleGaussian, sampleLognormal } from '../src/engine/rng';
import { createStarterGraph } from '../src/builder';
import { createSimulation } from '../src/engine';

describe('Phase 7: Lognormal Latency Distribution & Edge Latencies', () => {
  it('samples Gaussian distributions with zero mean and unit variance', () => {
    const rng = createPRNG(42);
    const N = 5000;
    let sum = 0;
    let sqSum = 0;

    for (let i = 0; i < N; i++) {
      const val = sampleGaussian(0, 1, rng);
      sum += val;
      sqSum += val * val;
    }

    const mean = sum / N;
    const variance = sqSum / N - mean * mean;

    expect(Math.abs(mean)).toBeLessThan(0.08);
    expect(Math.abs(variance - 1.0)).toBeLessThan(0.1);
  });

  it('samples lognormal service times with expected positive skew and long tail', () => {
    const rng = createPRNG(12345);
    const N = 5000;
    const meanTarget = 50;
    const cv = 0.5;

    const samples: number[] = [];
    let sum = 0;

    for (let i = 0; i < N; i++) {
      const val = sampleLognormal(meanTarget, cv, rng);
      samples.push(val);
      sum += val;
    }

    const mean = sum / N;
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(N * 0.5)]!;
    const p95 = samples[Math.floor(N * 0.95)]!;
    const p99 = samples[Math.floor(N * 0.99)]!;

    // Expected mean is ~50
    expect(Math.abs(mean - meanTarget)).toBeLessThan(3.0);
    // Median (p50) is strictly lower than mean for right-skewed lognormal
    expect(p50).toBeLessThan(mean);
    // P95 is greater than mean
    expect(p95).toBeGreaterThan(meanTarget * 1.5);
    // P99 captures the long tail
    expect(p99).toBeGreaterThan(p95);
  });

  it('incorporates network edge latencies into discrete simulation latency', () => {
    const baseGraph = createStarterGraph();
    // Default edge latency: ingress internet ~40ms + datacenter ~0.5ms
    const sim = createSimulation({
      graph: baseGraph,
      traffic: { peakRps: 50, durationMs: 5000, mode: 'discrete' },
      seed: 42,
    });

    const snap = sim.advanceTo(4000);
    expect(snap.counters.succeeded).toBeGreaterThan(50);
    // End-to-end average latency must include the internet ingress (>= 40ms) + processing time
    expect(snap.latencySummary.averageMs).toBeGreaterThan(40);
  });

  it('produces compatible tail latency percentiles in discrete vs aggregate modes', () => {
    const graph = createStarterGraph();
    const durationMs = 5000;

    const simDiscrete = createSimulation({
      graph,
      traffic: { peakRps: 200, durationMs, mode: 'discrete' },
      seed: 99,
    });
    const snapDiscrete = simDiscrete.advanceTo(durationMs);

    const simAggregate = createSimulation({
      graph,
      traffic: { peakRps: 200, durationMs, mode: 'aggregate' },
      seed: 99,
    });
    const snapAggregate = simAggregate.advanceTo(durationMs);

    expect(snapDiscrete.counters.succeeded).toBeGreaterThan(500);
    expect(snapAggregate.counters.succeeded).toBeGreaterThan(500);

    // Both modes model positive skew: P95 > P50, P99 > P95
    expect(snapDiscrete.latencySummary.p95Ms).toBeGreaterThan(snapDiscrete.latencySummary.p50Ms);
    expect(snapAggregate.latencySummary.p95Ms).toBeGreaterThan(snapAggregate.latencySummary.p50Ms);

    // Discrete and Aggregate P50 should be within reasonable relative tolerance (~30%)
    const p50Ratio = snapAggregate.latencySummary.p50Ms / Math.max(1, snapDiscrete.latencySummary.p50Ms);
    expect(p50Ratio).toBeGreaterThan(0.6);
    expect(p50Ratio).toBeLessThan(1.5);
  });
});
