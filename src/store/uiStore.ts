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
  isProjectLibraryOpen: boolean;
  isShareModalOpen: boolean;
  isExampleGalleryOpen: boolean;
  isSettingsModalOpen: boolean;
  isTourOpen: boolean;
  isShortcutsOpen: boolean;
  isGuideOpen: boolean;
  activeTutorialId: string | null;
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
  toggleProjectLibrary: () => void;
  setProjectLibraryOpen: (isOpen: boolean) => void;
  toggleShareModal: () => void;
  setShareModalOpen: (isOpen: boolean) => void;
  toggleExampleGallery: () => void;
  setExampleGalleryOpen: (isOpen: boolean) => void;
  toggleSettingsModal: () => void;
  setSettingsModalOpen: (isOpen: boolean) => void;
  toggleTour: () => void;
  setTourOpen: (isOpen: boolean) => void;
  toggleShortcuts: () => void;
  setShortcutsOpen: (isOpen: boolean) => void;
  toggleGuide: () => void;
  setGuideOpen: (isOpen: boolean) => void;
  startTutorial: (tutorialId: string) => void;
  exitTutorial: () => void;
  setDraggingSwapNodeId: (nodeId: string | null) => void;
  setHint: (hint: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  mode: 'builder',
  selectedNodeId: null,
  selectedEdgeId: null,
  isDashboardOpen: false,
  isInventoryOpen: false,
  isInspectorOpen: false,
  isChaosPanelOpen: false,
  isPresetModalOpen: false,
  isProjectLibraryOpen: false,
  isShareModalOpen: false,
  isExampleGalleryOpen: false,
  isSettingsModalOpen: false,
  isTourOpen: false,
  isShortcutsOpen: false,
  isGuideOpen: false,
  activeTutorialId: null,
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
  toggleProjectLibrary: () => set((state) => ({ isProjectLibraryOpen: !state.isProjectLibraryOpen })),
  setProjectLibraryOpen: (isOpen: boolean) => set({ isProjectLibraryOpen: isOpen }),
  toggleShareModal: () => set((state) => ({ isShareModalOpen: !state.isShareModalOpen })),
  setShareModalOpen: (isOpen: boolean) => set({ isShareModalOpen: isOpen }),
  toggleExampleGallery: () => set((state) => ({ isExampleGalleryOpen: !state.isExampleGalleryOpen })),
  setExampleGalleryOpen: (isOpen: boolean) => set({ isExampleGalleryOpen: isOpen }),
  toggleSettingsModal: () => set((state) => ({ isSettingsModalOpen: !state.isSettingsModalOpen })),
  setSettingsModalOpen: (isOpen: boolean) => set({ isSettingsModalOpen: isOpen }),
  toggleTour: () => set((state) => ({ isTourOpen: !state.isTourOpen })),
  setTourOpen: (isOpen: boolean) => set({ isTourOpen: isOpen }),
  toggleShortcuts: () => set((state) => ({ isShortcutsOpen: !state.isShortcutsOpen })),
  setShortcutsOpen: (isOpen: boolean) => set({ isShortcutsOpen: isOpen }),
  toggleGuide: () => set((state) => ({ isGuideOpen: !state.isGuideOpen })),
  setGuideOpen: (isOpen: boolean) => set({ isGuideOpen: isOpen }),
  startTutorial: (tutorialId: string) => set({ activeTutorialId: tutorialId }),
  exitTutorial: () => set({ activeTutorialId: null }),
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
export const selectIsProjectLibraryOpen = (s: UiStoreState) => s.isProjectLibraryOpen;
export const selectIsShareModalOpen = (s: UiStoreState) => s.isShareModalOpen;
export const selectIsExampleGalleryOpen = (s: UiStoreState) => s.isExampleGalleryOpen;
export const selectIsSettingsModalOpen = (s: UiStoreState) => s.isSettingsModalOpen;
export const selectIsTourOpen = (s: UiStoreState) => s.isTourOpen;
export const selectIsShortcutsOpen = (s: UiStoreState) => s.isShortcutsOpen;
export const selectIsGuideOpen = (s: UiStoreState) => s.isGuideOpen;
export const selectActiveTutorialId = (s: UiStoreState) => s.activeTutorialId;
export const selectDraggingSwapNodeId = (s: UiStoreState) => s.draggingSwapNodeId;
export const selectHint = (s: UiStoreState) => s.hint;
