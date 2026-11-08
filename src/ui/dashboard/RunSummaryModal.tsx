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
                {summary.isAttackRun && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold uppercase">
                    Attack Campaign: {summary.campaignName || 'Active Campaign'}
                  </span>
                )}
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
              (summary.isAttackRun ? (summary.legitimateSuccessRate ?? summary.successRatePercent) : summary.successRatePercent) >= 99
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                : (summary.isAttackRun ? (summary.legitimateSuccessRate ?? summary.successRatePercent) : summary.successRatePercent) >= 85
                ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
            }`}
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                {summary.isAttackRun
                  ? `Legitimate Success Rate: ${summary.legitimateSuccessRate ?? summary.successRatePercent}%`
                  : `Overall Result: ${summary.successRatePercent}% Success Rate`}
              </div>
              <div className="text-xs text-white/90 mt-1">
                {summary.isAttackRun
                  ? `${summary.totalSucceeded.toLocaleString()} requests succeeded while under ${summary.attackTrafficShare ?? 0}% malicious attack load.`
                  : `${summary.totalSucceeded.toLocaleString()} of ${summary.totalRequests.toLocaleString()} requests succeeded cleanly.`}
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black text-white">
                {summary.isAttackRun
                  ? `${summary.legitimateSuccessRate ?? summary.successRatePercent}%`
                  : `${summary.successRatePercent}%`}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
                Handled {summary.peakRpsHandled.toLocaleString()} peak RPS
              </div>
            </div>
          </div>

          {/* Security Impact & Attack Footprint (if Attack Run) */}
          {summary.isAttackRun && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/20 to-[#141417] border border-amber-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                  <span>🎯</span> Security Impact & Adversary Footprint
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 font-bold">
                  {summary.attackTrafficShare ?? 0}% Malicious Share
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-[#0e0e11] border border-[#27272a]">
                  <div className="text-[10px] text-[var(--color-text-muted)]">Exposure Events</div>
                  <div className={`text-base font-bold mt-0.5 ${(summary.exposureEvents ?? 0) > 0 ? 'text-red-400 font-black' : 'text-zinc-400'}`}>
                    {summary.exposureEvents ?? 0}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0e0e11] border border-[#27272a]">
                  <div className="text-[10px] text-[var(--color-text-muted)]">Compromised Servers</div>
                  <div className={`text-base font-bold mt-0.5 ${(summary.compromisedServersCount ?? 0) > 0 ? 'text-red-400 font-black' : 'text-zinc-400'}`}>
                    {summary.compromisedServersCount ?? 0}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0e0e11] border border-[#27272a]">
                  <div className="text-[10px] text-[var(--color-text-muted)]">Data Exfiltrated</div>
                  <div className={`text-base font-bold mt-0.5 ${(summary.dataEgressMb ?? 0) > 0 ? 'text-amber-300' : 'text-zinc-400'}`}>
                    {summary.dataEgressMb ? `${summary.dataEgressMb} MB` : '0 MB'}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0e0e11] border border-[#27272a]">
                  <div className="text-[10px] text-[var(--color-text-muted)]">First Failed Node</div>
                  <div className="text-xs font-bold text-white mt-0.5 truncate" title={summary.firstFailedComponent?.reason}>
                    {summary.firstFailedComponent ? summary.firstFailedComponent.nodeId : 'None'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Defense Effectiveness Report (Phase 8B) */}
          {summary.defenseReport && summary.defenseReport.defenses.length > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/20 to-[#141417] border border-cyan-500/40 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                  <span>🛡️</span> Defense Effectiveness Report
                </h3>
                {summary.defenseReport.previousRunDelta && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${
                      summary.defenseReport.previousRunDelta.legitSuccessRateDiff >= 0
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                    }`}
                  >
                    {summary.defenseReport.previousRunDelta.legitSuccessRateDiff >= 0 ? '+' : ''}
                    {summary.defenseReport.previousRunDelta.legitSuccessRateDiff}% Legit Success vs Prev Run
                  </span>
                )}
              </div>

              {/* Defense KPI Cards */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-[#0e0e11] border border-[#27272a]">
                  <div className="text-[10px] text-[var(--color-text-muted)]">Malicious Blocked</div>
                  <div className="text-base font-bold text-cyan-300 mt-0.5">
                    {summary.defenseReport.totalMaliciousBlockedCount.toLocaleString()}{' '}
                    <span className="text-[10px] font-normal text-cyan-400/80">
                      ({summary.defenseReport.totalMaliciousBlockedPercent}%)
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0e0e11] border border-[#27272a]">
                  <div className="text-[10px] text-[var(--color-text-muted)]">False Positives (Legit Blocked)</div>
                  <div
                    className={`text-base font-bold mt-0.5 ${
                      summary.defenseReport.totalFalsePositivesCount > 0 ? 'text-rose-400' : 'text-emerald-300'
                    }`}
                  >
                    {summary.defenseReport.totalFalsePositivesCount.toLocaleString()}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0e0e11] border border-[#27272a]">
                  <div className="text-[10px] text-[var(--color-text-muted)]">Autoscaling Cost</div>
                  <div className="text-base font-bold text-amber-300 mt-0.5">
                    ${summary.defenseReport.totalAutoscalingCostDollars.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Per-Defense Breakdown Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#27272a] text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      <th className="py-1.5 px-2">Defense</th>
                      <th className="py-1.5 px-2">Blocked Malicious</th>
                      <th className="py-1.5 px-2">False Positives</th>
                      <th className="py-1.5 px-2">Verdict</th>
                      <th className="py-1.5 px-2">Efficacy Assessment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202024]">
                    {summary.defenseReport.defenses.map((d) => {
                      const verdictBg =
                        d.verdict === 'effective'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : d.verdict === 'partially-effective'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : d.verdict === 'bypassed'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : d.verdict === 'hurt-legitimate-users'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700';

                      return (
                        <tr key={d.defenseKey} className="hover:bg-white/[0.02]">
                          <td className="py-2 px-2 font-bold text-white whitespace-nowrap">{d.label}</td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className="font-bold text-cyan-300">{d.blockedMaliciousCount.toLocaleString()}</span>
                            {d.blockedMaliciousPercent > 0 && (
                              <span className="text-[9px] text-[var(--color-text-muted)] ml-1">
                                ({d.blockedMaliciousPercent}%)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className={d.blockedLegitimateCount > 0 ? 'text-rose-400 font-bold' : 'text-zinc-400'}>
                              {d.blockedLegitimateCount.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase ${verdictBg}`}>
                              {d.verdict.replace(/-/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
                            {d.verdictReason}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Phase Timing Summaries */}
              {summary.defenseReport.phaseTimingSummaries.length > 0 && (
                <div className="pt-2 border-t border-[#27272a] space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-[var(--color-text-muted)]">
                    Phase Impact Breakdown (Legitimate Success Rate / P99 Latency)
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {summary.defenseReport.phaseTimingSummaries.map((ph) => (
                      <div
                        key={ph.phaseId}
                        className="p-2 rounded bg-[#0e0e11] border border-[#27272a] flex items-center justify-between text-[10px]"
                      >
                        <span className="font-bold text-white">{ph.name}</span>
                        <div className="flex items-center gap-4 text-[var(--color-text-muted)] font-mono">
                          <span>
                            Before:{' '}
                            <strong className="text-white">{ph.legitSuccessRateBefore}%</strong> (
                            {ph.p99LatencyBeforeMs}ms)
                          </span>
                          <span>
                            During:{' '}
                            <strong
                              className={ph.legitSuccessRateDuring < 80 ? 'text-rose-400' : 'text-amber-300'}
                            >
                              {ph.legitSuccessRateDuring}%
                            </strong>{' '}
                            ({ph.p99LatencyDuringMs}ms)
                          </span>
                          <span>
                            After:{' '}
                            <strong className="text-white">{ph.legitSuccessRateAfter}%</strong> (
                            {ph.p99LatencyAfterMs}ms)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmitigated Risks Alerts */}
              {summary.defenseReport.unmitigatedRisks.length > 0 && (
                <div className="pt-2 border-t border-[#27272a] space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-amber-300 flex items-center gap-1">
                    <span>⚠️</span> Unmitigated Risks & Architecture Gaps
                  </div>
                  <div className="space-y-1">
                    {summary.defenseReport.unmitigatedRisks.map((risk, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-amber-950/20 border border-amber-500/30 text-[10px] text-amber-200 leading-relaxed"
                      >
                        {risk}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Defender Takeaways (if Attack Run) */}
          {summary.isAttackRun && summary.defenderTakeaways && summary.defenderTakeaways.length > 0 && (
            <div className="p-4 rounded-xl bg-[#141417] border border-amber-500/30 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                <span>🛡️</span> Key Defender Takeaways
              </h3>
              <div className="space-y-2">
                {summary.defenderTakeaways.map((takeaway, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-[#0e0e11] border border-amber-500/20 text-xs text-amber-100/90 leading-relaxed flex items-start gap-2"
                  >
                    <span className="text-amber-400 font-bold shrink-0">✓</span>
                    <span>{takeaway}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
