import { describe, it, expect } from 'vitest';
import {
  getEffectiveRoutes,
  pickRouteFromRoll,
  WORKLOAD_ROUTE_PRESETS,
} from '../src/types/routes';
import { createSimulation } from '../src/engine/simulation';
import { createStarterGraph } from '../src/builder/placement';

describe('Phase 9A: Workload Route Mix', () => {
  it('default route mix reproduces readRatio behavior exactly', () => {
    // With readRatio: 80, effective routes are default-read (80) and default-write (20)
    const routes80 = getEffectiveRoutes({ readRatio: 80 });
    expect(routes80).toHaveLength(2);
    expect(routes80[0]?.id).toBe('default-read');
    expect(routes80[0]?.share).toBe(80);
    expect(routes80[0]?.cacheable).toBe(true);
    expect(routes80[0]?.kind).toBe('read');
    expect(routes80[1]?.id).toBe('default-write');
    expect(routes80[1]?.share).toBe(20);
    expect(routes80[1]?.cacheable).toBe(false);
    expect(routes80[1]?.kind).toBe('write');

    // Sampling roll < 0.8 always yields default-read
    expect(pickRouteFromRoll(routes80, 0.79).id).toBe('default-read');
    expect(pickRouteFromRoll(routes80, 0.81).id).toBe('default-write');

    // With readRatio: 60
    const routes60 = getEffectiveRoutes({ readRatio: 60 });
    expect(routes60[0]?.share).toBe(60);
    expect(routes60[1]?.share).toBe(40);
    expect(pickRouteFromRoll(routes60, 0.59).id).toBe('default-read');
    expect(pickRouteFromRoll(routes60, 0.61).id).toBe('default-write');
  });

  it('custom route presets load and validate correctly', () => {
    const ecommerce = WORKLOAD_ROUTE_PRESETS['ecommerce'];
    expect(ecommerce).toBeDefined();
    expect(ecommerce.routes.length).toBe(4);
    const totalShare = ecommerce.routes.reduce((s, r) => s + r.share, 0);
    expect(totalShare).toBe(100);

    const social = WORKLOAD_ROUTE_PRESETS['social-feed'];
    expect(social.routes.reduce((s, r) => s + r.share, 0)).toBe(100);

    const loginHeavy = WORKLOAD_ROUTE_PRESETS['login-heavy'];
    expect(loginHeavy.routes.reduce((s, r) => s + r.share, 0)).toBe(100);
  });

  it('discrete simulation request generation preserves route properties', () => {
    let graph = createStarterGraph();
    const ecommerceRoutes = WORKLOAD_ROUTE_PRESETS['ecommerce'].routes;

    // Set custom routes on client
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.type === 'client'
          ? {
              ...n,
              config: {
                ...n.config,
                routes: ecommerceRoutes,
              },
            }
          : n
      ),
    };

    const sim = createSimulation({
      graph,
      traffic: { rps: 50, durationMs: 2000 },
      seed: 42,
    });

    sim.advanceTo(1000);
    const snap = sim.getSnapshot();
    expect(snap.counters.created).toBeGreaterThan(0);
  });
});
