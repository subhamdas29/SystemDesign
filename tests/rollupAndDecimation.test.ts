import { describe, it, expect } from 'vitest';
import { rollupMetrics, decimateSeries, getSampleAtTime } from '../src/engine/metrics/rollup';
import { MetricsSample } from '../src/types/metrics';

function makeMockSample(timeMs: number, rps: number, rejected = 0): MetricsSample {
  return {
    timeMs,
    system: {
      timeMs,
      incomingRps: rps,
      successfulRps: rps - rejected,
      failedRps: 0,
      rejectedRps: rejected,
      timedOutRps: 0,
      avgLatencyMs: 25,
      p50Ms: 20,
      p95Ms: 60,
      p99Ms: 90,
      inFlightRequests: 10,
      totalServerInstances: 2,
      healthyServerCount: 2,
    },
    nodes: {
      'app-1': {
        nodeId: 'app-1',
        type: 'app-server',
        incomingRps: rps,
        processedRps: rps - rejected,
        rejectedRps: rejected,
        utilization: rps / 1000,
        queueLength: rejected > 0 ? 50 : 0,
        queueLimit: 100,
        estimatedCpuPercent: 40,
        estimatedMemoryMb: 512,
        status: rejected > 0 ? 'overloaded' : 'healthy',
      },
    },
  };
}

describe('Metrics Rollup and Decimation', () => {
  it('rolls up 1s samples into 5s buckets while merging rates and peak utilization', () => {
    const rawSamples: MetricsSample[] = [
      makeMockSample(0, 100),
      makeMockSample(1000, 200),
      makeMockSample(2000, 300),
      makeMockSample(3000, 400),
      makeMockSample(4000, 500),
      makeMockSample(5000, 100),
    ];

    const rolled = rollupMetrics(rawSamples, 5000);
    expect(rolled.length).toBe(2);

    // First bucket (0 - 4999ms) average incoming RPS: (100+200+300+400+500)/5 = 300
    expect(rolled[0]!.system.incomingRps).toBe(300);
    // Peak utilization preserved
    expect(rolled[0]!.nodes['app-1']!.utilization).toBe(0.5);
  });

  it('preserves spikes and extreme values during min/max decimation', () => {
    const series: { timeMs: number; value: number }[] = [];
    for (let i = 0; i < 2000; i++) {
      series.push({ timeMs: i * 100, value: 50 }); // flat baseline
    }
    // Inject extreme peak spike in middle
    series[1000] = { timeMs: 100000, value: 99999 };
    // Inject extreme low drop
    series[1050] = { timeMs: 105000, value: 1 };

    const decimated = decimateSeries(series, 100, (p) => p.value);

    expect(decimated.length).toBeLessThanOrEqual(100);
    // Peak spike must NOT be lost
    expect(decimated.some((p) => p.value === 99999)).toBe(true);
    // Low drop must NOT be lost
    expect(decimated.some((p) => p.value === 1)).toBe(true);
  });

  it('time lookup returns the nearest sample cleanly via binary search', () => {
    const samples: MetricsSample[] = [
      makeMockSample(1000, 100),
      makeMockSample(2000, 200),
      makeMockSample(3000, 300),
      makeMockSample(5000, 500),
    ];

    expect(getSampleAtTime(samples, 1000)?.timeMs).toBe(1000);
    expect(getSampleAtTime(samples, 1900)?.timeMs).toBe(2000);
    expect(getSampleAtTime(samples, 4200)?.timeMs).toBe(5000);
    expect(getSampleAtTime(samples, 0)?.timeMs).toBe(1000);
    expect(getSampleAtTime(samples, 99999)?.timeMs).toBe(5000);
  });
});
