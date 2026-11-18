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
import {
  calculateZipfWeights,
  acquireConnection,
} from './components/databaseModel';
import {
  MessageQueueConfig,
  WorkerConfig,
  DatabaseReplicaConfig,
} from '../types/components';
import { decideDnsHit } from './components/dnsModel';
import { getComponentModel } from './components/registry';
import { evaluateFirewall } from './components/firewallModel';
import { evaluateWaf } from './components/wafModel';
import { evaluateRateLimiter } from './components/rateLimiterModel';
import { evaluateCdn } from './components/cdnModel';
import {
  FirewallConfig,
  WafConfig,
  RateLimiterConfig,
  CdnConfig,
  CircuitBreakerPolicy,
  ConnectionLimitsConfig,
} from '../types/defenses';
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
import { TrafficClassAttributes, TrafficOrigin, CampaignPhase } from '../types/attacks';
import { getPhaseTrafficAttributes } from '../scenarios/attacks/campaign';

export const MAX_EVENT_BUFFER = 50000;

const defaultLegitimateClass: TrafficClassAttributes = {
  origin: 'legitimate',
  costMultiplier: 1.0,
  connectionHoldMs: 0,
  cacheable: true,
  sourceCount: 1,
  targetLayer: 'http',
  exposureRisk: 0,
};

import { getEffectiveRoutes, pickRouteFromRoll } from '../types/routes';
import { evaluateApiGateway } from './components/apiGatewayModel';
import { ApiGatewayConfig } from '../types/components';

interface InternalRequest {
  id: string;
  originalRequestId?: string;
  createdAtMs: number;
  attempt: number;
  kind: 'read' | 'write';
  trafficClass: TrafficClassAttributes;
  routeId?: string;
  costMultiplier?: number;
  cacheable?: boolean;
  isAsyncJob?: boolean;
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
  | 'CLIENT_TIMEOUT'
  | 'ATTACK_PHASE_STARTED'
  | 'ATTACK_PHASE_ENDED'
  | 'COMPROMISED_SERVER_TICK'
  | 'CIRCUIT_HALF_OPEN_TIMER'
  | 'SCALE_OUT_COMPLETE'
  | 'SERVER_QUARANTINE_TRIGGER'
  | 'SERVER_RESTORE_TRIGGER'
  | 'WORKER_JOB_COMPLETED'
  | 'WORKER_DB_WRITE_COMPLETED'
  | 'REPLICA_LAG_DRAIN_TICK';

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
  let attackerRng = createPRNG(masterRng.nextInt(1, 0x7fffffff));

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

