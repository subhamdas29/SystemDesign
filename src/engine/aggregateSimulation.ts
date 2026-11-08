/**
 * Aggregate (Fluid) Simulation Engine (Phase 7).
 * Fixed-tick (100ms) fluid-flow simulation supporting up to 1,000,000 RPS.
 * Features:
 *   - Lognormal quantile convolution matching discrete mode P95 & P99 tails
 *   - Fluid retry amplification with delay buffers
 *   - Orphaned work capacity modeling
 *   - Deterministic scenario script execution (failures, spikes, warm-ups)
 *   - Zero React, DOM, Date.now(), or Math.random() imports.
 */

import {
  SimulationConfig,
  SimulationSnapshot,
  SimulationCounters,
  LatencySummary,
} from './protocol';
import { SimulationEvent, NodeRuntimeState } from '../types/runtime';
import { Simulation } from './simulation';
import { rpsAt } from '../scenarios/traffic/patterns';
import { TrafficConfig as ScenarioTrafficConfig } from '../scenarios/traffic/types';
import { detectBottleneck } from './analysis/bottleneckDetector';
import {
  ClientConfig,
  CacheConfig,
  DatabaseConfig,
  AppServerConfig,
  LoadBalancerConfig,
  RouterConfig,
  RetryPolicy,
  RETRY_PRESETS,
  ApiGatewayConfig,
} from '../types';
import { getEffectiveRoutes } from '../types/routes';
import { getComponentModel } from './components/registry';
import { ActiveFailure, FailureType } from '../scenarios/failures/types';
import { createPRNG } from './rng';
import { getPhaseTrafficAttributes } from '../scenarios/attacks/campaign';
import { evaluateFirewall } from './components/firewallModel';
import { evaluateWaf } from './components/wafModel';
import { evaluateRateLimiter } from './components/rateLimiterModel';
import { evaluateCdn } from './components/cdnModel';
import {
  FirewallConfig,
  WafConfig,
  RateLimiterConfig,
  CdnConfig,
  ConnectionLimitsConfig,
} from '../types/defenses';
import {
  MessageQueueConfig,
  WorkerConfig,
  DatabaseReplicaConfig,
} from '../types/components';
import {
  calculateZipfWeights,
  calculateShardedMaxThroughput,
} from './components/databaseModel';

export const AGGREGATE_TICK_MS = 100; // 100 ms per fluid tick
const MAX_SAMPLED_EVENTS = 1000;
const SAMPLED_RPS = 20; // 20 sampled requests per second for visualization

// Granular latency histogram buckets for accurate quantile calculation
const LATENCY_BUCKETS = [
  1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90,
  100, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000,
  5000, 10000,
];

// Standard normal cumulative distribution function (error function approximation)
function standardNormalCdf(x: number): number {
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2.0);
  const prob =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1.0 - prob : prob;
}

interface AggregateNodeState {
  id: string;
  type: string;
  config: unknown;
  queue: number;
  queueLimit: number;
  active: number;
  concurrencyLimit: number;
  totalServed: number;
  totalRejected: number;
  lastTickUtilization: number;
  lastTickRps: number;
}

