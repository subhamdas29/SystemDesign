/**
 * System Overview Dashboard Tab.
 * Displays real-time aggregated throughput, latency percentiles,
 * server instance status, and health diagnosis.
 */

import React from 'react';
import {
  useMetricsStore,
  selectTimeTravelTime,
  selectCurrentRunResult,
} from '../../store/metricsStore';
import { useGraphStore, selectGraph } from '../../store/graphStore';
import { useSimulationStore, selectRuntimeBottleneck, selectSimPlayStatus } from '../../store/simulationStore';
import { classifySystemHealth } from '../../engine/analysis/health';

export const OverviewTab: React.FC = () => {
  const getActiveSample = useMetricsStore((s) => s.getActiveSample);
  const timeTravelTime = useMetricsStore(selectTimeTravelTime);
  const setTimeTravelTime = useMetricsStore((s) => s.setTimeTravelTime);
  const openRunSummary = useMetricsStore((s) => s.openRunSummary);
  const currentRunResult = useMetricsStore(selectCurrentRunResult);

  const graph = useGraphStore(selectGraph);
  const bottleneck = useSimulationStore(selectRuntimeBottleneck);
  const playStatus = useSimulationStore(selectSimPlayStatus);

  const activeSample = getActiveSample();
  const system = activeSample?.system;

  const health = system
    ? classifySystemHealth(system, graph, bottleneck)
    : { status: 'healthy' as const, reason: 'Awaiting simulation traffic...', details: [] };

  const formatSec = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4 font-mono select-none" role="tabpanel" aria-label="System Overview">
      {/* Time-Travel Historical Viewing Banner */}
      {timeTravelTime !== null && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <span>⏱</span>
            <span>
              Viewing Historical Snapshot: <strong>t = {formatSec(timeTravelTime)}</strong> ({timeTravelTime}ms)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTimeTravelTime(null)}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-white text-[11px] font-semibold transition-all"
          >
            ← Back to Live
          </button>
        </div>
      )}

      {/* Overall Health Status Card */}
      <div
        className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
          health.status === 'healthy'
            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
            : health.status === 'degraded'
            ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
            : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
        }`}
      >
        <span className="text-base mt-0.5">
          {health.status === 'healthy' ? '●' : health.status === 'degraded' ? '▲' : '✖'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">
              System Health: {health.status}
            </span>
            {currentRunResult && (
              <button
                type="button"
                onClick={openRunSummary}
                className="text-[11px] underline hover:text-white transition-colors"
              >
                View Run Summary ↗
              </button>
            )}
          </div>
          <p className="text-xs text-white/90 mt-1 leading-relaxed">{health.reason}</p>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {/* Incoming Traffic */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Incoming Traffic
          </div>
          <div className="text-lg font-bold text-white mt-1">
            {system ? system.incomingRps.toLocaleString() : '0'}
            <span className="text-xs font-normal text-[var(--color-text-faint)] ml-1">RPS</span>
          </div>
        </div>

        {/* Processed (200 OK) */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Processed Rate
          </div>
          <div className="text-lg font-bold text-[#f4f4f5] mt-1">
            {system ? system.successfulRps.toLocaleString() : '0'}
            <span className="text-xs font-normal text-[var(--color-text-faint)] ml-1">RPS</span>
          </div>
        </div>

        {/* Failed / Rejected */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Rejections & Errors
          </div>
          <div
            className={`text-lg font-bold mt-1 ${
              (system?.rejectedRps ?? 0) + (system?.failedRps ?? 0) + (system?.timedOutRps ?? 0) > 0
                ? 'text-amber-300'
                : 'text-white/60'
            }`}
          >
            {system
              ? (system.rejectedRps + system.failedRps + system.timedOutRps).toLocaleString()
              : '0'}
            <span className="text-xs font-normal text-[var(--color-text-faint)] ml-1">RPS</span>
          </div>
        </div>

        {/* In-Flight */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            In-Flight Requests
          </div>
          <div className="text-lg font-bold text-white mt-1">
            {system ? system.inFlightRequests.toLocaleString() : '0'}
          </div>
        </div>

        {/* Avg Latency */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Average Latency
          </div>
          <div className="text-base font-bold text-white mt-1">
            {system ? Math.round(system.avgLatencyMs) : 0}
            <span className="text-xs font-normal text-[var(--color-text-faint)] ml-1">ms</span>
          </div>
        </div>

        {/* P95 Latency */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            P95 Latency
          </div>
          <div className="text-base font-bold text-white mt-1">
            {system ? Math.round(system.p95Ms) : 0}
            <span className="text-xs font-normal text-[var(--color-text-faint)] ml-1">ms</span>
          </div>
        </div>

        {/* P99 Latency */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            P99 Latency
          </div>
          <div className="text-base font-bold text-white mt-1">
            {system ? Math.round(system.p99Ms) : 0}
            <span className="text-xs font-normal text-[var(--color-text-faint)] ml-1">ms</span>
          </div>
        </div>

        {/* Servers Online */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            App Server Instances
          </div>
          <div className="text-base font-bold text-white mt-1">
            {system ? `${system.healthyServerCount} / ${system.totalServerInstances}` : '0 / 0'}
            <span className="text-[10px] font-normal text-[var(--color-text-faint)] ml-1.5">
              healthy
            </span>
          </div>
        </div>

        {/* Load Amplification Factor */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Load Amplification
          </div>
          <div
            className={`text-base font-bold mt-1 ${
              (system?.amplificationFactor ?? 1) > 1.25
                ? 'text-rose-400'
                : (system?.amplificationFactor ?? 1) > 1.05
                ? 'text-amber-300'
                : 'text-white'
            }`}
          >
            {system?.amplificationFactor ? system.amplificationFactor.toFixed(2) : '1.00'}
            <span className="text-xs font-normal text-[var(--color-text-faint)] ml-1">x</span>
          </div>
        </div>

        {/* Retries & Active Chaos */}
        <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Retries & Chaos
          </div>
          <div className="text-base font-bold text-white mt-1">
            {system?.retryRps ?? 0}
            <span className="text-[10px] font-normal text-[var(--color-text-faint)] ml-1">
              retries/s
            </span>
            {(system?.activeFailureCount ?? 0) > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] bg-red-950 text-red-300 border border-red-500/50">
                {system?.activeFailureCount} fail
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottleneck Callout Banner if detected */}
      {bottleneck && (
        <div className="p-3.5 rounded-xl bg-[#18181b] border border-amber-500/40 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-amber-400 font-bold">⚠️ BOTTLENECK:</span>
            <span className="text-white font-semibold">{bottleneck.nodeId}</span>
            <span className="text-[var(--color-text-secondary)]">({bottleneck.reason})</span>
          </div>
          {playStatus === 'completed' && (
            <button
              type="button"
              onClick={openRunSummary}
              className="px-2.5 py-1 rounded bg-white text-black font-semibold text-[11px] hover:bg-[#e4e4e7] transition-all"
            >
              Analyze Run
            </button>
          )}
        </div>
      )}
    </div>
  );
};
