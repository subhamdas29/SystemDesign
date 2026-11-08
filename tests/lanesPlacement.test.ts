import { describe, it, expect } from 'vitest';
import {
  createStarterGraph,
  addComponent,
  removeComponent,
  canRemove,
} from '../src/builder/placement';
import { computeLayout } from '../src/builder/layout';
import { createSimulation } from '../src/engine/simulation';

describe('Phase 9A: Lanes, Edge Kinds & Placement Rules', () => {
  it('wires main, async, and replication lanes with distinct edge kinds', () => {
    let graph = createStarterGraph();
    // Add message-queue
    graph = addComponent(graph, 'message-queue');
    // Add worker
    graph = addComponent(graph, 'worker');
    // Add database-replica
    graph = addComponent(graph, 'database-replica');

    const mqNode = graph.nodes.find((n) => n.type === 'message-queue')!;
    const workerNode = graph.nodes.find((n) => n.type === 'worker')!;
    const replicaNode = graph.nodes.find((n) => n.type === 'database-replica')!;
    const appNode = graph.nodes.find((n) => n.type === 'app-server')!;
    const dbNode = graph.nodes.find((n) => n.type === 'database')!;

    expect(mqNode).toBeDefined();
    expect(workerNode).toBeDefined();
    expect(replicaNode).toBeDefined();

    // Check edge kinds
    // AppServer -> MessageQueue: async
    const appToMqEdge = graph.edges.find((e) => e.source === appNode.id && e.target === mqNode.id);
    expect(appToMqEdge).toBeDefined();
    expect(appToMqEdge?.kind).toBe('async');

    // MessageQueue -> Worker: async
    const mqToWorkerEdge = graph.edges.find((e) => e.source === mqNode.id && e.target === workerNode.id);
    expect(mqToWorkerEdge).toBeDefined();
    expect(mqToWorkerEdge?.kind).toBe('async');

    // Worker -> Database: request
    const workerToDbEdge = graph.edges.find((e) => e.source === workerNode.id && e.target === dbNode.id);
    expect(workerToDbEdge).toBeDefined();
    expect(workerToDbEdge?.kind).toBe('request');

    // Database -> Replica: replication
    const dbToReplicaEdge = graph.edges.find((e) => e.source === dbNode.id && e.target === replicaNode.id);
    expect(dbToReplicaEdge).toBeDefined();
    expect(dbToReplicaEdge?.kind).toBe('replication');
  });

  it('computes deterministic multi-lane layout positioning side lanes below main lane', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'message-queue');
    graph = addComponent(graph, 'worker');
    graph = addComponent(graph, 'database-replica');

    const layout = computeLayout(graph);
    const appPos = layout[graph.nodes.find((n) => n.type === 'app-server')!.id]!;
    const mqPos = layout[graph.nodes.find((n) => n.type === 'message-queue')!.id]!;
    const workerPos = layout[graph.nodes.find((n) => n.type === 'worker')!.id]!;
    const dbPos = layout[graph.nodes.find((n) => n.type === 'database')!.id]!;
    const replicaPos = layout[graph.nodes.find((n) => n.type === 'database-replica')!.id]!;

    // Async lane should be below main lane
    expect(mqPos.y).toBeGreaterThan(appPos.y);
    expect(workerPos.y).toBeGreaterThan(appPos.y);

    // Replica lane should be below primary database
    expect(replicaPos.y).toBeGreaterThan(dbPos.y);

    // X positions should line up with corresponding tiers
    expect(mqPos.x).toBe(appPos.x);
    expect(replicaPos.x).toBe(dbPos.x);
  });

  it('enforces dependency blocking on component removal', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'message-queue');
    graph = addComponent(graph, 'worker');
    graph = addComponent(graph, 'database-replica');

    const mqNode = graph.nodes.find((n) => n.type === 'message-queue')!;
    const workerNode = graph.nodes.find((n) => n.type === 'worker')!;
    const replicaNode = graph.nodes.find((n) => n.type === 'database-replica')!;
    const dbNode = graph.nodes.find((n) => n.type === 'database')!;
    const appNode = graph.nodes.find((n) => n.type === 'app-server')!;

    // Cannot remove message-queue while worker exists
    const removeMqCheck = canRemove(graph, mqNode.id);
    expect(removeMqCheck.allowed).toBe(false);
    expect(removeMqCheck.reason).toContain('Workers');

    // Cannot remove database while replicas exist
    const removeDbCheck = canRemove(graph, dbNode.id);
    expect(removeDbCheck.allowed).toBe(false);
    expect(removeDbCheck.reason).toContain('Replicas');

    // Cannot remove last app-server while message-queue exists
    const removeAppCheck = canRemove(graph, appNode.id);
    expect(removeAppCheck.allowed).toBe(false);
    expect(removeAppCheck.reason).toContain('Message Queue');

    // Once worker is removed, message queue can be removed
    graph = removeComponent(graph, workerNode.id);
    expect(canRemove(graph, mqNode.id).allowed).toBe(true);

    // Once replica is removed, database removal rule applies standard checks
    graph = removeComponent(graph, replicaNode.id);
    // database still required as terminal data store
    expect(canRemove(graph, dbNode.id).allowed).toBe(false);
  });

  it('preserves regression hash on runs using starter architecture without new components', () => {
    const graph = createStarterGraph();
    const sim = createSimulation({
      graph,
      traffic: { rps: 50, durationMs: 2000 },
      seed: 12345,
    });
    sim.advanceTo(1500);
    const snap = sim.getSnapshot();

    expect(snap.counters.created).toBe(63);
    expect(snap.counters.succeeded).toBeGreaterThan(0);
    expect(snap.counters.failed).toBe(0);
  });
});