export function createAggregateSimulation(config: SimulationConfig): Simulation {
  let simTimeMs = 0;
  let eventSeq = 0;
  let sampledReqCounter = 1;

  const peakRps = config.traffic.peakRps ?? config.traffic.rps ?? 100;
  const durationMs = config.traffic.durationMs;
  const normalizedTraffic: ScenarioTrafficConfig = {
    peakRps,
    durationMs,
    pattern: config.traffic.pattern ?? 'constant',
    patternParams: config.traffic.patternParams ?? { type: 'constant' },
    mode: config.traffic.mode ?? 'aggregate',
  };

  // Extract topology nodes
  const nodes = new Map<string, AggregateNodeState>();
  const clientNode = config.graph.nodes.find((n) => n.type === 'client');
  const cacheNode = config.graph.nodes.find((n) => n.type === 'cache');
  const databaseNode = config.graph.nodes.find((n) => n.type === 'database');
  const lbNode = config.graph.nodes.find(
    (n) => n.type === 'load-balancer' || n.type === 'api-gateway'
  );
  const routerNode = config.graph.nodes.find((n) => n.type === 'router');
  const appServerNodes = config.graph.nodes.filter((n) => n.type === 'app-server');
  const cdnNode = config.graph.nodes.find((n) => n.type === 'cdn');
  const firewallNode = config.graph.nodes.find((n) => n.type === 'firewall');
  const wafNode = config.graph.nodes.find((n) => n.type === 'waf');
  const rateLimiterNode = config.graph.nodes.find((n) => n.type === 'rate-limiter');
  const mqNode = config.graph.nodes.find((n) => n.type === 'message-queue');
  const workerNodes = config.graph.nodes.filter((n) => n.type === 'worker');
  const replicaNodes = config.graph.nodes.filter((n) => n.type === 'database-replica');

  for (const n of config.graph.nodes) {
    let queueLimit = 100;
    let concurrencyLimit = 100;

    if (n.type === 'app-server') {
      const cfg = n.config as AppServerConfig;
      queueLimit = cfg.queueSize ?? 100;
      concurrencyLimit = cfg.maxConcurrentRequests ?? 100;
    } else if (n.type === 'database') {
      const cfg = n.config as DatabaseConfig;
      queueLimit = cfg.queueCapacity ?? 200;
      concurrencyLimit = cfg.connectionPoolSize ?? 50;
    } else if (n.type === 'load-balancer' || n.type === 'api-gateway') {
      const cfg = n.config as LoadBalancerConfig;
      queueLimit = cfg.queueLimit ?? 500;
      concurrencyLimit = 1000;
    } else if (n.type === 'router') {
      const cfg = n.config as RouterConfig;
      queueLimit = cfg.queueLimit ?? 500;
      concurrencyLimit = 1000;
    } else if (n.type === 'message-queue') {
      const cfg = n.config as MessageQueueConfig;
      queueLimit = cfg.maxQueueDepth ?? 50000;
      concurrencyLimit = cfg.capacityRps ?? 25000;
    } else if (n.type === 'worker') {
      const cfg = n.config as WorkerConfig;
      concurrencyLimit = (cfg.instances ?? 2) * (cfg.concurrency ?? 5);
      queueLimit = 1000;
    } else if (n.type === 'database-replica') {
      const cfg = n.config as DatabaseReplicaConfig;
      concurrencyLimit = Math.max(50, Math.floor(cfg.capacityQps / 10));
      queueLimit = 200;
    }

    nodes.set(n.id, {
      id: n.id,
      type: n.type,
      config: n.config,
      queue: 0,
      queueLimit,
      active: 0,
      concurrencyLimit,
      totalServed: 0,
      totalRejected: 0,
      lastTickUtilization: 0,
      lastTickRps: 0,
    });
  }

  // System Cumulative Counters
  let createdCount = 0;
  let succeededCount = 0;
  let rejectedCount = 0;
  let timedOutCount = 0;
  let retriedCount = 0;
  let orphanedWorkCount = 0;
  let packetLossCount = 0;
  let lateResponsesDiscardedCount = 0;

  // Phase 8A: Multi-class attack traffic counters
  let legitCreated = 0;
  let legitSucceeded = 0;
  let legitFailed = 0;
  let legitRejected = 0;
  let legitTimedOut = 0;
  let legitRetried = 0;

  let malCreated = 0;
  let malReachedTarget = 0;
  let malDropped = 0;
  let malRejected = 0;
  let malTimedOut = 0;

  let exposureEventsCount = 0;
  let compromisedServersCount = 0;
  let dataEgressMb = 0;

  // Phase 8B: Defense telemetry and state tracking
  let blockedMaliciousCount = 0;
  let blockedLegitimateCount = 0;
  let exposureLimitedCount = 0;
  let exposureFullCount = 0;
  let autoscalingCostDollars = 0;
  let activeAppInstances = 1;
  let highUtilTicks = 0;
  let cooldownTicks = 0;
  let isQuarantined = false;
  let quarantinedTicks = 0;
  let compromisedTargetNodeId: string | undefined;
  let defenseInspected: Record<string, number> = {};
  let defenseBlockedMalicious: Record<string, number> = {};
  let defenseBlockedLegitimate: Record<string, number> = {};

  // Phase 9: Queue, Replica, and Sharding tracking
  let totalAsyncJobsEnqueued = 0;
  let totalAsyncJobsProcessed = 0;
  let totalAsyncJobsDropped = 0;
  let replicaLagMs = 5;
  let totalStaleReads = 0;
  let currentStaleReadRate = 0;
  let totalWorkerDrainCap = 1;
  const avgJobCompletionMs = 80;
  const failoverState: 'normal' | 'detecting' | 'promoting' | 'promoted' = 'normal';
  const initialShardCount = (databaseNode?.config as DatabaseConfig)?.shardCount ?? 1;
  const shardLoads: number[] = new Array(initialShardCount).fill(0);

  const appServerCfg = appServerNodes[0]?.config as AppServerConfig | undefined;
  const asPolicy = appServerCfg?.autoscaling;
  if (asPolicy?.enabled) {
    activeAppInstances = Math.max(1, asPolicy.minInstances ?? 1);
  }

  const attackerRng = createPRNG((config.seed ?? 42) + 9999);
  const nodeAttackStats = new Map<string, { isCompromised?: boolean; maliciousInflow: number; legitimateInflow: number }>();
  for (const n of config.graph.nodes) {
    nodeAttackStats.set(n.id, { isCompromised: false, maliciousInflow: 0, legitimateInflow: 0 });
  }

  // Retry buffer: delay queue for retries re-entering fluid stream
  interface RetryBufferItem {
    returnTimeMs: number;
    volume: number;
  }
  const retryBuffer: RetryBufferItem[] = [];

  // Phase 7: Scenario Script & Active Chaos
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

  // Latency Histogram (weighted distribution over buckets)
  const latencyHistogram = new Map<number, number>();
  for (const b of LATENCY_BUCKETS) {
    latencyHistogram.set(b, 0);
  }

  // Record latency with lognormal tail convolution
  function recordLatency(meanLatencyMs: number, volume: number): void {
    if (volume <= 0) return;
    const cv = 0.5; // Moderate lognormal tail variability
    const sigmaL = Math.sqrt(Math.log(1.0 + cv * cv));
    const muL = Math.log(Math.max(1, meanLatencyMs)) - 0.5 * sigmaL * sigmaL;

    for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
      const bLow = i === 0 ? 0.1 : LATENCY_BUCKETS[i - 1]!;
      const bHigh = LATENCY_BUCKETS[i]!;

      const zLow = (Math.log(bLow) - muL) / sigmaL;
      const zHigh = (Math.log(bHigh) - muL) / sigmaL;

      const prob = Math.max(0, standardNormalCdf(zHigh) - standardNormalCdf(zLow));
      const bucketVolume = volume * prob;

      const current = latencyHistogram.get(bHigh) ?? 0;
      latencyHistogram.set(bHigh, current + bucketVolume);
    }
  }

  // Animation Sampled Events
  const eventLog: SimulationEvent[] = [];

  function emitSampledEvent(
    type: SimulationEvent['type'],
    nodeId: string,
    targetNodeId?: string,
    details?: Record<string, unknown>
  ): void {
    const event: SimulationEvent = {
      id: `evt-${++eventSeq}`,
      timestamp: Math.round(simTimeMs * 10) / 10,
      type,
      requestId: `sampled-${sampledReqCounter}`,
      nodeId,
      targetNodeId,
      details: { ...details, sampled: true },
    };

    if (eventLog.length >= MAX_SAMPLED_EVENTS) {
      eventLog.shift();
    }
    eventLog.push(event);
  }

  // Process scenario script commands up to current time
  function processScenarioCommands(): void {
    if (!config.scenarioScript) return;
    for (const cmd of config.scenarioScript) {
      if (cmd.action === 'inject' && simTimeMs >= cmd.t) {
        const failureId = cmd.id || `fail-${cmd.failureType}-${cmd.t}`;
        const alreadyActive = activeFailures.some((f) => f.id === failureId);
        const expired = cmd.durationMs && simTimeMs >= cmd.t + cmd.durationMs;

        if (!alreadyActive && !expired) {
          activeFailures.push({
            id: failureId,
            failureType: cmd.failureType,
            targetId: cmd.targetId,
            startTimeMs: cmd.t,
            durationMs: cmd.durationMs,
            endTimeMs: cmd.durationMs ? cmd.t + cmd.durationMs : undefined,
            params: cmd.params,
            description: `${cmd.failureType} on ${cmd.targetId}`,
          });

          if (cmd.failureType === 'db-crash') {
            nodeOverrides.set(cmd.targetId, { health: 'down', capacityFactor: 0 });
          } else if (cmd.failureType === 'db-slow') {
            nodeOverrides.set(cmd.targetId, { latencyMultiplier: Number(cmd.params?.multiplier ?? 5) });
          } else if (cmd.failureType === 'db-overload') {
            nodeOverrides.set(cmd.targetId, { capacityFactor: Number(cmd.params?.factor ?? 0.2) });
          } else if (cmd.failureType === 'db-pool-exhaustion') {
            nodeOverrides.set(cmd.targetId, { connectionPoolSize: Number(cmd.params?.poolSize ?? 2) });
          } else if (cmd.failureType === 'cache-flush') {
            cacheFlushTimeMs = cmd.t;
            cacheWarmupMs = Number(cmd.params?.warmupPeriodMs ?? 10000);
          } else if (cmd.failureType === 'app-server-crash') {
            nodeOverrides.set(cmd.targetId, { health: 'down' });
          } else if (cmd.failureType === 'edge-packet-loss') {
            edgeOverrides.set(cmd.targetId, { packetLossPct: Number(cmd.params?.packetLossPct ?? 5) });
          }
        } else if (alreadyActive && expired) {
          activeFailures = activeFailures.filter((f) => f.id !== failureId);
          if (cmd.failureType === 'cache-flush') cacheFlushTimeMs = null;
          else if (cmd.failureType.startsWith('edge-')) edgeOverrides.delete(cmd.targetId);
          else nodeOverrides.delete(cmd.targetId);
        }
      }
    }
  }

  // Fluid tick computation
  function advanceOneTick(): void {
    if (simTimeMs >= durationMs) {
      return;
    }

    processScenarioCommands();

    const tickSec = AGGREGATE_TICK_MS / 1000; // 0.1s

    // Calculate active attack phases from campaign if present
    let malInflowRps = 0;
    let malCostMultiplier = 1.0;
    let malConnectionHoldMs = 0;
    let malCacheable = true;
    let malExposureRisk = 0;
    let hasCompromisedPhase = false;
    let compromisedEgressRate = 0;
    compromisedTargetNodeId = undefined;

    let activePhase: import('../types/attacks').CampaignPhase | undefined;
    if (config.campaign) {
      for (const phase of config.campaign.phases) {
        if (simTimeMs >= phase.startMs && simTimeMs < phase.startMs + phase.durationMs) {
          activePhase = phase;
          malInflowRps += phase.intensityRps;
          const attrs = getPhaseTrafficAttributes(phase);
          if (attrs.costMultiplier > malCostMultiplier) {
            malCostMultiplier = attrs.costMultiplier;
          }
          if (attrs.connectionHoldMs > malConnectionHoldMs) {
            malConnectionHoldMs = attrs.connectionHoldMs;
          }
          if (!attrs.cacheable) {
            malCacheable = false;
          }
          if ((attrs.exposureRisk ?? 0) > malExposureRisk) {
            malExposureRisk = attrs.exposureRisk ?? 0;
          }
          if (phase.scenarioId === 'compromised-server') {
            hasCompromisedPhase = true;
            compromisedEgressRate += phase.params?.egressRateMbPerSec ?? 5;
            compromisedTargetNodeId = phase.targetNodeId || appServerNodes[0]?.id;
          }
        }
      }
    }

    // Auto-quarantine and egress filtering hardening options
    if (appServerCfg?.hardening?.egressFiltering) {
      compromisedEgressRate = compromisedEgressRate * 0.10;
    }
    if (appServerCfg?.hardening?.autoQuarantine && hasCompromisedPhase) {
      quarantinedTicks++;
      const lagTicks = Math.round((appServerCfg.hardening.quarantineDetectionLagMs ?? 3000) / 100);
      const reimageTicks = Math.round((appServerCfg.hardening.reimageDurationMs ?? 5000) / 100);
      if (quarantinedTicks >= lagTicks && quarantinedTicks < lagTicks + reimageTicks) {
        isQuarantined = true;
      } else if (quarantinedTicks >= lagTicks + reimageTicks) {
        isQuarantined = false;
        quarantinedTicks = 0;
        hasCompromisedPhase = false;
        if (compromisedTargetNodeId) {
          const stats = nodeAttackStats.get(compromisedTargetNodeId);
          if (stats) stats.isCompromised = false;
        }
      }
    }

    if (hasCompromisedPhase && compromisedTargetNodeId && !isQuarantined) {
      const stats = nodeAttackStats.get(compromisedTargetNodeId) ?? { isCompromised: false, maliciousInflow: 0, legitimateInflow: 0 };
      stats.isCompromised = true;
      nodeAttackStats.set(compromisedTargetNodeId, stats);
      compromisedServersCount = Math.max(1, compromisedServersCount);
      dataEgressMb += compromisedEgressRate * tickSec;
    }

    const currentLegitRps = rpsAt(simTimeMs, normalizedTraffic);
    let legitTickInflow = currentLegitRps * tickSec;

    // Check retries rejoining from delay buffer (only legitimate traffic retries!)
    let retriedInflow = 0;
    for (let i = retryBuffer.length - 1; i >= 0; i--) {
      const item = retryBuffer[i]!;
      if (simTimeMs >= item.returnTimeMs) {
        retriedInflow += item.volume;
        retryBuffer.splice(i, 1);
      }
    }
    if (retriedInflow > 0) {
      retriedCount += retriedInflow;
      legitRetried += retriedInflow;
      legitTickInflow += retriedInflow;
    }

    legitCreated += currentLegitRps * tickSec;
    let malTickInflow = malInflowRps * tickSec;
    malCreated += malTickInflow;

    // --- Phase 8B: Perimeter Defenses Evaluation (CDN, Firewall, WAF, Rate Limiter) ---
    // 1. CDN Edge Offload & DDoS Scrubbing
    if (cdnNode) {
      const cdnCfg = cdnNode.config as CdnConfig;
      if (cdnCfg.enabled !== false) {
        defenseInspected['cdn'] = (defenseInspected['cdn'] ?? 0) + legitTickInflow + malTickInflow;
        const cdnEvalLegit = evaluateCdn(cdnCfg, 'legitimate', undefined, true, currentLegitRps);
        const offloadedLegit = legitTickInflow * cdnEvalLegit.edgeHandledFraction;
        legitTickInflow -= offloadedLegit;
        legitSucceeded += offloadedLegit;
        succeededCount += offloadedLegit;

        if (activePhase?.scenarioId === 'volumetric-flood') {
          const cdnEvalMal = evaluateCdn(cdnCfg, 'malicious', 'volumetric-flood', false, malInflowRps);
          const scrubbedMal = malTickInflow * cdnEvalMal.edgeHandledFraction;
          malTickInflow -= scrubbedMal;
          blockedMaliciousCount += scrubbedMal;
          defenseBlockedMalicious['cdn'] = (defenseBlockedMalicious['cdn'] ?? 0) + scrubbedMal;
          malDropped += scrubbedMal;
        }
      }
    }

    // 2. Network Firewall
    if (firewallNode) {
      const fwCfg = firewallNode.config as FirewallConfig;
      if (fwCfg.enabled !== false) {
        defenseInspected['firewall'] = (defenseInspected['firewall'] ?? 0) + legitTickInflow + malTickInflow;
        if (activePhase) {
          const elapsed = Math.max(0, simTimeMs - activePhase.startMs);
          const fwEvalMal = evaluateFirewall(fwCfg, 'malicious', elapsed, activePhase.sourceCount ?? 1);
          const blockedMal = malTickInflow * fwEvalMal.blockedFraction;
          malTickInflow -= blockedMal;
          blockedMaliciousCount += blockedMal;
          defenseBlockedMalicious['firewall'] = (defenseBlockedMalicious['firewall'] ?? 0) + blockedMal;
          malDropped += blockedMal;
        }
        const fwEvalLegit = evaluateFirewall(fwCfg, 'legitimate', 0, 1);
        const blockedFp = legitTickInflow * fwEvalLegit.blockedFraction;
        legitTickInflow -= blockedFp;
        blockedLegitimateCount += blockedFp;
        defenseBlockedLegitimate['firewall'] = (defenseBlockedLegitimate['firewall'] ?? 0) + blockedFp;
        legitFailed += blockedFp;
      }
    }

    // 3. Web Application Firewall (WAF)
    if (wafNode) {
      const wafCfg = wafNode.config as WafConfig;
      if (wafCfg.enabled !== false) {
        defenseInspected['waf'] = (defenseInspected['waf'] ?? 0) + legitTickInflow + malTickInflow;
        const totalRps = (malTickInflow + legitTickInflow) / tickSec;
        if (activePhase) {
          const wafEvalMal = evaluateWaf(wafCfg, 'malicious', activePhase.scenarioId, totalRps);
          const blockedMal = malTickInflow * wafEvalMal.blockedFraction;
          malTickInflow -= blockedMal;
          blockedMaliciousCount += blockedMal;
          defenseBlockedMalicious['waf'] = (defenseBlockedMalicious['waf'] ?? 0) + blockedMal;
          malDropped += blockedMal;
        }
        const wafEvalLegit = evaluateWaf(wafCfg, 'legitimate', undefined, totalRps);
        const blockedFp = legitTickInflow * wafEvalLegit.blockedFraction;
        legitTickInflow -= blockedFp;
        blockedLegitimateCount += blockedFp;
        defenseBlockedLegitimate['waf'] = (defenseBlockedLegitimate['waf'] ?? 0) + blockedFp;
        legitFailed += blockedFp;
      }
    }

    // 4. Rate Limiter
    if (rateLimiterNode) {
      const rlCfg = rateLimiterNode.config as RateLimiterConfig;
      if (rlCfg.enabled !== false) {
        defenseInspected['rate-limiter'] = (defenseInspected['rate-limiter'] ?? 0) + legitTickInflow + malTickInflow;
        const totalRps = (malTickInflow + legitTickInflow) / tickSec;
        if (activePhase) {
          const rlEvalMal = evaluateRateLimiter(rlCfg, malInflowRps, activePhase.sourceCount ?? 1, totalRps);
          const blockedMal = malTickInflow * rlEvalMal.blockedFraction;
          malTickInflow -= blockedMal;
          blockedMaliciousCount += blockedMal;
          defenseBlockedMalicious['rate-limiter'] = (defenseBlockedMalicious['rate-limiter'] ?? 0) + blockedMal;
          malDropped += blockedMal;
        }
        const rlEvalLegit = evaluateRateLimiter(rlCfg, currentLegitRps, 100, totalRps);
        const blockedFp = legitTickInflow * rlEvalLegit.blockedFraction;
        legitTickInflow -= blockedFp;
        blockedLegitimateCount += blockedFp;
        defenseBlockedLegitimate['rate-limiter'] = (defenseBlockedLegitimate['rate-limiter'] ?? 0) + blockedFp;
        legitRejected += blockedFp;
      }
    }

    const tickInflow = legitTickInflow + malTickInflow;
    createdCount = legitCreated + malCreated;
    const malRatio = tickInflow > 0 ? malTickInflow / tickInflow : 0;

    const clientCfg = (clientNode ? clientNode.config : {}) as Partial<ClientConfig>;
    const effectiveRoutes = getEffectiveRoutes(clientCfg);
    const readRatio =
      clientCfg.routes && clientCfg.routes.length > 0
        ? effectiveRoutes.filter((r) => r.kind === 'read').reduce((s, r) => s + r.share, 0) / 100
        : (clientCfg.readRatio ?? 80) / 100;
    const writeRatio = Math.max(0, 1 - readRatio);
    const cacheableShare =
      clientCfg.routes && clientCfg.routes.length > 0
        ? effectiveRoutes.filter((r) => r.cacheable).reduce((s, r) => s + r.share, 0) / 100
        : readRatio;
    const requestTimeoutMs = clientCfg.requestTimeoutMs ?? 5000;
    const retryPolicy: RetryPolicy = clientCfg.retryPolicy ?? RETRY_PRESETS.none;

    // 1. Router / Ingress
    let ingressServed = tickInflow;
    if (routerNode) {
      const rState = nodes.get(routerNode.id)!;
      const rCfg = routerNode.config as RouterConfig;
      const rCap = (rCfg.capacityRps ?? 50000) * tickSec;

      const available = tickInflow + rState.queue;
      const served = Math.min(available, rCap);
      const remaining = available - served;

      if (remaining > rState.queueLimit) {
        const dropped = remaining - rState.queueLimit;
        rState.queue = rState.queueLimit;
        rState.totalRejected += dropped;
        rejectedCount += dropped;
        const droppedMal = dropped * malRatio;
        const droppedLegit = dropped - droppedMal;
        malRejected += droppedMal;
        legitRejected += droppedLegit;
      } else {
        rState.queue = remaining;
      }

      rState.totalServed += served;
      rState.active = Math.min(rState.concurrencyLimit, Math.round(served));
      rState.lastTickUtilization = rCap > 0 ? Math.min(1.0, served / rCap) : 1.0;
      rState.lastTickRps = Math.round(served / tickSec);
      ingressServed = served;
    }

    // 2. Load Balancer
    let lbServed = ingressServed;
    if (lbNode) {
      const lbState = nodes.get(lbNode.id)!;
      const lbCfg = lbNode.config as LoadBalancerConfig;
      const lbCap = (lbCfg.capacityRps ?? 10000) * tickSec;

      const available = ingressServed + lbState.queue;
      const served = Math.min(available, lbCap);
      const remaining = available - served;

      if (remaining > lbState.queueLimit) {
        const dropped = remaining - lbState.queueLimit;
        lbState.queue = lbState.queueLimit;
        lbState.totalRejected += dropped;
        rejectedCount += dropped;
        const droppedMal = dropped * malRatio;
        const droppedLegit = dropped - droppedMal;
        malRejected += droppedMal;
        legitRejected += droppedLegit;
      } else {
        lbState.queue = remaining;
      }

      lbState.totalServed += served;
      lbState.active = Math.min(lbState.concurrencyLimit, Math.round(served));
      lbState.lastTickUtilization = lbCap > 0 ? Math.min(1.0, served / lbCap) : 1.0;
      lbState.lastTickRps = Math.round(served / tickSec);
      lbServed = served;

      // Phase 9: API Gateway Response Caching
      if (lbNode.type === 'api-gateway') {
        const gwCfg = lbNode.config as ApiGatewayConfig;
        if (gwCfg.responseCaching?.enabled) {
          const cacheHitFrac = Math.min(0.8, cacheableShare * 0.8);
          const cachedServed = lbServed * cacheHitFrac;
          lbServed -= cachedServed;
          const cachedMal = cachedServed * malRatio;
          const cachedLegit = cachedServed - cachedMal;
          succeededCount += cachedServed;
          legitSucceeded += cachedLegit;
          malReachedTarget += cachedMal;
        }
      }
    }

    // 3. Database State Prep (needed for Little's Law coupling)
    let dbCapPerSec = 500;
    let dbAvgLatencyMs = 20;
    let dbQueueWaitMs = 0;
    let cacheHitRatio = 0;

    if (cacheNode) {
      const cacheCfg = cacheNode.config as CacheConfig;
      const isDown =
        (cacheCfg as { health?: string }).health === 'down' ||
        nodeOverrides.get(cacheNode.id)?.health === 'down';

      if (isDown) {
        cacheHitRatio = 0;
      } else if (cacheFlushTimeMs !== null) {
        // Cold cache ramp
        const elapsed = simTimeMs - cacheFlushTimeMs;
        if (elapsed < cacheWarmupMs) {
          cacheHitRatio = (elapsed / cacheWarmupMs) * ((cacheCfg.hitRatio ?? 85) / 100);
        } else {
          cacheHitRatio = (cacheCfg.hitRatio ?? 85) / 100;
        }
      } else {
        cacheHitRatio = (cacheCfg.hitRatio ?? 85) / 100;
      }
    }

    if (databaseNode) {
      const dbCfg = databaseNode.config as DatabaseConfig;
      const dbState = nodes.get(databaseNode.id)!;
      const dbOverride = nodeOverrides.get(databaseNode.id);
      const mult = dbOverride?.latencyMultiplier ?? 1.0;

      const dbRaw = dbCfg as unknown as Record<string, unknown>;
      const rawRead = typeof dbRaw.readLatencyMs === 'number' ? dbRaw.readLatencyMs : undefined;
      const rawWrite = typeof dbRaw.writeLatencyMs === 'number' ? dbRaw.writeLatencyMs : undefined;
      const readLatency =
        (rawRead ?? dbCfg.readQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 20) * mult;
      const writeLatency =
        (rawWrite ?? dbCfg.writeQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 30) * mult;
      dbAvgLatencyMs = readRatio * readLatency + writeRatio * writeLatency;

      const poolSize = dbOverride?.connectionPoolSize ?? dbCfg.connectionPoolSize ?? 100;
      const poolCap = Math.floor(poolSize / (dbAvgLatencyMs / 1000));
      const capFactor = dbOverride?.capacityFactor ?? 1.0;
      dbCapPerSec = Math.min(dbCfg.maxQueryThroughputQps * capFactor, poolCap);

      dbQueueWaitMs = (dbState.queue / Math.max(1, dbCapPerSec)) * 1000;
    }

    // Downstream wait experienced by App Server
    const alphaDb = cacheNode ? writeRatio + readRatio * (1 - cacheHitRatio) : 1.0;
    const downstreamWaitMs = alphaDb * (dbAvgLatencyMs + dbQueueWaitMs) + (1 - alphaDb) * 1;

    // 4. App Server Tier with Little's Law Back-Pressure
    const aliveApps = appServerNodes.filter(
      (n) =>
        nodeOverrides.get(n.id)?.health !== 'down' &&
        (!isQuarantined || n.id !== compromisedTargetNodeId)
    );
    const appCount = Math.max(1, aliveApps.length);
    const inflowPerApp = aliveApps.length > 0 ? lbServed / appCount : 0;
    let appTotalServed = 0;

    for (const appNode of appServerNodes) {
      const appState = nodes.get(appNode.id)!;
      const appCfg = appNode.config as AppServerConfig;
      const appOverride = nodeOverrides.get(appNode.id);

      if (appOverride?.health === 'down' || (isQuarantined && appNode.id === compromisedTargetNodeId)) {
        appState.lastTickUtilization = 0;
        appState.lastTickRps = 0;
        appState.active = 0;
        continue;
      }

      const mult = appOverride?.latencyMultiplier ?? 1.0;
      const weightedCostMultiplier = 1.0 + malRatio * (malCostMultiplier - 1.0);
      const effectiveServiceTimeMs = appCfg.avgProcessingTimeMs * mult * weightedCostMultiplier + downstreamWaitMs;

      // Slowloris hold reduces effective concurrency capacity (mitigated by connection limits)
      const connLimits = (appCfg as { connectionLimits?: ConnectionLimitsConfig })?.connectionLimits;
      let effectiveHoldMs = malConnectionHoldMs;
      if (connLimits?.enabled && connLimits.headerTimeoutMs > 0 && effectiveHoldMs > 0) {
        effectiveHoldMs = Math.min(effectiveHoldMs, connLimits.headerTimeoutMs);
      }
      const slowlorisOccupied = (malInflowRps * (effectiveHoldMs / 1000)) / appCount;
      const baseConcurrency = (appCfg.maxConcurrentRequests ?? 100) * activeAppInstances;
      const effectiveMaxConcurrent = Math.max(1, baseConcurrency - slowlorisOccupied);

      const effectiveConcurrencyCapacity =
        effectiveMaxConcurrent / (effectiveServiceTimeMs / 1000);

      const standaloneModel = getComponentModel('app-server');
      const standaloneCapacity = standaloneModel.getEffectiveCapacityRps(appCfg) * activeAppInstances;
      const capFactor = appOverride?.capacityFactor ?? 1.0;
      const effectiveCapacityRps = Math.floor(
        Math.min(standaloneCapacity * capFactor, effectiveConcurrencyCapacity)
      );
      const tickCap = effectiveCapacityRps * tickSec;

      const available = inflowPerApp + appState.queue;
      const served = Math.min(available, tickCap);
      const remaining = available - served;

      if (remaining > appState.queueLimit) {
        const dropped = remaining - appState.queueLimit;
        appState.queue = appState.queueLimit;
        appState.totalRejected += dropped;
        rejectedCount += dropped;
        const droppedMal = dropped * malRatio;
        const droppedLegit = dropped - droppedMal;
        malRejected += droppedMal;
        legitRejected += droppedLegit;
      } else {
        appState.queue = remaining;
      }

      appState.totalServed += served;
      appState.active = Math.min(appState.concurrencyLimit, Math.round(served));
      appState.lastTickUtilization = tickCap > 0 ? Math.min(1.0, served / tickCap) : 1.0;
      appState.lastTickRps = Math.round(served / tickSec);
      appTotalServed += served;
    }

    // Evaluate Autoscaling Policy on App Servers
    if (asPolicy?.enabled) {
      const avgUtil =
        aliveApps.length > 0
          ? aliveApps.reduce((acc, a) => acc + (nodes.get(a.id)?.lastTickUtilization ?? 0), 0) /
            aliveApps.length
          : 0;
      if (avgUtil >= (asPolicy.scaleOutUtilizationPct ?? 75) / 100) {
        highUtilTicks++;
        if (
          highUtilTicks >= (asPolicy.scaleOutAfterSec ?? 3) * 10 &&
          cooldownTicks <= 0 &&
          activeAppInstances < (asPolicy.maxInstances ?? 6)
        ) {
          activeAppInstances = Math.min(asPolicy.maxInstances ?? 6, activeAppInstances + 1);
          cooldownTicks = (asPolicy.cooldownSec ?? 10) * 10;
          highUtilTicks = 0;
        }
      } else {
        highUtilTicks = 0;
      }
      if (cooldownTicks > 0) cooldownTicks--;
      autoscalingCostDollars +=
        Math.max(0, activeAppInstances - 1) *
        ((asPolicy.costPerInstanceHour ?? 0.08) / 3600) *
        tickSec;
    }

    // 5. Cache & Database Flow
    let cacheHits = 0;
    if (cacheNode) {
      const cacheState = nodes.get(cacheNode.id)!;
      // Only cacheable (legitimate) traffic hits cache; uncacheable scraper traffic misses 100%
      const cacheableFlow = malCacheable ? appTotalServed : appTotalServed * (1 - malRatio);
      cacheHits = cacheableFlow * readRatio * cacheHitRatio;
      cacheState.totalServed += cacheHits;
      cacheState.lastTickRps = Math.round(cacheHits / tickSec);
      cacheState.lastTickUtilization = Math.min(1.0, cacheHits / 10000);
    }

    let dbServed = 0;
    if (databaseNode) {
      const dbState = nodes.get(databaseNode.id)!;
      const dbCfg = databaseNode.config as DatabaseConfig;

      // Phase 9: Async Message Queue offloading
      let mqServed = 0;
      let syncWrites = appTotalServed * writeRatio;

      if (mqNode && workerNodes.length > 0) {
        const asyncWriteShare = (appServerCfg?.asyncWriteShare ?? 80) / 100;
        const asyncEnqueue = appTotalServed * writeRatio * asyncWriteShare;
        syncWrites = appTotalServed * writeRatio * (1 - asyncWriteShare);

        totalWorkerDrainCap = workerNodes.reduce((acc, w) => {
          const wc = w.config as WorkerConfig;
          return acc + ((wc.instances ?? 2) * (wc.concurrency ?? 5) * 1000) / (wc.avgProcessingMs ?? 80);
        }, 0);

        const mqState = nodes.get(mqNode.id)!;
        const mqCfg = mqNode.config as MessageQueueConfig;
        const dbAvail = Math.max(0, dbCapPerSec - (appTotalServed * readRatio * (1 - cacheHitRatio) + syncWrites));
        const effectiveDrainCap = Math.min(totalWorkerDrainCap, dbAvail);

        const mqInflow = asyncEnqueue + mqState.queue;
        mqServed = Math.min(mqInflow, effectiveDrainCap * tickSec);
        const mqRem = mqInflow - mqServed;

        if (mqRem > mqState.queueLimit) {
          const over = mqRem - mqState.queueLimit;
          mqState.queue = mqState.queueLimit;
          if (mqCfg.overflowBehavior === 'reject') {
            rejectedCount += over;
            legitRejected += over * (1 - malRatio);
            malRejected += over * malRatio;
          } else {
            totalAsyncJobsDropped += over;
          }
        } else {
          mqState.queue = mqRem;
        }

        mqState.totalServed += mqServed;
        mqState.lastTickRps = Math.round(mqServed / tickSec);
        mqState.lastTickUtilization = effectiveDrainCap > 0 ? Math.min(1.0, (mqServed / tickSec) / effectiveDrainCap) : 0;
        totalAsyncJobsEnqueued += asyncEnqueue;
        totalAsyncJobsProcessed += mqServed;

        // Workers load
        const perWorkerRps = Math.round((mqServed / tickSec) / Math.max(1, workerNodes.length));
        for (const w of workerNodes) {
          const wState = nodes.get(w.id)!;
          wState.totalServed += mqServed / Math.max(1, workerNodes.length);
          wState.lastTickRps = perWorkerRps;
          wState.lastTickUtilization = Math.min(1.0, perWorkerRps / 100);
        }
      }

      // Phase 9: Read Replicas offloading
      let primaryReadFlow = appTotalServed * readRatio * (1 - cacheHitRatio);

      if (replicaNodes.length > 0) {
        const replicaShare = (dbCfg?.readFromReplicasShare ?? 90) / 100;
        const replicaReadFlow = primaryReadFlow * replicaShare;
        primaryReadFlow = primaryReadFlow * (1 - replicaShare);

        const perReplica = replicaReadFlow / replicaNodes.length;
        for (const rep of replicaNodes) {
          const repState = nodes.get(rep.id)!;
          repState.totalServed += perReplica;
          repState.lastTickRps = Math.round(perReplica / tickSec);
          repState.lastTickUtilization = Math.min(1.0, repState.lastTickRps / ((rep.config as DatabaseReplicaConfig).capacityQps || 800));
        }

        // Replication lag
        const primaryWriteFlow = syncWrites + mqServed;
        const primaryWriteRate = primaryWriteFlow / tickSec;
        const applyRate = dbCfg?.replicationApplyRate ?? 300;
        if (primaryWriteRate > applyRate) {
          replicaLagMs += ((primaryWriteRate - applyRate) / applyRate) * 1000 * tickSec;
        } else {
          replicaLagMs = Math.max(5, replicaLagMs - 200 * tickSec);
        }

        if (replicaLagMs > (dbCfg?.stalenessThresholdMs ?? 1000)) {
          currentStaleReadRate = replicaReadFlow / tickSec;
          totalStaleReads += replicaReadFlow;
        } else {
          currentStaleReadRate = 0;
        }
      }

      // Primary DB Inflow
      const dbInflow = primaryReadFlow + syncWrites + mqServed;

      // Phase 9: Sharding
      if (dbCfg?.shardCount && dbCfg.shardCount > 1) {
        const N = dbCfg.shardCount;
        if (dbCfg.shardKeyDistribution === 'zipf-skewed') {
          const sharded = calculateShardedMaxThroughput(dbCfg.maxQueryThroughputQps, N, 'zipf-skewed', dbCfg.zipfSkew ?? 1.2);
          dbCapPerSec = Math.min(dbCapPerSec, sharded.maxSustainableRps);
          const probs = calculateZipfWeights(N, dbCfg.zipfSkew ?? 1.2);
          probs.forEach((p, idx) => {
            shardLoads[idx] = (shardLoads[idx] ?? 0) + dbInflow * p;
          });
        } else {
          for (let i = 0; i < N; i++) {
            shardLoads[i] = (shardLoads[i] ?? 0) + dbInflow / N;
          }
        }
      }

      const dbTickCap = dbCapPerSec * tickSec;

      const available = dbInflow + dbState.queue;
      dbServed = Math.min(available, dbTickCap);
      const remaining = available - dbServed;

      if (remaining > dbState.queueLimit) {
        const dropped = remaining - dbState.queueLimit;
        dbState.queue = dbState.queueLimit;
        dbState.totalRejected += dropped;
        rejectedCount += dropped;
        const droppedMal = dropped * malRatio;
        const droppedLegit = dropped - droppedMal;
        malRejected += droppedMal;
        legitRejected += droppedLegit;
      } else {
        dbState.queue = remaining;
      }

      dbState.totalServed += dbServed;
      dbState.active = Math.min(dbState.concurrencyLimit, Math.round(dbServed));
      dbState.lastTickUtilization = dbTickCap > 0 ? Math.min(1.0, dbServed / dbTickCap) : 1.0;
      dbState.lastTickRps = Math.round(dbServed / tickSec);

      // Check abstract exposure events for injection attacks reaching database (hardened by parameterizedQueries & leastPrivilegeDb)
      const isParameterized =
        appServerCfg?.hardening?.parameterizedQueries ||
        (databaseNode.config as DatabaseConfig)?.hardening?.parameterizedQueries;
      const effectiveExposureRisk = isParameterized
        ? Math.min(0.01, malExposureRisk * 0.01)
        : malExposureRisk;

      if (effectiveExposureRisk > 0 && dbServed * malRatio > 0) {
        if (attackerRng.next() < effectiveExposureRisk) {
          exposureEventsCount++;
          if ((databaseNode.config as DatabaseConfig)?.hardening?.leastPrivilegeDb) {
            exposureLimitedCount++;
          } else {
            exposureFullCount++;
          }
        }
      }
    }

    // 6. Succeeded, Timeouts & Orphaned Work Accounting
    const totalRoundTripMs = 5 + downstreamWaitMs;

    if (totalRoundTripMs > requestTimeoutMs) {
      // Saturated queues caused requests to exceed timeout limit!
      const malTimed = appTotalServed * malRatio;
      const legitTimed = appTotalServed - malTimed;
      malTimedOut += malTimed;
      legitTimedOut += legitTimed;
      timedOutCount = legitTimedOut + malTimedOut;
      orphanedWorkCount += appTotalServed;

      // Check retries (ONLY legitimate traffic retries!)
      if (retryPolicy.maxAttempts > 1) {
        const backoffMs =
          retryPolicy.backoff === 'exponential_jitter' ? 300 : retryPolicy.baseDelayMs || 100;
        retryBuffer.push({
          returnTimeMs: simTimeMs + backoffMs,
          volume: legitTimed * 0.75, // 75% retry
        });
      }
    } else {
      const totalCompleted = cacheHits + (databaseNode ? dbServed : appTotalServed);
      const malCompleted = databaseNode ? dbServed * malRatio : appTotalServed * malRatio;
      const legitCompleted = totalCompleted - malCompleted;

      malReachedTarget += malCompleted;
      legitSucceeded += legitCompleted;
      succeededCount = legitSucceeded + malReachedTarget;

      // Latency accounting
      const networkHopsMs = 40 + (routerNode ? 2 : 0) + (lbNode ? 2 : 0);
      const appProcMs = appServerNodes[0]
        ? (appServerNodes[0].config as AppServerConfig).avgProcessingTimeMs
        : 10;

      const cacheLatency = networkHopsMs + appProcMs + 1;
      recordLatency(cacheLatency, cacheHits);

      if (databaseNode && dbServed > 0) {
        const dbCfg = databaseNode.config as DatabaseConfig;
        const readLatency = dbCfg.readQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 30;
        const writeLatency = dbCfg.writeQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 60;

        const dbReadFraction = cacheNode
          ? (readRatio * (1 - cacheHitRatio)) / Math.max(0.001, alphaDb)
          : readRatio;
        const dbReads = dbServed * dbReadFraction;
        const dbWrites = dbServed * (1 - dbReadFraction);

        const readDbLatency = networkHopsMs + appProcMs + readLatency + dbQueueWaitMs;
        const writeDbLatency = networkHopsMs + appProcMs + writeLatency + dbQueueWaitMs;

        recordLatency(readDbLatency, dbReads);
        recordLatency(writeDbLatency, dbWrites);
      } else if (!databaseNode) {
        recordLatency(networkHopsMs + appProcMs, appTotalServed - cacheHits);
      }
    }

    // 7. Sampled Animation Events
    if (tickInflow > 0 && simTimeMs % 1000 < SAMPLED_RPS * AGGREGATE_TICK_MS) {
      sampledReqCounter++;
      const sampleClient = clientNode?.id ?? 'client-1';
      emitSampledEvent('REQUEST_CREATED', sampleClient);

      if (routerNode) emitSampledEvent('REQUEST_RECEIVED', routerNode.id);
      if (lbNode) {
        const targetApp = appServerNodes[sampledReqCounter % appCount]?.id ?? 'app-1';
        emitSampledEvent('LOAD_BALANCED', lbNode.id, targetApp);
      }

      const activeApp = appServerNodes[sampledReqCounter % appCount];
      if (activeApp) {
        emitSampledEvent('REQUEST_PROCESSING_STARTED', activeApp.id);
      }

      if (cacheNode && cacheHitRatio > 0 && sampledReqCounter % 10 < cacheHitRatio * 10) {
        emitSampledEvent('CACHE_HIT', cacheNode.id);
        emitSampledEvent('RESPONSE_RECEIVED', sampleClient, undefined, { statusCode: 200 });
      } else if (databaseNode) {
        emitSampledEvent('DATABASE_QUERY', databaseNode.id);
      }
    }

    simTimeMs += AGGREGATE_TICK_MS;
  }

  function calculateAggregateLatencySummary(): LatencySummary {
    let totalSamples = 0;
    let weightedSum = 0;
    let minMs = 999999;
    let maxMs = 0;

    for (const [bucketMs, count] of latencyHistogram.entries()) {
      if (count > 0) {
        totalSamples += count;
        weightedSum += bucketMs * count;
        minMs = Math.min(minMs, bucketMs);
        maxMs = Math.max(maxMs, bucketMs);
      }
    }

    if (totalSamples === 0) {
      return { averageMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0 };
    }

    const averageMs = Math.round((weightedSum / totalSamples) * 10) / 10;
    const targetP50 = totalSamples * 0.5;
    const targetP95 = totalSamples * 0.95;
    const targetP99 = totalSamples * 0.99;

    let p50Ms = minMs;
    let p95Ms = maxMs;
    let p99Ms = maxMs;
    let cumulative = 0;

    for (const b of LATENCY_BUCKETS) {
      const c = latencyHistogram.get(b) ?? 0;
      cumulative += c;
      if (cumulative >= targetP50 && p50Ms === minMs) {
        p50Ms = b;
      }
      if (cumulative >= targetP95 && p95Ms === maxMs) {
        p95Ms = b;
      }
      if (cumulative >= targetP99) {
        p99Ms = b;
        break;
      }
    }

    return {
      averageMs,
      p50Ms,
      p95Ms,
      p99Ms,
      minMs: minMs === 999999 ? 0 : minMs,
      maxMs,
    };
  }

  const snapshotHistory: SimulationSnapshot[] = [];

  function getSnapshot(): SimulationSnapshot {
    const totalLegitEnded = legitSucceeded + legitFailed + legitRejected + legitTimedOut;
    const legitimateSuccessRate =
      totalLegitEnded > 0
        ? Math.round((legitSucceeded / totalLegitEnded) * 1000) / 10
        : 100.0;

    const attackTrafficShare =
      createdCount > 0
        ? Math.round((malCreated / createdCount) * 1000) / 10
        : 0.0;

    const runtimeNodes: Record<string, NodeRuntimeState> = {};

    for (const [id, state] of nodes.entries()) {
      const override = nodeOverrides.get(id);
      const isFailed = override?.health === 'down';
      const isNodeQuarantined = isQuarantined && id === compromisedTargetNodeId;

      runtimeNodes[id] = {
        nodeId: id,
        status: isNodeQuarantined
          ? 'failed'
          : isFailed
          ? 'failed'
          : state.queue > state.queueLimit * 0.8
          ? 'overloaded'
          : state.lastTickUtilization > 0.85
          ? 'warning'
          : 'healthy',
        currentRps: state.lastTickRps,
        utilization: Math.round(state.lastTickUtilization * 100) / 100,
        queueDepth: Math.round(state.queue),
        activeConnections: state.active,
        attackTrafficShare,
        isCompromised: nodeAttackStats.get(id)?.isCompromised ?? false,
        isQuarantined: isNodeQuarantined,
        activeInstances: id.startsWith('app-server') ? activeAppInstances : undefined,
        errorRate:
          state.totalServed + state.totalRejected > 0
            ? Math.round(
                (state.totalRejected / (state.totalServed + state.totalRejected)) * 100
              ) / 100
            : 0,
        p99LatencyMs: 0,
      };
    }

    const inFlightEstimate = Math.max(
      0,
      Math.round(createdCount + retriedCount - succeededCount - rejectedCount - timedOutCount)
    );

    const amplificationFactor =
      createdCount > 0
        ? Math.round(((createdCount + retriedCount) / createdCount) * 100) / 100
        : 1.0;

    const counters: SimulationCounters = {
      created: Math.round(createdCount),
      inFlight: inFlightEstimate,
      succeeded: Math.round(succeededCount),
      failed: Math.round(rejectedCount),
      rejected: Math.round(rejectedCount),
      timedOut: Math.round(timedOutCount),
      retried: Math.round(retriedCount),
      orphanedWork: Math.round(orphanedWorkCount),
      packetLoss: Math.round(packetLossCount),
      lateResponsesDiscarded: Math.round(lateResponsesDiscardedCount),
      amplificationFactor,
      blockedMalicious: Math.round(blockedMaliciousCount),
      blockedLegitimate: Math.round(blockedLegitimateCount),
      defenseInspected: { ...defenseInspected },
      defenseBlockedMalicious: { ...defenseBlockedMalicious },
      defenseBlockedLegitimate: { ...defenseBlockedLegitimate },
      autoscalingCostDollars: Math.round(autoscalingCostDollars * 10000) / 10000,
      activeInstancesCount: activeAppInstances,
      exposureLimitedCount,
      exposureFullCount,
      legitimate: {
        created: Math.round(legitCreated),
        inFlight: Math.max(
          0,
          Math.round(legitCreated + legitRetried - legitSucceeded - legitRejected - legitTimedOut)
        ),
        succeeded: Math.round(legitSucceeded),
        failed: Math.round(legitRejected),
        rejected: Math.round(legitRejected),
        timedOut: Math.round(legitTimedOut),
        retried: Math.round(legitRetried),
      },
      malicious: {
        created: Math.round(malCreated),
        inFlight: Math.max(
          0,
          Math.round(malCreated - malReachedTarget - malRejected - malTimedOut)
        ),
        reachedTarget: Math.round(malReachedTarget),
        dropped: Math.round(malDropped),
        rejected: Math.round(malRejected),
        timedOut: Math.round(malTimedOut),
      },
      legitimateSuccessRate,
      attackTrafficShare,
      exposureEvents: exposureEventsCount,
      compromisedServersCount,
      dataEgressMb: Math.round(dataEgressMb * 10) / 10,

      // Phase 9 counters
      asyncJobsEnqueued: Math.round(totalAsyncJobsEnqueued),
      asyncJobsProcessed: Math.round(totalAsyncJobsProcessed),
      asyncJobsDropped: Math.round(totalAsyncJobsDropped),
      asyncJobsDeadLettered: 0,
      queueDepth: mqNode ? Math.round(nodes.get(mqNode.id)?.queue ?? 0) : 0,
      consumerLagMs: mqNode && totalWorkerDrainCap > 0 ? Math.round(((nodes.get(mqNode.id)?.queue ?? 0) / totalWorkerDrainCap) * 1000) : 0,
      oldestJobAgeMs: mqNode && totalWorkerDrainCap > 0 ? Math.round(((nodes.get(mqNode.id)?.queue ?? 0) / totalWorkerDrainCap) * 1000) : 0,
      avgJobCompletionLatencyMs: Math.round(avgJobCompletionMs),
      staleReadsCount: Math.round(totalStaleReads),
      staleReadRate: Math.round(currentStaleReadRate),
      replicationLagMs: Math.round(replicaLagMs),
      failoverState,
      shardLoads: [...shardLoads],
      hotShardLoadPercent:
        shardLoads.reduce((a, b) => a + b, 0) > 0
          ? Math.round((Math.max(...shardLoads) / shardLoads.reduce((a, b) => a + b, 0)) * 100)
          : 100,
    };

    const currentSnapshot: SimulationSnapshot = {
      timeMs: Math.round(simTimeMs),
      runtimeNodes,
      counters,
      latencySummary: calculateAggregateLatencySummary(),
      recentEvents: [...eventLog],
      eventCursor: eventSeq,
      isDone: simTimeMs >= durationMs,
      mode: 'aggregate',
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

  function advanceTo(targetTimeMs: number): SimulationSnapshot {
    while (simTimeMs < targetTimeMs) {
      advanceOneTick();
    }
    return getSnapshot();
  }

  function stepNextEvent(): SimulationSnapshot {
    advanceOneTick();
    return getSnapshot();
  }

  function reset(): void {
    simTimeMs = 0;
    eventSeq = 0;
    sampledReqCounter = 1;
    createdCount = 0;
    succeededCount = 0;
    rejectedCount = 0;
    timedOutCount = 0;
    retriedCount = 0;
    orphanedWorkCount = 0;
    packetLossCount = 0;
    lateResponsesDiscardedCount = 0;
    legitCreated = 0;
    legitSucceeded = 0;
    legitFailed = 0;
    legitRejected = 0;
    legitTimedOut = 0;
    legitRetried = 0;
    malCreated = 0;
    malReachedTarget = 0;
    malDropped = 0;
    malRejected = 0;
    malTimedOut = 0;
    exposureEventsCount = 0;
    compromisedServersCount = 0;
    dataEgressMb = 0;
    blockedMaliciousCount = 0;
    blockedLegitimateCount = 0;
    defenseInspected = {};
    defenseBlockedMalicious = {};
    defenseBlockedLegitimate = {};
    exposureLimitedCount = 0;
    exposureFullCount = 0;
    autoscalingCostDollars = 0;
    activeAppInstances = asPolicy?.enabled ? Math.max(1, asPolicy.minInstances ?? 1) : 1;
    highUtilTicks = 0;
    cooldownTicks = 0;
    isQuarantined = false;
    quarantinedTicks = 0;
    legitRetried = 0;
    malCreated = 0;
    malReachedTarget = 0;
    malDropped = 0;
    malRejected = 0;
    malTimedOut = 0;
    exposureEventsCount = 0;
    compromisedServersCount = 0;
    dataEgressMb = 0;
    for (const stats of nodeAttackStats.values()) {
      stats.isCompromised = false;
      stats.maliciousInflow = 0;
      stats.legitimateInflow = 0;
    }
    retryBuffer.length = 0;
    activeFailures = [];
    nodeOverrides.clear();
    edgeOverrides.clear();
    cacheFlushTimeMs = null;

    eventLog.length = 0;
    snapshotHistory.length = 0;

    for (const b of LATENCY_BUCKETS) {
      latencyHistogram.set(b, 0);
    }

    for (const s of nodes.values()) {
      s.queue = 0;
      s.active = 0;
      s.totalServed = 0;
      s.totalRejected = 0;
      s.lastTickUtilization = 0;
      s.lastTickRps = 0;
    }
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
    const active: ActiveFailure = {
      id: failureId,
      failureType: failure.failureType,
      targetId: failure.targetId,
      startTimeMs: simTimeMs,
      durationMs: failure.durationMs,
      endTimeMs: failure.durationMs ? simTimeMs + failure.durationMs : undefined,
      params: failure.params,
      description: `${failure.failureType} on ${failure.targetId}`,
    };
    activeFailures.push(active);
    return failureId;
  }

  function removeFailure(failureId: string): void {
    activeFailures = activeFailures.filter((f) => f.id !== failureId);
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
