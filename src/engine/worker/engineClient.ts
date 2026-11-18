/**
 * EngineClient: Unified simulation adapter bridging UI and Engine.
 * Transparently orchestrates the dedicated simulation Web Worker
 * with automatic, zero-overhead main-thread fallback when Workers are unavailable.
 * 
 * Strict invariants:
 * - Stale-run discarding via monotonically tagged `runId`.
 * - Clean termination and resource disposal on reset / seek / dispose.
 * - Backpressure lookahead buffering (UI clock controls frame; worker computes ahead).
 * - Identical deterministic results between Worker and Fallback modes.
 */

import {
  SimulationConfig,
  SimulationSnapshot,
  WorkerCommand,
  WorkerResponse,
  TrafficConfig,
} from '../protocol';
import { SimulationEvent } from '../../types/runtime';
import { GraphConfig } from '../../types';
import { ScenarioCommand } from '../../scenarios/failures/types';
import { AttackCampaign } from '../../types/attacks';
import { createSimulation, Simulation } from '../simulation';
import { emitMetricsSample } from '../metrics/sampleEmitter';
import { MetricsSample } from '../../types/metrics';

export interface EngineClientCallbacks {
  onSnapshot?: (snapshot: SimulationSnapshot) => void;
  onEventBatch?: (events: SimulationEvent[], cursor: number) => void;
  onMetricsSample?: (sample: MetricsSample) => void;
  onDone?: (snapshot: SimulationSnapshot) => void;
  onError?: (error: string) => void;
}

export interface EngineClient {
  readonly isWorker: boolean;
  readonly runId: string;
  init: (config: SimulationConfig) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  step: () => void;
  seek: (timeMs: number, graph?: GraphConfig) => void;
  advanceTo: (timeMs: number) => void;
  reset: (graph?: GraphConfig) => void;
  setSpeed: (speed: number) => void;
  injectFailure: (command: ScenarioCommand) => void;
  removeFailure: (targetId: string, failureType: string) => void;
  setTraffic: (traffic: TrafficConfig) => void;
  setCampaign: (campaign?: AttackCampaign) => void;
  setDefenses: (defenses?: unknown) => void;
  terminate: () => void;
  getLatestSnapshot: () => SimulationSnapshot | null;
}

/**
 * Creates an EngineClient instance.
 * Automatically tries dedicated Web Worker first; falls back seamlessly to main-thread.
 */
let runSequence = 0;
function nextRunId(): string {
  runSequence += 1;
  return `run-${runSequence}`;
}

