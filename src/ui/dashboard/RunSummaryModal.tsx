/**
 * Post-Run Performance Summary & Remediation Modal.
 * Synthesizes what happened during the simulation run, identifying the first saturated component,
 * root bottleneck explanation, degraded duration, and suggested architecture fixes.
 */

import React, { useEffect } from 'react';
import {
  useMetricsStore,
  selectCurrentRunResult,
  selectIsRunSummaryOpen,
} from '../../store/metricsStore';
import { ComponentIcon } from '../components/ComponentIcon';
import { exportRunAsJson } from './exportRun';

export const RunSummaryModal: React.FC = () => {
  const isOpen = useMetricsStore(selectIsRunSummaryOpen);
  const closeSummary = useMetricsStore((s) => s.closeRunSummary);
  const runResult = useMetricsStore(selectCurrentRunResult);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeSummary();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeSummary]);

  if (!isOpen || !runResult) return null;

  const { summary } = runResult;

  const formatSec = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-summary-title"
    >
      <div className="w-full max-w-2xl bg-[#111113] border border-white/30 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#27272a] flex items-center justify-between bg-[#151518]">
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <div>
              <h2 id="run-summary-title" className="text-sm font-bold text-white tracking-wide uppercase">
                Simulation Run Summary
              </h2>
              <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2">
                <span>Hash: {runResult.configHash}</span>
                <span>•</span>
                <span>Seed: {runResult.seed}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportRunAsJson(runResult)}
              className="px-3 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Download RunResult JSON"
            >
              <span>⬇</span> Export JSON
            </button>
            <button
              type="button"
              onClick={closeSummary}
              className="w-8 h-8 rounded-lg text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 flex items-center justify-center text-sm transition-all"
              aria-label="Close run summary"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Key Outcome Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              summary.successRatePercent >= 99
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                : summary.successRatePercent >= 85
                ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
            }`}
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                Overall Result: {summary.successRatePercent}% Success Rate
              </div>
              <div className="text-xs text-white/90 mt-1">
                {summary.totalSucceeded.toLocaleString()} of {summary.totalRequests.toLocaleString()}{' '}
                requests succeeded cleanly.
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black text-white">{summary.successRatePercent}%</div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
                Handled {summary.peakRpsHandled.toLocaleString()} peak RPS
              </div>
            </div>
          </div>

          {/* Primary Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-[#141417] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Peak Handled</div>
              <div className="text-sm font-bold text-white mt-1">
                {summary.peakRpsHandled.toLocaleString()}{' '}
                <span className="text-[10px] font-normal text-[var(--color-text-faint)]">
                  / {summary.peakRpsOffered.toLocaleString()} RPS
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#141417] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Latency (Avg / P99)</div>
              <div className="text-sm font-bold text-white mt-1">
                {Math.round(summary.avgLatencyMs)}ms{' '}
                <span className="text-[10px] font-normal text-[var(--color-text-faint)]">
                  / {Math.round(summary.p99LatencyMs)}ms
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#141417] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Peak Amplification</div>
              <div
                className={`text-sm font-bold mt-1 ${
                  (summary.peakAmplificationFactor ?? 1) > 1.25 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {summary.peakAmplificationFactor ? summary.peakAmplificationFactor.toFixed(2) : '1.00'}x
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#141417] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Total Retries</div>
              <div className="text-sm font-bold text-amber-300 mt-1">
                {(summary.totalRetries ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Cascade Event Timeline */}
          {summary.cascadeTimeline && summary.cascadeTimeline.length > 0 && (
            <div className="p-4 rounded-xl bg-[#141417] border border-[#27272a] space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <span>⚡</span> Cascade Failure Timeline
              </h3>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {summary.cascadeTimeline.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-[#0e0e11] border border-[#27272a] flex items-start justify-between text-[11px]"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--color-text-muted)] font-mono">
                          {formatSec(item.timeMs)}
                        </span>
                        <span
                          className={`font-bold ${
                            item.severity === 'critical'
                              ? 'text-red-400'
                              : item.severity === 'warning'
                              ? 'text-amber-300'
                              : 'text-zinc-300'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
                        {item.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnosis: What Broke First */}
          <div className="p-4 rounded-xl bg-[#141417] border border-[#27272a] space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <span>🔍</span> Root Cause & Saturation Timeline
            </h3>

            {summary.firstSaturatedComponent ? (
              <div className="p-3 rounded-lg bg-[#0e0e11] border border-amber-500/30 flex items-start gap-3">
                <ComponentIcon type={summary.firstSaturatedComponent.type} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      First Saturated: {summary.firstSaturatedComponent.nodeId}
                    </span>
                    <span className="text-[10px] text-amber-300 font-semibold">
                      at t = {formatSec(summary.firstSaturatedComponent.timeMs)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    {summary.firstSaturatedComponent.reason}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 text-xs">
                No components experienced severe saturation during this run.
              </div>
            )}

            {summary.identifiedBottleneck && (
              <div className="text-xs text-[var(--color-text-secondary)] pt-1">
                <strong className="text-white">Identified System Bottleneck:</strong>{' '}
                {summary.identifiedBottleneck}
              </div>
            )}

            {(summary.timeSpentDegradedMs > 0 || summary.timeSpentCriticalMs > 0) && (
              <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-3 pt-1">
                <span>⏱ Time degraded: {(summary.timeSpentDegradedMs / 1000).toFixed(1)}s</span>
                <span>•</span>
                <span>Time critical: {(summary.timeSpentCriticalMs / 1000).toFixed(1)}s</span>
              </div>
            )}
          </div>

          {/* Suggested Fixes (Data-driven from Inventory) */}
          <div className="p-4 rounded-xl bg-[#141417] border border-[#27272a] space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <span>💡</span> Recommended Architectural Fixes
            </h3>

            <div className="space-y-2">
              {summary.suggestedFixes.map((fix, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-[#0e0e11] border border-[#27272a] flex items-start gap-3"
                >
                  <ComponentIcon type={fix.componentType} size={20} />
                  <div>
                    <h4 className="text-xs font-bold text-white">{fix.title}</h4>
                    <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
                      {fix.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#27272a] flex items-center justify-between bg-[#151518]">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            Run data stored in memory • Ready for future Compare mode
          </span>
          <button
            type="button"
            onClick={closeSummary}
            className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-[#e4e4e7] transition-all"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
