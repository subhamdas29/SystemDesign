/**
 * UI interaction and panel store.
 * Manages active selection, panel visibility, swap dragging state, and gentle hints.
 */

import { create } from 'zustand';

export type AppMode = 'builder' | 'attacker';

export interface UiStoreState {
  mode: AppMode;
  selectedNodeId: string | null;
  isDashboardOpen: boolean;
  isInventoryOpen: boolean;
  isInspectorOpen: boolean;
  draggingSwapNodeId: string | null;
  hint: string | null;

  // Actions
  setMode: (mode: AppMode) => void;
  selectNode: (nodeId: string | null) => void;
  toggleDashboard: () => void;
  setDashboardOpen: (isOpen: boolean) => void;
  toggleInventory: () => void;
  setInventoryOpen: (isOpen: boolean) => void;
  toggleInspector: () => void;
  setInspectorOpen: (isOpen: boolean) => void;
  openInspector: () => void;
  setDraggingSwapNodeId: (nodeId: string | null) => void;
  setHint: (hint: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  mode: 'builder',
  selectedNodeId: null,
  isDashboardOpen: false,
  isInventoryOpen: true,
  isInspectorOpen: true,
  draggingSwapNodeId: null,
  hint: null,

  setMode: (mode: AppMode) => set({ mode }),
  selectNode: (nodeId: string | null) =>
    set((state) => ({
      selectedNodeId: nodeId,
      // Automatically reveal inspector when a node is selected
      isInspectorOpen: nodeId !== null ? true : state.isInspectorOpen,
    })),
  toggleDashboard: () => set((state) => ({ isDashboardOpen: !state.isDashboardOpen })),
  setDashboardOpen: (isOpen: boolean) => set({ isDashboardOpen: isOpen }),
  toggleInventory: () => set((state) => ({ isInventoryOpen: !state.isInventoryOpen })),
  setInventoryOpen: (isOpen: boolean) => set({ isInventoryOpen: isOpen }),
  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
  setInspectorOpen: (isOpen: boolean) => set({ isInspectorOpen: isOpen }),
  openInspector: () => set({ isInspectorOpen: true }),
  setDraggingSwapNodeId: (nodeId: string | null) => set({ draggingSwapNodeId: nodeId }),
  setHint: (hint: string | null) => set({ hint }),
}));

// Selectors
export const selectAppMode = (state: UiStoreState) => state.mode;
export const selectSelectedNodeId = (state: UiStoreState) => state.selectedNodeId;
export const selectIsDashboardOpen = (state: UiStoreState) => state.isDashboardOpen;
export const selectIsInventoryOpen = (state: UiStoreState) => state.isInventoryOpen;
export const selectIsInspectorOpen = (state: UiStoreState) => state.isInspectorOpen;
export const selectDraggingSwapNodeId = (state: UiStoreState) => state.draggingSwapNodeId;
export const selectHint = (state: UiStoreState) => state.hint;
