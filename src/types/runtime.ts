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
  | 'RESPONSE_RECEIVED';

export interface SimulationEvent {
  id: string;
  timestamp: number;
  type: SimulationEventType;
  requestId: string;
  nodeId: string;
  targetNodeId?: string;
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
