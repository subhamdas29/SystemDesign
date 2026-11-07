/**
 * Type definitions for Static Capacity Analysis and Runtime Bottleneck Detection.
 * Pure data structures, fully serializable across worker boundaries.
 */

import { ComponentType } from '../../types';

export interface TrafficMix {
  readRatio?: number; // 0 to 1, defaults to 0.8
}

export interface ComponentCapacityResult {
  nodeId: string;
  type: ComponentType;
  effectiveCapacityRps: number;
  loadShare: number; // Fraction of client request volume hitting this component (0 to 1)
  maxSustainableClientRps: number;
  limitingFactor: string;
}

export interface StaticCapacityAnalysis {
  sustainableRps: number;
  bottleneckNodeId: string;
  bottleneckType: ComponentType;
  explanation: string;
  suggestedFixes: ComponentType[];
  componentBreakdown: Record<string, ComponentCapacityResult>;
}

export interface RuntimeBottleneck {
  nodeId: string;
  type: ComponentType;
  utilization: number;
  queueDepth: number;
  rejectionRate: number;
  reason: string;
}
