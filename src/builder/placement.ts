/**
 * Guided Placement Engine.
 * Pure TypeScript with ZERO React imports.
 * Enforces tier/slot order, auto-inserts nodes, auto-wires system-generated edges,
 * validates prerequisites, handles component removal with auto-healing, and node swapping.
 */

import {
  ComponentType,
  GraphConfig,
  GraphEdge,
  GraphNode,
  GraphConfigSchema,
  getDefaultConfig,
  AnyComponentConfig,
  validateNodeConfig,
  EDGE_PRESETS,
} from '../types';
import { COMPONENT_RULES } from './rules/slotRules';

export interface CanAddResult {
  allowed: boolean;
  reason?: string;
  suggestedPrerequisite?: ComponentType;
}

export interface CanRemoveResult {
  allowed: boolean;
  reason?: string;
}

export interface CanSwapResult {
  allowed: boolean;
  reason?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Generate a deterministic node ID for a given component type.
 */
export function generateDeterministicNodeId(type: ComponentType, existingNodes: GraphNode[]): string {
  let index = 1;
  const existingIds = new Set(existingNodes.map((n) => n.id));
  while (existingIds.has(`${type}-${index}`)) {
    index++;
  }
  return `${type}-${index}`;
}

/**
 * Determine if a component type can be added to the graph.
 */
export function canAdd(graph: GraphConfig, type: ComponentType): CanAddResult {
  const rule = COMPONENT_RULES[type];
  if (!rule) {
    return { allowed: false, reason: `Unknown component type "${type}".` };
  }

  if (rule.enabledInRelease === 'later') {
    return {
      allowed: false,
      reason: `${rule.label} will be available in an upcoming release.`,
    };
  }

  // Check swap group / slot singleton (e.g. entry-point: load-balancer OR api-gateway)
  if (rule.swapGroup) {
    const existingInGroup = graph.nodes.find((n) => COMPONENT_RULES[n.type]?.swapGroup === rule.swapGroup);
    if (existingInGroup) {
      return {
        allowed: false,
        reason: `An entry-point component (${existingInGroup.label || existingInGroup.type}) is already present. Use 'Swap' to switch between Load Balancer and API Gateway.`,
      };
    }
  }

  // Check component count vs maxCount
  const currentCount = graph.nodes.filter((n) => n.type === type).length;
  if (currentCount >= rule.maxCount) {
    return {
      allowed: false,
      reason: `Maximum of ${rule.maxCount} ${rule.label} instance${rule.maxCount > 1 ? 's' : ''} allowed.`,
    };
  }

  // Dynamic rule: 2nd+ App Server requires an entry-point (Load Balancer or API Gateway)
  if (type === 'app-server' && currentCount >= 1) {
    const hasEntryPoint = graph.nodes.some(
      (n) => n.type === 'load-balancer' || n.type === 'api-gateway'
    );
    if (!hasEntryPoint) {
      return {
        allowed: false,
        reason: 'Multiple App Servers require a Load Balancer or API Gateway to distribute traffic among them.',
        suggestedPrerequisite: 'load-balancer',
      };
    }
  }

  // Check explicit prerequisite rules
  for (const req of rule.requires) {
    if (req.type) {
      const exists = graph.nodes.some((n) => n.type === req.type);
      if (!exists) {
        return {
          allowed: false,
          reason: req.reason,
          suggestedPrerequisite: req.type,
        };
      }
    }
    if (req.anyOf && req.anyOf.length > 0) {
      const exists = graph.nodes.some((n) => req.anyOf?.includes(n.type));
      if (!exists) {
        return {
          allowed: false,
          reason: req.reason,
          suggestedPrerequisite: req.anyOf[0],
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Automatically regenerates all edges for the graph based on slot ordering and lanes.
 * - Main request lane: sequentially links occupied slots 1 through 11 with kind = 'request'.
 * - Async lane: links app-server -> message-queue (kind = 'async'), message-queue -> worker (kind = 'async'), and worker -> database (kind = 'request').
 * - Replica lane: links database -> database-replica (kind = 'replication').
 */
export function generateEdges(nodes: GraphNode[], existingEdges: GraphEdge[] = []): GraphEdge[] {
  if (nodes.length <= 1) {
    return [];
  }

  const existingMap = new Map<string, GraphEdge>();
  for (const e of existingEdges) {
    existingMap.set(e.id, e);
    existingMap.set(`${e.source}->${e.target}`, e);
  }

  const edges: GraphEdge[] = [];

  const addEdge = (
    sourceNode: GraphNode,
    targetNode: GraphNode,
    kind: 'request' | 'async' | 'replication',
    isLookup = false
  ) => {
    const edgeId = `edge-${sourceNode.id}->${targetNode.id}`;
    const prev = existingMap.get(edgeId) || existingMap.get(`${sourceNode.id}->${targetNode.id}`);
    const defaultLatency =
      sourceNode.type === 'client'
        ? { ...EDGE_PRESETS['public-internet'] }
        : { ...EDGE_PRESETS['same-datacenter'] };

    edges.push({
      id: edgeId,
      source: sourceNode.id,
      target: targetNode.id,
      kind,
      isLookup,
      latency: prev?.latency ? { ...prev.latency } : defaultLatency,
    });
  };

  // 1. Separate nodes into lanes
  const mainLaneTypes = new Set<ComponentType>([
    'client',
    'dns',
    'cdn',
    'router',
    'firewall',
    'waf',
    'rate-limiter',
    'load-balancer',
    'api-gateway',
    'app-server',
    'cache',
    'database',
  ]);

  const mainNodes = nodes.filter((n) => mainLaneTypes.has(n.type));
  const mqNodes = nodes.filter((n) => n.type === 'message-queue');
  const workerNodes = nodes.filter((n) => n.type === 'worker');
  const replicaNodes = nodes.filter((n) => n.type === 'database-replica');
  const appServerNodes = nodes.filter((n) => n.type === 'app-server');
  const dbNodes = nodes.filter((n) => n.type === 'database');

  // Main lane slot ordering
  const nodesBySlot = new Map<number, GraphNode[]>();
  for (const node of mainNodes) {
    const slot = COMPONENT_RULES[node.type]?.slot ?? 99;
    if (!nodesBySlot.has(slot)) {
      nodesBySlot.set(slot, []);
    }
    nodesBySlot.get(slot)!.push(node);
  }

  const occupiedSlots = Array.from(nodesBySlot.keys()).sort((a, b) => a - b);
  for (let i = 0; i < occupiedSlots.length - 1; i++) {
    const currentSlot = occupiedSlots[i];
    const nextSlot = occupiedSlots[i + 1];
    if (currentSlot === undefined || nextSlot === undefined) continue;

    const currentNodes = nodesBySlot.get(currentSlot)!;
    const nextNodes = nodesBySlot.get(nextSlot)!;

    for (const sourceNode of currentNodes) {
      const isLookup = COMPONENT_RULES[sourceNode.type]?.pathBehavior === 'lookup';
      for (const targetNode of nextNodes) {
        addEdge(sourceNode, targetNode, 'request', isLookup);
      }
    }
  }

  // 2. Async lane wiring:
  // app-server -> message-queue (kind: 'async')
  // message-queue -> worker (kind: 'async')
  // worker -> database (kind: 'request')
  for (const mq of mqNodes) {
    for (const app of appServerNodes) {
      addEdge(app, mq, 'async', false);
    }
    for (const worker of workerNodes) {
      addEdge(mq, worker, 'async', false);
    }
  }
  for (const worker of workerNodes) {
    for (const db of dbNodes) {
      addEdge(worker, db, 'request', false);
    }
  }

  // 3. Replica lane wiring:
  // database -> database-replica (kind: 'replication')
  for (const db of dbNodes) {
    for (const rep of replicaNodes) {
      addEdge(db, rep, 'replication', false);
    }
  }

  return edges;
}

/**
 * Adds a component to the graph immutably.
 * Auto-inserts into its designated slot and rewires all edges.
 */
export function addComponent(graph: GraphConfig, type: ComponentType): GraphConfig {
  const check = canAdd(graph, type);
  if (!check.allowed) {
    return graph;
  }

  const id = generateDeterministicNodeId(type, graph.nodes);
  const rule = COMPONENT_RULES[type];
  const newNode: GraphNode = {
    id,
    type,
    config: getDefaultConfig(type),
    label: rule?.label ?? type,
  };

  const newNodes = [...graph.nodes, newNode].sort((a, b) => {
    const slotA = COMPONENT_RULES[a.type]?.slot ?? 99;
    const slotB = COMPONENT_RULES[b.type]?.slot ?? 99;
    if (slotA !== slotB) return slotA - slotB;
    return a.id.localeCompare(b.id);
  });

  const newEdges = generateEdges(newNodes, graph.edges);

  return {
    version: graph.version + 1,
    nodes: newNodes,
    edges: newEdges,
  };
}

/**
 * Checks whether a node can be removed.
 */
export function canRemove(graph: GraphConfig, nodeId: string): CanRemoveResult {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return { allowed: false, reason: 'Node not found in graph.' };
  }

  const rule = COMPONENT_RULES[node.type];
  if (rule && !rule.removable) {
    return { allowed: false, reason: `${node.label || node.type} is a core component and cannot be removed.` };
  }

  if (node.type === 'client') {
    return { allowed: false, reason: 'The Client node originates all traffic and cannot be removed.' };
  }

  if (node.type === 'app-server') {
    const serverCount = graph.nodes.filter((n) => n.type === 'app-server').length;
    if (serverCount <= 1) {
      const hasQueue = graph.nodes.some((n) => n.type === 'message-queue');
      if (hasQueue) {
        return {
          allowed: false,
          reason: 'Cannot remove the last App Server while a Message Queue depends on it. Remove the Message Queue first.',
        };
      }
      return { allowed: false, reason: 'The system must have at least one App Server to handle requests.' };
    }
  }

  if (node.type === 'message-queue') {
    const hasWorkers = graph.nodes.some((n) => n.type === 'worker');
    if (hasWorkers) {
      return {
        allowed: false,
        reason: 'Cannot remove Message Queue while Async Workers depend on it. Remove Workers first.',
      };
    }
  }

  if (node.type === 'load-balancer' || node.type === 'api-gateway') {
    const serverCount = graph.nodes.filter((n) => n.type === 'app-server').length;
    if (serverCount > 1) {
      return {
        allowed: false,
        reason: `Cannot remove ${node.label || node.type} while multiple App Servers exist. Remove extra App Servers first.`,
      };
    }
  }

  if (node.type === 'database') {
    const hasCache = graph.nodes.some((n) => n.type === 'cache');
    if (hasCache) {
      return {
        allowed: false,
        reason: 'Cannot remove Database while a Cache is present. The Cache requires a persistent database behind it.',
      };
    }
    const hasReplicas = graph.nodes.some((n) => n.type === 'database-replica');
    if (hasReplicas) {
      return {
        allowed: false,
        reason: 'Cannot remove Primary Database while Read Replicas replicate from it. Remove Replicas first.',
      };
    }
    const dbCount = graph.nodes.filter((n) => n.type === 'database').length;
    if (dbCount <= 1) {
      return { allowed: false, reason: 'The architecture requires at least one primary Database to store persistent data.' };
    }
  }

  return { allowed: true };
}

/**
 * Removes a component and heals/re-links adjacent nodes.
 */
export function removeComponent(graph: GraphConfig, nodeId: string): GraphConfig {
  const check = canRemove(graph, nodeId);
  if (!check.allowed) {
    return graph;
  }

  const newNodes = graph.nodes.filter((n) => n.id !== nodeId);
  const newEdges = generateEdges(newNodes, graph.edges);

  return {
    version: graph.version + 1,
    nodes: newNodes,
    edges: newEdges,
  };
}

/**
 * Checks whether a node can be swapped with a target component type.
 */
export function canSwap(graph: GraphConfig, nodeId: string, targetType: ComponentType): CanSwapResult {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return { allowed: false, reason: 'Node not found.' };
  }

  if (node.type === targetType) {
    return { allowed: false, reason: `Node is already a ${node.label || node.type}.` };
  }

  const sourceRule = COMPONENT_RULES[node.type];
  const targetRule = COMPONENT_RULES[targetType];

  if (!sourceRule?.swapGroup || !targetRule?.swapGroup || sourceRule.swapGroup !== targetRule.swapGroup) {
    return {
      allowed: false,
      reason: `Only components in the same tier swap group can be swapped (${sourceRule?.label} cannot swap with ${targetRule?.label}).`,
    };
  }

  return { allowed: true };
}

/**
 * Returns plain-language swap impact explanation between component types in the same swapGroup.
 */
export function getSwapExplanation(fromType: ComponentType, toType: ComponentType): string {
  if (fromType === 'load-balancer' && toType === 'api-gateway') {
    return 'API Gateway adds authentication, per-route rate limits, and edge response caching; costs additional latency.';
  }
  if (fromType === 'api-gateway' && toType === 'load-balancer') {
    return 'Load Balancer provides low-latency, lightweight traffic distribution without authentication or route-level inspection overhead.';
  }
  return `Swapping ${fromType} with ${toType}.`;
}

/**
 * Swaps a node with another valid component in the same swapGroup,
 * preserving shared configuration fields (capacity, latency, routing algorithm, timeouts, retry policies).
 */
export function swapComponent(graph: GraphConfig, nodeId: string, targetType: ComponentType): GraphConfig {
  const check = canSwap(graph, nodeId, targetType);
  if (!check.allowed) {
    return graph;
  }

  const oldNode = graph.nodes.find((n) => n.id === nodeId)!;
  const targetRule = COMPONENT_RULES[targetType];
  const targetDefaults = getDefaultConfig(targetType) as unknown as Record<string, unknown>;
  const oldCfg = oldNode.config as Record<string, unknown>;

  // Retain shared config values (capacity, latencyMs, routing algorithm, timeout, retry, circuitBreaker, connectionLimits)
  const mergedConfig = {
    ...targetDefaults,
    capacityRps: oldCfg.capacityRps ?? targetDefaults.capacityRps,
    processingLatencyMs: oldCfg.processingLatencyMs ?? targetDefaults.processingLatencyMs,
    algorithm: oldCfg.backendAlgorithm ?? oldCfg.algorithm ?? targetDefaults.algorithm,
    backendAlgorithm: oldCfg.algorithm ?? oldCfg.backendAlgorithm ?? targetDefaults.backendAlgorithm,
    upstreamTimeoutMs: oldCfg.upstreamTimeoutMs ?? targetDefaults.upstreamTimeoutMs,
    retryPolicy: oldCfg.retryPolicy ?? targetDefaults.retryPolicy,
    circuitBreaker: oldCfg.circuitBreaker ?? targetDefaults.circuitBreaker,
    connectionLimits: oldCfg.connectionLimits ?? targetDefaults.connectionLimits,
  } as unknown as AnyComponentConfig;

  const swappedNode: GraphNode = {
    ...oldNode,
    type: targetType,
    config: mergedConfig,
    label: targetRule?.label ?? targetType,
  };

  const newNodes = graph.nodes.map((n) => (n.id === nodeId ? swappedNode : n));
  const newEdges = generateEdges(newNodes, graph.edges);

  return {
    version: graph.version + 1,
    nodes: newNodes,
    edges: newEdges,
  };
}

/**
 * Validates the architecture graph against schema and structural rules.
 */
export function validateGraph(graph: GraphConfig): ValidationResult {
  const errors: string[] = [];

  const parseResult = GraphConfigSchema.safeParse(graph);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`Schema error at ${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Check required core components
  const hasClient = graph.nodes.some((n) => n.type === 'client');
  if (!hasClient) errors.push('Architecture must include a Client node.');

  const appServerCount = graph.nodes.filter((n) => n.type === 'app-server').length;
  if (appServerCount < 1) errors.push('Architecture must include at least one App Server.');

  const hasDatabase = graph.nodes.some((n) => n.type === 'database');
  if (!hasDatabase) errors.push('Architecture must include at least one Primary Database.');

  // Validate individual node configurations
  for (const node of graph.nodes) {
    const configResult = validateNodeConfig(node.type, node.config);
    if (!configResult.valid) {
      for (const err of configResult.errors) {
        errors.push(`${node.label || node.id}: ${err}`);
      }
    }
  }

  // Check multi-server entry-point requirement
  if (appServerCount > 1) {
    const hasEntryPoint = graph.nodes.some(
      (n) => n.type === 'load-balancer' || n.type === 'api-gateway'
    );
    if (!hasEntryPoint) {
      errors.push('Multiple App Servers require a Load Balancer or API Gateway.');
    }
  }

  // Check Cache dependencies
  const hasCache = graph.nodes.some((n) => n.type === 'cache');
  if (hasCache) {
    if (!hasDatabase) errors.push('Cache requires a Primary Database.');
    if (appServerCount < 1) errors.push('Cache requires an App Server.');
  }

  // Check edge references
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${edge.id} references non-existent source node "${edge.source}".`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${edge.id} references non-existent target node "${edge.target}".`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Standard starter architecture graph: Client -> App Server -> Database.
 */
export function createStarterGraph(): GraphConfig {
  const clientNode: GraphNode = {
    id: 'client-1',
    type: 'client',
    config: getDefaultConfig('client'),
    label: COMPONENT_RULES.client.label,
  };

  const appServerNode: GraphNode = {
    id: 'app-server-1',
    type: 'app-server',
    config: getDefaultConfig('app-server'),
    label: COMPONENT_RULES['app-server'].label,
  };

  const dbNode: GraphNode = {
    id: 'database-1',
    type: 'database',
    config: getDefaultConfig('database'),
    label: COMPONENT_RULES.database.label,
  };

  const nodes = [clientNode, appServerNode, dbNode];
  const edges = generateEdges(nodes);

  return {
    version: 1,
    nodes,
    edges,
  };
}
