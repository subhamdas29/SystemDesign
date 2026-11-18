/**
 * Typographic Inspector Panel (R2 Section 4).
 * Slides in from the right (~220ms ease-out). Closes with Esc or close control.
 * Typography only, using tokens. ZERO nested cards, ZERO blue tints.
 * Structured sections for selected Node or Edge.
 * Opens ONLY when something is selected; closed with nothing selected.
 */

import React, { useEffect } from 'react';
import { useGraphStore, selectGraph, selectNodes } from '@store';
import { useUiStore, selectSelectedNodeId, selectSelectedEdgeId } from '@store';
import {
  useSimulationStore,
  selectSimPlayStatus,
  selectStaticCapacity,
  selectSimTimeMs,
} from '@store';
import {
  COMPONENT_RULES,
  COMPONENT_DESCRIPTIONS,
  canRemove,
  canSwap,
  ComponentSlotRule,
} from '@builder';
import { ComponentIcon } from './ComponentIcon';
import { ConfigForm } from './ConfigForm';
import { ComponentType } from '@types';
import { EDGE_PRESETS, EdgePresetName } from '../../types/graph';
import { analyzeCapacity } from '../../engine/analysis/capacityAnalysis';
import { formatRps, formatLatency } from '../../design/formatters';

export const InspectorPanel: React.FC = () => {
  const graph = useGraphStore(selectGraph);
  const nodes = useGraphStore(selectNodes);
  const removeNode = useGraphStore((s) => s.removeNode);
  const swapNode = useGraphStore((s) => s.swapNode);

  const selectedNodeId = useUiStore(selectSelectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);
  const selectedEdgeId = useUiStore(selectSelectedEdgeId);
  const selectEdge = useUiStore((s) => s.selectEdge);

  const updateEdgeLatency = useGraphStore((s) => s.updateEdgeLatency);
  const applyEdgePreset = useGraphStore((s) => s.applyEdgePreset);

  const status = useSimulationStore(selectSimPlayStatus);
  const simTimeMs = useSimulationStore(selectSimTimeMs);
  const runtimeState = useSimulationStore((s) => (selectedNodeId ? s.runtimeNodes[selectedNodeId] : null));
  const storeCapacity = useSimulationStore(selectStaticCapacity);
  const capacity = storeCapacity ?? analyzeCapacity(graph);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId);

  // Esc key closes inspector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectNode(null);
        selectEdge(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectNode, selectEdge]);

  // If nothing is selected, Inspector is closed (Item 9a)
  if (!selectedNode && !selectedEdge) {
    return null;
  }

  const rule: ComponentSlotRule | undefined = selectedNode
    ? COMPONENT_RULES[selectedNode.type]
    : undefined;

  const removeCheck = selectedNode ? canRemove(graph, selectedNode.id) : null;

  // Find candidate components for swapping
  const swapCandidates: ComponentType[] = selectedNode && rule?.swapGroup
    ? (Object.keys(COMPONENT_RULES) as ComponentType[]).filter(
        (t) =>
          t !== selectedNode.type &&
          COMPONENT_RULES[t].swapGroup === rule.swapGroup &&
          canSwap(graph, selectedNode.id, t).allowed
      )
    : [];

  const handleRemove = () => {
    if (!selectedNode || !removeCheck?.allowed) return;
    removeNode(selectedNode.id);
    selectNode(null);
  };

  const handleSwap = (targetType: ComponentType) => {
    if (!selectedNode) return;
    swapNode(selectedNode.id, targetType);
  };

  const handleClose = () => {
    selectNode(null);
    selectEdge(null);
  };

  const isRunningOrFinished = status === 'running' || status === 'paused' || simTimeMs > 0;

  // Edge connected nodes and friendly names (Item 9f)
  const edgeSourceNode = selectedEdge ? nodes.find((n) => n.id === selectedEdge.source) : null;
  const edgeTargetNode = selectedEdge ? nodes.find((n) => n.id === selectedEdge.target) : null;
  const edgeSourceFriendly = edgeSourceNode?.label || COMPONENT_RULES[edgeSourceNode?.type as ComponentType]?.label || selectedEdge?.source || '';
  const edgeTargetFriendly = edgeTargetNode?.label || COMPONENT_RULES[edgeTargetNode?.type as ComponentType]?.label || selectedEdge?.target || '';

  const sourceCapacityVal = edgeSourceNode ? (capacity.componentBreakdown[edgeSourceNode.id]?.effectiveCapacityRps ?? 2000) : 0;
  const targetCapacityVal = edgeTargetNode ? (capacity.componentBreakdown[edgeTargetNode.id]?.effectiveCapacityRps ?? 2000) : 0;

  return (
    <aside
      className="w-full h-full flex flex-col bg-[#15181E] border-l border-[#2A2E39] select-none font-mono text-[#F3EEE3] transition-transform duration-[220ms] ease-out shadow-2xl"
      aria-label="Component Inspector"
    >
      {/* Panel Top Bar */}
      <div className="h-14 px-5 border-b border-[#2A2E39] flex items-center justify-between shrink-0 bg-[#1B1E24]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#F3EEE3] tracking-wider uppercase">
            Inspector
          </span>
          <span className="text-[10px] text-[#8E8E8E]">
            {selectedNode ? 'Node' : 'Edge'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleClose}
          title="Close Inspector (Esc)"
          aria-label="Close Inspector"
          className="w-6 h-6 rounded text-[#8E8E8E] hover:text-[#F3EEE3] hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Main Content Area - Typography Only, No Nested Cards */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {selectedNode ? (
          <div>
            {/* Header: Large Icon + Display Name */}
            <div className="flex items-start gap-3 pb-4 border-b border-[#2A2E39]">
              <ComponentIcon type={selectedNode.type} size={40} color="#FFFFFF" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-[#F3EEE3] leading-snug">
                  {selectedNode.label || rule?.label || selectedNode.type}
                </h3>

                {/* Collapsed Details row (Item 9f) */}
                <details className="text-[10px] text-[#8E8E8E] cursor-pointer pt-1 group">
                  <summary className="hover:text-[#F3EEE3] transition-colors select-none">
                    Details
                  </summary>
                  <div className="pt-1.5 space-y-0.5 text-[#8E8E8E] pl-2 border-l border-[#2A2E39] mt-1">
                    <div>ID: {selectedNode.id}</div>
                    <div>Slot: {rule?.slot ?? '—'}</div>
                    <div>Type: {selectedNode.type}</div>
                  </div>
                </details>
              </div>
            </div>

            {/* Section: What it is (Item 9d, 9f) */}
            <div className="py-4 border-b border-[#2A2E39] space-y-1">
              <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
                What it is
              </div>
              <p className="text-xs text-[#F3EEE3] leading-relaxed">
                {COMPONENT_DESCRIPTIONS[selectedNode.type]?.whatItIs ||
                  `${rule?.label || selectedNode.type} component.`}
              </p>
            </div>

            {/* Section: Why it is here (Item 9d, 9f) */}
            <div className="py-4 border-b border-[#2A2E39] space-y-1">
              <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
                Why it is here
              </div>
              <p className="text-xs text-[#8E8E8E] leading-relaxed">
                {COMPONENT_DESCRIPTIONS[selectedNode.type]?.whyHere ||
                  rule?.whyHere ||
                  'Processes requests and coordinates application workflows.'}
              </p>
            </div>

            {/* Section: Capacity / Live metrics (Item 9d) */}
            <div className="py-4 border-b border-[#2A2E39] space-y-2">
              <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
                {isRunningOrFinished ? 'Live metrics' : 'Capacity'}
              </div>

              {isRunningOrFinished && runtimeState ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Utilization:</span>
                    <span className="font-semibold text-[#F3EEE3]">
                      {Math.round((runtimeState.utilization ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Throughput:</span>
                    <span className="text-[#F3EEE3]">
                      {formatRps(runtimeState.currentRps ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Queue Depth:</span>
                    <span className="text-[#F3EEE3]">
                      {runtimeState.queueDepth ?? 0} requests
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Latency:</span>
                    <span className="text-[#F3EEE3]">
                      {formatLatency(runtimeState.p99LatencyMs ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Health State:</span>
                    <span className="capitalize text-[#F3EEE3] font-medium">
                      {runtimeState.status ?? 'nominal'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Rated Capacity:</span>
                    <span className="text-[#F3EEE3]">
                      {formatRps(capacity.componentBreakdown[selectedNode.id]?.effectiveCapacityRps ?? 2000)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Bottleneck Cap:</span>
                    <span className="text-[#F3EEE3]">
                      {formatRps(capacity.sustainableRps)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8E8E8E] pt-1 leading-normal">
                    {capacity.explanation}
                  </p>
                </div>
              )}
            </div>

            {/* Section: Configuration (Item 9d, 9e) */}
            <div className="py-4 border-b border-[#2A2E39] space-y-3">
              <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
                Configuration
              </div>
              <ConfigForm node={selectedNode} />
            </div>

            {/* Section: Actions (Item 9d) */}
            <div className="py-4 space-y-3">
              <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
                Actions
              </div>

              {/* Swap options */}
              {swapCandidates.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-[#8E8E8E]">Swap Component:</div>
                  {swapCandidates.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => handleSwap(candidate)}
                      className="w-full py-1.5 px-3 rounded bg-[#1B1E24] hover:bg-[#252932] text-[#F3EEE3] border border-[#2A2E39] hover:border-white transition-all text-xs text-left flex items-center justify-between cursor-pointer"
                    >
                      <span>Swap with {COMPONENT_RULES[candidate].label}</span>
                      <span>⇄</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Remove Component */}
              <div>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={!removeCheck?.allowed}
                  className={`w-full py-1.5 px-3 rounded text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    removeCheck?.allowed
                      ? 'bg-red-950/40 text-red-300 border border-red-800/80 hover:bg-red-900/60 cursor-pointer'
                      : 'bg-[#1B1E24] text-[#6B7280] border border-[#2A2E39] cursor-not-allowed opacity-60'
                  }`}
                >
                  <span>Remove Component</span>
                </button>
                {!removeCheck?.allowed && removeCheck?.reason && (
                  <p className="text-[10px] text-[#8E8E8E] mt-1.5 leading-normal">
                    {removeCheck.reason}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : selectedEdge ? (
          <div>
            {/* Header: Edge Connection with Friendly Names (Item 9f) */}
            <div className="pb-4 border-b border-[#2A2E39]">
              <h3 className="text-sm font-bold text-[#F3EEE3] leading-snug">
                {edgeSourceFriendly} to {edgeTargetFriendly}
              </h3>
              <div className="text-[10px] text-[#8E8E8E] mt-0.5">
                Type: {selectedEdge.kind || 'request'} edge
              </div>

              {/* Collapsed Details row */}
              <details className="text-[10px] text-[#8E8E8E] cursor-pointer pt-1 group">
                <summary className="hover:text-[#F3EEE3] transition-colors select-none">
                  Details
                </summary>
                <div className="pt-1.5 space-y-0.5 text-[#8E8E8E] pl-2 border-l border-[#2A2E39] mt-1">
                  <div>Edge ID: {selectedEdge.id}</div>
                  <div>Source: {selectedEdge.source}</div>
                  <div>Target: {selectedEdge.target}</div>
                </div>
              </details>
            </div>

            {/* Section: What it carries (Item 9d) */}
            <div className="py-4 border-b border-[#2A2E39] space-y-1">
              <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
                What it carries
              </div>
              <p className="text-xs text-[#F3EEE3] leading-relaxed">
                {selectedEdge.kind === 'replication'
                  ? 'Binary change data replication log stream.'
                  : selectedEdge.kind === 'async'
                  ? 'Asynchronous task queue payload.'
                  : selectedEdge.isLookup
                  ? 'DNS name resolution query & response.'
                  : 'Synchronous HTTP/HTTPS application request & payload.'}
              </p>
            </div>

            {/* Section: Protocol & latency (Item 9d, 10b) */}
            <div className="py-4 border-b border-[#2A2E39] space-y-3">
              <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
                Protocol & latency
              </div>

              {/* Edge Presets: Plain text options with orange underline on selected (Item 10b) */}
              <div className="space-y-1">
                <div className="text-[11px] text-[#8E8E8E]">Network Presets:</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  {(Object.keys(EDGE_PRESETS) as EdgePresetName[]).map((name) => {
                    const preset = EDGE_PRESETS[name];
                    const isSelected =
                      selectedEdge.latency?.baseLatencyMs === preset.baseLatencyMs &&
                      (selectedEdge.latency?.packetLossPct ?? 0) === preset.packetLossPct;

                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => applyEdgePreset(selectedEdge.id, name)}
                        className={`text-xs capitalize transition-colors cursor-pointer py-0.5 ${
                          isSelected
                            ? 'text-[#F3EEE3] font-bold border-b-2 border-[#D9541E]'
                            : 'text-[#8E8E8E] hover:text-[#F3EEE3]'
                        }`}
                      >
                        {name.replace('-', ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Latency Slider */}
              <div className="space-y-1 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#8E8E8E]">Base Latency:</span>
                  <span className="text-[#F3EEE3]">
                    {selectedEdge.latency?.baseLatencyMs ?? 5} ms
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={250}
                  value={selectedEdge.latency?.baseLatencyMs ?? 5}
                  onChange={(e) =>
                    updateEdgeLatency(selectedEdge.id, {
                      baseLatencyMs: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#F3EEE3] h-1 bg-[#2A2E39] rounded appearance-none cursor-pointer"
                />
              </div>

              {/* Packet Loss Slider */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#8E8E8E]">Packet Loss:</span>
                  <span className="text-[#F3EEE3]">
                    {selectedEdge.latency?.packetLossPct ?? 0} %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={selectedEdge.latency?.packetLossPct ?? 0}
                  onChange={(e) =>
                    updateEdgeLatency(selectedEdge.id, {
                      packetLossPct: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#F3EEE3] h-1 bg-[#2A2E39] rounded appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Section: Capacity / Live metrics (Item 9d, 10a) */}
            <div className="py-4 space-y-2">
              <div className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest">
                {isRunningOrFinished ? 'Live metrics' : 'Capacity'}
              </div>

              {isRunningOrFinished ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Status:</span>
                    <span className="text-[#F3EEE3]">Active Transmit</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Transfer Mode:</span>
                    <span className="text-[#F3EEE3]">
                      {selectedEdge.kind || 'direct'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Current Latency:</span>
                    <span className="text-[#F3EEE3]">
                      {selectedEdge.latency?.baseLatencyMs ?? 5} ms
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Status:</span>
                    <span className="text-[#8E8E8E]">Not running</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Configured Latency:</span>
                    <span className="text-[#F3EEE3]">
                      {selectedEdge.latency?.baseLatencyMs ?? 5} ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Configured Loss:</span>
                    <span className="text-[#F3EEE3]">
                      {selectedEdge.latency?.packetLossPct ?? 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Source Capacity:</span>
                    <span className="text-[#F3EEE3]">
                      {formatRps(sourceCapacityVal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Target Capacity:</span>
                    <span className="text-[#F3EEE3]">
                      {formatRps(targetCapacityVal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8E8E8E]">Transfer Mode:</span>
                    <span className="text-[#F3EEE3]">
                      {selectedEdge.kind || 'direct'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
};

export default InspectorPanel;
