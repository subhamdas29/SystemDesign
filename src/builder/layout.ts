/**
 * Pure deterministic visual layout computation for the architecture graph.
 * Zero React/DOM dependencies.
 * Arranges occupied slots horizontally from left to right;
 * stacks multiple instances within a slot vertically and centered.
 */

import { GraphConfig } from '../types';
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
 * Computes deterministic (x, y) coordinates for every node in the graph.
 */
export function computeLayout(graph: GraphConfig, options: LayoutOptions = {}): LayoutMap {
  const nodeWidth = options.nodeWidth ?? tokens.spacing.canvasNodeWidth;
  const nodeHeight = options.nodeHeight ?? tokens.spacing.canvasNodeHeight;
  const tierGapX = options.tierGapX ?? tokens.spacing.tierGapX;
  const instanceGapY = options.instanceGapY ?? tokens.spacing.instanceGapY;
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 250;

  // Group nodes by slot
  const nodesBySlot = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const slot = COMPONENT_RULES[node.type]?.slot ?? 99;
    if (!nodesBySlot.has(slot)) {
      nodesBySlot.set(slot, []);
    }
    nodesBySlot.get(slot)!.push(node.id);
  }

  // Sort occupied slots in ascending request order
  const occupiedSlots = Array.from(nodesBySlot.keys()).sort((a, b) => a - b);
  const layout: LayoutMap = {};

  occupiedSlots.forEach((slot, tierIndex) => {
    const nodeIds = nodesBySlot.get(slot)!;
    // Sort node IDs deterministically within the tier
    nodeIds.sort((a, b) => a.localeCompare(b));

    const x = originX + tierIndex * (nodeWidth + tierGapX);
    const count = nodeIds.length;

    // Stack multiple instances vertically, vertically centered around originY
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

  return layout;
}
