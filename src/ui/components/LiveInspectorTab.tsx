/**
 * Live Telemetry Inspector Tab for Components.
 * Batched at ~10 Hz, displaying component-specific metrics, sparklines over
 * the last 60 seconds from bounded ring buffers, status reasons, and bottleneck links.
 */

import React, { useMemo } from 'react';
import { GraphNode } from '../../types';
import {
  useSimulationStore,
  selectRuntimeNodes,
  selectSimCounters,
  selectSimLatencySummary,
  selectSimRecentEvents,
  selectSimTimeMs,
  selectStaticCapacity,
  selectRuntimeBottleneck,
} from '../../store/simulationStore';
import { deriveLiveMetrics } from '../inspector/liveViewModel';
import { SimulationSnapshot } from '../../engine/protocol';

interface LiveInspectorTabProps {
  node: GraphNode;
}

// Sparkline SVG renderer
const Sparkline: React.FC<{
  label: string;
  points: { timeMs: number; value: number }[];
  currentValue: number;
  unit: string;
}> = ({ label, points, currentValue, unit }) => {
  const width = 240;
  const height = 36;
  const padding = 4;

  const pathData = useMemo(() => {
    if (points.length < 2) return '';
    const maxVal = Math.max(1, ...points.map((p) => p.value));
    const minTime = points[0]!.timeMs;
    const maxTime = Math.max(minTime + 1, points[points.length - 1]!.timeMs);

    const coords = points.map((p, idx) => {
      const x = padding + ((p.timeMs - minTime) / (maxTime - minTime)) * (width - padding * 2);
      const y = padding + (height - padding * 2) - (p.value / maxVal) * (height - padding * 2);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    return coords.join(' ');
  }, [points]);

  return (
    <div className="p-2.5 bg-[#0b0b0d] rounded-lg border border-[#27272a] space-y-1 font-mono">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[var(--color-text-muted)] uppercase tracking-wider">{label}</span>
        <span className="text-white font-bold">
          {currentValue.toLocaleString()} {unit}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8 overflow-hidden rounded">
        {pathData ? (
          <path d={pathData} fill="none" stroke="#ffffff" strokeWidth="1.5" />
        ) : (
          <line
            x1="4"
            y1={height / 2}
            x2={width - 4}
            y2={height / 2}
            stroke="#3f3f46"
            strokeDasharray="2 2"
          />
        )}
      </svg>
      <div className="flex items-center justify-between text-[9px] text-[var(--color-text-faint)]">
        <span>-60s</span>
        <span>Now</span>
      </div>
    </div>
  );
};

export const LiveInspectorTab: React.FC<LiveInspectorTabProps> = ({ node }) => {
  const runtimeNodes = useSimulationStore(selectRuntimeNodes);
  const counters = useSimulationStore(selectSimCounters);
  const latencySummary = useSimulationStore(selectSimLatencySummary);
  const recentEvents = useSimulationStore(selectSimRecentEvents);
  const simTimeMs = useSimulationStore(selectSimTimeMs);
  const staticCapacity = useSimulationStore(selectStaticCapacity);
  const runtimeBottleneck = useSimulationStore(selectRuntimeBottleneck);
  const getNodeHistory = useSimulationStore((s) => s.getNodeHistory);

  const snapshot: SimulationSnapshot = useMemo(
    () => ({
      timeMs: simTimeMs,
      runtimeNodes,
      counters,
      latencySummary,
      recentEvents,
      eventCursor: 0,
      isDone: false,
    }),
    [simTimeMs, runtimeNodes, counters, latencySummary, recentEvents]
  );

  const history = getNodeHistory(node.id);
  const metrics = deriveLiveMetrics(node, snapshot, history.points1, history.points2);

  const isBottleneck =
    staticCapacity?.bottleneckNodeId === node.id ||
    runtimeBottleneck?.nodeId === node.id;

  return (
    <div className="space-y-3.5 text-xs">
      {/* Bottleneck Alert Banner if applicable */}
      {isBottleneck && (
        <div className="p-2.5 bg-white/10 border border-white rounded-xl shadow-[0_0_12px_rgba(255,255,255,0.2)]">
          <div className="flex items-center gap-1.5 font-bold text-white text-[11px]">
            <span>⚠️</span>
            <span>IDENTIFIED BOTTLENECK</span>
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            {staticCapacity?.explanation}
          </p>
        </div>
      )}

      {/* Operational Health Status */}
      <div className="p-3 bg-[#18181b] rounded-lg border border-[#27272a] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">
            Node Status
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
              metrics.status === 'healthy'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : metrics.status === 'warning'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {metrics.status}
          </span>
        </div>
        <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
          {metrics.statusReason}
        </p>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 font-mono">
        <div className="p-2 rounded bg-[#18181b] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)]">Active Rate</div>
          <div className="text-sm font-bold text-white mt-0.5">
            {metrics.currentRps.toLocaleString()} <span className="text-[10px] font-normal text-[#a1a1aa]">RPS</span>
          </div>
        </div>

        <div className="p-2 rounded bg-[#18181b] border border-[#27272a]">
          <div className="text-[10px] text-[var(--color-text-muted)]">Utilization</div>
          <div className="text-sm font-bold text-white mt-0.5">
            {metrics.utilizationPercent}%
          </div>
        </div>
      </div>

      {/* Component-Specific Live Metrics */}
      {metrics.appServer && (
        <div className="space-y-2 p-3 bg-[#18181b] rounded-lg border border-[#27272a] font-mono text-[11px]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] block mb-1">
            App Server Telemetry
          </span>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Processed:</span>
            <span className="text-white font-bold">{metrics.appServer.processedRps.toLocaleString()} req/s</span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Active In-Flight:</span>
            <span className="text-white">{metrics.appServer.activeRequests} reqs</span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Queue:</span>
            <span className="text-white font-bold">
              {metrics.appServer.queueDepth} / {metrics.appServer.queueLimit}
            </span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Est. CPU (from util):</span>
            <span className="text-white">{metrics.appServer.estimatedCpuPercent}%</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-[var(--color-text-muted)]">Est. Memory (from util):</span>
            <span className="text-white">{metrics.appServer.estimatedMemoryMb} MB</span>
          </div>
        </div>
      )}

      {metrics.loadBalancer && (
        <div className="space-y-2 p-3 bg-[#18181b] rounded-lg border border-[#27272a] font-mono text-[11px]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] block mb-1">
            Load Balancer Backend Distribution
          </span>
          <div className="text-[10px] text-[var(--color-text-muted)] mb-1">
            Algorithm: <span className="text-white font-bold">{metrics.loadBalancer.algorithm}</span>
          </div>
          <div className="space-y-1.5 pt-1">
            {metrics.loadBalancer.backends.map((b) => (
              <div key={b.id} className="space-y-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className={b.health === 'down' ? 'text-red-400 line-through' : 'text-white'}>
                    {b.label}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {b.activeConnections} conns ({b.sharePercent}%)
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#222226] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${b.health === 'down' ? 'bg-red-500' : 'bg-white'}`}
                    style={{ width: `${b.sharePercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.cache && (
        <div className="space-y-2 p-3 bg-[#18181b] rounded-lg border border-[#27272a] font-mono text-[11px]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] block mb-1">
            In-Memory Cache Metrics
          </span>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Observed Hit Ratio:</span>
            <span className="text-white font-bold">{metrics.cache.observedHitRatio}%</span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Configured Hit Ratio:</span>
            <span className="text-white">{metrics.cache.configuredHitRatio}%</span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Cache Hits:</span>
            <span className="text-emerald-400 font-bold">{metrics.cache.hits}</span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Cache Misses:</span>
            <span className="text-amber-300 font-bold">{metrics.cache.misses}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-[var(--color-text-muted)]">Est. Memory Util:</span>
            <span className="text-white">{metrics.cache.estimatedMemoryPercent}%</span>
          </div>
        </div>
      )}

      {metrics.database && (
        <div className="space-y-2 p-3 bg-[#18181b] rounded-lg border border-[#27272a] font-mono text-[11px]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] block mb-1">
            Primary Database Metrics
          </span>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Query Rate:</span>
            <span className="text-white font-bold">{metrics.database.queryRateQps.toLocaleString()} QPS</span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Read / Write Split:</span>
            <span className="text-white">
              {metrics.database.readRateQps} read / {metrics.database.writeRateQps} write
            </span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Connection Pool:</span>
            <span className="text-white font-bold">
              {metrics.database.activeConnections} / {metrics.database.poolSize}
            </span>
          </div>
          <div className="flex justify-between py-0.5 border-b border-[#222226]">
            <span className="text-[var(--color-text-muted)]">Waiting Queries:</span>
            <span className="text-white font-bold">{metrics.database.waitingQueries}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-[var(--color-text-muted)]">Latency (Avg / P95):</span>
            <span className="text-white">
              {metrics.database.avgLatencyMs}ms / {metrics.database.p95LatencyMs}ms
            </span>
          </div>
        </div>
      )}

      {/* Sparklines (Last 60 Seconds) */}
      <div className="space-y-2 pt-1">
        <Sparkline
          label={metrics.sparkline1.label}
          points={metrics.sparkline1.points}
          currentValue={metrics.sparkline1.currentValue}
          unit={metrics.sparkline1.unit}
        />
        <Sparkline
          label={metrics.sparkline2.label}
          points={metrics.sparkline2.points}
          currentValue={metrics.sparkline2.currentValue}
          unit={metrics.sparkline2.unit}
        />
      </div>
    </div>
  );
};
