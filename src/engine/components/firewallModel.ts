/**
 * Network Firewall Behavior Model (Phase 8B).
 * Pure TypeScript with ZERO React or DOM dependencies.
 * Inspects IPs, ports, and protocols at network layer with detection lag and learning curve.
 */

import { FirewallConfig } from '../../types/defenses';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export interface FirewallInspectionResult {
  action: 'pass' | 'block';
  reason?: 'IP_BLOCKLISTED' | 'FALSE_POSITIVE' | 'OVERLOAD';
  blockedFraction: number;
}

export function evaluateFirewall(
  config: FirewallConfig,
  origin: 'legitimate' | 'malicious',
  elapsedPhaseMs: number,
  sourceCount: number
): FirewallInspectionResult {
  if (config.enabled === false) {
    return { action: 'pass', blockedFraction: 0 };
  }

  if (origin === 'malicious') {
    if (elapsedPhaseMs < config.detectionLagMs) {
      return { action: 'pass', blockedFraction: 0 };
    }

    const elapsedAfterLagSec = Math.max(0, (elapsedPhaseMs - config.detectionLagMs) / 1000);
    const knownSources = Math.min(
      sourceCount,
      config.learnRatePerSec * elapsedAfterLagSec
    );

    const coverageRatio = Math.min(1.0, config.maxBlocklistCoverage / Math.max(1, sourceCount));
    const blockedFraction = Math.min(1.0, (knownSources / Math.max(1, sourceCount)) * coverageRatio);

    if (blockedFraction > 0) {
      return {
        action: 'block',
        reason: 'IP_BLOCKLISTED',
        blockedFraction,
      };
    }

    return { action: 'pass', blockedFraction: 0 };
  }

  // Legitimate traffic false-positive evaluation
  const fpRate = config.falsePositiveRate ?? 0;
  if (fpRate > 0) {
    return {
      action: 'block',
      reason: 'FALSE_POSITIVE',
      blockedFraction: fpRate,
    };
  }

  return { action: 'pass', blockedFraction: 0 };
}

export const firewallModel: ComponentBehaviorModel<FirewallConfig> = {
  getEffectiveCapacityRps(config: FirewallConfig): number {
    return config.capacityRps;
  },

  getServiceTimeMs(config: FirewallConfig): number {
    return Math.max(0.1, config.processingLatencyMs);
  },

  getUtilization(arrivalRateRps: number, config: FirewallConfig): number {
    return arrivalRateRps / Math.max(1, config.capacityRps);
  },

  decideOverflow(queueLength: number, config: FirewallConfig): OverflowDecision {
    const limit = Math.max(100, Math.floor(config.capacityRps / 10));
    if (queueLength >= limit) return 'reject';
    if (queueLength > 0) return 'queue';
    return 'accept';
  },
};
