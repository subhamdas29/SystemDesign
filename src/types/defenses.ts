/**
 * Defense Types, Schemas, and Metadata (Phase 8B).
 * Data-driven models for component-level and node-level defenses.
 * Pure TypeScript with ZERO React or DOM dependencies.
 */

import { z } from 'zod';
import { ComponentType } from './components';

// --- 1. Component-Level Defense Configs ---

export const FirewallConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxBlocklistCoverage: z.number().min(0).max(1).default(0.9), // Max 90% blocklist coverage
  detectionLagMs: z.number().min(0).max(60000).default(2000),  // 2s detection lag
  learnRatePerSec: z.number().min(1).max(100000).default(100), // 100 IPs/sec
  capacityRps: z.number().min(100).max(10000000).default(50000),
  processingLatencyMs: z.number().min(0.1).max(100).default(1.5),
  falsePositiveRate: z.number().min(0).max(0.5).default(0.001), // 0.1% false positive
});
export type FirewallConfig = z.infer<typeof FirewallConfigSchema>;

export const WafRulesetsSchema = z.object({
  genericWebAttacks: z.boolean().default(true), // SQLi, XSS, Path Traversal
  botProtection: z.boolean().default(true),     // Scrapers, brute force, stuffing
  rateBasedRules: z.boolean().default(true),    // HTTP flood bursts
});
export type WafRulesets = z.infer<typeof WafRulesetsSchema>;

export const WafConfigSchema = z.object({
  enabled: z.boolean().default(true),
  rulesets: WafRulesetsSchema.default({
    genericWebAttacks: true,
    botProtection: true,
    rateBasedRules: true,
  }),
  sensitivity: z.number().min(0).max(100).default(50), // 0 to 100
  failMode: z.enum(['open', 'closed']).default('open'),
  capacityRps: z.number().min(100).max(1000000).default(25000),
  processingLatencyMs: z.number().min(0.1).max(100).default(5),
});
export type WafConfig = z.infer<typeof WafConfigSchema>;

export const RateLimiterAlgorithmSchema = z.enum([
  'fixed-window',
  'sliding-window',
  'token-bucket',
]);
export type RateLimiterAlgorithm = z.infer<typeof RateLimiterAlgorithmSchema>;

export const RateLimiterScopeSchema = z.enum(['per-source', 'global']);
export type RateLimiterScope = z.infer<typeof RateLimiterScopeSchema>;

export const RateLimiterConfigSchema = z.object({
  enabled: z.boolean().default(true),
  algorithm: RateLimiterAlgorithmSchema.default('sliding-window'),
  scope: RateLimiterScopeSchema.default('per-source'),
  limitRps: z.number().min(1).max(1000000).default(50),
  burst: z.number().min(1).max(1000000).default(75),
  onExceed: z.enum(['reject-429', 'delay']).default('reject-429'),
  capacityRps: z.number().min(100).max(10000000).default(50000),
  processingLatencyMs: z.number().min(0.1).max(100).default(1.5),
});
export type RateLimiterConfig = z.infer<typeof RateLimiterConfigSchema>;

export const CdnDdosProtectionSchema = z.enum(['none', 'standard', 'advanced']);
export type CdnDdosProtection = z.infer<typeof CdnDdosProtectionSchema>;

export const CdnConfigSchema = z.object({
  enabled: z.boolean().default(true),
  staticContentShare: z.number().min(0).max(100).default(60), // 60% of legit traffic is static
  edgeHitRatio: z.number().min(0).max(100).default(85),       // 85% cache hit on static
  edgeCapacityRps: z.number().min(1000).max(10000000).default(100000),
  ddosProtection: CdnDdosProtectionSchema.default('standard'),
  ttlSeconds: z.number().min(1).max(86400).default(3600),
  processingLatencyMs: z.number().min(0.1).max(100).default(8),
});
export type CdnConfig = z.infer<typeof CdnConfigSchema>;

// --- 2. Node-Level Defense Policies ---

export const AutoscalingPolicySchema = z.object({
  enabled: z.boolean().default(false),
  minInstances: z.number().int().min(1).max(10).default(1),
  maxInstances: z.number().int().min(1).max(10).default(6),
  scaleOutUtilizationPct: z.number().min(10).max(100).default(75),
  scaleOutAfterSec: z.number().min(1).max(60).default(3),
  provisioningDelaySec: z.number().min(1).max(60).default(5),
  scaleInUtilizationPct: z.number().min(5).max(80).default(30),
  cooldownSec: z.number().min(1).max(120).default(10),
  costPerInstanceHour: z.number().min(0).max(100).default(0.08), // $0.08 / hr
});
export type AutoscalingPolicy = z.infer<typeof AutoscalingPolicySchema>;

export const CircuitBreakerFallbackSchema = z.enum(['none', 'serve-stale-from-cache']);
export type CircuitBreakerFallback = z.infer<typeof CircuitBreakerFallbackSchema>;

export const CircuitBreakerPolicySchema = z.object({
  enabled: z.boolean().default(false),
  errorRateThreshold: z.number().min(0.01).max(1.0).default(0.5), // 50%
  minRequestsInWindow: z.number().int().min(1).max(1000).default(10),
  windowSec: z.number().min(1).max(60).default(5),
  openDurationSec: z.number().min(1).max(120).default(5),
  halfOpenProbes: z.number().int().min(1).max(20).default(3),
  fallback: CircuitBreakerFallbackSchema.default('none'),
});
export type CircuitBreakerPolicy = z.infer<typeof CircuitBreakerPolicySchema>;

