/**
 * Chaos & Failure Injection Panel.
 * Allows users to choose from the failure catalog, configure targets and severity,
 * inject failures dynamically or schedule them deterministically, and view/remove active failures.
 */

import React, { useState } from 'react';
import { useUiStore, selectIsChaosPanelOpen } from '../../store/uiStore';
import { useGraphStore, selectGraph } from '../../store/graphStore';
import {
  useSimulationStore,
  selectActiveFailures,
  selectScenarioScript,
  selectNarrativeEvents,
  selectSimTimeMs,
} from '../../store/simulationStore';
import { FAILURE_CATALOG } from '../../scenarios/failures/catalog';
import { FailureType } from '../../scenarios/failures/types';

export const ChaosPanel: React.FC = () => {
  const isOpen = useUiStore(selectIsChaosPanelOpen);
  const toggleChaosPanel = useUiStore((s) => s.toggleChaosPanel);

  const graph = useGraphStore(selectGraph);
  const activeFailures = useSimulationStore(selectActiveFailures);
  const scenarioScript = useSimulationStore(selectScenarioScript);
  const narrativeEvents = useSimulationStore(selectNarrativeEvents);
  const simTimeMs = useSimulationStore(selectSimTimeMs);

  const injectFailureNow = useSimulationStore((s) => s.injectFailureNow);
  const scheduleFailure = useSimulationStore((s) => s.scheduleFailure);
  const removeFailure = useSimulationStore((s) => s.removeFailure);
  const clearScenarioScript = useSimulationStore((s) => s.clearScenarioScript);

  const catalogList = Object.values(FAILURE_CATALOG);
  const [selectedType, setSelectedType] = useState<FailureType>('db-slow');
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [durationSec, setDurationSec] = useState<number>(30);
  const [scheduleSec, setScheduleSec] = useState<number>(10);
  const [severityMultiplier, setSeverityMultiplier] = useState<number>(5);

  if (!isOpen) return null;

  const currentDef = FAILURE_CATALOG[selectedType] ?? catalogList[0]!;

  // Eligible targets
  const candidateNodes = graph.nodes.filter((n) => {
    if (!currentDef.targetComponentTypes) return true;
    return currentDef.targetComponentTypes.includes(n.type);
  });

  const candidateEdges = graph.edges;
  const isEdgeFailure = currentDef.targetKind === 'edge';

  const defaultTargetId = isEdgeFailure
    ? candidateEdges[0]?.id ?? ''
    : candidateNodes[0]?.id ?? '';

  const activeTargetId = selectedTarget || defaultTargetId;

  const handleInjectNow = () => {
    if (!activeTargetId) return;
    const params: Record<string, number> = {};
    if (selectedType === 'db-slow' || selectedType === 'app-server-slow') {
      params.multiplier = severityMultiplier;
    } else if (selectedType === 'edge-latency-spike') {
      params.addedLatencyMs = 80;
    } else if (selectedType === 'edge-packet-loss') {
      params.lossPct = 0.1;
    }

    injectFailureNow(
      selectedType,
      activeTargetId,
      params,
      durationSec > 0 ? durationSec * 1000 : undefined
    );
  };

  const handleSchedule = () => {
    if (!activeTargetId) return;
    const params: Record<string, number> = {};
    if (selectedType === 'db-slow' || selectedType === 'app-server-slow') {
      params.multiplier = severityMultiplier;
    } else if (selectedType === 'edge-latency-spike') {
      params.addedLatencyMs = 80;
    } else if (selectedType === 'edge-packet-loss') {
      params.lossPct = 0.1;
    }

    scheduleFailure({
      t: scheduleSec * 1000,
      action: 'inject',
      failureType: selectedType,
      targetId: activeTargetId,
      params,
      durationMs: durationSec > 0 ? durationSec * 1000 : undefined,
    });
  };

  return (
    <div
      className="fixed bottom-20 left-4 w-96 max-h-[80vh] flex flex-col bg-[#131316]/95 backdrop-blur-md border border-[#3f3f46] rounded-xl shadow-2xl z-40 overflow-hidden font-mono text-xs select-none animate-in fade-in slide-in-from-bottom-4 duration-200"
      role="dialog"
      aria-label="Chaos and Failure Injection"
    >
      {/* Header */}
      <div className="p-3.5 border-b border-[#27272a] flex items-center justify-between bg-[#18181b]/80">
        <div className="flex items-center gap-2">
          <span className="text-sm">⚡</span>
          <div>
            <div className="font-bold text-white text-xs tracking-wide uppercase">
              Chaos & Failures
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] font-sans">
              Test resilience & cascade failure dynamics
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleChaosPanel}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-[#27272a]"
          aria-label="Close Chaos Panel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* Active Failures Section */}
        {activeFailures.length > 0 && (
          <div className="p-2.5 rounded-lg bg-red-950/20 border border-red-500/30 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-red-300 uppercase tracking-wider">
              <span>Active Failures ({activeFailures.length})</span>
              <button
                type="button"
                onClick={clearScenarioScript}
                className="text-red-400 hover:text-red-200 hover:underline"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-1.5">
              {activeFailures.map((f) => {
                const remainingMs = f.endTimeMs ? Math.max(0, f.endTimeMs - simTimeMs) : null;
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-red-500/20 text-[11px]"
                  >
                    <div>
                      <div className="font-bold text-white">{f.failureType}</div>
                      <div className="text-[10px] text-red-300/80">
                        Target: {f.targetId}{' '}
                        {remainingMs !== null ? `(${(remainingMs / 1000).toFixed(0)}s left)` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFailure(f.id)}
                      className="px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-red-200 text-[10px] border border-red-700/50"
                    >
                      Heal
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Narrative Cascade Ticker */}
        {narrativeEvents.length > 0 && (
          <div className="p-2.5 rounded-lg bg-[#0b0b0d] border border-[#27272a] space-y-1.5">
            <div className="text-[10px] uppercase font-bold text-[var(--color-text-faint)] tracking-wider">
              Cascade Event Ticker
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1 text-[10px]">
              {narrativeEvents.slice(-6).map((ev) => (
                <div key={ev.id} className="flex items-start gap-1.5 leading-tight">
                  <span className="text-[var(--color-text-faint)] whitespace-nowrap">
                    {(ev.timeMs / 1000).toFixed(0)}s
                  </span>
                  <span
                    className={
                      ev.type === 'critical'
                        ? 'text-red-400 font-bold'
                        : ev.type === 'warning'
                        ? 'text-amber-300'
                        : 'text-zinc-300'
                    }
                  >
                    {ev.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Failure Selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-[var(--color-text-faint)] tracking-wider block">
            Failure Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value as FailureType);
              setSelectedTarget('');
            }}
            className="w-full bg-[#18181b] border border-[#3f3f46] hover:border-white rounded-lg p-2 text-white focus:outline-none"
          >
            {catalogList.map((f) => (
              <option key={f.type} value={f.type}>
                {f.label} ({f.category})
              </option>
            ))}
          </select>
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
            {currentDef.description}
          </p>
        </div>

        {/* Target Selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-[var(--color-text-faint)] tracking-wider block">
            Target Component
          </label>
          <select
            value={activeTargetId}
            onChange={(e) => setSelectedTarget(e.target.value)}
            className="w-full bg-[#18181b] border border-[#3f3f46] hover:border-white rounded-lg p-2 text-white focus:outline-none"
          >
            {isEdgeFailure
              ? candidateEdges.map((e) => (
                  <option key={e.id} value={e.id}>
                    Edge: {e.source} ➔ {e.target}
                  </option>
                ))
              : candidateNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label || n.type} ({n.id})
                  </option>
                ))}
          </select>
        </div>

        {/* Parameters */}
        {(selectedType === 'db-slow' || selectedType === 'app-server-slow') && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--color-text-muted)]">Latency Slowdown:</span>
              <span className="text-white font-bold">{severityMultiplier}x</span>
            </div>
            <input
              type="range"
              min="2"
              max="10"
              step="1"
              value={severityMultiplier}
              onChange={(e) => setSeverityMultiplier(parseInt(e.target.value, 10))}
              className="w-full accent-white cursor-pointer"
            />
          </div>
        )}

        {/* Duration Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-[var(--color-text-muted)]">Failure Duration:</span>
            <span className="text-white font-bold">
              {durationSec === 0 ? 'Indefinite' : `${durationSec} s`}
            </span>
          </div>
          <input
            type="range"
            min="5"
            max="60"
            step="5"
            value={durationSec}
            onChange={(e) => setDurationSec(parseInt(e.target.value, 10))}
            className="w-full accent-white cursor-pointer"
          />
        </div>

        {/* Actions Grid */}
        <div className="pt-2 border-t border-[#27272a] space-y-2">
          <button
            type="button"
            onClick={handleInjectNow}
            className="w-full py-2 px-3 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-600/60 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(239,68,68,0.3)] transition-all"
          >
            <span>⚡</span>
            <span>Inject Failure Immediately</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#18181b] border border-[#3f3f46] rounded-lg px-2 py-1 w-28">
              <span className="text-[10px] text-[var(--color-text-faint)]">At:</span>
              <input
                type="number"
                min="1"
                max="300"
                value={scheduleSec}
                onChange={(e) => setScheduleSec(parseInt(e.target.value, 10) || 1)}
                className="w-12 bg-transparent text-white font-bold text-center focus:outline-none"
              />
              <span className="text-[10px] text-[var(--color-text-faint)]">s</span>
            </div>

            <button
              type="button"
              onClick={handleSchedule}
              className="flex-1 py-1.5 px-3 rounded-lg bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white font-bold text-xs transition-all"
            >
              + Schedule Script
            </button>
          </div>
        </div>

        {/* Scenario Script Items Counter */}
        {scenarioScript.length > 0 && (
          <div className="text-[10px] text-[var(--color-text-muted)] flex justify-between items-center pt-1 border-t border-[#222226]">
            <span>Scheduled events: {scenarioScript.length}</span>
            <button
              type="button"
              onClick={clearScenarioScript}
              className="hover:text-white underline"
            >
              Clear script
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
