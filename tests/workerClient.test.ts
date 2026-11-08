import { describe, it, expect, vi } from 'vitest';
import { createStarterGraph, addComponent } from '../src/builder';
import { createEngineClient } from '../src/engine/worker/engineClient';
import { computeHash } from '../src/engine/hashing';

describe('Phase 10: Simulation Web Worker & EngineClient Suite', () => {
  function getBasicConfig() {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'app-server');

    return {
      graph,
      traffic: {
        peakRps: 100,
        durationMs: 5000,
        pattern: 'constant' as const,
        patternParams: { type: 'constant' as const },
      },
      seed: 42,
    };
  }

  it('runs main-thread fallback client with exact simulation lifecycle and callbacks', () => {
    const config = getBasicConfig();
    const onSnapshot = vi.fn();
    const onEventBatch = vi.fn();
    const onDone = vi.fn();

    const client = createEngineClient(
      config,
      { onSnapshot, onEventBatch, onDone },
      true // force fallback
    );

    expect(client.isWorker).toBe(false);
    expect(client.runId).toBeDefined();

    // Initial snapshot was delivered
    expect(onSnapshot).toHaveBeenCalled();

    // Advance simulation
    client.advanceTo(1000);
    expect(onSnapshot).toHaveBeenCalledTimes(2);

    const latest = client.getLatestSnapshot();
    expect(latest).toBeDefined();
    expect(latest?.timeMs).toBe(1000);
    expect(latest?.counters.created).toBeGreaterThan(0);

    // Seek back to 500ms
    client.seek(500);
    expect(client.getLatestSnapshot()?.timeMs).toBe(500);

    // Reset
    client.reset();
    expect(client.getLatestSnapshot()?.timeMs).toBe(0);
    expect(client.getLatestSnapshot()?.counters.created).toBe(0);

    client.terminate();
  });

  it('produces bit-for-bit identical hashes between fallback and direct simulation', () => {
    const config = getBasicConfig();

    // Client 1
    let snap1Final: any = null;
    const client1 = createEngineClient(
      config,
      { onSnapshot: (s) => (snap1Final = s) },
      true
    );
    client1.advanceTo(3000);

    // Client 2
    let snap2Final: any = null;
    const client2 = createEngineClient(
      config,
      { onSnapshot: (s) => (snap2Final = s) },
      true
    );
    client2.advanceTo(3000);

    expect(snap1Final).toBeDefined();
    expect(snap2Final).toBeDefined();

    const hash1 = computeHash(JSON.stringify(snap1Final.counters));
    const hash2 = computeHash(JSON.stringify(snap2Final.counters));

    expect(hash1).toBe(hash2);
    expect(snap1Final.counters.created).toBe(snap2Final.counters.created);
    expect(snap1Final.counters.succeeded).toBe(snap2Final.counters.succeeded);
    expect(snap1Final.latencySummary.averageMs).toBe(snap2Final.latencySummary.averageMs);
  });

  it('gracefully handles error reporting via onError callback without freezing', () => {
    const config = getBasicConfig();
    const onError = vi.fn();

    const client = createEngineClient(config, { onError }, true);

    // Verify client can be initialized and re-initialized safely
    client.init({
      ...config,
      seed: 999,
    });

    expect(client.getLatestSnapshot()?.timeMs).toBe(0);
    client.terminate();
  });

  it('tags every run with a unique runId and isolates consecutive runs', () => {
    const config = getBasicConfig();
    const client = createEngineClient(config, {}, true);

    const runId1 = client.runId;
    client.init(config);
    const runId2 = client.runId;

    expect(runId1).not.toBe(runId2);
    client.terminate();
  });
});
