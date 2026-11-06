/**
 * Graph configuration types.
 * Defines the static user architecture graph.
 * Fully serializable, strictly separated from runtime state.
 */

import type { ComponentType, AnyComponentConfig } from './components';

export interface GraphNode<TConfig extends AnyComponentConfig = AnyComponentConfig> {
  id: string;
  type: ComponentType;
  config: TConfig;
  label?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'request' | 'replication';
  isLookup?: boolean;
}

export interface GraphConfig {
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
