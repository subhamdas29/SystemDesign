import { describe, it, expect } from 'vitest';
import {
  createStarterGraph,
  canAdd,
  addComponent,
  canRemove,
  removeComponent,
  canSwap,
  swapComponent,
  validateGraph,
  computeLayout,
} from '../src/builder';
import { ComponentType } from '../src/types';

describe('Guided Placement Engine', () => {
  it('adds Load Balancer to starter graph inserting between client and server', () => {
    let graph = createStarterGraph();
    expect(canAdd(graph, 'load-balancer').allowed).toBe(true);

    graph = addComponent(graph, 'load-balancer');
    expect(graph.nodes.map((n) => n.type)).toEqual([
      'client',
      'cdn',
      'load-balancer',
      'app-server',
      'database',
    ]);

    expect(graph.edges).toHaveLength(4);
    expect(graph.edges[0]!.source).toBe('client-1');
    expect(graph.edges[0]!.target).toBe('cdn-1');
    expect(graph.edges[1]!.source).toBe('cdn-1');
    expect(graph.edges[1]!.target).toBe('load-balancer-1');
    expect(graph.edges[2]!.source).toBe('load-balancer-1');
    expect(graph.edges[2]!.target).toBe('app-server-1');
    expect(graph.edges[3]!.source).toBe('app-server-1');
    expect(graph.edges[3]!.target).toBe('database-1');

    const validation = validateGraph(graph);
    expect(validation.valid).toBe(true);
  });

  it('rejects adding a 2nd App Server without an entry-point (Load Balancer or API Gateway)', () => {
    const starter = createStarterGraph();
    const result = canAdd(starter, 'app-server');
    expect(result.allowed).toBe(false);
    expect(result.suggestedPrerequisite).toBe('load-balancer');
    expect(result.reason).toContain('Load Balancer or API Gateway');
  });

  it('allows adding 2nd App Server after adding Load Balancer and fans out correctly', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    expect(canAdd(graph, 'app-server').allowed).toBe(true);

    graph = addComponent(graph, 'app-server');
    expect(graph.nodes.filter((n) => n.type === 'app-server')).toHaveLength(2);

    // Edges should connect LB to both servers, and both servers to DB
    const lbOutEdges = graph.edges.filter((e) => e.source === 'load-balancer-1');
    expect(lbOutEdges).toHaveLength(2);

    const dbInEdges = graph.edges.filter((e) => e.target === 'database-1');
    expect(dbInEdges).toHaveLength(2);

    const validation = validateGraph(graph);
    expect(validation.valid).toBe(true);
  });

  it('adds cache and inserts it between servers and database', () => {
    let graph = createStarterGraph();
    expect(canAdd(graph, 'cache').allowed).toBe(true);

    graph = addComponent(graph, 'cache');
    expect(graph.nodes.map((n) => n.type)).toEqual([
      'client',
      'cdn',
      'app-server',
      'cache',
      'database',
    ]);

    expect(graph.edges).toHaveLength(4);
    expect(graph.edges[0]!.source).toBe('client-1');
    expect(graph.edges[0]!.target).toBe('cdn-1');
    expect(graph.edges[1]!.source).toBe('cdn-1');
    expect(graph.edges[1]!.target).toBe('app-server-1');
    expect(graph.edges[2]!.source).toBe('app-server-1');
    expect(graph.edges[2]!.target).toBe('cache-1');
    expect(graph.edges[3]!.source).toBe('cache-1');
    expect(graph.edges[3]!.target).toBe('database-1');

    const validation = validateGraph(graph);
    expect(validation.valid).toBe(true);
  });

  it('blocks removing Load Balancer while multiple App Servers exist', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'app-server');

    const result = canRemove(graph, 'load-balancer-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('multiple App Servers');
  });

  it('removes Cache and automatically heals adjacent connections', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'cache');
    expect(graph.nodes.some((n) => n.type === 'cache')).toBe(true);

    const removeCheck = canRemove(graph, 'cache-1');
    expect(removeCheck.allowed).toBe(true);

    graph = removeComponent(graph, 'cache-1');
    expect(graph.nodes.map((n) => n.type)).toEqual(['client', 'cdn', 'app-server', 'database']);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[1]!.source).toBe('cdn-1');
    expect(graph.edges[1]!.target).toBe('app-server-1');
    expect(graph.edges[2]!.source).toBe('app-server-1');
    expect(graph.edges[2]!.target).toBe('database-1');
  });

  it('blocks removing compulsory components (Client, CDN, App Server) and allows removing standalone Database', () => {
    const graph = createStarterGraph();
    expect(canRemove(graph, 'client-1').allowed).toBe(false);
    expect(canRemove(graph, 'cdn-1').allowed).toBe(false);
    expect(canRemove(graph, 'app-server-1').allowed).toBe(false);
    expect(canRemove(graph, 'database-1').allowed).toBe(true);
  });

  it('blocks removing Database if Cache is present', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'cache');
    const result = canRemove(graph, 'database-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cache requires a persistent database');
  });

  it('swaps Load Balancer with API Gateway keeping connections intact', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');

    expect(canSwap(graph, 'load-balancer-1', 'api-gateway').allowed).toBe(true);
    graph = swapComponent(graph, 'load-balancer-1', 'api-gateway');

    const gatewayNode = graph.nodes.find((n) => n.id === 'load-balancer-1');
    expect(gatewayNode?.type).toBe('api-gateway');

    // Edges remain connected
    expect(graph.edges[0]!.source).toBe('client-1');
    expect(graph.edges[0]!.target).toBe('cdn-1');
    expect(graph.edges[1]!.source).toBe('cdn-1');
    expect(graph.edges[1]!.target).toBe('load-balancer-1');
    expect(graph.edges[2]!.source).toBe('load-balancer-1');
    expect(graph.edges[2]!.target).toBe('app-server-1');

    const validation = validateGraph(graph);
    expect(validation.valid).toBe(true);
  });

  it('prevents swapping non-swappable components', () => {
    const graph = createStarterGraph();
    const result = canSwap(graph, 'client-1', 'database');
    expect(result.allowed).toBe(false);
  });

  it('layout generates deterministic coordinates and stacks multi-instances', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'app-server'); // 2 servers

    const layout1 = computeLayout(graph);
    const layout2 = computeLayout(graph);

    expect(layout1).toEqual(layout2);

    // Both servers should have identical X coordinates and different Y coordinates
    const server1 = layout1['app-server-1']!;
    const server2 = layout1['app-server-2']!;
    expect(server1.x).toBe(server2.x);
    expect(server1.y).not.toBe(server2.y);
  });

  it('adding enabled components in any permutation produces a valid graph or a clean rejection', () => {
    const enabledTypes: ComponentType[] = [
      'dns',
      'cdn',
      'router',
      'firewall',
      'waf',
      'rate-limiter',
      'load-balancer',
      'app-server',
      'cache',
    ];

    // Try adding components sequentially
    let graph = createStarterGraph();
    for (const type of enabledTypes) {
      const check = canAdd(graph, type);
      if (check.allowed) {
        graph = addComponent(graph, type);
        const validation = validateGraph(graph);
        expect(validation.valid).toBe(true);
      } else {
        expect(typeof check.reason).toBe('string');
      }
    }
  });
});
