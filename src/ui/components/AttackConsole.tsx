import React, { useState } from 'react';
import { useAttackStore } from '../../store/attackStore';
import { useDefenseStore } from '../../store/defenseStore';
import { useSimulationStore } from '../../store/simulationStore';
import { ATTACK_SCENARIOS, ATTACK_SCENARIOS_LIST, CAMPAIGN_PRESETS } from '../../scenarios/attacks';
import { AttackScenarioId, CampaignPhase } from '../../types/attacks';
import { DefenseConsolePanel } from './DefenseConsolePanel';

export const AttackConsole: React.FC = () => {
  const activeTab = useDefenseStore((s) => s.activeTab);
  const setActiveTab = useDefenseStore((s) => s.setActiveTab);

  const activeCampaign = useAttackStore((s) => s.activeCampaign);
  const activePresetId = useAttackStore((s) => s.activePresetId);
  const loadPreset = useAttackStore((s) => s.loadPreset);
  const addCampaignPhase = useAttackStore((s) => s.addCampaignPhase);
  const updateCampaignPhase = useAttackStore((s) => s.updateCampaignPhase);
  const removeCampaignPhase = useAttackStore((s) => s.removeCampaignPhase);
  const openScenarioDetails = useAttackStore((s) => s.openScenarioDetails);

  const durationMs = useSimulationStore((s) => s.durationMs);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const handleAddScenario = (scenarioId: AttackScenarioId) => {
    const sc = ATTACK_SCENARIOS[scenarioId];
    if (!sc) return;

    // Calculate start time after last phase if any
    const lastPhase = activeCampaign.phases[activeCampaign.phases.length - 1];
    const startMs = lastPhase ? lastPhase.startMs + lastPhase.durationMs : 0;

    const newPhase: CampaignPhase = {
      id: `phase-${activeCampaign.phases.length + 1}-${scenarioId}`,
      scenarioId,
      startMs,
      durationMs: 4000,
      intensityRps: sc.intensityRange.defaultRps,
      sourceCount: sc.defaultSourceCount,
    };

    addCampaignPhase(newPhase);
    setIsLibraryOpen(false);
  };

  return (
    <aside
      className="w-full h-full flex flex-col bg-[#131316] border-r border-[#27272a] text-white select-none overflow-hidden"
      aria-label="Attacker Mode Console"
    >
      {/* Tab Switcher */}
      <div className="flex border-b border-[#27272a] bg-[#141417]">
        <button
          type="button"
          onClick={() => setActiveTab('campaign')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'campaign'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/10'
              : 'text-[var(--color-text-muted)] hover:text-white'
          }`}
        >
          <span>🎯</span> Campaign
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('defenses')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'defenses'
              ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/10'
              : 'text-[var(--color-text-muted)] hover:text-white'
          }`}
        >
          <span>🛡️</span> Defenses
        </button>
      </div>

      {activeTab === 'defenses' ? (
        <DefenseConsolePanel />
      ) : (
        <>
          {/* 1. Header */}
          <div className="p-4 border-b border-[#27272a] bg-[#141417]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-base">🎯</span>
                <h2 className="text-sm font-bold text-white tracking-wide">Attack Console</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold uppercase tracking-wider">
                Attacker Mode
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Orchestrate multi-phase attack campaigns against the architecture.
            </p>

            {/* Campaign Preset Selector */}
            <div className="mt-3">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-1.5">
                Campaign Presets
              </label>
              <select
                value={activePresetId || ''}
                onChange={(e) => loadPreset(e.target.value)}
                className="w-full text-xs font-medium bg-[#1c1c20] border border-[#3f3f46] text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400 hover:border-[#52525b] transition-colors cursor-pointer"
              >
                {CAMPAIGN_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Campaign Timeline Visualization Strip */}
          <div className="px-4 py-3 border-b border-[#27272a] bg-[#101013]">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)] mb-1.5">
              <span>TIMELINE (0s - {(durationMs / 1000).toFixed(0)}s)</span>
              <span className="text-amber-300 font-bold">{activeCampaign.phases.length} Phases</span>
            </div>

            {/* Visual Phase Blocks Strip */}
            <div className="w-full h-6 rounded-md bg-[#18181c] border border-[#27272a] relative overflow-hidden flex items-center">
              {activeCampaign.phases.map((ph, idx) => {
                const leftPct = Math.min(100, Math.max(0, (ph.startMs / durationMs) * 100));
                const widthPct = Math.min(100 - leftPct, Math.max(3, (ph.durationMs / durationMs) * 100));
                const scenario = ATTACK_SCENARIOS[ph.scenarioId];

                return (
                  <div
                    key={ph.id}
                    title={`${scenario?.name || ph.scenarioId} (${ph.intensityRps} RPS)`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    className={`absolute top-0 bottom-0 rounded flex items-center justify-center text-[9px] font-mono font-bold truncate px-1 transition-all ${
                      idx % 2 === 0
                        ? 'bg-amber-600/70 border border-amber-400/80 text-white'
                        : 'bg-amber-800/80 border border-amber-500/80 text-amber-100'
                    }`}
                  >
                    {scenario?.name.slice(0, 10)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Phases List & Editor */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                Campaign Timeline Phases
              </span>
              <button
                type="button"
                onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                className="text-[11px] px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold flex items-center gap-1 transition-colors"
              >
                <span>+</span> Add Phase
              </button>
            </div>

            {/* Add Scenario Drawer / Dropdown */}
            {isLibraryOpen && (
              <div className="p-3 rounded-xl bg-[#1c1c20] border border-amber-500/40 shadow-xl space-y-2 animate-in fade-in duration-150">
                <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  Select Attack Scenario to Append
                </div>
                <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
                  {ATTACK_SCENARIOS_LIST.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => handleAddScenario(sc.id)}
                      className="w-full text-left p-2 rounded-lg bg-[#141416] hover:bg-[#27272a] border border-[#27272a] hover:border-amber-400/60 transition-colors flex items-center justify-between"
                    >
                      <div className="truncate pr-2">
                        <div className="text-xs font-semibold text-white truncate">{sc.name}</div>
                        <div className="text-[10px] text-[var(--color-text-muted)] capitalize">
                          Target: {sc.targetLayer}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-amber-400 shrink-0">+ Add</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Phase Cards */}
            {activeCampaign.phases.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-[#3f3f46] text-center text-[var(--color-text-muted)] text-xs">
                No phases in this campaign. Click "+ Add Phase" or load a preset above.
              </div>
            ) : (
              activeCampaign.phases.map((ph, idx) => {
                const scenario = ATTACK_SCENARIOS[ph.scenarioId];

                return (
                  <div
                    key={ph.id}
                    className="p-3 rounded-xl bg-[#18181c] border border-[#27272a] hover:border-[#3f3f46] transition-all space-y-2.5 shadow-sm"
                  >
                    {/* Phase Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-white truncate max-w-[170px]">
                          {scenario?.name || ph.scenarioId}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {scenario && (
                          <button
                            type="button"
                            onClick={() => openScenarioDetails(scenario)}
                            title="View Conceptual Details & Defense"
                            className="text-[10px] text-[var(--color-text-muted)] hover:text-white p-1 rounded hover:bg-white/10"
                          >
                            ℹ️
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeCampaignPhase(ph.id)}
                          title="Remove Phase"
                          className="text-xs text-[var(--color-text-muted)] hover:text-red-400 p-1 rounded hover:bg-white/10"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Phase Parameters Grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="text-[9px] font-mono text-[var(--color-text-muted)] block mb-1">
                          Start (ms)
                        </label>
                        <input
                          type="number"
                          step={500}
                          min={0}
                          max={durationMs}
                          value={ph.startMs}
                          onChange={(e) =>
                            updateCampaignPhase(ph.id, { startMs: Math.max(0, Number(e.target.value)) })
                          }
                          className="w-full bg-[#111113] border border-[#3f3f46] rounded px-2 py-1 text-white font-mono text-[11px] focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-mono text-[var(--color-text-muted)] block mb-1">
                          Duration
                        </label>
                        <input
                          type="number"
                          step={500}
                          min={500}
                          value={ph.durationMs}
                          onChange={(e) =>
                            updateCampaignPhase(ph.id, {
                              durationMs: Math.max(500, Number(e.target.value)),
                            })
                          }
                          className="w-full bg-[#111113] border border-[#3f3f46] rounded px-2 py-1 text-white font-mono text-[11px] focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-mono text-[var(--color-text-muted)] block mb-1">
                          RPS
                        </label>
                        <input
                          type="number"
                          step={100}
                          min={10}
                          max={100000}
                          value={ph.intensityRps}
                          onChange={(e) =>
                            updateCampaignPhase(ph.id, {
                              intensityRps: Math.max(1, Number(e.target.value)),
                            })
                          }
                          className="w-full bg-[#111113] border border-[#3f3f46] rounded px-2 py-1 text-white font-mono text-[11px] focus:outline-none focus:border-amber-400 font-bold"
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* 4. Scenario Catalog Reference */}
            <div className="pt-3 border-t border-[#27272a]">
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block mb-2">
                Attack Scenario Catalog (8 Scenarios)
              </span>

              <div className="space-y-1.5">
                {ATTACK_SCENARIOS_LIST.map((sc) => (
                  <div
                    key={sc.id}
                    className="p-2 rounded-lg bg-[#141416] border border-[#27272a] hover:border-[#3f3f46] flex items-center justify-between text-xs"
                  >
                    <div className="truncate pr-2">
                      <div className="font-medium text-white truncate">{sc.name}</div>
                      <div className="text-[10px] text-[var(--color-text-muted)]">
                        Target: {sc.targetLayer}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openScenarioDetails(sc)}
                        className="text-[10px] px-2 py-1 rounded bg-[#1e1e24] hover:bg-[#2a2a32] text-[var(--color-text-secondary)] border border-[#3f3f46]"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddScenario(sc.id)}
                        className="text-[10px] px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
