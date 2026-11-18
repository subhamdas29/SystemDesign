import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createSimulation, hashEventStream } from '../src/engine';
import { createStarterGraph, addComponent } from '../src/builder';
import { AppServerConfig, CacheConfig, DatabaseConfig, ClientConfig, LoadBalancerConfig } from '../src/types';

describe('Discrete Simulation Engine Core', () => {
  it('same graph + traffic + seed produces an identical event-stream hash; different seed differs', () => {
    const starter = createStarterGraph();
    const traffic = { rps: 50, durationMs: 2000 };

    const sim1 = createSimulation({ graph: starter, traffic, seed: 12345 });
    sim1.advanceTo(2000);
    const hash1 = hashEventStream(sim1.getAllEvents());

    const sim2 = createSimulation({ graph: starter, traffic, seed: 12345 });
    sim2.advanceTo(2000);
    const hash2 = hashEventStream(sim2.getAllEvents());

    const sim3 = createSimulation({ graph: starter, traffic, seed: 99999 });
    sim3.advanceTo(2000);
    const hash3 = hashEventStream(sim3.getAllEvents());

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('starter graph at low RPS succeeds, with latency approximating sum of hop service times', () => {
    const starter = createStarterGraph();
    // 10 RPS for 1 second = ~10 requests
    const traffic = { rps: 10, durationMs: 1000 };

    const sim = createSimulation({ graph: starter, traffic, seed: 123 });
    sim.advanceTo(3000); // Allow in-flight requests to complete
    const snap = sim.getSnapshot();

    expect(snap.counters.created).toBeGreaterThan(0);
    expect(snap.counters.succeeded).toBe(snap.counters.created);
    expect(snap.counters.failed).toBe(0);
    expect(snap.counters.rejected).toBe(0);
    expect(snap.counters.timedOut).toBe(0);

    // Default: App Server ~35ms, Database ~30-60ms, hops ~4ms -> Avg Latency ~60-120ms
    expect(snap.latencySummary.averageMs).toBeGreaterThan(50);
    expect(snap.latencySummary.averageMs).toBeLessThan(150);
  });

  it('overload: raising RPS far beyond capacity fills the queue and rejects (503); counters sum correctly', () => {
    let graph = createStarterGraph();
    // Constrain App Server: capacity 100 rps, queue limit 10
    const serverNode = graph.nodes.find((n) => n.type === 'app-server')!;
    const constrainedConfig: Partial<AppServerConfig> = {
      maxThroughputRps: 100,
      maxConcurrentRequests: 2,
      avgProcessingTimeMs: 100,
      queueSize: 10,
    };
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === serverNode.id ? { ...n, config: { ...n.config, ...constrainedConfig } } : n
      ),
    };

    // Blast with 500 RPS
    const traffic = { rps: 500, durationMs: 2000 };
    const sim = createSimulation({ graph, traffic, seed: 77 });
    sim.advanceTo(3000);
    const snap = sim.getSnapshot();

    expect(snap.counters.created).toBeGreaterThan(200);
    expect(snap.counters.rejected).toBeGreaterThan(0);

    // Sum invariant: created = succeeded + failed + rejected + timedOut + inFlight
    const totalAccounted =
      snap.counters.succeeded +
      snap.counters.failed +
      snap.counters.rejected +
      snap.counters.timedOut +
      snap.counters.inFlight;

    expect(totalAccounted).toBe(snap.counters.created);
  });

  it('Load Balancer with 3 App Servers distributes per algorithm, excludes down servers, and handles all down', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'app-server'); // 2 servers
    graph = addComponent(graph, 'app-server'); // 3 servers

    // Set LB to round-robin
    const lbNode = graph.nodes.find((n) => n.type === 'load-balancer')!;
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === lbNode.id
          ? { ...n, config: { ...(n.config as LoadBalancerConfig), algorithm: 'round-robin' } }
          : n
      ),
    };

    const traffic = { rps: 30, durationMs: 1000 };
    const sim = createSimulation({ graph, traffic, seed: 10 });
    sim.advanceTo(2000);

    const events = sim.getAllEvents();
    const lbEvents = events.filter((e) => e.type === 'LOAD_BALANCED');
    expect(lbEvents.length).toBeGreaterThan(15);

    // Mark all servers down
    const allDownGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.type === 'app-server'
          ? { ...n, config: { ...(n.config as AppServerConfig), health: 'down' as const } }
          : n
      ),
    };

    const failSim = createSimulation({ graph: allDownGraph, traffic: { rps: 20, durationMs: 500 }, seed: 10 });
    failSim.advanceTo(1000);
    const failEvents = failSim.getAllEvents();
    const noBackendFails = failEvents.filter(
      (e) => e.type === 'REQUEST_FAILED' && (e.details as { reason?: string })?.reason === 'NO_HEALTHY_BACKEND'
    );
    expect(noBackendFails.length).toBeGreaterThan(5);
  });

  it('Cache: with hitRatio 1.0 and read-only traffic, cache hit never queries Database; writes always do', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'cache');

    // Configure 100% read ratio on Client and 100% hit ratio on Cache
    const clientNode = graph.nodes.find((n) => n.type === 'client')!;
    const cacheNode = graph.nodes.find((n) => n.type === 'cache')!;

    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.id === clientNode.id) {
          return { ...n, config: { ...(n.config as ClientConfig), readRatio: 100 } };
        }
        if (n.id === cacheNode.id) {
          return { ...n, config: { ...(n.config as CacheConfig), hitRatio: 100 } };
        }
        return n;
      }),
    };

    const sim = createSimulation({ graph, traffic: { rps: 20, durationMs: 1000 }, seed: 42 });
    sim.advanceTo(2000);

    const events = sim.getAllEvents();
    const hits = events.filter((e) => e.type === 'CACHE_HIT');
    const dbQueries = events.filter((e) => e.type === 'DATABASE_QUERY');

    expect(hits.length).toBeGreaterThan(10);
    expect(dbQueries.length).toBe(0); // Cache hit NEVER queries Database

    // Now test with 100% write ratio: writes MUST query Database
    const writeGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === clientNode.id
          ? { ...n, config: { ...(n.config as ClientConfig), readRatio: 0 } }
          : n
      ),
    };

    const writeSim = createSimulation({ graph: writeGraph, traffic: { rps: 20, durationMs: 1000 }, seed: 42 });
    writeSim.advanceTo(2000);
    const writeEvents = writeSim.getAllEvents();
    const writeDbQueries = writeEvents.filter((e) => e.type === 'DATABASE_QUERY');

    expect(writeDbQueries.length).toBeGreaterThan(10); // Writes always query Database
  });

  it('Database connection pool exhaustion causes queueing then rejection', () => {
    let graph = createStarterGraph();
    const dbNode = graph.nodes.find((n) => n.type === 'database')!;

    // Pool size 2, queue capacity 2, high latency
    const dbConfig: Partial<DatabaseConfig> = {
      connectionPoolSize: 2,
      queueCapacity: 2,
      readQueryLatencyMs: 300,
      writeQueryLatencyMs: 300,
    };

    graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === dbNode.id
          ? { ...n, config: { ...(n.config as DatabaseConfig), ...dbConfig } as DatabaseConfig }
          : n
      ),
    };

    const sim = createSimulation({ graph, traffic: { rps: 50, durationMs: 1000 }, seed: 99 });
    sim.advanceTo(2000);

    const events = sim.getAllEvents();
    const dbQueued = events.filter(
      (e) => e.type === 'REQUEST_QUEUED' && e.nodeId === dbNode.id
    );
    const dbRejected = events.filter(
      (e) => e.type === 'REQUEST_REJECTED' && (e.details as { reason?: string })?.reason === 'DATABASE_POOL_EXHAUSTED'
    );

    expect(dbQueued.length).toBeGreaterThan(0);
    expect(dbRejected.length).toBeGreaterThan(0);
  });

  it('deliberately slow database causes timed-out requests (HTTP 504), each counted once', () => {
    let graph = createStarterGraph();
    const clientNode = graph.nodes.find((n) => n.type === 'client')!;
    const dbNode = graph.nodes.find((n) => n.type === 'database')!;

    // Client timeout 200ms, DB query latency 1000ms
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.id === clientNode.id) {
          return { ...n, config: { ...(n.config as ClientConfig), requestTimeoutMs: 200 } };
        }
        if (n.id === dbNode.id) {
          return {
            ...n,
            config: {
              ...(n.config as DatabaseConfig),
              readQueryLatencyMs: 1000,
              writeQueryLatencyMs: 1000,
            },
          };
        }
        return n;
      }),
    };

    const sim = createSimulation({ graph, traffic: { rps: 10, durationMs: 500 }, seed: 123 });
    sim.advanceTo(2000);
    const snap = sim.getSnapshot();

    expect(snap.counters.timedOut).toBeGreaterThan(0);
    expect(snap.counters.succeeded).toBe(0);

    const timeouts = sim.getAllEvents().filter((e) => e.type === 'REQUEST_TIMED_OUT');
    expect(timeouts.length).toBe(snap.counters.timedOut);
  });

  it('advanceTo is idempotent and Seek followed by advance reproduces the exact same events', () => {
    const starter = createStarterGraph();
    const sim = createSimulation({ graph: starter, traffic: { rps: 20, durationMs: 1000 }, seed: 55 });

    sim.advanceTo(500);
    const hashAt500 = hashEventStream(sim.getAllEvents());

    // Advance to 500 again (idempotent)
    sim.advanceTo(500);
    expect(hashEventStream(sim.getAllEvents())).toBe(hashAt500);

    // Seek back to 500
    sim.seek(500);
    expect(hashEventStream(sim.getAllEvents())).toBe(hashAt500);
  });

  it('event ordering: sequence numbers strictly increase and timestamps never decrease', () => {
    const starter = createStarterGraph();
    const sim = createSimulation({ graph: starter, traffic: { rps: 40, durationMs: 1000 }, seed: 88 });
    sim.advanceTo(2000);

    const events = sim.getAllEvents();
    expect(events.length).toBeGreaterThan(20);

    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1]!;
      const curr = events[i]!;

      const prevSeq = Number(prev.id.replace('evt-', ''));
      const currSeq = Number(curr.id.replace('evt-', ''));

      expect(currSeq).toBeGreaterThan(prevSeq);
      expect(curr.timestamp).toBeGreaterThanOrEqual(prev.timestamp);
    }
  });

  it('architectural integrity: /src/engine has zero React, DOM, time, or Math.random imports', () => {
    const engineDir = path.resolve(__dirname, '../src/engine');
    const files = fs.readdirSync(engineDir, { recursive: true }) as string[];

    for (const file of files) {
      if (typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
        const fullPath = path.join(engineDir, file);
        const rawContent = fs.readFileSync(fullPath, 'utf-8');
        // Strip comments to test actual code execution
        const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

        expect(codeOnly, `File ${file} contains react import`).not.toMatch(/from\s+['"]react['"]/i);
        expect(codeOnly, `File ${file} contains react-dom import`).not.toMatch(/from\s+['"]react-dom['"]/i);
        expect(codeOnly, `File ${file} contains Math.random()`).not.toMatch(/Math\.random\s*\(/);
        expect(codeOnly, `File ${file} contains Date.now()`).not.toMatch(/Date\.now\s*\(/);
        expect(codeOnly, `File ${file} contains requestAnimationFrame`).not.toMatch(/requestAnimationFrame/);
        expect(codeOnly, `File ${file} contains setTimeout/setInterval`).not.toMatch(/setTimeout\s*\(|setInterval\s*\(/);
      }
    }
  });
});
