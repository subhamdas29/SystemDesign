import { describe, it, expect } from 'vitest';
import { deriveLiveMetrics } from '../src/ui/inspector/liveViewModel';
import { GraphNode } from '../src/types';
import { SimulationSnapshot } from '../src/engine/protocol';

describe('Live Inspector View Model', () => {
  const mockSnapshot: SimulationSnapshot = {
    timeMs: 5000,
    runtimeNodes: {
      'app-1': {
        nodeId: 'app-1',
        status: 'healthy',
        currentRps: 600,
        utilization: 0.6,
        queueDepth: 0,
        activeConnections: 30,
        errorRate: 0,
        p99LatencyMs: 15,
      },
      'db-1': {
        nodeId: 'db-1',
        status: 'overloaded',
        currentRps: 500,
        utilization: 0.98,
        queueDepth: 45,
        activeConnections: 50,
        errorRate: 0.1,
        p99LatencyMs: 80,
      },
    },
    counters: { created: 3000, inFlight: 45, succeeded: 2900, failed: 0, rejected: 55, timedOut: 0 },
    latencySummary: { averageMs: 32, p50Ms: 25, p95Ms: 65, p99Ms: 80, minMs: 10, maxMs: 120 },
    recentEvents: [],
    eventCursor: 1,
    isDone: false,
  };

  it('derives live metrics for App Server with utilization and CPU estimation', () => {
    const node: GraphNode = {
      id: 'app-1',
      type: 'app-server',
      label: 'App Server',
      config: {
        maxThroughputRps: 1000,
        maxConcurrentRequests: 100,
        avgProcessingTimeMs: 10,
        cpuCores: 4,
        memoryMb: 4096,
        queueSize: 500,
        overloadBehavior: 'reject',
        health: 'healthy',
      },
    };

    const metrics = deriveLiveMetrics(node, mockSnapshot);
    expect(metrics.type).toBe('app-server');
    expect(metrics.status).toBe('healthy');
    expect(metrics.utilizationPercent).toBe(60);
    expect(metrics.appServer?.processedRps).toBe(600);
    expect(metrics.appServer?.activeRequests).toBe(30);
    expect(metrics.appServer?.estimatedCpuPercent).toBeGreaterThan(0);
    expect(metrics.appServer?.estimatedMemoryMb).toBeGreaterThan(1000);
  });

  it('derives live metrics for Database reporting pool and queue state', () => {
    const node: GraphNode = {
      id: 'db-1',
      type: 'database',
      label: 'Primary Database',
      config: {
        maxQueryThroughputQps: 500,
        queryLatencyMs: 15,
        connectionPoolSize: 50,
        queueCapacity: 100,
        readQueryLatencyMs: 10,
        writeQueryLatencyMs: 25,
      },
    };

    const metrics = deriveLiveMetrics(node, mockSnapshot);
    expect(metrics.type).toBe('database');
    expect(metrics.status).toBe('overloaded');
    expect(metrics.database?.poolSize).toBe(50);
    expect(metrics.database?.activeConnections).toBe(50);
    expect(metrics.database?.waitingQueries).toBe(45);
    expect(metrics.statusReason).toContain('Queue saturated');
  });
});
