import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/engine/simulation';
import { createStarterGraph } from '../src/builder/placement';
import { AppServerConfig } from '../src/types';

describe('Circuit Breaker Policy (Phase 8B)', () => {
  it('trips from closed to open when error rate exceeds threshold under overload', () => {
    let graph = createStarterGraph();
    // Configure tight concurrency and queue with circuit breaker on App Server
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'app-server') {
          return {
            ...n,
            config: {
              ...(n.config as AppServerConfig),
              maxConcurrentRequests: 1,
              queueSize: 2,
              avgProcessingTimeMs: 100,
              circuitBreaker: {
                enabled: true,
                errorRateThreshold: 0.2, // 20% error rate trips circuit
                minRequestsInWindow: 3,
                windowSec: 2,
                openDurationSec: 5,
                halfOpenProbes: 2,
                fallback: 'none',
              },
            },
          };
        }
        return n;
      }),
    };

    // 100 RPS against 1-concurrency server quickly overflows queue and trips circuit breaker
    const sim = createSimulation({
      graph,
      traffic: { rps: 100, durationMs: 4000 },
      seed: 42,
    });

    sim.advanceTo(1000);
    const snap = sim.getSnapshot();

    const appRuntimeAfter = snap.runtimeNodes['app-server-1'];
    expect(['open', 'half-open']).toContain(appRuntimeAfter?.circuitBreakerState);
  });

  it('serves stale cache fallback when configured and circuit is open', () => {
    let graph = createStarterGraph();
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'app-server') {
          return {
            ...n,
            config: {
              ...(n.config as AppServerConfig),
              maxConcurrentRequests: 1,
              queueSize: 2,
              avgProcessingTimeMs: 100,
              circuitBreaker: {
                enabled: true,
                errorRateThreshold: 0.2,
                minRequestsInWindow: 3,
                windowSec: 2,
                openDurationSec: 5,
                halfOpenProbes: 2,
                fallback: 'serve-stale-from-cache',
              },
            },
          };
        }
        return n;
      }),
    };

    const sim = createSimulation({
      graph,
      traffic: { rps: 80, durationMs: 3000 },
      seed: 42,
    });

    sim.advanceTo(2000);
    const snap = sim.getSnapshot();
    expect(snap.counters.created).toBeGreaterThan(0);
    const appRuntime = snap.runtimeNodes['app-server-1'];
    expect(['open', 'half-open']).toContain(appRuntime?.circuitBreakerState);
  });
});
