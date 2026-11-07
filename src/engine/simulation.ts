/**
 * Discrete-Event Simulation Engine Core (Phase 7).
 * Pure TypeScript with ZERO React, DOM, time, or Math.random() imports.
 * Features:
 *   - Lognormal service time variability with realistic tail latency (P95, P99)
 *   - Per-edge network latency with Gaussian jitter and packet loss
 *   - Multi-level timeouts and orphaned work modeling
 *   - Retries with configurable backoff policies and retry budget
 *   - Load Balancer periodic health checks with detection delay
 *   - Deterministic failure injection via timestamped scenario scripts
 *   - Cold cache linear warm-up producing thundering herd on database
 */

import {
  SimulationConfig,
  SimulationSnapshot,
  SimulationCounters,
  LatencySummary,
} from './protocol';
import { SimulationEvent, NodeRuntimeState } from '../types/runtime';
import { PriorityQueue, ScheduledEventItem } from './scheduler/priorityQueue';
import { EngineTopology, buildTopology } from './topology';
import { generatePoissonTraffic } from './traffic';
import { createPRNG, sampleGaussian, sampleLognormal, PRNG } from './rng';
import { selectBackend } from './components/loadBalancerModel';
import { decideHit } from './components/cacheModel';
import { acquireConnection } from './components/databaseModel';
import { decideDnsHit } from './components/dnsModel';
import { getComponentModel } from './components/registry';
import {
  ClientConfig,
  CacheConfig,
  DatabaseConfig,
  LoadBalancerConfig,
  AppServerConfig,
  RETRY_PRESETS,
  RetryPolicy,
} from '../types';
import { detectBottleneck } from './analysis/bottleneckDetector';
import { createAggregateSimulation } from './aggregateSimulation';
import { ActiveFailure, ScenarioCommand, FailureType } from '../scenarios/failures/types';

export const MAX_EVENT_BUFFER = 50000;

interface InternalRequest {
  id: string;
  originalRequestId?: string;
  createdAtMs: number;
  attempt: number;
  kind: 'read' | 'write';
  status:
    | 'created'
    | 'in-transit'
    | 'queued'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'rejected'
    | 'timed-out';
  statusCode: number;
  path: string[];
  currentHopIndex: number;
  activeNodeId?: string;
  isOrphaned?: boolean;
}

type InternalEventType =
  | 'REQUEST_ARRIVAL'
  | 'DNS_RESOLVED'
  | 'ENTER_NODE'
  | 'PROCESSING_COMPLETED'
  | 'DB_QUERY_COMPLETED'
  | 'RESPONSE_HOP'
  | 'LB_HEALTH_CHECK'
  | 'SCENARIO_ACTION'
  | 'CLIENT_TIMEOUT';

