/**
 * Pure deterministic visual layout computation for the architecture graph.
 * Spread Layout Engine (Section 3 Specification):
 * Replaces horizontal line layout with a 2D layered layout:
 * - Edge lane on top (Client, DNS, CDN globe)
 * - Core path on next row (Security/Entry Gateways -> App Server stack -> Cache -> Database)
 * - Async lane below App Servers (Message Queue -> Workers)
 * - Replica lane below Database (Database Replicas)
 * - Automatic row wrapping when width exceeds threshold to avoid edge crossings
 * - Zero React/DOM dependencies. Pure TypeScript.
 */

import { GraphConfig } from '../types';
import { COMPONENT_RULES } from './rules/slotRules';

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
  maxLaneWidth?: number;
}

/**
 * Computes deterministic (x, y) coordinates for every node in the graph across 2D lanes.
 */
export function computeLayout(graph: GraphConfig, options: LayoutOptions = {}): LayoutMap {
  const instanceGapY = options.instanceGapY ?? 120;
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 130; // Edge lane Y
  const coreY = originY + 230; // Core compute lane Y (360)
  const maxLaneWidth = options.maxLaneWidth ?? 1450;

  const layout: LayoutMap = {};

  // Partition nodes by functional lane
  const clientNode = graph.nodes.find((n) => n.type === 'client');
  const dnsNode = graph.nodes.find((n) => n.type === 'dns');
  const cdnNode = graph.nodes.find((n) => n.type === 'cdn');

  // Traffic / Entry Gateways (slots 4 to 8: router, firewall, waf, rate-limiter, load-balancer, api-gateway)
  const gatewayNodes = graph.nodes.filter(
    (n) =>
      n.type === 'router' ||
      n.type === 'firewall' ||
      n.type === 'waf' ||
      n.type === 'rate-limiter' ||
      n.type === 'load-balancer' ||
      n.type === 'api-gateway'
  ).sort((a, b) => {
    const slotA = COMPONENT_RULES[a.type]?.slot ?? 99;
    const slotB = COMPONENT_RULES[b.type]?.slot ?? 99;
    return slotA - slotB;
  });

  const appServerNodes = graph.nodes
    .filter((n) => n.type === 'app-server')
    .sort((a, b) => a.id.localeCompare(b.id));

  const cacheNode = graph.nodes.find((n) => n.type === 'cache');
  const dbNode = graph.nodes.find((n) => n.type === 'database');

  const mqNodes = graph.nodes
    .filter((n) => n.type === 'message-queue')
    .sort((a, b) => a.id.localeCompare(b.id));
  const workerNodes = graph.nodes
    .filter((n) => n.type === 'worker')
    .sort((a, b) => a.id.localeCompare(b.id));
  const replicaNodes = graph.nodes
    .filter((n) => n.type === 'database-replica')
    .sort((a, b) => a.id.localeCompare(b.id));

  // 1. Edge Lane (Top Row, y = originY): Client -> DNS -> CDN
  let edgeX = originX;
  if (clientNode) {
    layout[clientNode.id] = { x: edgeX, y: originY };
    edgeX += 240;
  }
  if (dnsNode) {
    layout[dnsNode.id] = { x: edgeX, y: originY };
    edgeX += 240;
  }
  if (cdnNode) {
    layout[cdnNode.id] = { x: edgeX, y: originY };
    edgeX += 240;
  }

  // 2. Gateway / Ingress Cluster (Row 2, y = coreY): router, waf, firewall, ratelimiter, load-balancer
  let curCoreX = originX;
  for (const gw of gatewayNodes) {
    layout[gw.id] = { x: curCoreX, y: coreY };
    curCoreX += 210;
  }

  // 3. App Servers (Row 2): Stacked vertically centered around coreY
  const appX = Math.max(curCoreX, originX + (gatewayNodes.length > 0 ? gatewayNodes.length * 210 : 260));
  const appCount = appServerNodes.length;
  const totalAppHeight = (appCount - 1) * instanceGapY;
  const startAppY = coreY - totalAppHeight / 2;

  appServerNodes.forEach((node, idx) => {
    layout[node.id] = {
      x: appX,
      y: Math.round(startAppY + idx * instanceGapY),
    };
  });

  // Calculate bottom of core lane
  const maxCoreY = Math.max(
    coreY + totalAppHeight / 2,
    ...appServerNodes.map((n) => layout[n.id]?.y ?? coreY)
  );

  // 4. Cache & Database (Row 2 downstream from App Servers)
  let downstreamX = appX + 270;

  if (cacheNode) {
    if (downstreamX > maxLaneWidth) {
      // Wrap if exceeding canvas width
      layout[cacheNode.id] = { x: originX + 200, y: maxCoreY + 120 };
      downstreamX = originX + 470;
    } else {
      layout[cacheNode.id] = { x: downstreamX, y: coreY };
      downstreamX += 270;
    }
  }

  if (dbNode) {
    if (downstreamX > maxLaneWidth) {
      layout[dbNode.id] = { x: originX + 200, y: maxCoreY + 120 };
    } else {
      layout[dbNode.id] = { x: downstreamX, y: coreY };
    }
  }

  // 5. Async Lane (Below App Servers): Message Queue -> Workers
  const asyncY = Math.max(540, maxCoreY + 160);
  const mqX = appX;

  mqNodes.forEach((node) => {
    layout[node.id] = { x: mqX, y: asyncY };
  });

  const workerX = mqX + 270;
  const workerCount = workerNodes.length;
  const totalWorkerHeight = (workerCount - 1) * 110;
  const startWorkerY = asyncY - totalWorkerHeight / 2;

  workerNodes.forEach((node, idx) => {
    layout[node.id] = {
      x: workerX,
      y: Math.round(startWorkerY + idx * 110),
    };
  });

  // 6. Replica Lane (Below Database): Database Replicas
  const dbPos = dbNode ? layout[dbNode.id] : null;
  const replicaX = dbPos ? dbPos.x : downstreamX;
  const replicaBaseY = dbPos ? dbPos.y + 160 : asyncY;

  replicaNodes.forEach((node, idx) => {
    layout[node.id] = {
      x: replicaX,
      y: Math.round(replicaBaseY + idx * instanceGapY),
    };
  });

  // Fallback for any unmapped nodes
  for (const node of graph.nodes) {
    if (!layout[node.id]) {
      const slot = COMPONENT_RULES[node.type]?.slot ?? 99;
      layout[node.id] = {
        x: originX + slot * 160,
        y: coreY,
      };
    }
  }

  return layout;
}

export default computeLayout;