export const ConnectionLimitsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxConnections: z.number().int().min(10).max(50000).default(300),
  perSourceMaxConnections: z.number().int().min(1).max(1000).default(10),
  headerTimeoutMs: z.number().min(100).max(60000).default(3000), // Caps slowloris
  idleTimeoutMs: z.number().min(500).max(120000).default(10000),
});
export type ConnectionLimitsConfig = z.infer<typeof ConnectionLimitsConfigSchema>;

export const HardeningOptionsSchema = z.object({
  parameterizedQueries: z.boolean().default(false), // Cuts injection risk to 0.01
  patchedSystem: z.boolean().default(true),        // Reduces vulnerability exploit probability
  leastPrivilegeDb: z.boolean().default(false),     // Exposure marked 'limited' vs 'full'
  networkSegmentation: z.boolean().default(false),  // Reduces lateral spread rate
  autoQuarantine: z.boolean().default(false),       // Auto-quarantines compromised hosts
  quarantineDetectionLagMs: z.number().min(500).max(30000).default(3000),
  reimageDurationMs: z.number().min(1000).max(60000).default(5000),
  egressFiltering: z.boolean().default(false),      // 90% reduction in data egress
});
export type HardeningOptions = z.infer<typeof HardeningOptionsSchema>;

// --- 3. Defense Presets ---

export type DefensePresetId = 'none' | 'basic' | 'standard' | 'hardened';

export interface DefensePresetDefinition {
  id: DefensePresetId;
  name: string;
  description: string;
  componentsToEnsure: ComponentType[];
  nodeDefenses: {
    autoscaling?: boolean;
    circuitBreaker?: boolean;
    connectionLimits?: boolean;
    hardening?: Partial<HardeningOptions>;
  };
}

export const DEFENSE_PRESETS: DefensePresetDefinition[] = [
  {
    id: 'none',
    name: 'No Defenses',
    description: 'Zero perimeter filtering or host hardening. Baseline architecture vulnerable to all attacks.',
    componentsToEnsure: [],
    nodeDefenses: {
      autoscaling: false,
      circuitBreaker: false,
      connectionLimits: false,
      hardening: {
        parameterizedQueries: false,
        patchedSystem: false,
        leastPrivilegeDb: false,
        networkSegmentation: false,
        autoQuarantine: false,
        egressFiltering: false,
      },
    },
  },
  {
    id: 'basic',
    name: 'Basic Perimeter (Firewall + Rate Limiter)',
    description: 'Network-layer firewall to block known malicious sources and per-source rate limiting against brute force.',
    componentsToEnsure: ['firewall', 'rate-limiter'],
    nodeDefenses: {
      connectionLimits: true,
      hardening: {
        patchedSystem: true,
      },
    },
  },
  {
    id: 'standard',
    name: 'Standard Defense (Adds WAF + CDN)',
    description: 'Web Application Firewall for HTTP signature filtering and Anycast CDN for static caching and volumetric absorption.',
    componentsToEnsure: ['cdn', 'firewall', 'waf', 'rate-limiter'],
    nodeDefenses: {
      connectionLimits: true,
      circuitBreaker: true,
      hardening: {
        parameterizedQueries: true,
        patchedSystem: true,
      },
    },
  },
  {
    id: 'hardened',
    name: 'Full Zero-Trust Hardened',
    description: 'Comprehensive defense-in-depth: Full edge CDN/WAF, circuit breakers with fallback, autoscaling, quarantine, and egress filtering.',
    componentsToEnsure: ['cdn', 'firewall', 'waf', 'rate-limiter'],
    nodeDefenses: {
      autoscaling: true,
      circuitBreaker: true,
      connectionLimits: true,
      hardening: {
        parameterizedQueries: true,
        patchedSystem: true,
        leastPrivilegeDb: true,
        networkSegmentation: true,
        autoQuarantine: true,
        egressFiltering: true,
      },
    },
  },
];

// --- 4. Defense Effectiveness Reporting Types ---

export type DefenseVerdict =
  | 'effective'
  | 'partially-effective'
  | 'bypassed'
  | 'hurt-legitimate-users'
  | 'inactive';

export interface DefenseItemReport {
  defenseKey: string;
  label: string;
  type: 'component' | 'node-policy';
  inspectedCount: number;
  blockedMaliciousCount: number;
  blockedMaliciousPercent: number;
  blockedLegitimateCount: number; // False positives
  passedCount: number;
  addedLatencyMs: number;
  costDollars: number;
  verdict: DefenseVerdict;
  verdictReason: string;
}

export interface PhaseTimingSummary {
  phaseId: string;
  name: string;
  legitSuccessRateBefore: number;
  legitSuccessRateDuring: number;
  legitSuccessRateAfter: number;
  p99LatencyBeforeMs: number;
  p99LatencyDuringMs: number;
  p99LatencyAfterMs: number;
}

export interface DefenseEffectivenessReportData {
  defenses: DefenseItemReport[];
  totalMaliciousBlockedCount: number;
  totalMaliciousBlockedPercent: number;
  totalFalsePositivesCount: number;
  totalAutoscalingCostDollars: number;
  phaseTimingSummaries: PhaseTimingSummary[];
  unmitigatedRisks: string[];
  previousRunDelta?: {
    legitSuccessRateDiff: number;
    p99LatencyDiffMs: number;
    maliciousBlockedPercentDiff: number;
  };
}
