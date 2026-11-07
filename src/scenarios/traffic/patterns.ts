/**
 * Pure functions for traffic patterns.
 * Shared by both discrete-event and aggregate simulation engines.
 */

import { TrafficConfig } from './types';

export interface TrafficSummary {
  peakRps: number;
  averageRps: number;
  totalRequests: number;
}

/**
 * Calculates instantaneous request rate (RPS) at a given point in simulated time.
 */
export function rpsAt(timeMs: number, config: TrafficConfig): number {
  if (timeMs < 0 || timeMs > config.durationMs) {
    return 0;
  }

  const { peakRps, pattern, patternParams, durationMs } = config;

  switch (pattern) {
    case 'constant':
      return peakRps;

    case 'ramp': {
      const startRps = patternParams.type === 'ramp' ? patternParams.startRps : 0;
      const progress = durationMs > 0 ? Math.min(1.0, Math.max(0.0, timeMs / durationMs)) : 1.0;
      return Math.round(startRps + (peakRps - startRps) * progress);
    }

    case 'spike': {
      if (patternParams.type !== 'spike') return peakRps;
      const { baselineRps, spikeStartMs, spikeDurationMs } = patternParams;
      if (timeMs >= spikeStartMs && timeMs < spikeStartMs + spikeDurationMs) {
        return peakRps;
      }
      return baselineRps;
    }

    case 'burst': {
      if (patternParams.type !== 'burst') return peakRps;
      const { baselineRps, periodMs, dutyCycle } = patternParams;
      if (periodMs <= 0) return peakRps;
      const timeInPeriod = timeMs % periodMs;
      const activeDuration = periodMs * dutyCycle;
      return timeInPeriod < activeDuration ? peakRps : baselineRps;
    }

    default:
      return peakRps;
  }
}

/**
 * Computes exact analytical summary statistics for a given traffic profile.
 */
export function computeTrafficSummary(config: TrafficConfig): TrafficSummary {
  const { peakRps, durationMs, pattern, patternParams } = config;
  const durationSec = durationMs / 1000;

  if (durationSec <= 0) {
    return { peakRps: 0, averageRps: 0, totalRequests: 0 };
  }

  let totalRequests = 0;

  switch (pattern) {
    case 'constant': {
      totalRequests = peakRps * durationSec;
      break;
    }

    case 'ramp': {
      const startRps = patternParams.type === 'ramp' ? patternParams.startRps : 0;
      // Trapezoidal integral: (startRps + peakRps) / 2 * durationSec
      totalRequests = ((startRps + peakRps) / 2) * durationSec;
      break;
    }

    case 'spike': {
      if (patternParams.type === 'spike') {
        const { baselineRps, spikeStartMs, spikeDurationMs } = patternParams;
        const validSpikeStart = Math.min(durationMs, Math.max(0, spikeStartMs));
        const validSpikeEnd = Math.min(durationMs, validSpikeStart + spikeDurationMs);
        const effectiveSpikeSec = Math.max(0, validSpikeEnd - validSpikeStart) / 1000;
        const baselineSec = durationSec - effectiveSpikeSec;

        totalRequests = peakRps * effectiveSpikeSec + baselineRps * baselineSec;
      } else {
        totalRequests = peakRps * durationSec;
      }
      break;
    }

    case 'burst': {
      if (patternParams.type === 'burst') {
        const { baselineRps, dutyCycle } = patternParams;
        const activeFraction = Math.max(0, Math.min(1, dutyCycle));
        const effectiveAvgRps = peakRps * activeFraction + baselineRps * (1 - activeFraction);
        totalRequests = effectiveAvgRps * durationSec;
      } else {
        totalRequests = peakRps * durationSec;
      }
      break;
    }
  }

  const roundedTotal = Math.round(totalRequests);
  const averageRps = Math.round((roundedTotal / durationSec) * 10) / 10;

  return {
    peakRps,
    averageRps,
    totalRequests: roundedTotal,
  };
}
