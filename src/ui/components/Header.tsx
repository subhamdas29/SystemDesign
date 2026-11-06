import React, { useEffect } from 'react';
import {
  useGraphStore,
  selectCanUndo,
  selectCanRedo,
  selectValidation,
} from '@store';
import { useUiStore, selectAppMode } from '@store';

export const Header: React.FC = () => {
  const canUndo = useGraphStore(selectCanUndo);
  const canRedo = useGraphStore(selectCanRedo);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const reset = useGraphStore((s) => s.reset);
  const validation = useGraphStore(selectValidation);

  const mode = useUiStore(selectAppMode);
  const setMode = useUiStore((s) => s.setMode);

  // Global keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

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
          onClick={() => setMode('builder')}
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
          disabled
          title="Attacker mode arrives in Phase 8"
          className="h-7 px-3 rounded-md text-xs font-medium text-[#71717a] cursor-not-allowed flex items-center gap-1.5"
        >
          <span>Attacker Mode</span>
          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/5 border border-white/10 text-[#71717a]">
            Phase 8
          </span>
        </button>
      </div>

      {/* History Controls & Architecture Health */}
      <div className="flex items-center gap-3">
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

        {/* Validation Status Badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border ${
            validation.valid
              ? 'bg-[#111113] border-[#3f3f46] text-[var(--color-text-secondary)]'
              : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
          }`}
          title={validation.valid ? 'Architecture is structurally sound' : validation.errors.join('; ')}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              validation.valid
                ? 'bg-[#f4f4f5] shadow-[0_0_6px_#ffffff]'
                : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]'
            }`}
          />
          <span>{validation.valid ? 'Architecture Valid' : `${validation.errors.length} Issues`}</span>
        </div>
      </div>
    </header>
  );
};
