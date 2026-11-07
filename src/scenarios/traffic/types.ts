/**
 * Traffic pattern types and Zod validation schemas.
 * Pure data definitions for traffic generation and simulation modes.
 */

import { z } from 'zod';

export type TrafficPatternType = 'constant' | 'ramp' | 'spike' | 'burst';
export type SimulationMode = 'auto' | 'discrete' | 'aggregate';

export interface ConstantPatternParams {
  type: 'constant';
}

export interface RampPatternParams {
  type: 'ramp';
  startRps: number;
}

export interface SpikePatternParams {
  type: 'spike';
  baselineRps: number;
  spikeStartMs: number;
  spikeDurationMs: number;
}

export interface BurstPatternParams {
  type: 'burst';
  baselineRps: number;
  periodMs: number;
  dutyCycle: number; // 0.1 to 0.9 (fraction of period spent at peak RPS)
}

export type PatternParams =
  | ConstantPatternParams
  | RampPatternParams
  | SpikePatternParams
  | BurstPatternParams;

export interface TrafficConfig {
  peakRps: number;
  durationMs: number;
  pattern: TrafficPatternType;
  patternParams: PatternParams;
  mode: SimulationMode;
}

export const TrafficConfigSchema = z.object({
  peakRps: z
    .number({ error: 'Peak RPS must be a number' })
    .min(10, 'Peak RPS must be at least 10')
    .max(1000000, 'Peak RPS cannot exceed 1,000,000'),
  durationMs: z
    .number({ error: 'Duration must be a number' })
    .min(10000, 'Duration must be at least 10 seconds (10,000 ms)')
    .max(600000, 'Duration cannot exceed 10 minutes (600,000 ms)'),
  pattern: z.enum(['constant', 'ramp', 'spike', 'burst']),
  mode: z.enum(['auto', 'discrete', 'aggregate']),
  patternParams: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('constant'),
    }),
    z.object({
      type: z.literal('ramp'),
      startRps: z.number().min(0).max(1000000),
    }),
    z.object({
      type: z.literal('spike'),
      baselineRps: z.number().min(0).max(1000000),
      spikeStartMs: z.number().min(0),
      spikeDurationMs: z.number().min(500),
    }),
    z.object({
      type: z.literal('burst'),
      baselineRps: z.number().min(0).max(1000000),
      periodMs: z.number().min(1000).max(60000),
      dutyCycle: z.number().min(0.05).max(0.95),
    }),
  ]),
});
