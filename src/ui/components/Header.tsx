import React, { useEffect, useState, useRef } from 'react';
import {
  useGraphStore,
  selectCanUndo,
  selectCanRedo,
  selectGraph,
} from '@store';
import { useUiStore, selectAppMode } from '@store';
import { useSimulationStore, selectActiveFailures, selectSimPlayStatus } from '@store';
import { useAttackStore } from '@store';
import { TUTORIALS } from '../../scenarios/tutorials/catalog';

export const Header: React.FC = () => {
  const canUndo = useGraphStore(selectCanUndo);
  const canRedo = useGraphStore(selectCanRedo);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const reset = useGraphStore((s) => s.reset);
  const graph = useGraphStore(selectGraph);

  const mode = useUiStore(selectAppMode);
  const setMode = useUiStore((s) => s.setMode);
  const togglePresetModal = useUiStore((s) => s.togglePresetModal);
  const toggleChaosPanel = useUiStore((s) => s.toggleChaosPanel);
  const toggleProjectLibrary = useUiStore((s) => s.toggleProjectLibrary);
  const toggleShareModal = useUiStore((s) => s.toggleShareModal);
  const toggleExampleGallery = useUiStore((s) => s.toggleExampleGallery);
  const toggleSettingsModal = useUiStore((s) => s.toggleSettingsModal);
  const setTourOpen = useUiStore((s) => s.setTourOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const setGuideOpen = useUiStore((s) => s.setGuideOpen);
  const startTutorial = useUiStore((s) => s.startTutorial);

  const activeFailures = useSimulationStore(selectActiveFailures);
  const playStatus = useSimulationStore(selectSimPlayStatus);
  const playSim = useSimulationStore((s) => s.play);
  const pauseSim = useSimulationStore((s) => s.pause);
  const stepSim = useSimulationStore((s) => s.step);
  const setSpeedSim = useSimulationStore((s) => s.setSpeed);

  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement | null>(null);

  // Close help dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (helpMenuRef.current && !helpMenuRef.current.contains(e.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcuts (Ctrl+Z, Ctrl+Y, Space, S, R, 1, 2, 4, 8, ?, Esc)
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

  return (
    <header className="h-14 w-full bg-[#131316] border-b border-[#27272a] px-5 flex items-center justify-between select-none z-20">
      {/* Title & Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ffffff] to-[#8e8e93] p-[1px] shadow-sm">
          <div className="w-full h-full bg-[#111113] rounded-[7px] flex items-center justify-center font-mono font-black text-xs text-white">
            LR
          </div>
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            Life of a Request
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-[var(--color-text-secondary)] border border-white/20 font-normal">
              Simulator
            </span>
          </h1>
          <p className="text-[10px] text-[var(--color-text-muted)]">Interactive Guided System Design</p>
        </div>
      </div>

      {/* Mode Toggle (Builder / Attacker) */}
      <div className="flex items-center bg-[#0b0b0d] p-1 rounded-lg border border-[#27272a]">
        <button
          type="button"
          onClick={() => handleSetMode('builder')}
          className={`h-7 px-3 rounded-md text-xs font-medium transition-all ${
            mode === 'builder'
              ? 'bg-[#18181b] text-white shadow-sm border border-[#3f3f46]'
              : 'text-[var(--color-text-muted)] hover:text-white'
          }`}
        >
          Builder Mode
        </button>

        <button
          type="button"
          onClick={() => handleSetMode('attacker')}
          className={`h-7 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            mode === 'attacker'
              ? 'bg-amber-950/60 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.35)] border border-amber-500/80 font-bold'
              : 'text-[var(--color-text-muted)] hover:text-amber-300'
          }`}
        >
          <span>🎯 Attacker Mode</span>
        </button>
      </div>

      {/* Action Controls & Navigation */}
      <div className="flex items-center gap-2">
        {/* Project Library Button */}
        <button
          type="button"
          onClick={toggleProjectLibrary}
          title="Open Project Library"
          className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center gap-1.5 shadow-sm"
        >
          <span>📁</span>
          <span>Projects</span>
        </button>

        {/* Gallery Button */}
        <button
          type="button"
          onClick={toggleExampleGallery}
          title="Browse Example Architectures"
          className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center gap-1.5 shadow-sm"
        >
          <span>🏛️</span>
          <span>Gallery</span>
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={toggleShareModal}
          title="Share Architecture Link"
          className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center gap-1.5 shadow-sm"
        >
          <span>🔗</span>
          <span>Share</span>
        </button>

        {/* Scenarios Preset Picker */}
        <button
          type="button"
          onClick={togglePresetModal}
          title="Open Disaster & Cascade Scenario Presets"
          className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center gap-1.5 shadow-sm"
        >
          <span>🌪️</span>
          <span>Scenarios</span>
        </button>

        {/* Chaos & Failures Toggle */}
        <button
          type="button"
          onClick={toggleChaosPanel}
          title="Inject or Schedule Failure Injections"
          className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm border ${
            activeFailures.length > 0
              ? 'bg-red-950/80 text-red-200 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse'
              : 'bg-[#18181b] hover:bg-[#222226] text-white border-[#3f3f46] hover:border-white'
          }`}
        >
          <span>⚡</span>
          <span>Chaos</span>
          {activeFailures.length > 0 && (
            <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded-full bg-red-600 text-white">
              {activeFailures.length}
            </span>
          )}
        </button>

        <div className="h-5 w-px bg-[#27272a]" />

        {/* Undo, Redo, Reset */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className={`h-8 px-2.5 rounded text-xs font-mono border transition-all ${
              canUndo
                ? 'bg-[#18181b] hover:bg-[#222226] text-white border-[#3f3f46] hover:border-white'
                : 'bg-[#111113] text-[#52525b] border-[#222226] cursor-not-allowed'
            }`}
          >
            ↺ Undo
          </button>

          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className={`h-8 px-2.5 rounded text-xs font-mono border transition-all ${
              canRedo
                ? 'bg-[#18181b] hover:bg-[#222226] text-white border-[#3f3f46] hover:border-white'
                : 'bg-[#111113] text-[#52525b] border-[#222226] cursor-not-allowed'
            }`}
          >
            ↻ Redo
          </button>

          <button
            type="button"
            onClick={reset}
            title="Reset to starter graph"
            aria-label="Reset architecture"
            className="h-8 px-2.5 rounded text-xs font-mono bg-[#18181b] hover:bg-[#222226] text-[var(--color-text-secondary)] hover:text-white border border-[#3f3f46] hover:border-white transition-all ml-1"
          >
            Reset
          </button>
        </div>

        <div className="h-5 w-px bg-[#27272a]" />

        {/* Settings Button */}
        <button
          type="button"
          onClick={toggleSettingsModal}
          title="Settings"
          aria-label="Open settings"
          className="h-8 w-8 rounded-lg text-xs bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center justify-center shadow-sm"
        >
          ⚙️
        </button>

        {/* Help Menu Dropdown */}
        <div className="relative" ref={helpMenuRef}>
          <button
            type="button"
            onClick={() => setIsHelpMenuOpen(!isHelpMenuOpen)}
            title="Help & Tutorials"
            aria-label="Open help menu"
            className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center gap-1 shadow-sm"
          >
            <span>❓</span>
            <span className="text-[10px]">▼</span>
          </button>

          {isHelpMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-[#18181b] border border-[#3f3f46] shadow-2xl p-1.5 z-50 text-xs text-white">
              <button
                type="button"
                onClick={() => {
                  setTourOpen(true);
                  setIsHelpMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2"
              >
                <span>🗺️</span>
                <span>Welcome Tour</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuideOpen(true);
                  setIsHelpMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2"
              >
                <span>📖</span>
                <span>Simulation Guide</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShortcutsOpen(true);
                  setIsHelpMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2"
              >
                <span>⌨️</span>
                <span>Keyboard Shortcuts (?)</span>
              </button>

              <div className="my-1 border-t border-[#27272a]" />
              <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-[var(--color-text-faint)]">
                Guided Tutorials
              </div>

              {TUTORIALS.map((tut) => (
                <button
                  key={tut.id}
                  type="button"
                  onClick={() => {
                    startTutorial(tut.id);
                    setIsHelpMenuOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1 rounded-lg hover:bg-white/10 text-[11px] truncate text-neutral-300 hover:text-white"
                >
                  {tut.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

