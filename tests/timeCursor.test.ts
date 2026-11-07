import { describe, it, expect, beforeEach } from 'vitest';
import { useMetricsStore } from '../src/store/metricsStore';
import { MetricsSample } from '../src/types/metrics';

describe('Time-Cursor and Bounded Multi-Tier Memory Store', () => {
  beforeEach(() => {
    useMetricsStore.getState().clearMetrics();
  });

  it('historical view returns the exact sample at time, and back-to-live restores live sample', () => {
    const store = useMetricsStore.getState();

    const sample1: MetricsSample = {
      timeMs: 1000,
      system: {
        timeMs: 1000,
        incomingRps: 100,
        successfulRps: 100,
        failedRps: 0,
        rejectedRps: 0,
        timedOutRps: 0,
        avgLatencyMs: 10,
        p50Ms: 10,
        p95Ms: 15,
        p99Ms: 20,
        inFlightRequests: 5,
        totalServerInstances: 1,
        healthyServerCount: 1,
      },
      nodes: {},
    };

    const sample2: MetricsSample = {
      timeMs: 2000,
      system: {
        timeMs: 2000,
        incomingRps: 500,
        successfulRps: 450,
        failedRps: 0,
        rejectedRps: 50,
        timedOutRps: 0,
        avgLatencyMs: 35,
        p50Ms: 25,
        p95Ms: 60,
        p99Ms: 90,
        inFlightRequests: 25,
        totalServerInstances: 1,
        healthyServerCount: 1,
      },
      nodes: {},
    };

    store.ingestSample(sample1);
    store.ingestSample(sample2);

    // Live active sample should be sample2
    expect(useMetricsStore.getState().getActiveSample()?.system.incomingRps).toBe(500);

    // Set time-travel to t=1000ms
    useMetricsStore.getState().setTimeTravelTime(1000);
    expect(useMetricsStore.getState().getActiveSample()?.system.incomingRps).toBe(100);

    // Restore to live
    useMetricsStore.getState().setTimeTravelTime(null);
    expect(useMetricsStore.getState().getActiveSample()?.system.incomingRps).toBe(500);
  });

  it('keeps memory strictly bounded over a simulated 10-minute run at 1,000,000 RPS', () => {
    const store = useMetricsStore.getState();

    // Ingest 600 seconds (10 minutes) of 1-second samples starting from t=0
    for (let s = 0; s < 600; s++) {
      const timeMs = s * 1000;
      store.ingestSample({
        timeMs,
        system: {
          timeMs,
          incomingRps: 1000000,
          successfulRps: 980000,
          failedRps: 0,
          rejectedRps: 20000,
          timedOutRps: 0,
          avgLatencyMs: 22,
          p50Ms: 18,
          p95Ms: 45,
          p99Ms: 65,
          inFlightRequests: 5000,
          totalServerInstances: 10,
          healthyServerCount: 10,
        },
        nodes: {},
      });
    }

    const totalSamples = useMetricsStore.getState().samples.length;

    // Must be bounded: 5 minutes full resolution (300) + 5 minutes rolled into 5s buckets (60) = ~360 samples
    expect(totalSamples).toBeLessThanOrEqual(400);
    expect(totalSamples).toBeGreaterThanOrEqual(300);
  });
});
