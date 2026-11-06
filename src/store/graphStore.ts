/**
 * Graph store managing the static architecture configuration.
 * Handles undo, redo, reset, and placement modifications.
 * Uses snapshots of GraphConfig only (pure serializable state).
 */

import { create } from 'zustand';
import {
  GraphConfig,
  ComponentType,
  AnyComponentConfig,
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

export interface GraphStoreState {
  graph: GraphConfig;
  history: GraphConfig[];
  future: GraphConfig[];
  validation: ValidationResult;

  // Actions
  addNode: (type: ComponentType) => { success: boolean; reason?: string };
  removeNode: (nodeId: string) => { success: boolean; reason?: string };
  swapNode: (nodeId: string, targetType: ComponentType) => { success: boolean; reason?: string };
  updateNodeConfig: (nodeId: string, partialConfig: Partial<AnyComponentConfig>) => void;
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

  addNode: (type: ComponentType) => {
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

  updateNodeConfig: (nodeId: string, partialConfig: Partial<AnyComponentConfig>) => {
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

    set({
      graph: nextGraph,
      history: [...history, graph],
      future: [],
      validation: validateGraph(nextGraph),
    });
  },

  undo: () => {
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
