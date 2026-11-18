import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GraphNode, ComponentType } from '@types';
import { COMPONENT_RULES } from '@builder';
import { ComponentIcon } from '../components/ComponentIcon';
import { useUiStore, selectSelectedNodeId, selectDraggingSwapNodeId } from '@store';
import { useGraphStore, selectGraph } from '@store';
import {
  useSimulationStore,
  selectHighlightedPath,
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
  const highlightedPath = useSimulationStore(selectHighlightedPath);
  const runtimeBottleneck = useSimulationStore(selectRuntimeBottleneck);
  const staticCapacity = useSimulationStore(selectStaticCapacity);
  const activeFailures = useSimulationStore(selectActiveFailures);

  const nodeFailure = activeFailures.find((f) => f.targetId === id);
  const isPathHighlighted = highlightedPath.includes(id);
  const isRuntimeBottleneck = runtimeBottleneck?.nodeId === id;
  const isStaticBottleneck = staticCapacity?.bottleneckNodeId === id;
  const isBottleneck = isRuntimeBottleneck || (isStaticBottleneck && (runtimeState?.utilization ?? 0) > 0.85);

  const queueDepth = runtimeState?.queueDepth ?? 0;
  const utilization = runtimeState?.utilization ?? 0;
  const healthStatus = runtimeState?.status ?? 'healthy';
  const isThreatSource = (nodeData.type as string) === 'threat-source' || id === 'threat-source';
  const isCompromised = runtimeState?.isCompromised ?? false;
  const isQuarantined = runtimeState?.isQuarantined ?? false;
  const circuitBreakerState = runtimeState?.circuitBreakerState ?? 'closed';

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

  const displayName = nodeData.label || nodeData.type.replace(/-/g, ' ');

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="button"
      title={`${displayName} | Util: ${Math.round(utilization * 100)}% | Queue: ${queueDepth} | Status: ${healthStatus}`}
      aria-label={`${displayName} node`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          selectNode(id);
        }
      }}
      className={`
        relative flex flex-col items-center justify-center p-2 cursor-pointer select-none outline-none
        transition-all duration-150 min-w-[120px] max-w-[170px]
        ${isBeingDragged ? 'opacity-60 scale-95' : ''}
        ${isDimmed ? 'opacity-25' : 'opacity-100'}
        ${
          isSelected
            ? 'ring-1 ring-[#D9541E] ring-offset-4 ring-offset-[#0B0B0D] rounded-lg'
            : isPathHighlighted
            ? 'ring-1 ring-white/80 ring-offset-3 ring-offset-[#0B0B0D] rounded-lg'
            : isBottleneck
            ? 'ring-1 ring-white ring-offset-4 ring-offset-[#0B0B0D] rounded-lg animate-pulse'
            : isHovered
            ? 'ring-1 ring-white/40 ring-offset-2 ring-offset-[#0B0B0D] rounded-lg'
            : ''
        }
      `}
    >
      {/* State callouts (Never color alone: text badges paired with icons) */}
      {isQuarantined && (
        <span className="mb-1 px-1.5 py-0.2 bg-[#2C2C2C] text-[#D9541E] border border-[#D9541E] rounded text-[9px] font-mono font-bold tracking-wider animate-pulse">
          QUARANTINED
        </span>
      )}
      {isCompromised && !isQuarantined && (
        <span className="mb-1 px-1.5 py-0.2 bg-[#2C2C2C] text-[#EF4444] border border-[#EF4444] rounded text-[9px] font-mono font-bold tracking-wider animate-pulse">
          COMPROMISED
        </span>
      )}
      {circuitBreakerState === 'open' && (
        <span className="mb-1 px-1.5 py-0.2 bg-[#2C2C2C] text-[#F59E0B] border border-[#F59E0B] rounded text-[9px] font-mono font-bold tracking-wider">
          CB: OPEN
        </span>
      )}
      {nodeFailure && !isCompromised && !isQuarantined && (
        <span className="mb-1 px-1.5 py-0.2 bg-[#2C2C2C] text-[#EF4444] border border-[#EF4444] rounded text-[9px] font-mono font-bold tracking-wider">
          FAIL
        </span>
      )}
      {isBottleneck && !isCompromised && !isQuarantined && !isQuarantined && (
        <span className="mb-1 px-1.5 py-0.2 bg-white text-black rounded text-[9px] font-mono font-bold tracking-wider">
          BOTTLENECK
        </span>
      )}

      {/* Target Handle (Left) - Minimalist point */}
      {rule?.slot !== 1 && !isThreatSource && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ top: 24, left: 0 }}
          className="!w-2 !h-2 !bg-[#FFFFFF] !border-none !opacity-0 hover:!opacity-100"
        />
      )}

      {/* Node Icon - White line icon on dark canvas, Burnt Orange for threat */}
      <div className="relative mb-2 flex items-center justify-center">
        <ComponentIcon
          type={nodeData.type}
          size={48}
          color={isThreatSource ? '#D9541E' : '#FFFFFF'}
        />
        {healthStatus === 'failed' && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            ✕
          </span>
        )}
      </div>

      {/* Source Handle (Right) - Minimalist point */}
      {rule?.pathBehavior !== 'terminal' && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ top: 24, right: 0 }}
          className="!w-2 !h-2 !bg-[#FFFFFF] !border-none !opacity-0 hover:!opacity-100"
        />
      )}

      {/* Full Name: Roboto Mono, Regular, 12px, wrap up to 2 lines without truncation */}
      <div className="text-center w-full px-1">
        <div className="text-[12px] font-mono font-normal text-white leading-tight break-words whitespace-normal line-clamp-2">
          {displayName}
        </div>

        {/* Utilization % & Queue: Roboto Mono, Regular, 10px, secondary grey */}
        <div className="mt-1 text-[10px] font-mono text-[#A1A1AA] flex items-center justify-center gap-1">
          <span>{Math.round(utilization * 100)}%</span>
          {queueDepth > 0 && <span className="text-white font-medium">• Q:{queueDepth}</span>}
          {healthStatus === 'overloaded' && <span className="text-[#D9541E] font-medium">• HIGH</span>}
        </div>
      </div>
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
