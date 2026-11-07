/**
 * Traffic Configuration Modal.
 * Inspector-style dialog using monochrome design tokens only.
 * Provides peak RPS presets, duration, traffic patterns (constant, ramp, spike, burst),
 * live SVG preview chart, analytical request summary, mode selection, and static capacity limits.
 */

import React, { useState } from 'react';
import {
  useSimulationStore,
  selectTrafficConfig,
  selectIsTrafficModalOpen,
  selectStaticCapacity,
} from '../../store/simulationStore';
import { useGraphStore, selectGraph } from '../../store/graphStore';
import {
  TrafficConfig,
  TrafficPatternType,
  SimulationMode,
  TrafficConfigSchema,
} from '../../scenarios/traffic/types';
import { rpsAt, computeTrafficSummary } from '../../scenarios/traffic/patterns';
import { analyzeCapacity } from '../../engine/analysis/capacityAnalysis';

const RPS_PRESETS = [
  { label: '100', value: 100 },
  { label: '1k', value: 1000 },
  { label: '10k', value: 10000 },
  { label: '100k', value: 100000 },
  { label: '1M', value: 1000000 },
];

export const TrafficModal: React.FC = () => {
  const isOpen = useSimulationStore(selectIsTrafficModalOpen);
  const close = useSimulationStore((s) => s.closeTrafficModal);
  const currentConfig = useSimulationStore(selectTrafficConfig);
  const setTrafficConfig = useSimulationStore((s) => s.setTrafficConfig);
  const graph = useGraphStore(selectGraph);
  const storeCapacity = useSimulationStore(selectStaticCapacity);

  const capacity = storeCapacity ?? analyzeCapacity(graph);

  // Local draft state initialized fresh on open
  const [draft, setDraft] = useState<TrafficConfig>(currentConfig);
  const [validationError, setValidationError] = useState<string | null>(null);

  const summary = computeTrafficSummary(draft);
  const activeMode =
    draft.mode === 'auto'
      ? draft.peakRps > 1000
        ? 'aggregate'
        : 'discrete'
      : draft.mode;

  if (!isOpen) return null;

  const handleApply = () => {
    const parseResult = TrafficConfigSchema.safeParse(draft);
    if (!parseResult.success) {
      setValidationError(parseResult.error.issues[0]?.message ?? 'Invalid traffic configuration');
      return;
    }
    setTrafficConfig(draft, graph);
    close();
  };

  // Generate SVG path for live traffic pattern preview
  const previewPoints = 60;
  const svgWidth = 320;
  const svgHeight = 70;
  const padding = 6;
  const plotWidth = svgWidth - padding * 2;
  const plotHeight = svgHeight - padding * 2;

  const pathCoordinates: string[] = [];
  const maxVal = Math.max(1, draft.peakRps);

  for (let i = 0; i <= previewPoints; i++) {
    const t = (i / previewPoints) * draft.durationMs;
    const rps = rpsAt(t, draft);
    const x = padding + (i / previewPoints) * plotWidth;
    const y = padding + plotHeight - (rps / maxVal) * plotHeight;
    pathCoordinates.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const svgPathData = pathCoordinates.join(' ');
  const svgFillData = `${svgPathData} L ${(padding + plotWidth).toFixed(1)} ${(padding + plotHeight).toFixed(1)} L ${padding} ${(padding + plotHeight).toFixed(1)} Z`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="traffic-modal-title"
    >
      <div className="w-full max-w-lg bg-[#111113] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">⚡</span>
            <div>
              <h2 id="traffic-modal-title" className="text-sm font-semibold text-white tracking-wide uppercase">
                Traffic & Execution Mode
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Simulate realistic traffic volumes and high-concurrency fluid flows
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="w-7 h-7 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-[var(--color-text-muted)] hover:text-white flex items-center justify-center text-xs transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Peak RPS Presets & Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white uppercase tracking-wider block">
              Peak Traffic Volume (RPS)
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {RPS_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, peakRps: p.value }))}
                  className={`py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
                    draft.peakRps === p.value
                      ? 'bg-white text-black border-white font-bold shadow-sm'
                      : 'bg-[#18181b] text-[var(--color-text-secondary)] border-[#27272a] hover:border-[#3f3f46]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-[var(--color-text-muted)] font-mono">Custom:</span>
              <input
                type="number"
                min={10}
                max={1000000}
                step={100}
                value={draft.peakRps}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    peakRps: Math.max(10, Math.min(1000000, Number(e.target.value) || 10)),
                  }))
                }
                className="flex-1 h-8 px-3 rounded-lg bg-[#18181b] border border-[#3f3f46] text-white font-mono text-xs focus:border-white outline-none"
              />
              <span className="text-xs font-mono text-[var(--color-text-faint)]">req/sec</span>
            </div>
          </div>

          {/* Duration Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white uppercase tracking-wider">
                Simulated Duration
              </label>
              <span className="text-xs font-mono text-white">
                {(draft.durationMs / 1000).toFixed(0)} seconds ({Math.round(draft.durationMs / 60000 * 10) / 10} min)
              </span>
            </div>
            <input
              type="range"
              min={10000}
              max={600000}
              step={5000}
              value={draft.durationMs}
              onChange={(e) => setDraft((d) => ({ ...d, durationMs: Number(e.target.value) }))}
              className="w-full accent-white h-1.5 bg-[#27272a] rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Traffic Pattern Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white uppercase tracking-wider block">
              Traffic Pattern
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['constant', 'ramp', 'spike', 'burst'] as TrafficPatternType[]).map((pat) => (
                <button
                  key={pat}
                  type="button"
                  onClick={() => {
                    if (pat === 'constant') {
                      setDraft((d) => ({ ...d, pattern: pat, patternParams: { type: 'constant' } }));
                    } else if (pat === 'ramp') {
                      setDraft((d) => ({
                        ...d,
                        pattern: pat,
                        patternParams: { type: 'ramp', startRps: Math.round(d.peakRps * 0.1) },
                      }));
                    } else if (pat === 'spike') {
                      setDraft((d) => ({
                        ...d,
                        pattern: pat,
                        patternParams: {
                          type: 'spike',
                          baselineRps: Math.round(d.peakRps * 0.1),
                          spikeStartMs: Math.round(d.durationMs * 0.3),
                          spikeDurationMs: Math.round(d.durationMs * 0.3),
                        },
                      }));
                    } else if (pat === 'burst') {
                      setDraft((d) => ({
                        ...d,
                        pattern: pat,
                        patternParams: {
                          type: 'burst',
                          baselineRps: Math.round(d.peakRps * 0.05),
                          periodMs: 4000,
                          dutyCycle: 0.25,
                        },
                      }));
                    }
                  }}
                  className={`py-1.5 rounded-lg text-xs font-medium capitalize border transition-all ${
                    draft.pattern === pat
                      ? 'bg-white text-black border-white font-bold shadow-sm'
                      : 'bg-[#18181b] text-[var(--color-text-secondary)] border-[#27272a] hover:border-[#3f3f46]'
                  }`}
                >
                  {pat === 'ramp' ? 'Gradual Ramp' : pat}
                </button>
              ))}
            </div>

            {/* Pattern-Specific Tuners */}
            {draft.pattern === 'ramp' && draft.patternParams.type === 'ramp' && (
              <div className="p-3 bg-[#18181b] rounded-lg border border-[#27272a] flex items-center justify-between text-xs font-mono">
                <span className="text-[var(--color-text-muted)]">Starting RPS:</span>
                <input
                  type="number"
                  min={0}
                  max={draft.peakRps}
                  value={draft.patternParams.startRps}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      patternParams: { type: 'ramp', startRps: Number(e.target.value) },
                    }))
                  }
                  className="w-24 h-7 px-2 rounded bg-[#111113] border border-[#3f3f46] text-white text-center"
                />
              </div>
            )}

            {draft.pattern === 'spike' && draft.patternParams.type === 'spike' && (
              <div className="p-3 bg-[#18181b] rounded-lg border border-[#27272a] grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Baseline RPS:</span>
                  <input
                    type="number"
                    min={0}
                    max={draft.peakRps}
                    value={draft.patternParams.baselineRps}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraft((d) =>
                        d.patternParams.type === 'spike'
                          ? { ...d, patternParams: { ...d.patternParams, baselineRps: val } }
                          : d
                      );
                    }}
                    className="w-16 h-7 px-1.5 rounded bg-[#111113] border border-[#3f3f46] text-white text-center"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Spike Length:</span>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    value={draft.patternParams.spikeDurationMs}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraft((d) =>
                        d.patternParams.type === 'spike'
                          ? { ...d, patternParams: { ...d.patternParams, spikeDurationMs: val } }
                          : d
                      );
                    }}
                    className="w-16 h-7 px-1.5 rounded bg-[#111113] border border-[#3f3f46] text-white text-center"
                  />
                </div>
              </div>
            )}

            {draft.pattern === 'burst' && draft.patternParams.type === 'burst' && (
              <div className="p-3 bg-[#18181b] rounded-lg border border-[#27272a] grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Period (ms):</span>
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={draft.patternParams.periodMs}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraft((d) =>
                        d.patternParams.type === 'burst'
                          ? { ...d, patternParams: { ...d.patternParams, periodMs: val } }
                          : d
                      );
                    }}
                    className="w-16 h-7 px-1.5 rounded bg-[#111113] border border-[#3f3f46] text-white text-center"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Duty Cycle:</span>
                  <input
                    type="number"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={draft.patternParams.dutyCycle}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraft((d) =>
                        d.patternParams.type === 'burst'
                          ? { ...d, patternParams: { ...d.patternParams, dutyCycle: val } }
                          : d
                      );
                    }}
                    className="w-16 h-7 px-1.5 rounded bg-[#111113] border border-[#3f3f46] text-white text-center"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Live SVG Pattern Preview & Summary */}
          <div className="p-3 bg-[#0b0b0d] rounded-xl border border-[#27272a] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white font-semibold uppercase tracking-wider text-[11px]">
                Pattern Live Preview
              </span>
              <span className="font-mono text-[var(--color-text-faint)] text-[10px]">
                Peak: {draft.peakRps.toLocaleString()} RPS
              </span>
            </div>

            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-16 rounded-lg bg-[#131316] border border-[#1f1f23] overflow-hidden"
            >
              <defs>
                <linearGradient id="silverGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={svgFillData} fill="url(#silverGradient)" />
              <path d={svgPathData} fill="none" stroke="#ffffff" strokeWidth="1.5" />
            </svg>

            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#1f1f23] text-center font-mono">
              <div>
                <div className="text-[10px] text-[var(--color-text-muted)]">Total Requests</div>
                <div className="text-xs font-bold text-white">{summary.totalRequests.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--color-text-muted)]">Average RPS</div>
                <div className="text-xs font-bold text-white">{summary.averageRps.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--color-text-muted)]">Peak RPS</div>
                <div className="text-xs font-bold text-white">{summary.peakRps.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Architecture Capacity Preview Callout */}
          <div className="p-3 bg-[#18181b] rounded-xl border border-[#27272a] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-sm">🛡️</span>
              <div>
                <div className="text-white font-semibold">
                  Sustained Capacity: ~{capacity.sustainableRps.toLocaleString()} RPS
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)]">
                  Bottleneck limit: <span className="text-white font-mono">{capacity.bottleneckType}</span>
                </div>
              </div>
            </div>
            {draft.peakRps > capacity.sustainableRps ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-500/20 text-red-300 border border-red-500/30">
                OVERLOAD
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 text-white border border-white/20">
                OPTIMAL
              </span>
            )}
          </div>

          {/* Execution Mode Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white uppercase tracking-wider">
                Simulation Engine Mode
              </label>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 text-white border border-white/20 uppercase font-bold">
                Active: {activeMode}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(['auto', 'discrete', 'aggregate'] as SimulationMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, mode: m }))}
                  className={`py-1.5 rounded-lg text-xs font-mono capitalize border transition-all ${
                    draft.mode === m
                      ? 'bg-white text-black border-white font-bold shadow-sm'
                      : 'bg-[#18181b] text-[var(--color-text-secondary)] border-[#27272a] hover:border-[#3f3f46]'
                  }`}
                >
                  {m === 'auto' ? 'Auto (Hybrid)' : m}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-[var(--color-text-muted)]">
              {draft.mode === 'auto'
                ? 'Auto switches to Discrete up to 1,000 RPS for exact individual packet tracing, and Aggregate fluid mode above 1,000 RPS.'
                : draft.mode === 'discrete'
                ? 'Discrete-event mode: simulates every individual request arrival, queue hop, and latency variance.'
                : 'Aggregate fluid mode: fixed 100ms fluid ticks supporting up to 1,000,000 RPS with Little’s Law back-pressure.'}
            </p>

            {draft.mode === 'discrete' && draft.peakRps > 1000 && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-200">
                ⚠️ Warning: Running discrete mode above 1,000 RPS caps simulated events at 1,000 req/s to prevent browser tab freeze. For high volume, use Aggregate or Auto mode.
              </div>
            )}
          </div>

          {validationError && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
              {validationError}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#27272a] flex items-center justify-end gap-2 bg-[#0b0b0d]">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2 rounded-lg text-xs font-mono text-[var(--color-text-secondary)] hover:text-white border border-[#27272a] hover:border-[#3f3f46] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 rounded-lg text-xs font-bold font-mono bg-white text-black hover:bg-[#e4e4e7] border border-white shadow-[0_0_12px_rgba(255,255,255,0.3)] active:scale-95 transition-all"
          >
            Apply Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
