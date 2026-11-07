import React, { memo } from 'react';
import { EdgeProps, getSmoothStepPath, BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import { useSimulationStore, selectSimRps, selectSimPlayStatus, selectActiveFailures } from '../../store/simulationStore';
import { useUiStore, selectSelectedEdgeId } from '../../store/uiStore';
import { EdgeLatencyConfig } from '../../types';

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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const isLookup = Boolean(data && (data as { isLookup?: boolean }).isLookup);
  const latency = (data as { latency?: EdgeLatencyConfig })?.latency;
  const currentRps = useSimulationStore(selectSimRps);
  const status = useSimulationStore(selectSimPlayStatus);
  const activeFailures = useSimulationStore(selectActiveFailures);
  const selectedEdgeId = useUiStore(selectSelectedEdgeId);
  const selectEdge = useUiStore((s) => s.selectEdge);

  const isRunning = status === 'running';
  const isSelected = selectedEdgeId === id;
  const edgeFailure = activeFailures.find((f) => f.targetId === id);

  // Logarithmic stroke width scaling (from 1.5px up to 5px for 1M RPS)
  const baseWidth = isLookup ? 1.5 : 2;
  const flowFactor = isRunning
    ? Math.max(1, Math.min(3.5, Math.log10(Math.max(10, currentRps)) - 0.5))
    : 1;
  const strokeWidth = (isSelected ? baseWidth + 1.5 : baseWidth) * flowFactor;

  // Dash animation duration scales with traffic intensity (faster flow under heavy volume)
  const animDuration = isRunning
    ? `${Math.max(0.15, Math.min(1.0, 1.2 / flowFactor)).toFixed(2)}s`
    : '1.2s';

  const hasLatencyCustomization = Boolean(
    latency && (latency.baseLatencyMs > 1 || (latency.packetLossPct ?? 0) > 0)
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={20}
        style={{
          stroke: isSelected
            ? '#ffffff'
            : edgeFailure
            ? '#ef4444'
            : isRunning && currentRps > 1000
            ? '#ffffff'
            : '#d4d4d4',
          strokeWidth,
          strokeDasharray: isLookup ? '4 4' : currentRps > 10000 ? '4 4' : '6 6',
          animation: `dashFlow-${id} ${animDuration} linear infinite`,
          filter: isSelected
            ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.9))'
            : edgeFailure
            ? 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.7))'
            : isRunning
            ? `drop-shadow(0 0 ${Math.min(8, 2 * flowFactor)}px rgba(255, 255, 255, 0.6))`
            : 'drop-shadow(0 0 3px rgba(212, 212, 212, 0.3))',
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
            className={`
              px-2 py-0.5 rounded-full text-[9px] font-mono cursor-pointer transition-all border
              ${
                edgeFailure
                  ? 'bg-red-950/90 text-red-300 border-red-500/70 shadow-md'
                  : isSelected
                  ? 'bg-white text-black font-bold border-white shadow-[0_0_8px_rgba(255,255,255,0.7)]'
                  : 'bg-[#111113]/90 text-[var(--color-text-secondary)] border-[#3f3f46] hover:border-white shadow-sm'
              }
            `}
            title={`Edge Latency: ${latency?.baseLatencyMs ?? 0}ms, Jitter: ${latency?.jitterMs ?? 0}ms, Loss: ${((latency?.packetLossPct ?? 0) * 100).toFixed(1)}%`}
          >
            {edgeFailure
              ? 'CHAOS EDGE'
              : `${latency?.baseLatencyMs ?? 0}ms${
                  (latency?.packetLossPct ?? 0) > 0
                    ? ` (${((latency?.packetLossPct ?? 0) * 100).toFixed(1)}% loss)`
                    : ''
                }`}
          </div>
        </EdgeLabelRenderer>
      )}

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
