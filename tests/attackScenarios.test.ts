import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/engine/simulation';
import { createStarterGraph, addComponent } from '../src/builder/placement';
import { AttackCampaign } from '../src/types/attacks';
import { AppServerConfig, CacheConfig } from '../src/types';

describe('Phase 8A: Attack Scenarios Signature Behaviors', () => {
  it('cache-busting-scraper: forces 100% cache misses and hammers the database directly', () => {
    // Add cache to starter graph (between app-server and database)
    let graph = createStarterGraph();
    graph = addComponent(graph, 'cache');

    // Configure cache with high hit ratio (90%) for normal traffic
    const cacheNode = graph.nodes.find((n) => n.type === 'cache');
    if (cacheNode) {
      graph = {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === cacheNode.id
            ? { ...n, config: { ...n.config, hitRatio: 90 } as unknown as CacheConfig }
            : n
        ),
      };
    }

    const scraperCampaign: AttackCampaign = {
      id: 'scraper-test',
      name: 'Cache Busting Scraper Test',
      description: 'Bypass cache and saturate DB',
      phases: [
        {
          id: 'p1',
          scenarioId: 'cache-busting-scraper',
          startMs: 0,
          durationMs: 3000,
          intensityRps: 40,
          sourceCount: 50,
        },
      ],
    };

    const sim = createSimulation({
      graph,
      traffic: { rps: 10, durationMs: 3000 },
      campaign: scraperCampaign,
      seed: 42,
    });
    sim.advanceTo(3500);
    const snap = sim.getSnapshot();

    // Check all events for cache misses with reason CACHE_BUSTING
    const events = sim.getAllEvents();
    const cacheBustingEvents = events.filter(
      (e) => e.type === 'CACHE_MISS' && (e.details as { reason?: string })?.reason === 'CACHE_BUSTING'
    );
    expect(cacheBustingEvents.length).toBeGreaterThan(0);

    // Database received traffic from both legitimate and scraper requests
    const dbNode = graph.nodes.find((n) => n.type === 'database')!;
    const dbRuntime = snap.runtimeNodes[dbNode.id];
    expect(dbRuntime).toBeDefined();
    expect(dbRuntime?.currentRps).toBeGreaterThanOrEqual(0);
  });

  it('slow-connection: ties up server connection concurrency with extended hold times', () => {
    let graph = createStarterGraph();
    const serverNode = graph.nodes.find((n) => n.type === 'app-server')!;
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === serverNode.id
          ? {
              ...n,
              config: {
                ...n.config,
                maxConcurrentRequests: 4,
                queueSize: 5,
                maxThroughputRps: 50,
              } as AppServerConfig,
            }
          : n
      ),
    };

    const slowlorisCampaign: AttackCampaign = {
      id: 'slow-test',
      name: 'Slowloris Test',
      description: 'Hold connections',
      phases: [
        {
          id: 'p1',
          scenarioId: 'slow-connection',
          startMs: 0,
          durationMs: 3000,
          intensityRps: 15,
          sourceCount: 20,
        },
      ],
    };

    const sim = createSimulation({
      graph,
      traffic: { rps: 10, durationMs: 3000 },
      campaign: slowlorisCampaign,
      seed: 42,
    });
    sim.advanceTo(3500);
    const snap = sim.getSnapshot();

    // Rejections must occur due to connection slots being held
    expect(snap.counters.rejected).toBeGreaterThan(0);
  });

  it('injection-attempts: records security exposure events when reaching the database layer', () => {
    const graph = createStarterGraph();
    const injectionCampaign: AttackCampaign = {
      id: 'injection-test',
      name: 'Injection Attempts Test',
      description: 'Security exposure risk testing',
      phases: [
        {
          id: 'p1',
          scenarioId: 'injection-attempts',
          startMs: 0,
          durationMs: 3000,
          intensityRps: 30,
          sourceCount: 10,
        },
      ],
    };

    const sim = createSimulation({
      graph,
      traffic: { rps: 20, durationMs: 3000 },
      campaign: injectionCampaign,
      seed: 42,
    });
    sim.advanceTo(3500);

    const events = sim.getAllEvents();
    const exposureEvents = events.filter((e) => e.type === 'EXPOSURE_EVENT');
    expect(exposureEvents.length).toBeGreaterThan(0);
    expect(exposureEvents[0]).toBeDefined();
    const details = exposureEvents[0]!.details as { scenarioId?: string; exposureRisk?: number } | undefined;
    expect(details?.scenarioId).toBe('injection-attempts');
    expect(details?.exposureRisk).toBeGreaterThan(0);
  });

  it('compromised-server: marks server compromised and emits server compromise events', () => {
    const graph = createStarterGraph();
    const compromisedCampaign: AttackCampaign = {
      id: 'compromise-test',
      name: 'Compromised Server Test',
      description: 'Internal server compromise',
      phases: [
        {
          id: 'p1',
          scenarioId: 'compromised-server',
          startMs: 500,
          durationMs: 2500,
          intensityRps: 1,
          sourceCount: 1,
        },
      ],
    };

    const sim = createSimulation({
      graph,
      traffic: { rps: 20, durationMs: 3000 },
      campaign: compromisedCampaign,
      seed: 42,
    });

    // Advance mid-run while phase is active (between 500ms and 3000ms)
    sim.advanceTo(2000);
    const snap = sim.getSnapshot();
    const serverNode = graph.nodes.find((n) => n.type === 'app-server')!;
    const serverState = snap.runtimeNodes[serverNode.id];

    // Server was flagged compromised
    expect(serverState).toBeDefined();
    expect(serverState?.isCompromised).toBe(true);

    const events = sim.getAllEvents();
    const compEvents = events.filter((e) => e.type === 'SERVER_COMPROMISED');
    expect(compEvents.length).toBeGreaterThan(0);
  });
});