    legitimate: {
      created: 0,
      inFlight: 0,
      succeeded: 0,
      failed: 0,
      rejected: 0,
      timedOut: 0,
      retried: 0,
    },
    malicious: {
      created: 0,
      inFlight: 0,
      reachedTarget: 0,
      rejected: 0,
      dropped: 0,
      timedOut: 0,
    },
    legitimateSuccessRate: 100,
    attackTrafficShare: 0,
    exposureEvents: 0,
    compromisedServersCount: 0,
    dataEgressMb: 0,
    blockedMalicious: 0,
    blockedLegitimate: 0,
    defenseInspected: {},
    defenseBlockedMalicious: {},
    defenseBlockedLegitimate: {},
    autoscalingCostDollars: 0,
    activeInstancesCount: 0,
    exposureLimitedCount: 0,
    exposureFullCount: 0,
  };

  interface NodeAttackStats {
    isCompromised?: boolean;
    attackTrafficShare?: number;
    maliciousInflow?: number;
    legitimateInflow?: number;
  }
  const nodeAttackStats = new Map<string, NodeAttackStats>();

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

  // Phase 9: Async Message Queue and Worker state
  interface AsyncJobItem {
    jobId: string;
    requestId: string;
    enqueuedAtMs: number;
    routeId?: string;
    retries: number;
  }
  const asyncQueueBuffer: AsyncJobItem[] = [];
  let totalAsyncJobsEnqueued = 0;
  let totalAsyncJobsProcessed = 0;
  let totalAsyncJobsDropped = 0;
  let totalAsyncJobsDeadLettered = 0;
  let totalJobCompletionMs = 0;
  let completedJobCount = 0;
  let jobsWritingToDb = 0;

  // Phase 9: Read Replicas & Failover
  const replicaLags = new Map<string, number>();
  let staleReadsCount = 0;
  let replicaLbCounter = 0;
  let failoverState: 'normal' | 'detecting' | 'promoting' | 'promoted' = 'normal';
  let failoverStartTimeMs: number | null = null;

  for (const rep of topology.replicaNodes) {
    replicaLags.set(rep.id, 5);
  }

  // Phase 9: Database Sharding
  const initialShardCount = (topology.databaseNode?.config as DatabaseConfig)?.shardCount ?? 1;
  let shardLoads: number[] = new Array(initialShardCount).fill(0);

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

    if (eventLog.length >= MAX_EVENT_BUFFER + 5000) {
      eventLog = eventLog.slice(5000);
    }
    eventLog.push(event);

    return event;
  }

  function scheduleInternal(timeMs: number, data: InternalEventData): void {
    pq.push(timeMs, ++eventSeq, data);
  }

  function dispatchAsyncWorkers(): void {
    if (asyncQueueBuffer.length === 0 || topology.workerNodes.length === 0) return;
    for (const workerNode of topology.workerNodes) {
      const wCfg = workerNode.config as WorkerConfig;
      while (asyncQueueBuffer.length > 0 && workerNode.busySlots < workerNode.concurrencyLimit) {
        const job = asyncQueueBuffer.shift()!;
        workerNode.busySlots++;
        const meanProc = wCfg.avgProcessingMs ?? 80;
        const procTime = Math.max(1, Math.round(sampleLognormal(meanProc, 0.5, workerNode.rng)));

        scheduleInternal(simTimeMs + procTime, {
          type: 'WORKER_JOB_COMPLETED',
          requestId: job.requestId,
          nodeId: workerNode.id,
          metadata: { job },
        });
      }
    }
  }

  function getClientConfig(): ClientConfig {
    return topology.clientNode.config as ClientConfig;
  }

  // --- Phase 8B: Defense Tracking & State Machines ---
  const activeAttackPhases = new Map<string, CampaignPhase>();
  const quarantinedServers = new Set<string>();

  interface CircuitBreakerInternalState {
    state: 'closed' | 'open' | 'half-open';
    windowRequests: Array<{ timeMs: number; success: boolean }>;
    openedAtMs: number;
    halfOpenProbeCount: number;
    halfOpenSuccessCount: number;
  }
  const circuitBreakerStates = new Map<string, CircuitBreakerInternalState>();

  interface AutoscalingInternalState {
    activeInstances: number;
    pendingInstances: number;
    highUtilStartTime: number | null;
    cooldownUntilMs: number;
  }
  const autoscalingStates = new Map<string, AutoscalingInternalState>();

  for (const node of topology.nodes.values()) {
    if (node.type === 'app-server') {
      const appCfg = node.config as AppServerConfig;
      const asCfg = appCfg.autoscaling;
      autoscalingStates.set(node.id, {
        activeInstances: asCfg?.enabled ? Math.max(1, asCfg.minInstances ?? 1) : 1,
        pendingInstances: 0,
        highUtilStartTime: null,
        cooldownUntilMs: 0,
      });
      circuitBreakerStates.set(node.id, {
        state: 'closed',
        windowRequests: [],
        openedAtMs: 0,
        halfOpenProbeCount: 0,
        halfOpenSuccessCount: 0,
      });
    } else if (node.type === 'load-balancer') {
      circuitBreakerStates.set(node.id, {
        state: 'closed',
        windowRequests: [],
        openedAtMs: 0,
        halfOpenProbeCount: 0,
        halfOpenSuccessCount: 0,
      });
    }
  }

  function trackDefenseInspected(key: string): void {
    counters.defenseInspected = counters.defenseInspected ?? {};
    counters.defenseInspected[key] = (counters.defenseInspected[key] ?? 0) + 1;
  }

  function trackDefenseBlockedMalicious(key: string): void {
    counters.defenseBlockedMalicious = counters.defenseBlockedMalicious ?? {};
    counters.defenseBlockedMalicious[key] = (counters.defenseBlockedMalicious[key] ?? 0) + 1;
  }

  function trackDefenseBlockedLegitimate(key: string): void {
    counters.defenseBlockedLegitimate = counters.defenseBlockedLegitimate ?? {};
    counters.defenseBlockedLegitimate[key] = (counters.defenseBlockedLegitimate[key] ?? 0) + 1;
  }

  function recordCircuitBreakerOutcome(nodeId: string, success: boolean): void {
    const cbState = circuitBreakerStates.get(nodeId);
    const node = topology.nodes.get(nodeId);
    const cbPolicy = (node?.config as { circuitBreaker?: CircuitBreakerPolicy })?.circuitBreaker;
    if (!cbState || !cbPolicy?.enabled) return;

    const windowMs = (cbPolicy.windowSec ?? 5) * 1000;
    cbState.windowRequests.push({ timeMs: simTimeMs, success });
    cbState.windowRequests = cbState.windowRequests.filter((r) => r.timeMs >= simTimeMs - windowMs);

    if (cbState.state === 'half-open') {
      cbState.halfOpenProbeCount++;
      if (success) {
        cbState.halfOpenSuccessCount++;
        if (cbState.halfOpenSuccessCount >= (cbPolicy.halfOpenProbes ?? 3)) {
          cbState.state = 'closed';
          emitEvent('CIRCUIT_CLOSED', 'circuit-breaker', nodeId);
        }
      } else {
        cbState.state = 'open';
        cbState.openedAtMs = simTimeMs;
        emitEvent('CIRCUIT_OPENED', 'circuit-breaker', nodeId, undefined, {
          reason: 'PROBE_FAILED',
        });
        scheduleInternal(simTimeMs + (cbPolicy.openDurationSec ?? 5) * 1000, {
          type: 'CIRCUIT_HALF_OPEN_TIMER',
          requestId: '',
          nodeId,
        });
      }
    } else if (cbState.state === 'closed') {
      if (cbState.windowRequests.length >= (cbPolicy.minRequestsInWindow ?? 10)) {
        const failCount = cbState.windowRequests.filter((r) => !r.success).length;
        const errorRate = failCount / cbState.windowRequests.length;
        if (errorRate >= (cbPolicy.errorRateThreshold ?? 0.5)) {
          cbState.state = 'open';
          cbState.openedAtMs = simTimeMs;
          emitEvent('CIRCUIT_OPENED', 'circuit-breaker', nodeId, undefined, {
            errorRate,
            threshold: cbPolicy.errorRateThreshold ?? 0.5,
          });
          scheduleInternal(simTimeMs + (cbPolicy.openDurationSec ?? 5) * 1000, {
            type: 'CIRCUIT_HALF_OPEN_TIMER',
            requestId: '',
            nodeId,
          });
        }
      }
    }
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

  // Populate initial traffic arrivals (legitimate + attack campaign)
  function initTraffic(): void {
    const traffic = generatePoissonTraffic(config.traffic, trafficRng);
    for (const arrivalTime of traffic.arrivalTimesMs) {
      const reqId = `req-${requestIdCounter++}`;
      scheduleInternal(arrivalTime, {
        type: 'REQUEST_ARRIVAL',
        requestId: reqId,
        metadata: { origin: 'legitimate' },
      });
      scheduleClientTimeout(reqId, arrivalTime);
    }

    // Schedule Campaign Attack Traffic if campaign is configured
    if (config.campaign?.phases) {
      for (const phase of config.campaign.phases) {
        scheduleInternal(phase.startMs, {
          type: 'ATTACK_PHASE_STARTED',
          requestId: phase.id,
          metadata: { phase },
        });
        scheduleInternal(phase.startMs + phase.durationMs, {
          type: 'ATTACK_PHASE_ENDED',
          requestId: phase.id,
          metadata: { phase },
        });

        if (phase.scenarioId === 'compromised-server') {
          const intervalMs = 1000;
          for (let t = phase.startMs; t < phase.startMs + phase.durationMs; t += intervalMs) {
            scheduleInternal(t, {
              type: 'COMPROMISED_SERVER_TICK',
              requestId: phase.id,
              metadata: { phase },
            });
          }
        } else {
          const attackTrafficConfig = {
            peakRps: phase.intensityRps,
            durationMs: phase.durationMs,
            pattern: 'constant' as const,
            patternParams: { type: 'constant' as const },
            mode: 'discrete' as const,
          };
          const attackTraffic = generatePoissonTraffic(attackTrafficConfig, attackerRng);
          for (const relTime of attackTraffic.arrivalTimesMs) {
            const arrivalTime = phase.startMs + relTime;
            if (arrivalTime <= phase.startMs + phase.durationMs) {
              const reqId = `req-atk-${phase.scenarioId}-${requestIdCounter++}`;
              scheduleInternal(arrivalTime, {
                type: 'REQUEST_ARRIVAL',
                requestId: reqId,
                metadata: {
                  origin: 'malicious',
                  phase,
                },
              });
              scheduleClientTimeout(reqId, arrivalTime);
            }
          }
        }
      }
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

      const attackStats = nodeAttackStats.get(id);
      const nodeTotal = (attackStats?.maliciousInflow ?? 0) + (attackStats?.legitimateInflow ?? 0);
      const nodeShare =
        nodeTotal > 0
          ? Math.round(((attackStats?.maliciousInflow ?? 0) / nodeTotal) * 1000) / 10
          : 0;

      const cbState = circuitBreakerStates.get(id);
      const asState = autoscalingStates.get(id);
      const isQuar = quarantinedServers.has(id);
      const wafCfg = node.type === 'waf' ? (node.config as WafConfig) : undefined;
      const wafActiveRulesetsCount = wafCfg
        ? (wafCfg.rulesets?.genericWebAttacks ? 1 : 0) +
          (wafCfg.rulesets?.botProtection ? 1 : 0) +
          (wafCfg.rulesets?.rateBasedRules ? 1 : 0)
        : undefined;

      const timeSec = Math.max(0.1, simTimeMs / 1000);
      const computedRps = Math.round(nodeTotal / timeSec);

      runtimeNodes[id] = {
        ...node.state,
        currentRps: computedRps,
        queueDepth: node.type === 'message-queue' ? asyncQueueBuffer.length : node.queue.length,
        activeConnections: node.busySlots,
        utilization: Math.round(util * 100) / 100,
        healthCheckState: backendState?.healthCheckState,
        attackTrafficShare: nodeShare,
        isCompromised: attackStats?.isCompromised ?? false,
        isQuarantined: isQuar,
        circuitBreakerState: cbState?.state,
        activeInstances: asState?.activeInstances,
        pendingInstances: asState?.pendingInstances,
        wafActiveRulesetsCount,
        status:
          isQuar
            ? 'failed'
            : nodeHealth === 'down'
            ? 'failed'
            : node.queue.length > node.queueLimit * 0.8
            ? 'overloaded'
            : util > 0.85
            ? 'warning'
            : 'healthy',
      };
    }

    let totalInstances = 0;
    let costSum = 0;
    for (const [id, asState] of autoscalingStates.entries()) {
      const node = topology.nodes.get(id);
      const asPolicy = (node?.config as AppServerConfig)?.autoscaling;
      if (asPolicy?.enabled) {
        const extra = Math.max(0, asState.activeInstances - 1);
        totalInstances += asState.activeInstances;
        const hourly = asPolicy.costPerInstanceHour ?? 0.08;
        costSum += extra * (hourly / 3600) * (simTimeMs / 1000);
      }
    }
    counters.activeInstancesCount = totalInstances;
    counters.autoscalingCostDollars = Math.round(costSum * 10000) / 10000;

    const totalLegitCompleted =
      (counters.legitimate?.succeeded ?? 0) +
      (counters.legitimate?.failed ?? 0) +
      (counters.legitimate?.rejected ?? 0) +
      (counters.legitimate?.timedOut ?? 0);
    const legitSuccessRate =
      totalLegitCompleted > 0
        ? Math.round(((counters.legitimate?.succeeded ?? 0) / totalLegitCompleted) * 1000) / 10
        : 100.0;
    counters.legitimateSuccessRate = legitSuccessRate;

    const totalCreated = counters.created;
    const attackShare =
      totalCreated > 0
        ? Math.round(((counters.malicious?.created ?? 0) / totalCreated) * 1000) / 10
        : 0.0;
    counters.attackTrafficShare = attackShare;

    const amplificationFactor =
      counters.created > 0
        ? Math.round(((counters.created + (counters.retried ?? 0)) / counters.created) * 100) / 100
        : 1.0;
    counters.amplificationFactor = amplificationFactor;

    // Phase 9: Async queue, replica, and shard telemetry
    counters.asyncJobsEnqueued = totalAsyncJobsEnqueued;
    counters.asyncJobsProcessed = totalAsyncJobsProcessed;
    counters.asyncJobsDropped = totalAsyncJobsDropped;
    counters.asyncJobsDeadLettered = totalAsyncJobsDeadLettered;
    counters.queueDepth = asyncQueueBuffer.length;
    const workerInFlight = topology.workerNodes.reduce((acc, w) => acc + w.busySlots, 0) + jobsWritingToDb;
    counters.asyncJobsInFlight = workerInFlight;
    let workerDrainRate = 1;
    if (topology.workerNodes.length > 0) {
      const wNode = topology.workerNodes[0]!;
      const wCfg = wNode.config as WorkerConfig;
      const totalWorkerSlots = (wCfg.instances ?? 2) * (wCfg.concurrency ?? 5) * topology.workerNodes.length;
      workerDrainRate = Math.max(1, totalWorkerSlots / ((wCfg.avgProcessingMs ?? 80) / 1000));
    }
    counters.consumerLagMs = Math.round(workerDrainRate > 0 ? (asyncQueueBuffer.length / workerDrainRate) * 1000 : 0);
    const oldestAge = asyncQueueBuffer.length > 0 ? simTimeMs - asyncQueueBuffer[0]!.enqueuedAtMs : 0;
    counters.oldestJobAgeMs = Math.round(oldestAge);
    counters.avgJobCompletionLatencyMs = completedJobCount > 0 ? Math.round(totalJobCompletionMs / completedJobCount) : 0;
    counters.staleReadsCount = staleReadsCount;
    const lags = Array.from(replicaLags.values());
    counters.replicationLagMs = lags.length > 0 ? Math.round(lags.reduce((a, b) => a + b, 0) / lags.length) : 5;
    counters.failoverState = failoverState;
    counters.shardLoads = [...shardLoads];
    const maxShard = Math.max(1, ...shardLoads);
    const totShard = shardLoads.reduce((a, b) => a + b, 0);
    counters.hotShardLoadPercent = totShard > 0 ? Math.round((maxShard / totShard) * 100) : 100;

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
    if (req.trafficClass?.origin !== 'legitimate') return false;
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
    if (counters.legitimate) {
      counters.legitimate.retried = (counters.legitimate.retried ?? 0) + 1;
    }
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
      trafficClass: defaultLegitimateClass,
      status: 'created',
      statusCode: 200,
      path: [topology.clientNode.id],
      currentHopIndex: 0,
    };
    requests.set(retryReqId, retryReq);

    scheduleInternal(simTimeMs + delayMs, {
      type: 'REQUEST_ARRIVAL',
      requestId: retryReqId,
      metadata: { isRetry: true, origin: 'legitimate' },
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
      if (req.trafficClass?.origin === 'malicious') {
        if (counters.malicious) {
          counters.malicious.timedOut++;
          counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
        }
      } else {
        if (counters.legitimate) {
          counters.legitimate.timedOut++;
          counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
        }
      }
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
        } else if (cmd.failureType === 'db-crash') {
          nodeOverrides.set(cmd.targetId, {
            ...nodeOverrides.get(cmd.targetId),
            health: 'down',
            capacityFactor: 0,
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

    // --- Phase 8A: Attack Campaign Phase & Threat Events ---
    if (type === 'ATTACK_PHASE_STARTED') {
      const phase = metadata?.phase as CampaignPhase | undefined;
      if (phase) {
        activeAttackPhases.set(phase.id, phase);
        emitEvent('ATTACK_PHASE_STARTED', phase.id, 'threat-source', undefined, {
          scenarioId: phase.scenarioId,
          intensityRps: phase.intensityRps,
          sourceCount: phase.sourceCount,
        });

        if (phase.scenarioId === 'compromised-server') {
          const targetId = phase.targetNodeId || topology.appServerNodes[0]?.id || 'app-server-1';
          const targetNode = topology.appServerNodes.find((n) => n.id === targetId);
          const appCfg = targetNode?.config as AppServerConfig | undefined;
          const drain = phase.params?.capacityDrainFactor ?? 0.5;
          nodeOverrides.set(targetId, {
            ...nodeOverrides.get(targetId),
            capacityFactor: drain,
          });
          const stats = nodeAttackStats.get(targetId) || {};
          stats.isCompromised = true;
          nodeAttackStats.set(targetId, stats);
          counters.compromisedServersCount = Math.max(1, (counters.compromisedServersCount ?? 0) + 1);
          emitEvent('SERVER_COMPROMISED', phase.id, targetId, undefined, {
            initial: true,
            drain,
          });

          // Phase 8B: Auto-quarantine trigger if hardening enabled
          if (appCfg?.hardening?.autoQuarantine) {
            const lag = appCfg.hardening.quarantineDetectionLagMs ?? 3000;
            scheduleInternal(simTimeMs + lag, {
              type: 'SERVER_QUARANTINE_TRIGGER',
              requestId: '',
              nodeId: targetId,
              metadata: {
                reimageDurationMs: appCfg.hardening.reimageDurationMs ?? 5000,
              },
            });
          }
        }
      }
      return;
    }

    if (type === 'ATTACK_PHASE_ENDED') {
      const phase = metadata?.phase as CampaignPhase | undefined;
      if (phase) {
        activeAttackPhases.delete(phase.id);
        emitEvent('ATTACK_PHASE_ENDED', phase.id, 'threat-source', undefined, {
          scenarioId: phase.scenarioId,
        });

        if (phase.scenarioId === 'compromised-server') {
          for (const [id, stats] of nodeAttackStats.entries()) {
            if (stats.isCompromised) {
              stats.isCompromised = false;
              nodeOverrides.delete(id);
            }
          }
        }
      }
      return;
    }

    if (type === 'COMPROMISED_SERVER_TICK') {
      const phase = metadata?.phase as CampaignPhase | undefined;
      if (phase) {
        const targetId = phase.targetNodeId || topology.appServerNodes[0]?.id || 'app-server-1';
        const serverNode = topology.appServerNodes.find((n) => n.id === targetId);
        const appCfg = serverNode?.config as AppServerConfig | undefined;

        let egress = phase.params?.egressRateMbPerSec ?? 5;
        if (appCfg?.hardening?.egressFiltering) {
          egress = egress * 0.10; // 90% egress reduction
        }
        counters.dataEgressMb = (counters.dataEgressMb ?? 0) + egress;
        emitEvent('DATA_EXFILTRATED', phase.id, targetId, undefined, {
          egressMb: egress,
        });

        let spreadRate = phase.params?.lateralSpreadRate ?? 0.15;
        if (appCfg?.hardening?.networkSegmentation) {
          spreadRate = spreadRate * 0.20; // 80% reduction in lateral spread
        }

        const uncompromised = topology.appServerNodes.filter(
          (n) => !nodeAttackStats.get(n.id)?.isCompromised && !quarantinedServers.has(n.id)
        );
        if (uncompromised.length > 0 && attackerRng.next() < spreadRate) {
          const nextVictim = uncompromised[0]!;
          const victimCfg = nextVictim.config as AppServerConfig | undefined;
          const drain = phase.params?.capacityDrainFactor ?? 0.5;
          nodeOverrides.set(nextVictim.id, {
            ...nodeOverrides.get(nextVictim.id),
            capacityFactor: drain,
          });
          const stats = nodeAttackStats.get(nextVictim.id) || {};
          stats.isCompromised = true;
          nodeAttackStats.set(nextVictim.id, stats);
          counters.compromisedServersCount = (counters.compromisedServersCount ?? 0) + 1;
          emitEvent('SERVER_COMPROMISED', phase.id, nextVictim.id, undefined, {
            lateralSpread: true,
            drain,
          });

          if (victimCfg?.hardening?.autoQuarantine) {
            const lag = victimCfg.hardening.quarantineDetectionLagMs ?? 3000;
            scheduleInternal(simTimeMs + lag, {
              type: 'SERVER_QUARANTINE_TRIGGER',
              requestId: '',
              nodeId: nextVictim.id,
              metadata: {
                reimageDurationMs: victimCfg.hardening.reimageDurationMs ?? 5000,
              },
            });
          }
        }
      }
      return;
    }

    // --- Phase 8B: Defense Internal Handlers ---
    if (type === 'CIRCUIT_HALF_OPEN_TIMER' && nodeId) {
      const cbState = circuitBreakerStates.get(nodeId);
      if (cbState && cbState.state === 'open') {
        cbState.state = 'half-open';
        cbState.halfOpenProbeCount = 0;
        cbState.halfOpenSuccessCount = 0;
        emitEvent('CIRCUIT_HALF_OPEN', 'cb-timer', nodeId);
      }
      return;
    }

    if (type === 'SCALE_OUT_COMPLETE' && nodeId) {
      const asState = autoscalingStates.get(nodeId);
      const node = topology.nodes.get(nodeId);
      const asPolicy = (node?.config as AppServerConfig)?.autoscaling;
      if (asState && asPolicy) {
        asState.activeInstances += asState.pendingInstances;
        asState.pendingInstances = 0;
        asState.cooldownUntilMs = simTimeMs + (asPolicy.cooldownSec ?? 10) * 1000;
        emitEvent('SCALE_OUT_COMPLETED', 'scale-out', nodeId, undefined, {
          activeInstances: asState.activeInstances,
        });
      }
      return;
    }

    if (type === 'SERVER_QUARANTINE_TRIGGER' && nodeId) {
      quarantinedServers.add(nodeId);
      nodeOverrides.set(nodeId, {
        ...nodeOverrides.get(nodeId),
        health: 'down',
        capacityFactor: 0,
      });
      const reimageMs = (metadata?.reimageDurationMs as number) ?? 5000;
      emitEvent('SERVER_QUARANTINED', 'quarantine', nodeId, undefined, {
        reimageDurationMs: reimageMs,
      });
      scheduleInternal(simTimeMs + reimageMs, {
        type: 'SERVER_RESTORE_TRIGGER',
        requestId: '',
        nodeId,
      });
      return;
    }

    if (type === 'SERVER_RESTORE_TRIGGER' && nodeId) {
      quarantinedServers.delete(nodeId);
      nodeOverrides.delete(nodeId);
      const stats = nodeAttackStats.get(nodeId);
      if (stats) stats.isCompromised = false;
      counters.compromisedServersCount = Math.max(0, (counters.compromisedServersCount ?? 1) - 1);
      emitEvent('SERVER_RESTORED', 'restore', nodeId);
      return;
    }

    let req = requests.get(requestId);

    // 1. New Request Arrival
    if (type === 'REQUEST_ARRIVAL') {
      const isRetry = Boolean(metadata?.isRetry);
      const origin: TrafficOrigin = (metadata?.origin as TrafficOrigin) ?? 'legitimate';
      const phase = metadata?.phase as CampaignPhase | undefined;

      const trafficClass: TrafficClassAttributes =
        origin === 'malicious' && phase
          ? getPhaseTrafficAttributes(phase)
          : defaultLegitimateClass;

      if (!isRetry) {
        counters.created++;
        if (origin === 'malicious') {
          if (counters.malicious) counters.malicious.created++;
        } else {
          if (counters.legitimate) counters.legitimate.created++;
        }
      }
      counters.inFlight++;
      if (origin === 'malicious') {
        if (counters.malicious) counters.malicious.inFlight++;
      } else {
        if (counters.legitimate) counters.legitimate.inFlight++;
      }

      const clientCfg = getClientConfig();
      const routes = getEffectiveRoutes(clientCfg);
      const roll = topology.clientNode.rng.next();
      const chosenRoute = pickRouteFromRoll(routes, roll);

      const kind: 'read' | 'write' =
        trafficClass.cacheable === false
          ? 'read'
          : chosenRoute.kind === 'read'
          ? 'read'
          : 'write';
      const cacheable = trafficClass.cacheable === false ? false : chosenRoute.cacheable;
      const costMultiplier = chosenRoute.costMultiplier;
      const routeId = chosenRoute.id;

      if (!req) {
        req = {
          id: requestId,
          createdAtMs: simTimeMs,
          attempt: 1,
          kind,
          trafficClass,
          routeId,
          costMultiplier,
          cacheable,
          status: 'created',
          statusCode: 200,
          path: [origin === 'malicious' ? 'threat-source' : topology.clientNode.id],
          currentHopIndex: 0,
        };
        requests.set(requestId, req);
      }

      emitEvent('REQUEST_CREATED', req.id, req.path[0]!, undefined, {
        kind: req.kind,
        attempt: req.attempt,
        origin: req.trafficClass.origin,
        attackKind: req.trafficClass.attackKind,
        sourceCount: req.trafficClass.sourceCount,
      });

      if (origin === 'malicious') {
        const firstTier = topology.forwardingChain[0];
        if (!firstTier || firstTier.length === 0) {
          req.status = 'failed';
          req.statusCode = 502;
          counters.failed++;
          if (counters.malicious) {
            counters.malicious.dropped++;
            counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
          }
          counters.inFlight = Math.max(0, counters.inFlight - 1);
          emitEvent('REQUEST_FAILED', req.id, 'threat-source', undefined, {
            reason: 'NO_DOWNSTREAM_DESTINATION',
          });
          return;
        }

        const targetNodeId = firstTier[0]!;
        req.status = 'in-transit';
        scheduleInternal(simTimeMs + 1, {
          type: 'ENTER_NODE',
          requestId: req.id,
          nodeId: targetNodeId,
        });
        return;
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

      // Check if server is quarantined
      if (quarantinedServers.has(nodeId)) {
        req.status = 'failed';
        req.statusCode = 503;
        counters.failed++;
        if (req.trafficClass.origin === 'malicious') {
          if (counters.malicious) {
            counters.malicious.dropped++;
            counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
          }
        } else {
          if (counters.legitimate) {
            counters.legitimate.failed++;
            counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
          }
        }
        counters.inFlight = Math.max(0, counters.inFlight - 1);
        emitEvent('REQUEST_FAILED', req.id, nodeId, undefined, {
          reason: 'SERVER_QUARANTINED',
        });
        tryRetryRequest(req, 'SERVER_QUARANTINED');
        return;
      }

      const override = nodeOverrides.get(nodeId);
      const isCrashed =
        override?.health === 'down' ||
        (node.config as { health?: string }).health === 'down';

      if (isCrashed) {
        req.status = 'failed';
        req.statusCode = 503;
        counters.failed++;
        recordCircuitBreakerOutcome(nodeId, false);
        for (const pNodeId of req.path) {
          if (pNodeId !== nodeId) {
            recordCircuitBreakerOutcome(pNodeId, false);
          }
        }
        if (req.trafficClass.origin === 'malicious') {
          if (counters.malicious) {
            counters.malicious.dropped++;
            counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
          }
        } else {
          if (counters.legitimate) {
            counters.legitimate.failed++;
            counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
          }
        }
        counters.inFlight = Math.max(0, counters.inFlight - 1);
        emitEvent('REQUEST_FAILED', req.id, nodeId, undefined, {
          reason: 'NODE_DOWN',
        });
        tryRetryRequest(req, 'NODE_DOWN');
        return;
      }

      // Track per-node attack/legitimate statistics
      const stats = nodeAttackStats.get(nodeId) ?? { maliciousInflow: 0, legitimateInflow: 0 };
      if (req.trafficClass.origin === 'malicious') {
        stats.maliciousInflow = (stats.maliciousInflow ?? 0) + 1;
      } else {
        stats.legitimateInflow = (stats.legitimateInflow ?? 0) + 1;
      }
      nodeAttackStats.set(nodeId, stats);

      // --- Phase 8B: Component-Level Defenses Evaluation ---
      if (node.type === 'cdn') {
        const cdnCfg = node.config as CdnConfig;
        if (cdnCfg.enabled !== false) {
          trackDefenseInspected('cdn');
          const activePhase = Array.from(activeAttackPhases.values())[0];
          const malRps = activePhase?.intensityRps ?? 0;
          const cdnEval = evaluateCdn(
            cdnCfg,
            req.trafficClass.origin,
            req.trafficClass.attackKind,
            req.trafficClass.cacheable ?? true,
            malRps
          );
          if (cdnEval.action === 'edge-hit') {
            emitEvent('CACHE_HIT', req.id, nodeId, undefined, { edgeCacheHit: true });
            req.status = 'succeeded';
            counters.succeeded++;
            counters.inFlight = Math.max(0, counters.inFlight - 1);
            if (req.trafficClass.origin === 'malicious') {
              if (counters.malicious) {
                counters.malicious.reachedTarget++;
                counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
              }
            } else {
              if (counters.legitimate) {
                counters.legitimate.succeeded++;
                counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
              }
            }
            latencies.push(Math.max(1, Math.round(cdnEval.addedLatencyMs)));
            scheduleInternal(simTimeMs + Math.max(1, Math.round(cdnEval.addedLatencyMs)), {
              type: 'RESPONSE_HOP',
              requestId: req.id,
            });
            return;
          } else if (cdnEval.action === 'block') {
            trackDefenseBlockedMalicious('cdn');
            emitEvent('REQUEST_BLOCKED', req.id, nodeId, undefined, {
              defense: 'cdn',
              reason: cdnEval.reason ?? 'EDGE_DDOS_SCRUBBED',
              class: req.trafficClass.origin,
            });
            req.status = 'rejected';
            counters.blockedMalicious = (counters.blockedMalicious ?? 0) + 1;
            counters.inFlight = Math.max(0, counters.inFlight - 1);
            if (counters.malicious) {
              counters.malicious.dropped++;
              counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
            }
            return;
          }
        }
      }

      if (node.type === 'firewall') {
        const fwCfg = node.config as FirewallConfig;
        if (fwCfg.enabled !== false) {
          trackDefenseInspected('firewall');
          if (req.trafficClass.origin === 'malicious') {
            const activePhase = Array.from(activeAttackPhases.values())[0];
            const elapsedPhaseMs = activePhase ? Math.max(0, simTimeMs - activePhase.startMs) : 0;
            const sourceCount = req.trafficClass.sourceCount ?? 1;
            const fwEval = evaluateFirewall(fwCfg, 'malicious', elapsedPhaseMs, sourceCount);
            if (fwEval.action === 'block' && node.rng.next() < fwEval.blockedFraction) {
              trackDefenseBlockedMalicious('firewall');
              emitEvent('REQUEST_BLOCKED', req.id, nodeId, undefined, {
                defense: 'firewall',
                reason: fwEval.reason ?? 'IP_BLOCKLISTED',
                class: 'malicious',
              });
              req.status = 'rejected';
              counters.blockedMalicious = (counters.blockedMalicious ?? 0) + 1;
              counters.inFlight = Math.max(0, counters.inFlight - 1);
              if (counters.malicious) {
                counters.malicious.dropped++;
                counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
              }
              return;
            }
          } else {
            const fwEval = evaluateFirewall(fwCfg, 'legitimate', 0, 1);
            if (fwEval.action === 'block' && node.rng.next() < fwEval.blockedFraction) {
              trackDefenseBlockedLegitimate('firewall');
              emitEvent('REQUEST_BLOCKED', req.id, nodeId, undefined, {
                defense: 'firewall',
                reason: 'FALSE_POSITIVE',
                class: 'legitimate',
              });
              req.status = 'rejected';
              counters.blockedLegitimate = (counters.blockedLegitimate ?? 0) + 1;
              counters.inFlight = Math.max(0, counters.inFlight - 1);
              if (counters.legitimate) {
                counters.legitimate.failed++;
                counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
              }
              return;
            }
          }
        }
      }

      if (node.type === 'waf') {
        const wafCfg = node.config as WafConfig;
        if (wafCfg.enabled !== false) {
          trackDefenseInspected('waf');
          const activePhase = Array.from(activeAttackPhases.values())[0];
          const currentRps = (activePhase?.intensityRps ?? 0) + (config.traffic.peakRps ?? 100);
          const wafEval = evaluateWaf(wafCfg, req.trafficClass.origin, req.trafficClass.attackKind, currentRps);
          if (wafEval.action === 'block' && node.rng.next() < wafEval.blockedFraction) {
            if (req.trafficClass.origin === 'malicious') {
              trackDefenseBlockedMalicious('waf');
            } else {
              trackDefenseBlockedLegitimate('waf');
            }
            emitEvent('REQUEST_BLOCKED', req.id, nodeId, undefined, {
              defense: 'waf',
              reason: wafEval.reason ?? 'WAF_RULE_VIOLATION',
              class: req.trafficClass.origin,
            });
            req.status = 'rejected';
            counters.inFlight = Math.max(0, counters.inFlight - 1);
            if (req.trafficClass.origin === 'malicious') {
              counters.blockedMalicious = (counters.blockedMalicious ?? 0) + 1;
              if (counters.malicious) {
                counters.malicious.dropped++;
                counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
              }
            } else {
              counters.blockedLegitimate = (counters.blockedLegitimate ?? 0) + 1;
              if (counters.legitimate) {
                counters.legitimate.failed++;
                counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
              }
            }
            return;
          }
        }
      }

      if (node.type === 'rate-limiter') {
        const rlCfg = node.config as RateLimiterConfig;
        if (rlCfg.enabled !== false) {
          trackDefenseInspected('rate-limiter');
          const activePhase = Array.from(activeAttackPhases.values())[0];
          const classRps = req.trafficClass.origin === 'malicious' ? (activePhase?.intensityRps ?? 100) : (config.traffic.peakRps ?? 100);
          const totalRps = (activePhase?.intensityRps ?? 0) + (config.traffic.peakRps ?? 100);
          const sourceCount = req.trafficClass.sourceCount ?? 1;
          const rlEval = evaluateRateLimiter(rlCfg, classRps, sourceCount, totalRps);
          if (rlEval.action === 'block' && node.rng.next() < rlEval.blockedFraction) {
            if (req.trafficClass.origin === 'malicious') {
              trackDefenseBlockedMalicious('rate-limiter');
            } else {
              trackDefenseBlockedLegitimate('rate-limiter');
            }
            emitEvent('REQUEST_BLOCKED', req.id, nodeId, undefined, {
              defense: 'rate-limiter',
              reason: rlEval.reason ?? 'RATE_LIMITED',
              class: req.trafficClass.origin,
            });
            req.status = 'rejected';
            counters.inFlight = Math.max(0, counters.inFlight - 1);
            if (req.trafficClass.origin === 'malicious') {
              counters.blockedMalicious = (counters.blockedMalicious ?? 0) + 1;
              if (counters.malicious) {
                counters.malicious.dropped++;
                counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
              }
            } else {
              counters.blockedLegitimate = (counters.blockedLegitimate ?? 0) + 1;
              if (counters.legitimate) {
                counters.legitimate.rejected++;
                counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
              }
            }
            return;
          }
        }
      }

      // --- Phase 8B: Circuit Breaker Inspection on Entry ---
      const cbState = circuitBreakerStates.get(nodeId);
      const cbPolicy = (node.config as { circuitBreaker?: CircuitBreakerPolicy }).circuitBreaker;
      if (cbPolicy?.enabled && cbState) {
        if (cbState.state === 'open') {
          if (simTimeMs >= cbState.openedAtMs + (cbPolicy.openDurationSec ?? 5) * 1000) {
            cbState.state = 'half-open';
            cbState.halfOpenProbeCount = 0;
            cbState.halfOpenSuccessCount = 0;
            emitEvent('CIRCUIT_HALF_OPEN', req.id, nodeId);
          } else {
            if (cbPolicy.fallback === 'serve-stale-from-cache' && topology.cacheNode && req.kind === 'read') {
              emitEvent('CACHE_HIT', req.id, topology.cacheNode.id, undefined, {
                circuitBreakerFallback: true,
              });
              req.status = 'succeeded';
              counters.succeeded++;
              counters.inFlight = Math.max(0, counters.inFlight - 1);
              if (req.trafficClass.origin === 'malicious') {
                if (counters.malicious) {
                  counters.malicious.reachedTarget++;
                  counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
                }
              } else {
                if (counters.legitimate) {
                  counters.legitimate.succeeded++;
                  counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
                }
              }
              latencies.push(10);
              scheduleInternal(simTimeMs + 10, {
                type: 'RESPONSE_HOP',
                requestId: req.id,
              });
              return;
            } else {
              req.status = 'rejected';
              req.statusCode = 503;
              counters.rejected++;
              counters.inFlight = Math.max(0, counters.inFlight - 1);
              if (req.trafficClass.origin === 'malicious') {
                if (counters.malicious) {
                  counters.malicious.rejected++;
                  counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
                }
              } else {
                if (counters.legitimate) {
                  counters.legitimate.rejected++;
                  counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
                }
              }
              emitEvent('REQUEST_REJECTED', req.id, nodeId, undefined, {
                reason: 'CIRCUIT_BREAKER_OPEN',
              });
              return;
            }
          }
        }
      }

      // Check for Load Balancer or API Gateway routing
      if (node.type === 'load-balancer' || node.type === 'api-gateway') {
        if (node.type === 'api-gateway') {
          const gwCfg = node.config as ApiGatewayConfig;
          const evalRes = evaluateApiGateway({
            config: gwCfg,
            routeId: req.routeId ?? 'default-read',
            kind: req.kind,
            cacheable: req.cacheable ?? (req.kind === 'read'),
            isMalicious: req.trafficClass.origin === 'malicious',
            attackKind: req.trafficClass.attackKind,
            sourceCount: req.trafficClass.sourceCount ?? 1,
            prngRoll: node.rng.next(),
          });

          if (evalRes.action === 'reject-429' || evalRes.action === 'reject-401') {
            const statusCode = evalRes.action === 'reject-429' ? 429 : 401;
            req.status = 'rejected';
            req.statusCode = statusCode;
            counters.rejected++;
            counters.inFlight = Math.max(0, counters.inFlight - 1);
            if (req.trafficClass.origin === 'malicious') {
              if (counters.malicious) {
                counters.malicious.rejected++;
                counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
              }
            } else {
              if (counters.legitimate) {
                counters.legitimate.rejected++;
                counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
              }
            }
            emitEvent('REQUEST_REJECTED', req.id, nodeId, undefined, {
              reason: evalRes.reason,
              statusCode,
            });
            return;
          }

          if (evalRes.action === 'response-cache-hit') {
            emitEvent('CACHE_HIT', req.id, nodeId, undefined, {
              source: 'api-gateway',
              reason: evalRes.reason,
            });
            req.status = 'succeeded';
            req.statusCode = 200;
            counters.succeeded++;
            counters.inFlight = Math.max(0, counters.inFlight - 1);
            if (req.trafficClass.origin === 'malicious') {
              if (counters.malicious) {
                counters.malicious.reachedTarget++;
                counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
              }
            } else {
              if (counters.legitimate) {
                counters.legitimate.succeeded++;
                counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
              }
            }
            const gatewayLatency = Math.max(1, evalRes.addedLatencyMs);
            latencies.push(gatewayLatency);
            scheduleInternal(simTimeMs + gatewayLatency, {
              type: 'RESPONSE_HOP',
              requestId: req.id,
            });
            return;
          }
        }

        const algorithm =
          node.type === 'api-gateway'
            ? (node.config as ApiGatewayConfig).backendAlgorithm ?? 'round-robin'
            : (node.config as LoadBalancerConfig).algorithm;

        // Health check detection window + exclusion of quarantined servers
        const candidateBackends = topology.appServerNodes
          .filter((n) => (lbBackendStates.get(n.id)?.isUp ?? true) && !quarantinedServers.has(n.id))
          .map((n) => n.id);

        const backendStates: Record<
          string,
          { id: string; health?: 'healthy' | 'degraded' | 'down'; activeConnections?: number }
        > = {};
        for (const appNode of topology.appServerNodes) {
          const lbState = lbBackendStates.get(appNode.id);
          const isUp = lbState ? lbState.isUp && !quarantinedServers.has(appNode.id) : true;
          backendStates[appNode.id] = {
            id: appNode.id,
            health: isUp ? 'healthy' : 'down',
            activeConnections: appNode.busySlots,
          };
        }

        const selectedBackend = selectBackend(
          algorithm,
          candidateBackends,
          backendStates,
          node.rng,
          node.lbCounter++,
          (node.config as LoadBalancerConfig).perBackendWeights
        );

        if (!selectedBackend) {
          req.status = 'failed';
          req.statusCode = 503;
          counters.failed++;
          recordCircuitBreakerOutcome(nodeId, false);
          if (req.trafficClass.origin === 'malicious') {
            if (counters.malicious) {
              counters.malicious.dropped++;
              counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
            }
          } else {
            if (counters.legitimate) {
              counters.legitimate.failed++;
              counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
            }
          }
          counters.inFlight = Math.max(0, counters.inFlight - 1);
          emitEvent('REQUEST_FAILED', req.id, nodeId, undefined, {
            reason: 'NO_HEALTHY_BACKEND',
          });
          tryRetryRequest(req, 'NO_HEALTHY_BACKEND');
          return;
        }

        recordCircuitBreakerOutcome(nodeId, true);

        emitEvent('LOAD_BALANCED', req.id, nodeId, selectedBackend, {
          algorithm,
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

      // --- Autoscaling Evaluation on App Server ---
      const asState = autoscalingStates.get(nodeId);
      const activeInstances = asState?.activeInstances ?? 1;
      const asPolicy = (node.config as AppServerConfig)?.autoscaling;
      const baseConcurrency = override?.connectionPoolSize ?? node.concurrencyLimit;
      const concurrencyLimit = baseConcurrency * activeInstances;

      if (node.type === 'app-server' && asPolicy?.enabled && asState) {
        const util = node.busySlots / Math.max(1, concurrencyLimit);
        if (util >= (asPolicy.scaleOutUtilizationPct ?? 75) / 100) {
          if (asState.highUtilStartTime === null) {
            asState.highUtilStartTime = simTimeMs;
          } else if (simTimeMs - asState.highUtilStartTime >= (asPolicy.scaleOutAfterSec ?? 3) * 1000) {
            if (
              asState.activeInstances + asState.pendingInstances < (asPolicy.maxInstances ?? 6) &&
              simTimeMs >= asState.cooldownUntilMs
            ) {
              asState.pendingInstances++;
              asState.highUtilStartTime = null;
              emitEvent('SCALE_OUT_REQUESTED', 'scale-out', nodeId, undefined, {
                targetInstances: asState.activeInstances + asState.pendingInstances,
              });
              scheduleInternal(simTimeMs + (asPolicy.provisioningDelaySec ?? 5) * 1000, {
                type: 'SCALE_OUT_COMPLETE',
                requestId: '',
                nodeId,
              });
            }
          }
        } else {
          asState.highUtilStartTime = null;
        }
      }

      // Connection Limits on App Server
      const isHttpEntryOrApp = (node.type as string) === 'app-server';
      const connLimits = (node.config as { connectionLimits?: ConnectionLimitsConfig })?.connectionLimits;
      let effectiveHoldMs = isHttpEntryOrApp ? (req.trafficClass?.connectionHoldMs ?? 0) : 0;
      if (connLimits?.enabled && connLimits.headerTimeoutMs > 0 && effectiveHoldMs > 0) {
        effectiveHoldMs = Math.min(effectiveHoldMs, connLimits.headerTimeoutMs);
      }

      // Standard Node Processing / Queuing
      if (node.busySlots < concurrencyLimit) {
        node.busySlots++;
        req.status = 'processing';
        req.activeNodeId = nodeId;
        emitEvent('REQUEST_PROCESSING_STARTED', req.id, nodeId);

        const model = getComponentModel(node.type);
        const meanServiceTime = model.getServiceTimeMs(node.config, undefined, node.rng);
        const cv = (node.config as { variabilityCv?: number }).variabilityCv ?? 0.5;
        const mult = override?.latencyMultiplier ?? 1.0;
        const costMult = req.trafficClass?.costMultiplier ?? 1.0;

        // Lognormal service time sampling + effective hold time
        const serviceTimeMs =
          Math.max(
            1,
            Math.round(sampleLognormal(meanServiceTime * mult * costMult, cv, node.rng))
          ) + effectiveHoldMs;

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
        recordCircuitBreakerOutcome(nodeId, false);
        if (req.trafficClass.origin === 'malicious') {
          if (counters.malicious) {
            counters.malicious.rejected++;
            counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
          }
        } else {
          if (counters.legitimate) {
            counters.legitimate.rejected++;
            counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
          }
        }
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
          const nextCostMult = nextReq.trafficClass?.costMultiplier ?? 1.0;
          const nextHold = nextReq.trafficClass?.connectionHoldMs ?? 0;
          const serviceTimeMs =
            Math.max(
              1,
              Math.round(sampleLognormal(meanServiceTime * mult * nextCostMult, cv, node.rng))
            ) + nextHold;

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
        const mq = topology.messageQueueNode;
        const appCfg = node.config as AppServerConfig;

        // 1. Write request with Message Queue + Workers: handle asynchronously!
        if (req.kind === 'write' && mq && topology.workerNodes.length > 0) {
          const asyncShare = appCfg.asyncWriteShare !== undefined ? appCfg.asyncWriteShare / 100 : 0.8;
          if (node.rng.next() < asyncShare) {
            const mqCfg = mq.config as MessageQueueConfig;
            const maxDepth = mqCfg.maxQueueDepth ?? ((mqCfg as unknown as Record<string, unknown>).queueLimit as number) ?? 50000;
            const overflowBehavior = mqCfg.overflowBehavior ?? ((mqCfg as unknown as Record<string, unknown>).overflowStrategy as 'reject' | 'drop-oldest') ?? 'reject';
            const isFull = asyncQueueBuffer.length >= maxDepth;

            if (isFull && overflowBehavior === 'reject') {
              req.status = 'rejected';
              req.statusCode = 503;
              counters.rejected++;
              if (req.trafficClass?.origin === 'malicious') {
                if (counters.malicious) {
                  counters.malicious.rejected++;
                  counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
                }
              } else {
                if (counters.legitimate) {
                  counters.legitimate.rejected++;
                  counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
                }
              }
              counters.inFlight = Math.max(0, counters.inFlight - 1);

              emitEvent('REQUEST_REJECTED', req.id, mq.id, undefined, {
                reason: 'QUEUE_OVERFLOW',
                queueLimit: maxDepth,
              });

              scheduleInternal(simTimeMs + (appCfg.enqueueLatencyMs ?? 4), {
                type: 'RESPONSE_HOP',
                requestId: req.id,
              });
              return;
            }

            if (isFull && overflowBehavior === 'drop-oldest') {
              const dropped = asyncQueueBuffer.shift();
              totalAsyncJobsDropped++;
              emitEvent('ASYNC_JOB_DROPPED', dropped?.jobId ?? 'job', mq.id, undefined, {
                reason: 'DROP_OLDEST',
              });
            }

            totalAsyncJobsEnqueued++;
            const jobId = `job-${req.id}`;
            asyncQueueBuffer.push({
              jobId,
              requestId: req.id,
              enqueuedAtMs: simTimeMs,
              routeId: req.routeId,
              retries: 0,
            });

            emitEvent('ASYNC_JOB_ENQUEUED', jobId, node.id, mq.id, {
              queueDepth: asyncQueueBuffer.length,
              isAsyncJob: true,
            });

            // Fast user-facing 202 Accepted response
            req.statusCode = 202;
            scheduleInternal(simTimeMs + (appCfg.enqueueLatencyMs ?? 4), {
              type: 'RESPONSE_HOP',
              requestId: req.id,
            });

            dispatchAsyncWorkers();
            return;
          }
        }

        // 2. Read request checks Cache first if cache is present
        if (req.kind === 'read' && cache) {
          if (req.trafficClass?.cacheable === false) {
            // Uncacheable / cache-busting traffic forces 100% cache miss directly to DB
            emitEvent('CACHE_MISS', req.id, cache.id, undefined, {
              reason: 'CACHE_BUSTING',
            });
          } else {
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
        }

        // 3. Read cache-miss routed to Read Replicas if present
        if (req.kind === 'read' && topology.replicaNodes.length > 0) {
          const dbCfg = db?.config as DatabaseConfig | undefined;
          const readFromReplicasShare = (dbCfg?.readFromReplicasShare ?? 90) / 100;
          if (node.rng.next() < readFromReplicasShare) {
            const healthyReplicas = topology.replicaNodes.filter((rep) => {
              const ov = nodeOverrides.get(rep.id);
              return !ov?.health && (rep.config as { health?: string }).health !== 'down';
            });

            if (healthyReplicas.length > 0) {
              const replica = healthyReplicas[replicaLbCounter % healthyReplicas.length]!;
              replicaLbCounter++;

              const lagMs = replicaLags.get(replica.id) ?? 5;
              const stalenessThresh = dbCfg?.stalenessThresholdMs ?? 1000;
              if (lagMs > stalenessThresh) {
                staleReadsCount++;
                emitEvent('STALE_READ_SERVED', req.id, replica.id, undefined, {
                  lagMs: Math.round(lagMs),
                  thresholdMs: stalenessThresh,
                });
              }

              const repCfg = replica.config as DatabaseReplicaConfig;
              const repMean = repCfg.queryLatencyMs ?? 25;
              const costMult = req.trafficClass?.costMultiplier ?? 1.0;
              const repLatency = Math.max(
                1,
                Math.round(sampleLognormal(repMean * costMult, 0.5, replica.rng))
              );

              const repStats = nodeAttackStats.get(replica.id) ?? { maliciousInflow: 0, legitimateInflow: 0 };
              if (req.trafficClass.origin === 'malicious') {
                repStats.maliciousInflow = (repStats.maliciousInflow ?? 0) + 1;
              } else {
                repStats.legitimateInflow = (repStats.legitimateInflow ?? 0) + 1;
              }
              nodeAttackStats.set(replica.id, repStats);

              emitEvent('DATABASE_QUERY', req.id, replica.id, undefined, {
                isReplica: true,
                isWrite: false,
              });

              scheduleInternal(simTimeMs + repLatency, {
                type: 'RESPONSE_HOP',
                requestId: req.id,
              });
              return;
            }
          }
        }

        // 4. Primary Database Failover Check
        const dbOverride = db ? nodeOverrides.get(db.id) : undefined;
        const isPrimaryDown =
          !db ||
          dbOverride?.health === 'down' ||
          (db.config as { health?: string }).health === 'down';

        if (isPrimaryDown) {
          const dbCfg = db?.config as DatabaseConfig | undefined;
          const failoverEnabled =
            dbCfg?.failover?.enabled ??
            ((dbCfg as unknown as Record<string, unknown>)?.autoFailoverEnabled as boolean) ??
            true;
          const detectionMs =
            dbCfg?.failover?.detectionMs ??
            ((dbCfg as unknown as Record<string, unknown>)?.failoverDetectionMs as number) ??
            3000;
          const promotionMs =
            dbCfg?.failover?.promotionMs ??
            ((dbCfg as unknown as Record<string, unknown>)?.failoverPromotionMs as number) ??
            2000;

          if (failoverEnabled && topology.replicaNodes.length > 0) {
            if (failoverStartTimeMs === null) {
              failoverStartTimeMs = simTimeMs;
              failoverState = 'detecting';
            }
            const elapsed = simTimeMs - failoverStartTimeMs;

            if (elapsed < detectionMs) {
              failoverState = 'detecting';
              req.status = 'failed';
              req.statusCode = 500;
              counters.failed++;
              emitEvent('REQUEST_FAILED', req.id, db?.id ?? 'database', undefined, {
                reason: 'PRIMARY_DOWN_FAILOVER_DETECTING',
              });
              scheduleInternal(simTimeMs + 5, { type: 'RESPONSE_HOP', requestId: req.id });
              return;
            } else if (elapsed < detectionMs + promotionMs) {
              failoverState = 'promoting';
              req.status = 'failed';
              req.statusCode = 500;
              counters.failed++;
              emitEvent('REQUEST_FAILED', req.id, db?.id ?? 'database', undefined, {
                reason: 'PRIMARY_DOWN_FAILOVER_PROMOTING',
              });
              scheduleInternal(simTimeMs + 5, { type: 'RESPONSE_HOP', requestId: req.id });
              return;
            } else {
              if (failoverState !== 'promoted') {
                failoverState = 'promoted';
                const promotedReplica = topology.replicaNodes.shift()!;
                emitEvent('FAILOVER_PROMOTED', 'failover-promoted', promotedReplica.id, undefined, {
                  promotedId: promotedReplica.id,
                });
              }
            }
          } else {
            req.status = 'failed';
            req.statusCode = 500;
            counters.failed++;
            emitEvent('REQUEST_FAILED', req.id, db?.id ?? 'database', undefined, {
              reason: 'PRIMARY_DOWN_NO_REPLICA',
            });
            scheduleInternal(simTimeMs + 5, { type: 'RESPONSE_HOP', requestId: req.id });
            return;
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
            const dbCostMult = req.trafficClass?.costMultiplier ?? 1.0;
            let meanLatency = (req.kind === 'write' ? writeMean : readMean) * dbCostMult;

            // Database Sharding
            const shardCount = dbCfg.shardCount ?? 1;
            if (shardCount > 1) {
              let shardIndex = 0;
              if (dbCfg.shardKeyDistribution === 'zipf-skewed') {
                const probs = calculateZipfWeights(shardCount, dbCfg.zipfSkew ?? 1.2);
                const roll = db.rng.next();
                let cum = 0;
                for (let i = 0; i < probs.length; i++) {
                  cum += probs[i]!;
                  if (roll < cum) {
                    shardIndex = i;
                    break;
                  }
                }
              } else {
                shardIndex = Math.floor(db.rng.next() * shardCount);
              }
              shardLoads[shardIndex] = (shardLoads[shardIndex] ?? 0) + 1;

              const baseShardCap = Math.max(1, Math.floor(dbCfg.maxQueryThroughputQps / shardCount));
              if (shardLoads[shardIndex]! > baseShardCap * 2) {
                emitEvent('HOT_SHARD_SATURATED', req.id, db.id, undefined, {
                  shardIndex,
                  shardLoad: shardLoads[shardIndex],
                  capacity: baseShardCap,
                });
              }

              if (db.rng.next() < (dbCfg.crossShardQueryShare ?? 10) / 100) {
                const penalty = dbCfg.crossShardPenaltyMultiplier ?? 1.5;
                meanLatency = meanLatency * penalty;
                const otherShard = (shardIndex + 1) % shardCount;
                shardLoads[otherShard] = (shardLoads[otherShard] ?? 0) + 1;
              }
            }

            const cv = dbCfg.variabilityCv ?? 0.5;
            const mult = dbOverride?.latencyMultiplier ?? 1.0;

            const dbLatency = Math.max(
              1,
              Math.round(sampleLognormal(meanLatency * mult, cv, db.rng))
            );

            // Abstract exposure event check for high-risk injection attempts reaching DB
            const isParameterized =
              (node.config as AppServerConfig).hardening?.parameterizedQueries ||
              dbCfg.hardening?.parameterizedQueries;
            let exposureRisk = req.trafficClass?.exposureRisk;
            if (isParameterized && typeof exposureRisk === 'number') {
              exposureRisk = Math.min(0.01, exposureRisk * 0.01);
            }

            if (req.trafficClass?.origin === 'malicious' && typeof exposureRisk === 'number' && exposureRisk > 0) {
              if (attackerRng.next() < exposureRisk) {
                counters.exposureEvents = (counters.exposureEvents ?? 0) + 1;
                const isLimited = dbCfg.hardening?.leastPrivilegeDb;
                if (isLimited) {
                  counters.exposureLimitedCount = (counters.exposureLimitedCount ?? 0) + 1;
                } else {
                  counters.exposureFullCount = (counters.exposureFullCount ?? 0) + 1;
                }
                emitEvent('EXPOSURE_EVENT', req.id, db.id, undefined, {
                  scenarioId: req.trafficClass?.attackKind,
                  exposureRisk,
                  severity: isLimited ? 'limited' : 'full',
                });
              }
            }

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
            if (req.trafficClass?.origin === 'malicious') {
              if (counters.malicious) {
                counters.malicious.rejected++;
                counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
              }
            } else {
              if (counters.legitimate) {
                counters.legitimate.rejected++;
                counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
              }
            }
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
            const nextCostMult = nextReq.trafficClass?.costMultiplier ?? 1.0;
            const meanLatency =
              (nextReq.kind === 'write' ? dbCfg.writeQueryLatencyMs : dbCfg.readQueryLatencyMs) * nextCostMult;
            const cv = dbCfg.variabilityCv ?? 0.5;
            const dbOverride = nodeOverrides.get(db.id);
            const mult = dbOverride?.latencyMultiplier ?? 1.0;
            const dbLatency = Math.max(
              1,
              Math.round(sampleLognormal(meanLatency * mult, cv, db.rng))
            );

            // Abstract exposure event check for high-risk injection attempts reaching DB
            const isParameterized = dbCfg.hardening?.parameterizedQueries;
            let nextExposureRisk = nextReq.trafficClass?.exposureRisk;
            if (isParameterized && typeof nextExposureRisk === 'number') {
              nextExposureRisk = Math.min(0.01, nextExposureRisk * 0.01);
            }
            if (nextReq.trafficClass?.origin === 'malicious' && typeof nextExposureRisk === 'number' && nextExposureRisk > 0) {
              if (attackerRng.next() < nextExposureRisk) {
                counters.exposureEvents = (counters.exposureEvents ?? 0) + 1;
                const isLimited = dbCfg.hardening?.leastPrivilegeDb;
                if (isLimited) {
                  counters.exposureLimitedCount = (counters.exposureLimitedCount ?? 0) + 1;
                } else {
                  counters.exposureFullCount = (counters.exposureFullCount ?? 0) + 1;
                }
                emitEvent('EXPOSURE_EVENT', nextReq.id, db.id, undefined, {
                  scenarioId: nextReq.trafficClass?.attackKind,
                  exposureRisk: nextExposureRisk,
                  severity: isLimited ? 'limited' : 'full',
                });
              }
            }

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

      // Add to replication lag on writes
      if (req.kind === 'write') {
        for (const rep of topology.replicaNodes) {
          const currentLag = replicaLags.get(rep.id) ?? 5;
          replicaLags.set(rep.id, currentLag + 10);
        }
      }

      // Response travels back from Database to App Server
      for (const pNodeId of req.path) {
        if (pNodeId.startsWith('app-server') || pNodeId.startsWith('load-balancer')) {
          recordCircuitBreakerOutcome(pNodeId, true);
        }
      }
      scheduleInternal(simTimeMs + 1, {
        type: 'RESPONSE_HOP',
        requestId: req.id,
      });
      return;
    }

    // 5b. Worker Background Job Completed
    if (type === 'WORKER_JOB_COMPLETED' && nodeId) {
      const workerNode = topology.nodes.get(nodeId);
      if (workerNode) {
        workerNode.busySlots = Math.max(0, workerNode.busySlots - 1);
      }
      const job = metadata?.job as AsyncJobItem | undefined;
      if (job) {
        const db = topology.databaseNode;
        const dbWriteLatency = 25;
        jobsWritingToDb++;
        scheduleInternal(simTimeMs + dbWriteLatency, {
          type: 'WORKER_DB_WRITE_COMPLETED',
          requestId: job.requestId,
          nodeId: db?.id ?? 'database',
          metadata: { job },
        });
      }
      dispatchAsyncWorkers();
      return;
    }

    if (type === 'WORKER_DB_WRITE_COMPLETED') {
      const job = metadata?.job as AsyncJobItem | undefined;
      if (job) {
        jobsWritingToDb = Math.max(0, jobsWritingToDb - 1);
        totalAsyncJobsProcessed++;
        const elapsed = simTimeMs - job.enqueuedAtMs;
        totalJobCompletionMs += elapsed;
        completedJobCount++;
        emitEvent('ASYNC_JOB_PROCESSED', job.jobId, nodeId || 'database', undefined, {
          jobCompletionLatencyMs: elapsed,
        });

        // Add to replication lag
        for (const rep of topology.replicaNodes) {
          const currentLag = replicaLags.get(rep.id) ?? 5;
          replicaLags.set(rep.id, currentLag + 10);
        }
      }
      return;
    }

    if (type === 'REPLICA_LAG_DRAIN_TICK') {
      for (const [repId, curLag] of replicaLags.entries()) {
        const drained = Math.max(5, curLag - 15);
        replicaLags.set(repId, drained);
      }
      scheduleInternal(simTimeMs + 200, {
        type: 'REPLICA_LAG_DRAIN_TICK',
        requestId: '',
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
        // Response reached Client or Threat Source!
        const totalLatencyMs = Math.round((simTimeMs - req.createdAtMs) * 10) / 10;
        latencies.push(totalLatencyMs);

        if (req.trafficClass?.origin === 'malicious') {
          counters.inFlight = Math.max(0, counters.inFlight - 1);
          if (counters.malicious) {
            counters.malicious.inFlight = Math.max(0, counters.malicious.inFlight - 1);
            counters.malicious.reachedTarget++;
          }
          if (req.statusCode >= 500) {
            req.status = 'failed';
            counters.failed++;
            emitEvent('REQUEST_FAILED', req.id, 'threat-source', undefined, {
              statusCode: req.statusCode,
              totalLatencyMs,
              origin: 'malicious',
            });
          } else {
            req.status = 'succeeded';
            counters.succeeded++;
            emitEvent('RESPONSE_RECEIVED', req.id, 'threat-source', undefined, {
              statusCode: req.statusCode,
              totalLatencyMs,
              origin: 'malicious',
            });
          }
          return;
        }

        if (req.statusCode >= 500) {
          req.status = 'failed';
          counters.failed++;
          if (counters.legitimate) {
            counters.legitimate.failed++;
            counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
          }
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
          if (counters.legitimate) {
            counters.legitimate.succeeded++;
            counters.legitimate.inFlight = Math.max(0, counters.legitimate.inFlight - 1);
          }
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
    counters.legitimateSuccessRate = 100;
    counters.attackTrafficShare = 0;
    counters.exposureEvents = 0;
    counters.compromisedServersCount = 0;
    counters.dataEgressMb = 0;
    counters.blockedMalicious = 0;
    counters.blockedLegitimate = 0;
    counters.defenseInspected = {};
    counters.defenseBlockedMalicious = {};
    counters.defenseBlockedLegitimate = {};
    counters.autoscalingCostDollars = 0;
    counters.activeInstancesCount = 0;
    counters.exposureLimitedCount = 0;
    counters.exposureFullCount = 0;

    counters.legitimate = {
      created: 0,
      inFlight: 0,
      succeeded: 0,
      failed: 0,
      rejected: 0,
      timedOut: 0,
      retried: 0,
    };
    counters.malicious = {
      created: 0,
      inFlight: 0,
      reachedTarget: 0,
      dropped: 0,
      rejected: 0,
      timedOut: 0,
    };

    nodeAttackStats.clear();
    activeAttackPhases.clear();
    quarantinedServers.clear();
    for (const [id, node] of topology.nodes.entries()) {
      if (node.type === 'app-server') {
        const appCfg = node.config as AppServerConfig;
        const asCfg = appCfg.autoscaling;
        autoscalingStates.set(id, {
          activeInstances: asCfg?.enabled ? Math.max(1, asCfg.minInstances ?? 1) : 1,
          pendingInstances: 0,
          highUtilStartTime: null,
          cooldownUntilMs: 0,
        });
        circuitBreakerStates.set(id, {
          state: 'closed',
          windowRequests: [],
          openedAtMs: 0,
          halfOpenProbeCount: 0,
          halfOpenSuccessCount: 0,
        });
      } else if (node.type === 'load-balancer') {
        circuitBreakerStates.set(id, {
          state: 'closed',
          windowRequests: [],
          openedAtMs: 0,
          halfOpenProbeCount: 0,
          halfOpenSuccessCount: 0,
        });
      }
    }
    snapshotHistory.length = 0;
    activeFailures = [];
    nodeOverrides.clear();
    edgeOverrides.clear();
    cacheFlushTimeMs = null;

    masterRng = createPRNG(config.seed);
    trafficRng = createPRNG(masterRng.nextInt(1, 0x7fffffff));
    attackerRng = createPRNG(masterRng.nextInt(1, 0x7fffffff));
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

    // Phase 9 reset
    asyncQueueBuffer.length = 0;
    jobsWritingToDb = 0;
    totalAsyncJobsEnqueued = 0;
    totalAsyncJobsProcessed = 0;
    totalAsyncJobsDropped = 0;
    totalAsyncJobsDeadLettered = 0;
    totalJobCompletionMs = 0;
    completedJobCount = 0;

    replicaLags.clear();
    staleReadsCount = 0;
    replicaLbCounter = 0;
    failoverState = 'normal';
    failoverStartTimeMs = null;

    for (const rep of topology.replicaNodes) {
      replicaLags.set(rep.id, 5);
    }
    if (topology.replicaNodes.length > 0) {
      scheduleInternal(200, {
        type: 'REPLICA_LAG_DRAIN_TICK',
        requestId: '',
      });
    }

    const resetShardCount = (topology.databaseNode?.config as DatabaseConfig)?.shardCount ?? 1;
    shardLoads = new Array(resetShardCount).fill(0);
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
