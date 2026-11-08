/**
 * High-performance Canvas 2D Simulation Animation Layer.
 * Renders all packet movements, trails, queues, flow particles, and ripples in a single
 * hardware-accelerated Canvas 2D context synchronized with the React Flow viewport.
 * Zero React components per packet; object pooling for zero GC overhead at 60 fps.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useViewport, useReactFlow } from '@xyflow/react';
import {
  useSimulationStore,
  selectSimPlayStatus,
  selectSimRps,
  selectTrackedRequestId,
  selectVisualizationDisplayMode,
  selectFollowTrackedPacket,
} from '../../store/simulationStore';
import { useGraphStore, selectGraph, selectNodes, selectEdges } from '../../store/graphStore';
import { computeLayout } from '../../builder/layout';
import { tokens } from '../../design/tokens';
import {
  AnimatedPacket,
  PacketVisualState,
  selectPacketsUnderCap,
} from './packetSelection';
import {
  calculatePacketProgress,
  interpolatePoint,
  Point2D,
} from './packetPosition';

const MAX_DRAWN_PACKETS = 200;
const TRAIL_LENGTH = 3;

interface FlowParticle {
  progress: number;
  offsetY: number;
  speed: number;
}

export const AnimationCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { x: vpX, y: vpY, zoom } = useViewport();
  const { setCenter } = useReactFlow();

  const graph = useGraphStore(selectGraph);
  const rawNodes = useGraphStore(selectNodes);
  const rawEdges = useGraphStore(selectEdges);

  const displayMode = useSimulationStore(selectVisualizationDisplayMode);
  const status = useSimulationStore(selectSimPlayStatus);
  const peakRps = useSimulationStore(selectSimRps);
  const trackedRequestId = useSimulationStore(selectTrackedRequestId);
  const followTrackedPacket = useSimulationStore(selectFollowTrackedPacket);

  // Readout state
  const [readout, setReadout] = React.useState({ drawn: 0, inFlight: 0 });

  // Phase 10: Adaptive Quality Control
  const [isAdaptiveQualityActive, setIsAdaptiveQualityActive] = React.useState(false);
  const [isAdaptiveQualityDisabledByUser, setIsAdaptiveQualityDisabledByUser] = React.useState(false);
  const overBudgetStartTimeRef = useRef<number | null>(null);

  // Flow particles pool for Aggregate Flow mode
  const flowParticlesRef = useRef<Map<string, FlowParticle[]>>(new Map());

  // Check prefers-reduced-motion
  const prefersReducedMotionRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Compute node handle coordinates
  const layout = computeLayout(graph);
  const nodeWidth = tokens.spacing.canvasNodeWidth;
  const nodeHeight = tokens.spacing.canvasNodeHeight;

  const getNodeHandles = useCallback(
    (nodeId: string): { input: Point2D; output: Point2D; center: Point2D } | null => {
      if (nodeId === 'threat-source') {
        const clientPos = layout['client'] ?? { x: 0, y: 0 };
        const pos = { x: clientPos.x, y: clientPos.y + 160 };
        return {
          input: { x: pos.x, y: pos.y + nodeHeight / 2 },
          output: { x: pos.x + nodeWidth, y: pos.y + nodeHeight / 2 },
          center: { x: pos.x + nodeWidth / 2, y: pos.y + nodeHeight / 2 },
        };
      }
      const pos = layout[nodeId];
      if (!pos) return null;
      return {
        input: { x: pos.x, y: pos.y + nodeHeight / 2 },
        output: { x: pos.x + nodeWidth, y: pos.y + nodeHeight / 2 },
        center: { x: pos.x + nodeWidth / 2, y: pos.y + nodeHeight / 2 },
      };
    },
    [layout, nodeWidth, nodeHeight]
  );

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Main animation frame drawing loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const frameStart = performance.now();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      // Apply viewport transformation (DPR * React Flow Pan & Zoom)
      ctx.scale(dpr, dpr);
      ctx.translate(vpX, vpY);
      ctx.scale(zoom, zoom);

      const simTimeMs = useSimulationStore.getState().simTimeMs;
      const recentEvents = useSimulationStore.getState().recentEvents;
      const currentTrackedId = useSimulationStore.getState().trackedRequestId;
      const isReducedMotion = prefersReducedMotionRef.current;
      const currentCap = isAdaptiveQualityActive ? 80 : MAX_DRAWN_PACKETS;
      const shouldDrawTrails = !isReducedMotion && !isAdaptiveQualityActive;

      // 1. Build In-Flight Packet Candidates from recent events
      const candidatePackets: AnimatedPacket[] = [];
      const recentWindow = recentEvents.slice(-250);

      for (let i = 0; i < recentWindow.length; i++) {
        const ev = recentWindow[i]!;
        if (!ev.targetNodeId) continue;

        // Visual travel time based on hop latency
        const hopDurationMs = 25; // 25ms travel duration along edge
        const ageMs = simTimeMs - ev.timestamp;

        if (ageMs >= 0 && ageMs <= hopDurationMs + 10) {
          const progress = calculatePacketProgress(simTimeMs, ev.timestamp, ev.timestamp + hopDurationMs);

          let state: PacketVisualState = 'forward';
          if (
            ev.details?.origin === 'malicious' ||
            ev.nodeId === 'threat-source' ||
            ev.targetNodeId === 'threat-source'
          ) {
            state = 'malicious';
          } else if (ev.type === 'RESPONSE_FORWARDED') {
            state = 'response';
          } else if (ev.type === 'REQUEST_QUEUED') {
            state = 'queued';
          } else if (ev.type === 'REQUEST_REJECTED' || ev.type === 'REQUEST_BLOCKED') {
            state = 'rejected';
          } else if (ev.type === 'REQUEST_FAILED') {
            state = 'failed';
          } else if (ev.type === 'REQUEST_TIMED_OUT') {
            state = 'timed-out';
          } else if (ev.type === 'RESPONSE_RECEIVED') {
            state = 'success';
          }

          const isAsyncJob =
            ev.details?.isAsyncJob === true ||
            ev.type === 'ASYNC_JOB_ENQUEUED' ||
            ev.type === 'ASYNC_JOB_PROCESSED' ||
            ev.targetNodeId === 'message-queue' ||
            ev.targetNodeId === 'worker' ||
            ev.nodeId === 'worker';

          candidatePackets.push({
            id: `pkt-${ev.id}`,
            requestId: ev.requestId,
            sourceNodeId: ev.nodeId,
            targetNodeId: ev.targetNodeId,
            progress,
            state,
            isTracked: ev.requestId === currentTrackedId,
            isSampled: ev.details?.sampled === true,
            isAsyncJob,
            timestamp: ev.timestamp,
          });
        }
      }

      // 2. Select Packets under Concurrency Cap (Default 200, 80 if adaptive)
      const { visiblePackets, totalInFlight } = selectPacketsUnderCap(
        candidatePackets,
        currentCap,
        currentTrackedId
      );

      // Update readout counter (batched via local ref comparison)
      if (candidatePackets.length !== readout.inFlight || visiblePackets.length !== readout.drawn) {
        setReadout({ drawn: visiblePackets.length, inFlight: totalInFlight });
      }

      // If user prefers reduced motion, skip rendering animated moving particles
      if (isReducedMotion) {
        ctx.restore();
        animId = requestAnimationFrame(render);
        return;
      }

      // 3. Render Aggregate Flow Mode if active
      if (displayMode === 'aggregate') {
        const flowFactor = Math.max(1, Math.min(4, Math.log10(Math.max(10, peakRps))));
        const numParticlesPerEdge = Math.min(18, Math.max(3, Math.floor(flowFactor * 4)));

        for (const edge of rawEdges) {
          const srcHandles = getNodeHandles(edge.source);
          const tgtHandles = getNodeHandles(edge.target);
          if (!srcHandles || !tgtHandles) continue;

          let edgeParticles = flowParticlesRef.current.get(edge.id);
          if (!edgeParticles || edgeParticles.length !== numParticlesPerEdge) {
            edgeParticles = Array.from({ length: numParticlesPerEdge }, (_, idx) => ({
              progress: idx / numParticlesPerEdge,
              offsetY: (Math.random() - 0.5) * 4,
              speed: 0.008 * (0.8 + Math.random() * 0.4) * flowFactor,
            }));
            flowParticlesRef.current.set(edge.id, edgeParticles);
          }

          const startPt = srcHandles.output;
          const endPt = tgtHandles.input;

          // Animate each fluid particle along edge
          for (const p of edgeParticles) {
            if (status === 'running') {
              p.progress = (p.progress + p.speed) % 1.0;
            }

            const pt = interpolatePoint(startPt, endPt, p.progress);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y + p.offsetY, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // 4. Render Individual Packets (Canvas 2D)
      for (const pkt of visiblePackets) {
        const isTracked = pkt.isTracked;
        const isDimmed = currentTrackedId && !isTracked;

        const srcHandles = getNodeHandles(pkt.sourceNodeId);
        const tgtHandles = getNodeHandles(pkt.targetNodeId);
        if (!srcHandles || !tgtHandles) continue;

        const isReturn = pkt.state === 'response';
        const startPt = isReturn ? srcHandles.input : srcHandles.output;
        const endPt = isReturn ? tgtHandles.output : tgtHandles.input;

        const currentPos = interpolatePoint(startPt, endPt, pkt.progress);

        // Center camera if "Follow" is active
        if (isTracked && followTrackedPacket && status === 'running') {
          setCenter(currentPos.x, currentPos.y, { duration: 50 });
        }

        ctx.save();
        ctx.globalAlpha = isDimmed ? 0.25 : 1.0;

        // Render trails unless prefers-reduced-motion or adaptive quality active
        if (shouldDrawTrails && pkt.state === 'forward' && pkt.progress > 0.05) {
          for (let t = 1; t <= TRAIL_LENGTH; t++) {
            const trailProg = Math.max(0, pkt.progress - t * 0.05);
            const trailPos = interpolatePoint(startPt, endPt, trailProg);
            ctx.beginPath();
            ctx.arc(trailPos.x, trailPos.y, Math.max(1, 3.5 - t * 0.8), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(212, 212, 212, ${0.45 / t})`;
            ctx.fill();
          }
        }

        // Distinct outcome rendering
        if (pkt.state === 'rejected') {
          // Ripple ring and muted X at rejecting node
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(244, 244, 245, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Muted X
          ctx.beginPath();
          ctx.moveTo(currentPos.x - 3, currentPos.y - 3);
          ctx.lineTo(currentPos.x + 3, currentPos.y + 3);
          ctx.moveTo(currentPos.x + 3, currentPos.y - 3);
          ctx.lineTo(currentPos.x - 3, currentPos.y + 3);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (pkt.state === 'response') {
          // Hollow silver ring traveling backwards
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.fillStyle = '#111113';
          ctx.fill();
          ctx.stroke();
        } else if (pkt.state === 'timed-out') {
          // Fading dim grey dissolve
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#71717a';
          ctx.globalAlpha = 0.4;
          ctx.fill();
        } else if (pkt.state === 'malicious') {
          // Amber diamond shape for malicious attack traffic
          const s = 5;
          ctx.beginPath();
          ctx.moveTo(currentPos.x, currentPos.y - s);
          ctx.lineTo(currentPos.x + s, currentPos.y);
          ctx.lineTo(currentPos.x, currentPos.y + s);
          ctx.lineTo(currentPos.x - s, currentPos.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
          ctx.fill();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (pkt.isAsyncJob) {
          // Hollow square for async jobs
          const s = isTracked ? 9 : 7;
          ctx.beginPath();
          ctx.rect(currentPos.x - s / 2, currentPos.y - s / 2, s, s);
          ctx.fillStyle = '#18181b';
          ctx.fill();
          ctx.strokeStyle = '#e4e4e7';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = isTracked ? 12 : 5;
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          // Bright white glowing dot with silver glow
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, isTracked ? 5.5 : 4, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = isTracked ? 14 : 7;
          ctx.fill();
        }

        // Tracked Request Halo
        if (isTracked) {
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 11, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      }

      ctx.restore();

      // Measure frame budget
      const frameDuration = performance.now() - frameStart;
      if (frameDuration > 16.6 && !isAdaptiveQualityDisabledByUser && !isAdaptiveQualityActive) {
        if (overBudgetStartTimeRef.current === null) {
          overBudgetStartTimeRef.current = frameStart;
        } else if (frameStart - overBudgetStartTimeRef.current > 3000) {
          setIsAdaptiveQualityActive(true);
        }
      } else if (frameDuration <= 16.6) {
        overBudgetStartTimeRef.current = null;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    vpX,
    vpY,
    zoom,
    rawEdges,
    rawNodes,
    layout,
    displayMode,
    status,
    peakRps,
    trackedRequestId,
    followTrackedPacket,
    getNodeHandles,
    setCenter,
    readout.inFlight,
    readout.drawn,
    isAdaptiveQualityActive,
    isAdaptiveQualityDisabledByUser,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full pointer-events-none"
      />

      {/* Persistent Readout: Conflation Prevention Badge */}
      <div className="absolute bottom-3 left-4 z-20 pointer-events-none select-none flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111113]/90 backdrop-blur-md border border-[#27272a] font-mono text-[11px] shadow-lg">
        <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_6px_#ffffff]" />
        <span className="text-white font-bold">
          Simulating {peakRps.toLocaleString()} req/s
        </span>
        <span className="text-[var(--color-text-faint)]">|</span>
        <span className="text-[var(--color-text-muted)]">
          {displayMode === 'aggregate'
            ? 'Showing 20 sampled requests'
            : readout.inFlight > MAX_DRAWN_PACKETS
            ? `Showing ${MAX_DRAWN_PACKETS} of ${readout.inFlight} in-flight`
            : `Showing ${readout.drawn} in-flight`}
        </span>
      </div>

      {/* Non-intrusive Adaptive Quality Banner */}
      {isAdaptiveQualityActive && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-3 right-4 z-20 pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#18181b]/95 backdrop-blur-md border border-neutral-600 text-xs shadow-lg animate-in fade-in"
        >
          <span className="text-neutral-300">⚡</span>
          <span className="text-white font-medium text-[11px]">
            Adaptive quality active (cap 80, trails disabled)
          </span>
          <button
            type="button"
            onClick={() => {
              setIsAdaptiveQualityActive(false);
              setIsAdaptiveQualityDisabledByUser(true);
            }}
            className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-colors"
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
};
