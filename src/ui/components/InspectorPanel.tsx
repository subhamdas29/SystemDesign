import React, { useState } from 'react';
import { useGraphStore, selectGraph, selectNodes } from '@store';
import { useUiStore, selectSelectedNodeId, selectSelectedEdgeId } from '@store';
import { useSimulationStore, selectStaticCapacity, selectRuntimeBottleneck } from '@store';
import { COMPONENT_RULES, canRemove, canSwap, ComponentSlotRule } from '@builder';
import { ComponentIcon } from './ComponentIcon';
import { ConfigForm } from './ConfigForm';
import { LiveInspectorTab } from './LiveInspectorTab';
import { ComponentType } from '@types';
import { EDGE_PRESETS, EdgePresetName } from '../../types/graph';
import { analyzeCapacity } from '../../engine/analysis/capacityAnalysis';
import { formatRps, formatPercent } from '../../design/formatters';

export const InspectorPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'config' | 'live'>('live');
  const graph = useGraphStore(selectGraph);
  const nodes = useGraphStore(selectNodes);
  const removeNode = useGraphStore((s) => s.removeNode);
  const swapNode = useGraphStore((s) => s.swapNode);

  const selectedNodeId = useUiStore(selectSelectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);
  const selectedEdgeId = useUiStore(selectSelectedEdgeId);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const toggleInspector = useUiStore((s) => s.toggleInspector);

  const updateEdgeLatency = useGraphStore((s) => s.updateEdgeLatency);
  const applyEdgePreset = useGraphStore((s) => s.applyEdgePreset);

  const storeCapacity = useSimulationStore(selectStaticCapacity);
  const runtimeBottleneck = useSimulationStore(selectRuntimeBottleneck);
  const capacity = storeCapacity ?? analyzeCapacity(graph);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId);
  const rule: ComponentSlotRule | undefined = selectedNode
    ? COMPONENT_RULES[selectedNode.type]
    : undefined;

  const removeCheck = selectedNode ? canRemove(graph, selectedNode.id) : null;

  const isSelectedNodeBottleneck =
    selectedNode &&
    (selectedNode.id === capacity.bottleneckNodeId ||
      selectedNode.id === runtimeBottleneck?.nodeId);

  // Find candidate components for swapping
  const swapCandidates: ComponentType[] = selectedNode && rule?.swapGroup
    ? (Object.keys(COMPONENT_RULES) as ComponentType[]).filter(
        (t) =>
          t !== selectedNode.type &&
          COMPONENT_RULES[t].swapGroup === rule.swapGroup &&
          canSwap(graph, selectedNode.id, t).allowed
      )
    : [];

  const isSwappable = Boolean(rule?.swapGroup);
  const handleRemove = () => {
    if (!selectedNode || !removeCheck?.allowed) return;
    removeNode(selectedNode.id);
    selectNode(null);
  };

  const handleSwap = (targetType: ComponentType) => {
    if (!selectedNode) return;
    swapNode(selectedNode.id, targetType);
  };

  return (
    <aside
      className="w-full h-full flex flex-col bg-[#131316] border-l border-[#27272a] select-none z-10"
      aria-label="Component Inspector"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase">Inspector</h2>
          <p className="text-xs text-[var(--color-text-muted)]">Configuration & Capacity</p>
        </div>
        <div className="flex items-center gap-2">
          {(selectedNode || selectedEdge) && (
            <button
              type="button"
              onClick={() => {
                selectNode(null);
                selectEdge(null);
              }}
              className="text-xs text-[var(--color-text-faint)] hover:text-white px-2 py-1 rounded hover:bg-[#1f1f23] transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={toggleInspector}
            title="Collapse Inspector"
            aria-label="Collapse Inspector"
            className="w-7 h-7 rounded-lg bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white text-xs flex items-center justify-center transition-all shadow-sm"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {selectedNode ? (
          <div className="p-4 space-y-4">
            {/* Bottleneck Alert Banner if this node is the bottleneck */}
            {isSelectedNodeBottleneck && (
              <div className="p-3 bg-white/10 border border-white rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.2)] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white tracking-wider">
                  <span className="animate-pulse">⚠️</span>
                  <span>SYSTEM BOTTLENECK</span>
                </div>
                <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                  {capacity.explanation}
                </p>
                {capacity.suggestedFixes.length > 0 && (
                  <div className="text-[10px] text-white pt-1 font-mono">
                    Suggested fixes: {capacity.suggestedFixes.map(f => COMPONENT_RULES[f].label).join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Header / Identification */}
            <div className="flex items-start gap-3 pb-3 border-b border-[#27272a]">
              <div className="p-2.5 rounded-xl bg-[#1c1c20] border border-[#27272a] shadow-inner">
                <ComponentIcon type={selectedNode.type} size={32} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white truncate">
                    {selectedNode.label || selectedNode.type}
                  </h3>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 text-[var(--color-text-secondary)] border border-white/20">
                    Slot {rule?.slot}
                  </span>
                </div>
                <div className="text-xs font-mono text-[var(--color-text-muted)] truncate mt-0.5">
                  ID: {selectedNode.id}
                </div>
              </div>
            </div>

            {/* Tab Selector: Live vs Config */}
            <div className="flex border-b border-[#27272a] -mx-4 px-4">
              <button
                type="button"
                onClick={() => setActiveTab('live')}
                className={`flex-1 py-1.5 text-xs font-mono font-semibold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
                  activeTab === 'live'
                    ? 'border-white text-white'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Live Telemetry</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`flex-1 py-1.5 text-xs font-mono font-semibold transition-all border-b-2 ${
                  activeTab === 'config'
                    ? 'border-white text-white'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-white'
                }`}
              >
                Config & Rules
              </button>
            </div>

            {activeTab === 'live' ? (
              <LiveInspectorTab node={selectedNode} />
            ) : (
              <>
                {/* Why here? educational line */}
                <div className="p-3 bg-[#18181b] rounded-lg border border-[#27272a]">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] block mb-1">
                    Architectural Purpose
                  </span>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    {rule?.whyHere}
                  </p>
                </div>

                {/* Swap Actions */}
                {isSwappable && (
                  <div className="p-3 bg-[#18181b] rounded-lg border border-[#27272a] space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] block">
                      Alternate Components (Swap)
                    </span>
                    {swapCandidates.length > 0 ? (
                      <div className="space-y-1.5">
                        {swapCandidates.map((candidate) => (
                          <button
                            key={candidate}
                            type="button"
                            onClick={() => handleSwap(candidate)}
                            className="w-full py-1.5 px-3 rounded text-xs font-mono bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center justify-between"
                          >
                            <span>Swap with {COMPONENT_RULES[candidate].label}</span>
                            <span>⇄</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[var(--color-text-faint)]">
                        No alternate components in this swap group.
                      </div>
                    )}
                  </div>
                )}

                {/* Real Interactive Configuration Form */}
                <ConfigForm node={selectedNode} />

                {/* Remove Action */}
                <div className="pt-2 border-t border-[#27272a]">
                  <button
                    type="button"
                    disabled={!removeCheck?.allowed}
                    onClick={handleRemove}
                    title={removeCheck?.reason}
                    aria-label={`Remove ${selectedNode.label || selectedNode.type}`}
                    className={`
                      w-full py-2 px-3 rounded-lg text-xs font-medium transition-all duration-150 flex items-center justify-center gap-2
                      ${
                        removeCheck?.allowed
                          ? 'bg-[#18181b] hover:bg-[#27272a] text-white border border-[#71717a] hover:border-white hover:shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                          : 'bg-[#141416] text-[#71717a] border border-[#27272a] cursor-not-allowed'
                      }
                    `}
                  >
                    <span>✕</span>
                    <span>Remove Component</span>
                  </button>

                  {!removeCheck?.allowed && (
                    <p className="text-[11px] text-[var(--color-text-faint)] mt-2 px-1">
                      {removeCheck?.reason}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        ) : selectedEdge ? (
          <div className="p-4 space-y-4 font-mono text-xs">
            {/* Edge Header */}
            <div className="p-3 bg-[#18181b] rounded-xl border border-[#27272a] space-y-2">
              <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">
                Network Connection
              </div>
              <div className="flex items-center justify-between text-white font-bold">
                <span className="truncate max-w-[100px]">{selectedEdge.source}</span>
                <span className="text-[var(--color-text-muted)]">➔</span>
                <span className="truncate max-w-[100px]">{selectedEdge.target}</span>
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)]">
                Edge ID: <span className="text-white">{selectedEdge.id}</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)] block">
                Latency Preset
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    'same-machine',
                    'same-datacenter',
                    'cross-zone',
                    'cross-region',
                    'public-internet',
                  ] as EdgePresetName[]
                ).map((presetKey) => {
                  const p = EDGE_PRESETS[presetKey];
                  const isActive =
                    selectedEdge.latency?.preset === presetKey ||
                    (!selectedEdge.latency?.preset &&
                      selectedEdge.latency?.baseLatencyMs === p.baseLatencyMs);

                  return (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => applyEdgePreset(selectedEdge.id, presetKey)}
                      className={`p-2 rounded-lg text-left transition-all border ${
                        isActive
                          ? 'bg-white text-black font-bold border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                          : 'bg-[#18181b] hover:bg-[#202024] text-white border-[#27272a] hover:border-white'
                      }`}
                    >
                      <div className="text-[11px] truncate capitalize">{presetKey.replace('-', ' ')}</div>
                      <div className={`text-[9px] ${isActive ? 'text-neutral-800' : 'text-[var(--color-text-muted)]'}`}>
                        {p.baseLatencyMs}ms (±{p.jitterMs}ms)
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Manual Latency Sliders */}
            <div className="p-3 bg-[#18181b] rounded-xl border border-[#27272a] space-y-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">
                Custom Edge Latency
              </div>

              {/* Base Latency */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--color-text-muted)]">Base Latency:</span>
                  <span className="text-white font-bold">{selectedEdge.latency?.baseLatencyMs ?? 0.5} ms</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="150"
                  step="0.5"
                  value={selectedEdge.latency?.baseLatencyMs ?? 0.5}
                  onChange={(e) =>
                    updateEdgeLatency(selectedEdge.id, {
                      baseLatencyMs: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-white cursor-pointer"
                />
              </div>

              {/* Jitter */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--color-text-muted)]">Jitter:</span>
                  <span className="text-white font-bold">±{selectedEdge.latency?.jitterMs ?? 0.2} ms</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="0.5"
                  value={selectedEdge.latency?.jitterMs ?? 0.2}
                  onChange={(e) =>
                    updateEdgeLatency(selectedEdge.id, {
                      jitterMs: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-white cursor-pointer"
                />
              </div>

              {/* Packet Loss */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--color-text-muted)]">Packet Loss:</span>
                  <span className="text-white font-bold">
                    {(((selectedEdge.latency?.packetLossPct ?? 0)) * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.10"
                  step="0.005"
                  value={selectedEdge.latency?.packetLossPct ?? 0}
                  onChange={(e) =>
                    updateEdgeLatency(selectedEdge.id, {
                      packetLossPct: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-white cursor-pointer"
                />
              </div>
            </div>
          </div>
        ) : (
          /* System-Wide Capacity & Bottleneck Overview when no node is selected */
          <div className="p-4 space-y-4">
            <div className="p-4 bg-[#18181b] rounded-xl border border-[#27272a] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold tracking-wider text-white">
                  System Capacity
                </span>
                <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-white/10 border border-white/20">
                  ~{formatRps(capacity.sustainableRps, false)}
                </span>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] text-[var(--color-text-muted)]">Primary Bottleneck:</div>
                <div className="text-xs font-bold font-mono text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_6px_#ffffff]" />
                  <span>{COMPONENT_RULES[capacity.bottleneckType]?.label ?? capacity.bottleneckType}</span>
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed bg-[#111113] p-2.5 rounded-lg border border-[#222226]">
                {capacity.explanation}
              </p>

              {capacity.suggestedFixes.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-faint)]">
                    Recommended Improvements:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {capacity.suggestedFixes.map((f) => (
                      <span
                        key={f}
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/10 text-white border border-white/20"
                      >
                        + Add {COMPONENT_RULES[f]?.label ?? f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Component Capacity Breakdown List */}
            <div className="space-y-2">
              <span className="text-xs uppercase font-bold tracking-wider text-[var(--color-text-faint)] block px-1">
                Component Throughput Limits
              </span>
              <div className="space-y-1.5">
                {Object.values(capacity.componentBreakdown).map((comp) => (
                  <div
                    key={comp.nodeId}
                    onClick={() => selectNode(comp.nodeId)}
                    className="p-2.5 rounded-lg bg-[#18181b] hover:bg-[#202024] border border-[#27272a] hover:border-white transition-all cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {COMPONENT_RULES[comp.type]?.label ?? comp.type}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        {comp.nodeId} • Share: {formatPercent(comp.loadShare, true)}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-white font-bold">
                        {comp.maxSustainableClientRps === Infinity
                          ? '∞'
                          : formatRps(comp.maxSustainableClientRps, false)}
                      </div>
                      <div className="text-[9px] text-[var(--color-text-faint)] truncate max-w-[100px]">
                        {comp.limitingFactor}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-[#111113] rounded-lg border border-[#222226] text-center text-[11px] text-[var(--color-text-faint)]">
              Click any component to customize its capacity, latency, or concurrency.
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
