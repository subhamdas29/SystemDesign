/**
 * Simulation Store.
 * Bridges UI controls, telemetry metrics, event log, live inspection, and request tracing
 * with the pure simulation engine.
 */

import { create } from 'zustand';
import {
  SimulationCounters,
  LatencySummary,
  createEngineClient,
  EngineClient,
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
import { ActiveFailure, ScenarioCommand, FailureType } from '../scenarios/failures/types';
import { ALL_PRESETS } from '../scenarios/examples/presets';
import { useGraphStore } from './graphStore';
import { useAttackStore } from './attackStore';
import { useDefenseStore } from './defenseStore';

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

  // Phase 7 Chaos & Failure Injections
  scenarioScript: ScenarioCommand[];
  activeFailures: ActiveFailure[];
  amplificationFactor: number;
  narrativeEvents: { id: string; timeMs: number; text: string; type: 'info' | 'warning' | 'critical' }[];

  runtimeNodes: Record<string, NodeRuntimeState>;
  counters: SimulationCounters;
  latencySummary: LatencySummary;
  recentEvents: SimulationEvent[];
  selectedEventRequestId: string | null;
  highlightedPath: string[];
  activeSamplePackets: SamplePacket[];
  isEventLogOpen: boolean;

  // Phase 10 Worker Error Reporting
  simulationError: string | null;
  clearSimulationError: () => void;
  restartSimulation: (graph: GraphConfig) => void;

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

  // Phase 7 Actions
  injectFailureNow: (
    failureType: FailureType,
    targetId: string,
    params?: Record<string, number>,
    durationMs?: number
  ) => void;
  scheduleFailure: (cmd: ScenarioCommand) => void;
  removeFailure: (failureId: string) => void;
  clearScenarioScript: () => void;
  loadScenarioPreset: (presetId: string, baseGraph: GraphConfig) => void;
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
let activeClient: EngineClient | null = null;
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

function getOrInitClient(
  graph: GraphConfig,
  trafficConfig: TrafficConfig,
  seed: number,
  scenarioScript?: ScenarioCommand[]
): EngineClient {
  const attackState = useAttackStore.getState();
  const campaign = attackState.isAttackerMode ? attackState.activeCampaign : undefined;

  if (!activeClient || lastGraphVersion !== graph.version) {
    if (activeClient) {
      activeClient.terminate();
    }
    activeClient = createEngineClient(
      {
        graph,
        traffic: trafficConfig,
        seed,
        scenarioScript,
        campaign,
      },
      {
        onError: (err) => {
          useSimulationStore.setState({ simulationError: err, status: 'paused' });
        },
      }
    );
    lastGraphVersion = graph.version;
  }
  return activeClient;
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

  // Phase 7 Chaos & Failure Injections
  scenarioScript: [],
  activeFailures: [],
  amplificationFactor: 1.0,
  narrativeEvents: [],

  runtimeNodes: {},
  counters: initialCounters,
  latencySummary: initialLatency,
  recentEvents: [],
  selectedEventRequestId: null,
  highlightedPath: [],
  activeSamplePackets: [],
  isEventLogOpen: false,

  // Phase 10 Worker Error Reporting
  simulationError: null,
  clearSimulationError: () => set({ simulationError: null }),
  restartSimulation: (graph: GraphConfig) => {
    get().reset(graph);
    get().play(graph);
    set({ simulationError: null });
  },

  openTrafficModal: () => set({ isTrafficModalOpen: true }),
  closeTrafficModal: () => set({ isTrafficModalOpen: false }),

  setDisplayMode: (mode: VisualizationDisplayMode) => set({ displayMode: mode }),

  setTrafficConfig: (partial: Partial<TrafficConfig>, graph?: GraphConfig) => {
    const current = get().trafficConfig;
    const updated: TrafficConfig = { ...current, ...partial };
    if (activeClient) {
      activeClient.terminate();
      activeClient = null;
    }

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
    const { trafficConfig, seed, status, scenarioScript } = get();
    if (status === 'paused') {
      if (activeClient) activeClient.resume();
      set({ status: 'running' });
      return;
    }

    const attackState = useAttackStore.getState();
    const campaign = attackState.isAttackerMode ? attackState.activeCampaign : undefined;

    if (activeClient) {
      activeClient.terminate();
    }

    activeClient = createEngineClient(
      {
        graph,
        traffic: trafficConfig,
        seed,
        scenarioScript,
        campaign,
      },
      {
        onError: (err) => {
          set({ simulationError: err, status: 'paused' });
        },
      }
    );
    lastGraphVersion = graph.version;

    const snap = activeClient.getLatestSnapshot()!;
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
      activeFailures: snap.activeFailures ?? [],
      amplificationFactor: snap.amplificationFactor ?? 1.0,
      runtimeBottleneck: snap.bottleneck ?? null,
      activeMode,
      displayMode,
      simulationError: null,
    });
  },

  pause: () => {
    if (activeClient) activeClient.pause();
    set({ status: 'paused' });
  },

  resume: () => {
    if (activeClient) activeClient.resume();
    set({ status: 'running' });
  },

  step: (graph: GraphConfig) => {
    const { trafficConfig, seed, scenarioScript } = get();
    const client = getOrInitClient(graph, trafficConfig, seed, scenarioScript);
    client.step();
    const snap = client.getLatestSnapshot();
    if (!snap) return;

    set({
      status: snap.isDone ? 'completed' : 'paused',
      simTimeMs: snap.timeMs,
      runtimeNodes: snap.runtimeNodes,
      counters: snap.counters,
      latencySummary: snap.latencySummary,
      recentEvents: snap.recentEvents,
      activeFailures: snap.activeFailures ?? [],
      amplificationFactor: snap.amplificationFactor ?? 1.0,
      runtimeBottleneck: snap.bottleneck ?? null,
      activeMode: snap.mode ?? (trafficConfig.peakRps > 1000 ? 'aggregate' : 'discrete'),
    });
  },

  reset: (graph?: GraphConfig) => {
    if (activeClient) {
      activeClient.reset(graph);
    } else if (graph) {
      const { trafficConfig, seed, scenarioScript } = get();
      const attackState = useAttackStore.getState();
      const campaign = attackState.isAttackerMode ? attackState.activeCampaign : undefined;
      activeClient = createEngineClient({
        graph,
        traffic: trafficConfig,
        seed,
        scenarioScript,
        campaign,
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

    const snap = activeClient?.getLatestSnapshot();

    set({
      status: 'idle',
      simTimeMs: 0,
      runtimeNodes: snap ? snap.runtimeNodes : {},
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
      activeFailures: [],
      amplificationFactor: 1.0,
      narrativeEvents: [],
      simulationError: null,
    });
  },

  seek: (timeMs: number, graph: GraphConfig) => {
    const { trafficConfig, seed, scenarioScript } = get();
    const client = getOrInitClient(graph, trafficConfig, seed, scenarioScript);
    client.seek(Math.min(trafficConfig.durationMs, Math.max(0, timeMs)), graph);
    const snap = client.getLatestSnapshot();
    if (!snap) return;

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
      activeFailures: snap.activeFailures ?? [],
      amplificationFactor: snap.amplificationFactor ?? 1.0,
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
    if (activeClient) {
      activeClient.terminate();
      activeClient = null;
    }
  },
  randomizeSeed: () => {
    const newSeed = Math.floor(Math.random() * 999999) + 1;
    set({ seed: newSeed });
    if (activeClient) {
      activeClient.terminate();
      activeClient = null;
    }
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
      scenarioScript,
      narrativeEvents,
    } = get();
    if (status !== 'running') return;

    const client = getOrInitClient(graph, trafficConfig, seed, scenarioScript);
    const advanceAmount = deltaRealMs * speed;
    const targetSimTime = Math.min(trafficConfig.durationMs, simTimeMs + advanceAmount);

    client.advanceTo(targetSimTime);
    const snap = client.getLatestSnapshot();
    if (!snap) return;

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
      const prevSummary = useDefenseStore.getState().previousRunSummary;
      const runResult = buildRunSummary({
        graph,
        traffic: trafficConfig,
        seed,
        samples: allSamples,
        finalSnapshot: snap,
        previousRunSummary: prevSummary,
      });
      const attackState = useAttackStore.getState();
      if (attackState.isAttackerMode) {
        runResult.summary.isAttackRun = true;
        runResult.summary.campaignId = attackState.activeCampaign.id;
        runResult.summary.campaignName = attackState.activeCampaign.name;
      }
      useDefenseStore.getState().setPreviousRunSummary(runResult.summary);
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

    // Collect narrative events from simulation events
    const newNarrative = [...narrativeEvents];
    for (const ev of snap.recentEvents.slice(-25)) {
      if (ev.type === 'FAILURE_INJECTED' && !newNarrative.some((n) => n.id === `f-${ev.id}`)) {
        newNarrative.push({
          id: `f-${ev.id}`,
          timeMs: ev.timestamp,
          text: `Injected ${ev.failureType} on ${ev.nodeId}`,
          type: 'warning',
        });
      } else if (ev.type === 'FAILURE_REMOVED' && !newNarrative.some((n) => n.id === `fr-${ev.id}`)) {
        newNarrative.push({
          id: `fr-${ev.id}`,
          timeMs: ev.timestamp,
          text: `Failure on ${ev.nodeId} resolved`,
          type: 'info',
        });
      } else if (ev.type === 'HEALTH_CHECK_FAILED' && !newNarrative.some((n) => n.id === `hc-${ev.id}`)) {
        newNarrative.push({
          id: `hc-${ev.id}`,
          timeMs: ev.timestamp,
          text: `Node ${ev.nodeId} failed health checks; removed from pool`,
          type: 'critical',
        });
      } else if (ev.type === 'HEALTH_CHECK_RECOVERED' && !newNarrative.some((n) => n.id === `hcr-${ev.id}`)) {
        newNarrative.push({
          id: `hcr-${ev.id}`,
          timeMs: ev.timestamp,
          text: `Node ${ev.nodeId} passed health checks; returned to pool`,
          type: 'info',
        });
      }
    }

    if (
      snap.amplificationFactor &&
      snap.amplificationFactor >= 1.5 &&
      !newNarrative.some((n) => n.id.startsWith('amp-'))
    ) {
      newNarrative.push({
        id: `amp-${Math.floor(snap.timeMs / 5000)}`,
        timeMs: snap.timeMs,
        text: `Retry storm detected: load amplified ${snap.amplificationFactor.toFixed(1)}x`,
        type: 'critical',
      });
    }

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
        activeFailures: snap.activeFailures ?? [],
        amplificationFactor: snap.amplificationFactor ?? 1.0,
        narrativeEvents: newNarrative.slice(-50),
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

  injectFailureNow: (
    failureType: FailureType,
    targetId: string,
    params?: Record<string, number>,
    durationMs?: number
  ) => {
    const curTime = get().simTimeMs;
    const cmd: ScenarioCommand = {
      t: curTime,
      action: 'inject',
      failureType,
      targetId,
      params,
      durationMs,
    };

    if (activeClient) {
      activeClient.injectFailure(cmd);
    }

    const currentScript = get().scenarioScript;
    set({
      scenarioScript: [...currentScript, cmd],
      narrativeEvents: [
        ...get().narrativeEvents,
        {
          id: `manual-${Date.now()}`,
          timeMs: curTime,
          text: `Injected ${failureType} on ${targetId}`,
          type: 'warning',
        },
      ],
    });
  },

  scheduleFailure: (cmd: ScenarioCommand) => {
    set((s) => ({
      scenarioScript: [...s.scenarioScript, cmd],
    }));
  },

  removeFailure: (failureId: string) => {
    if (activeClient) {
      const target = get().activeFailures.find((f) => f.id === failureId);
      if (target) {
        activeClient.removeFailure(target.targetId, target.failureType);
      }
    }
    set((s) => ({
      activeFailures: s.activeFailures.filter((f) => f.id !== failureId),
    }));
  },

  clearScenarioScript: () => {
    set({ scenarioScript: [], activeFailures: [] });
  },

  loadScenarioPreset: (presetId: string, baseGraph: GraphConfig) => {
    const preset = ALL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const modifiedGraph = preset.configureGraph(baseGraph);
    useGraphStore.getState().loadGraph(modifiedGraph);

    if (activeClient) {
      activeClient.terminate();
      activeClient = null;
    }

    get().setTrafficConfig(preset.traffic, modifiedGraph);
    set({
      scenarioScript: preset.scenarioScript,
      narrativeEvents: [
        {
          id: `preset-${Date.now()}`,
          timeMs: 0,
          text: `Loaded preset: ${preset.title} - ${preset.subtitle}`,
          type: 'info',
        },
      ],
    });
    get().reset(modifiedGraph);
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

// Phase 7 Selectors
export const selectScenarioScript = (state: SimulationStoreState) => state.scenarioScript;
export const selectActiveFailures = (state: SimulationStoreState) => state.activeFailures;
export const selectAmplificationFactor = (state: SimulationStoreState) => state.amplificationFactor;
export const selectNarrativeEvents = (state: SimulationStoreState) => state.narrativeEvents;

// Phase 10 Selectors
export const selectSimulationError = (state: SimulationStoreState) => state.simulationError;
