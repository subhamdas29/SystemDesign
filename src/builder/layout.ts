/**
 * Pure deterministic visual layout computation for the architecture graph.
 * Zero React/DOM dependencies.
 * Arranges occupied slots horizontally in the main lane;
 * lays out async lane (message queue + workers) below app-servers;
 * lays out replica lane (read replicas) below database.
 */

import { ComponentType, GraphConfig } from '../types';
import { COMPONENT_RULES } from './rules/slotRules';
import { tokens } from '../design/tokens';

export interface NodePosition {
  x: number;
  y: number;
}

export type LayoutMap = Record<string, NodePosition>;

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  tierGapX?: number;
  instanceGapY?: number;
  originX?: number;
  originY?: number;
}

/**
 * Computes deterministic (x, y) coordinates for every node in the graph across lanes.
 */
export function computeLayout(graph: GraphConfig, options: LayoutOptions = {}): LayoutMap {
  const nodeWidth = options.nodeWidth ?? tokens.spacing.canvasNodeWidth;
  const nodeHeight = options.nodeHeight ?? tokens.spacing.canvasNodeHeight;
  const tierGapX = options.tierGapX ?? tokens.spacing.tierGapX;
  const instanceGapY = options.instanceGapY ?? tokens.spacing.instanceGapY;
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 250;

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

  const mainNodes = graph.nodes.filter((n) => mainLaneTypes.has(n.type));
  const mqNodes = graph.nodes.filter((n) => n.type === 'message-queue');
  const workerNodes = graph.nodes.filter((n) => n.type === 'worker');
  const replicaNodes = graph.nodes.filter((n) => n.type === 'database-replica');

  // 1. Group main lane nodes by slot
  const nodesBySlot = new Map<number, string[]>();
  for (const node of mainNodes) {
    const slot = COMPONENT_RULES[node.type]?.slot ?? 99;
    if (!nodesBySlot.has(slot)) {
      nodesBySlot.set(slot, []);
    }
    nodesBySlot.get(slot)!.push(node.id);
  }

  // Sort occupied slots in ascending tier order
  const occupiedSlots = Array.from(nodesBySlot.keys()).sort((a, b) => a - b);
  const layout: LayoutMap = {};
  const slotXMap = new Map<number, number>();

  let maxTierCount = 1;

  occupiedSlots.forEach((slot, tierIndex) => {
    const nodeIds = nodesBySlot.get(slot)!;
    nodeIds.sort((a, b) => a.localeCompare(b));

    const x = originX + tierIndex * (nodeWidth + tierGapX);
    slotXMap.set(slot, x);
    const count = nodeIds.length;
    if (count > maxTierCount) maxTierCount = count;

    // Stack multiple instances vertically, centered around originY
    const totalStackHeight = (count - 1) * (nodeHeight + instanceGapY);
    const startY = originY - totalStackHeight / 2;

    nodeIds.forEach((nodeId, instanceIndex) => {
      const y = startY + instanceIndex * (nodeHeight + instanceGapY);
      layout[nodeId] = {
        x: Math.round(x),
        y: Math.round(y),
      };
    });
  });

  // Calculate side lane baseline Y to safely clear main lane stacks
  const mainLaneBottom = originY + ((maxTierCount - 1) * (nodeHeight + instanceGapY)) / 2;
  const sideLaneY = Math.max(originY + 220, mainLaneBottom + nodeHeight + 60);

  // Derive X coordinates for async and replica lanes
  const appServerSlot = 9;
  const cacheSlot = 10;
  const dbSlot = 11;

  const appServerX = slotXMap.get(appServerSlot) ?? originX + 7 * (nodeWidth + tierGapX);
  const cacheX = slotXMap.get(cacheSlot) ?? appServerX + nodeWidth + tierGapX;
  const dbX = slotXMap.get(dbSlot) ?? cacheX + nodeWidth + tierGapX;

  // 2. Async Lane: Message Queue & Workers
  mqNodes.sort((a, b) => a.id.localeCompare(b.id));
  mqNodes.forEach((node, i) => {
    layout[node.id] = {
      x: Math.round(appServerX),
      y: Math.round(sideLaneY + i * (nodeHeight + instanceGapY)),
    };
  });

  workerNodes.sort((a, b) => a.id.localeCompare(b.id));
  const workerCount = workerNodes.length;
  const startWorkerY =
    workerCount > 1
      ? sideLaneY - ((workerCount - 1) * (nodeHeight + instanceGapY)) / 2
      : sideLaneY;

  workerNodes.forEach((node, i) => {
    layout[node.id] = {
      x: Math.round(cacheX),
      y: Math.round(startWorkerY + i * (nodeHeight + instanceGapY)),
    };
  });

  // 3. Replica Lane: Database Replicas
  replicaNodes.sort((a, b) => a.id.localeCompare(b.id));
  replicaNodes.forEach((node, i) => {
    layout[node.id] = {
      x: Math.round(dbX),
      y: Math.round(sideLaneY + i * (nodeHeight + instanceGapY)),
    };
  });

  return layout;
}
