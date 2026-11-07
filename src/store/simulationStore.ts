/**
 * Simulation Store.
 * Bridges UI controls, telemetry metrics, event log, live inspection, and request tracing
 * with the pure simulation engine.
 */

import { create } from 'zustand';
import {
  createSimulation,
  Simulation,
  SimulationCounters,
  LatencySummary,
} from '../engine';
import { NodeRuntimeState, SimulationEvent } from '../types/runtime';
import { GraphConfig } from '../types';
import { TrafficConfig } from '../scenarios/traffic/types';
import {
  analyzeCapacity,
  StaticCapacityAnalysis,
  RuntimeBottleneck,
} from '../engine/analysis';
import { BoundedRingBuffer } from './ringBuffer';
import { MetricSparklinePoint } from '../ui/inspector/types';
import { RequestTrace } from '../engine/trace/types';
import { buildRequestTrace } from '../engine/trace/traceBuilder';
import { emitMetricsSample } from '../engine/metrics/sampleEmitter';
import { buildRunSummary } from '../engine/analysis/runSummary';
import { useMetricsStore } from './metricsStore';
import { SimulationSnapshot } from '../engine/protocol';

export type SimulationPlayStatus = 'idle' | 'running' | 'paused' | 'completed';
export type SimulationSpeed = 1 | 2 | 4 | 8;
export type VisualizationDisplayMode = 'individual' | 'aggregate';

export interface SamplePacket {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  progress: number; // 0 to 1
  isResponse?: boolean;
}

export interface NodeHistoryBuffers {
  metric1: BoundedRingBuffer<MetricSparklinePoint>;
  metric2: BoundedRingBuffer<MetricSparklinePoint>;
}

export interface SimulationStoreState {
  status: SimulationPlayStatus;
  speed: SimulationSpeed;
  simTimeMs: number;
  durationMs: number;
  rps: number;
  seed: number;

  // Phase 4 Traffic & Hybrid Mode Configuration
  trafficConfig: TrafficConfig;
  activeMode: 'discrete' | 'aggregate';
  isTrafficModalOpen: boolean;
  runtimeBottleneck: RuntimeBottleneck | null;
  staticCapacity: StaticCapacityAnalysis | null;

  // Phase 5 Visualization & Tracing
  displayMode: VisualizationDisplayMode;
  trackedRequestId: string | null;
  requestTrace: RequestTrace | null;
  isTraceDrawerOpen: boolean;
  isTracingNextRequest: boolean;
  followTrackedPacket: boolean;

  runtimeNodes: Record<string, NodeRuntimeState>;
  counters: SimulationCounters;
  latencySummary: LatencySummary;
  recentEvents: SimulationEvent[];
  selectedEventRequestId: string | null;
  highlightedPath: string[];
  activeSamplePackets: SamplePacket[];
  isEventLogOpen: boolean;

  // Actions
  play: (graph: GraphConfig) => void;
  pause: () => void;
  resume: () => void;
  step: (graph: GraphConfig) => void;
  reset: (graph?: GraphConfig) => void;
  seek: (timeMs: number, graph: GraphConfig) => void;
  setSpeed: (speed: SimulationSpeed) => void;
  setRps: (rps: number) => void;
  setDuration: (durationMs: number) => void;
  setSeed: (seed: number) => void;
  randomizeSeed: () => void;
  toggleEventLog: () => void;
  selectEventRequestId: (requestId: string | null, graph?: GraphConfig) => void;
  tickFrame: (deltaRealMs: number, graph: GraphConfig) => void;

  // Phase 4 Actions
  openTrafficModal: () => void;
  closeTrafficModal: () => void;
  setTrafficConfig: (partial: Partial<TrafficConfig>, graph?: GraphConfig) => void;
  recalculateCapacity: (graph: GraphConfig) => void;

  // Phase 5 Actions
  setDisplayMode: (mode: VisualizationDisplayMode) => void;
  trackRequest: (requestId: string | null, graph?: GraphConfig) => void;
  traceNextRequest: () => void;
  setFollowTrackedPacket: (follow: boolean) => void;
  closeTraceDrawer: () => void;
  clearTrace: () => void;
  getNodeHistory: (nodeId: string) => { points1: MetricSparklinePoint[]; points2: MetricSparklinePoint[] };
}

