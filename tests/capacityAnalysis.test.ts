import { describe, it, expect } from 'vitest';
import { analyzeCapacity } from '../src/engine/analysis/capacityAnalysis';
import { detectBottleneck } from '../src/engine/analysis/bottleneckDetector';
import { createStarterGraph, addComponent } from '../src/builder/placement';
import { SimulationSnapshot } from '../src/engine/protocol';

describe('Static Capacity Analysis & Bottleneck Detection', () => {
  it('correctly identifies Database as bottleneck in starter graph', () => {
    const starter = createStarterGraph();
    const analysis = analyzeCapacity(starter);

    expect(analysis.bottleneckType).toBe('database');
    expect(analysis.sustainableRps).toBeLessThanOrEqual(500); // 500 QPS default
    expect(analysis.suggestedFixes).toContain('cache');
    expect(analysis.explanation).toContain('Database');
  });

  it('shows significant capacity relief after adding Cache', () => {
    const starter = createStarterGraph();
    const withCache = addComponent(starter, 'cache');

    const baseAnalysis = analyzeCapacity(starter);
    const cacheAnalysis = analyzeCapacity(withCache);

    // Cache relieves the database so sustainable client RPS rises significantly
    expect(cacheAnalysis.sustainableRps).toBeGreaterThan(baseAnalysis.sustainableRps);
    expect(cacheAnalysis.componentBreakdown[withCache.nodes.find(n => n.type === 'database')!.id]!.loadShare).toBeLessThan(1.0);
  });

  it('detects runtime bottleneck with 3-tick hysteresis', () => {
    const mockSnap = (timeMs: number, util: number, queue: number, rejected: number): SimulationSnapshot => ({
      timeMs,
      runtimeNodes: {
        'db-1': {
          nodeId: 'db-1',
          status: util > 0.9 ? 'overloaded' : 'healthy',
          currentRps: 500,
          utilization: util,
          queueDepth: queue,
          activeConnections: 50,
          errorRate: 0,
          p99LatencyMs: 30,
        },
      },
      counters: {
        created: 1000,
        inFlight: queue,
        succeeded: 900,
        failed: 0,
        rejected,
        timedOut: 0,
      },
      latencySummary: { averageMs: 25, p50Ms: 20, p95Ms: 40, p99Ms: 50, minMs: 10, maxMs: 100 },
      recentEvents: [],
      eventCursor: 1,
      isDone: false,
    });

    const snap1 = mockSnap(100, 0.95, 10, 0);
    const snap2 = mockSnap(200, 0.96, 25, 5);
    const snap3 = mockSnap(300, 0.98, 50, 20);

    // Single tick: not enough history for 3-tick confirmation
    const bn1 = detectBottleneck(snap1, []);
    expect(bn1).toBeNull();

    // Two ticks: still not 3 ticks
    const bn2 = detectBottleneck(snap2, [snap1]);
    expect(bn2).toBeNull();

    // Three ticks: confirmed bottleneck!
    const bn3 = detectBottleneck(snap3, [snap1, snap2]);
    expect(bn3).not.toBeNull();
    expect(bn3?.nodeId).toBe('db-1');
    expect(bn3?.type).toBe('database');
    expect(bn3?.queueDepth).toBe(50);
  });
});
