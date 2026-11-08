/**
 * Graph configuration types.
 * Defines the static user architecture graph.
 * Fully serializable, strictly separated from runtime state.
 */

import type { ComponentType, AnyComponentConfig } from './components';

export interface EdgeLatencyConfig {
  preset?: EdgePresetName;
  baseLatencyMs: number;
  jitterMs: number;
  packetLossPct: number;
}

export type EdgePresetName =
  | 'same-machine'
  | 'same-datacenter'
  | 'cross-zone'
  | 'cross-region'
  | 'public-internet';

export const EDGE_PRESETS: Record<EdgePresetName, EdgeLatencyConfig> = {
  'same-machine': { baseLatencyMs: 0.1, jitterMs: 0.05, packetLossPct: 0 },
  'same-datacenter': { baseLatencyMs: 0.5, jitterMs: 0.2, packetLossPct: 0 },
  'cross-zone': { baseLatencyMs: 2.0, jitterMs: 0.5, packetLossPct: 0.01 },
  'cross-region': { baseLatencyMs: 80.0, jitterMs: 15.0, packetLossPct: 0.1 },
  'public-internet': { baseLatencyMs: 40.0, jitterMs: 10.0, packetLossPct: 0.5 },
};

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'request' | 'async' | 'replication';
  isLookup?: boolean;
  latency?: EdgeLatencyConfig;
}

export interface GraphNode<TConfig extends AnyComponentConfig = AnyComponentConfig> {
  id: string;
  type: ComponentType;
  config: TConfig;
  label?: string;
}

export interface GraphConfig {
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
