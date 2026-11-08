/**
 * Scenario Presets Selection Modal.
 * Offers 1-click loading of curated disaster scenarios, cascade studies,
 * and educational resilience benchmarks.
 */

import React from 'react';
import { useUiStore, selectIsPresetModalOpen } from '../../store/uiStore';
import { useGraphStore, selectGraph } from '../../store/graphStore';
import { useSimulationStore } from '../../store/simulationStore';
import { SCENARIO_PRESETS, PHASE_9_PRESETS } from '../../scenarios/examples/presets';

export const ScenarioPresetsModal: React.FC = () => {
  const [activeCategory, setActiveCategory] = React.useState<'scaling' | 'disaster'>('scaling');
  const isOpen = useUiStore(selectIsPresetModalOpen);
  const togglePresetModal = useUiStore((s) => s.togglePresetModal);

  const graph = useGraphStore(selectGraph);
  const loadScenarioPreset = useSimulationStore((s) => s.loadScenarioPreset);

  if (!isOpen) return null;

  const currentPresets = activeCategory === 'scaling' ? PHASE_9_PRESETS : SCENARIO_PRESETS;

  const handleSelectPreset = (presetId: string) => {
    loadScenarioPreset(presetId, graph);
    togglePresetModal();
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Disaster & Cascade Scenario Presets"
    >
      <div className="w-full max-w-3xl bg-[#131316] border border-[#3f3f46] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#27272a] flex items-center justify-between bg-[#18181b]">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>🌪️</span>
              <span>Disaster & Cascade Scenario Presets</span>
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Select a curated resilience experiment to test queue saturation, retry storms, and health checks.
            </p>
          </div>
          <button
            type="button"
            onClick={togglePresetModal}
            className="w-7 h-7 rounded-lg bg-[#222226] hover:bg-[#2e2e33] text-white flex items-center justify-center text-xs"
            aria-label="Close presets modal"
          >
            ✕
          </button>
        </div>

        {/* Category Selector Tabs */}
        <div className="flex border-b border-[#27272a] px-5 pt-3 gap-2 bg-[#141417]">
          <button
            type="button"
            onClick={() => setActiveCategory('scaling')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 ${
              activeCategory === 'scaling'
                ? 'border-white text-white bg-[#1c1c20]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <span>⛁</span>
            <span>Scaling & Architecture ({PHASE_9_PRESETS.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('disaster')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 ${
              activeCategory === 'disaster'
                ? 'border-white text-white bg-[#1c1c20]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <span>🌪️</span>
            <span>Disasters & Cascades ({SCENARIO_PRESETS.length})</span>
          </button>
        </div>

        {/* Presets Grid */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {currentPresets.map((preset) => (
            <div
              key={preset.id}
              onClick={() => handleSelectPreset(preset.id)}
              className="p-4 rounded-xl bg-[#18181b] hover:bg-[#202025] border border-[#27272a] hover:border-white transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm group-hover:text-white transition-colors">
                    {preset.title}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-[var(--color-text-secondary)] border border-white/20">
                    {preset.traffic.mode === 'discrete' ? 'Discrete Mode' : 'Aggregate'}
                  </span>
                </div>

                <div className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">
                  {preset.subtitle}
                </div>

                <p className="text-xs text-[var(--color-text-secondary)] mt-2 leading-relaxed font-sans">
                  {preset.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#27272a] space-y-1">
                <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] font-mono">
                  Educational Takeaway:
                </div>
                <div className="text-[11px] text-zinc-300 font-sans italic">
                  "{preset.educationalTakeaway}"
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    className="px-3 py-1 rounded-md text-xs font-semibold bg-white text-black hover:bg-neutral-200 shadow-sm transition-all flex items-center gap-1"
                  >
                    <span>Load Scenario</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
