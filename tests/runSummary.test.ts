import { describe, it, expect } from 'vitest';
import { buildRunSummary, computeConfigHash } from '../src/engine/analysis/runSummary';
import { GraphConfig, DEFAULT_CONFIGS } from '../src/types';
import { TrafficConfig, SimulationSnapshot } from '../src/engine/protocol';
import { MetricsSample } from '../src/types/metrics';

describe('Run Summary Builder and Determinism', () => {
  const graph: GraphConfig = {
    version: 1,
    nodes: [
      { id: 'client-1', type: 'client', config: { ...DEFAULT_CONFIGS.client, requestTimeoutMs: 5000 } },
      { id: 'app-1', type: 'app-server', config: { ...DEFAULT_CONFIGS['app-server'], maxThroughputRps: 1000, queueSize: 100 } },
      { id: 'db-1', type: 'database', config: { ...DEFAULT_CONFIGS.database, maxQueryThroughputQps: 500, queueCapacity: 100 } },
    ],
    edges: [
      { id: 'e1', source: 'client-1', target: 'app-1', kind: 'request' },
      { id: 'e2', source: 'app-1', target: 'db-1', kind: 'request' },
    ],
  };

  const traffic: TrafficConfig = {
    peakRps: 1000,
    durationMs: 10000,
    pattern: 'constant',
  };

  const mockSamples: MetricsSample[] = [
    {
      timeMs: 1000,
      system: {
        timeMs: 1000,
        incomingRps: 1000,
        successfulRps: 1000,
        failedRps: 0,
        rejectedRps: 0,
        timedOutRps: 0,
        avgLatencyMs: 15,
        p50Ms: 12,
        p95Ms: 25,
        p99Ms: 40,
        inFlightRequests: 20,
        totalServerInstances: 1,
        healthyServerCount: 1,
      },
      nodes: {
        'db-1': {
          nodeId: 'db-1',
          type: 'database',
          incomingRps: 1000,
          processedRps: 500,
          rejectedRps: 0,
          utilization: 0.8,
          queueLength: 20,
          queueLimit: 100,
          estimatedCpuPercent: 70,
          estimatedMemoryMb: 1024,
          status: 'healthy',
        },
      },
    },
    {
      timeMs: 2000,
      system: {
        timeMs: 2000,
        incomingRps: 1000,
        successfulRps: 800,
        failedRps: 0,
        rejectedRps: 200,
        timedOutRps: 0,
        avgLatencyMs: 45,
        p50Ms: 30,
        p95Ms: 90,
        p99Ms: 150,
        inFlightRequests: 50,
        totalServerInstances: 1,
        healthyServerCount: 1,
      },
      nodes: {
        'db-1': {
          nodeId: 'db-1',
          type: 'database',
          incomingRps: 1000,
          processedRps: 500,
          rejectedRps: 200,
          utilization: 1.0,
          queueLength: 100,
          queueLimit: 100,
          estimatedCpuPercent: 95,
          estimatedMemoryMb: 2048,
          status: 'overloaded',
        },
      },
    },
  ];

  const finalSnapshot: SimulationSnapshot = {
    timeMs: 10000,
    runtimeNodes: {},
    counters: {
      created: 10000,
      inFlight: 0,
      succeeded: 8000,
      failed: 0,
      rejected: 2000,
      timedOut: 0,
    },
    latencySummary: { averageMs: 40, p50Ms: 30, p95Ms: 90, p99Ms: 150, minMs: 5, maxMs: 250 },
    recentEvents: [],
    eventCursor: 100,
    isDone: true,
    bottleneck: {
      nodeId: 'db-1',
      type: 'database',
      utilization: 1.0,
      queueDepth: 100,
      rejectionRate: 0.2,
      reason: 'Database pool exhausted',
    },
  };

  it('builds comprehensive RunSummary identifying first saturated component', () => {
    const runResult = buildRunSummary({
      graph,
      traffic,
      seed: 42,
      samples: mockSamples,
      finalSnapshot,
    });

    expect(runResult.summary.totalRequests).toBe(10000);
    expect(runResult.summary.successRatePercent).toBe(80);
    expect(runResult.summary.firstSaturatedComponent?.nodeId).toBe('db-1');
    expect(runResult.summary.firstSaturatedComponent?.timeMs).toBe(2000);
    expect(runResult.summary.identifiedBottleneck).toContain('db-1');
    expect(runResult.summary.suggestedFixes.length).toBeGreaterThan(0);
  });

  it('generates deterministic config hashes for identical runs', () => {
    const hash1 = computeConfigHash(graph, traffic, 42);
    const hash2 = computeConfigHash(graph, traffic, 42);
    const hash3 = computeConfigHash(graph, traffic, 99);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
});
