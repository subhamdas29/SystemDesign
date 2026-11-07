import { describe, it, expect } from 'vitest';
import { createStarterGraph } from '../src/builder';
import { createSimulation } from '../src/engine';
import { RETRY_PRESETS } from '../src/types/components';

describe('Phase 7: Retries, Backoff Policies & Load Amplification Factor', () => {
  it('naive immediate retries amplify load and produce high amplification factors', () => {
    const baseGraph = createStarterGraph();
    // Configure client with naive retries (maxAttempts: 3, 0 backoff, no retry budget)
    // and make database fail/time out
    const modifiedGraph = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((n) => {
        if (n.type === 'client') {
          return {
            ...n,
            config: {
              ...n.config,
              requestTimeoutMs: 70,
              retryPolicy: RETRY_PRESETS.naive,
            },
          };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              readQueryLatencyMs: 250,
              writeQueryLatencyMs: 250,
            },
          };
        }
        return n;
      }),
    };

    const sim = createSimulation({
      graph: modifiedGraph,
      traffic: { peakRps: 30, durationMs: 4000, mode: 'discrete' },
      seed: 42,
    });

    const snap = sim.advanceTo(3500);

    // Retries should be generated for each timed out request
    expect(snap.counters.retried).toBeGreaterThan(30);
    // Amplification factor should exceed 1.5x
    expect(snap.amplificationFactor).toBeGreaterThan(1.5);
  });

  it('exponential backoff with retry budget caps amplification and delays retries', () => {
    const baseGraph = createStarterGraph();
    const modifiedGraph = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((n) => {
        if (n.type === 'client') {
          return {
            ...n,
            config: {
              ...n.config,
              requestTimeoutMs: 70,
              retryPolicy: RETRY_PRESETS.exponential_jitter, // retryBudget: 0.2 (20% cap)
            },
          };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              readQueryLatencyMs: 250,
              writeQueryLatencyMs: 250,
            },
          };
        }
        return n;
      }),
    };

    const sim = createSimulation({
      graph: modifiedGraph,
      traffic: { peakRps: 30, durationMs: 4000, mode: 'discrete' },
      seed: 42,
    });

    const snap = sim.advanceTo(3500);

    // With retry budget capped at 20%, retry rate and amplification factor must stay bounded
    expect(snap.amplificationFactor).toBeLessThanOrEqual(1.35);
  });

  it('aggregate mode models load amplification under retries accurately', () => {
    const baseGraph = createStarterGraph();
    const modifiedGraph = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((n) => {
        if (n.type === 'client') {
          return {
            ...n,
            config: {
              ...n.config,
              requestTimeoutMs: 70,
              retryPolicy: RETRY_PRESETS.naive,
            },
          };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              readQueryLatencyMs: 250,
            },
          };
        }
        return n;
      }),
    };

    const sim = createSimulation({
      graph: modifiedGraph,
      traffic: { peakRps: 200, durationMs: 4000, mode: 'aggregate' },
      seed: 42,
    });

    const snap = sim.advanceTo(3000);
    expect(snap.counters.retried).toBeGreaterThan(100);
    expect(snap.amplificationFactor).toBeGreaterThan(1.2);
  });
});
