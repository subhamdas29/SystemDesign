/**
 * Graph store managing the static architecture configuration.
 * Handles undo, redo, reset, debounced config updates, presets, and bulk actions.
 * Strictly maintains snapshots of GraphConfig.
 */

import { create } from 'zustand';
import {
  GraphConfig,
  ComponentType,
  AnyComponentConfig,
  getDefaultConfig,
} from '../types';
import {
  createStarterGraph,
  canAdd,
  addComponent,
  canRemove,
  removeComponent,
  canSwap,
  swapComponent,
  validateGraph,
  ValidationResult,
} from '../builder';
import { COMPONENT_PRESETS, PresetTier } from '../engine/components/presets';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let graphSnapshotBeforeBatch: GraphConfig | null = null;

export interface GraphStoreState {
  graph: GraphConfig;
  history: GraphConfig[];
  future: GraphConfig[];
  validation: ValidationResult;

  // Actions
  addNode: (type: ComponentType) => { success: boolean; reason?: string };
  removeNode: (nodeId: string) => { success: boolean; reason?: string };
  swapNode: (nodeId: string, targetType: ComponentType) => { success: boolean; reason?: string };
  updateNodeConfig: (
    nodeId: string,
    partialConfig: Partial<AnyComponentConfig>,
    debounce?: boolean
  ) => void;
  applyPreset: (nodeId: string, preset: PresetTier) => void;
  resetNodeConfig: (nodeId: string) => void;
  applyConfigToAll: (type: ComponentType, config: AnyComponentConfig) => void;
  flushPendingHistory: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

const initialGraph = createStarterGraph();

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  graph: initialGraph,
  history: [],
  future: [],
  validation: validateGraph(initialGraph),

  flushPendingHistory: () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (graphSnapshotBeforeBatch) {
      const { history } = get();
      set({
        history: [...history, graphSnapshotBeforeBatch],
        future: [],
      });
      graphSnapshotBeforeBatch = null;
    }
  },

  addNode: (type: ComponentType) => {
    get().flushPendingHistory();
    const { graph, history } = get();
    const check = canAdd(graph, type);
    if (!check.allowed) {
      return { success: false, reason: check.reason };
    }

    const nextGraph = addComponent(graph, type);
    set({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });
    return { success: true };
  },

  removeNode: (nodeId: string) => {
    get().flushPendingHistory();
    const { graph, history } = get();
    const check = canRemove(graph, nodeId);
    if (!check.allowed) {
      return { success: false, reason: check.reason };
    }

    const nextGraph = removeComponent(graph, nodeId);
    set({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });
    return { success: true };
  },

  swapNode: (nodeId: string, targetType: ComponentType) => {
    get().flushPendingHistory();
    const { graph, history } = get();
    const check = canSwap(graph, nodeId, targetType);
    if (!check.allowed) {
      return { success: false, reason: check.reason };
    }

    const nextGraph = swapComponent(graph, nodeId, targetType);
    set({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });
    return { success: true };
  },

  updateNodeConfig: (
    nodeId: string,
    partialConfig: Partial<AnyComponentConfig>,
    debounce = false
  ) => {
    const { graph, history } = get();

    const nextNodes = graph.nodes.map((node) => {
      if (node.id === nodeId) {
        return {
          ...node,
          config: {
            ...node.config,
            ...partialConfig,
          } as AnyComponentConfig,
        };
      }
      return node;
    });

    const nextGraph: GraphConfig = {
      ...graph,
      version: graph.version + 1,
      nodes: nextNodes,
    };

    if (debounce) {
      // Record starting snapshot once at the start of continuous editing
      if (!graphSnapshotBeforeBatch) {
        graphSnapshotBeforeBatch = graph;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      set({
        graph: nextGraph,
        validation: validateGraph(nextGraph),
      });

      debounceTimer = setTimeout(() => {
        if (graphSnapshotBeforeBatch) {
          const currentHist = get().history;
          set({
            history: [...currentHist, graphSnapshotBeforeBatch],
            future: [],
          });
          graphSnapshotBeforeBatch = null;
        }
        debounceTimer = null;
      }, 300);
    } else {
      get().flushPendingHistory();
      set({
        graph: nextGraph,
        history: [...history, graph],
        future: [],
        validation: validateGraph(nextGraph),
      });
    }
  },

  applyPreset: (nodeId: string, preset: PresetTier) => {
    get().flushPendingHistory();
    const { graph, history } = get();
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const presetConfig = COMPONENT_PRESETS[node.type]?.[preset];
    if (!presetConfig) return;

    const nextNodes = graph.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            config: JSON.parse(JSON.stringify(presetConfig)) as AnyComponentConfig,
          }
        : n
    );

    const nextGraph: GraphConfig = {
      ...graph,
      version: graph.version + 1,
      nodes: nextNodes,
    };

    set({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });
  },

  resetNodeConfig: (nodeId: string) => {
    get().flushPendingHistory();
    const { graph, history } = get();
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const defaults = getDefaultConfig(node.type);
    const nextNodes = graph.nodes.map((n) =>
      n.id === nodeId ? { ...n, config: defaults } : n
    );

    const nextGraph: GraphConfig = {
      ...graph,
      version: graph.version + 1,
      nodes: nextNodes,
    };

    set({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });
  },

  applyConfigToAll: (type: ComponentType, config: AnyComponentConfig) => {
    get().flushPendingHistory();
    const { graph, history } = get();
    const nextNodes = graph.nodes.map((node) => {
      if (node.type === type) {
        return {
          ...node,
          config: JSON.parse(JSON.stringify(config)) as AnyComponentConfig,
        };
      }
      return node;
    });

    const nextGraph: GraphConfig = {
      ...graph,
      version: graph.version + 1,
      nodes: nextNodes,
    };

    set({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });
  },

  undo: () => {
    get().flushPendingHistory();
    const { history, graph, future } = get();
    if (history.length === 0) return;

    const previousGraph = history[history.length - 1];
    if (!previousGraph) return;
    const nextHistory = history.slice(0, -1);

    set({
      graph: previousGraph,
      history: nextHistory,
      future: [graph, ...future],
      validation: validateGraph(previousGraph),
    });
  },

  redo: () => {
    get().flushPendingHistory();
    const { history, graph, future } = get();
    if (future.length === 0) return;

    const nextGraph = future[0];
    if (!nextGraph) return;
    const nextFuture = future.slice(1);

    set({
      graph: nextGraph,
      history: [...history, graph],
      future: nextFuture,
      validation: validateGraph(nextGraph),
    });
  },

  reset: () => {
    get().flushPendingHistory();
    const { graph, history } = get();
    const starter = createStarterGraph();
    set({
      graph: starter,
      history: [...history, graph],
      future: [],
      validation: validateGraph(starter),
    });
  },
}));

// Selectors
export const selectGraph = (state: GraphStoreState) => state.graph;
export const selectNodes = (state: GraphStoreState) => state.graph.nodes;
export const selectEdges = (state: GraphStoreState) => state.graph.edges;
export const selectCanUndo = (state: GraphStoreState) => state.history.length > 0;
export const selectCanRedo = (state: GraphStoreState) => state.future.length > 0;
export const selectValidation = (state: GraphStoreState) => state.validation;
