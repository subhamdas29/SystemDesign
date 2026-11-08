/**
 * Serializable protocol definitions for the Simulation Engine.
 * Designed to sit cleanly across a Web Worker boundary.
 */

import { GraphConfig } from '../types';
import { NodeRuntimeState, SimulationEvent } from '../types/runtime';
import { TrafficPatternType, PatternParams, SimulationMode } from '../scenarios/traffic/types';
import { RuntimeBottleneck } from './analysis/types';
import { ScenarioCommand, ActiveFailure } from '../scenarios/failures/types';
import type { WorkloadRoute } from '../types/routes';

export interface TrafficConfig {
  rps?: number;
  peakRps?: number;
  durationMs: number;
  pattern?: TrafficPatternType;
  patternParams?: PatternParams;
  mode?: SimulationMode;
  routes?: WorkloadRoute[];
}

import type { AttackCampaign } from '../types/attacks';

export interface SimulationConfig {
  graph: GraphConfig;
  traffic: TrafficConfig;
  seed: number;
  scenarioScript?: ScenarioCommand[];
  campaign?: AttackCampaign;
}

export interface ClassCounters {
  created: number;
  inFlight: number;
  succeeded: number;
  failed: number;
  rejected: number;
  timedOut: number;
  retried?: number;
}

export interface MaliciousClassCounters {
  created: number;
  inFlight: number;
  reachedTarget: number;
  rejected: number;
  dropped: number;
  timedOut: number;
}

export interface SimulationCounters {
  created: number;
  inFlight: number;
  succeeded: number;
  failed: number;
  rejected: number;
  timedOut: number;
  retried?: number;
  orphanedWork?: number;
  packetLoss?: number;
  lateResponsesDiscarded?: number;
  amplificationFactor?: number;
  wastedWork?: number;

  // Phase 8A: Multi-class telemetry
  legitimate?: ClassCounters;
  malicious?: MaliciousClassCounters;
  legitimateSuccessRate?: number; // 0 to 100%
  attackTrafficShare?: number; // 0 to 100%
  exposureEvents?: number;
  compromisedServersCount?: number;
  dataEgressMb?: number;

  // Phase 8B: Defense telemetry
  blockedMalicious?: number;
  blockedLegitimate?: number; // False positives
  defenseInspected?: Record<string, number>;
  defenseBlockedMalicious?: Record<string, number>;
  defenseBlockedLegitimate?: Record<string, number>;
  autoscalingCostDollars?: number;
  activeInstancesCount?: number;
  exposureLimitedCount?: number;
  exposureFullCount?: number;
  originOffloadPercent?: number;

  // Phase 9: Async queue, replicas, and sharding telemetry
  asyncJobsEnqueued?: number;
  asyncJobsProcessed?: number;
  asyncJobsDropped?: number;
  asyncJobsDeadLettered?: number;
  asyncJobsInFlight?: number;
  queueDepth?: number;
  consumerLagMs?: number;
  oldestJobAgeMs?: number;
  avgJobCompletionLatencyMs?: number;
  staleReadsCount?: number;
  staleReadRate?: number;
  replicationLagMs?: number;
  failoverState?: 'normal' | 'detecting' | 'promoting' | 'promoted';
  shardLoads?: number[];
  hotShardLoadPercent?: number;
}

export interface LatencySummary {
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

export interface SimulationSnapshot {
  timeMs: number;
  runtimeNodes: Record<string, NodeRuntimeState>;
  counters: SimulationCounters;
  latencySummary: LatencySummary;
  recentEvents: SimulationEvent[];
  eventCursor: number;
  isDone: boolean;
  mode?: 'discrete' | 'aggregate';
  bottleneck?: RuntimeBottleneck | null;
  activeFailures?: ActiveFailure[];
  amplificationFactor?: number;
}

// Commands from UI -> Engine
export type EngineCommand =
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STEP' }
  | { type: 'RESET' }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'SEEK'; timeMs: number }
  | { type: 'ADVANCE'; timeMs: number };

// Responses from Engine -> UI
export type EngineMessage =
  | { type: 'SNAPSHOT'; snapshot: SimulationSnapshot }
  | { type: 'EVENTS'; events: SimulationEvent[] }
  | { type: 'DONE' };

// --- Phase 10: Full Web Worker Communication Protocol ---

export interface CompactEventData {
  id: string;
  t: number;
  type: string;
  req: string;
  src: string;
  tgt?: string;
  extra?: Record<string, unknown>;
}

export interface CompactMetricsPayload {
  timeMs: number;
  buffer: ArrayBuffer; // Transferable binary metric series
  byteLength: number;
}

export type WorkerCommand =
  | { type: 'INIT'; runId: string; config: SimulationConfig }
  | { type: 'START'; runId: string }
  | { type: 'PAUSE'; runId: string }
  | { type: 'RESUME'; runId: string }
  | { type: 'STEP'; runId: string }
  | { type: 'RESET'; runId: string; graph?: GraphConfig }
  | { type: 'SET_SPEED'; runId: string; speed: number }
  | { type: 'SEEK'; runId: string; timeMs: number; graph?: GraphConfig }
  | { type: 'ADVANCE'; runId: string; timeMs: number }
  | { type: 'SET_LOOKAHEAD'; runId: string; lookaheadMs: number }
  | { type: 'INJECT_FAILURE'; runId: string; command: ScenarioCommand }
  | { type: 'REMOVE_FAILURE'; runId: string; targetId: string; failureType: string }
  | { type: 'SET_TRAFFIC'; runId: string; traffic: TrafficConfig }
  | { type: 'SET_CAMPAIGN'; runId: string; campaign?: AttackCampaign }
  | { type: 'SET_DEFENSES'; runId: string; defenses?: unknown }
  | { type: 'REQUEST_SNAPSHOT'; runId: string }
  | { type: 'DISPOSE'; runId: string };

export type WorkerResponse =
  | { type: 'READY'; runId: string }
  | { type: 'SNAPSHOT'; runId: string; snapshot: SimulationSnapshot }
  | { type: 'EVENT_BATCH'; runId: string; events: SimulationEvent[]; cursor: number }
  | { type: 'METRICS_SAMPLE'; runId: string; sample: unknown }
  | { type: 'DONE'; runId: string; snapshot: SimulationSnapshot }
  | { type: 'ERROR'; runId: string; error: string };

