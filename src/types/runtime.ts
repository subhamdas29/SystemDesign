/**
 * Runtime state interfaces for the simulation engine.
 * STRICT SEPARATION: GraphConfig (user design) is never mixed with runtime state.
 * These interfaces are purely serializable and ready for a Web Worker boundary.
 */

import { ComponentHealth } from './components';

export type NodeHealthStatus = 'healthy' | 'warning' | 'overloaded' | 'failed';

export interface NodeRuntimeState {
  nodeId: string;
  status: NodeHealthStatus;
  health?: ComponentHealth;
  currentRps: number;
  utilization: number; // 0.0 to 1.0 (or > 1.0 if overloaded)
  queueDepth: number;
  activeConnections: number;
  errorRate: number; // 0.0 to 1.0
  p99LatencyMs: number;
  retryRate?: number;
  amplificationFactor?: number;
  orphanedWorkCount?: number;
  healthCheckState?: 'healthy' | 'probing' | 'unhealthy';
  attackTrafficShare?: number; // 0 to 1.0 (share of inflow that is malicious)
  legitimateInflowRps?: number;
  maliciousInflowRps?: number;
  isCompromised?: boolean;
  isQuarantined?: boolean;
  circuitBreakerState?: 'closed' | 'open' | 'half-open';
  activeInstances?: number;
  pendingInstances?: number;
  wafActiveRulesetsCount?: number;
  blockedMaliciousRps?: number;
  blockedLegitimateRps?: number; // False positives
  passedRps?: number;
}

export type SimulationEventType =
  | 'REQUEST_CREATED'
  | 'DNS_LOOKUP'
  | 'REQUEST_RECEIVED'
  | 'REQUEST_QUEUED'
  | 'REQUEST_PROCESSING_STARTED'
  | 'LOAD_BALANCED'
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'DATABASE_QUERY'
  | 'RESPONSE_FORWARDED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_FAILED'
  | 'REQUEST_TIMED_OUT'
  | 'REQUEST_RETRIED'
  | 'REQUEST_BLOCKED'
  | 'PACKET_LOST'
  | 'ORPHANED_WORK_DISCARDED'
  | 'LATE_RESPONSE_DISCARDED'
  | 'FAILURE_INJECTED'
  | 'FAILURE_REMOVED'
  | 'HEALTH_CHECK_FAILED'
  | 'HEALTH_CHECK_RECOVERED'
  | 'RESPONSE_RECEIVED'
  | 'ATTACK_PHASE_STARTED'
  | 'ATTACK_PHASE_ENDED'
  | 'EXPOSURE_EVENT'
  | 'SERVER_COMPROMISED'
  | 'DATA_EXFILTRATED'
  | 'CIRCUIT_OPENED'
  | 'CIRCUIT_HALF_OPEN'
  | 'CIRCUIT_CLOSED'
  | 'SCALE_OUT_REQUESTED'
  | 'SCALE_OUT_COMPLETED'
  | 'SCALE_IN'
  | 'SERVER_QUARANTINED'
  | 'SERVER_RESTORED'
  | 'ASYNC_JOB_ENQUEUED'
  | 'ASYNC_JOB_PROCESSED'
  | 'ASYNC_JOB_DROPPED'
  | 'ASYNC_JOB_DEAD_LETTERED'
  | 'STALE_READ_SERVED'
  | 'FAILOVER_PROMOTED'
  | 'HOT_SHARD_SATURATED';

export interface SimulationEvent {
  id: string;
  timestamp: number;
  type: SimulationEventType;
  requestId: string;
  nodeId: string;
  targetNodeId?: string;
  failureType?: string;
  details?: Record<string, unknown>;
}

export interface RequestState {
  id: string;
  sourceNodeId: string;
  currentNodeId: string;
  path: string[];
  status: 'in-flight' | 'completed' | 'failed' | 'dropped';
  startTimeMs: number;
  endTimeMs?: number;
  isAttack?: boolean;
}

export interface SystemMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  droppedRequests: number;
  currentThroughputRps: number;
  averageLatencyMs: number;
  p99LatencyMs: number;
}
