/**
 * Live System Telemetry Dashboard.
 * Displays real-time simulation counters, latency percentiles, and throughput.
 */

import React from 'react';
import {
  useUiStore,
  selectIsDashboardOpen,
  useSimulationStore,
  selectSimCounters,
  selectSimLatencySummary,
  selectSimPlayStatus,
} from '../../store';

export const Dashboard: React.FC = () => {
  const isOpen = useUiStore(selectIsDashboardOpen);
  const toggleDashboard = useUiStore((s) => s.toggleDashboard);
  const counters = useSimulationStore(selectSimCounters);
  const latency = useSimulationStore(selectSimLatencySummary);
  const status = useSimulationStore(selectSimPlayStatus);

  const successRate =
    counters.created > 0
      ? Math.round(
          (counters.succeeded / Math.max(1, counters.succeeded + counters.failed + counters.rejected + counters.timedOut)) *
            100
        )
      : 100;

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end select-none">
      {/* Header Toggle Pill */}
      <button
        type="button"
        onClick={toggleDashboard}
        aria-expanded={isOpen}
        aria-label="Toggle System Metrics Dashboard"
        className="h-9 px-3.5 rounded-lg bg-[#131316] hover:bg-[#18181b] border border-[#3f3f46] hover:border-white text-white text-xs font-medium shadow-lg transition-all flex items-center gap-2"
      >
        <span
          className={`w-2 h-2 rounded-full ${
            status === 'running'
              ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]'
              : 'bg-[#f4f4f5] shadow-[0_0_4px_#ffffff]'
          }`}
        />
        <span>System Metrics</span>
        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-white/80">
          {counters.inFlight} in-flight
        </span>
        <span className="text-xs font-mono text-[var(--color-text-muted)]">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded Metrics Shell */}
      {isOpen && (
        <div className="mt-2 w-84 p-4 rounded-xl bg-[#131316]/95 backdrop-blur-md border border-[#3f3f46] shadow-2xl space-y-3.5 transition-all animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-white">
              Live Telemetry
            </span>
            <span className="text-[10px] font-mono text-[var(--color-text-faint)] uppercase">
              Status: {status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {/* Created */}
            <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Total Created</div>
              <div className="text-sm font-bold text-white mt-0.5">{counters.created}</div>
            </div>

            {/* In-Flight */}
            <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">In-Flight</div>
              <div className="text-sm font-bold text-white mt-0.5">{counters.inFlight}</div>
            </div>

            {/* Succeeded */}
            <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Succeeded (200)</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">{counters.succeeded}</div>
            </div>

            {/* Rejected */}
            <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Rejected (503)</div>
              <div className="text-sm font-bold text-amber-300 mt-0.5">{counters.rejected}</div>
            </div>

            {/* Failed */}
            <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Failed / Errors</div>
              <div className="text-sm font-bold text-rose-400 mt-0.5">{counters.failed}</div>
            </div>

            {/* Timed Out */}
            <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Timed-out (504)</div>
              <div className="text-sm font-bold text-orange-400 mt-0.5">{counters.timedOut}</div>
            </div>

            {/* Wasted Work if any */}
            {(counters.wastedWork ?? 0) > 0 && (
              <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
                <div className="text-[10px] text-[var(--color-text-muted)]">Wasted Work</div>
                <div className="text-sm font-bold text-red-400 mt-0.5">{counters.wastedWork}</div>
              </div>
            )}

            {/* Average Latency */}
            <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Avg Latency</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {latency.averageMs} <span className="text-[10px] font-normal text-[#a1a1aa]">ms</span>
              </div>
            </div>

            {/* P99 Latency */}
            <div className="p-2 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">P99 Latency</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {latency.p99Ms} <span className="text-[10px] font-normal text-[#a1a1aa]">ms</span>
              </div>
            </div>
          </div>

          <div className="p-2 rounded bg-[#18181b] border border-[#27272a] flex items-center justify-between text-xs font-mono">
            <span className="text-[var(--color-text-muted)]">Success Rate:</span>
            <span className="text-white font-bold">{successRate}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
