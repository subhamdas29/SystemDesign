import { describe, it, expect } from 'vitest';
import { createStarterGraph } from '../src/builder';
import { createSimulation } from '../src/engine';

describe('Phase 7: Timeouts, Downstream Orphaned Work & Conservation Invariant', () => {
  it('triggers client timeouts when backend latency exceeds requestTimeoutMs', () => {
    const baseGraph = createStarterGraph();
    // Configure client timeout very low (80ms) and database latency high (300ms)
    const modifiedGraph = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((n) => {
        if (n.type === 'client') {
          return {
            ...n,
            config: {
              ...n.config,
              requestTimeoutMs: 80,
            },
          };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              readQueryLatencyMs: 300,
              writeQueryLatencyMs: 300,
            },
          };
        }
        return n;
      }),
    };

    const sim = createSimulation({
      graph: modifiedGraph,
      traffic: { peakRps: 20, durationMs: 4000, mode: 'discrete' },
      seed: 42,
    });

    const snap = sim.advanceTo(3500);

    // Because DB query (300ms) + ingress latency (40ms) > 80ms, all requests must time out
    expect(snap.counters.timedOut).toBeGreaterThan(20);
    expect(snap.counters.succeeded).toBe(0);

    // Check that downstream late responses were discarded and orphaned work was tracked
    expect(snap.counters.orphanedWork).toBeGreaterThan(0);
  });

  it('strictly preserves the conservation invariant under heavy timeouts and orphaned work', () => {
    const baseGraph = createStarterGraph();
    const modifiedGraph = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((n) => {
        if (n.type === 'client') {
          return {
            ...n,
            config: {
              ...n.config,
              requestTimeoutMs: 100,
            },
          };
        }
        if (n.type === 'database') {
          return {
            ...n,
            config: {
              ...n.config,
              readLatencyMs: 200,
              writeLatencyMs: 200,
            },
          };
        }
        return n;
      }),
    };

    const sim = createSimulation({
      graph: modifiedGraph,
      traffic: { peakRps: 50, durationMs: 5000, mode: 'discrete' },
      seed: 123,
    });

    // Advance past end of traffic so all in-flight and orphaned requests complete
    const snap = sim.advanceTo(7000);

    const { created, inFlight, succeeded, failed, rejected, timedOut } = snap.counters;
    const terminal = succeeded + failed + rejected + timedOut;

    // Strict conservation law: created = inFlight + terminal
    expect(created).toBe(inFlight + terminal);
    // At t=7000ms with traffic stopping at 5000ms, all in-flight work has flushed
    expect(inFlight).toBe(0);
    expect(created).toBe(terminal);
  });
});
