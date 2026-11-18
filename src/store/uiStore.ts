/**
 * UI interaction and panel store.
 * Manages active selection, panel visibility, swap dragging state, chaos panel, and presets.
 */

import { create } from 'zustand';

export type AppMode = 'builder' | 'attacker';
export type NavTab = 'create' | 'problems' | 'presets' | 'interview';

export interface UiStoreState {
  mode: AppMode;
  activeNavTab: NavTab;
  isFocusMode: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isDashboardOpen: boolean;
  isInventoryOpen: boolean;
  isInspectorOpen: boolean;
  isChaosPanelOpen: boolean;
  isPresetModalOpen: boolean;
  isProjectLibraryOpen: boolean;
  isShareModalOpen: boolean;
  isSharePopoverOpen: boolean;
  isDownloadPopoverOpen: boolean;
  isProfileDropdownOpen: boolean;
  isLegacyMenuOpen: boolean;
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
  setActiveNavTab: (tab: NavTab) => void;
  setFocusMode: (isFocus: boolean) => void;
  toggleFocusMode: () => void;
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
  toggleSharePopover: () => void;
  setSharePopoverOpen: (isOpen: boolean) => void;
  toggleDownloadPopover: () => void;
  setDownloadPopoverOpen: (isOpen: boolean) => void;
  toggleProfileDropdown: () => void;
  setProfileDropdownOpen: (isOpen: boolean) => void;
  toggleLegacyMenu: () => void;
  setLegacyMenuOpen: (isOpen: boolean) => void;
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
  activeNavTab: 'create',
  isFocusMode: false,
  selectedNodeId: null,
  selectedEdgeId: null,
  isDashboardOpen: false,
  isInventoryOpen: false,
  isInspectorOpen: false,
  isChaosPanelOpen: false,
  isPresetModalOpen: false,
  isProjectLibraryOpen: false,
  isShareModalOpen: false,
  isSharePopoverOpen: false,
  isDownloadPopoverOpen: false,
  isProfileDropdownOpen: false,
  isLegacyMenuOpen: false,
  isExampleGalleryOpen: false,
  isSettingsModalOpen: false,
  isTourOpen: false,
  isShortcutsOpen: false,
  isGuideOpen: false,
  activeTutorialId: null,
  draggingSwapNodeId: null,
  hint: null,

  setMode: (mode: AppMode) => set({ mode }),
  setActiveNavTab: (activeNavTab: NavTab) => set({ activeNavTab }),
  setFocusMode: (isFocusMode: boolean) => set({ isFocusMode }),
  toggleFocusMode: () => set((state) => ({ isFocusMode: !state.isFocusMode })),
  toggleSharePopover: () => set((state) => ({ isSharePopoverOpen: !state.isSharePopoverOpen })),
  setSharePopoverOpen: (isOpen: boolean) => set({ isSharePopoverOpen: isOpen }),
  toggleDownloadPopover: () => set((state) => ({ isDownloadPopoverOpen: !state.isDownloadPopoverOpen })),
  setDownloadPopoverOpen: (isOpen: boolean) => set({ isDownloadPopoverOpen: isOpen }),
  toggleProfileDropdown: () => set((state) => ({ isProfileDropdownOpen: !state.isProfileDropdownOpen })),
  setProfileDropdownOpen: (isOpen: boolean) => set({ isProfileDropdownOpen: isOpen }),
  toggleLegacyMenu: () => set((state) => ({ isLegacyMenuOpen: !state.isLegacyMenuOpen })),
  setLegacyMenuOpen: (isOpen: boolean) => set({ isLegacyMenuOpen: isOpen }),
  selectNode: (nodeId: string | null) =>
    set((state) => {
      const isSelected = nodeId !== null;
      const isNarrow = typeof window !== 'undefined' ? window.innerWidth <= 1440 : false;
      return {
        selectedNodeId: nodeId,
        selectedEdgeId: isSelected ? null : state.selectedEdgeId,
        isInspectorOpen: isSelected,
        isInventoryOpen: isSelected && isNarrow ? false : state.isInventoryOpen,
      };
    }),
  selectEdge: (edgeId: string | null) =>
    set((state) => {
      const isSelected = edgeId !== null;
      const isNarrow = typeof window !== 'undefined' ? window.innerWidth <= 1440 : false;
      return {
        selectedEdgeId: edgeId,
        selectedNodeId: isSelected ? null : state.selectedNodeId,
        isInspectorOpen: isSelected,
        isInventoryOpen: isSelected && isNarrow ? false : state.isInventoryOpen,
      };
    }),
  toggleDashboard: () => set((state) => ({ isDashboardOpen: !state.isDashboardOpen })),
  setDashboardOpen: (isOpen: boolean) => set({ isDashboardOpen: isOpen }),
  toggleInventory: () =>
    set((state) => {
      const nextOpen = !state.isInventoryOpen;
      const isNarrow = typeof window !== 'undefined' ? window.innerWidth <= 1440 : false;
      const shouldCloseInspector = nextOpen && isNarrow;
      return {
        isInventoryOpen: nextOpen,
        isInspectorOpen: shouldCloseInspector ? false : state.isInspectorOpen,
        selectedNodeId: shouldCloseInspector ? null : state.selectedNodeId,
        selectedEdgeId: shouldCloseInspector ? null : state.selectedEdgeId,
      };
    }),
  setInventoryOpen: (isOpen: boolean) =>
    set((state) => {
      const isNarrow = typeof window !== 'undefined' ? window.innerWidth <= 1440 : false;
      const shouldCloseInspector = isOpen && isNarrow;
      return {
        isInventoryOpen: isOpen,
        isInspectorOpen: shouldCloseInspector ? false : state.isInspectorOpen,
        selectedNodeId: shouldCloseInspector ? null : state.selectedNodeId,
        selectedEdgeId: shouldCloseInspector ? null : state.selectedEdgeId,
      };
    }),
  toggleInspector: () =>
    set((state) => {
      const nextOpen = !state.isInspectorOpen;
      return {
        isInspectorOpen: nextOpen,
        selectedNodeId: nextOpen ? state.selectedNodeId : null,
        selectedEdgeId: nextOpen ? state.selectedEdgeId : null,
      };
    }),
  setInspectorOpen: (isOpen: boolean) =>
    set((state) => ({
      isInspectorOpen: isOpen,
      selectedNodeId: isOpen ? state.selectedNodeId : null,
      selectedEdgeId: isOpen ? state.selectedEdgeId : null,
    })),
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
export const selectActiveNavTab = (s: UiStoreState) => s.activeNavTab;
export const selectIsFocusMode = (s: UiStoreState) => s.isFocusMode;
export const selectIsSharePopoverOpen = (s: UiStoreState) => s.isSharePopoverOpen;
export const selectIsDownloadPopoverOpen = (s: UiStoreState) => s.isDownloadPopoverOpen;
export const selectIsProfileDropdownOpen = (s: UiStoreState) => s.isProfileDropdownOpen;
export const selectIsLegacyMenuOpen = (s: UiStoreState) => s.isLegacyMenuOpen;
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
