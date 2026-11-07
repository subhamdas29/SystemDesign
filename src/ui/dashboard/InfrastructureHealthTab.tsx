/**
 * Infrastructure Health Dashboard Tab.
 * Lists all infrastructure components with health diagnosis, utilization bars,
 * queue metrics, CPU/memory estimations, and interactive canvas synchronization.
 */

import React, { useState, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useGraphStore, selectGraph } from '../../store/graphStore';
import { useMetricsStore } from '../../store/metricsStore';
import { useSimulationStore, selectRuntimeBottleneck } from '../../store/simulationStore';
import { useUiStore } from '../../store/uiStore';
import { ComponentIcon } from '../components/ComponentIcon';
import { NodeMetricSample } from '../../types/metrics';
import { COMPONENT_RULES } from '../../builder/rules/slotRules';
import { computeLayout } from '../../builder/layout';

export const InfrastructureHealthTab: React.FC = () => {
  const graph = useGraphStore(selectGraph);
  const selectNode = useUiStore((s) => s.selectNode);
  const bottleneck = useSimulationStore(selectRuntimeBottleneck);
  const getActiveSample = useMetricsStore((s) => s.getActiveSample);
  const getNodeHistory = useMetricsStore((s) => s.getNodeHistory);
  const { setCenter } = useReactFlow();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'status' | 'utilization' | 'name'>('status');
  const [isAppGroupExpanded, setIsAppGroupExpanded] = useState<boolean>(true);

  const activeSample = getActiveSample();

  // Extract all nodes and separate multiple app-servers if needed
  const { appServers, otherNodes } = useMemo(() => {
    const nodeMetrics = activeSample?.nodes ?? {};
    const apps: { id: string; metric?: NodeMetricSample; label: string }[] = [];
    const others: { id: string; metric?: NodeMetricSample; label: string; isBottleneck: boolean }[] = [];

    for (const node of graph.nodes) {
      const metric = nodeMetrics[node.id];
      const isBottleneck = bottleneck?.nodeId === node.id;
      const label = node.label || COMPONENT_RULES[node.type]?.label || node.id;

      if (node.type === 'app-server' && graph.nodes.filter((n) => n.type === 'app-server').length > 1) {
        apps.push({ id: node.id, metric, label });
      } else {
        others.push({ id: node.id, metric, label, isBottleneck });
      }
    }

    return { appServers: apps, otherNodes: others };
  }, [graph.nodes, activeSample, bottleneck]);

  // Aggregate stats for app-server group
  const appGroupAggregate = useMemo(() => {
    if (appServers.length <= 1) return null;

    let totalRps = 0;
    let totalQueue = 0;
    let totalQueueLimit = 0;
    let utilSum = 0;
    let maxCpu = 0;
    let totalMem = 0;
    let worstStatus: NodeMetricSample['status'] = 'healthy';

    for (const app of appServers) {
      if (!app.metric) continue;
      totalRps += app.metric.processedRps;
      totalQueue += app.metric.queueLength;
      totalQueueLimit += app.metric.queueLimit;
      utilSum += app.metric.utilization;
      maxCpu = Math.max(maxCpu, app.metric.estimatedCpuPercent);
      totalMem += app.metric.estimatedMemoryMb;

      if (app.metric.status === 'failed') worstStatus = 'failed';
      else if (app.metric.status === 'overloaded' && worstStatus !== 'failed') worstStatus = 'overloaded';
      else if (app.metric.status === 'warning' && worstStatus === 'healthy') worstStatus = 'warning';
    }

    return {
      count: appServers.length,
      processedRps: totalRps,
      queueLength: totalQueue,
      queueLimit: totalQueueLimit,
      avgUtilization: Math.round((utilSum / appServers.length) * 100) / 100,
      estimatedCpu: maxCpu,
      estimatedMem: totalMem,
      status: worstStatus,
      isBottleneck: appServers.some((a) => bottleneck?.nodeId === a.id),
    };
  }, [appServers, bottleneck]);

  // Handle row click: highlight on canvas, center camera, open Live tab
  const handleRowClick = (nodeId: string) => {
    selectNode(nodeId);
    const layout = computeLayout(graph);
    const pos = layout[nodeId];
    if (pos) {
      setCenter(pos.x + 90, pos.y + 40, { duration: 450 });
    }
  };

  // Status badge helper (Monochrome-first with icon & text)
  const renderStatusBadge = (status: NodeMetricSample['status'] = 'healthy') => {
    if (status === 'failed') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
          <span>✖</span> Failed
        </span>
      );
    }
    if (status === 'overloaded') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
          <span>■</span> Overloaded
        </span>
      );
    }
    if (status === 'warning') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-white/10 text-white/90 border border-white/20 flex items-center gap-1">
          <span>▲</span> Warning
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
        <span>●</span> Healthy
      </span>
    );
  };

  // Sparkline renderer
  const renderMiniSparkline = (nodeId: string) => {
    const history = getNodeHistory(nodeId);
    if (history.length < 2) return null;

    const maxRps = Math.max(1, ...history.map((h) => h.rps));
    const width = 64;
    const height = 18;
    const points = history
      .map((h, i) => {
        const x = (i / (history.length - 1)) * width;
        const y = height - (h.rps / maxRps) * (height - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    return (
      <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
        <polyline points={points} fill="none" stroke="#d4d4d8" strokeWidth={1.5} />
      </svg>
    );
  };

  return (
    <div className="space-y-3 font-mono text-xs select-none" role="tabpanel" aria-label="Infrastructure Health">
      {/* Table Controls (Filter & Sort) */}
      <div className="flex items-center justify-between pb-2 border-b border-[#27272a]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Filter:
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-6 px-2 rounded bg-[#18181b] border border-[#3f3f46] text-white font-mono text-[11px] outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="overloaded">Overloaded</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Sort by:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'status' | 'utilization' | 'name')}
            className="h-6 px-2 rounded bg-[#18181b] border border-[#3f3f46] text-white font-mono text-[11px] outline-none"
          >
            <option value="status">Status (Critical first)</option>
            <option value="utilization">Utilization %</option>
            <option value="name">Component Name</option>
          </select>
        </div>
      </div>

      {/* Nodes Table List */}
      <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
        {/* App Server Aggregate Group Row if multiple */}
        {appGroupAggregate && (
          <div className="rounded-xl border border-[#3f3f46] bg-[#141417] overflow-hidden">
            <div
              onClick={() => setIsAppGroupExpanded(!isAppGroupExpanded)}
              className="p-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1e] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-text-faint)]">
                  {isAppGroupExpanded ? '▼' : '▶'}
                </span>
                <ComponentIcon type="app-server" size={20} />
                <div>
                  <div className="font-semibold text-white flex items-center gap-2">
                    <span>App Servers ({appGroupAggregate.count} instances)</span>
                    {appGroupAggregate.isBottleneck && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Bottleneck
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    Total: {appGroupAggregate.processedRps.toLocaleString()} RPS • Queue:{' '}
                    {appGroupAggregate.queueLength} / {appGroupAggregate.queueLimit}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Aggregate Util Bar */}
                <div className="w-24 text-right">
                  <div className="text-[10px] text-white">
                    {Math.round(appGroupAggregate.avgUtilization * 100)}% util
                  </div>
                  <div className="h-1.5 w-full bg-[#27272a] rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-white transition-all"
                      style={{ width: `${Math.min(100, appGroupAggregate.avgUtilization * 100)}%` }}
                    />
                  </div>
                </div>

                {renderStatusBadge(appGroupAggregate.status)}
              </div>
            </div>

            {/* Expanded Child App Server Rows */}
            {isAppGroupExpanded && (
              <div className="border-t border-[#27272a] bg-[#0c0c0e] divide-y divide-[#1f1f23] pl-6">
                {appServers.map((app) => (
                  <div
                    key={app.id}
                    onClick={() => handleRowClick(app.id)}
                    className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-faint)]">↳</span>
                      <span className="font-semibold text-white/90">{app.label}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        ({app.metric?.processedRps ?? 0} RPS)
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        CPU: {app.metric?.estimatedCpuPercent ?? 0}%
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        Queue: {app.metric?.queueLength ?? 0}
                      </span>
                      {renderStatusBadge(app.metric?.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Regular Infrastructure Rows */}
        {otherNodes.map((item) => {
          const m = item.metric;
          const isBottleneck = item.isBottleneck;

          return (
            <div
              key={item.id}
              onClick={() => handleRowClick(item.id)}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                isBottleneck
                  ? 'bg-[#18181b] border-white shadow-[0_0_12px_rgba(255,255,255,0.15)] ring-1 ring-white/40'
                  : 'bg-[#111113] border-[#27272a] hover:border-[#3f3f46] hover:bg-[#151518]'
              }`}
            >
              {/* Left Column: Icon + Name + Subtitle */}
              <div className="flex items-center gap-3 min-w-0">
                <ComponentIcon type={m?.type ?? 'app-server'} size={22} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white truncate">{item.label}</span>
                    {isBottleneck && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Active Bottleneck
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2">
                    <span>{m ? m.processedRps.toLocaleString() : 0} RPS</span>
                    <span>•</span>
                    <span>
                      Queue: {m ? m.queueLength : 0} / {m?.queueLimit ?? 100}
                    </span>
                    <span>•</span>
                    <span title="Model estimation">
                      CPU: {m?.estimatedCpuPercent ?? 0}% <span className="text-[9px] opacity-60">(est)</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Sparkline + Utilization Bar + Status */}
              <div className="flex items-center gap-4 shrink-0">
                {/* 60s Sparkline */}
                <div className="hidden sm:block">{renderMiniSparkline(item.id)}</div>

                {/* Utilization Progress Bar */}
                <div className="w-20 text-right">
                  <div className="text-[10px] text-white">
                    {Math.round((m?.utilization ?? 0) * 100)}%
                  </div>
                  <div className="h-1.5 w-full bg-[#27272a] rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full transition-all ${
                        (m?.utilization ?? 0) > 0.9
                          ? 'bg-amber-400'
                          : (m?.utilization ?? 0) > 0.75
                          ? 'bg-white'
                          : 'bg-[#a1a1aa]'
                      }`}
                      style={{ width: `${Math.min(100, (m?.utilization ?? 0) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Status Badge */}
                {renderStatusBadge(m?.status)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
