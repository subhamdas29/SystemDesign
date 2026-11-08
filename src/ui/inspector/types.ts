/**
 * Type definitions for Component Inspection Live View Model.
 * Strongly-typed metrics and sparkline time-series.
 */

import { ComponentType } from '../../types';
import { NodeHealthStatus } from '../../types/runtime';

export interface MetricSparklinePoint {
  timeMs: number;
  value: number;
}

export interface BackendShareInfo {
  id: string;
  label: string;
  activeConnections: number;
  sharePercent: number;
  health: 'healthy' | 'degraded' | 'down';
}

export interface NodeLiveMetrics {
  nodeId: string;
  type: ComponentType;
  label: string;
  status: NodeHealthStatus;
  statusReason: string;
  utilizationPercent: number;
  currentRps: number;

  appServer?: {
    incomingRps: number;
    processedRps: number;
    rejectedRps: number;
    activeRequests: number;
    queueDepth: number;
    queueLimit: number;
    estimatedCpuPercent: number;
    estimatedMemoryMb: number;
    failureCount: number;
  };

  loadBalancer?: {
    algorithm: string;
    incomingRps: number;
    backends: BackendShareInfo[];
  };

  cache?: {
    hits: number;
    misses: number;
    observedHitRatio: number;
    configuredHitRatio: number;
    opsPerSec: number;
    estimatedMemoryPercent: number;
  };

  database?: {
    queryRateQps: number;
    readRateQps: number;
    writeRateQps: number;
    activeConnections: number;
    poolSize: number;
    waitingQueries: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    perShardLoad?: Array<{ shardIndex: number; loadPercent: number; queryCount: number }>;
    primaryReadSharePercent?: number;
    replicaReadSharePercent?: number;
    failoverState?: 'normal' | 'detecting' | 'promoting' | 'promoted';
  };

  apiGateway?: {
    incomingRps: number;
    passedRps: number;
    authCacheHits: number;
    auth401Count: number;
    rateLimit429Count: number;
    responseCacheHits: number;
    perRouteRates: Array<{ routeId: string; rateRps: number; limitRps?: number }>;
  };

  messageQueue?: {
    queueDepth: number;
    maxQueueDepth: number;
    oldestAgeMs: number;
    enqueueRateRps: number;
    drainRateRps: number;
    droppedJobs: number;
    overflowBehavior: 'reject' | 'drop-oldest';
  };

  worker?: {
    instances: number;
    concurrency: number;
    activeJobs: number;
    processedJobs: number;
    retriesCount: number;
    deadLetterCount: number;
  };

  databaseReplica?: {
    queryRateQps: number;
    replicationLagMs: number;
    stalenessThresholdMs: number;
    staleReadRate: number;
    isStale: boolean;
  };

  generic?: {
    metric1Label: string;
    metric1Value: string | number;
    metric2Label: string;
    metric2Value: string | number;
  };

  sparkline1: {
    label: string;
    points: MetricSparklinePoint[];
    currentValue: number;
    unit: string;
  };

  sparkline2: {
    label: string;
    points: MetricSparklinePoint[];
    currentValue: number;
    unit: string;
  };
}
