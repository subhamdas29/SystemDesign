/**
 * UI interaction and panel store.
 * Manages active selection, panel visibility, swap dragging state, chaos panel, and presets.
 */

import { create } from 'zustand';

export type AppMode = 'builder' | 'attacker';

export interface UiStoreState {
  mode: AppMode;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isDashboardOpen: boolean;
  isInventoryOpen: boolean;
  isInspectorOpen: boolean;
  isChaosPanelOpen: boolean;
  isPresetModalOpen: boolean;
  draggingSwapNodeId: string | null;
  hint: string | null;

  // Actions
  setMode: (mode: AppMode) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  toggleDashboard: () => void;
  setDashboardOpen: (isOpen: boolean) => void;
  toggleInventory: () => void;
  setInventoryOpen: (isOpen: boolean) => void;
  toggleInspector: () => void;
  setInspectorOpen: (isOpen: boolean) => void;
  openInspector: () => void;
  toggleChaosPanel: () => void;
  setChaosPanelOpen: (isOpen: boolean) => void;
  togglePresetModal: () => void;
  setPresetModalOpen: (isOpen: boolean) => void;
  setDraggingSwapNodeId: (nodeId: string | null) => void;
  setHint: (hint: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  mode: 'builder',
  selectedNodeId: null,
  selectedEdgeId: null,
  isDashboardOpen: false,
  isInventoryOpen: true,
  isInspectorOpen: true,
  isChaosPanelOpen: false,
  isPresetModalOpen: false,
  draggingSwapNodeId: null,
  hint: null,

  setMode: (mode: AppMode) => set({ mode }),
  selectNode: (nodeId: string | null) =>
    set((state) => ({
      selectedNodeId: nodeId,
      selectedEdgeId: nodeId !== null ? null : state.selectedEdgeId,
      // Automatically reveal inspector when a node is selected
      isInspectorOpen: nodeId !== null ? true : state.isInspectorOpen,
    })),
  selectEdge: (edgeId: string | null) =>
    set((state) => ({
      selectedEdgeId: edgeId,
      selectedNodeId: edgeId !== null ? null : state.selectedNodeId,
      isInspectorOpen: edgeId !== null ? true : state.isInspectorOpen,
    })),
  toggleDashboard: () => set((state) => ({ isDashboardOpen: !state.isDashboardOpen })),
  setDashboardOpen: (isOpen: boolean) => set({ isDashboardOpen: isOpen }),
  toggleInventory: () => set((state) => ({ isInventoryOpen: !state.isInventoryOpen })),
  setInventoryOpen: (isOpen: boolean) => set({ isInventoryOpen: isOpen }),
  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
  setInspectorOpen: (isOpen: boolean) => set({ isInspectorOpen: isOpen }),
  openInspector: () => set({ isInspectorOpen: true }),
  toggleChaosPanel: () => set((state) => ({ isChaosPanelOpen: !state.isChaosPanelOpen })),
  setChaosPanelOpen: (isOpen: boolean) => set({ isChaosPanelOpen: isOpen }),
  togglePresetModal: () => set((state) => ({ isPresetModalOpen: !state.isPresetModalOpen })),
  setPresetModalOpen: (isOpen: boolean) => set({ isPresetModalOpen: isOpen }),
  setDraggingSwapNodeId: (nodeId: string | null) => set({ draggingSwapNodeId: nodeId }),
  setHint: (hint: string | null) => set({ hint }),
}));

// Selectors
export const selectAppMode = (s: UiStoreState) => s.mode;
export const selectSelectedNodeId = (s: UiStoreState) => s.selectedNodeId;
export const selectSelectedEdgeId = (s: UiStoreState) => s.selectedEdgeId;
export const selectIsDashboardOpen = (s: UiStoreState) => s.isDashboardOpen;
export const selectIsInventoryOpen = (s: UiStoreState) => s.isInventoryOpen;
export const selectIsInspectorOpen = (s: UiStoreState) => s.isInspectorOpen;
export const selectIsChaosPanelOpen = (s: UiStoreState) => s.isChaosPanelOpen;
export const selectIsPresetModalOpen = (s: UiStoreState) => s.isPresetModalOpen;
export const selectDraggingSwapNodeId = (s: UiStoreState) => s.draggingSwapNodeId;
export const selectHint = (s: UiStoreState) => s.hint;
