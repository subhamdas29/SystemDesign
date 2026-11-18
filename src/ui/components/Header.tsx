import React, { useEffect, useState, useRef } from 'react';
import {
  useGraphStore,
  selectCanUndo,
  selectCanRedo,
  selectGraph,
} from '@store';
import { useUiStore, selectAppMode, selectIsInventoryOpen, selectIsInspectorOpen } from '@store';
import { useSimulationStore, selectActiveFailures, selectSimPlayStatus } from '@store';
import { useAttackStore } from '@store';
import logoWebp from '../../assets/LifeOfARequestLOGO.webp';

import folderSvg from '../../assets/icons/Folder.svg?raw';
import shareSvg from '../../assets/icons/share.svg?raw';
import downloadSvg from '../../assets/icons/download.svg?raw';
import userSvg from '../../assets/icons/User.svg?raw';
import arrowDropDownSvg from '../../assets/icons/arrow_drop_down.svg?raw';
import inventorySvg from '../../assets/icons/inventory.svg?raw';
import eyeSvg from '../../assets/icons/eye.svg?raw';
import handSvg from '../../assets/icons/hand.svg?raw';
import layersSvg from '../../assets/icons/Layers.svg?raw';

export type LayerType = 'Main' | 'Inside Server' | 'DNS Resolution' | 'TCP/TLS';

