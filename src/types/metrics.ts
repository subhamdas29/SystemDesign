/**
 * Pure, fully-serializable metrics and run summary interfaces.
 * Decoupled from React, DOM, and runtime execution loops.
 */

import { ComponentType, GraphConfig } from './index';
import { TrafficConfig } from '../engine/protocol';

export type SystemHealthStatus = 'healthy' | 'degraded' | 'critical';
export type NodeMetricStatus = 'healthy' | 'warning' | 'overloaded' | 'failed';

export interface SystemMetricSample {
  timeMs: number;
  incomingRps: number;
  successfulRps: number;
  failedRps: number;
  rejectedRps: number;
  timedOutRps: number;
  avgLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  inFlightRequests: number;
  totalServerInstances: number;
  healthyServerCount: number;
  latencyHistogram?: number[];
}

export interface NodeMetricSample {
  nodeId: string;
  type: ComponentType;
  incomingRps: number;
  processedRps: number;
  rejectedRps: number;
  utilization: number; // 0.0 to 1.0 (or > 1.0 if overloaded)
  queueLength: number;
  queueLimit: number;
  estimatedCpuPercent: number;
  estimatedMemoryMb: number;
  status: NodeMetricStatus;
}

export interface MetricsSample {
  timeMs: number;
  system: SystemMetricSample;
  nodes: Record<string, NodeMetricSample>;
}

export interface AggregatedMetricBucket {
  timeMs: number;
  count: number;
  min: number;
  avg: number;
  max: number;
  last: number;
}

export interface SystemHealthResult {
  status: SystemHealthStatus;
  reason: string;
  details: string[];
}

export interface SuggestedFix {
  title: string;
  description: string;
  componentType: ComponentType;
}

export interface FirstSaturatedComponent {
  nodeId: string;
  type: ComponentType;
  timeMs: number;
  reason: string;
}

export interface RunSummaryData {
  totalRequests: number;
  successRatePercent: number;
  peakRpsHandled: number;
  peakRpsOffered: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  totalSucceeded: number;
  totalFailed: number;
  totalRejected: number;
  totalTimedOut: number;
  firstSaturatedComponent: FirstSaturatedComponent | null;
  identifiedBottleneck: string | null;
  timeSpentDegradedMs: number;
  timeSpentCriticalMs: number;
  suggestedFixes: SuggestedFix[];
}

export interface RunResult {
  runId: string;
  timestamp: number;
  configHash: string;
  seed: number;
  trafficConfig: TrafficConfig;
  graphConfig: GraphConfig;
  summary: RunSummaryData;
  metrics: MetricsSample[];
}

export interface ChartNotableEvent {
  timeMs: number;
  type: 'traffic_change' | 'first_rejection' | 'first_timeout' | 'bottleneck';
  label: string;
  description: string;
}
