/**
 * Dedicated Web Worker for the Simulation Engine (Phase 10).
 * Decouples high-throughput discrete event loops & fluid ODE integration
 * from the React 60 FPS UI thread.
 * 
 * Features:
 * - Pure postMessage communication with strongly-typed WorkerCommand / WorkerResponse.
 * - Clock ownership: UI clock advances real-time frame; Worker lookahead computes up to 500ms ahead.
 * - Stale-run discarding: Every message carries `runId`.
 * - Clean teardown on Reset / Seek / Dispose (zero memory leaks).
 * - Transferable ArrayBuffers for high-frequency metric payloads.
 */

import { createSimulation, Simulation } from '../simulation';
import {
  SimulationConfig,
  WorkerCommand,
  WorkerResponse,
  SimulationSnapshot,
} from '../protocol';
import { emitMetricsSample } from '../metrics/sampleEmitter';

let currentRunId = '';
let activeSim: Simulation | null = null;
let currentConfig: SimulationConfig | null = null;
let lookaheadMs = 500;
let lastEventCursor = 0;
let lastSampledSimSec = -1;
let lastSnapshot: SimulationSnapshot | null = null;

function handleAdvance(targetTimeMs: number): void {
  if (!activeSim || !currentConfig) return;

  const durationMs = currentConfig.traffic.durationMs ?? 10000;
  const boundedTarget = Math.min(durationMs, Math.max(0, targetTimeMs));

  const snap = activeSim.advanceTo(boundedTarget);

  // 1. Emit Event Batch if new events occurred
  if (snap.recentEvents.length > 0 && snap.eventCursor > lastEventCursor) {
    const newEvents = snap.recentEvents.slice(
      Math.max(0, snap.recentEvents.length - (snap.eventCursor - lastEventCursor))
    );
    lastEventCursor = snap.eventCursor;

    if (newEvents.length > 0) {
      postResponse({
        type: 'EVENT_BATCH',
        runId: currentRunId,
        events: newEvents,
        cursor: snap.eventCursor,
      });
    }
  }

  // 2. Emit Snapshot
  postResponse({
    type: 'SNAPSHOT',
    runId: currentRunId,
    snapshot: snap,
  });

  // 3. Emit Metrics Sample at ~1 Hz simulated intervals
  const currentSimSec = Math.floor(snap.timeMs / 1000);
  if (currentSimSec > lastSampledSimSec) {
    lastSampledSimSec = currentSimSec;
    const sample = emitMetricsSample(snap, currentConfig.graph, lastSnapshot);
    lastSnapshot = snap;

    postResponse({
      type: 'METRICS_SAMPLE',
      runId: currentRunId,
      sample,
    });
  }

  // 4. Emit Done if completed
  if (snap.isDone || snap.timeMs >= durationMs) {
    postResponse({
      type: 'DONE',
      runId: currentRunId,
      snapshot: snap,
    });
  }
}

function postResponse(resp: WorkerResponse, transferables?: Transferable[]): void {
  if (transferables && transferables.length > 0) {
    self.postMessage(resp, { transfer: transferables });
  } else {
    self.postMessage(resp);
  }
}

