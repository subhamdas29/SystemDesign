import React, { memo, useState, useEffect } from 'react';
import { EdgeProps, getSmoothStepPath, BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import { useSimulationStore, selectActiveFailures } from '../../store/simulationStore';
import { useUiStore, selectSelectedEdgeId } from '../../store/uiStore';
import { EdgeLatencyConfig } from '../../types';
import { registerEdgePath } from '../animation/edgePathGeometry';

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

  // Register exact rendered SVG path string for packet arc-length routing
  useEffect(() => {
    registerEdgePath(id, edgePath);
  }, [id, edgePath]);

  const latency = (data as { latency?: EdgeLatencyConfig })?.latency;
  const isThreatEdge = source === 'threat-source' || target === 'threat-source' || (data as { isThreatEdge?: boolean })?.isThreatEdge;
  const activeFailures = useSimulationStore(selectActiveFailures);
  const selectedEdgeId = useUiStore(selectSelectedEdgeId);
  const selectEdge = useUiStore((s) => s.selectEdge);

  const isSelected = selectedEdgeId === id;
  const edgeFailure = activeFailures.find((f) => f.targetId === id);

  // Stroke color: orange for threat edge or selected; failure red; nominal white
  const strokeColor = isThreatEdge
    ? '#D9541E'
    : isSelected
    ? '#D9541E'
    : edgeFailure
    ? '#FF5C5C'
    : '#FFFFFF';

  // Show edge latency ONLY on hover or when edge is selected per Item 19
  const showLatencyChip = isHovered || isSelected;

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

      {/* Latency label offset above edge with background gap (Item 19) */}
      {showLatencyChip && (
        <EdgeLabelRenderer>
          <div
            onClick={(e) => {
              e.stopPropagation();
              selectEdge(id);
            }}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 6}px)`,
              pointerEvents: 'all',
            }}
            className="cursor-pointer z-10 font-mono"
          >
            <span className="text-[10px] font-mono text-[#F3EEE3] bg-[#0B0B0D] px-1.5 py-0.5 select-none tracking-tight">
              {latency?.baseLatencyMs ?? 5}ms
            </span>

            {edgeFailure && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#0B0B0D] text-[#FF5C5C] ml-1">
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
