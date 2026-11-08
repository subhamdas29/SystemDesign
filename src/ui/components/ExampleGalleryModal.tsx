import React, { useState } from 'react';
import { ALL_PRESETS } from '../../scenarios/examples/presets';
import { useGraphStore, useSimulationStore } from '@store';

interface ExampleGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExampleGalleryModal: React.FC<ExampleGalleryModalProps> = ({ isOpen, onClose }) => {
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const graph = useGraphStore((s) => s.graph);
  const loadScenarioPreset = useSimulationStore((s) => s.loadScenarioPreset);

  if (!isOpen) return null;

  const presetsWithDifficulty = ALL_PRESETS.map((p, idx) => {
    let difficulty: 'Beginner' | 'Intermediate' | 'Advanced' = 'Intermediate';
    if (idx < 2 || p.id.includes('baseline')) difficulty = 'Beginner';
    else if (p.id.includes('hot-shard') || p.id.includes('async-burst') || p.id.includes('partition'))
      difficulty = 'Advanced';
    return { ...p, difficulty };
  });

  const filtered =
    filterDifficulty === 'all'
      ? presetsWithDifficulty
      : presetsWithDifficulty.filter((p) => p.difficulty.toLowerCase() === filterDifficulty);

  const handleSelectPreset = (presetId: string) => {
    loadScenarioPreset(presetId, graph);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4"
    >
      <div className="w-full max-w-3xl max-h-[85vh] bg-[#141416] border border-[#27272a] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🏛️</span>
            <div>
              <h2 id="gallery-modal-title" className="text-base font-semibold">
                Example Architecture Gallery
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Explore curated real-world system designs, failure cascades, and resilience studies
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-2.5 border-b border-[#222226] bg-[#101012] flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-text-muted)] mr-2">Filter:</span>
          {['all', 'beginner', 'intermediate', 'advanced'].map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilterDifficulty(lvl)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                filterDifficulty === lvl
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] flex flex-col justify-between transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-white leading-tight">{p.title}</h3>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                      p.difficulty === 'Beginner'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : p.difficulty === 'Intermediate'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-purple-950 text-purple-300 border border-purple-800'
                    }`}
                  >
                    {p.difficulty}
                  </span>
                </div>
                <p className="text-xs font-medium text-neutral-300 mb-2">{p.subtitle}</p>
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mb-3">
                  {p.description}
                </p>

                <div className="p-2 rounded bg-white/5 border border-white/5 text-[10px] text-neutral-300 leading-normal mb-3">
                  <strong className="text-white">Takeaway: </strong>
                  {p.educationalTakeaway}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white text-white hover:text-black text-xs font-semibold transition-all shadow-sm"
              >
                Load Architecture
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
