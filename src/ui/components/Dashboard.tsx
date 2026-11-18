/**
 * High-Performance System Monitoring Dashboard.
 * Three interactive states:
 *   1. Collapsed: Accessible health indicator pill with RPS and error rate.
 *   2. Compact (default): System overview telemetry cards and health diagnosis.
 *   3. Expanded: Multi-tab telemetry panel (Overview, Infrastructure Health, Charts).
 */

import React, { useEffect } from 'react';
import {
  useMetricsStore,
  selectDashboardState,
  selectActiveDashboardTab,
} from '../../store/metricsStore';
import {
  useSimulationStore,
  selectActiveMode,
  selectSimRps,
  selectRuntimeBottleneck,
} from '../../store/simulationStore';
import { useGraphStore, selectGraph } from '../../store/graphStore';
import { classifySystemHealth } from '../../engine/analysis/health';
import { OverviewTab } from '../dashboard/OverviewTab';
import { InfrastructureHealthTab } from '../dashboard/InfrastructureHealthTab';
import { ChartsTab } from '../dashboard/ChartsTab';

export const Dashboard: React.FC = () => {
  const dashboardState = useMetricsStore(selectDashboardState);
  const setDashboardState = useMetricsStore((s) => s.setDashboardState);
  const activeTab = useMetricsStore(selectActiveDashboardTab);
  const setActiveTab = useMetricsStore((s) => s.setActiveDashboardTab);
  const getActiveSample = useMetricsStore((s) => s.getActiveSample);

  const activeMode = useSimulationStore(selectActiveMode);
  const peakRps = useSimulationStore(selectSimRps);
  const bottleneck = useSimulationStore(selectRuntimeBottleneck);
  const graph = useGraphStore(selectGraph);

  const activeSample = getActiveSample();
  const system = activeSample?.system;

  const health = system
    ? classifySystemHealth(system, graph, bottleneck)
    : { status: 'healthy' as const, reason: 'Awaiting simulation traffic...', details: [] };

  const totalErrors = (system?.failedRps ?? 0) + (system?.rejectedRps ?? 0) + (system?.timedOutRps ?? 0);
  const totalCompleted = (system?.successfulRps ?? 0) + totalErrors;
  const errorRatePercent = totalCompleted > 0 ? Math.round((totalErrors / totalCompleted) * 100) : 0;

  // Keyboard accessibility: Escape collapses back to compact or collapsed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dashboardState === 'expanded') {
        setDashboardState('compact');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dashboardState, setDashboardState]);

  // Readout text from Phase 5
  const sampleReadout =
    activeMode === 'aggregate'
      ? `Simulating ${peakRps.toLocaleString()} req/s | Showing 20 sampled requests`
      : `Simulating ${peakRps.toLocaleString()} req/s | Showing ${system?.inFlightRequests ?? 0} in-flight`;

  // 1. Collapsed State: A small pill showing health indicator, incoming RPS, and error rate
  if (dashboardState === 'collapsed') {
    return (
      <aside
        className="absolute top-4 right-6 z-20 select-none animate-in fade-in"
        aria-label="Collapsed System Metrics Dashboard"
      >
        <button
          type="button"
          onClick={() => setDashboardState('compact')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#18181B] border border-white/20 text-[11px] font-mono text-white/90 shadow-md hover:border-white/50 transition-colors cursor-pointer"
          title="Click to expand dashboard"
        >
          {/* Health indicator dot */}
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{
              backgroundColor:
                health.status === 'healthy'
                  ? '#008604'
                  : health.status === 'degraded'
                    ? '#F59E0B'
                    : '#D9541E',
            }}
          />
          <span className="font-medium capitalize">{health.status}</span>
          <span className="text-[#A1A1AA]">
            {(system?.incomingRps ?? peakRps).toLocaleString()} RPS
          </span>
          <span
            className={
              errorRatePercent > 5 ? 'text-[#D9541E] font-semibold' : 'text-[#A1A1AA]'
            }
          >
            {errorRatePercent}% err
          </span>
          <span className="text-[#71717A] text-[9px]">▾</span>
        </button>
      </aside>
    );
  }

  // 2. Compact State (Default): Overview cards with batched updates, top bar controls
  if (dashboardState === 'compact') {
    return (
      <aside
        className="absolute top-4 right-4 z-20 w-88 p-4 rounded-2xl bg-[#131316]/95 backdrop-blur-md border border-[#3f3f46] shadow-2xl space-y-3 select-none font-mono text-xs animate-in fade-in slide-in-from-top-2"
        aria-label="System Metrics Overview"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-[#27272a]">
          <div className="flex items-center gap-2">
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${
                health.status === 'healthy'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : health.status === 'degraded'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              <span>{health.status === 'healthy' ? '●' : health.status === 'degraded' ? '▲' : '✖'}</span>
              <span>{health.status}</span>
            </span>
            <span className="text-[10px] uppercase font-bold text-white tracking-wider">
              Overview
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDashboardState('expanded')}
              className="px-2 py-0.5 rounded text-[11px] bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all"
              title="Expand into full dashboard"
            >
              ⛶ Expand
            </button>
            <button
              type="button"
              onClick={() => setDashboardState('collapsed')}
              className="w-6 h-6 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
              title="Collapse dashboard"
            >
              −
            </button>
          </div>
        </div>

        {/* Readout Subtitle */}
        <div className="text-[10px] text-[var(--color-text-muted)] truncate" title={sampleReadout}>
          {sampleReadout}
        </div>

        {/* Overview Metric Cards Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#111113] border border-[#27272a]">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Traffic In / Processed</div>
            <div className="text-sm font-bold text-white mt-1">
              {system ? system.incomingRps.toLocaleString() : '0'}{' '}
              <span className="text-[10px] font-normal text-[var(--color-text-faint)]">
                / {system ? system.successfulRps.toLocaleString() : '0'} RPS
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111113] border border-[#27272a]">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Rejections & Errors</div>
            <div
              className={`text-sm font-bold mt-1 ${
                totalErrors > 0 ? 'text-amber-300' : 'text-white/60'
              }`}
            >
              {totalErrors.toLocaleString()}{' '}
              <span className="text-[10px] font-normal text-[var(--color-text-faint)]">RPS</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111113] border border-[#27272a]">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Latency (Avg / P99)</div>
            <div className="text-sm font-bold text-white mt-1">
              {system ? Math.round(system.avgLatencyMs) : 0}ms{' '}
              <span className="text-[10px] font-normal text-[var(--color-text-faint)]">
                / {system ? Math.round(system.p99Ms) : 0}ms
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111113] border border-[#27272a]">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase">In-Flight / Servers</div>
            <div className="text-sm font-bold text-white mt-1">
              {system ? system.inFlightRequests.toLocaleString() : '0'}{' '}
              <span className="text-[10px] font-normal text-[var(--color-text-faint)]">
                ({system ? system.healthyServerCount : 0}/{system?.totalServerInstances ?? 0} up)
              </span>
            </div>
          </div>
        </div>

        {/* Health Plain-Language Reason Footer */}
        <div className="p-2.5 rounded-xl bg-[#141417] border border-[#27272a] text-[11px] text-white/90 leading-relaxed">
          {health.reason}
        </div>
      </aside>
    );
  }

  // 3. Expanded State: Full multi-tab dashboard
  return (
    <aside
      className="absolute top-4 right-4 z-30 w-[720px] max-w-[calc(100vw-22rem)] max-h-[calc(100vh-6rem)] p-5 rounded-2xl bg-[#111113]/98 backdrop-blur-xl border border-white/20 shadow-2xl flex flex-col font-mono text-xs select-none animate-in fade-in zoom-in-95 duration-150"
      aria-label="Expanded Infrastructure Dashboard"
      role="region"
    >
      {/* Top Header & Readout */}
      <div className="flex items-center justify-between pb-3 border-b border-[#27272a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#18181b] border border-[#27272a]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                activeMode === 'aggregate' ? 'bg-amber-400' : 'bg-cyan-400'
              }`}
            />
            <span className="text-[10px] uppercase font-bold text-white tracking-wider">
              {activeMode} Mode
            </span>
          </div>

          <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline">
            {sampleReadout}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDashboardState('compact')}
            className="px-2.5 py-1 rounded-lg bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all text-[11px]"
            title="Minimize to compact view"
          >
            ⤢ Compact
          </button>
          <button
            type="button"
            onClick={() => setDashboardState('collapsed')}
            className="w-7 h-7 rounded-lg text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
            title="Collapse dashboard"
            aria-label="Collapse dashboard"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-1 pt-3 pb-3 shrink-0" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'overview'
              ? 'bg-white text-black shadow-sm font-bold'
              : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'health'}
          onClick={() => setActiveTab('health')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'health'
              ? 'bg-white text-black shadow-sm font-bold'
              : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          Infrastructure Health
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'charts'}
          onClick={() => setActiveTab('charts')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'charts'
              ? 'bg-white text-black shadow-sm font-bold'
              : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          Time-Series Charts
        </button>
      </div>

      {/* Tab Content Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto pr-1">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'health' && <InfrastructureHealthTab />}
        {activeTab === 'charts' && <ChartsTab />}
      </div>
    </aside>
  );
};
