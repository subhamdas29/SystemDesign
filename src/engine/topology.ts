/**
 * Compiles GraphConfig into an execution topology for the discrete simulation engine.
 * Pure TypeScript with ZERO React imports.
 */

import { GraphConfig, GraphNode, GraphEdge, ComponentType, AnyComponentConfig } from '../types';
import { NodeRuntimeState } from '../types/runtime';
import { COMPONENT_RULES } from '../builder/rules/slotRules';
import { createPRNG, PRNG } from './rng';

export interface RuntimeNode {
  id: string;
  type: ComponentType;
  slot: number;
  config: AnyComponentConfig;
  rng: PRNG;
  state: NodeRuntimeState;
  activeRequests: Set<string>;
  queue: string[];
  busySlots: number;
  concurrencyLimit: number;
  queueLimit: number;
  lbCounter: number;
}

export interface EngineTopology {
  nodes: Map<string, RuntimeNode>;
  clientNode: RuntimeNode;
  dnsNode?: RuntimeNode;
  entryNode?: RuntimeNode;
  cacheNode?: RuntimeNode;
  databaseNode?: RuntimeNode;
  messageQueueNode?: RuntimeNode;
  workerNodes: RuntimeNode[];
  replicaNodes: RuntimeNode[];
  appServerNodes: RuntimeNode[];
  forwardingChain: string[][]; // Node IDs grouped by occupied slots (excluding DNS)
  outgoingEdges: Map<string, string[]>;
  incomingEdges: Map<string, string[]>;
  edges: Map<string, GraphEdge>;
}

/**
 * Derives a deterministic 32-bit seed for a specific node given master seed and node ID.
 */
function deriveNodeSeed(masterSeed: number, nodeId: string): number {
  let hash = (masterSeed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < nodeId.length; i++) {
    hash ^= nodeId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Determines concurrency and queue limits for a node based on its config.
 */
function resolveLimits(node: GraphNode): { concurrencyLimit: number; queueLimit: number } {
  const cfg = node.config as unknown as Record<string, unknown>;

  switch (node.type) {
    case 'app-server':
      return {
        concurrencyLimit: Number(cfg.maxConcurrentRequests ?? 150),
        queueLimit: Number(cfg.queueSize ?? 500),
      };
    case 'database':
      return {
        concurrencyLimit: Number(cfg.connectionPoolSize ?? 100),
        queueLimit: Number(cfg.queueCapacity ?? 200),
      };
    case 'load-balancer':
      return {
        concurrencyLimit: Math.max(100, Math.floor(Number(cfg.capacityRps ?? 50000) / 100)),
        queueLimit: Number(cfg.queueLimit ?? 2000),
      };
    case 'router':
      return {
        concurrencyLimit: Math.max(100, Math.floor(Number(cfg.capacityRps ?? 50000) / 100)),
        queueLimit: Number(cfg.queueLimit ?? 1000),
      };
    case 'cache':
      return {
        concurrencyLimit: 2000,
        queueLimit: 1000,
      };
    case 'api-gateway':
      return {
        concurrencyLimit: Math.max(100, Math.floor(Number(cfg.capacityRps ?? 50000) / 100)),
        queueLimit: Number(cfg.queueLimit ?? 2000),
      };
    case 'message-queue':
      return {
        concurrencyLimit: Number(cfg.capacityRps ?? 25000),
        queueLimit: Number(cfg.maxQueueDepth ?? 50000),
      };
    case 'worker':
      return {
        concurrencyLimit: Number(cfg.instances ?? 2) * Number(cfg.concurrency ?? 5),
        queueLimit: 1000,
      };
    case 'database-replica':
      return {
        concurrencyLimit: Math.max(50, Math.floor(Number(cfg.capacityQps ?? 800) / 10)),
        queueLimit: 200,
      };
    default:
      return {
        concurrencyLimit: 5000,
        queueLimit: 5000,
      };
  }
}

/**
 * Compiles GraphConfig into an EngineTopology.
 */
export function buildTopology(graph: GraphConfig, masterSeed: number): EngineTopology {
  const nodes = new Map<string, RuntimeNode>();
  const outgoingEdges = new Map<string, string[]>();
  const incomingEdges = new Map<string, string[]>();
  const edges = new Map<string, GraphEdge>();

  for (const node of graph.nodes) {
    const slot = COMPONENT_RULES[node.type]?.slot ?? 99;
    const limits = resolveLimits(node);
    const nodeSeed = deriveNodeSeed(masterSeed, node.id);

    const runtimeNode: RuntimeNode = {
      id: node.id,
      type: node.type,
      slot,
      config: node.config,
      rng: createPRNG(nodeSeed),
      state: {
        nodeId: node.id,
        status: 'healthy',
        currentRps: 0,
        utilization: 0,
        queueDepth: 0,
        activeConnections: 0,
        errorRate: 0,
        p99LatencyMs: 0,
      },
      activeRequests: new Set<string>(),
      queue: [],
      busySlots: 0,
      concurrencyLimit: limits.concurrencyLimit,
      queueLimit: limits.queueLimit,
      lbCounter: 0,
    };

    nodes.set(node.id, runtimeNode);
    outgoingEdges.set(node.id, []);
    incomingEdges.set(node.id, []);
  }

  for (const edge of graph.edges) {
    outgoingEdges.get(edge.source)?.push(edge.target);
    incomingEdges.get(edge.target)?.push(edge.source);
    edges.set(edge.id, edge);
    edges.set(`${edge.source}->${edge.target}`, edge);
  }

  // Find key structural nodes
  const clientNode = Array.from(nodes.values()).find((n) => n.type === 'client')!;
  const dnsNode = Array.from(nodes.values()).find((n) => n.type === 'dns');
  const cacheNode = Array.from(nodes.values()).find((n) => n.type === 'cache');
  const databaseNode = Array.from(nodes.values()).find((n) => n.type === 'database');
  const messageQueueNode = Array.from(nodes.values()).find((n) => n.type === 'message-queue');
  const workerNodes = Array.from(nodes.values()).filter((n) => n.type === 'worker');
  const replicaNodes = Array.from(nodes.values()).filter((n) => n.type === 'database-replica');
  const appServerNodes = Array.from(nodes.values()).filter((n) => n.type === 'app-server');

  // Build forwarding chain ordered by occupied tier slots (excluding DNS, async queue/workers, and replicas)
  const slotsMap = new Map<number, string[]>();
  for (const node of nodes.values()) {
    if (
      node.type === 'client' ||
      node.type === 'dns' ||
      node.type === 'message-queue' ||
      node.type === 'worker' ||
      node.type === 'database-replica'
    ) {
      continue;
    }
    if (!slotsMap.has(node.slot)) {
      slotsMap.set(node.slot, []);
    }
    slotsMap.get(node.slot)!.push(node.id);
  }

  const occupiedSlots = Array.from(slotsMap.keys()).sort((a, b) => a - b);
  const forwardingChain = occupiedSlots.map((slot) => slotsMap.get(slot)!);

  return {
    nodes,
    clientNode,
    dnsNode,
    entryNode: forwardingChain[0] ? nodes.get(forwardingChain[0][0]!) : undefined,
    cacheNode,
    databaseNode,
    messageQueueNode,
    workerNodes,
    replicaNodes,
    appServerNodes,
    forwardingChain,
    outgoingEdges,
    incomingEdges,
    edges,
  };
}
