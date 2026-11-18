import React, { memo } from 'react';
import { EdgeProps, getSmoothStepPath, BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import { useSimulationStore, selectActiveFailures } from '../../store/simulationStore';
import { useUiStore, selectSelectedEdgeId } from '../../store/uiStore';
import { EdgeLatencyConfig } from '../../types';

export const CustomEdge: React.FC<EdgeProps> = memo(({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const latency = (data as { latency?: EdgeLatencyConfig })?.latency;
  const isThreatEdge = source === 'threat-source' || target === 'threat-source';
  const activeFailures = useSimulationStore(selectActiveFailures);
  const selectedEdgeId = useUiStore(selectSelectedEdgeId);
  const selectEdge = useUiStore((s) => s.selectEdge);

  const isSelected = selectedEdgeId === id;
  const edgeFailure = activeFailures.find((f) => f.targetId === id);

  const hasLatencyCustomization = Boolean(
    latency && (latency.baseLatencyMs > 1 || (latency.packetLossPct ?? 0) > 0)
  );

  const strokeColor = isThreatEdge
    ? '#D9541E'
    : isSelected
    ? '#D9541E'
    : edgeFailure
    ? '#EF4444'
    : '#FFFFFF';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd ?? 'url(#open-arrowhead)'}
        interactionWidth={20}
        style={{
          stroke: strokeColor,
          strokeWidth: 2,
          strokeDasharray: '4 4',
        }}
      />

      {(hasLatencyCustomization || edgeFailure || isSelected) && (
        <EdgeLabelRenderer>
          <div
            onClick={(e) => {
              e.stopPropagation();
              selectEdge(id);
            }}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="cursor-pointer z-10"
          >
            {hasLatencyCustomization && latency && (
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                  isSelected
                    ? 'bg-[#2C2C2C] text-[#D9541E] border-[#D9541E]'
                    : 'bg-[#0B0B0D] text-[#A1A1AA] border-[#27272A]'
                }`}
              >
                {latency.baseLatencyMs}ms
              </span>
            )}

            {edgeFailure && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#2C2C2C] text-[#EF4444] border border-[#EF4444]">
                ERR
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

CustomEdge.displayName = 'CustomEdge';
