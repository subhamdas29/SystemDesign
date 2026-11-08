/**
 * Content Delivery Network (CDN) & Edge Protection Behavior Model (Phase 8B).
 * Pure TypeScript with ZERO React, DOM, or network dependencies.
 * Evaluates edge caching offload, cache-busting bypass, and Anycast DDoS scrubbing.
 */

import { CdnConfig } from '../../types/defenses';
import { AttackScenarioId } from '../../types/attacks';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export interface CdnEvaluationResult {
  action: 'pass' | 'block' | 'edge-hit';
  reason?: 'EDGE_CACHE_HIT' | 'EDGE_DDOS_SCRUBBED' | 'CACHE_BYPASS_ORIGIN';
  edgeHandledFraction: number; // Offloaded or scrubbed at edge
  forwardToOriginFraction: number; // Leaks or passes through to origin
  addedLatencyMs: number;
}

export function evaluateCdn(
  config: CdnConfig,
  origin: 'legitimate' | 'malicious',
  attackKind?: AttackScenarioId,
  cacheable: boolean = true,
  incomingRps: number = 0
): CdnEvaluationResult {
  if (config.enabled === false) {
    return {
      action: 'pass',
      edgeHandledFraction: 0,
      forwardToOriginFraction: 1.0,
      addedLatencyMs: 0,
    };
  }

  const baseLatency = Math.max(0.1, config.processingLatencyMs);

  if (origin === 'legitimate') {
    // Static content share offloaded at edge
    const staticShare = (config.staticContentShare ?? 60) / 100;
    const hitRatio = (config.edgeHitRatio ?? 85) / 100;
    const edgeOffloadedFraction = Math.min(1.0, staticShare * hitRatio);

    return {
      action: edgeOffloadedFraction > 0.99 ? 'edge-hit' : 'pass',
      reason: 'EDGE_CACHE_HIT',
      edgeHandledFraction: edgeOffloadedFraction,
      forwardToOriginFraction: Math.max(0, 1.0 - edgeOffloadedFraction),
      addedLatencyMs: baseLatency,
    };
  }

  // Malicious traffic evaluation
  // 1. Network volumetric DDoS scrubbing
  if (attackKind === 'volumetric-flood') {
    let scrubbingCapacity = 0;
    if (config.ddosProtection === 'standard') {
      scrubbingCapacity = 20000;
    } else if (config.ddosProtection === 'advanced') {
      scrubbingCapacity = 200000;
    }

    if (scrubbingCapacity > 0) {
      const scrubbedFraction = Math.min(
        1.0,
        scrubbingCapacity / Math.max(1, incomingRps)
      );
      return {
        action: scrubbedFraction >= 1.0 ? 'block' : 'pass',
        reason: 'EDGE_DDOS_SCRUBBED',
        edgeHandledFraction: scrubbedFraction,
        forwardToOriginFraction: Math.max(0, 1.0 - scrubbedFraction),
        addedLatencyMs: baseLatency,
      };
    }
  }

  // 2. Cacheable attacks vs Uncacheable (cache-busting)
  if (!cacheable || attackKind === 'cache-busting-scraper') {
    // Uncacheable malicious traffic completely bypasses edge cache to hammer origin
    return {
      action: 'pass',
      reason: 'CACHE_BYPASS_ORIGIN',
      edgeHandledFraction: 0,
      forwardToOriginFraction: 1.0,
      addedLatencyMs: baseLatency,
    };
  }

  // 3. Cacheable malicious flood (e.g. repeated URL flood) absorbed up to edge capacity
  if (cacheable && attackKind === 'http-flood') {
    const hitRatio = (config.edgeHitRatio ?? 85) / 100;
    const edgeAbsorbedFraction = Math.min(1.0, hitRatio);
    return {
      action: edgeAbsorbedFraction > 0 ? 'block' : 'pass',
      reason: 'EDGE_CACHE_HIT',
      edgeHandledFraction: edgeAbsorbedFraction,
      forwardToOriginFraction: Math.max(0, 1.0 - edgeAbsorbedFraction),
      addedLatencyMs: baseLatency,
    };
  }

  // Default: pass unhandled to origin
  return {
    action: 'pass',
    edgeHandledFraction: 0,
    forwardToOriginFraction: 1.0,
    addedLatencyMs: baseLatency,
  };
}

export const cdnModel: ComponentBehaviorModel<CdnConfig> = {
  getEffectiveCapacityRps(config: CdnConfig): number {
    return config.edgeCapacityRps;
  },

  getServiceTimeMs(config: CdnConfig): number {
    return Math.max(0.1, config.processingLatencyMs);
  },

  getUtilization(arrivalRateRps: number, config: CdnConfig): number {
    return arrivalRateRps / Math.max(1, config.edgeCapacityRps);
  },

  decideOverflow(queueLength: number, config: CdnConfig): OverflowDecision {
    const limit = Math.max(500, Math.floor(config.edgeCapacityRps / 10));
    if (queueLength >= limit) return 'reject';
    if (queueLength > 0) return 'queue';
    return 'accept';
  },
};
