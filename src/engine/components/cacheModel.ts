/**
 * Pure behavior model for In-Memory Cache.
 * Implements seeded hit/miss resolution and latency accounting.
 */

import { CacheConfig } from '../../types';
import { ComponentBehaviorModel } from './types';
import { PRNG } from '../rng';

/**
 * Decides whether a cache read is a HIT or a MISS.
 * When isDown is true, effective hit ratio is 0%.
 */
export function decideHit(config: CacheConfig, rng: PRNG, isDown = false): boolean {
  if (isDown) {
    return false;
  }
  const normalizedHitRatio = Math.max(0, Math.min(100, config.hitRatio)) / 100;
  return rng.next() < normalizedHitRatio;
}

export const cacheModel: ComponentBehaviorModel<CacheConfig> = {
  getEffectiveCapacityRps(config) {
    // Memory cache throughput is bounded by lookup latency and memory bus bandwidth
    const operationsPerThread = 1000 / Math.max(0.1, config.lookupLatencyMs);
    return Math.round(operationsPerThread * 50); // Assumes ~50 concurrent memory worker threads
  },

  getServiceTimeMs(config) {
    return config.lookupLatencyMs;
  },

  getUtilization(arrivalRateRps, config) {
    const capacity = cacheModel.getEffectiveCapacityRps(config);
    return capacity <= 0 ? 1.0 : Math.max(0, arrivalRateRps / capacity);
  },

  decideOverflow(queueLength) {
    // In-memory caches handle requests synchronously without deep queues
    return queueLength > 1000 ? 'reject' : queueLength === 0 ? 'accept' : 'queue';
  },
};
