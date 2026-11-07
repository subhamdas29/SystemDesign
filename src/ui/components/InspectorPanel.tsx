import React, { useState } from 'react';
import { useGraphStore, selectGraph, selectNodes } from '@store';
import { useUiStore, selectSelectedNodeId } from '@store';
import { useSimulationStore, selectStaticCapacity, selectRuntimeBottleneck } from '@store';
import { COMPONENT_RULES, canRemove, canSwap, ComponentSlotRule } from '@builder';
import { ComponentIcon } from './ComponentIcon';
import { ConfigForm } from './ConfigForm';
import { LiveInspectorTab } from './LiveInspectorTab';
import { ComponentType } from '@types';
import { analyzeCapacity } from '../../engine/analysis/capacityAnalysis';

export const InspectorPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'config' | 'live'>('live');
  const graph = useGraphStore(selectGraph);
  const nodes = useGraphStore(selectNodes);
  const removeNode = useGraphStore((s) => s.removeNode);
  const swapNode = useGraphStore((s) => s.swapNode);

  const selectedNodeId = useUiStore(selectSelectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);

  const storeCapacity = useSimulationStore(selectStaticCapacity);
  const runtimeBottleneck = useSimulationStore(selectRuntimeBottleneck);
  const capacity = storeCapacity ?? analyzeCapacity(graph);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
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
      className="w-80 h-full flex flex-col bg-[#131316] border-l border-[#27272a] select-none z-10"
      aria-label="Component Inspector"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase">Inspector</h2>
          <p className="text-xs text-[var(--color-text-muted)]">Configuration & Capacity</p>
        </div>
        {selectedNode && (
          <button
            type="button"
            onClick={() => selectNode(null)}
            className="text-xs text-[var(--color-text-faint)] hover:text-white px-2 py-1 rounded hover:bg-[#1f1f23] transition-colors"
          >
            Clear
          </button>
        )}
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
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/10 text-[var(--color-text-secondary)]">
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
        ) : (
          /* System-Wide Capacity & Bottleneck Overview when no node is selected */
          <div className="p-4 space-y-4">
            <div className="p-4 bg-[#18181b] rounded-xl border border-[#27272a] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold tracking-wider text-white">
                  System Capacity
                </span>
                <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-white/10 border border-white/20">
                  ~{capacity.sustainableRps.toLocaleString()} RPS
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
                        {comp.nodeId} • Share: {Math.round(comp.loadShare * 100)}%
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-white font-bold">
                        {comp.maxSustainableClientRps === Infinity
                          ? '∞'
                          : `${Math.round(comp.maxSustainableClientRps).toLocaleString()} RPS`}
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
