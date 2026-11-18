/**
 * Dedicated Presets Page (R1 Navigation).
 * Lists existing runnable presets from earlier phases as simple, clean typographic entries.
 * One-click loading switches back to Create workspace.
 * Includes a reserved data slot for future company architectures without mock content.
 */

import React from 'react';
import { useUiStore } from '../../store/uiStore';
import { useGraphStore } from '../../store/graphStore';
import { useSimulationStore } from '../../store/simulationStore';
import { createStarterGraph } from '../../builder';
import { ALL_PRESETS, ScenarioPreset } from '../../scenarios/examples/presets';

/**
 * Clearly named data slot reserved for future company reference architectures
 * (e.g. Netflix video transcoding & CDN, Facebook social graph, Uber ride dispatch).
 * Intentionally empty in Release 1 per specification; no mock entries are invented.
 */
export const COMPANY_ARCHITECTURE_SLOTS: Array<{
  id: string;
  company: string;
  title: string;
  description: string;
  tags: string[];
}> = [];

function getPresetDifficulty(id: string): 'Beginner' | 'Intermediate' | 'Advanced' {
  if (id === 'healthy-baseline' || id === 'auto-scaling-web') return 'Beginner';
  if (id === 'slow-db-cascade' || id === 'cache-stampede' || id === 'single-node-partition') {
    return 'Intermediate';
  }
  return 'Advanced';
}

export const PresetsPage: React.FC = () => {
  const setActiveNavTab = useUiStore((s) => s.setActiveNavTab);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const setTrafficConfig = useSimulationStore((s) => s.setTrafficConfig);
  const resetSim = useSimulationStore((s) => s.reset);

  const handleLoadPreset = (preset: ScenarioPreset) => {
    // 1. Create base starter graph and apply preset mutations
    const baseGraph = createStarterGraph();
    const finalGraph = preset.configureGraph(baseGraph);

    // 2. Load into stores
    loadGraph(finalGraph);
    setTrafficConfig(preset.traffic);
    resetSim(finalGraph);

    // 3. Switch back to Create workspace
    setActiveNavTab('create');
  };

  return (
    <div
      className="flex-1 w-full h-full overflow-y-auto select-none font-mono p-8"
      style={{ backgroundColor: '#0B0B0D' }}
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="space-y-2 border-b border-[#27272A] pb-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-[#F3EEE3] tracking-tight">
              Architecture & Scenario Presets
            </h1>
            <button
              type="button"
              onClick={() => setActiveNavTab('create')}
              className="text-xs text-[#A1A1AA] hover:text-white px-2.5 py-1 rounded bg-[#18181B] border border-[#3F3F46] transition-colors"
            >
              ← Back to Create
            </button>
          </div>
          <p className="text-xs text-[#A1A1AA] leading-relaxed">
            Curated system design patterns, disaster cascades, and distributed resilience architectures. Click any preset to load it directly into the simulation canvas.
          </p>
        </div>

        {/* Presets List */}
        <div className="space-y-3">
          {ALL_PRESETS.map((preset) => {
            const difficulty = getPresetDifficulty(preset.id);
            const difficultyColor =
              difficulty === 'Beginner'
                ? 'text-[#008604] border-[#008604]/40'
                : difficulty === 'Intermediate'
                ? 'text-[#F59E0B] border-[#F59E0B]/40'
                : 'text-[#D9541E] border-[#D9541E]/40';

            return (
              <div
                key={preset.id}
                className="p-4 rounded-lg bg-[#111113] border border-[#27272A] hover:border-[#3F3F46] transition-all flex items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-white tracking-wide">
                      {preset.title}
                    </span>
                    <span
                      className={`text-[10px] font-mono uppercase px-1.5 py-0.2 border rounded ${difficultyColor}`}
                    >
                      {difficulty}
                    </span>
                  </div>
                  <p className="text-xs text-[#A1A1AA] truncate">
                    {preset.subtitle || preset.description}
                  </p>
                  <div className="text-[10px] text-[#71717A] flex items-center gap-3">
                    <span>Traffic: {preset.traffic.peakRps} req/s ({preset.traffic.pattern})</span>
                    <span>• Mode: {preset.traffic.mode}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleLoadPreset(preset)}
                  className="px-3.5 py-1.5 rounded text-xs font-mono font-medium bg-[#2C2C2C] hover:bg-[#3A3A3E] text-white border border-[#3F3F46] hover:border-white transition-all shrink-0 cursor-pointer"
                >
                  Load Architecture →
                </button>
              </div>
            );
          })}
        </div>

        {/* Company Architectures Reserved Slot */}
        <div className="pt-6 border-t border-[#27272A] space-y-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              Company Architectures
            </h2>
            <span className="text-[10px] text-[#D9541E] font-medium border border-[#D9541E]/40 px-1.5 py-0.2 rounded">
              Coming in future releases
            </span>
          </div>
          <p className="text-xs text-[#71717A] leading-relaxed">
            Real-world enterprise system designs (such as Netflix video distribution, Meta social graph feed, and Uber geospatial dispatch) will be added to this data slot in upcoming releases.
          </p>

          {COMPANY_ARCHITECTURE_SLOTS.length > 0 && (
            <div className="space-y-2 mt-3">
              {COMPANY_ARCHITECTURE_SLOTS.map((slot) => (
                <div key={slot.id} className="p-3 bg-[#111113] border border-[#27272A] rounded">
                  <span className="text-xs text-white">{slot.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PresetsPage;
