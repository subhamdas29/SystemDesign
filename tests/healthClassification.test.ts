import { describe, it, expect } from 'vitest';
import { classifySystemHealth, classifyNodeStatus } from '../src/engine/analysis/health';
import { SystemMetricSample, NodeMetricSample } from '../src/types/metrics';
import { GraphConfig, DEFAULT_CONFIGS } from '../src/types';

describe('System Health and Node Status Classification', () => {
  const baseGraph: GraphConfig = {
    version: 1,
    nodes: [
      { id: 'client-1', type: 'client', config: { ...DEFAULT_CONFIGS.client, requestTimeoutMs: 5000 } },
      { id: 'app-1', type: 'app-server', config: { ...DEFAULT_CONFIGS['app-server'], health: 'healthy', queueSize: 100 } },
      { id: 'db-1', type: 'database', config: { ...DEFAULT_CONFIGS.database, queueCapacity: 100 } },
    ],
    edges: [
      { id: 'e1', source: 'client-1', target: 'app-1', kind: 'request' },
      { id: 'e2', source: 'app-1', target: 'db-1', kind: 'request' },
    ],
  };

  const baseSample: SystemMetricSample = {
    timeMs: 5000,
    incomingRps: 1000,
    successfulRps: 1000,
    failedRps: 0,
    rejectedRps: 0,
    timedOutRps: 0,
    avgLatencyMs: 30,
    p50Ms: 25,
    p95Ms: 60,
    p99Ms: 80,
    inFlightRequests: 20,
    totalServerInstances: 1,
    healthyServerCount: 1,
  };

  it('classifies normal operations as healthy', () => {
    const health = classifySystemHealth(baseSample, baseGraph);
    expect(health.status).toBe('healthy');
    expect(health.reason).toContain('normal');
  });

  it('classifies high error rate (>10%) as critical with plain-language reason', () => {
    const criticalSample: SystemMetricSample = {
      ...baseSample,
      successfulRps: 880,
      rejectedRps: 120, // 12% error rate
    };
    const health = classifySystemHealth(criticalSample, baseGraph, {
      nodeId: 'db-1',
      type: 'database',
      utilization: 1.0,
      queueDepth: 100,
      rejectionRate: 0.12,
      reason: 'Database connection pool exhausted',
    });

    expect(health.status).toBe('critical');
    expect(health.reason).toContain('Error rate is 12%');
    expect(health.reason).toContain('db-1 (database) queue is full');
  });

  it('classifies zero healthy app servers as critical', () => {
    const offlineSample: SystemMetricSample = {
      ...baseSample,
      totalServerInstances: 3,
      healthyServerCount: 0,
    };
    const health = classifySystemHealth(offlineSample, baseGraph);
    expect(health.status).toBe('critical');
    expect(health.reason).toContain('No healthy servers available');
  });

  it('classifies P99 latency near client timeout as degraded', () => {
    const slowSample: SystemMetricSample = {
      ...baseSample,
      p99Ms: 3200, // > 50% of 5000ms timeout
    };
    const health = classifySystemHealth(slowSample, baseGraph);
    expect(health.status).toBe('degraded');
    expect(health.reason).toContain('High P99 latency');
  });

  it('classifies node states consistently (healthy, warning, overloaded, failed)', () => {
    const baseNode: NodeMetricSample = {
      nodeId: 'app-1',
      type: 'app-server',
      incomingRps: 500,
      processedRps: 500,
      rejectedRps: 0,
      utilization: 0.5,
      queueLength: 10,
      queueLimit: 100,
      estimatedCpuPercent: 40,
      estimatedMemoryMb: 512,
      status: 'healthy',
    };

    expect(classifyNodeStatus(baseNode)).toBe('healthy');

    // Warning at 80% util
    expect(classifyNodeStatus({ ...baseNode, utilization: 0.82 })).toBe('warning');

    // Overloaded at 90% queue fill
    expect(classifyNodeStatus({ ...baseNode, queueLength: 92 })).toBe('overloaded');

    // Failed if explicitly marked down
    expect(classifyNodeStatus(baseNode, { health: 'down' })).toBe('failed');
  });
});
