/**
 * Typographic Inspector Panel (R2 Section 4).
 * Slides in from the right (~220ms ease-out). Closes with Esc, close control, or clicking canvas.
 * Typography only, using tokens. ZERO nested cards, ZERO blue tints.
 * Structured sections for selected Node or Edge.
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
import { COMPONENT_RULES, canRemove, canSwap, ComponentSlotRule } from '@builder';
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
  const toggleInspector = useUiStore((s) => s.toggleInspector);

  const updateEdgeLatency = useGraphStore((s) => s.updateEdgeLatency);
  const applyEdgePreset = useGraphStore((s) => s.applyEdgePreset);

  const status = useSimulationStore(selectSimPlayStatus);
  const simTimeMs = useSimulationStore(selectSimTimeMs);
  const runtimeState = useSimulationStore((s) => (selectedNodeId ? s.runtimeNodes[selectedNodeId] : null));
  const storeCapacity = useSimulationStore(selectStaticCapacity);
  const capacity = storeCapacity ?? analyzeCapacity(graph);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId);
  const rule: ComponentSlotRule | undefined = selectedNode
    ? COMPONENT_RULES[selectedNode.type]
    : undefined;

  const removeCheck = selectedNode ? canRemove(graph, selectedNode.id) : null;

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
          <span className="text-[10px] text-[#8F96A3]">
            {selectedNode ? 'Node' : selectedEdge ? 'Edge' : 'Canvas'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {(selectedNode || selectedEdge) && (
            <button
              type="button"
              onClick={handleClose}
              className="text-[11px] text-[#8F96A3] hover:text-[#F3EEE3] transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={toggleInspector}
            title="Close Inspector (Esc)"
            aria-label="Close Inspector"
            className="w-6 h-6 rounded text-[#8F96A3] hover:text-[#F3EEE3] hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Content Area - Typography Only, No Nested Cards */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {selectedNode ? (
          <div>
            {/* Header: Large Icon + Display Name */}
            <div className="flex items-center gap-3 pb-4 border-b border-[#2A2E39]">
              <ComponentIcon type={selectedNode.type} size={36} color="#FFFFFF" />
              <div>
                <h3 className="text-sm font-bold text-[#F3EEE3]">
                  {selectedNode.label || selectedNode.type}
                </h3>
                <div className="text-[10px] text-[#8F96A3] mt-0.5">
                  Slot {rule?.slot ?? '—'} · ID: {selectedNode.id}
                </div>
              </div>
            </div>

            {/* Section 1: What it is */}
            <div className="py-4 border-b border-[#2A2E39] space-y-1">
              <div className="text-[10px] uppercase font-bold text-[#8F96A3] tracking-widest">
                1. What it is
              </div>
              <p className="text-xs text-[#F3EEE3] leading-relaxed">
                {rule?.label || selectedNode.type} — distributed system architectural primitive.
              </p>
            </div>

            {/* Section 2: Why it is here */}
            <div className="py-4 border-b border-[#2A2E39] space-y-1">
              <div className="text-[10px] uppercase font-bold text-[#8F96A3] tracking-widest">
                2. Why it is here
              </div>
              <p className="text-xs text-[#8F96A3] leading-relaxed">
                {rule?.whyHere || 'Processes requests and coordinates business workflows.'}
              </p>
            </div>

            {/* Section 3: Live metrics for current run OR static info before run */}
            <div className="py-4 border-b border-[#2A2E39] space-y-2">
              <div className="text-[10px] uppercase font-bold text-[#8F96A3] tracking-widest">
                3. {isRunningOrFinished ? 'Live Metrics' : 'Static Capacity'}
              </div>

              {isRunningOrFinished && runtimeState ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#8F96A3]">Utilization:</span>
                    <span className="font-semibold text-[#F3EEE3]">
                      {Math.round((runtimeState.utilization ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8F96A3]">Throughput:</span>
                    <span className="text-[#F3EEE3]">
                      {formatRps(runtimeState.currentRps ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8F96A3]">Queue Depth:</span>
                    <span className="text-[#F3EEE3]">
                      {runtimeState.queueDepth ?? 0} requests
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8F96A3]">Latency:</span>
                    <span className="text-[#F3EEE3]">
                      {formatLatency(runtimeState.p99LatencyMs ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8F96A3]">Health State:</span>
                    <span className="capitalize text-[#F3EEE3] font-medium">
                      {runtimeState.status ?? 'nominal'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#8F96A3]">Rated Capacity:</span>
                    <span className="text-[#F3EEE3]">
                      {formatRps(capacity.componentBreakdown[selectedNode.id]?.effectiveCapacityRps ?? 2000)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8F96A3]">Bottleneck Cap:</span>
                    <span className="text-[#F3EEE3]">
                      {formatRps(capacity.sustainableRps)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8F96A3] pt-1 leading-normal">
                    {capacity.explanation}
                  </p>
                </div>
              )}
            </div>

            {/* Section 4: Configuration */}
            <div className="py-4 border-b border-[#2A2E39] space-y-3">
              <div className="text-[10px] uppercase font-bold text-[#8F96A3] tracking-widest">
                4. Configuration
              </div>
              <ConfigForm node={selectedNode} />
            </div>

            {/* Section 5: Actions */}
            <div className="py-4 space-y-3">
              <div className="text-[10px] uppercase font-bold text-[#8F96A3] tracking-widest">
                5. Actions
              </div>

              {/* Swap options */}
              {swapCandidates.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-[#8F96A3]">Swap Component:</div>
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
                  <p className="text-[10px] text-[#8F96A3] mt-1.5 leading-normal">
                    {removeCheck.reason}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : selectedEdge ? (
          <div>
            {/* Header: Edge Connection */}
            <div className="pb-4 border-b border-[#2A2E39]">
              <h3 className="text-sm font-bold text-[#F3EEE3]">
                {selectedEdge.source} → {selectedEdge.target}
              </h3>
              <div className="text-[10px] text-[#8F96A3] mt-0.5">
                Type: {selectedEdge.kind || 'request'} edge
              </div>
            </div>

            {/* Section 1: What it carries */}
            <div className="py-4 border-b border-[#2A2E39] space-y-1">
              <div className="text-[10px] uppercase font-bold text-[#8F96A3] tracking-widest">
                1. What it carries
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

            {/* Section 2: Protocol & Latency/Loss Configuration */}
            <div className="py-4 border-b border-[#2A2E39] space-y-3">
              <div className="text-[10px] uppercase font-bold text-[#8F96A3] tracking-widest">
                2. Protocol & Latency Configuration
              </div>

              {/* Edge Presets */}
              <div className="space-y-1">
                <div className="text-[11px] text-[#8F96A3]">Network Presets:</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(EDGE_PRESETS) as EdgePresetName[]).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyEdgePreset(selectedEdge.id, name)}
                      className="py-1 px-2 rounded bg-[#1B1E24] hover:bg-[#252932] text-[10px] text-[#F3EEE3] border border-[#2A2E39] hover:border-white transition-all text-left truncate cursor-pointer"
                    >
                      {name.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Latency Slider */}
              <div className="space-y-1 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#8F96A3]">Base Latency:</span>
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
                  <span className="text-[#8F96A3]">Packet Loss:</span>
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

            {/* Section 3: Current Flow Metrics */}
            <div className="py-4 space-y-2">
              <div className="text-[10px] uppercase font-bold text-[#8F96A3] tracking-widest">
                3. Flow Metrics
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#8F96A3]">Status:</span>
                  <span className="text-[#F3EEE3]">Active Transmit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8F96A3]">Transfer Mode:</span>
                  <span className="text-[#F3EEE3]">
                    {selectedEdge.kind || 'direct'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-[#8F96A3] space-y-2">
            <p className="text-xs">No component selected.</p>
            <p className="text-[11px] text-[#6B7280]">
              Click any node or edge on the canvas to inspect its configuration and metrics.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default InspectorPanel;