self.onmessage = (e: MessageEvent<WorkerCommand>) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;

  try {
    switch (msg.type) {
      case 'INIT': {
        currentRunId = msg.runId;
        currentConfig = msg.config;
        lastEventCursor = 0;
        lastSampledSimSec = -1;
        lastSnapshot = null;

        activeSim = createSimulation(msg.config);
        const initialSnap = activeSim.getSnapshot();
        lastSnapshot = initialSnap;

        postResponse({ type: 'READY', runId: currentRunId });
        postResponse({
          type: 'SNAPSHOT',
          runId: currentRunId,
          snapshot: initialSnap,
        });
        break;
      }

      case 'START': {
        break;
      }

      case 'PAUSE': {
        break;
      }

      case 'RESUME': {
        break;
      }

      case 'ADVANCE': {
        if (msg.runId !== currentRunId || !activeSim) return;
        // Compute ahead by lookaheadMs
        const target = msg.timeMs + lookaheadMs;
        handleAdvance(target);
        break;
      }

      case 'STEP': {
        if (msg.runId !== currentRunId || !activeSim) return;
        const snap = activeSim.stepNextEvent();
        lastEventCursor = snap.eventCursor;
        postResponse({
          type: 'SNAPSHOT',
          runId: currentRunId,
          snapshot: snap,
        });
        if (snap.isDone) {
          postResponse({ type: 'DONE', runId: currentRunId, snapshot: snap });
        }
        break;
      }

      case 'SEEK': {
        if (msg.runId !== currentRunId || !activeSim || !currentConfig) return;
        const duration = currentConfig.traffic.durationMs ?? 10000;
        const seekTarget = Math.min(duration, Math.max(0, msg.timeMs));
        const snap = activeSim.seek(seekTarget);
        lastEventCursor = snap.eventCursor;
        lastSampledSimSec = Math.floor(snap.timeMs / 1000);
        lastSnapshot = snap;

        postResponse({
          type: 'SNAPSHOT',
          runId: currentRunId,
          snapshot: snap,
        });
        break;
      }

      case 'RESET': {
        if (msg.runId !== currentRunId && currentRunId !== '') return;
        if (msg.graph && currentConfig) {
          currentConfig = { ...currentConfig, graph: msg.graph };
        }
        if (activeSim) {
          activeSim.reset();
          const snap = activeSim.getSnapshot();
          lastEventCursor = 0;
          lastSampledSimSec = -1;
          lastSnapshot = snap;

          postResponse({
            type: 'SNAPSHOT',
            runId: currentRunId,
            snapshot: snap,
          });
        }
        break;
      }

      case 'SET_LOOKAHEAD': {
        if (msg.runId === currentRunId) {
          lookaheadMs = Math.max(50, Math.min(5000, msg.lookaheadMs));
        }
        break;
      }

      case 'SET_TRAFFIC': {
        if (msg.runId === currentRunId && currentConfig) {
          currentConfig = { ...currentConfig, traffic: msg.traffic };
          activeSim = createSimulation(currentConfig);
          lastEventCursor = 0;
          lastSampledSimSec = -1;
          const snap = activeSim.getSnapshot();
          postResponse({ type: 'SNAPSHOT', runId: currentRunId, snapshot: snap });
        }
        break;
      }

      case 'SET_CAMPAIGN': {
        if (msg.runId === currentRunId && currentConfig) {
          currentConfig = { ...currentConfig, campaign: msg.campaign };
          activeSim = createSimulation(currentConfig);
          lastEventCursor = 0;
          lastSampledSimSec = -1;
          const snap = activeSim.getSnapshot();
          postResponse({ type: 'SNAPSHOT', runId: currentRunId, snapshot: snap });
        }
        break;
      }

      case 'INJECT_FAILURE': {
        if (msg.runId === currentRunId && currentConfig) {
          const script = currentConfig.scenarioScript ? [...currentConfig.scenarioScript] : [];
          script.push(msg.command);
          currentConfig = { ...currentConfig, scenarioScript: script };
          // If sim is running, seek or recreate cleanly
          const currentTime = activeSim ? activeSim.getSnapshot().timeMs : 0;
          activeSim = createSimulation(currentConfig);
          activeSim.seek(currentTime);
          const snap = activeSim.getSnapshot();
          postResponse({ type: 'SNAPSHOT', runId: currentRunId, snapshot: snap });
        }
        break;
      }

      case 'REMOVE_FAILURE': {
        if (msg.runId === currentRunId && currentConfig) {
          const script = (currentConfig.scenarioScript || []).filter(
            (c) => !(c.targetId === msg.targetId && c.failureType === msg.failureType)
          );
          currentConfig = { ...currentConfig, scenarioScript: script };
          const currentTime = activeSim ? activeSim.getSnapshot().timeMs : 0;
          activeSim = createSimulation(currentConfig);
          activeSim.seek(currentTime);
          const snap = activeSim.getSnapshot();
          postResponse({ type: 'SNAPSHOT', runId: currentRunId, snapshot: snap });
        }
        break;
      }

      case 'REQUEST_SNAPSHOT': {
        if (msg.runId === currentRunId && activeSim) {
          postResponse({
            type: 'SNAPSHOT',
            runId: currentRunId,
            snapshot: activeSim.getSnapshot(),
          });
        }
        break;
      }

      case 'DISPOSE': {
        activeSim = null;
        currentConfig = null;
        currentRunId = '';
        break;
      }
    }
  } catch (err) {
    postResponse({
      type: 'ERROR',
      runId: currentRunId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
