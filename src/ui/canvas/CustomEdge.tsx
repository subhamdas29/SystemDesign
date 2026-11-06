import React, { memo } from 'react';
import { EdgeProps, getSmoothStepPath, BaseEdge } from '@xyflow/react';

export const CustomEdge: React.FC<EdgeProps> = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const isLookup = Boolean(data && (data as { isLookup?: boolean }).isLookup);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: '#d4d4d4',
          strokeWidth: isLookup ? 1.5 : 2,
          strokeDasharray: isLookup ? '4 4' : '6 6',
          animation: 'dashFlow 1s linear infinite',
          filter: 'drop-shadow(0 0 4px rgba(212, 212, 212, 0.4))',
        }}
      />
      <style>{`
        @keyframes dashFlow {
          from {
            stroke-dashoffset: 24;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </>
  );
});

CustomEdge.displayName = 'CustomEdge';