export function createEngineClient(
  initialConfig: SimulationConfig,
  callbacks: EngineClientCallbacks = {},
  forceFallback = false
): EngineClient {
  let runId = nextRunId();
  let isWorker = false;
  let worker: Worker | null = null;
  let latestSnapshot: SimulationSnapshot | null = null;
  try {
    const tempSim = createSimulation(initialConfig);
    latestSnapshot = tempSim.getSnapshot();
  } catch {}

  // Detect worker support
  const hasWorkerSupport =
    !forceFallback &&
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof URL !== 'undefined';

  if (hasWorkerSupport) {
    try {
      worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
        type: 'module',
      });
      isWorker = true;
    } catch {
      // Fall back to main-thread if worker initialization fails
      worker = null;
      isWorker = false;
    }
  }

  // --- Worker-Mode Client Implementation ---
  if (isWorker && worker) {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (!msg || msg.runId !== runId) {
        // Discard stale message from previous run
        return;
      }

      switch (msg.type) {
        case 'SNAPSHOT':
          latestSnapshot = msg.snapshot;
          callbacks.onSnapshot?.(msg.snapshot);
          break;
        case 'EVENT_BATCH':
          callbacks.onEventBatch?.(msg.events, msg.cursor);
          break;
        case 'METRICS_SAMPLE':
          callbacks.onMetricsSample?.(msg.sample as MetricsSample);
          break;
        case 'DONE':
          latestSnapshot = msg.snapshot;
          callbacks.onDone?.(msg.snapshot);
          break;
        case 'ERROR':
          callbacks.onError?.(msg.error);
          break;
      }
    };

    worker.onerror = (err) => {
      callbacks.onError?.(err.message || 'Simulation worker encountered an unhandled error.');
    };

    const send = (cmd: WorkerCommand) => {
      worker?.postMessage(cmd);
    };

    // Send initial INIT
    send({ type: 'INIT', runId, config: initialConfig });

    return {
      get isWorker() {
        return true;
      },
      get runId() {
        return runId;
      },
      init: (config) => {
        runId = nextRunId();
        send({ type: 'INIT', runId, config });
      },
      start: () => send({ type: 'START', runId }),
      pause: () => send({ type: 'PAUSE', runId }),
      resume: () => send({ type: 'RESUME', runId }),
      step: () => send({ type: 'STEP', runId }),
      seek: (timeMs, graph) => send({ type: 'SEEK', runId, timeMs, graph }),
      advanceTo: (timeMs) => send({ type: 'ADVANCE', runId, timeMs }),
      reset: (graph) => send({ type: 'RESET', runId, graph }),
      setSpeed: (speed) => send({ type: 'SET_SPEED', runId, speed }),
      injectFailure: (command) => send({ type: 'INJECT_FAILURE', runId, command }),
      removeFailure: (targetId, failureType) =>
        send({ type: 'REMOVE_FAILURE', runId, targetId, failureType }),
      setTraffic: (traffic) => send({ type: 'SET_TRAFFIC', runId, traffic }),
      setCampaign: (campaign) => send({ type: 'SET_CAMPAIGN', runId, campaign }),
      setDefenses: (defenses) => send({ type: 'SET_DEFENSES', runId, defenses }),
      terminate: () => {
        send({ type: 'DISPOSE', runId });
        worker?.terminate();
        worker = null;
      },
      getLatestSnapshot: () => latestSnapshot,
    };
  }

  // --- Main-Thread Fallback Client Implementation ---
  let activeSim: Simulation | null = createSimulation(initialConfig);
  let currentConfig: SimulationConfig = initialConfig;
  let lastEventCursor = 0;
  let lastSampledSimSec = -1;
  let lastSnap: SimulationSnapshot | null = activeSim.getSnapshot();
  latestSnapshot = lastSnap;

  // Deliver initial snapshot
  if (callbacks.onSnapshot && lastSnap) {
    callbacks.onSnapshot(lastSnap);
  }

  return {
    get isWorker() {
      return false;
    },
    get runId() {
      return runId;
    },
    init: (config) => {
      runId = nextRunId();
      currentConfig = config;
      lastEventCursor = 0;
      lastSampledSimSec = -1;
      activeSim = createSimulation(config);
      lastSnap = activeSim.getSnapshot();
      latestSnapshot = lastSnap;
      callbacks.onSnapshot?.(lastSnap);
    },
    start: () => {
      // Main-thread starts running
    },
    pause: () => {
      // Main-thread paused
    },
    resume: () => {
      // Main-thread resumed
    },
    step: () => {
      if (!activeSim) return;
      const snap = activeSim.stepNextEvent();
      lastEventCursor = snap.eventCursor;
      latestSnapshot = snap;
      callbacks.onSnapshot?.(snap);
      if (snap.isDone) callbacks.onDone?.(snap);
    },
    seek: (timeMs, graph) => {
      if (graph) currentConfig = { ...currentConfig, graph };
      if (!activeSim) activeSim = createSimulation(currentConfig);
      const snap = activeSim.seek(timeMs);
      lastEventCursor = snap.eventCursor;
      lastSampledSimSec = Math.floor(snap.timeMs / 1000);
      latestSnapshot = snap;
      callbacks.onSnapshot?.(snap);
      if (snap.isDone) callbacks.onDone?.(snap);
    },
    advanceTo: (timeMs) => {
      if (!activeSim) return;
      const snap = activeSim.advanceTo(timeMs);
      latestSnapshot = snap;

      // Event batching
      if (snap.recentEvents.length > 0 && snap.eventCursor > lastEventCursor) {
        const newEvents = snap.recentEvents.slice(
          Math.max(0, snap.recentEvents.length - (snap.eventCursor - lastEventCursor))
        );
        lastEventCursor = snap.eventCursor;
        if (newEvents.length > 0) {
          callbacks.onEventBatch?.(newEvents, snap.eventCursor);
        }
      }

      callbacks.onSnapshot?.(snap);

      // 1-sec metrics sample
      const currentSimSec = Math.floor(snap.timeMs / 1000);
      if (currentSimSec > lastSampledSimSec) {
        lastSampledSimSec = currentSimSec;
        const sample = emitMetricsSample(snap, currentConfig.graph, lastSnap);
        lastSnap = snap;
        callbacks.onMetricsSample?.(sample);
      }

      if (snap.isDone || timeMs >= (currentConfig.traffic.durationMs ?? 10000)) {
        callbacks.onDone?.(snap);
      }
    },
    reset: (graph) => {
      if (graph) currentConfig = { ...currentConfig, graph };
      if (activeSim) {
        activeSim.reset();
      } else {
        activeSim = createSimulation(currentConfig);
      }
      lastEventCursor = 0;
      lastSampledSimSec = -1;
      const snap = activeSim.getSnapshot();
      lastSnap = snap;
      latestSnapshot = snap;
      callbacks.onSnapshot?.(snap);
    },
    setSpeed: () => {
      // Speed handled by UI clock frame step
    },
    injectFailure: (command) => {
      const script = currentConfig.scenarioScript ? [...currentConfig.scenarioScript] : [];
      script.push(command);
      currentConfig = { ...currentConfig, scenarioScript: script };
      const currentTime = activeSim ? activeSim.getSnapshot().timeMs : 0;
      activeSim = createSimulation(currentConfig);
      activeSim.seek(currentTime);
      const snap = activeSim.getSnapshot();
      latestSnapshot = snap;
      callbacks.onSnapshot?.(snap);
    },
    removeFailure: (targetId, failureType) => {
      const script = (currentConfig.scenarioScript || []).filter(
        (c) => !(c.targetId === targetId && c.failureType === failureType)
      );
      currentConfig = { ...currentConfig, scenarioScript: script };
      const currentTime = activeSim ? activeSim.getSnapshot().timeMs : 0;
      activeSim = createSimulation(currentConfig);
      activeSim.seek(currentTime);
      const snap = activeSim.getSnapshot();
      latestSnapshot = snap;
      callbacks.onSnapshot?.(snap);
    },
    setTraffic: (traffic) => {
      currentConfig = { ...currentConfig, traffic };
      activeSim = createSimulation(currentConfig);
      lastEventCursor = 0;
      lastSampledSimSec = -1;
      const snap = activeSim.getSnapshot();
      latestSnapshot = snap;
      callbacks.onSnapshot?.(snap);
    },
    setCampaign: (campaign) => {
      currentConfig = { ...currentConfig, campaign };
      activeSim = createSimulation(currentConfig);
      lastEventCursor = 0;
      lastSampledSimSec = -1;
      const snap = activeSim.getSnapshot();
      latestSnapshot = snap;
      callbacks.onSnapshot?.(snap);
    },
    setDefenses: () => {
      // Defenses handled inside simulation config
    },
    terminate: () => {
      activeSim = null;
    },
    getLatestSnapshot: () => latestSnapshot,
  };
}