interface InternalEventData {
  type: InternalEventType;
  requestId: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface Simulation {
  advanceTo(timeMs: number): SimulationSnapshot;
  stepNextEvent(): SimulationSnapshot;
  reset(): void;
  getSnapshot(): SimulationSnapshot;
  seek(timeMs: number): SimulationSnapshot;
  getAllEvents(): SimulationEvent[];
  injectFailure?(failure: {
    failureType: FailureType;
    targetId: string;
    durationMs?: number;
    params?: Record<string, number>;
  }): string;
  removeFailure?(failureId: string): void;
}

export function createDiscreteSimulation(config: SimulationConfig): Simulation {
  let simTimeMs = 0;
  let eventSeq = 0;
  let requestIdCounter = 1;

  // Snapshot history for hysteresis bottleneck detection
  const snapshotHistory: SimulationSnapshot[] = [];

  // Master PRNG and traffic generation
  let masterRng = createPRNG(config.seed);
  let trafficRng = createPRNG(masterRng.nextInt(1, 0x7fffffff));

  // Build topology with deterministic component PRNG substreams
  let topology: EngineTopology = buildTopology(config.graph, config.seed);

  // Initialize Priority Queue
  const pq = new PriorityQueue<InternalEventData>();

  // In-memory events and requests
  let eventLog: SimulationEvent[] = [];
  const requests = new Map<string, InternalRequest>();
  const latencies: number[] = [];

  const counters: SimulationCounters = {
    created: 0,
    inFlight: 0,
    succeeded: 0,
    failed: 0,
    rejected: 0,
    timedOut: 0,
    retried: 0,
    orphanedWork: 0,
    packetLoss: 0,
    lateResponsesDiscarded: 0,
    amplificationFactor: 1.0,
  };

  // Phase 7: Active Chaos & Failure Overrides
  let activeFailures: ActiveFailure[] = [];
  let cacheFlushTimeMs: number | null = null;
  let cacheWarmupMs: number = 10000;

  const nodeOverrides = new Map<
    string,
    {
      capacityFactor?: number;
      latencyMultiplier?: number;
      health?: 'healthy' | 'degraded' | 'down';
      connectionPoolSize?: number;
    }
  >();

  const edgeOverrides = new Map<
    string,
    {
      addedLatencyMs?: number;
      packetLossPct?: number;
    }
  >();

  // Phase 7: Load Balancer Health Check Tracking
  interface BackendHealthState {
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    isUp: boolean;
    healthCheckState: 'healthy' | 'probing' | 'unhealthy';
  }

  const lbBackendStates = new Map<string, BackendHealthState>();
  for (const appNode of topology.appServerNodes) {
    const isConfigDown = (appNode.config as { health?: string })?.health === 'down';
    lbBackendStates.set(appNode.id, {
      consecutiveFailures: isConfigDown ? 999 : 0,
      consecutiveSuccesses: 0,
      isUp: !isConfigDown,
      healthCheckState: isConfigDown ? 'unhealthy' : 'healthy',
    });
  }

  function emitEvent(
    type: SimulationEvent['type'],
    requestId: string,
    nodeId: string,
    targetNodeId?: string,
    details?: Record<string, unknown>
  ): SimulationEvent {
    const event: SimulationEvent = {
      id: `evt-${++eventSeq}`,
      timestamp: Math.round(simTimeMs * 100) / 100,
      type,
      requestId,
      nodeId,
      targetNodeId,
      failureType: details?.failureType as string | undefined,
      details,
    };

    if (eventLog.length >= MAX_EVENT_BUFFER) {
      eventLog.shift();
    }
    eventLog.push(event);

    return event;
  }

  function scheduleInternal(timeMs: number, data: InternalEventData): void {
    pq.push(timeMs, ++eventSeq, data);
  }

  function getClientConfig(): ClientConfig {
    return topology.clientNode.config as ClientConfig;
  }

  // Edge traversal calculation (latency + Gaussian jitter + packet loss)
  function computeEdgeHop(
    sourceId: string,
    targetId: string,
    rng: PRNG
  ): { latencyMs: number; dropped: boolean } {
    const edge =
      topology.edges.get(`edge-${sourceId}->${targetId}`) ||
      topology.edges.get(`${sourceId}->${targetId}`);

    const override =
      edgeOverrides.get(edge?.id ?? '') ||
      edgeOverrides.get(`${sourceId}->${targetId}`) ||
      edgeOverrides.get('client-edge');

    const defaultBase = sourceId.startsWith('client') ? 40 : 0.5;
    const defaultJitter = sourceId.startsWith('client') ? 10 : 0.2;

    const base =
      (edge?.latency?.baseLatencyMs ?? defaultBase) + (override?.addedLatencyMs ?? 0);
    const jitter = edge?.latency?.jitterMs ?? defaultJitter;
    const lossPct = override?.packetLossPct ?? edge?.latency?.packetLossPct ?? 0;

    // Check packet drop
    if (lossPct > 0 && rng.next() * 100 < lossPct) {
      return { latencyMs: 0, dropped: true };
    }

    const sample = sampleGaussian(base, jitter, rng);
    return { latencyMs: Math.max(0.1, Math.round(sample * 10) / 10), dropped: false };
  }

  function scheduleClientTimeout(reqId: string, arrivalTime: number): void {
    const clientCfg = getClientConfig();
    const timeoutMs = clientCfg.requestTimeoutMs ?? 5000;
    scheduleInternal(arrivalTime + timeoutMs, {
      type: 'CLIENT_TIMEOUT',
      requestId: reqId,
    });
  }

  // Populate initial traffic arrivals
  function initTraffic(): void {
    const traffic = generatePoissonTraffic(config.traffic, trafficRng);
    for (const arrivalTime of traffic.arrivalTimesMs) {
      const reqId = `req-${requestIdCounter++}`;
      scheduleInternal(arrivalTime, {
        type: 'REQUEST_ARRIVAL',
        requestId: reqId,
      });
      scheduleClientTimeout(reqId, arrivalTime);
    }
  }

  // Schedule LB periodic health check probes
  function initHealthChecks(): void {
    const lbNode = Array.from(topology.nodes.values()).find((n) => n.type === 'load-balancer');
    if (!lbNode) return;
    const interval = (lbNode.config as LoadBalancerConfig).healthCheckIntervalMs ?? 5000;
    scheduleInternal(interval, {
      type: 'LB_HEALTH_CHECK',
      requestId: '',
      nodeId: lbNode.id,
    });
  }

  // Schedule scenario script actions
  function initScenarioScript(): void {
    if (!config.scenarioScript) return;
    for (const cmd of config.scenarioScript) {
      scheduleInternal(cmd.t, {
        type: 'SCENARIO_ACTION',
        requestId: '',
        metadata: { cmd },
      });
    }
  }

  initTraffic();
  initHealthChecks();
  initScenarioScript();

  function calculateLatencySummary(): LatencySummary {
    if (latencies.length === 0) {
      return { averageMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const averageMs = Math.round((sum / sorted.length) * 10) / 10;
    const minMs = sorted[0]!;
    const maxMs = sorted[sorted.length - 1]!;
    const p50Ms = sorted[Math.floor(sorted.length * 0.5)]!;
    const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
    const p99Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]!;

    return { averageMs, p50Ms, p95Ms, p99Ms, minMs, maxMs };
  }

  function getSnapshot(): SimulationSnapshot {
    const runtimeNodes: Record<string, NodeRuntimeState> = {};

    for (const [id, node] of topology.nodes.entries()) {
      const model = getComponentModel(node.type);
      const cap = model.getEffectiveCapacityRps(node.config, node.state);
      const override = nodeOverrides.get(id);
      const effectiveCap = override?.capacityFactor !== undefined ? cap * override.capacityFactor : cap;

      const util = effectiveCap > 0 ? Math.min(1.0, node.busySlots / effectiveCap) : 1.0;
      const nodeHealth = override?.health ?? (node.config as { health?: string }).health;
      const backendState = lbBackendStates.get(id);

      runtimeNodes[id] = {
        ...node.state,
        queueDepth: node.queue.length,
        activeConnections: node.busySlots,
        utilization: Math.round(util * 100) / 100,
        healthCheckState: backendState?.healthCheckState,
        status:
          nodeHealth === 'down'
            ? 'failed'
            : node.queue.length > node.queueLimit * 0.8
            ? 'overloaded'
            : util > 0.85
            ? 'warning'
            : 'healthy',
      };
    }

    const amplificationFactor =
      counters.created > 0
        ? Math.round(((counters.created + (counters.retried ?? 0)) / counters.created) * 100) / 100
        : 1.0;
    counters.amplificationFactor = amplificationFactor;

    const currentSnapshot: SimulationSnapshot = {
      timeMs: Math.round(simTimeMs * 100) / 100,
      runtimeNodes,
      counters: { ...counters },
      latencySummary: calculateLatencySummary(),
      recentEvents: [...eventLog],
      eventCursor: eventSeq,
      isDone: pq.isEmpty && counters.inFlight === 0,
      mode: 'discrete',
      bottleneck: null,
      activeFailures: [...activeFailures],
      amplificationFactor,
    };

    currentSnapshot.bottleneck = detectBottleneck(currentSnapshot, snapshotHistory);
    snapshotHistory.push(currentSnapshot);
    if (snapshotHistory.length > 5) {
      snapshotHistory.shift();
    }

    return currentSnapshot;
  }

  // Attempt to retry a failed or timed-out request
  function tryRetryRequest(req: InternalRequest, reason: string): boolean {
    const clientCfg = getClientConfig();
    const policy: RetryPolicy = clientCfg.retryPolicy ?? RETRY_PRESETS.none;

    if (req.attempt >= policy.maxAttempts) {
      return false;
    }

    // Check condition match
    const matches = policy.retryOn.some((cond) => {
      if (cond === 'timeout') return req.status === 'timed-out' || req.statusCode === 504;
      if (cond === '5xx') return req.statusCode >= 500 && req.statusCode < 600;
      if (cond === 'rejected') return req.status === 'rejected' || req.statusCode === 503;
      if (cond === 'connection_failure') return req.statusCode === 502;
      return false;
    });

    if (!matches) return false;

    // Check optional retry budget
    if (policy.retryBudgetPct && policy.retryBudgetPct > 0) {
      const currentRetried = counters.retried ?? 0;
      const retryPct = (currentRetried / Math.max(1, counters.created)) * 100;
      if (retryPct >= policy.retryBudgetPct) {
        return false;
      }
    }

    // Compute backoff delay
    let delayMs = 0;
    if (policy.backoff === 'fixed') {
      delayMs = policy.baseDelayMs;
    } else if (policy.backoff === 'exponential') {
      delayMs = Math.min(
        policy.maxDelayMs,
        policy.baseDelayMs * Math.pow(2, req.attempt - 1)
      );
    } else if (policy.backoff === 'exponential_jitter') {
      const maxB = Math.min(
        policy.maxDelayMs,
        policy.baseDelayMs * Math.pow(2, req.attempt - 1)
      );
      delayMs = Math.round(topology.clientNode.rng.next() * maxB);
    }

    counters.retried = (counters.retried ?? 0) + 1;
    counters.amplificationFactor =
      Math.round(((counters.created + counters.retried) / counters.created) * 100) / 100;

    emitEvent('REQUEST_RETRIED', req.id, topology.clientNode.id, undefined, {
      attempt: req.attempt + 1,
      delayMs,
      reason,
    });

    // Schedule retry arrival
    const retryReqId = `${req.originalRequestId || req.id}-r${req.attempt}`;
    const retryReq: InternalRequest = {
      id: retryReqId,
      originalRequestId: req.originalRequestId || req.id,
      createdAtMs: simTimeMs + delayMs,
      attempt: req.attempt + 1,
      kind: req.kind,
      status: 'created',
      statusCode: 200,
      path: [topology.clientNode.id],
      currentHopIndex: 0,
    };
    requests.set(retryReqId, retryReq);

    scheduleInternal(simTimeMs + delayMs, {
      type: 'REQUEST_ARRIVAL',
      requestId: retryReqId,
      metadata: { isRetry: true },
    });
    scheduleClientTimeout(retryReqId, simTimeMs + delayMs);

    return true;
  }

  // Multi-level timeout handler with orphaned work modeling
  function handleTimeout(req: InternalRequest, now: number): boolean {
    if (req.status === 'timed-out' || req.status === 'succeeded' || req.isOrphaned) {
      return false;
    }
    const clientCfg = getClientConfig();
    const elapsed = now - req.createdAtMs;

    if (elapsed >= (clientCfg.requestTimeoutMs ?? 5000) - 0.001) {
      req.status = 'timed-out';
      req.statusCode = 504;
      counters.timedOut++;
      counters.inFlight = Math.max(0, counters.inFlight - 1);

      // Model orphaned work: downstream active work stays consumed in background
      if (req.activeNodeId) {
        req.isOrphaned = true;
        counters.orphanedWork = (counters.orphanedWork ?? 0) + 1;
        emitEvent('ORPHANED_WORK_DISCARDED', req.id, req.activeNodeId, undefined, {
          reason: 'CALLER_TIMED_OUT',
          elapsedMs: Math.round(elapsed),
        });
      }

      emitEvent('REQUEST_TIMED_OUT', req.id, req.path[req.path.length - 1] || 'client', undefined, {
        elapsedMs: Math.round(elapsed),
        timeoutLimitMs: clientCfg.requestTimeoutMs,
      });

      tryRetryRequest(req, 'timeout');
      return true;
    }
    return false;
  }

  function processEvent(item: ScheduledEventItem<InternalEventData>): void {
    simTimeMs = item.timeMs;
    const { type, requestId, nodeId, metadata } = item.data;

    // --- Phase 7: Scenario Script Execution ---
    if (type === 'SCENARIO_ACTION' && metadata?.cmd) {
      const cmd = metadata.cmd as ScenarioCommand;
      if (cmd.action === 'inject') {
        const failureId = cmd.id || `fail-${cmd.failureType}-${cmd.t}`;
        const active: ActiveFailure = {
          id: failureId,
          failureType: cmd.failureType,
          targetId: cmd.targetId,
          startTimeMs: simTimeMs,
          durationMs: cmd.durationMs,
          endTimeMs: cmd.durationMs ? simTimeMs + cmd.durationMs : undefined,
          params: cmd.params,
          description: `${cmd.failureType} on ${cmd.targetId}`,
        };
        activeFailures = activeFailures.filter((f) => f.id !== failureId);
        activeFailures.push(active);

        // Apply failure effects
        if (cmd.failureType === 'app-server-crash') {
          nodeOverrides.set(cmd.targetId, {
            ...nodeOverrides.get(cmd.targetId),
            health: 'down',
          });
        } else if (cmd.failureType === 'app-server-degraded') {
          const factor = Number(cmd.params?.factor ?? 0.2);
          nodeOverrides.set(cmd.targetId, {
            ...nodeOverrides.get(cmd.targetId),
            capacityFactor: factor,
          });
        } else if (cmd.failureType === 'app-server-slow') {
          const mult = Number(cmd.params?.multiplier ?? 5);
          nodeOverrides.set(cmd.targetId, {
            ...nodeOverrides.get(cmd.targetId),
            latencyMultiplier: mult,
          });
        } else if (cmd.failureType === 'db-slow') {
          const mult = Number(cmd.params?.multiplier ?? 5);
          nodeOverrides.set(cmd.targetId, {
            ...nodeOverrides.get(cmd.targetId),
            latencyMultiplier: mult,
          });
        } else if (cmd.failureType === 'db-overload') {
          const factor = Number(cmd.params?.factor ?? 0.2);
          nodeOverrides.set(cmd.targetId, {
            ...nodeOverrides.get(cmd.targetId),
            capacityFactor: factor,
          });
        } else if (cmd.failureType === 'db-pool-exhaustion') {
          const pool = Number(cmd.params?.poolSize ?? 2);
          nodeOverrides.set(cmd.targetId, {
            ...nodeOverrides.get(cmd.targetId),
            connectionPoolSize: pool,
          });
        } else if (cmd.failureType === 'cache-failure') {
          nodeOverrides.set(cmd.targetId, {
            ...nodeOverrides.get(cmd.targetId),
            health: 'down',
          });
        } else if (cmd.failureType === 'cache-flush') {
          cacheFlushTimeMs = simTimeMs;
          cacheWarmupMs = Number(cmd.params?.warmupPeriodMs ?? 10000);
        } else if (cmd.failureType === 'edge-latency-spike') {
          const added = Number(cmd.params?.addedLatencyMs ?? 80);
          edgeOverrides.set(cmd.targetId, {
            ...edgeOverrides.get(cmd.targetId),
            addedLatencyMs: added,
          });
        } else if (cmd.failureType === 'edge-packet-loss') {
          const loss = Number(cmd.params?.packetLossPct ?? 5);
          edgeOverrides.set(cmd.targetId, {
            ...edgeOverrides.get(cmd.targetId),
            packetLossPct: loss,
          });
        }

        emitEvent('FAILURE_INJECTED', failureId, cmd.targetId, undefined, {
          failureType: cmd.failureType,
          params: cmd.params,
        });

        // Schedule auto-removal if duration specified
        if (cmd.durationMs && cmd.durationMs > 0) {
          scheduleInternal(simTimeMs + cmd.durationMs, {
            type: 'SCENARIO_ACTION',
            requestId: '',
            metadata: {
              cmd: {
                ...cmd,
                action: 'remove',
                t: simTimeMs + cmd.durationMs,
              },
            },
          });
        }
      } else if (cmd.action === 'remove') {
        activeFailures = activeFailures.filter(
          (f) => !(f.failureType === cmd.failureType && f.targetId === cmd.targetId)
        );

        if (cmd.failureType === 'cache-flush') {
          cacheFlushTimeMs = null;
        } else if (cmd.failureType.startsWith('edge-')) {
          edgeOverrides.delete(cmd.targetId);
        } else {
          nodeOverrides.delete(cmd.targetId);
        }

        emitEvent('FAILURE_REMOVED', `rem-${cmd.failureType}`, cmd.targetId, undefined, {
          failureType: cmd.failureType,
        });
      }
      return;
    }

    // --- Phase 7: Load Balancer Periodic Health Check Probe ---
    if (type === 'LB_HEALTH_CHECK') {
      const lbNode = Array.from(topology.nodes.values()).find((n) => n.type === 'load-balancer');
      if (lbNode) {
        const lbCfg = lbNode.config as LoadBalancerConfig;
        const interval = lbCfg.healthCheckIntervalMs ?? 5000;
        const unhealthyThresh = lbCfg.unhealthyThreshold ?? 3;
        const healthyThresh = lbCfg.healthyThreshold ?? 2;

        for (const appNode of topology.appServerNodes) {
          const override = nodeOverrides.get(appNode.id);
          const isDown =
            override?.health === 'down' ||
            (appNode.config as { health?: string }).health === 'down';

          const state = lbBackendStates.get(appNode.id)!;
          if (isDown) {
            state.consecutiveFailures++;
            state.consecutiveSuccesses = 0;
            if (state.consecutiveFailures >= unhealthyThresh && state.isUp) {
              state.isUp = false;
              state.healthCheckState = 'unhealthy';
              emitEvent('HEALTH_CHECK_FAILED', 'health-check', lbNode.id, appNode.id, {
                consecutiveFailures: state.consecutiveFailures,
              });
            } else if (!state.isUp) {
              state.healthCheckState = 'unhealthy';
            } else {
              state.healthCheckState = 'probing';
            }
          } else {
            state.consecutiveSuccesses++;
            state.consecutiveFailures = 0;
            if (state.consecutiveSuccesses >= healthyThresh && !state.isUp) {
              state.isUp = true;
              state.healthCheckState = 'healthy';
              emitEvent('HEALTH_CHECK_RECOVERED', 'health-check', lbNode.id, appNode.id, {
                consecutiveSuccesses: state.consecutiveSuccesses,
              });
            } else if (state.isUp) {
              state.healthCheckState = 'healthy';
            }
          }
        }

        // Schedule next health check
        scheduleInternal(simTimeMs + interval, {
          type: 'LB_HEALTH_CHECK',
          requestId: '',
          nodeId: lbNode.id,
        });
      }
      return;
    }

    let req = requests.get(requestId);

    // 1. New Request Arrival
    if (type === 'REQUEST_ARRIVAL') {
      const isRetry = Boolean(metadata?.isRetry);
      if (!isRetry) {
        counters.created++;
      }
      counters.inFlight++;

      const clientCfg = getClientConfig();
      const kind: 'read' | 'write' =
        topology.clientNode.rng.next() < clientCfg.readRatio / 100 ? 'read' : 'write';

      if (!req) {
        req = {
          id: requestId,
          createdAtMs: simTimeMs,
          attempt: 1,
          kind,
          status: 'created',
          statusCode: 200,
          path: [topology.clientNode.id],
          currentHopIndex: 0,
        };
        requests.set(requestId, req);
      }

      emitEvent('REQUEST_CREATED', req.id, topology.clientNode.id, undefined, {
        kind: req.kind,
        attempt: req.attempt,
      });

      // Edge traversal to DNS or first forwarding tier
      if (topology.dnsNode) {
        const dnsCfg = topology.dnsNode.config as unknown as { lookupLatencyMs: number; variabilityCv?: number };
        const isHit = decideDnsHit(topology.dnsNode.config as never, topology.dnsNode.rng);
        const meanLatency = isHit ? 1 : dnsCfg.lookupLatencyMs;
        const cv = dnsCfg.variabilityCv ?? 0.5;
        const dnsLatency = Math.max(1, Math.round(sampleLognormal(meanLatency, cv, topology.dnsNode.rng)));

        emitEvent('DNS_LOOKUP', req.id, topology.dnsNode.id, undefined, {
          isHit,
          lookupLatencyMs: dnsLatency,
        });

        scheduleInternal(simTimeMs + dnsLatency, {
          type: 'DNS_RESOLVED',
          requestId: req.id,
        });
      } else {
        scheduleInternal(simTimeMs, {
          type: 'DNS_RESOLVED',
          requestId: req.id,
        });
      }
      return;
    }

    if (type === 'CLIENT_TIMEOUT') {
      if (!req) return;
      if (
        req.status === 'succeeded' ||
        req.status === 'failed' ||
        req.status === 'rejected' ||
        req.status === 'timed-out'
      ) {
        return;
      }
      handleTimeout(req, simTimeMs);
      return;
    }

    if (!req) return;
    if (handleTimeout(req, simTimeMs)) return;

    // 2. DNS Resolved -> Enter First Forwarding Node with Edge Network Latency & Packet Loss
    if (type === 'DNS_RESOLVED') {
      const firstTier = topology.forwardingChain[0];
      if (!firstTier || firstTier.length === 0) {
        req.status = 'failed';
        req.statusCode = 502;
        counters.failed++;
        counters.inFlight = Math.max(0, counters.inFlight - 1);
        emitEvent('REQUEST_FAILED', req.id, topology.clientNode.id, undefined, {
          reason: 'NO_DOWNSTREAM_DESTINATION',
        });
        tryRetryRequest(req, 'NO_DOWNSTREAM_DESTINATION');
        return;
      }

      const targetNodeId = firstTier[0]!;
      const edgeResult = computeEdgeHop(topology.clientNode.id, targetNodeId, topology.clientNode.rng);

      if (edgeResult.dropped) {
        counters.packetLoss = (counters.packetLoss ?? 0) + 1;
        emitEvent('PACKET_LOST', req.id, topology.clientNode.id, targetNodeId, {
          reason: 'WIRE_PACKET_LOSS',
        });
        // Packet dropped on wire! Caller will wait until timeout timer triggers.
        return;
      }

      req.status = 'in-transit';
      scheduleInternal(simTimeMs + edgeResult.latencyMs, {
        type: 'ENTER_NODE',
        requestId: req.id,
        nodeId: targetNodeId,
      });
      return;
    }

    // 3. Enter Node (Processing, Queuing, or Overflow)
    if (type === 'ENTER_NODE' && nodeId) {
      const node = topology.nodes.get(nodeId);
      if (!node) return;

      req.path.push(nodeId);
      emitEvent('REQUEST_RECEIVED', req.id, nodeId);

      const override = nodeOverrides.get(nodeId);
      const isCrashed =
        override?.health === 'down' ||
        (node.config as { health?: string }).health === 'down';

      if (isCrashed) {
        req.status = 'failed';
        req.statusCode = 503;
        counters.failed++;
        counters.inFlight = Math.max(0, counters.inFlight - 1);
        emitEvent('REQUEST_FAILED', req.id, nodeId, undefined, {
          reason: 'NODE_DOWN',
        });
        tryRetryRequest(req, 'NODE_DOWN');
        return;
      }

      // Check for Load Balancer routing
      if (node.type === 'load-balancer') {
        const lbCfg = node.config as LoadBalancerConfig;

        // Health check detection window: LB only routes to backends that health check considers active!
        const candidateBackends = topology.appServerNodes
          .filter((n) => lbBackendStates.get(n.id)?.isUp ?? true)
          .map((n) => n.id);

        const backendStates: Record<
          string,
          { id: string; health?: 'healthy' | 'degraded' | 'down'; activeConnections?: number }
        > = {};
        for (const appNode of topology.appServerNodes) {
          const lbState = lbBackendStates.get(appNode.id);
          const isUp = lbState ? lbState.isUp : true;
          backendStates[appNode.id] = {
            id: appNode.id,
            health: isUp ? 'healthy' : 'down',
            activeConnections: appNode.busySlots,
          };
        }

        const selectedBackend = selectBackend(
          lbCfg.algorithm,
          candidateBackends,
          backendStates,
          node.rng,
          node.lbCounter++,
          lbCfg.perBackendWeights
        );

        if (!selectedBackend) {
          req.status = 'failed';
          req.statusCode = 503;
          counters.failed++;
          counters.inFlight = Math.max(0, counters.inFlight - 1);
          emitEvent('REQUEST_FAILED', req.id, nodeId, undefined, {
            reason: 'NO_HEALTHY_BACKEND',
          });
          tryRetryRequest(req, 'NO_HEALTHY_BACKEND');
          return;
        }

        emitEvent('LOAD_BALANCED', req.id, nodeId, selectedBackend, {
          algorithm: lbCfg.algorithm,
        });

        // Forward to selected App Server with edge network hop
        const edgeHop = computeEdgeHop(nodeId, selectedBackend, node.rng);
        if (edgeHop.dropped) {
          counters.packetLoss = (counters.packetLoss ?? 0) + 1;
          emitEvent('PACKET_LOST', req.id, nodeId, selectedBackend, {
            reason: 'INTERNAL_PACKET_LOSS',
          });
          return;
        }

        scheduleInternal(simTimeMs + edgeHop.latencyMs, {
          type: 'ENTER_NODE',
          requestId: req.id,
          nodeId: selectedBackend,
        });
        return;
      }

      // Standard Node Processing / Queuing
      const concurrencyLimit = override?.connectionPoolSize ?? node.concurrencyLimit;
      if (node.busySlots < concurrencyLimit) {
        node.busySlots++;
        req.status = 'processing';
        req.activeNodeId = nodeId;
        emitEvent('REQUEST_PROCESSING_STARTED', req.id, nodeId);

        const model = getComponentModel(node.type);
        const meanServiceTime = model.getServiceTimeMs(node.config, undefined, node.rng);
        const cv = (node.config as { variabilityCv?: number }).variabilityCv ?? 0.5;
        const mult = override?.latencyMultiplier ?? 1.0;

        // Lognormal service time sampling
        const serviceTimeMs = Math.max(
          1,
          Math.round(sampleLognormal(meanServiceTime * mult, cv, node.rng))
        );

        scheduleInternal(simTimeMs + serviceTimeMs, {
          type: 'PROCESSING_COMPLETED',
          requestId: req.id,
          nodeId,
        });
      } else if (node.queue.length < node.queueLimit) {
        node.queue.push(req.id);
        req.status = 'queued';
        emitEvent('REQUEST_QUEUED', req.id, nodeId, undefined, {
          queueDepth: node.queue.length,
        });
      } else {
        // Queue Overflow
        req.status = 'rejected';
        req.statusCode = 503;
        counters.rejected++;
        counters.inFlight = Math.max(0, counters.inFlight - 1);

        emitEvent('REQUEST_REJECTED', req.id, nodeId, undefined, {
          reason: 'QUEUE_OVERFLOW',
          queueLimit: node.queueLimit,
        });
        tryRetryRequest(req, 'QUEUE_OVERFLOW');
      }
      return;
    }

    // 4. Processing Completed at Node
    if (type === 'PROCESSING_COMPLETED' && nodeId) {
      const node = topology.nodes.get(nodeId);
      if (!node) return;

      node.busySlots = Math.max(0, node.busySlots - 1);
      req.activeNodeId = undefined;

      // Start next queued request if any
      if (node.queue.length > 0) {
        const nextReqId = node.queue.shift()!;
        const nextReq = requests.get(nextReqId);
        if (nextReq && nextReq.status === 'queued') {
          node.busySlots++;
          nextReq.status = 'processing';
          nextReq.activeNodeId = nodeId;
          emitEvent('REQUEST_PROCESSING_STARTED', nextReq.id, nodeId);

          const model = getComponentModel(node.type);
          const meanServiceTime = model.getServiceTimeMs(node.config, undefined, node.rng);
          const cv = (node.config as { variabilityCv?: number }).variabilityCv ?? 0.5;
          const override = nodeOverrides.get(nodeId);
          const mult = override?.latencyMultiplier ?? 1.0;
          const serviceTimeMs = Math.max(
            1,
            Math.round(sampleLognormal(meanServiceTime * mult, cv, node.rng))
          );

          scheduleInternal(simTimeMs + serviceTimeMs, {
            type: 'PROCESSING_COMPLETED',
            requestId: nextReq.id,
            nodeId,
          });
        }
      }

      // If work was orphaned by caller timing out earlier, discard late completion!
      if (req.isOrphaned) {
        counters.lateResponsesDiscarded = (counters.lateResponsesDiscarded ?? 0) + 1;
        emitEvent('LATE_RESPONSE_DISCARDED', req.id, nodeId);
        return;
      }

      // App Server: determine Cache or Database flow
      if (node.type === 'app-server') {
        const cache = topology.cacheNode;
        const db = topology.databaseNode;

        // Read request checks Cache first if cache is present
        if (req.kind === 'read' && cache) {
          const cacheOverride = nodeOverrides.get(cache.id);
          const isCacheDown =
            cacheOverride?.health === 'down' ||
            (cache.config as { health?: string }).health === 'down';

          // Cold cache model: effective hit ratio ramps from 0 to configured over warmup period
          let effectiveHitRatio = (cache.config as CacheConfig).hitRatio ?? 85;
          if (cacheFlushTimeMs !== null) {
            const elapsed = simTimeMs - cacheFlushTimeMs;
            if (elapsed < cacheWarmupMs) {
              effectiveHitRatio = Math.round((elapsed / cacheWarmupMs) * effectiveHitRatio);
            }
          }

          const dynamicCacheCfg = {
            ...(cache.config as CacheConfig),
            hitRatio: effectiveHitRatio,
          };

          const isHit = decideHit(dynamicCacheCfg, cache.rng, isCacheDown);
          if (isHit) {
            emitEvent('CACHE_HIT', req.id, cache.id, undefined, {
              effectiveHitRatio,
            });
            scheduleInternal(simTimeMs + 1, {
              type: 'RESPONSE_HOP',
              requestId: req.id,
            });
            return;
          } else {
            emitEvent('CACHE_MISS', req.id, cache.id, undefined, {
              effectiveHitRatio,
            });
          }
        }

        // Write request or Cache Miss queries Database
        if (db) {
          emitEvent('DATABASE_QUERY', req.id, db.id, undefined, {
            isWrite: req.kind === 'write',
          });

          const dbOverride = nodeOverrides.get(db.id);
          const effectivePool = dbOverride?.connectionPoolSize ?? db.concurrencyLimit;

          const dbPoolAcq = acquireConnection(
            db.busySlots,
            effectivePool,
            db.queue.length,
            db.queueLimit
          );

          if (dbPoolAcq === 'acquired') {
            db.busySlots++;
            req.activeNodeId = db.id;
            emitEvent('REQUEST_PROCESSING_STARTED', req.id, db.id);

            const dbCfg = db.config as DatabaseConfig;
            const dbRaw = dbCfg as unknown as Record<string, unknown>;
            const rawRead = typeof dbRaw.readLatencyMs === 'number' ? dbRaw.readLatencyMs : undefined;
            const rawWrite = typeof dbRaw.writeLatencyMs === 'number' ? dbRaw.writeLatencyMs : undefined;
            const readMean = rawRead ?? dbCfg.readQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 30;
            const writeMean = rawWrite ?? dbCfg.writeQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 60;
            const meanLatency = req.kind === 'write' ? writeMean : readMean;
            const cv = dbCfg.variabilityCv ?? 0.5;
            const mult = dbOverride?.latencyMultiplier ?? 1.0;

            const dbLatency = Math.max(
              1,
              Math.round(sampleLognormal(meanLatency * mult, cv, db.rng))
            );

            // Check App Server to Database timeout
            const appCfg = node.config as AppServerConfig;
            const dbTimeoutMs = appCfg.databaseTimeoutMs ?? 3000;

            if (dbLatency > dbTimeoutMs) {
              // Upstream timeout! Downstream query runs as orphaned work.
              req.isOrphaned = true;
              counters.orphanedWork = (counters.orphanedWork ?? 0) + 1;
              req.statusCode = 504;

              emitEvent('ORPHANED_WORK_DISCARDED', req.id, db.id, undefined, {
                reason: 'DATABASE_TIMEOUT',
                latencyMs: dbLatency,
                timeoutLimitMs: dbTimeoutMs,
              });

              // Schedule downstream completion to free connection pool slot
              scheduleInternal(simTimeMs + dbLatency, {
                type: 'DB_QUERY_COMPLETED',
                requestId: req.id,
              });

              // Return 504 to caller
              scheduleInternal(simTimeMs + dbTimeoutMs, {
                type: 'RESPONSE_HOP',
                requestId: req.id,
              });
              return;
            }

            scheduleInternal(simTimeMs + dbLatency, {
              type: 'DB_QUERY_COMPLETED',
              requestId: req.id,
            });
          } else if (dbPoolAcq === 'queued') {
            db.queue.push(req.id);
            emitEvent('REQUEST_QUEUED', req.id, db.id, undefined, {
              queueDepth: db.queue.length,
            });
          } else {
            // DB Pool Exhausted -> Reject with 503
            req.status = 'rejected';
            req.statusCode = 503;
            counters.rejected++;
            counters.inFlight = Math.max(0, counters.inFlight - 1);
            emitEvent('REQUEST_REJECTED', req.id, db.id, undefined, {
              reason: 'DATABASE_POOL_EXHAUSTED',
            });
            tryRetryRequest(req, 'DATABASE_POOL_EXHAUSTED');
          }
          return;
        }

        // If no DB in graph, return directly
        scheduleInternal(simTimeMs + 1, {
          type: 'RESPONSE_HOP',
          requestId: req.id,
        });
        return;
      }

      // Check next forwarding tier
      const currentTierIndex = topology.forwardingChain.findIndex((tier) =>
        tier.includes(nodeId)
      );
      if (currentTierIndex >= 0 && currentTierIndex < topology.forwardingChain.length - 1) {
        const nextTier = topology.forwardingChain[currentTierIndex + 1];
        if (nextTier && nextTier.length > 0) {
          const nextNodeId = nextTier[0]!;
          const edgeHop = computeEdgeHop(nodeId, nextNodeId, node.rng);

          if (edgeHop.dropped) {
            counters.packetLoss = (counters.packetLoss ?? 0) + 1;
            emitEvent('PACKET_LOST', req.id, nodeId, nextNodeId);
            return;
          }

          scheduleInternal(simTimeMs + edgeHop.latencyMs, {
            type: 'ENTER_NODE',
            requestId: req.id,
            nodeId: nextNodeId,
          });
          return;
        }
      }

      // Reached end of forward chain -> Start return response
      scheduleInternal(simTimeMs + 1, {
        type: 'RESPONSE_HOP',
        requestId: req.id,
      });
      return;
    }

    // 5. Database Query Completed
    if (type === 'DB_QUERY_COMPLETED') {
      const db = topology.databaseNode;
      if (db) {
        db.busySlots = Math.max(0, db.busySlots - 1);
        req.activeNodeId = undefined;

        // Next queued query in DB
        if (db.queue.length > 0) {
          const nextReqId = db.queue.shift()!;
          const nextReq = requests.get(nextReqId);
          if (nextReq) {
            db.busySlots++;
            nextReq.activeNodeId = db.id;
            emitEvent('REQUEST_PROCESSING_STARTED', nextReq.id, db.id);

            const dbCfg = db.config as DatabaseConfig;
            const meanLatency =
              nextReq.kind === 'write' ? dbCfg.writeQueryLatencyMs : dbCfg.readQueryLatencyMs;
            const cv = dbCfg.variabilityCv ?? 0.5;
            const dbOverride = nodeOverrides.get(db.id);
            const mult = dbOverride?.latencyMultiplier ?? 1.0;
            const dbLatency = Math.max(
              1,
              Math.round(sampleLognormal(meanLatency * mult, cv, db.rng))
            );

            scheduleInternal(simTimeMs + dbLatency, {
              type: 'DB_QUERY_COMPLETED',
              requestId: nextReq.id,
            });
          }
        }
      }

      if (req.isOrphaned) {
        counters.lateResponsesDiscarded = (counters.lateResponsesDiscarded ?? 0) + 1;
        emitEvent('LATE_RESPONSE_DISCARDED', req.id, db?.id ?? 'database');
        return;
      }

      // Response travels back from Database to App Server
      scheduleInternal(simTimeMs + 1, {
        type: 'RESPONSE_HOP',
        requestId: req.id,
      });
      return;
    }

    // 6. Response Return Hop along reverse path
    if (type === 'RESPONSE_HOP') {
      if (req.isOrphaned) {
        counters.lateResponsesDiscarded = (counters.lateResponsesDiscarded ?? 0) + 1;
        emitEvent('LATE_RESPONSE_DISCARDED', req.id, 'orphaned');
        return;
      }

      if (req.path.length > 1) {
        const currentNode = req.path.pop()!;
        const previousNode = req.path[req.path.length - 1]!;

        emitEvent('RESPONSE_FORWARDED', req.id, currentNode, previousNode);

        const edgeHop = computeEdgeHop(currentNode, previousNode, topology.clientNode.rng);
        if (edgeHop.dropped) {
          counters.packetLoss = (counters.packetLoss ?? 0) + 1;
          emitEvent('PACKET_LOST', req.id, currentNode, previousNode);
          return;
        }

        scheduleInternal(simTimeMs + edgeHop.latencyMs, {
          type: 'RESPONSE_HOP',
          requestId: req.id,
        });
      } else {
        // Response reached Client!
        const totalLatencyMs = Math.round((simTimeMs - req.createdAtMs) * 10) / 10;
        latencies.push(totalLatencyMs);

        if (req.statusCode >= 500) {
          req.status = 'failed';
          counters.failed++;
          counters.inFlight = Math.max(0, counters.inFlight - 1);
          emitEvent('REQUEST_FAILED', req.id, topology.clientNode.id, undefined, {
            statusCode: req.statusCode,
            totalLatencyMs,
          });
          tryRetryRequest(req, `HTTP_${req.statusCode}`);
        } else {
          req.status = 'succeeded';
          req.statusCode = 200;
          counters.succeeded++;
          counters.inFlight = Math.max(0, counters.inFlight - 1);

          emitEvent('RESPONSE_RECEIVED', req.id, topology.clientNode.id, undefined, {
            statusCode: 200,
            totalLatencyMs,
          });
        }
      }
      return;
    }
  }

  function advanceTo(targetTimeMs: number): SimulationSnapshot {
    while (!pq.isEmpty) {
      const nextItem = pq.peek();
      if (!nextItem || nextItem.timeMs > targetTimeMs) {
        break;
      }
      const item = pq.pop()!;
      processEvent(item);
    }

    simTimeMs = Math.max(simTimeMs, targetTimeMs);
    return getSnapshot();
  }

  function stepNextEvent(): SimulationSnapshot {
    if (!pq.isEmpty) {
      const item = pq.pop()!;
      processEvent(item);
    }
    return getSnapshot();
  }

  function reset(): void {
    simTimeMs = 0;
    eventSeq = 0;
    requestIdCounter = 1;
    pq.clear();
    eventLog = [];
    requests.clear();
    latencies.length = 0;

    counters.created = 0;
    counters.inFlight = 0;
    counters.succeeded = 0;
    counters.failed = 0;
    counters.rejected = 0;
    counters.timedOut = 0;
    counters.retried = 0;
    counters.orphanedWork = 0;
    counters.packetLoss = 0;
    counters.lateResponsesDiscarded = 0;
    counters.amplificationFactor = 1.0;

    snapshotHistory.length = 0;
    activeFailures = [];
    nodeOverrides.clear();
    edgeOverrides.clear();
    cacheFlushTimeMs = null;

    masterRng = createPRNG(config.seed);
    trafficRng = createPRNG(masterRng.nextInt(1, 0x7fffffff));
    topology = buildTopology(config.graph, config.seed);

    lbBackendStates.clear();
    for (const appNode of topology.appServerNodes) {
      const isConfigDown = (appNode.config as { health?: string })?.health === 'down';
      lbBackendStates.set(appNode.id, {
        consecutiveFailures: isConfigDown ? 999 : 0,
        consecutiveSuccesses: 0,
        isUp: !isConfigDown,
        healthCheckState: isConfigDown ? 'unhealthy' : 'healthy',
      });
    }

    initTraffic();
    initHealthChecks();
    initScenarioScript();
  }

  function seek(targetTimeMs: number): SimulationSnapshot {
    reset();
    return advanceTo(targetTimeMs);
  }

  function getAllEvents(): SimulationEvent[] {
    return [...eventLog];
  }

  function injectFailure(failure: {
    failureType: FailureType;
    targetId: string;
    durationMs?: number;
    params?: Record<string, number>;
  }): string {
    const failureId = `fail-${failure.failureType}-${Math.round(simTimeMs)}`;
    const cmd: ScenarioCommand = {
      t: simTimeMs,
      action: 'inject',
      id: failureId,
      failureType: failure.failureType,
      targetId: failure.targetId,
      durationMs: failure.durationMs,
      params: failure.params,
    };
    scheduleInternal(simTimeMs, {
      type: 'SCENARIO_ACTION',
      requestId: '',
      metadata: { cmd },
    });
    return failureId;
  }

  function removeFailure(failureId: string): void {
    const target = activeFailures.find((f) => f.id === failureId);
    if (!target) return;
    const cmd: ScenarioCommand = {
      t: simTimeMs,
      action: 'remove',
      id: failureId,
      failureType: target.failureType,
      targetId: target.targetId,
    };
    scheduleInternal(simTimeMs, {
      type: 'SCENARIO_ACTION',
      requestId: '',
      metadata: { cmd },
    });
  }

  return {
    advanceTo,
    stepNextEvent,
    reset,
    getSnapshot,
    seek,
    getAllEvents,
    injectFailure,
    removeFailure,
  };
}

export function createSimulation(config: SimulationConfig): Simulation {
  const mode = config.traffic.mode ?? 'auto';
  const peakRps = config.traffic.peakRps ?? config.traffic.rps ?? 100;

  if (mode === 'aggregate' || (mode === 'auto' && peakRps > 1000)) {
    return createAggregateSimulation(config);
  }

  return createDiscreteSimulation(config);
}
