/**
 * Discrete-Event Simulation Engine Core.
 * Pure TypeScript with ZERO React, DOM, time, or Math.random() imports.
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
import { createPRNG } from './rng';
import { selectBackend } from './components/loadBalancerModel';
import { decideHit } from './components/cacheModel';
import { acquireConnection } from './components/databaseModel';
import { decideDnsHit } from './components/dnsModel';
import { getComponentModel } from './components/registry';
import { ClientConfig, CacheConfig, DatabaseConfig, LoadBalancerConfig } from '../types';
import { detectBottleneck } from './analysis/bottleneckDetector';
import { createAggregateSimulation } from './aggregateSimulation';

export const MAX_EVENT_BUFFER = 50000;

interface InternalRequest {
  id: string;
  createdAtMs: number;
  kind: 'read' | 'write';
  status: 'created' | 'in-transit' | 'queued' | 'processing' | 'succeeded' | 'failed' | 'rejected' | 'timed-out';
  statusCode: number;
  path: string[];
  currentHopIndex: number;
  activeNodeId?: string;
}

type InternalEventType =
  | 'REQUEST_ARRIVAL'
  | 'DNS_RESOLVED'
  | 'ENTER_NODE'
  | 'PROCESSING_COMPLETED'
  | 'DB_QUERY_COMPLETED'
  | 'RESPONSE_HOP';

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
}

export function createDiscreteSimulation(config: SimulationConfig): Simulation {
  let simTimeMs = 0;
  let eventSeq = 0;
  let requestIdCounter = 1;

  // Snapshot history for hysteresis bottleneck detection
  const snapshotHistory: SimulationSnapshot[] = [];

  // Master PRNG and traffic generation
  const masterRng = createPRNG(config.seed);
  const trafficRng = createPRNG(masterRng.nextInt(1, 0x7fffffff));

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
  };

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

  // Populate initial traffic arrivals
  function initTraffic(): void {
    const traffic = generatePoissonTraffic(config.traffic, trafficRng);
    for (const arrivalTime of traffic.arrivalTimesMs) {
      const reqId = `req-${requestIdCounter++}`;
      scheduleInternal(arrivalTime, {
        type: 'REQUEST_ARRIVAL',
        requestId: reqId,
      });
    }
  }

  initTraffic();

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
      const util = cap > 0 ? Math.min(1.0, node.busySlots / cap) : 1.0;

      const nodeHealth = (node.config as { health?: string }).health;

      runtimeNodes[id] = {
        ...node.state,
        queueDepth: node.queue.length,
        activeConnections: node.busySlots,
        utilization: Math.round(util * 100) / 100,
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
    };

    currentSnapshot.bottleneck = detectBottleneck(currentSnapshot, snapshotHistory);
    snapshotHistory.push(currentSnapshot);
    if (snapshotHistory.length > 5) {
      snapshotHistory.shift();
    }

    return currentSnapshot;
  }

  function handleTimeout(req: InternalRequest, now: number): boolean {
    const clientCfg = getClientConfig();
    const elapsed = now - req.createdAtMs;

    if (elapsed > clientCfg.requestTimeoutMs && req.status !== 'timed-out' && req.status !== 'succeeded') {
      req.status = 'timed-out';
      req.statusCode = 504;
      counters.timedOut++;
      counters.inFlight = Math.max(0, counters.inFlight - 1);

      // Free busy slots if request was active
      if (req.activeNodeId) {
        const activeNode = topology.nodes.get(req.activeNodeId);
        if (activeNode) {
          activeNode.busySlots = Math.max(0, activeNode.busySlots - 1);
        }
      }

      emitEvent('REQUEST_TIMED_OUT', req.id, req.path[req.path.length - 1] || 'client', undefined, {
        elapsedMs: Math.round(elapsed),
        timeoutLimitMs: clientCfg.requestTimeoutMs,
      });
      return true;
    }
    return false;
  }

  function processEvent(item: ScheduledEventItem<InternalEventData>): void {
    simTimeMs = item.timeMs;
    const { type, requestId, nodeId } = item.data;

    let req = requests.get(requestId);

    // 1. New Request Arrival
    if (type === 'REQUEST_ARRIVAL') {
      counters.created++;
      counters.inFlight++;

      const clientCfg = getClientConfig();
      const kind: 'read' | 'write' =
        topology.clientNode.rng.next() < clientCfg.readRatio / 100 ? 'read' : 'write';

      req = {
        id: requestId,
        createdAtMs: simTimeMs,
        kind,
        status: 'created',
        statusCode: 200,
        path: [topology.clientNode.id],
        currentHopIndex: 0,
      };
      requests.set(requestId, req);

      emitEvent('REQUEST_CREATED', req.id, topology.clientNode.id, undefined, {
        kind: req.kind,
      });

      // DNS Lookup if present
      if (topology.dnsNode) {
        const dnsCfg = topology.dnsNode.config as unknown as { lookupLatencyMs: number };
        const isHit = decideDnsHit(topology.dnsNode.config as never, topology.dnsNode.rng);
        const dnsLatency = isHit ? 1 : dnsCfg.lookupLatencyMs;

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

    if (!req) return;
    if (handleTimeout(req, simTimeMs)) return;

    // 2. DNS Resolved -> Enter First Forwarding Node
    if (type === 'DNS_RESOLVED') {
      const firstTier = topology.forwardingChain[0];
      if (!firstTier || firstTier.length === 0) {
        // No forwarding tier found (client only)
        req.status = 'failed';
        req.statusCode = 502;
        counters.failed++;
        counters.inFlight = Math.max(0, counters.inFlight - 1);
        emitEvent('REQUEST_FAILED', req.id, topology.clientNode.id, undefined, {
          reason: 'NO_DOWNSTREAM_DESTINATION',
        });
        return;
      }

      // Enter first node with 1ms edge network latency
      const targetNodeId = firstTier[0]!;
      req.status = 'in-transit';
      scheduleInternal(simTimeMs + 1, {
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

      // Check for Load Balancer routing
      if (node.type === 'load-balancer') {
        const lbCfg = node.config as LoadBalancerConfig;
        const candidateBackends = topology.appServerNodes.map((n) => n.id);

        const backendStates: Record<string, { id: string; health?: 'healthy' | 'degraded' | 'down'; activeConnections?: number }> = {};
        for (const appNode of topology.appServerNodes) {
          backendStates[appNode.id] = {
            id: appNode.id,
            health: (appNode.config as { health?: 'healthy' | 'degraded' | 'down' }).health ?? 'healthy',
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
          // No healthy backends
          req.status = 'failed';
          req.statusCode = 503;
          counters.failed++;
          counters.inFlight = Math.max(0, counters.inFlight - 1);
          emitEvent('REQUEST_FAILED', req.id, nodeId, undefined, {
            reason: 'NO_HEALTHY_BACKEND',
          });
          return;
        }

        emitEvent('LOAD_BALANCED', req.id, nodeId, selectedBackend, {
          algorithm: lbCfg.algorithm,
        });

        // Forward to selected App Server with 1ms network hop
        scheduleInternal(simTimeMs + 1, {
          type: 'ENTER_NODE',
          requestId: req.id,
          nodeId: selectedBackend,
        });
        return;
      }

      // Standard Node Processing / Queuing
      if (node.busySlots < node.concurrencyLimit) {
        node.busySlots++;
        req.status = 'processing';
        req.activeNodeId = nodeId;
        emitEvent('REQUEST_PROCESSING_STARTED', req.id, nodeId);

        const model = getComponentModel(node.type);
        const meanServiceTime = model.getServiceTimeMs(node.config, undefined, node.rng);
        // Log-normal service time variance (sigma = 0.25, clamped)
        const variance = Math.exp((node.rng.next() - 0.5) * 0.35);
        const serviceTimeMs = Math.max(1, Math.round(meanServiceTime * variance));

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
          const variance = Math.exp((node.rng.next() - 0.5) * 0.35);
          const serviceTimeMs = Math.max(1, Math.round(meanServiceTime * variance));

          scheduleInternal(simTimeMs + serviceTimeMs, {
            type: 'PROCESSING_COMPLETED',
            requestId: nextReq.id,
            nodeId,
          });
        }
      }

      // App Server: determine Cache or Database flow
      if (node.type === 'app-server') {
        const cache = topology.cacheNode;
        const db = topology.databaseNode;

        // Read request checks Cache first if cache is present
        if (req.kind === 'read' && cache) {
          const cacheHealth = (cache.config as { health?: string }).health;
          const isHit = decideHit(cache.config as CacheConfig, cache.rng, cacheHealth === 'down');
          if (isHit) {
            emitEvent('CACHE_HIT', req.id, cache.id);
            // Cache HIT: return response immediately without querying DB
            scheduleInternal(simTimeMs + 1, {
              type: 'RESPONSE_HOP',
              requestId: req.id,
            });
            return;
          } else {
            emitEvent('CACHE_MISS', req.id, cache.id);
          }
        }

        // Write request or Cache Miss queries Database
        if (db) {
          emitEvent('DATABASE_QUERY', req.id, db.id, undefined, {
            isWrite: req.kind === 'write',
          });

          // Check DB connection pool
          const dbPoolAcq = acquireConnection(
            db.busySlots,
            db.concurrencyLimit,
            db.queue.length,
            db.queueLimit
          );

          if (dbPoolAcq === 'acquired') {
            db.busySlots++;
            emitEvent('REQUEST_PROCESSING_STARTED', req.id, db.id);

            const dbCfg = db.config as DatabaseConfig;
            const meanLatency =
              req.kind === 'write' ? dbCfg.writeQueryLatencyMs : dbCfg.readQueryLatencyMs;
            const variance = Math.exp((db.rng.next() - 0.5) * 0.25);
            const dbLatency = Math.max(1, Math.round(meanLatency * variance));

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
            // DB Pool Exhausted -> Reject
            req.status = 'rejected';
            req.statusCode = 503;
            counters.rejected++;
            counters.inFlight = Math.max(0, counters.inFlight - 1);
            emitEvent('REQUEST_REJECTED', req.id, db.id, undefined, {
              reason: 'DATABASE_POOL_EXHAUSTED',
            });
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
          scheduleInternal(simTimeMs + 1, {
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

        // Next queued query in DB
        if (db.queue.length > 0) {
          const nextReqId = db.queue.shift()!;
          const nextReq = requests.get(nextReqId);
          if (nextReq) {
            db.busySlots++;
            emitEvent('REQUEST_PROCESSING_STARTED', nextReq.id, db.id);

            const dbCfg = db.config as DatabaseConfig;
            const meanLatency =
              nextReq.kind === 'write' ? dbCfg.writeQueryLatencyMs : dbCfg.readQueryLatencyMs;
            const variance = Math.exp((db.rng.next() - 0.5) * 0.25);
            const dbLatency = Math.max(1, Math.round(meanLatency * variance));

            scheduleInternal(simTimeMs + dbLatency, {
              type: 'DB_QUERY_COMPLETED',
              requestId: nextReq.id,
            });
          }
        }
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
      if (req.path.length > 1) {
        const currentNode = req.path.pop()!;
        const previousNode = req.path[req.path.length - 1]!;

        emitEvent('RESPONSE_FORWARDED', req.id, currentNode, previousNode);

        // 1ms edge network latency per return hop
        scheduleInternal(simTimeMs + 1, {
          type: 'RESPONSE_HOP',
          requestId: req.id,
        });
      } else {
        // Response reached Client!
        const totalLatencyMs = Math.round((simTimeMs - req.createdAtMs) * 10) / 10;
        latencies.push(totalLatencyMs);

        req.status = 'succeeded';
        req.statusCode = 200;
        counters.succeeded++;
        counters.inFlight = Math.max(0, counters.inFlight - 1);

        emitEvent('RESPONSE_RECEIVED', req.id, topology.clientNode.id, undefined, {
          statusCode: 200,
          totalLatencyMs,
        });
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
    snapshotHistory.length = 0;

    topology = buildTopology(config.graph, config.seed);
    const freshTrafficRng = createPRNG(createPRNG(config.seed).nextInt(1, 0x7fffffff));
    const traffic = generatePoissonTraffic(config.traffic, freshTrafficRng);

    for (const arrivalTime of traffic.arrivalTimesMs) {
      const reqId = `req-${requestIdCounter++}`;
      scheduleInternal(arrivalTime, {
        type: 'REQUEST_ARRIVAL',
        requestId: reqId,
      });
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

/**
 * Hybrid Simulation Router.
 * Automatically chooses between discrete-event simulation and high-performance aggregate fluid simulation.
 */
export function createSimulation(config: SimulationConfig): Simulation {
  const peakRps = config.traffic.peakRps ?? config.traffic.rps ?? 100;
  const mode = config.traffic.mode ?? 'auto';

  if (mode === 'aggregate') {
    return createAggregateSimulation(config);
  }

  if (mode === 'discrete') {
    return createDiscreteSimulation(config);
  }

  // 'auto' mode: discrete up to 1,000 RPS, aggregate above 1,000 RPS
  if (peakRps > 1000) {
    return createAggregateSimulation(config);
  }

  return createDiscreteSimulation(config);
}
