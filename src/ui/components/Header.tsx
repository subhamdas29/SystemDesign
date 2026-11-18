/**
 * Application Shell Navigation Header (R1 Specification).
 * Two-tier structure:
 * 1. Top Bar (Cream #F3EEE3, 80px): Logo, Tabs (Create, Problems, Presets, Interview), Action popovers (Folder, Share, Download, Profile).
 * 2. Second Bar (Near-black #0B0B0D, 54px): Inventory toggle, Builder/Attacker segmented pill, Action buttons, View tools (Eye, Hand, Layers).
 *    Shown on the Create tab only.
 */

import React, { useEffect } from 'react';
import {
  useGraphStore,
  selectCanUndo,
  selectCanRedo,
  selectGraph,
} from '@store';
import {
  useUiStore,
  selectAppMode,
  selectActiveNavTab,
  selectIsInventoryOpen,
  selectIsFocusMode,
  selectIsSharePopoverOpen,
  selectIsDownloadPopoverOpen,
  selectIsProfileDropdownOpen,
  selectIsLegacyMenuOpen,
  NavTab,
} from '@store';
import { useSimulationStore, selectActiveFailures, selectSimPlayStatus } from '@store';
import { useAttackStore } from '@store';
import logoWebp from '../../assets/LifeOfARequestLOGO.webp';

import { ComponentIcon } from './ComponentIcon';
import { SharePopover } from './SharePopover';
import { DownloadPopover } from './DownloadPopover';
import { ProfileDropdown } from './ProfileDropdown';
import { LegacyPanelsModal } from './LegacyPanelsModal';

