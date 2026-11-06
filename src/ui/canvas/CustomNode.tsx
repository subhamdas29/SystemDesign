import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GraphNode, ComponentType } from '@types';
import { COMPONENT_RULES } from '@builder';
import { ComponentIcon } from '../components/ComponentIcon';
import { useUiStore, selectSelectedNodeId, selectDraggingSwapNodeId } from '@store';
import { useGraphStore, selectGraph } from '@store';
import { canSwap } from '@builder';

export interface CustomNodeData extends GraphNode {
  isStarter?: boolean;
}

export const CustomNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const nodeData = data as unknown as CustomNodeData;
  const selectNode = useUiStore((s) => s.selectNode);
  const selectedNodeId = useUiStore(selectSelectedNodeId);
  const draggingSwapNodeId = useUiStore(selectDraggingSwapNodeId);
  const graph = useGraphStore(selectGraph);

  const isSelected = selected || selectedNodeId === id;
  const rule = COMPONENT_RULES[nodeData.type as ComponentType];
  const isSwappable = Boolean(rule?.swapGroup);

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

  return (
    <div
      onClick={handleClick}
      tabIndex={0}
      role="button"
      aria-label={`${nodeData.label || nodeData.type} node`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          selectNode(id);
        }
      }}
      className={`
        relative flex flex-col items-center justify-between p-3 rounded-xl cursor-pointer select-none
        w-40 min-h-[96px] transition-all duration-200 outline-none
        bg-gradient-to-b from-[#18181c] to-[#111113]
        border
        ${
          isValidSwapTarget
            ? 'border-white shadow-[var(--shadow-glow-target)] scale-105 ring-2 ring-white/60'
            : isSelected
            ? 'border-white shadow-[var(--shadow-glow-selected)] ring-1 ring-white/40'
            : 'border-[var(--color-border-silver-light)] hover:border-white hover:shadow-[var(--shadow-glow-hover)]'
        }
        ${isBeingDragged ? 'opacity-70 scale-95' : ''}
        ${isDimmed ? 'opacity-30' : 'opacity-100'}
      `}
    >
      {/* Input Handle (Left) */}
      {rule?.slot !== 1 && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-[#d4d4d4] !border !border-[#ffffff] !-left-1"
        />
      )}

      {/* Header with Status Indicator & Swap Badge */}
      <div className="w-full flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full bg-[#f4f4f5] shadow-[0_0_6px_#ffffff]"
            title="Status: Healthy"
          />
          <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--color-text-faint)]">
            Slot {rule?.slot ?? '-'}
          </span>
        </div>

        {isSwappable && (
          <span
            className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-[var(--color-text-secondary)] border border-white/20 font-mono"
            title="Swappable component (can swap with API Gateway or Load Balancer)"
          >
            SWAP
          </span>
        )}
      </div>

      {/* Center Image / Icon */}
      <div className="my-1.5 flex items-center justify-center">
        <ComponentIcon type={nodeData.type} size={36} />
      </div>

      {/* Label and ID */}
      <div className="text-center w-full">
        <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
          {nodeData.label || nodeData.type}
        </div>
        <div className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">
          {nodeData.id}
        </div>
      </div>

      {/* Output Handle (Right) */}
      {rule?.pathBehavior !== 'terminal' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-[#d4d4d4] !border !border-[#ffffff] !-right-1"
        />
      )}
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
