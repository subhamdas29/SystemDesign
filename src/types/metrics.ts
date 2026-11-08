/**
 * Pure, fully-serializable metrics and run summary interfaces.
 * Decoupled from React, DOM, and runtime execution loops.
 */

import { ComponentType, GraphConfig } from './index';
import { TrafficConfig } from '../engine/protocol';
import type { DefenseEffectivenessReportData } from './defenses';

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
  retryRps?: number;
  amplificationFactor?: number;
  orphanedWorkCount?: number;
  packetLossCount?: number;
  activeFailureCount?: number;
  legitimateIncomingRps?: number;
  maliciousIncomingRps?: number;
  legitimateSuccessRate?: number; // 0 to 100%
  attackTrafficShare?: number; // 0 to 100%
  exposureEventsCount?: number;
  compromisedServersCount?: number;
  dataEgressMb?: number;

  // Phase 8B: Defenses & telemetry
  blockedMaliciousRps?: number;
  blockedLegitimateRps?: number; // False positives
  attackBlockedPercent?: number; // 0 to 100%
  activeInstancesCount?: number;
  circuitBreakerOpenCount?: number;
  quarantinedServerCount?: number;
  originOffloadPercent?: number;
  autoscalingCostDollars?: number;

  // Phase 9: Async & Data Scaling
  queueDepth?: number;
  consumerLagMs?: number;
  replicationLagMs?: number;
  staleReadsCount?: number;
  asyncJobsEnqueued?: number;
  asyncJobsProcessed?: number;
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
  attackTrafficShare?: number; // 0 to 1.0
  isCompromised?: boolean;
  isQuarantined?: boolean;
  circuitBreakerState?: 'closed' | 'open' | 'half-open';
  activeInstances?: number;
  pendingInstances?: number;
  legitimateInflowRps?: number;
  maliciousInflowRps?: number;
  capacityConsumedLegitimate?: number;
  capacityConsumedMalicious?: number;
  blockedMaliciousRps?: number;
  blockedLegitimateRps?: number;
  passedRps?: number;
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

export interface CascadeTimelineEvent {
  timeMs: number;
  type:
    | 'failure_injected'
    | 'saturation'
    | 'timeout_spike'
    | 'retry_storm'
    | 'recovery'
    | 'attack_phase'
    | 'security_exposure'
    | 'server_compromised'
    | 'defense_blocked'
    | 'circuit_state'
    | 'autoscaling'
    | 'server_quarantined'
    | 'server_restored';
  label: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
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
  totalRetries?: number;
  peakAmplificationFactor?: number;
  cascadeTimeline?: CascadeTimelineEvent[];
  firstSaturatedComponent: FirstSaturatedComponent | null;
  identifiedBottleneck: string | null;
  timeSpentDegradedMs: number;
  timeSpentCriticalMs: number;
  suggestedFixes: SuggestedFix[];

  // Phase 8A: Attacker Mode Impact & Takeaways
  isAttackRun?: boolean;
  campaignId?: string;
  campaignName?: string;
  legitimateSuccessRate?: number;
  attackTrafficShare?: number;
  totalMaliciousRequests?: number;
  maliciousReachedTarget?: number;
  exposureEvents?: number;
  compromisedServersCount?: number;
  dataEgressMb?: number;
  totalDataEgressMb?: number;
  defenderTakeaways?: string[];
  firstFailedComponent?: {
    nodeId: string;
    type: ComponentType;
    timeMs: number;
    reason: string;
  } | null;

  // Phase 8B: Defense Effectiveness Report
  defenseReport?: DefenseEffectivenessReportData;
  totalMaliciousBlocked?: number;
  totalFalsePositives?: number;
  totalAutoscalingCost?: number;
  exposureLimitedCount?: number;
  exposureFullCount?: number;
  phaseImpacts?: Array<{
    phaseId: string;
    scenarioId: string;
    scenarioName: string;
    startMs: number;
    durationMs: number;
    intensityRps: number;
    legitimateSuccessRateBefore: number;
    legitimateSuccessRateDuring: number;
    legitimateSuccessRateAfter: number;
    avgLatencyBeforeMs: number;
    avgLatencyDuringMs: number;
    avgLatencyAfterMs: number;
    defenderTakeaway: string;
  }>;
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
  type:
    | 'traffic_change'
    | 'first_rejection'
    | 'first_timeout'
    | 'bottleneck'
    | 'failure_injected'
    | 'failure_removed'
    | 'cascade_triggered'
    | 'attack_phase_started'
    | 'attack_phase_ended'
    | 'server_compromised';
  label: string;
  description: string;
}
