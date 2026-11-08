/**
 * Web Application Firewall (WAF) Behavior Model (Phase 8B).
 * Pure TypeScript with ZERO React, DOM, or network dependencies.
 * Evaluates application-layer signatures, sensitivity curves, and fail-mode overload.
 */

import { WafConfig } from '../../types/defenses';
import { AttackScenarioId } from '../../types/attacks';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export interface WafInspectionResult {
  action: 'pass' | 'block';
  reason?: 'WAF_RULE_VIOLATION' | 'BOT_SIGNATURE' | 'RATE_BASED_RULE' | 'FALSE_POSITIVE' | 'OVERLOAD_FAIL_CLOSED';
  blockedFraction: number;
  addedLatencyMs: number;
}

export function evaluateWaf(
  config: WafConfig,
  origin: 'legitimate' | 'malicious',
  attackKind?: AttackScenarioId,
  currentInflowRps?: number
): WafInspectionResult {
  if (config.enabled === false) {
    return { action: 'pass', blockedFraction: 0, addedLatencyMs: 0 };
  }

  const sensitivity = Math.max(0, Math.min(100, config.sensitivity));
  const x = sensitivity / 100;

  const rulesets = config.rulesets ?? {
    genericWebAttacks: true,
    botProtection: true,
    rateBasedRules: true,
  };

  const activeRulesetsCount =
    (rulesets.genericWebAttacks ? 1 : 0) +
    (rulesets.botProtection ? 1 : 0) +
    (rulesets.rateBasedRules ? 1 : 0);

  // Check capacity overload
  const isOverloaded = currentInflowRps !== undefined && currentInflowRps > config.capacityRps;
  if (isOverloaded) {
    if (config.failMode === 'closed') {
      // Overloaded fail-closed blocks excess or all with 503
      return {
        action: 'block',
        reason: 'OVERLOAD_FAIL_CLOSED',
        blockedFraction: 1.0,
        addedLatencyMs: config.processingLatencyMs * 1.5,
      };
    }
    // Fail-open: overflowing requests bypass inspection
    const passRatio = Math.min(1.0, config.capacityRps / currentInflowRps);
    // Scale inspection efficacy down by passRatio
    const baseResult = evaluateWafInspection(config, x, rulesets, activeRulesetsCount, origin, attackKind);
    return {
      ...baseResult,
      blockedFraction: baseResult.blockedFraction * passRatio,
      addedLatencyMs: config.processingLatencyMs,
    };
  }

  return evaluateWafInspection(config, x, rulesets, activeRulesetsCount, origin, attackKind);
}

function evaluateWafInspection(
  config: WafConfig,
  x: number,
  rulesets: { genericWebAttacks: boolean; botProtection: boolean; rateBasedRules: boolean },
  activeRulesetsCount: number,
  origin: 'legitimate' | 'malicious',
  attackKind?: AttackScenarioId
): WafInspectionResult {
  if (origin === 'legitimate') {
    // False positive rate curve: FPR(x) = 0.0005 + 0.08 * x^3 * (activeRulesetsCount / 3)
    if (activeRulesetsCount === 0 || x === 0) {
      return { action: 'pass', blockedFraction: 0, addedLatencyMs: config.processingLatencyMs };
    }

    const fpRate = 0.0005 + 0.08 * Math.pow(x, 3) * (activeRulesetsCount / 3);
    return {
      action: fpRate > 0 ? 'block' : 'pass',
      reason: fpRate > 0 ? 'FALSE_POSITIVE' : undefined,
      blockedFraction: Math.min(1.0, fpRate),
      addedLatencyMs: config.processingLatencyMs,
    };
  }

  // Malicious traffic inspection
  if (!attackKind) {
    return { action: 'pass', blockedFraction: 0, addedLatencyMs: config.processingLatencyMs };
  }

  // 1. Generic Web Attacks (SQLi, XSS, Path Traversal)
  if (attackKind === 'injection-attempts' && rulesets.genericWebAttacks) {
    // min(0.99, 0.40 + 0.59 * sqrt(x))
    const blockedFraction = Math.min(0.99, 0.40 + 0.59 * Math.sqrt(x));
    return {
      action: blockedFraction > 0 ? 'block' : 'pass',
      reason: 'WAF_RULE_VIOLATION',
      blockedFraction,
      addedLatencyMs: config.processingLatencyMs,
    };
  }

  // 2. Bot Protection (scrapers, credential brute force / stuffing)
  if (
    (attackKind === 'cache-busting-scraper' ||
      attackKind === 'credential-stuffing-distributed' ||
      attackKind === 'credential-brute-force') &&
    rulesets.botProtection
  ) {
    // min(0.95, 0.30 + 0.65 * x)
    const blockedFraction = Math.min(0.95, 0.30 + 0.65 * x);
    return {
      action: blockedFraction > 0 ? 'block' : 'pass',
      reason: 'BOT_SIGNATURE',
      blockedFraction,
      addedLatencyMs: config.processingLatencyMs,
    };
  }

  // 3. Rate-based Rules (HTTP flood bursts)
  if (attackKind === 'http-flood' && rulesets.rateBasedRules) {
    // min(0.90, 0.20 + 0.70 * x^1.5)
    const blockedFraction = Math.min(0.90, 0.20 + 0.70 * Math.pow(x, 1.5));
    return {
      action: blockedFraction > 0 ? 'block' : 'pass',
      reason: 'RATE_BASED_RULE',
      blockedFraction,
      addedLatencyMs: config.processingLatencyMs,
    };
  }

  // Network layer attacks (volumetric-flood, syn-flood) bypass L7 WAF
  return { action: 'pass', blockedFraction: 0, addedLatencyMs: config.processingLatencyMs };
}

export const wafModel: ComponentBehaviorModel<WafConfig> = {
  getEffectiveCapacityRps(config: WafConfig): number {
    return config.capacityRps;
  },

  getServiceTimeMs(config: WafConfig): number {
    return Math.max(0.1, config.processingLatencyMs);
  },

  getUtilization(arrivalRateRps: number, config: WafConfig): number {
    return arrivalRateRps / Math.max(1, config.capacityRps);
  },

  decideOverflow(queueLength: number, config: WafConfig): OverflowDecision {
    const limit = Math.max(100, Math.floor(config.capacityRps / 10));
    if (queueLength >= limit) return 'reject';
    if (queueLength > 0) return 'queue';
    return 'accept';
  },
};
