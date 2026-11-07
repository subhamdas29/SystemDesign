/**
 * Serializable protocol definitions for the Simulation Engine.
 * Designed to sit cleanly across a Web Worker boundary.
 */

import { GraphConfig } from '../types';
import { NodeRuntimeState, SimulationEvent } from '../types/runtime';
import { TrafficPatternType, PatternParams, SimulationMode } from '../scenarios/traffic/types';
import { RuntimeBottleneck } from './analysis/types';
import { ScenarioCommand, ActiveFailure } from '../scenarios/failures/types';

export interface TrafficConfig {
  rps?: number;
  peakRps?: number;
  durationMs: number;
  pattern?: TrafficPatternType;
  patternParams?: PatternParams;
  mode?: SimulationMode;
}

export interface SimulationConfig {
  graph: GraphConfig;
  traffic: TrafficConfig;
  seed: number;
  scenarioScript?: ScenarioCommand[];
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