const initialCounters: SimulationCounters = {
  created: 0,
  inFlight: 0,
  succeeded: 0,
  failed: 0,
  rejected: 0,
  timedOut: 0,
  wastedWork: 0,
};

const initialLatency: LatencySummary = {
  averageMs: 0,
  p50Ms: 0,
  p95Ms: 0,
  p99Ms: 0,
  minMs: 0,
  maxMs: 0,
};

const initialTrafficConfig: TrafficConfig = {
  peakRps: 100,
  durationMs: 10000,
  pattern: 'constant',
  patternParams: { type: 'constant' },
  mode: 'auto',
};

// Global simulation references and ring buffers
let activeSim: Simulation | null = null;
let lastGraphVersion = -1;
let lastUiUpdateTime = 0;
let lastSampledSimSec = -1;
let lastSnapshot: SimulationSnapshot | null = null;

const nodeHistories = new Map<string, NodeHistoryBuffers>();

function getNodeBuffers(nodeId: string): NodeHistoryBuffers {
  let buf = nodeHistories.get(nodeId);
  if (!buf) {
    buf = {
      metric1: new BoundedRingBuffer<MetricSparklinePoint>(60),
      metric2: new BoundedRingBuffer<MetricSparklinePoint>(60),
    };
    nodeHistories.set(nodeId, buf);
  }
  return buf;
}

function getOrInitSimulation(
  graph: GraphConfig,
  trafficConfig: TrafficConfig,
  seed: number
): Simulation {
  if (!activeSim || lastGraphVersion !== graph.version) {
    activeSim = createSimulation({
      graph,
      traffic: trafficConfig,
      seed,
    });
    lastGraphVersion = graph.version;
  }
  return activeSim;
}

