/**
 * Pure behavior model for DNS Resolver.
 * Handles TTL and recursive cache hit/miss resolution.
 */

import { DnsConfig } from '../../types';
import { ComponentBehaviorModel, OverflowDecision } from './types';
import { PRNG } from '../rng';

export function decideDnsHit(config: DnsConfig, rng: PRNG): boolean {
  const ratio = Math.max(0, Math.min(100, config.cacheHitRatio)) / 100;
  return rng.next() < ratio;
}

export const dnsModel: ComponentBehaviorModel<DnsConfig> = {
  getEffectiveCapacityRps() {
    return 100000;
  },

  getServiceTimeMs(config, _context, rng) {
    const isHit = decideDnsHit(config, rng);
    return isHit ? 1 : config.lookupLatencyMs;
  },

  getUtilization(arrivalRateRps) {
    return Math.max(0, arrivalRateRps / 100000);
  },

  decideOverflow(queueLength): OverflowDecision {
    return queueLength > 10000 ? 'reject' : queueLength === 0 ? 'accept' : 'queue';
  },
};