export const Header: React.FC = () => {
  const canUndo = useGraphStore(selectCanUndo);
  const canRedo = useGraphStore(selectCanRedo);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const reset = useGraphStore((s) => s.reset);
  const graph = useGraphStore(selectGraph);

  const mode = useUiStore(selectAppMode);
  const setMode = useUiStore((s) => s.setMode);
  const isInventoryOpen = useUiStore(selectIsInventoryOpen);
  const toggleInventory = useUiStore((s) => s.toggleInventory);
  const isInspectorOpen = useUiStore(selectIsInspectorOpen);
  const toggleInspector = useUiStore((s) => s.toggleInspector);

  const togglePresetModal = useUiStore((s) => s.togglePresetModal);
  const toggleChaosPanel = useUiStore((s) => s.toggleChaosPanel);
  const toggleProjectLibrary = useUiStore((s) => s.toggleProjectLibrary);
  const toggleShareModal = useUiStore((s) => s.toggleShareModal);
  const toggleSettingsModal = useUiStore((s) => s.toggleSettingsModal);
  const setGuideOpen = useUiStore((s) => s.setGuideOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);

  const activeFailures = useSimulationStore(selectActiveFailures);
  const playStatus = useSimulationStore(selectSimPlayStatus);
  const playSim = useSimulationStore((s) => s.play);
  const pauseSim = useSimulationStore((s) => s.pause);
  const stepSim = useSimulationStore((s) => s.step);
  const setSpeedSim = useSimulationStore((s) => s.setSpeed);

  // Layer State
  const [activeLayer, setActiveLayer] = useState<LayerType>('Main');
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeNavTab, setActiveNavTab] = useState<'Create' | 'Problems' | 'Presets' | 'Interview'>('Create');

  const layerMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (layerMenuRef.current && !layerMenuRef.current.contains(e.target as Node)) {
        setIsLayerMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcuts (Ctrl+Z, Ctrl+Y, Space, S, R, 1, 2, 4, 8, ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

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
  }, [undo, redo, playStatus, playSim, pauseSim, stepSim, graph, setSpeedSim, setShortcutsOpen]);

  const handleSetMode = (newMode: 'builder' | 'attacker') => {
    setMode(newMode);
    useAttackStore.getState().setAttackerMode(newMode === 'attacker');
  };

  const handleDownloadProject = () => {
    const jsonStr = JSON.stringify(graph, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `life-of-a-request-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col shrink-0 select-none z-20">
      {/* 1. TOP BAR (Cream #F3EEE3, height 80px) */}
      <header
        className="h-20 w-full px-6 flex items-center justify-between border-b border-[#E2DDD1]"
        style={{ backgroundColor: '#F3EEE3' }}
      >
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-3">
          <img
            src={logoWebp}
            alt="Life of a Request"
            className="h-9 w-auto object-contain"
            draggable={false}
          />
        </div>

        {/* Center: Navigation Tabs (Roboto Mono, Bold, 16px) */}
        <nav className="h-full flex items-center gap-8 font-mono text-[16px] font-bold tracking-tight">
          {/* Create Tab (Active) */}
          <button
            type="button"
            onClick={() => setActiveNavTab('Create')}
            className={`relative h-full flex items-center px-1 transition-colors ${
              activeNavTab === 'Create' ? 'text-[#D9541E]' : 'text-[#111111] hover:opacity-80'
            }`}
          >
            <span>Create</span>
            {activeNavTab === 'Create' && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#D9541E]" />
            )}
          </button>

          {/* Problems Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveNavTab('Problems');
              togglePresetModal();
            }}
            className={`relative h-full flex items-center px-1 transition-colors ${
              activeNavTab === 'Problems' ? 'text-[#D9541E]' : 'text-[#111111] hover:opacity-80'
            }`}
          >
            <span>Problems</span>
            {activeNavTab === 'Problems' && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#D9541E]" />
            )}
          </button>

          {/* Presets Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveNavTab('Presets');
              togglePresetModal();
            }}
            className={`relative h-full flex items-center px-1 transition-colors ${
              activeNavTab === 'Presets' ? 'text-[#D9541E]' : 'text-[#111111] hover:opacity-80'
            }`}
          >
            <span>Presets</span>
            {activeNavTab === 'Presets' && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#D9541E]" />
            )}
          </button>

          {/* Interview Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveNavTab('Interview');
              setGuideOpen(true);
            }}
            className={`relative h-full flex items-center px-1 transition-colors ${
              activeNavTab === 'Interview' ? 'text-[#D9541E]' : 'text-[#111111] hover:opacity-80'
            }`}
          >
            <span>Interview</span>
            {activeNavTab === 'Interview' && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#D9541E]" />
            )}
          </button>
        </nav>

        {/* Right: Actions (Folder, Share, Download, User) */}
        <div className="flex items-center gap-5 text-[#111111]">
          {/* Project Library */}
          <button
            type="button"
            onClick={toggleProjectLibrary}
            title="Projects Library"
            aria-label="Projects Library"
            className="hover:opacity-70 transition-opacity p-1"
            dangerouslySetInnerHTML={{ __html: folderSvg }}
          />

          {/* Share */}
          <button
            type="button"
            onClick={toggleShareModal}
            title="Share Project"
            aria-label="Share Project"
            className="hover:opacity-70 transition-opacity p-1"
            dangerouslySetInnerHTML={{ __html: shareSvg }}
          />

          {/* Download */}
          <button
            type="button"
            onClick={handleDownloadProject}
            title="Download Architecture JSON"
            aria-label="Download Architecture JSON"
            className="hover:opacity-70 transition-opacity p-1"
            dangerouslySetInnerHTML={{ __html: downloadSvg }}
          />

          {/* User / Settings Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              title="Settings & Help"
              aria-label="Settings & Help"
              className="flex items-center hover:opacity-70 transition-opacity p-1"
            >
              <span dangerouslySetInnerHTML={{ __html: userSvg }} />
              <span dangerouslySetInnerHTML={{ __html: arrowDropDownSvg }} />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#111113] border border-[#27272A] rounded-lg shadow-2xl py-1 text-white font-mono text-xs z-50">
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    toggleSettingsModal();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#18181B] transition-colors"
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setShortcutsOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#18181B] transition-colors flex justify-between"
                >
                  <span>Shortcuts</span>
                  <span className="text-[#71717A]">?</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setGuideOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#18181B] transition-colors"
                >
                  Guide
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. SECOND BAR / SUBHEADER TOOLBAR (Near-black #0B0B0D, height 54px) */}
      <div
        className="h-[54px] w-full px-6 flex items-center justify-between"
        style={{ backgroundColor: '#0B0B0D' }}
      >
        {/* Left Section: Menu Toggle, Mode Toggle Pill, Action Buttons */}
        <div className="flex items-center gap-6">
          {/* Inventory / Catalog Toggle Icon */}
          <button
            type="button"
            onClick={toggleInventory}
            title="Toggle Component Inventory"
            aria-label="Toggle Component Inventory"
            className={`p-1.5 rounded transition-all text-white hover:opacity-80 ${
              isInventoryOpen ? 'opacity-100' : 'opacity-60'
            }`}
            dangerouslySetInnerHTML={{ __html: inventorySvg }}
          />

          {/* Mode Toggle Pill [ Builder | Attacker ] */}
          <div className="inline-flex items-center bg-[#2C2C2C] p-0.5 rounded-lg border border-[#3A3A3E]">
            {/* Builder Mode Pill */}
            <button
              type="button"
              onClick={() => handleSetMode('builder')}
              className={`h-7 px-3 rounded-md text-[11px] font-mono font-medium transition-all ${
                mode === 'builder'
                  ? 'bg-[#656565] text-white shadow-sm font-semibold'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Builder
            </button>

            {/* Attacker Mode Pill */}
            <button
              type="button"
              onClick={() => handleSetMode('attacker')}
              className={`h-7 px-3 rounded-md text-[11px] font-mono font-medium transition-all ${
                mode === 'attacker'
                  ? 'bg-[#F3EEE3] text-[#D9541E] font-bold shadow-sm'
                  : 'text-white/80 hover:text-[#D9541E]'
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
              className={`hover:opacity-80 transition-opacity ${
                activeFailures.length > 0 ? 'text-[#D9541E] font-bold animate-pulse' : ''
              }`}
              title="Chaos Engineering & Failure Injections"
            >
              Chaos{activeFailures.length > 0 ? ` (${activeFailures.length})` : ''}
            </button>

            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className={`hover:opacity-80 transition-opacity ${
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
              className={`hover:opacity-80 transition-opacity ${
                canRedo ? 'text-white' : 'text-[#52525B] cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Y)"
            >
              Redo
            </button>

            <button
              type="button"
              onClick={() => reset()}
              className="hover:opacity-80 transition-opacity text-white"
              title="Reset Architecture Layout"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={toggleSettingsModal}
              className="hover:opacity-80 transition-opacity text-white"
              title="Simulation & UI Settings"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Right Section: View Tools (Eye, Hand, Layers) */}
        <div className="flex items-center gap-5 text-white">
          {/* Eye Icon (Toggle Inspector) */}
          <button
            type="button"
            onClick={toggleInspector}
            title={isInspectorOpen ? 'Collapse Inspector' : 'Expand Inspector'}
            aria-label="Toggle Inspector"
            className={`p-1 hover:opacity-80 transition-opacity ${
              isInspectorOpen ? 'opacity-100' : 'opacity-60'
            }`}
            dangerouslySetInnerHTML={{ __html: eyeSvg }}
          />

          {/* Hand Icon (Free-form / Pan mode) */}
          <button
            type="button"
            title="Hand Tool (Pan / Explore Canvas)"
            aria-label="Hand Tool"
            className="p-1 hover:opacity-80 transition-opacity"
            dangerouslySetInnerHTML={{ __html: handSvg }}
          />

          {/* Layers Icon (Dropdown: Main, Inside Server, DNS Resolution, TCP/TLS) */}
          <div className="relative" ref={layerMenuRef}>
            <button
              type="button"
              onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
              title={`Active Layer: ${activeLayer}`}
              aria-label="Layers Menu"
              className="p-1 hover:opacity-80 transition-opacity flex items-center gap-1"
            >
              <span dangerouslySetInnerHTML={{ __html: layersSvg }} />
            </button>

            {isLayerMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#111113] border border-[#27272A] rounded-lg shadow-2xl py-1 text-white font-mono text-xs z-50">
                <div className="px-3 py-1.5 text-[10px] text-[#71717A] uppercase tracking-wider font-semibold border-b border-[#27272A]">
                  Layers
                </div>
                {(['Main', 'Inside Server', 'DNS Resolution', 'TCP/TLS'] as LayerType[]).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => {
                      setActiveLayer(layer);
                      setIsLayerMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between ${
                      activeLayer === layer
                        ? 'bg-[#18181B] text-[#D9541E] font-bold'
                        : 'text-[#D4D4D4] hover:bg-[#18181B] hover:text-white'
                    }`}
                  >
                    <span>{layer}</span>
                    {activeLayer === layer && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
