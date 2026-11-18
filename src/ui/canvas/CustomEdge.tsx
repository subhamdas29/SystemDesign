import React, { memo, useState } from 'react';
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
  const [isHovered, setIsHovered] = useState(false);
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
  const isThreatEdge = source === 'threat-source' || target === 'threat-source' || (data as { isThreatEdge?: boolean })?.isThreatEdge;
  const activeFailures = useSimulationStore(selectActiveFailures);
  const selectedEdgeId = useUiStore(selectSelectedEdgeId);
  const selectEdge = useUiStore((s) => s.selectEdge);

  const isSelected = selectedEdgeId === id;
  const edgeFailure = activeFailures.find((f) => f.targetId === id);

  const hasLatencyCustomization = Boolean(
    latency && (latency.baseLatencyMs > 1 || (latency.packetLossPct ?? 0) > 0)
  );

  // Stroke color: orange for threat edge or selected; failure red; nominal white
  const strokeColor = isThreatEdge
    ? '#D9541E'
    : isSelected
    ? '#D9541E'
    : edgeFailure
    ? '#FF5C5C'
    : '#FFFFFF';

  // Show edge latency ONLY on hover or when edge is selected per A7
  const showLatencyChip = (isHovered || isSelected) && (hasLatencyCustomization || edgeFailure);

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="cursor-pointer"
    >
      {/* Invisible wide interaction path for comfortable hover & selection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onClick={(e) => {
          e.stopPropagation();
          selectEdge(id);
        }}
      />

      {/* Dotted edge with round-cap dots per A10 (2px dot, 6px gap) */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd ?? 'url(#open-arrowhead)'}
        style={{
          stroke: strokeColor,
          strokeWidth: 2,
          strokeDasharray: '0.1 6',
          strokeLinecap: 'round',
        }}
      />

      {showLatencyChip && (
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
            className="cursor-pointer z-10 font-mono"
          >
            {hasLatencyCustomization && latency && (
              <span className="text-[10px] font-mono text-[#F3EEE3] select-none tracking-tight">
                {latency.baseLatencyMs}ms
              </span>
            )}

            {edgeFailure && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#15181E] text-[#FF5C5C] border border-[#FF5C5C] ml-1">
                FAIL
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
});

CustomEdge.displayName = 'CustomEdge';
