/**
 * High-performance Canvas 2D Simulation Animation Layer.
 * Renders all packet movements, trails, queues, flow particles, and ripples in a single
 * hardware-accelerated Canvas 2D context synchronized with the React Flow viewport.
 * Zero React components per packet; object pooling for zero GC overhead at 60 fps.
 * Redesign: Packets are medium-sized circles (white for legitimate, orange fill with thin outer ring for malicious).
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
import { useGraphStore, selectGraph, selectEdges } from '../../store/graphStore';
import { computeLayout } from '../../builder/layout';
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
  const rawEdges = useGraphStore(selectEdges);

  const displayMode = useSimulationStore(selectVisualizationDisplayMode);
  const status = useSimulationStore(selectSimPlayStatus);
  const peakRps = useSimulationStore(selectSimRps);
  const trackedRequestId = useSimulationStore(selectTrackedRequestId);
  const followTrackedPacket = useSimulationStore(selectFollowTrackedPacket);

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

  // Compute node handle coordinates (icon center is at y + 24)
  const layout = computeLayout(graph);
  const nodeWidth = 140;

  const getNodeHandles = useCallback(
    (nodeId: string): { input: Point2D; output: Point2D; center: Point2D } | null => {
      if (nodeId === 'threat-source') {
        const clientPos = layout['client'] ?? { x: 0, y: 0 };
        const pos = { x: Math.max(0, clientPos.x - 220), y: clientPos.y };
        return {
          input: { x: pos.x, y: pos.y + 24 },
          output: { x: pos.x + nodeWidth, y: pos.y + 24 },
          center: { x: pos.x + nodeWidth / 2, y: pos.y + 24 },
        };
      }
      const pos = layout[nodeId];
      if (!pos) return null;
      return {
        input: { x: pos.x, y: pos.y + 24 },
        output: { x: pos.x + nodeWidth, y: pos.y + 24 },
        center: { x: pos.x + nodeWidth / 2, y: pos.y + 24 },
      };
    },
    [layout, nodeWidth]
  );

  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.translate(vpX, vpY);
      ctx.scale(zoom, zoom);

      // 1. Fetch simulation events
      const simStore = useSimulationStore.getState();
      const currentSimTime = simStore.simTimeMs;
      const recentEvents = simStore.recentEvents;
      const currentTrackedId = trackedRequestId;

      // Build candidate packets
      const candidatePackets: AnimatedPacket[] = [];
      const recentWindow = recentEvents.slice(-250);

      for (let i = 0; i < recentWindow.length; i++) {
        const ev = recentWindow[i]!;
        if (!ev.targetNodeId) continue;

        const hopDurationMs = 25;
        const ageMs = currentSimTime - ev.timestamp;

        if (ageMs >= 0 && ageMs <= hopDurationMs + 10) {
          const progress = calculatePacketProgress(currentSimTime, ev.timestamp, ev.timestamp + hopDurationMs);

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

          candidatePackets.push({
            id: `pkt-${ev.id}`,
            requestId: ev.requestId,
            sourceNodeId: ev.nodeId,
            targetNodeId: ev.targetNodeId,
            progress,
            state,
            isTracked: ev.requestId === currentTrackedId,
            isSampled: ev.details?.sampled === true,
            timestamp: ev.timestamp,
          });
        }
      }

      // 2. Select packets under cap
      const { visiblePackets } = selectPacketsUnderCap(
        candidatePackets,
        MAX_DRAWN_PACKETS,
        currentTrackedId
      );

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
              offsetY: 0,
              speed: 0.008 * (0.8 + Math.random() * 0.4) * flowFactor,
            }));
            flowParticlesRef.current.set(edge.id, edgeParticles);
          }

          const startPt = srcHandles.output;
          const endPt = tgtHandles.input;
          const isThreat = edge.source === 'threat-source' || edge.target === 'threat-source';

          // Animate each fluid particle along edge
          for (const p of edgeParticles) {
            if (status === 'running') {
              p.progress = (p.progress + p.speed) % 1.0;
            }

            const pt = interpolatePoint(startPt, endPt, p.progress);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);

            if (isThreat) {
              ctx.fillStyle = '#D9541E';
              ctx.fill();
              ctx.lineWidth = 1;
              ctx.strokeStyle = '#FFFFFF';
              ctx.stroke();
            } else {
              ctx.fillStyle = '#FFFFFF';
              ctx.fill();
            }
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

        const isMalicious = pkt.state === 'malicious' || pkt.sourceNodeId === 'threat-source';

        if (pkt.state === 'rejected') {
          // Subtle ripple ring and muted X
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 6, 0, Math.PI * 2);
          ctx.strokeStyle = '#D9541E';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(currentPos.x - 2.5, currentPos.y - 2.5);
          ctx.lineTo(currentPos.x + 2.5, currentPos.y + 2.5);
          ctx.moveTo(currentPos.x + 2.5, currentPos.y - 2.5);
          ctx.lineTo(currentPos.x - 2.5, currentPos.y + 2.5);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (pkt.state === 'timed-out') {
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#71717A';
          ctx.fill();
        } else if (pkt.state === 'response') {
          // Response packet: hollow ring (white ring, no fill)
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 4, 0, Math.PI * 2);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();

          if (isTracked) {
            ctx.beginPath();
            ctx.arc(currentPos.x, currentPos.y, 6, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#D9541E';
            ctx.stroke();
          }
        } else if (pkt.state === 'queued') {
          // Queued packet: waiting near the node
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#8E8E8E';
          ctx.fill();
        } else if (isMalicious) {
          // Orange fill with thin outer ring for malicious traffic
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#D9541E';
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();
        } else {
          // White circle traveling along edges for legitimate traffic
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();

          if (isTracked) {
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#D9541E';
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    vpX,
    vpY,
    zoom,
    displayMode,
    status,
    peakRps,
    trackedRequestId,
    followTrackedPacket,
    rawEdges,
    getNodeHandles,
    setCenter,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
};