export const Header: React.FC = () => {
  const canUndo = useGraphStore(selectCanUndo);
  const canRedo = useGraphStore(selectCanRedo);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const resetGraph = useGraphStore((s) => s.reset);
  const graph = useGraphStore(selectGraph);

  const mode = useUiStore(selectAppMode);
  const setMode = useUiStore((s) => s.setMode);
  const activeNavTab = useUiStore(selectActiveNavTab);
  const setActiveNavTab = useUiStore((s) => s.setActiveNavTab);
  const isInventoryOpen = useUiStore(selectIsInventoryOpen);
  const toggleInventory = useUiStore((s) => s.toggleInventory);
  const isFocusMode = useUiStore(selectIsFocusMode);
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode);

  const isSharePopoverOpen = useUiStore(selectIsSharePopoverOpen);
  const toggleSharePopover = useUiStore((s) => s.toggleSharePopover);
  const setSharePopoverOpen = useUiStore((s) => s.setSharePopoverOpen);

  const isDownloadPopoverOpen = useUiStore(selectIsDownloadPopoverOpen);
  const toggleDownloadPopover = useUiStore((s) => s.toggleDownloadPopover);
  const setDownloadPopoverOpen = useUiStore((s) => s.setDownloadPopoverOpen);

  const isProfileDropdownOpen = useUiStore(selectIsProfileDropdownOpen);
  const toggleProfileDropdown = useUiStore((s) => s.toggleProfileDropdown);
  const setProfileDropdownOpen = useUiStore((s) => s.setProfileDropdownOpen);

  const handleToggleShare = () => {
    if (!isSharePopoverOpen) {
      setDownloadPopoverOpen(false);
      setProfileDropdownOpen(false);
    }
    toggleSharePopover();
  };

  const handleToggleDownload = () => {
    if (!isDownloadPopoverOpen) {
      setSharePopoverOpen(false);
      setProfileDropdownOpen(false);
    }
    toggleDownloadPopover();
  };

  const handleToggleProfile = () => {
    if (!isProfileDropdownOpen) {
      setSharePopoverOpen(false);
      setDownloadPopoverOpen(false);
    }
    toggleProfileDropdown();
  };

  const handleSelectNavTab = (tab: NavTab) => {
    setActiveNavTab(tab);
    setSharePopoverOpen(false);
    setDownloadPopoverOpen(false);
    setProfileDropdownOpen(false);
    useUiStore.getState().setProjectLibraryOpen(false);
  };

  const isLegacyMenuOpen = useUiStore(selectIsLegacyMenuOpen);
  const setLegacyMenuOpen = useUiStore((s) => s.setLegacyMenuOpen);

  const toggleChaosPanel = useUiStore((s) => s.toggleChaosPanel);
  const toggleProjectLibrary = useUiStore((s) => s.toggleProjectLibrary);
  const toggleSettingsModal = useUiStore((s) => s.toggleSettingsModal);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);

  const activeFailures = useSimulationStore(selectActiveFailures);
  const playStatus = useSimulationStore(selectSimPlayStatus);
  const playSim = useSimulationStore((s) => s.play);
  const pauseSim = useSimulationStore((s) => s.pause);
  const stepSim = useSimulationStore((s) => s.step);
  const setSpeedSim = useSimulationStore((s) => s.setSpeed);

  // Global hotkeys (Ctrl+Z, Ctrl+Y, Space, S, R, 1, 2, 4, 8, ?, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (e.key === 'Escape') {
        if (isFocusMode) {
          toggleFocusMode();
          return;
        }
        if (isSharePopoverOpen) setSharePopoverOpen(false);
        if (isDownloadPopoverOpen) setDownloadPopoverOpen(false);
        if (isProfileDropdownOpen) setProfileDropdownOpen(false);
        if (isLegacyMenuOpen) setLegacyMenuOpen(false);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
        return;
      }

      if (isInput) return;

      if (e.key === ' ') {
        e.preventDefault();
        if (playStatus === 'running') pauseSim();
        else playSim(graph);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        stepSim(graph);
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        useSimulationStore.getState().reset(graph);
      } else if (['1', '2', '4', '8'].includes(e.key)) {
        setSpeedSim(Number(e.key) as any);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo,
    redo,
    playStatus,
    playSim,
    pauseSim,
    stepSim,
    graph,
    setSpeedSim,
    setShortcutsOpen,
    isFocusMode,
    toggleFocusMode,
    isSharePopoverOpen,
    setSharePopoverOpen,
    isDownloadPopoverOpen,
    setDownloadPopoverOpen,
    isProfileDropdownOpen,
    setProfileDropdownOpen,
    isLegacyMenuOpen,
    setLegacyMenuOpen,
  ]);

  const handleSetMode = (newMode: 'builder' | 'attacker') => {
    setMode(newMode);
    useAttackStore.getState().setAttackerMode(newMode === 'attacker');
  };

  const isAttacker = mode === 'attacker';

  return (
    <div className="w-full flex flex-col shrink-0 select-none z-20">
      {/* 1. TOP BAR (Cream #F3EEE3, height 80px) */}
      <header
        className="h-20 w-full px-3 md:px-6 flex items-center justify-between border-b border-[#E2DDD1]"
        style={{ backgroundColor: '#F3EEE3' }}
        aria-label="Application Top Navigation"
      >
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <img
            src={logoWebp}
            alt="Life of a Request"
            className="h-8 md:h-9 w-auto object-contain cursor-pointer"
            draggable={false}
            onClick={() => setActiveNavTab('create')}
          />
        </div>

        {/* Center: Navigation Tabs (Roboto Mono, Bold, 16px) */}
        <nav
          className="h-full flex items-center gap-3 sm:gap-4 md:gap-6 lg:gap-8 font-mono text-[13px] sm:text-[14px] md:text-[16px] font-bold tracking-tight"
          aria-label="Primary Navigation"
        >
          {(['create', 'problems', 'presets', 'interview'] as NavTab[]).map((tab) => {
            const isActive = activeNavTab === tab;
            const label = tab.charAt(0).toUpperCase() + tab.slice(1);
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleSelectNavTab(tab)}
                className={`relative h-full flex items-center px-1 transition-colors cursor-pointer ${
                  isActive ? 'text-[#D9541E]' : 'text-[#111111] hover:opacity-75'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#D9541E]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Action Buttons (Folder, Share, Download, Profile) */}
        <div className="flex items-center gap-4 text-[#111111]">
          {/* Saved Designs Drawer */}
          <button
            type="button"
            onClick={toggleProjectLibrary}
            title="Saved Designs & Projects"
            aria-label="Saved Designs & Projects"
            className="hover:opacity-70 transition-opacity p-1.5 rounded cursor-pointer"
          >
            <ComponentIcon type="folder" isAction size={18} color="#111111" />
          </button>

          {/* Share Link Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={handleToggleShare}
              title="Share Design Link"
              aria-label="Share Design Link"
              aria-expanded={isSharePopoverOpen}
              className="hover:opacity-70 transition-opacity p-1.5 rounded cursor-pointer"
            >
              <ComponentIcon type="share" isAction size={18} color="#111111" />
            </button>
            <SharePopover
              isOpen={isSharePopoverOpen}
              onClose={() => setSharePopoverOpen(false)}
            />
          </div>

          {/* Download Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={handleToggleDownload}
              title="Export Architecture Design"
              aria-label="Export Architecture Design"
              aria-expanded={isDownloadPopoverOpen}
              className="hover:opacity-70 transition-opacity p-1.5 rounded cursor-pointer"
            >
              <ComponentIcon type="download" isAction size={18} color="#111111" />
            </button>
            <DownloadPopover
              isOpen={isDownloadPopoverOpen}
              onClose={() => setDownloadPopoverOpen(false)}
            />
          </div>

          {/* Profile Dropdown (with Caret) */}
          <div className="relative">
            <button
              type="button"
              onClick={handleToggleProfile}
              title="Profile, Handbook & Settings"
              aria-label="Profile and Handbook Menu"
              aria-expanded={isProfileDropdownOpen}
              className="flex items-center gap-0.5 hover:opacity-70 transition-opacity p-1.5 rounded cursor-pointer"
            >
              <ComponentIcon type="user" isAction size={18} color="#111111" />
              <ComponentIcon type="caret_down" isAction size={14} color="#111111" />
            </button>
            <ProfileDropdown
              isOpen={isProfileDropdownOpen}
              onClose={() => setProfileDropdownOpen(false)}
              onOpenLegacyPanels={() => setLegacyMenuOpen(true)}
            />
          </div>
        </div>
      </header>

      {/* 2. SECOND BAR / SUBHEADER TOOLBAR (Create Tab Only, Near-black #0B0B0D, height 54px) */}
      {activeNavTab === 'create' && (
        <div
          className="h-[54px] w-full px-6 flex items-center justify-between"
          style={{ backgroundColor: '#0B0B0D' }}
          aria-label="Workspace Toolbar"
        >
          {/* Left Section: Menu Toggle, Mode Toggle Pill, Action Buttons */}
          <div className="flex items-center gap-6">
            {/* Inventory Toggle */}
            <button
              type="button"
              onClick={toggleInventory}
              title={isInventoryOpen ? 'Close Component Inventory' : 'Open Component Inventory'}
              aria-label="Toggle Component Inventory"
              className={`p-1.5 rounded transition-all cursor-pointer ${
                isInventoryOpen ? 'opacity-100 text-[#D9541E]' : 'opacity-80 text-white hover:opacity-100'
              }`}
            >
              <ComponentIcon
                type="inventory"
                isAction
                size={18}
                color={isInventoryOpen ? '#D9541E' : '#FFFFFF'}
              />
            </button>

            {/* Segmented Control [ Builder | Attacker ] */}
            <div className="inline-flex items-center bg-[#2C2C2C] p-0.5 rounded-lg border border-[#3A3A3E]">
              <button
                type="button"
                onClick={() => handleSetMode('builder')}
                className={`h-7 px-3 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                  mode === 'builder'
                    ? 'bg-[#656565] text-white font-bold shadow-sm'
                    : 'text-white/80 hover:text-white font-medium'
                }`}
              >
                Builder
              </button>

              <button
                type="button"
                onClick={() => handleSetMode('attacker')}
                className={`h-7 px-3 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                  mode === 'attacker'
                    ? 'bg-[#F3EEE3] text-[#D9541E] font-bold shadow-sm'
                    : 'text-white/80 hover:text-[#D9541E] font-medium'
                }`}
              >
                Attacker
              </button>
            </div>

            {/* Action Text Buttons: Chaos, Undo, Redo, Reset, Settings (Roboto Mono, Medium, 11px) */}
            <div className="flex items-center gap-5 font-mono text-[11px] font-medium text-white">
              <button
                type="button"
                onClick={toggleChaosPanel}
                className={`hover:opacity-80 transition-opacity cursor-pointer ${
                  activeFailures.length > 0 || isAttacker ? 'text-[#D9541E] font-bold' : ''
                }`}
                title="Chaos Engineering & Injected Outages"
              >
                Chaos{activeFailures.length > 0 ? ` (${activeFailures.length})` : ''}
              </button>

              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className={`hover:opacity-80 transition-opacity cursor-pointer ${
                  canUndo ? 'text-white' : 'text-[#52525B] cursor-not-allowed'
                }`}
                title="Undo (Ctrl+Z)"
              >
                Undo
              </button>

              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className={`hover:opacity-80 transition-opacity cursor-pointer ${
                  canRedo ? 'text-white' : 'text-[#52525B] cursor-not-allowed'
                }`}
                title="Redo (Ctrl+Y)"
              >
                Redo
              </button>

              <button
                type="button"
                onClick={() => resetGraph()}
                className="hover:opacity-80 transition-opacity text-white cursor-pointer"
                title="Reset Architecture Graph to Initial State"
              >
                Reset
              </button>

              <button
                type="button"
                onClick={toggleSettingsModal}
                className="hover:opacity-80 transition-opacity text-white cursor-pointer"
                title="Simulation & UI Configuration"
              >
                Settings
              </button>
            </div>
          </div>

          {/* Right Section: View Tools (Eye, Hand, Layers) */}
          <div className="flex items-center gap-5 text-white">
            {/* Eye Icon (Hides all chrome / Focus mode) */}
            <button
              type="button"
              onClick={toggleFocusMode}
              title="Focus Mode: Hide All UI Chrome (Esc to restore)"
              aria-label="Focus Mode: Hide All Chrome"
              className="p-1 hover:opacity-80 transition-opacity cursor-pointer text-white"
            >
              <ComponentIcon type="eye" isAction size={18} color="#FFFFFF" />
            </button>

            {/* Hand Tool (Disabled with tooltip) */}
            <button
              type="button"
              disabled
              title="Coming in the next step"
              aria-label="Hand Mode (Coming in the next step)"
              className="p-1 opacity-40 cursor-not-allowed text-white"
            >
              <ComponentIcon type="hand" isAction size={18} color="#FFFFFF" />
            </button>

            {/* Layers Tool (Disabled with tooltip) */}
            <button
              type="button"
              disabled
              title="Coming in the next step"
              aria-label="Layers Mode (Coming in the next step)"
              className="p-1 opacity-40 cursor-not-allowed text-white"
            >
              <ComponentIcon type="layers" isAction size={18} color="#FFFFFF" />
            </button>
          </div>
        </div>
      )}

      {/* Legacy Panels Directory Modal */}
      <LegacyPanelsModal
        isOpen={isLegacyMenuOpen}
        onClose={() => setLegacyMenuOpen(false)}
      />
    </div>
  );
};

export default Header;
