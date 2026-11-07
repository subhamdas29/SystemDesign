import { describe, it, expect } from 'vitest';
import { buildChartViewModel } from '../src/ui/dashboard/chartViewModel';
import { MetricsSample } from '../src/types/metrics';

describe('Chart View-Model Builder', () => {
  const mockSamples: MetricsSample[] = Array.from({ length: 90 }, (_, i) => ({
    timeMs: i * 1000,
    system: {
      timeMs: i * 1000,
      incomingRps: 1000 + i * 10,
      successfulRps: 900 + i * 8,
      failedRps: 0,
      rejectedRps: i > 40 ? 50 : 0,
      timedOutRps: i > 70 ? 20 : 0,
      avgLatencyMs: 20 + i * 0.5,
      p50Ms: 15,
      p95Ms: 45,
      p99Ms: 80 + i,
      inFlightRequests: 15,
      totalServerInstances: 2,
      healthyServerCount: 2,
    },
    nodes: {
      'app-1': {
        nodeId: 'app-1',
        type: 'app-server',
        incomingRps: 1000,
        processedRps: 900,
        rejectedRps: 0,
        utilization: 0.65,
        queueLength: 5,
        queueLimit: 100,
        estimatedCpuPercent: 50,
        estimatedMemoryMb: 512,
        status: 'healthy',
      },
    },
  }));

  it('builds synchronized chart data with accessible summary and top nodes', () => {
    const vm = buildChartViewModel(mockSamples, 'all', 45000, 5000);

    expect(vm.trafficSeries.length).toBeGreaterThan(0);
    expect(vm.latencySeries.length).toBeGreaterThan(0);
    expect(vm.utilizationSeries.length).toBeGreaterThan(0);
    expect(vm.topNodes).toContain('app-1');
    expect(vm.clientTimeoutMs).toBe(5000);
    expect(vm.accessibleSummary).toContain('Simulation metrics');
  });

  it('filters data within the 60s sliding window correctly', () => {
    const vm = buildChartViewModel(mockSamples, '60s', 89000, 5000);

    expect(vm.timeRange.minMs).toBeGreaterThanOrEqual(89000 - 60000);
    expect(vm.timeRange.maxMs).toBe(89000);
  });

  it('identifies notable timeline events (first rejection & timeout)', () => {
    const vm = buildChartViewModel(mockSamples, 'all', 89000, 5000);

    const hasRejection = vm.events.some((e) => e.type === 'first_rejection');
    const hasTimeout = vm.events.some((e) => e.type === 'first_timeout');

    expect(hasRejection).toBe(true);
    expect(hasTimeout).toBe(true);
  });
});
