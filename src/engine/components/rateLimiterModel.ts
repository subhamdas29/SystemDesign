/**
 * Rate Limiter Behavior Model (Phase 8B).
 * Pure TypeScript with ZERO React, DOM, or network dependencies.
 * Evaluates per-source vs global rate limiting, sliding window/token bucket, and 429/delay policies.
 */

import { RateLimiterConfig } from '../../types/defenses';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export interface RateLimiterInspectionResult {
  action: 'pass' | 'block' | 'delay';
  reason?: 'RATE_LIMITED' | 'GLOBAL_RATE_LIMITED' | 'RATE_LIMITED_DELAYED';
  blockedFraction: number;
  addedLatencyMs: number;
}

export function evaluateRateLimiter(
  config: RateLimiterConfig,
  classRateRps: number,
  sourceCount: number,
  totalArrivalRateRps: number = classRateRps
): RateLimiterInspectionResult {
  if (config.enabled === false) {
    return { action: 'pass', blockedFraction: 0, addedLatencyMs: 0 };
  }

  const baseLatency = Math.max(0.1, config.processingLatencyMs);

  if (config.scope === 'per-source') {
    const safeSources = Math.max(1, sourceCount);
    const ratePerSource = classRateRps / safeSources;

    // Token-bucket can temporarily burst up to config.burst
    const effectiveLimit = config.algorithm === 'token-bucket'
      ? Math.max(config.limitRps, config.burst)
      : config.limitRps;

    if (ratePerSource > effectiveLimit) {
      if (config.onExceed === 'delay') {
        const addedDelay = Math.min(
          2000,
          1000 * ((ratePerSource - effectiveLimit) / effectiveLimit)
        );
        return {
          action: 'delay',
          reason: 'RATE_LIMITED_DELAYED',
          blockedFraction: 0,
          addedLatencyMs: baseLatency + addedDelay,
        };
      }

      // 'reject-429'
      const blockedFraction = (ratePerSource - effectiveLimit) / ratePerSource;
      return {
        action: 'block',
        reason: 'RATE_LIMITED',
        blockedFraction: Math.min(1.0, Math.max(0, blockedFraction)),
        addedLatencyMs: baseLatency,
      };
    }

    return { action: 'pass', blockedFraction: 0, addedLatencyMs: baseLatency };
  }

  // Global Scope: limits across all sources combined
  const effectiveLimit = config.algorithm === 'token-bucket'
    ? Math.max(config.limitRps, config.burst)
    : config.limitRps;

  if (totalArrivalRateRps > effectiveLimit) {
    if (config.onExceed === 'delay') {
      const addedDelay = Math.min(
        2000,
        1000 * ((totalArrivalRateRps - effectiveLimit) / effectiveLimit)
      );
      return {
        action: 'delay',
        reason: 'RATE_LIMITED_DELAYED',
        blockedFraction: 0,
        addedLatencyMs: baseLatency + addedDelay,
      };
    }

    const blockedFraction = (totalArrivalRateRps - effectiveLimit) / totalArrivalRateRps;
    return {
      action: 'block',
      reason: 'GLOBAL_RATE_LIMITED',
      blockedFraction: Math.min(1.0, Math.max(0, blockedFraction)),
      addedLatencyMs: baseLatency,
    };
  }

  return { action: 'pass', blockedFraction: 0, addedLatencyMs: baseLatency };
}

export const rateLimiterModel: ComponentBehaviorModel<RateLimiterConfig> = {
  getEffectiveCapacityRps(config: RateLimiterConfig): number {
    return config.capacityRps;
  },

  getServiceTimeMs(config: RateLimiterConfig): number {
    return Math.max(0.1, config.processingLatencyMs);
  },

  getUtilization(arrivalRateRps: number, config: RateLimiterConfig): number {
    return arrivalRateRps / Math.max(1, config.capacityRps);
  },

  decideOverflow(queueLength: number, config: RateLimiterConfig): OverflowDecision {
    const limit = Math.max(100, Math.floor(config.capacityRps / 10));
    if (queueLength >= limit) return 'reject';
    if (queueLength > 0) return 'queue';
    return 'accept';
  },
};
