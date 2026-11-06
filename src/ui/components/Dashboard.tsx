import React from 'react';
import { useUiStore, selectIsDashboardOpen } from '@store';
import { useSimulationStore, selectSimMetrics } from '@store';

export const Dashboard: React.FC = () => {
  const isOpen = useUiStore(selectIsDashboardOpen);
  const toggleDashboard = useUiStore((s) => s.toggleDashboard);
  const metrics = useSimulationStore(selectSimMetrics);

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end">
      {/* Header Toggle Pill */}
      <button
        type="button"
        onClick={toggleDashboard}
        aria-expanded={isOpen}
        aria-label="Toggle System Metrics Dashboard"
        className="h-9 px-3.5 rounded-lg bg-[#131316] hover:bg-[#18181b] border border-[#3f3f46] hover:border-white text-white text-xs font-medium shadow-lg transition-all flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-[#f4f4f5] shadow-[0_0_4px_#ffffff]" />
        <span>System Metrics</span>
        <span className="text-xs font-mono text-[var(--color-text-muted)]">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded Metrics Shell */}
      {isOpen && (
        <div className="mt-2 w-80 p-4 rounded-xl bg-[#131316]/95 backdrop-blur-md border border-[#3f3f46] shadow-2xl space-y-3.5 transition-all animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-white">
              Live Telemetry
            </span>
            <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
              Phase 6 Active
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Throughput</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {metrics.currentThroughputRps} <span className="text-[10px] font-normal">rps</span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">P99 Latency</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {metrics.p99LatencyMs} <span className="text-[10px] font-normal">ms</span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Total Requests</div>
              <div className="text-sm font-bold text-white mt-0.5">{metrics.totalRequests}</div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#111113] border border-[#27272a]">
              <div className="text-[10px] text-[var(--color-text-muted)]">Success Rate</div>
              <div className="text-sm font-bold text-white mt-0.5">100%</div>
            </div>
          </div>

          <div className="p-2 rounded bg-[#18181b] border border-[#27272a] text-[11px] text-[var(--color-text-muted)]">
            Detailed time-series telemetry charts and queue depths will stream here during simulation runs.
          </div>
        </div>
      )}
    </div>
  );
};