export const useSimulationStore = create<SimulationStoreState>((set, get) => ({
  status: 'idle',
  speed: 1,
  simTimeMs: 0,
  durationMs: 10000,
  rps: 100,
  seed: 42,

  trafficConfig: initialTrafficConfig,
  activeMode: 'discrete',
  displayMode: 'individual',
  isTrafficModalOpen: false,
  runtimeBottleneck: null,
  staticCapacity: null,

  trackedRequestId: null,
  requestTrace: null,
  isTraceDrawerOpen: false,
  isTracingNextRequest: false,
  followTrackedPacket: false,

  runtimeNodes: {},
  counters: initialCounters,
  latencySummary: initialLatency,
  recentEvents: [],
  selectedEventRequestId: null,
  highlightedPath: [],
  activeSamplePackets: [],
  isEventLogOpen: false,

  openTrafficModal: () => set({ isTrafficModalOpen: true }),
  closeTrafficModal: () => set({ isTrafficModalOpen: false }),

  setDisplayMode: (mode: VisualizationDisplayMode) => set({ displayMode: mode }),

  setTrafficConfig: (partial: Partial<TrafficConfig>, graph?: GraphConfig) => {
    const current = get().trafficConfig;
    const updated: TrafficConfig = { ...current, ...partial };
    activeSim = null; // Invalidate current engine instance

    const activeMode =
      updated.mode === 'auto'
        ? updated.peakRps > 1000
          ? 'aggregate'
          : 'discrete'
        : updated.mode;

    const displayMode = activeMode === 'aggregate' ? 'aggregate' : 'individual';

    set({
      trafficConfig: updated,
      rps: updated.peakRps,
      durationMs: updated.durationMs,
      activeMode,
      displayMode,
    });

    if (graph) {
      const capacity = analyzeCapacity(graph);
      set({ staticCapacity: capacity });
    }
  },

  recalculateCapacity: (graph: GraphConfig) => {
    const capacity = analyzeCapacity(graph);
    set({ staticCapacity: capacity });
  },

  trackRequest: (requestId: string | null, graph?: GraphConfig) => {
    if (!requestId) {
      set({
        trackedRequestId: null,
        requestTrace: null,
        isTraceDrawerOpen: false,
        selectedEventRequestId: null,
        highlightedPath: [],
      });
      return;
    }

    const { recentEvents } = get();
    const trace = graph ? buildRequestTrace(requestId, recentEvents, graph) : null;
    const path = trace ? trace.path : [];

    set({
      trackedRequestId: requestId,
      requestTrace: trace,
      isTraceDrawerOpen: true,
      selectedEventRequestId: requestId,
      highlightedPath: path,
      isTracingNextRequest: false,
    });
  },

  traceNextRequest: () => {
    set({ isTracingNextRequest: true, isTraceDrawerOpen: true });
  },

  setFollowTrackedPacket: (follow: boolean) => set({ followTrackedPacket: follow }),
  closeTraceDrawer: () => set({ isTraceDrawerOpen: false }),
  clearTrace: () => {
    set({
      trackedRequestId: null,
      requestTrace: null,
      isTraceDrawerOpen: false,
      selectedEventRequestId: null,
      highlightedPath: [],
      isTracingNextRequest: false,
    });
  },

  getNodeHistory: (nodeId: string) => {
    const buf = getNodeBuffers(nodeId);
    return {
      points1: buf.metric1.toArray(),
      points2: buf.metric2.toArray(),
    };
  },

  play: (graph: GraphConfig) => {
    const { trafficConfig, seed, status } = get();
    if (status === 'paused') {
      set({ status: 'running' });
      return;
    }

    activeSim = createSimulation({
      graph,
      traffic: trafficConfig,
      seed,
    });
    lastGraphVersion = graph.version;

    const snap = activeSim.getSnapshot();
    const activeMode = snap.mode ?? (trafficConfig.peakRps > 1000 ? 'aggregate' : 'discrete');
    const displayMode = activeMode === 'aggregate' ? 'aggregate' : 'individual';

    // Initialize metrics store for fresh run
    useMetricsStore.getState().clearMetrics();
    const initialSample = emitMetricsSample(snap, graph, null);
    useMetricsStore.getState().ingestSample(initialSample);
    lastSnapshot = snap;

    set({
      status: 'running',
      simTimeMs: snap.timeMs,
      runtimeNodes: snap.runtimeNodes,
      counters: snap.counters,
      latencySummary: snap.latencySummary,
      recentEvents: snap.recentEvents,
      activeSamplePackets: [],
      runtimeBottleneck: snap.bottleneck ?? null,
      activeMode,
      displayMode,
    });
  },

  pause: () => {
    set({ status: 'paused' });
  },

  resume: () => {
    set({ status: 'running' });
  },

  step: (graph: GraphConfig) => {
    const { trafficConfig, seed } = get();
    const sim = getOrInitSimulation(graph, trafficConfig, seed);
    const snap = sim.stepNextEvent();

    set({
      status: snap.isDone ? 'completed' : 'paused',
      simTimeMs: snap.timeMs,
      runtimeNodes: snap.runtimeNodes,
      counters: snap.counters,
      latencySummary: snap.latencySummary,
      recentEvents: snap.recentEvents,
      runtimeBottleneck: snap.bottleneck ?? null,
      activeMode: snap.mode ?? (trafficConfig.peakRps > 1000 ? 'aggregate' : 'discrete'),
    });
  },

  reset: (graph?: GraphConfig) => {
    if (activeSim) {
      activeSim.reset();
    } else if (graph) {
      const { trafficConfig, seed } = get();
      activeSim = createSimulation({
        graph,
        traffic: trafficConfig,
        seed,
      });
    }

    // Reset ring buffers and metrics store
    for (const buf of nodeHistories.values()) {
      buf.metric1.clear();
      buf.metric2.clear();
    }
    lastSampledSimSec = -1;
    lastSnapshot = null;
    useMetricsStore.getState().clearMetrics();

    set({
      status: 'idle',
      simTimeMs: 0,
      runtimeNodes: activeSim ? activeSim.getSnapshot().runtimeNodes : {},
      counters: initialCounters,
      latencySummary: initialLatency,
      recentEvents: [],
      selectedEventRequestId: null,
      highlightedPath: [],
      activeSamplePackets: [],
      runtimeBottleneck: null,
      trackedRequestId: null,
      requestTrace: null,
      isTraceDrawerOpen: false,
    });
  },

  seek: (timeMs: number, graph: GraphConfig) => {
    const { trafficConfig, seed } = get();
    const sim = getOrInitSimulation(graph, trafficConfig, seed);
    const snap = sim.seek(Math.min(trafficConfig.durationMs, Math.max(0, timeMs)));

    // Rebuild trace if request was tracked
    const { trackedRequestId } = get();
    const trace = trackedRequestId ? buildRequestTrace(trackedRequestId, snap.recentEvents, graph) : null;
    useMetricsStore.getState().setTimeTravelTime(timeMs);

    set({
      simTimeMs: snap.timeMs,
      runtimeNodes: snap.runtimeNodes,
      counters: snap.counters,
      latencySummary: snap.latencySummary,
      recentEvents: snap.recentEvents,
      runtimeBottleneck: snap.bottleneck ?? null,
      activeMode: snap.mode ?? (trafficConfig.peakRps > 1000 ? 'aggregate' : 'discrete'),
      status: snap.isDone ? 'completed' : get().status === 'running' ? 'running' : 'paused',
      requestTrace: trace,
    });
  },

  setSpeed: (speed: SimulationSpeed) => set({ speed }),
  setRps: (rps: number) => {
    const current = get().trafficConfig;
    get().setTrafficConfig({ ...current, peakRps: rps });
  },
  setDuration: (durationMs: number) => {
    const current = get().trafficConfig;
    get().setTrafficConfig({ ...current, durationMs });
  },
  setSeed: (seed: number) => {
    set({ seed });
    activeSim = null;
  },
  randomizeSeed: () => {
    const newSeed = Math.floor(Math.random() * 999999) + 1;
    set({ seed: newSeed });
    activeSim = null;
  },

  toggleEventLog: () => set((s) => ({ isEventLogOpen: !s.isEventLogOpen })),

  selectEventRequestId: (requestId: string | null, graph?: GraphConfig) => {
    if (!requestId) {
      set({ selectedEventRequestId: null, highlightedPath: [] });
      return;
    }
    get().trackRequest(requestId, graph);
  },

  tickFrame: (deltaRealMs: number, graph: GraphConfig) => {
    const {
      status,
      speed,
      simTimeMs,
      trafficConfig,
      seed,
      trackedRequestId,
      isTracingNextRequest,
    } = get();
    if (status !== 'running') return;

    const sim = getOrInitSimulation(graph, trafficConfig, seed);
    const advanceAmount = deltaRealMs * speed;
    const targetSimTime = Math.min(trafficConfig.durationMs, simTimeMs + advanceAmount);

    const snap = sim.advanceTo(targetSimTime);

    // If "Trace Next Request" is active, find the newest created or sampled request
    let newlyTrackedId = trackedRequestId;
    if (isTracingNextRequest && !trackedRequestId) {
      const candidate = snap.recentEvents
        .slice()
        .reverse()
        .find((e) => e.type === 'REQUEST_CREATED');
      if (candidate) {
        newlyTrackedId = candidate.requestId;
      }
    }

    // Sample ring buffer and time-series metrics at ~1s intervals of simulated time
    const currentSimSec = Math.floor(snap.timeMs / 1000);
    if (currentSimSec > lastSampledSimSec) {
      lastSampledSimSec = currentSimSec;
      for (const [nodeId, nState] of Object.entries(snap.runtimeNodes)) {
        const buf = getNodeBuffers(nodeId);
        buf.metric1.push({ timeMs: snap.timeMs, value: nState.currentRps });
        buf.metric2.push({ timeMs: snap.timeMs, value: nState.queueDepth });
      }

      const sample = emitMetricsSample(snap, graph, lastSnapshot);
      useMetricsStore.getState().ingestSample(sample);
      lastSnapshot = snap;
    }

    // Check if simulation just finished -> build and present RunResult summary
    const isJustDone = (snap.isDone || targetSimTime >= trafficConfig.durationMs) && get().status === 'running';
    if (isJustDone) {
      const allSamples = useMetricsStore.getState().samples;
      const runResult = buildRunSummary({
        graph,
        traffic: trafficConfig,
        seed,
        samples: allSamples,
        finalSnapshot: snap,
      });
      useMetricsStore.getState().setRunResult(runResult);
      useMetricsStore.getState().openRunSummary();
    }

    // Compute basic visual packet sample from in-flight events (capped at 100)
    const packets: SamplePacket[] = [];
    const recent = snap.recentEvents.slice(-40);

    for (let i = 0; i < recent.length && packets.length < 100; i++) {
      const ev = recent[i]!;
      if (
        ev.targetNodeId &&
        (ev.type === 'REQUEST_RECEIVED' ||
          ev.type === 'LOAD_BALANCED' ||
          ev.type === 'RESPONSE_FORWARDED')
      ) {
        const ageMs = snap.timeMs - ev.timestamp;
        const progress = Math.min(1.0, ageMs / 25);
        packets.push({
          id: `pkt-${ev.id}`,
          sourceNodeId: ev.nodeId,
          targetNodeId: ev.targetNodeId,
          progress,
          isResponse: ev.type === 'RESPONSE_FORWARDED',
        });
      }
    }

    // Build trace if a request is actively tracked
    const trace = newlyTrackedId ? buildRequestTrace(newlyTrackedId, snap.recentEvents, graph) : null;
    const highlightedPath = trace ? trace.path : [];

    // Batch React state updates to ~10 Hz (every 100ms real time)
    const nowReal = performance.now();
    const shouldUpdateReact =
      nowReal - lastUiUpdateTime >= 95 ||
      snap.isDone ||
      targetSimTime >= trafficConfig.durationMs;

    if (shouldUpdateReact) {
      lastUiUpdateTime = nowReal;
      set({
        simTimeMs: snap.timeMs,
        runtimeNodes: snap.runtimeNodes,
        counters: snap.counters,
        latencySummary: snap.latencySummary,
        recentEvents: snap.recentEvents,
        activeSamplePackets: packets,
        runtimeBottleneck: snap.bottleneck ?? null,
        activeMode: snap.mode ?? (trafficConfig.peakRps > 1000 ? 'aggregate' : 'discrete'),
        status: snap.isDone || targetSimTime >= trafficConfig.durationMs ? 'completed' : 'running',
        trackedRequestId: newlyTrackedId,
        requestTrace: trace,
        highlightedPath,
        isTracingNextRequest: newlyTrackedId ? false : isTracingNextRequest,
      });
    }
  },
}));

