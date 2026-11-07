/**
 * Pure Poisson traffic generation for discrete simulation mode.
 * Generates request arrival timestamps using exact Lewis-Shedler thinning algorithm
 * for non-homogeneous Poisson processes across constant, ramp, spike, and burst patterns.
 */

import { PRNG } from './rng';
import { TrafficConfig } from './protocol';
import { rpsAt } from '../scenarios/traffic/patterns';
import { TrafficConfig as ScenarioTrafficConfig } from '../scenarios/traffic/types';

export const MAX_DISCRETE_RPS = 1000;

export interface GeneratedTraffic {
  effectiveRps: number;
  arrivalTimesMs: number[];
  warning?: string;
}

/**
 * Generates deterministic request arrival times for a given traffic configuration and PRNG.
 */
export function generatePoissonTraffic(
  config: TrafficConfig,
  rng: PRNG
): GeneratedTraffic {
  const peakRps = config.peakRps ?? config.rps ?? 100;
  let effectiveRps = Math.max(1, peakRps);
  let warning: string | undefined;

  if (effectiveRps > MAX_DISCRETE_RPS) {
    warning = `Traffic rate of ${effectiveRps.toLocaleString()} RPS exceeds discrete simulation limit (max ${MAX_DISCRETE_RPS.toLocaleString()} RPS). Discrete mode will simulate up to ${MAX_DISCRETE_RPS} RPS.`;
    effectiveRps = MAX_DISCRETE_RPS;
  }

  const normalizedTraffic: ScenarioTrafficConfig = {
    peakRps: effectiveRps,
    durationMs: config.durationMs,
    pattern: config.pattern ?? 'constant',
    patternParams: config.patternParams ?? { type: 'constant' },
    mode: config.mode ?? 'discrete',
  };

  const arrivalTimesMs: number[] = [];
  const maxLambda = effectiveRps / 1000; // Peak expected arrivals per ms
  let currentTime = 0;

  // Thinning algorithm for non-homogeneous Poisson process
  while (currentTime < config.durationMs) {
    const u1 = rng.next();
    // Inter-arrival from homogeneous Poisson process at max rate
    const interArrivalMs = -Math.log(Math.max(1e-7, 1 - u1)) / maxLambda;
    currentTime += interArrivalMs;

    if (currentTime <= config.durationMs) {
      // Instantaneous rate at this time
      const currentRate = rpsAt(currentTime, normalizedTraffic);
      const acceptanceProbability = Math.max(0, Math.min(1, currentRate / effectiveRps));

      const u2 = rng.next();
      if (u2 < acceptanceProbability) {
        arrivalTimesMs.push(Math.round(currentTime * 100) / 100);
      }
    }
  }

  return {
    effectiveRps,
    arrivalTimesMs,
    warning,
  };
}
