import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GraphNode, ComponentType } from '@types';
import { COMPONENT_RULES } from '@builder';
import { ComponentIcon } from '../components/ComponentIcon';
import { useUiStore, selectSelectedNodeId, selectDraggingSwapNodeId } from '@store';
import { useGraphStore, selectGraph } from '@store';
import {
  useSimulationStore,
  selectRuntimeBottleneck,
  selectStaticCapacity,
  selectActiveFailures,
} from '@store';
import { canSwap } from '@builder';

export interface CustomNodeData extends GraphNode {
  isStarter?: boolean;
}

export const CustomNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const nodeData = data as unknown as CustomNodeData;
  const selectNode = useUiStore((s) => s.selectNode);
  const selectedNodeId = useUiStore(selectSelectedNodeId);
  const draggingSwapNodeId = useUiStore(selectDraggingSwapNodeId);
  const graph = useGraphStore(selectGraph);

  const isSelected = selected || selectedNodeId === id;
  const rule = COMPONENT_RULES[nodeData.type as ComponentType];

  // Simulation runtime state, path highlighting, and bottleneck detection
  const runtimeState = useSimulationStore((s) => s.runtimeNodes[id]);
  const runtimeBottleneck = useSimulationStore(selectRuntimeBottleneck);
  const staticCapacity = useSimulationStore(selectStaticCapacity);
  const activeFailures = useSimulationStore(selectActiveFailures);

  const nodeFailure = activeFailures.find((f) => f.targetId === id);
  const isRuntimeBottleneck = runtimeBottleneck?.nodeId === id;
  const isStaticBottleneck = staticCapacity?.bottleneckNodeId === id;
  const isBottleneck = isRuntimeBottleneck || (isStaticBottleneck && (runtimeState?.utilization ?? 0) > 0.85);

  const queueDepth = runtimeState?.queueDepth ?? 0;
  const utilization = runtimeState?.utilization ?? 0;
  const rawStatus = runtimeState?.status ?? 'healthy';
  const isThreatSource = (nodeData.type as string) === 'threat-source' || id === 'threat-source';
  const isQuarantined = runtimeState?.isQuarantined ?? false;
  const circuitBreakerState = runtimeState?.circuitBreakerState ?? 'closed';

  // Severity classification per Hybrid approval (plain words, NO orange for severity):
  // Warning "▲ Busy", Overloaded "▲ Overloaded", Failed "✕ Offline", Quarantined "◇ Isolated", Degraded "▼ Slow"
  const isFailed = rawStatus === 'failed' || Boolean(nodeFailure);
  const isOverloaded = rawStatus === 'overloaded' || utilization >= 0.9 || isBottleneck;
  const isWarning = !isOverloaded && !isFailed && (utilization >= 0.75 || queueDepth > 5);
  const isDegraded = !isOverloaded && !isFailed && !isWarning && ((rawStatus as string) === 'degraded' || (runtimeState?.errorRate ?? 0) > 0.05);

  // Swap drag states
  const isBeingDragged = draggingSwapNodeId === id;
  const isValidSwapTarget =
    draggingSwapNodeId &&
    draggingSwapNodeId !== id &&
    canSwap(graph, draggingSwapNodeId, nodeData.type).allowed;
  const isDimmed = draggingSwapNodeId && draggingSwapNodeId !== id && !isValidSwapTarget;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(id);
  };

  const displayName = isQuarantined
    ? `[${nodeData.label || nodeData.type.replace(/-/g, ' ')}]`
    : nodeData.label || nodeData.type.replace(/-/g, ' ');

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="button"
      title={`${displayName} | Util: ${Math.round(utilization * 100)}% | Status: ${rawStatus}`}
      aria-label={`${displayName} node`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          selectNode(id);
        }
      }}
      className={`
        relative flex flex-col items-center justify-center p-2 cursor-pointer select-none
        transition-opacity duration-150 min-w-[110px] max-w-[160px] font-mono outline-none
        ${isBeingDragged ? 'opacity-60' : ''}
        ${isDimmed ? 'opacity-25' : 'opacity-100'}
        focus-visible:ring-2 focus-visible:ring-dotted focus-visible:ring-[#F3EEE3] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0B0B0D] focus-visible:rounded-sm
      `}
    >
      {/* Target Handle (Left) - Minimalist point */}
      {rule?.slot !== 1 && !isThreatSource && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ top: 20, left: 0 }}
          className="!w-2 !h-2 !bg-[#FFFFFF] !border-none !opacity-0 hover:!opacity-100"
        />
      )}

      {/* Node Icon - White line icon on dark canvas, Burnt Orange for threat */}
      <div
        className={`relative mb-2 flex items-center justify-center transition-opacity ${
          isFailed
            ? 'opacity-50 border-dashed'
            : isOverloaded
            ? 'motion-safe:animate-pulse motion-reduce:animate-none'
            : ''
        }`}
      >
        <ComponentIcon
          type={nodeData.type}
          size={36}
          color={isThreatSource ? '#D9541E' : '#FFFFFF'}
        />
      </div>

      {/* Source Handle (Right) - Minimalist point */}
      {rule?.pathBehavior !== 'terminal' && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ top: 20, right: 0 }}
          className="!w-2 !h-2 !bg-[#FFFFFF] !border-none !opacity-0 hover:!opacity-100"
        />
      )}

      {/* Full Name & Selection / Hover styling:
          - Selected: orange 2px underline under label, no box, no bars
          - Hover: dashed underline under label (no scale)
      */}
      <div className="text-center w-full px-1">
        <div
          className={`
            text-[12px] font-mono leading-tight break-words whitespace-normal line-clamp-2 inline-block transition-all
            ${isThreatSource ? 'text-[#D9541E]' : 'text-[#F3EEE3]'}
            ${isFailed ? 'line-through text-[#8F96A3]' : ''}
            ${
              isSelected
                ? 'border-b-2 border-[#D9541E] pb-0.5'
                : isHovered
                ? 'border-b border-dashed border-white/60 pb-0.5'
                : ''
            }
          `}
        >
          {displayName}
        </div>

        {/* Utilization %: Roboto Mono, 10px, secondary grey #8F96A3 (NO blue) */}
        <div className="mt-1 text-[10px] font-mono text-[#8F96A3] flex items-center justify-center gap-1">
          <span>{Math.round(utilization * 100)}%</span>
          {queueDepth > 0 && <span>· Q:{queueDepth}</span>}
        </div>

        {/* Severity: plain words + cream/white glyphs under utilization %. NO orange for severity! */}
        {isFailed && (
          <div className="text-[10px] font-mono text-[#F3EEE3] font-medium mt-0.5 flex items-center justify-center gap-1">
            <span>✕ Offline</span>
          </div>
        )}
        {!isFailed && (isQuarantined || circuitBreakerState === 'open') && (
          <div className="text-[10px] font-mono text-[#F3EEE3] font-medium mt-0.5 flex items-center justify-center gap-1">
            <span>◇ Isolated</span>
          </div>
        )}
        {!isFailed && !isQuarantined && isOverloaded && (
          <div className="text-[10px] font-mono text-[#F3EEE3] font-medium mt-0.5 flex items-center justify-center gap-1">
            <span>▲ Overloaded</span>
          </div>
        )}
        {!isFailed && !isQuarantined && !isOverloaded && isWarning && (
          <div className="text-[10px] font-mono text-[#F3EEE3] font-medium mt-0.5 flex items-center justify-center gap-1">
            <span>▲ Busy</span>
          </div>
        )}
        {!isFailed && !isQuarantined && !isOverloaded && !isWarning && isDegraded && (
          <div className="text-[10px] font-mono text-[#F3EEE3] font-medium mt-0.5 flex items-center justify-center gap-1">
            <span>▼ Slow {Math.round(runtimeState?.p99LatencyMs ?? 450)}ms</span>
          </div>
        )}
      </div>
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
