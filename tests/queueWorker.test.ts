import { describe, it, expect } from 'vitest';
import { createStarterGraph, addComponent } from '../src/builder';
import { createSimulation } from '../src/engine/simulation';
import { createAggregateSimulation } from '../src/engine/aggregateSimulation';

describe('Phase 9: Message Queue and Worker Async Processing Suite', () => {
  function buildQueueWorkerGraph(overrides?: {
    asyncWriteShare?: number;
    enqueueLatencyMs?: number;
    queueLimit?: number;
    overflowStrategy?: 'reject' | 'drop-oldest' | 'dead-letter';
    workerInstances?: number;
    workerConcurrency?: number;
    workerProcessingMs?: number;
    dbWriteCapQps?: number;
  }) {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'message-queue');
    graph = addComponent(graph, 'worker');

    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'client') {
          return {
            ...n,
            config: {
              ...n.config,
              readRatio: 0, // 100% write traffic to test queue
            },
          };
        }
        if (n.type === 'app-server') {
          return {
            ...n,
            config: {
              ...n.config,
              asyncWriteShare: overrides?.asyncWriteShare ?? 100,
              enqueueLatencyMs: overrides?.enqueueLatencyMs ?? 4,
            },
          };
        }
        if (n.type === 'message-queue') {
          return {
            ...n,
            config: {
              ...n.config,
              maxQueueDepth: overrides?.queueLimit ?? 500,
              queueLimit: overrides?.queueLimit ?? 500,
              overflowBehavior: overrides?.overflowStrategy ?? 'reject',
              overflowStrategy: overrides?.overflowStrategy ?? 'reject',
            },
          };
        }
        if (n.type === 'worker') {
          return {
            ...n,
            config: {
              ...n.config,
              instances: overrides?.workerInstances ?? 2,
              concurrency: overrides?.workerConcurrency ?? 10,
              avgProcessingMs: overrides?.workerProcessingMs ?? 20,
              jobProcessingLatencyMs: overrides?.workerProcessingMs ?? 20,
            },
          };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              maxQueryThroughputQps: overrides?.dbWriteCapQps ?? 500,
            },
          };
        }
        return n;
      }),
    };

    return graph;
  }

  it('verifies queue conservation law: enqueued = processed + queueDepth + dropped + deadLettered', () => {
    const graph = buildQueueWorkerGraph({
      queueLimit: 100,
      overflowStrategy: 'reject',
      workerInstances: 1,
      workerConcurrency: 2,
      workerProcessingMs: 50,
    });

    const sim = createSimulation({
      graph,
      traffic: {
        peakRps: 60,
        durationMs: 5000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 42,
    });

    const snapshot = sim.advanceTo(4000);
    const enqueued = snapshot.counters.asyncJobsEnqueued ?? 0;
    const processed = snapshot.counters.asyncJobsProcessed ?? 0;
    const dropped = snapshot.counters.asyncJobsDropped ?? 0;
    const deadLettered = snapshot.counters.asyncJobsDeadLettered ?? 0;
    const inFlight = snapshot.counters.asyncJobsInFlight ?? 0;
    const depth = snapshot.counters.queueDepth ?? 0;

    expect(enqueued).toBeGreaterThan(0);
    expect(enqueued).toBe(processed + depth + inFlight + dropped + deadLettered);
  });

  it('absorbs sudden write spike without user-facing 503 rejections', () => {
    const graph = buildQueueWorkerGraph({
      asyncWriteShare: 100,
      enqueueLatencyMs: 3,
      queueLimit: 2000,
      workerInstances: 4,
      workerConcurrency: 10,
      workerProcessingMs: 25,
    });

    const sim = createSimulation({
      graph,
      traffic: {
        peakRps: 100,
        durationMs: 6000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 777,
    });

    const snap = sim.advanceTo(3000);

    // User-facing rejections should be 0 because queue absorbs writes
    expect(snap.counters.rejected).toBe(0);
    expect(snap.counters.succeeded).toBeGreaterThan(0);
    expect(snap.counters.asyncJobsEnqueued).toBeGreaterThan(0);
    // User latency reflects enqueue latency and network hops rather than full DB wait
    expect(snap.latencySummary.averageMs).toBeLessThan(75);
    expect(snap.latencySummary.averageMs).toBeGreaterThan(0);
  });

  it('shows unbounded lag when write arrival rate continuously exceeds worker drain capacity', () => {
    // Arrival: 150 RPS, Worker drain: 1 instance * 2 conc / 0.1s = 20 RPS
    const graph = buildQueueWorkerGraph({
      queueLimit: 10000,
      workerInstances: 1,
      workerConcurrency: 2,
      workerProcessingMs: 100,
    });

    const sim = createSimulation({
      graph,
      traffic: {
        peakRps: 150,
        durationMs: 10000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 123,
    });

    const snap1 = sim.advanceTo(2000);
    const snap2 = sim.advanceTo(5000);

    expect(snap2.counters.queueDepth ?? 0).toBeGreaterThan(snap1.counters.queueDepth ?? 0);
    expect(snap2.counters.consumerLagMs ?? 0).toBeGreaterThan(snap1.counters.consumerLagMs ?? 0);
  });

  it('differentiates reject (503 backpressure) vs drop-oldest (data loss) on queue overflow', () => {
    const smallQueueLimit = 20;

    // Reject setup
    const graphReject = buildQueueWorkerGraph({
      queueLimit: smallQueueLimit,
      overflowStrategy: 'reject',
      workerInstances: 1,
      workerConcurrency: 1,
      workerProcessingMs: 200,
    });

    const simReject = createSimulation({
      graph: graphReject,
      traffic: {
        peakRps: 80,
        durationMs: 4000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 999,
    });

    const snapReject = simReject.advanceTo(3000);
    expect(snapReject.counters.rejected).toBeGreaterThan(0);

    // Drop-oldest setup
    const graphDrop = buildQueueWorkerGraph({
      queueLimit: smallQueueLimit,
      overflowStrategy: 'drop-oldest',
      workerInstances: 1,
      workerConcurrency: 1,
      workerProcessingMs: 200,
    });

    const simDrop = createSimulation({
      graph: graphDrop,
      traffic: {
        peakRps: 80,
        durationMs: 4000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 999,
    });

    const snapDrop = simDrop.advanceTo(3000);
    // User gets 202 Accepted but dropped jobs count increases
    expect(snapDrop.counters.asyncJobsDropped ?? 0).toBeGreaterThan(0);
  });

  it('demonstrates aggregate mode fluid queue dynamics', () => {
    const graph = buildQueueWorkerGraph({
      queueLimit: 1000,
      workerInstances: 2,
      workerConcurrency: 5,
      workerProcessingMs: 100, // (2 * 5 * 1000) / 100 = 100 drain RPS
    });

    const aggSim = createAggregateSimulation({
      graph,
      traffic: {
        peakRps: 400, // 400 * 0.49 = ~196 write RPS > 100 drain RPS
        durationMs: 10000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 555,
    });

    const snap1 = aggSim.advanceTo(2000);
    const snap2 = aggSim.advanceTo(5000);

    expect(snap1.counters.queueDepth ?? 0).toBeGreaterThan(0);
    expect(snap2.counters.queueDepth ?? 0).toBeGreaterThan(snap1.counters.queueDepth ?? 0);
  });
});
