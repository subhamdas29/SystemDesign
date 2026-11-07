import React, { memo } from 'react';
import { EdgeProps, getSmoothStepPath, BaseEdge } from '@xyflow/react';
import { useSimulationStore, selectSimRps, selectSimPlayStatus } from '../../store/simulationStore';

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
  const currentRps = useSimulationStore(selectSimRps);
  const status = useSimulationStore(selectSimPlayStatus);
  const isRunning = status === 'running';

  // Logarithmic stroke width scaling (from 1.5px up to 5px for 1M RPS)
  const baseWidth = isLookup ? 1.5 : 2;
  const flowFactor = isRunning
    ? Math.max(1, Math.min(3.5, Math.log10(Math.max(10, currentRps)) - 0.5))
    : 1;
  const strokeWidth = baseWidth * flowFactor;

  // Dash animation duration scales with traffic intensity (faster flow under heavy volume)
  const animDuration = isRunning
    ? `${Math.max(0.15, Math.min(1.0, 1.2 / flowFactor)).toFixed(2)}s`
    : '1.2s';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: isRunning && currentRps > 1000 ? '#ffffff' : '#d4d4d4',
          strokeWidth,
          strokeDasharray: isLookup ? '4 4' : currentRps > 10000 ? '4 4' : '6 6',
          animation: `dashFlow-${id} ${animDuration} linear infinite`,
          filter: isRunning
            ? `drop-shadow(0 0 ${Math.min(8, 2 * flowFactor)}px rgba(255, 255, 255, 0.6))`
            : 'drop-shadow(0 0 3px rgba(212, 212, 212, 0.3))',
        }}
      />
      <style>{`
        @keyframes dashFlow-${id} {
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
