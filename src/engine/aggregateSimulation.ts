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
} from '../types';
import { getComponentModel } from './components/registry';
import { ActiveFailure, FailureType } from '../scenarios/failures/types';

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

          if (cmd.failureType === 'db-slow') {
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
    const currentRps = rpsAt(simTimeMs, normalizedTraffic);
    let tickInflow = currentRps * tickSec;

    // Check retries rejoining from delay buffer
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
      tickInflow += retriedInflow;
    }
    createdCount += currentRps * tickSec;

    const clientCfg = clientNode
      ? (clientNode.config as ClientConfig)
      : { readRatio: 80, requestTimeoutMs: 5000, retryPolicy: RETRY_PRESETS.none };
    const readRatio = (clientCfg.readRatio ?? 80) / 100;
    const writeRatio = Math.max(0, 1 - readRatio);
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
      } else {
        lbState.queue = remaining;
      }

      lbState.totalServed += served;
      lbState.active = Math.min(lbState.concurrencyLimit, Math.round(served));
      lbState.lastTickUtilization = lbCap > 0 ? Math.min(1.0, served / lbCap) : 1.0;
      lbState.lastTickRps = Math.round(served / tickSec);
      lbServed = served;
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
      (n) => nodeOverrides.get(n.id)?.health !== 'down'
    );
    const appCount = Math.max(1, aliveApps.length);
    const inflowPerApp = aliveApps.length > 0 ? lbServed / appCount : 0;
    let appTotalServed = 0;

    for (const appNode of appServerNodes) {
      const appState = nodes.get(appNode.id)!;
      const appCfg = appNode.config as AppServerConfig;
      const appOverride = nodeOverrides.get(appNode.id);

      if (appOverride?.health === 'down') {
        appState.lastTickUtilization = 0;
        appState.lastTickRps = 0;
        appState.active = 0;
        continue;
      }

      const mult = appOverride?.latencyMultiplier ?? 1.0;
      const effectiveServiceTimeMs = appCfg.avgProcessingTimeMs * mult + downstreamWaitMs;
      const effectiveConcurrencyCapacity =
        appCfg.maxConcurrentRequests / (effectiveServiceTimeMs / 1000);

      const standaloneModel = getComponentModel('app-server');
      const standaloneCapacity = standaloneModel.getEffectiveCapacityRps(appCfg);
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
      } else {
        appState.queue = remaining;
      }

      appState.totalServed += served;
      appState.active = Math.min(appState.concurrencyLimit, Math.round(served));
      appState.lastTickUtilization = tickCap > 0 ? Math.min(1.0, served / tickCap) : 1.0;
      appState.lastTickRps = Math.round(served / tickSec);
      appTotalServed += served;
    }

    // 5. Cache & Database Flow
    let cacheHits = 0;
    if (cacheNode) {
      const cacheState = nodes.get(cacheNode.id)!;
      cacheHits = appTotalServed * readRatio * cacheHitRatio;
      cacheState.totalServed += cacheHits;
      cacheState.lastTickRps = Math.round(cacheHits / tickSec);
      cacheState.lastTickUtilization = Math.min(1.0, cacheHits / 10000);
    }

    let dbServed = 0;
    if (databaseNode) {
      const dbState = nodes.get(databaseNode.id)!;
      const dbInflow = appTotalServed - cacheHits;
      const dbTickCap = dbCapPerSec * tickSec;

      const available = dbInflow + dbState.queue;
      dbServed = Math.min(available, dbTickCap);
      const remaining = available - dbServed;

      if (remaining > dbState.queueLimit) {
        const dropped = remaining - dbState.queueLimit;
        dbState.queue = dbState.queueLimit;
        dbState.totalRejected += dropped;
        rejectedCount += dropped;
      } else {
        dbState.queue = remaining;
      }

      dbState.totalServed += dbServed;
      dbState.active = Math.min(dbState.concurrencyLimit, Math.round(dbServed));
      dbState.lastTickUtilization = dbTickCap > 0 ? Math.min(1.0, dbServed / dbTickCap) : 1.0;
      dbState.lastTickRps = Math.round(dbServed / tickSec);
    }

    // 6. Succeeded, Timeouts & Orphaned Work Accounting
    const totalRoundTripMs = 5 + downstreamWaitMs;

    if (totalRoundTripMs > requestTimeoutMs) {
      // Saturated queues caused requests to exceed timeout limit!
      timedOutCount += appTotalServed;
      orphanedWorkCount += appTotalServed;

      // Check retries
      if (retryPolicy.maxAttempts > 1) {
        const backoffMs =
          retryPolicy.backoff === 'exponential_jitter' ? 300 : retryPolicy.baseDelayMs || 100;
        retryBuffer.push({
          returnTimeMs: simTimeMs + backoffMs,
          volume: appTotalServed * 0.75, // 75% retry
        });
      }
    } else {
      const totalCompleted = cacheHits + (databaseNode ? dbServed : appTotalServed);
      succeededCount += totalCompleted;

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
    const runtimeNodes: Record<string, NodeRuntimeState> = {};

    for (const [id, state] of nodes.entries()) {
      const override = nodeOverrides.get(id);
      const isFailed = override?.health === 'down';

      runtimeNodes[id] = {
        nodeId: id,
        status: isFailed
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
