/**
 * Aggregate (Fluid) Simulation Engine.
 * Fixed-tick (100ms) fluid-flow simulation supporting up to 1,000,000 RPS.
 * Zero React, DOM, Date.now(), or Math.random() imports.
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
} from '../types';
import { getComponentModel } from './components/registry';

export const AGGREGATE_TICK_MS = 100; // 100 ms per fluid tick
const MAX_SAMPLED_EVENTS = 1000;
const SAMPLED_RPS = 20; // 20 sampled requests per second for visualization

// Granular latency histogram buckets for accurate quantile calculation
const LATENCY_BUCKETS = [
  1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90,
  100, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000,
  5000, 10000,
];

interface AggregateNodeState {
  id: string;
  type: string;
  config: unknown;
  queue: number; // requests in queue
  queueLimit: number;
  active: number; // requests currently processing
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

  // Counters
  let createdCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let rejectedCount = 0;
  let timedOutCount = 0;
  let wastedWorkCount = 0;

  // Latency histogram weights
  const bucketCounts = new Float64Array(LATENCY_BUCKETS.length);
  let totalLatencySamples = 0;
  let totalLatencySum = 0;
  let minObservedLatency = Infinity;
  let maxObservedLatency = 0;

  // Event stream buffer
  let eventLog: SimulationEvent[] = [];
  const snapshotHistory: SimulationSnapshot[] = [];

  function recordLatency(latencyMs: number, count: number): void {
    if (count <= 0) return;
    totalLatencySamples += count;
    totalLatencySum += latencyMs * count;

    if (latencyMs < minObservedLatency) minObservedLatency = latencyMs;
    if (latencyMs > maxObservedLatency) maxObservedLatency = latencyMs;

    // Find bucket index (binary search or linear over 26 items)
    let idx = LATENCY_BUCKETS.length - 1;
    for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
      if (latencyMs <= LATENCY_BUCKETS[i]!) {
        idx = i;
        break;
      }
    }
    const currentBucketCount = bucketCounts[idx] ?? 0;
    bucketCounts[idx] = currentBucketCount + count;
  }

  function getLatencySummary(): LatencySummary {
    if (totalLatencySamples === 0) {
      return { averageMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0 };
    }

    const averageMs = Math.round((totalLatencySum / totalLatencySamples) * 10) / 10;
    const p50Target = totalLatencySamples * 0.5;
    const p95Target = totalLatencySamples * 0.95;
    const p99Target = totalLatencySamples * 0.99;

    const interpolateQuantile = (target: number): number => {
      let accumulated = 0;
      for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
        accumulated += bucketCounts[i]!;
        if (accumulated >= target) {
          const prevBucket = i > 0 ? LATENCY_BUCKETS[i - 1]! : 0;
          const countInBucket = bucketCounts[i]!;
          const excess = accumulated - target;
          const fraction = countInBucket > 0 ? (countInBucket - excess) / countInBucket : 0.5;
          return Math.round(prevBucket + fraction * (LATENCY_BUCKETS[i]! - prevBucket));
        }
      }
      return LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1]!;
    };

    return {
      averageMs,
      p50Ms: interpolateQuantile(p50Target),
      p95Ms: interpolateQuantile(p95Target),
      p99Ms: interpolateQuantile(p99Target),
      minMs: Math.round(minObservedLatency * 10) / 10,
      maxMs: Math.round(maxObservedLatency * 10) / 10,
    };
  }

  function emitSampledEvent(
    type: SimulationEvent['type'],
    nodeId: string,
    targetNodeId?: string,
    details?: Record<string, unknown>
  ): void {
    const event: SimulationEvent = {
      id: `agg-evt-${++eventSeq}`,
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

  // Fluid tick computation
  function advanceOneTick(): void {
    if (simTimeMs >= durationMs) {
      return;
    }

    const tickSec = AGGREGATE_TICK_MS / 1000; // 0.1s
    const currentRps = rpsAt(simTimeMs, normalizedTraffic);
    const tickInflow = currentRps * tickSec;
    createdCount += tickInflow;

    const clientCfg = clientNode ? (clientNode.config as ClientConfig) : { readRatio: 80, requestTimeoutMs: 5000 };
    const readRatio = (clientCfg.readRatio ?? 80) / 100;
    const writeRatio = Math.max(0, 1 - readRatio);
    const requestTimeoutMs = clientCfg.requestTimeoutMs ?? 5000;

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
      const isDown = (cacheCfg as { health?: string }).health === 'down';
      cacheHitRatio = isDown ? 0 : (cacheCfg.hitRatio ?? 80) / 100;
    }

    if (databaseNode) {
      const dbCfg = databaseNode.config as DatabaseConfig;
      const dbState = nodes.get(databaseNode.id)!;
      const readLatency = dbCfg.readQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 20;
      const writeLatency = dbCfg.writeQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 30;
      dbAvgLatencyMs = readRatio * readLatency + writeRatio * writeLatency;

      const poolCap = Math.floor(dbCfg.connectionPoolSize / (dbAvgLatencyMs / 1000));
      dbCapPerSec = Math.min(dbCfg.maxQueryThroughputQps, poolCap);

      // Queue wait time = queue / capacity
      dbQueueWaitMs = (dbState.queue / Math.max(1, dbCapPerSec)) * 1000;
    }

    // Downstream wait experienced by App Server
    const alphaDb = cacheNode ? writeRatio + readRatio * (1 - cacheHitRatio) : 1.0;
    const downstreamWaitMs = alphaDb * (dbAvgLatencyMs + dbQueueWaitMs) + (1 - alphaDb) * 1;

    // 4. App Server Tier with Little's Law Back-Pressure
    const appCount = Math.max(1, appServerNodes.length);
    const inflowPerApp = lbServed / appCount;
    let appTotalServed = 0;

    for (const appNode of appServerNodes) {
      const appState = nodes.get(appNode.id)!;
      const appCfg = appNode.config as AppServerConfig;

      // Little's Law: effective service time includes downstream wait
      const effectiveServiceTimeMs = appCfg.avgProcessingTimeMs + downstreamWaitMs;
      const effectiveConcurrencyCapacity =
        appCfg.maxConcurrentRequests / (effectiveServiceTimeMs / 1000);

      const standaloneModel = getComponentModel('app-server');
      const standaloneCapacity = standaloneModel.getEffectiveCapacityRps(appCfg);
      const effectiveCapacityRps = Math.floor(
        Math.min(standaloneCapacity, effectiveConcurrencyCapacity)
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

    // 6. Succeeded, Timeouts & Wasted Work Accounting
    const totalRoundTripMs = 5 + downstreamWaitMs; // 5ms network/ingress + downstream wait

    if (totalRoundTripMs > requestTimeoutMs) {
      // Saturated queues caused requests to exceed timeout limit!
      timedOutCount += appTotalServed;
      wastedWorkCount += appTotalServed;
    } else {
      const totalCompleted = cacheHits + (databaseNode ? dbServed : appTotalServed);
      succeededCount += totalCompleted;

      // Latency accounting
      const networkHopsMs = 3 + (routerNode ? 2 : 0) + (lbNode ? 2 : 0);
      const appProcMs = appServerNodes[0]
        ? (appServerNodes[0].config as AppServerConfig).avgProcessingTimeMs
        : 10;

      const cacheLatency = networkHopsMs - 1 + appProcMs + 1; // Cache hit skips DB hop
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

    // 7. Generate Sampled Requests for Animation (2 per 100ms tick when traffic is active)
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
        const dbState = nodes.get(databaseNode.id);
        if (dbState && dbState.queue >= dbState.queueLimit) {
          emitSampledEvent('REQUEST_REJECTED', databaseNode.id, undefined, {
            reason: 'DATABASE_POOL_EXHAUSTED',
          });
        } else {
          emitSampledEvent('RESPONSE_RECEIVED', sampleClient, undefined, { statusCode: 200 });
        }
      } else {
        emitSampledEvent('RESPONSE_RECEIVED', sampleClient, undefined, { statusCode: 200 });
      }
    }

    simTimeMs += AGGREGATE_TICK_MS;
  }

  function getSnapshot(): SimulationSnapshot {
    const runtimeNodes: Record<string, NodeRuntimeState> = {};
    let totalInFlight = 0;

    for (const [id, node] of nodes.entries()) {
      totalInFlight += node.queue;
      const isOverloaded = node.queue > node.queueLimit * 0.8 || node.lastTickUtilization > 0.95;
      const isWarning = node.lastTickUtilization > 0.85;

      runtimeNodes[id] = {
        nodeId: id,
        status: isOverloaded ? 'overloaded' : isWarning ? 'warning' : 'healthy',
        currentRps: node.lastTickRps,
        utilization: Math.round(node.lastTickUtilization * 100) / 100,
        queueDepth: Math.round(node.queue),
        activeConnections: Math.round(node.active),
        errorRate: node.totalServed + node.totalRejected > 0
          ? Math.round((node.totalRejected / (node.totalServed + node.totalRejected)) * 100) / 100
          : 0,
        p99LatencyMs: getLatencySummary().p99Ms,
      };
    }

    const counters: SimulationCounters = {
      created: Math.round(createdCount),
      inFlight: Math.round(totalInFlight),
      succeeded: Math.round(succeededCount),
      failed: Math.round(failedCount),
      rejected: Math.round(rejectedCount),
      timedOut: Math.round(timedOutCount),
      wastedWork: Math.round(wastedWorkCount),
    };

    const currentSnapshot: SimulationSnapshot = {
      timeMs: Math.round(simTimeMs),
      runtimeNodes,
      counters,
      latencySummary: getLatencySummary(),
      recentEvents: [...eventLog],
      eventCursor: eventSeq,
      isDone: simTimeMs >= durationMs,
      mode: 'aggregate',
      bottleneck: null,
    };

    // Calculate runtime bottleneck with hysteresis
    currentSnapshot.bottleneck = detectBottleneck(currentSnapshot, snapshotHistory);

    // Keep short snapshot history (last 5) for hysteresis
    snapshotHistory.push(currentSnapshot);
    if (snapshotHistory.length > 5) {
      snapshotHistory.shift();
    }

    return currentSnapshot;
  }

  function advanceTo(targetTimeMs: number): SimulationSnapshot {
    const target = Math.min(durationMs, Math.max(simTimeMs, targetTimeMs));
    while (simTimeMs < target) {
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
    failedCount = 0;
    rejectedCount = 0;
    timedOutCount = 0;
    wastedWorkCount = 0;
    eventLog = [];
    snapshotHistory.length = 0;

    bucketCounts.fill(0);
    totalLatencySamples = 0;
    totalLatencySum = 0;
    minObservedLatency = Infinity;
    maxObservedLatency = 0;

    for (const node of nodes.values()) {
      node.queue = 0;
      node.active = 0;
      node.totalServed = 0;
      node.totalRejected = 0;
      node.lastTickUtilization = 0;
      node.lastTickRps = 0;
    }
  }

  function seek(targetTimeMs: number): SimulationSnapshot {
    reset();
    return advanceTo(targetTimeMs);
  }

  return {
    advanceTo,
    stepNextEvent,
    reset,
    getSnapshot,
    seek,
    getAllEvents: () => [...eventLog],
  };
}
