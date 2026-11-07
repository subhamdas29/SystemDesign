import { describe, it, expect } from 'vitest';
import { buildRequestTrace } from '../src/engine/trace/traceBuilder';
import { createStarterGraph } from '../src/builder/placement';
import { SimulationEvent } from '../src/types/runtime';

describe('Pure Request Trace Builder', () => {
  const graph = createStarterGraph();

  it('builds trace for successful request with zero queue wait', () => {
    const events: SimulationEvent[] = [
      { id: '1', timestamp: 10, type: 'REQUEST_CREATED', requestId: 'req-1', nodeId: 'client-1', details: { kind: 'read' } },
      { id: '2', timestamp: 11, type: 'REQUEST_RECEIVED', requestId: 'req-1', nodeId: 'app-server-1' },
      { id: '3', timestamp: 11, type: 'REQUEST_PROCESSING_STARTED', requestId: 'req-1', nodeId: 'app-server-1' },
      { id: '4', timestamp: 25, type: 'DATABASE_QUERY', requestId: 'req-1', nodeId: 'database-1' },
      { id: '5', timestamp: 45, type: 'RESPONSE_FORWARDED', requestId: 'req-1', nodeId: 'database-1', targetNodeId: 'app-server-1' },
      { id: '6', timestamp: 46, type: 'RESPONSE_FORWARDED', requestId: 'req-1', nodeId: 'app-server-1', targetNodeId: 'client-1' },
      { id: '7', timestamp: 47, type: 'RESPONSE_RECEIVED', requestId: 'req-1', nodeId: 'client-1', details: { statusCode: 200 } },
    ];

    const trace = buildRequestTrace('req-1', events, graph);
    expect(trace).not.toBeNull();
    expect(trace?.outcome).toBe('succeeded');
    expect(trace?.statusCode).toBe(200);
    expect(trace?.totalDurationMs).toBe(37); // 47 - 10
    expect(trace?.summaryLine).toContain('zero queue delay');
    expect(trace?.spans.length).toBeGreaterThan(0);
    expect(trace?.decisions.some((d) => d.type === 'pool')).toBe(true);
  });

  it('builds trace for cache hit scenario (no database query)', () => {
    const events: SimulationEvent[] = [
      { id: '1', timestamp: 100, type: 'REQUEST_CREATED', requestId: 'req-cache', nodeId: 'client-1', details: { kind: 'read' } },
      { id: '2', timestamp: 101, type: 'REQUEST_RECEIVED', requestId: 'req-cache', nodeId: 'app-server-1' },
      { id: '3', timestamp: 101, type: 'REQUEST_PROCESSING_STARTED', requestId: 'req-cache', nodeId: 'app-server-1' },
      { id: '4', timestamp: 110, type: 'CACHE_HIT', requestId: 'req-cache', nodeId: 'cache-1' },
      { id: '5', timestamp: 111, type: 'RESPONSE_FORWARDED', requestId: 'req-cache', nodeId: 'app-server-1', targetNodeId: 'client-1' },
      { id: '6', timestamp: 112, type: 'RESPONSE_RECEIVED', requestId: 'req-cache', nodeId: 'client-1', details: { statusCode: 200 } },
    ];

    const trace = buildRequestTrace('req-cache', events, graph);
    expect(trace).not.toBeNull();
    expect(trace?.outcome).toBe('succeeded');
    expect(trace?.decisions.some((d) => d.summary.includes('Cache HIT'))).toBe(true);
    expect(trace?.spans.some((s) => s.componentType === 'cache')).toBe(true);
  });

  it('builds trace for queued request that experiences queue wait span', () => {
    const events: SimulationEvent[] = [
      { id: '1', timestamp: 0, type: 'REQUEST_CREATED', requestId: 'req-queue', nodeId: 'client-1' },
      { id: '2', timestamp: 1, type: 'REQUEST_RECEIVED', requestId: 'req-queue', nodeId: 'app-server-1' },
      { id: '3', timestamp: 1, type: 'REQUEST_QUEUED', requestId: 'req-queue', nodeId: 'app-server-1', details: { queueDepth: 5 } },
      { id: '4', timestamp: 25, type: 'REQUEST_PROCESSING_STARTED', requestId: 'req-queue', nodeId: 'app-server-1' },
      { id: '5', timestamp: 35, type: 'RESPONSE_FORWARDED', requestId: 'req-queue', nodeId: 'app-server-1', targetNodeId: 'client-1' },
      { id: '6', timestamp: 36, type: 'RESPONSE_RECEIVED', requestId: 'req-queue', nodeId: 'client-1' },
    ];

    const trace = buildRequestTrace('req-queue', events, graph);
    expect(trace).not.toBeNull();
    expect(trace?.outcome).toBe('succeeded');
    const queueSpan = trace?.spans.find((s) => s.kind === 'queue');
    expect(queueSpan).toBeDefined();
    expect(queueSpan?.durationMs).toBe(24); // 25 - 1
    expect(trace?.summaryLine).toContain('24 ms spent waiting in queue');
  });

  it('builds trace for queue overflow rejection (503)', () => {
    const events: SimulationEvent[] = [
      { id: '1', timestamp: 50, type: 'REQUEST_CREATED', requestId: 'req-rej', nodeId: 'client-1' },
      { id: '2', timestamp: 51, type: 'REQUEST_RECEIVED', requestId: 'req-rej', nodeId: 'app-server-1' },
      { id: '3', timestamp: 51, type: 'REQUEST_REJECTED', requestId: 'req-rej', nodeId: 'app-server-1', details: { reason: 'QUEUE_OVERFLOW' } },
    ];

    const trace = buildRequestTrace('req-rej', events, graph);
    expect(trace).not.toBeNull();
    expect(trace?.outcome).toBe('rejected');
    expect(trace?.statusCode).toBe(503);
    expect(trace?.failureReason).toContain('queue buffer full');
    expect(trace?.summaryLine).toContain('Rejected after');
  });

  it('builds trace for client timeout (504)', () => {
    const events: SimulationEvent[] = [
      { id: '1', timestamp: 0, type: 'REQUEST_CREATED', requestId: 'req-timeout', nodeId: 'client-1' },
      { id: '2', timestamp: 1, type: 'REQUEST_RECEIVED', requestId: 'req-timeout', nodeId: 'app-server-1' },
      { id: '3', timestamp: 5001, type: 'REQUEST_TIMED_OUT', requestId: 'req-timeout', nodeId: 'app-server-1', details: { timeoutLimitMs: 5000 } },
    ];

    const trace = buildRequestTrace('req-timeout', events, graph);
    expect(trace).not.toBeNull();
    expect(trace?.outcome).toBe('timed-out');
    expect(trace?.statusCode).toBe(504);
    expect(trace?.failureReason).toContain('timeout');
  });

  it('builds trace for load-balancer routing decision', () => {
    const events: SimulationEvent[] = [
      { id: '1', timestamp: 10, type: 'REQUEST_CREATED', requestId: 'req-lb', nodeId: 'client-1' },
      { id: '2', timestamp: 11, type: 'REQUEST_RECEIVED', requestId: 'req-lb', nodeId: 'lb-1' },
      { id: '3', timestamp: 11, type: 'LOAD_BALANCED', requestId: 'req-lb', nodeId: 'lb-1', targetNodeId: 'app-server-2', details: { algorithm: 'least-connections' } },
      { id: '4', timestamp: 12, type: 'REQUEST_RECEIVED', requestId: 'req-lb', nodeId: 'app-server-2' },
      { id: '5', timestamp: 20, type: 'RESPONSE_FORWARDED', requestId: 'req-lb', nodeId: 'app-server-2', targetNodeId: 'client-1' },
      { id: '6', timestamp: 21, type: 'RESPONSE_RECEIVED', requestId: 'req-lb', nodeId: 'client-1' },
    ];

    const trace = buildRequestTrace('req-lb', events, graph);
    expect(trace).not.toBeNull();
    const lbDecision = trace?.decisions.find((d) => d.type === 'routing');
    expect(lbDecision).toBeDefined();
    expect(lbDecision?.summary).toContain('least-connections');
  });
});
