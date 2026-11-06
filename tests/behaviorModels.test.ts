import { describe, it, expect } from 'vitest';
import { createPRNG } from '../src/engine/rng';
import { selectBackend } from '../src/engine/components/loadBalancerModel';
import { decideHit } from '../src/engine/components/cacheModel';
import { appServerModel } from '../src/engine/components/appServerModel';
import { acquireConnection, releaseConnection } from '../src/engine/components/databaseModel';
import { AppServerConfig, CacheConfig } from '../src/types';

describe('Pure Component Behavior Models', () => {
  describe('Deterministic PRNG', () => {
    it('produces identical pseudo-random sequence for identical seed', () => {
      const rng1 = createPRNG(42);
      const rng2 = createPRNG(42);

      const seq1 = Array.from({ length: 20 }, () => rng1.next());
      const seq2 = Array.from({ length: 20 }, () => rng2.next());

      expect(seq1).toEqual(seq2);
    });

    it('produces different sequences for different seeds', () => {
      const rng1 = createPRNG(42);
      const rng2 = createPRNG(99);

      expect(rng1.next()).not.toEqual(rng2.next());
    });
  });

  describe('Load Balancer Routing Algorithms', () => {
    const backends = ['server-1', 'server-2', 'server-3'];

    it('round-robin cycles backends evenly in order', () => {
      const rng = createPRNG(1);
      const backendStates = {
        'server-1': { id: 'server-1', health: 'healthy' as const },
        'server-2': { id: 'server-2', health: 'healthy' as const },
        'server-3': { id: 'server-3', health: 'healthy' as const },
      };

      const picks = [0, 1, 2, 3, 4, 5].map((counter) =>
        selectBackend('round-robin', backends, backendStates, rng, counter)
      );

      expect(picks).toEqual([
        'server-1',
        'server-2',
        'server-3',
        'server-1',
        'server-2',
        'server-3',
      ]);
    });

    it('skips unhealthy (down) backends and returns null if all are down', () => {
      const rng = createPRNG(1);
      const backendStates = {
        'server-1': { id: 'server-1', health: 'down' as const },
        'server-2': { id: 'server-2', health: 'healthy' as const },
        'server-3': { id: 'server-3', health: 'down' as const },
      };

      // Only server-2 is healthy
      const pick = selectBackend('round-robin', backends, backendStates, rng, 0);
      expect(pick).toBe('server-2');

      // All down
      const allDownStates = {
        'server-1': { id: 'server-1', health: 'down' as const },
        'server-2': { id: 'server-2', health: 'down' as const },
        'server-3': { id: 'server-3', health: 'down' as const },
      };
      const nullPick = selectBackend('round-robin', backends, allDownStates, rng, 0);
      expect(nullPick).toBeNull();
    });

    it('least-connections picks the backend with lowest active connections', () => {
      const rng = createPRNG(1);
      const backendStates = {
        'server-1': { id: 'server-1', health: 'healthy' as const, activeConnections: 45 },
        'server-2': { id: 'server-2', health: 'healthy' as const, activeConnections: 12 },
        'server-3': { id: 'server-3', health: 'healthy' as const, activeConnections: 80 },
      };

      const chosen = selectBackend('least-connections', backends, backendStates, rng, 0);
      expect(chosen).toBe('server-2');
    });

    it('weighted-round-robin distributes in proportion to assigned weights', () => {
      const rng = createPRNG(1);
      const backendStates = {
        'server-1': { id: 'server-1', health: 'healthy' as const },
        'server-2': { id: 'server-2', health: 'healthy' as const },
      };
      // 3:1 ratio (75% server-1, 25% server-2)
      const weights = { 'server-1': 30, 'server-2': 10 };

      const counts: Record<string, number> = { 'server-1': 0, 'server-2': 0 };
      const N = 400;
      for (let i = 0; i < N; i++) {
        const pick = selectBackend(
          'weighted-round-robin',
          ['server-1', 'server-2'],
          backendStates,
          rng,
          i,
          weights
        );
        if (pick) counts[pick] = (counts[pick] ?? 0) + 1;
      }

      expect(counts['server-1']).toBe(300);
      expect(counts['server-2']).toBe(100);
    });

    it('random selection is reproducible with the same seed', () => {
      const rng1 = createPRNG(12345);
      const rng2 = createPRNG(12345);
      const backendStates = {
        'server-1': { id: 'server-1', health: 'healthy' as const },
        'server-2': { id: 'server-2', health: 'healthy' as const },
        'server-3': { id: 'server-3', health: 'healthy' as const },
      };

      const picks1 = Array.from({ length: 50 }, () =>
        selectBackend('random', backends, backendStates, rng1, 0)
      );
      const picks2 = Array.from({ length: 50 }, () =>
        selectBackend('random', backends, backendStates, rng2, 0)
      );

      expect(picks1).toEqual(picks2);
    });
  });

  describe('Cache Hit Decision', () => {
    it('over 100,000 draws lands within 0.5% tolerance of hitRatio', () => {
      const rng = createPRNG(777);
      const cacheConfig: CacheConfig = {
        capacityMb: 1024,
        lookupLatencyMs: 2,
        hitRatio: 85, // 85%
        ttlSeconds: 3600,
        populateOnMiss: true,
      };

      const totalDraws = 100000;
      let hits = 0;
      for (let i = 0; i < totalDraws; i++) {
        if (decideHit(cacheConfig, rng)) {
          hits++;
        }
      }

      const observedRate = hits / totalDraws;
      // Should be within [0.845, 0.855]
      expect(observedRate).toBeGreaterThan(0.845);
      expect(observedRate).toBeLessThan(0.855);
    });

    it('effective hit ratio drops to 0 when marked down', () => {
      const rng = createPRNG(777);
      const cacheConfig: CacheConfig = {
        capacityMb: 1024,
        lookupLatencyMs: 2,
        hitRatio: 90,
        ttlSeconds: 3600,
        populateOnMiss: true,
      };

      for (let i = 0; i < 50; i++) {
        expect(decideHit(cacheConfig, rng, true)).toBe(false);
      }
    });
  });

  describe('App Server Effective Capacity', () => {
    it('returns concurrency-bound limit when concurrency is the bottleneck', () => {
      // Concurrency 10 with 100ms service time = 100 req/s ceiling
      // maxThroughput 2000, 16 cores (16 * 10 = 160 > 100)
      const config: AppServerConfig = {
        maxThroughputRps: 2000,
        maxConcurrentRequests: 10,
        avgProcessingTimeMs: 100, // 0.1s
        cpuCores: 16,
        memoryMb: 4096,
        queueSize: 100,
        overloadBehavior: 'reject',
        health: 'healthy',
      };

      const cap = appServerModel.getEffectiveCapacityRps(config);
      expect(cap).toBe(100);
    });

    it('returns throughput limit when maxThroughput is the bottleneck', () => {
      // Concurrency 500 with 10ms service time = 50,000 req/s ceiling
      // But maxThroughput is clamped at 800
      const config: AppServerConfig = {
        maxThroughputRps: 800,
        maxConcurrentRequests: 500,
        avgProcessingTimeMs: 10,
        cpuCores: 16,
        memoryMb: 4096,
        queueSize: 100,
        overloadBehavior: 'reject',
        health: 'healthy',
      };

      const cap = appServerModel.getEffectiveCapacityRps(config);
      expect(cap).toBe(800);
    });

    it('halves capacity when degraded and drops to 0 when down', () => {
      const config: AppServerConfig = {
        maxThroughputRps: 1000,
        maxConcurrentRequests: 200,
        avgProcessingTimeMs: 20, // 10,000 concurrency cap
        cpuCores: 32, // 32 * 50 = 1600 CPU cap > 1000
        memoryMb: 4096,
        queueSize: 100,
        overloadBehavior: 'reject',
        health: 'healthy',
      };

      expect(appServerModel.getEffectiveCapacityRps(config)).toBe(1000);

      const degradedConfig: AppServerConfig = { ...config, health: 'degraded' };
      expect(appServerModel.getEffectiveCapacityRps(degradedConfig)).toBe(500);

      const downConfig: AppServerConfig = { ...config, health: 'down' };
      expect(appServerModel.getEffectiveCapacityRps(downConfig)).toBe(0);
    });
  });

  describe('Database Connection Pool Accounting', () => {
    it('handles acquire, queue, and reject state transitions', () => {
      const poolSize = 5;
      const queueCapacity = 2;

      // 1. Under pool limit -> acquired
      expect(acquireConnection(3, poolSize, 0, queueCapacity)).toBe('acquired');
      expect(acquireConnection(4, poolSize, 0, queueCapacity)).toBe('acquired');

      // 2. Pool full, queue has space -> queued
      expect(acquireConnection(5, poolSize, 0, queueCapacity)).toBe('queued');
      expect(acquireConnection(5, poolSize, 1, queueCapacity)).toBe('queued');

      // 3. Pool full, queue full -> rejected
      expect(acquireConnection(5, poolSize, 2, queueCapacity)).toBe('rejected');
    });

    it('releases connections cleanly clamping at zero', () => {
      expect(releaseConnection(5)).toBe(4);
      expect(releaseConnection(1)).toBe(0);
      expect(releaseConnection(0)).toBe(0);
    });
  });
});
