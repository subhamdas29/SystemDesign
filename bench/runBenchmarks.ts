/**
 * Performance Benchmark Harness for Life of a Request Simulator (Phase 10).
 * 
 * Verifies key performance budgets:
 * 1. 1,000,000 RPS aggregate mode over 10 min simulated time with an active campaign (target: <2 s wall-clock time).
 * 2. Discrete mode 1,000 RPS over 10 s simulated time (target: <500 ms wall-clock time).
 * 3. Memory: heap growth over long simulated runs (asserts bounded memory).
 * 4. Message throughput & dispatch latency.
 * 5. Packet animation computation & render cost for 200 visible packets (target: <4 ms per frame).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createStarterGraph, addComponent } from '../src/builder';
import { createSimulation } from '../src/engine/simulation';
import { createEngineClient } from '../src/engine/worker/engineClient';
import { calculatePacketProgress, interpolatePoint } from '../src/ui/animation/packetPosition';
import { selectPacketsUnderCap, AnimatedPacket } from '../src/ui/animation/packetSelection';
import { CAMPAIGN_PRESETS } from '../src/scenarios/attacks/campaign';

export interface BenchmarkResult {
  name: string;
  target: string;
  actual: string;
  passed: boolean;
  notes?: string;
}

export function runAllBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  // Helper to build full architecture
  function createFullArchitecture() {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'cdn');
    graph = addComponent(graph, 'firewall');
    graph = addComponent(graph, 'waf');
    graph = addComponent(graph, 'rate-limiter');
    graph = addComponent(graph, 'api-gateway');
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'app-server');
    graph = addComponent(graph, 'cache');
    graph = addComponent(graph, 'message-queue');
    graph = addComponent(graph, 'worker');
    graph = addComponent(graph, 'database-replica');
    return graph;
  }

  // 1. 1,000,000 RPS aggregate mode over 10 min (600,000 ms) simulated time on full architecture
  {
    const graph = createFullArchitecture();
    const campaign = CAMPAIGN_PRESETS[0]; // Volumetric flood
    const startWall = performance.now();

    const sim = createSimulation({
      graph,
      traffic: {
        peakRps: 1_000_000,
        durationMs: 600_000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'aggregate',
      },
      seed: 42,
      campaign,
    });

    sim.advanceTo(600_000);
    const elapsedMs = performance.now() - startWall;
    const snap = sim.getSnapshot();

    const passed = elapsedMs < 2000 && snap.counters.created > 0;
    results.push({
      name: '1M RPS 10-Min Aggregate Simulation',
      target: '< 2,000 ms wall-clock',
      actual: `${elapsedMs.toFixed(1)} ms (${(snap.counters.created / 1e6).toFixed(1)}M requests)`,
      passed,
      notes: `Mode: ${snap.mode}, Succeeded: ${snap.counters.succeeded}`,
    });
  }

  // 2. Discrete mode 1,000 RPS over 10 s (10,000 ms) simulated time
  {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'app-server');

    const startWall = performance.now();
    const sim = createSimulation({
      graph,
      traffic: {
        peakRps: 1_000,
        durationMs: 10_000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
        mode: 'discrete',
      },
      seed: 42,
    });

    sim.advanceTo(10_000);
    const elapsedMs = performance.now() - startWall;
    const snap = sim.getSnapshot();

    const passed = elapsedMs < 500 && snap.counters.created > 0;
    results.push({
      name: '1,000 RPS 10-Sec Discrete Simulation',
      target: '< 500 ms wall-clock',
      actual: `${elapsedMs.toFixed(1)} ms (${snap.counters.created} requests processed)`,
      passed,
    });
  }

  // 3. Memory: Heap growth over 10-minute simulated run in both modes
  {
    if (typeof global.gc === 'function') global.gc();
    const initialMem = process.memoryUsage().heapUsed;

    const graph = createFullArchitecture();
    const sim = createSimulation({
      graph,
      traffic: {
        peakRps: 50_000,
        durationMs: 600_000,
        pattern: 'gradual-ramp',
        patternParams: { type: 'gradual-ramp', startRps: 1000 },
        mode: 'aggregate',
      },
      seed: 42,
    });

    // Advance in 60 increments of 10 seconds
    for (let t = 10_000; t <= 600_000; t += 10_000) {
      sim.advanceTo(t);
    }

    if (typeof global.gc === 'function') global.gc();
    const finalMem = process.memoryUsage().heapUsed;
    const growthMb = (finalMem - initialMem) / (1024 * 1024);

    // Bounded growth: ring buffers cap events and samples; should be well under 50 MB
    const passed = growthMb < 50;
    results.push({
      name: 'Memory Boundedness (10-min run)',
      target: '< 50 MB net heap growth',
      actual: `${growthMb.toFixed(2)} MB net growth`,
      passed,
    });
  }

  // 4. Message Throughput & Adapter Latency
  {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'app-server');

    const client = createEngineClient(
      {
        graph,
        traffic: {
          peakRps: 200,
          durationMs: 5_000,
          pattern: 'constant',
          patternParams: { type: 'constant' },
        },
        seed: 42,
      },
      {},
      true
    );

    const start = performance.now();
    let stepCount = 0;
    for (let t = 100; t <= 5_000; t += 50) {
      client.advanceTo(t);
      stepCount++;
    }
    const totalMs = performance.now() - start;
    const avgStepMs = totalMs / stepCount;

    const passed = avgStepMs < 2.0;
    results.push({
      name: 'Engine Adapter Dispatch Latency',
      target: '< 2.0 ms per advance step',
      actual: `${avgStepMs.toFixed(3)} ms/step (${stepCount} steps in ${totalMs.toFixed(1)} ms)`,
      passed,
    });
    client.terminate();
  }

  // 5. Render Cost: 200 packets animation interpolation computation
  {
    const samplePackets: AnimatedPacket[] = Array.from({ length: 200 }, (_, i) => ({
      id: `pkt-${i}`,
      requestId: `req-${i}`,
      sourceNodeId: 'client',
      targetNodeId: 'load-balancer',
      progress: (i * 0.005) % 1.0,
      state: 'forward',
      timestamp: i * 10,
    }));

    const p1 = { x: 50, y: 100 };
    const p2 = { x: 350, y: 100 };

    const start = performance.now();
    const iterations = 500;

    for (let iter = 0; iter < iterations; iter++) {
      // Simulate frame packet selection and interpolation
      const { visiblePackets } = selectPacketsUnderCap(samplePackets, 200, null);
      for (let j = 0; j < visiblePackets.length; j++) {
        const pkt = visiblePackets[j]!;
        const prog = calculatePacketProgress(iter * 16, pkt.timestamp, pkt.timestamp + 25);
        interpolatePoint(p1, p2, prog);
      }
    }

    const totalRenderMs = performance.now() - start;
    const perFrameCostMs = totalRenderMs / iterations;

    const passed = perFrameCostMs < 4.0;
    results.push({
      name: '200 Packets Frame Computation Cost',
      target: '< 4.0 ms per frame (60 FPS budget)',
      actual: `${perFrameCostMs.toFixed(3)} ms per frame`,
      passed,
    });
  }

  return results;
}

// Vitest integration
describe('Phase 10: Performance Benchmarks Suite', () => {
  it('executes performance benchmarks within strict latency, memory, and throughput budgets', () => {
    const results = runAllBenchmarks();

    // Print table to console
    console.log('\n================ LIFE OF A REQUEST - BENCHMARK RESULTS ================');
    console.table(
      results.map((r) => ({
        Benchmark: r.name,
        Target: r.target,
        Actual: r.actual,
        Status: r.passed ? 'PASS ✓' : 'FAIL ✗',
      }))
    );
    console.log('========================================================================\n');

    // Save JSON artifact for regression tracking
    try {
      const outDir = path.resolve(__dirname);
      const outPath = path.join(outDir, 'benchmark-results.json');
      fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
    } catch {
      // Ignore in read-only sandbox if needed
    }

    for (const r of results) {
      expect(r.passed, `Benchmark "${r.name}" failed target "${r.target}". Got: "${r.actual}"`).toBe(true);
    }
  });
});
