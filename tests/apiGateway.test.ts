import { describe, it, expect } from 'vitest';
import { evaluateApiGateway } from '../src/engine/components/apiGatewayModel';
import { ApiGatewayConfig } from '../src/types/components';
import { RETRY_PRESETS } from '../src/types/components';
import {
  createStarterGraph,
  addComponent,
  swapComponent,
  canSwap,
  getSwapExplanation,
} from '../src/builder/placement';
import { createSimulation } from '../src/engine/simulation';

describe('Phase 9A: API Gateway Model & Swap', () => {
  const baseGwConfig: ApiGatewayConfig = {
    capacityRps: 50000,
    processingLatencyMs: 4,
    backendAlgorithm: 'round-robin',
    authEnabled: true,
    authLatencyMs: 15,
    authCacheHitRatio: 80,
    perRouteLimits: [
      {
        routeId: 'route-auth',
        limitRps: 20,
        scope: 'per-source',
      },
    ],
    upstreamTimeoutMs: 5000,
    retryPolicy: RETRY_PRESETS.none,
    responseCaching: {
      enabled: true,
      ttlSeconds: 60,
      cacheableRoutes: ['route-read', 'default-read'],
    },
  };

  it('response caching hit serves cacheable routes early without app servers', () => {
    const res = evaluateApiGateway({
      config: baseGwConfig,
      routeId: 'route-read',
      kind: 'read',
      cacheable: true,
      prngRoll: 0.5, // 0.5 < 0.8 => cache hit
    });

    expect(res.action).toBe('response-cache-hit');
    expect(res.reason).toBe('RESPONSE_CACHE_HIT');
    expect(res.addedLatencyMs).toBeLessThanOrEqual(4);
  });

  it('per-route rate limiting rejects high-rate callers with 429', () => {
    const res = evaluateApiGateway({
      config: baseGwConfig,
      routeId: 'route-auth',
      kind: 'auth',
      sourceCount: 1,
      routeRps: 50, // exceeds limitRps: 20
    });

    expect(res.action).toBe('reject-429');
    expect(res.reason).toBe('ROUTE_RATE_LIMITED');
  });

  it('authentication cached decision adds minimal latency vs full miss', () => {
    // Cached auth: roll < 0.8
    const cached = evaluateApiGateway({
      config: baseGwConfig,
      routeId: 'route-write',
      kind: 'write',
      cacheable: false,
      prngRoll: 0.1,
    });
    expect(cached.action).toBe('pass');
    expect(cached.isAuthCached).toBe(true);
    expect(cached.addedLatencyMs).toBe(4 + 1.0); // processing + 1ms

    // Uncached auth: roll >= 0.8
    const uncached = evaluateApiGateway({
      config: baseGwConfig,
      routeId: 'route-write',
      kind: 'write',
      cacheable: false,
      prngRoll: 0.9,
    });
    expect(uncached.action).toBe('pass');
    expect(uncached.isAuthCached).toBe(false);
    expect(uncached.addedLatencyMs).toBe(4 + 15); // processing + 15ms
  });

  it('swap between Load Balancer and API Gateway preserves shared fields', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    const lbNode = graph.nodes.find((n) => n.type === 'load-balancer')!;
    expect(lbNode).toBeDefined();

    // Check canSwap
    const check = canSwap(graph, lbNode.id, 'api-gateway');
    expect(check.allowed).toBe(true);

    // Check explanation
    const explanation = getSwapExplanation('load-balancer', 'api-gateway');
    expect(explanation).toContain('API Gateway adds authentication');

    // Execute swap
    graph = swapComponent(graph, lbNode.id, 'api-gateway');
    const gwNode = graph.nodes.find((n) => n.id === lbNode.id)!;
    expect(gwNode.type).toBe('api-gateway');

    // Preserves capacity and latency
    const gwCfg = gwNode.config as ApiGatewayConfig;
    expect(gwCfg.capacityRps).toBe(50000);
    expect(gwCfg.processingLatencyMs).toBe(3);

    // Swap back
    graph = swapComponent(graph, gwNode.id, 'load-balancer');
    const restoredLb = graph.nodes.find((n) => n.id === lbNode.id)!;
    expect(restoredLb.type).toBe('load-balancer');
  });

  it('discrete simulation executes cleanly with an API Gateway entry-point', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    const lbNode = graph.nodes.find((n) => n.type === 'load-balancer')!;
    graph = swapComponent(graph, lbNode.id, 'api-gateway');

    const sim = createSimulation({
      graph,
      traffic: { rps: 40, durationMs: 2000 },
      seed: 42,
    });

    sim.advanceTo(1000);
    const snap = sim.getSnapshot();
    expect(snap.counters.created).toBeGreaterThan(0);
    expect(snap.counters.succeeded).toBeGreaterThan(0);
  });
});
