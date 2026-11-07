/**
 * Chaos Engineering & Failure Injection Types.
 * Data-driven failure definitions, parameters, and deterministic scenario scripting.
 */

export type FailureType =
  | 'app-server-crash'
  | 'app-server-degraded'
  | 'app-server-slow'
  | 'db-slow'
  | 'db-overload'
  | 'db-pool-exhaustion'
  | 'cache-failure'
  | 'cache-flush'
  | 'edge-latency-spike'
  | 'edge-packet-loss'
  | 'traffic-spike';

export interface FailureDefinition {
  type: FailureType;
  label: string;
  category: 'compute' | 'storage' | 'network' | 'traffic';
  targetKind: 'node' | 'edge' | 'system';
  targetComponentTypes?: string[];
  description: string;
  defaultSeverity: number;
  severityLabel: string;
  severityUnit?: string;
  defaultDurationMs?: number;
}

export interface ScenarioCommand {
  id?: string;
  t: number; // Simulated timestamp in ms when action executes
  action: 'inject' | 'remove';
  failureType: FailureType;
  targetId: string; // Target node ID, edge ID, or 'system'
  durationMs?: number; // Optional duration before auto-removal
  params?: Record<string, unknown>;
}

export interface ActiveFailure {
  id: string;
  failureType: FailureType;
  targetId: string;
  startTimeMs: number;
  durationMs?: number;
  endTimeMs?: number;
  params?: Record<string, unknown>;
  description: string;
}