// Selectors
export const selectSimPlayStatus = (state: SimulationStoreState) => state.status;
export const selectSimSpeed = (state: SimulationStoreState) => state.speed;
export const selectSimTimeMs = (state: SimulationStoreState) => state.simTimeMs;
export const selectSimDurationMs = (state: SimulationStoreState) => state.trafficConfig.durationMs;
export const selectSimRps = (state: SimulationStoreState) => state.trafficConfig.peakRps;
export const selectSimSeed = (state: SimulationStoreState) => state.seed;
export const selectSimCounters = (state: SimulationStoreState) => state.counters;
export const selectSimLatencySummary = (state: SimulationStoreState) => state.latencySummary;
export const selectSimRecentEvents = (state: SimulationStoreState) => state.recentEvents;
export const selectIsEventLogOpen = (state: SimulationStoreState) => state.isEventLogOpen;
export const selectSelectedEventRequestId = (state: SimulationStoreState) => state.selectedEventRequestId;
export const selectHighlightedPath = (state: SimulationStoreState) => state.highlightedPath;
export const selectActiveSamplePackets = (state: SimulationStoreState) => state.activeSamplePackets;
export const selectRuntimeNodes = (state: SimulationStoreState) => state.runtimeNodes;
export const selectTrafficConfig = (state: SimulationStoreState) => state.trafficConfig;
export const selectActiveMode = (state: SimulationStoreState) => state.activeMode;
export const selectIsTrafficModalOpen = (state: SimulationStoreState) => state.isTrafficModalOpen;
export const selectRuntimeBottleneck = (state: SimulationStoreState) => state.runtimeBottleneck;
export const selectStaticCapacity = (state: SimulationStoreState) => state.staticCapacity;

// Phase 5 Selectors
export const selectVisualizationDisplayMode = (state: SimulationStoreState) => state.displayMode;
export const selectTrackedRequestId = (state: SimulationStoreState) => state.trackedRequestId;
export const selectRequestTrace = (state: SimulationStoreState) => state.requestTrace;
export const selectIsTraceDrawerOpen = (state: SimulationStoreState) => state.isTraceDrawerOpen;
export const selectIsTracingNextRequest = (state: SimulationStoreState) => state.isTracingNextRequest;
export const selectFollowTrackedPacket = (state: SimulationStoreState) => state.followTrackedPacket;
