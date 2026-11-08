/**
 * Beginner-friendly presets (Small, Medium, Large) for core components.
 * Pure data definitions with internally consistent realistic values.
 */

import { ComponentType, AnyComponentConfig, RETRY_PRESETS } from '../../types';

export type PresetTier = 'small' | 'medium' | 'large';

export const COMPONENT_PRESETS: Record<ComponentType, Record<PresetTier, AnyComponentConfig>> = {
  client: {
    small: {
      readRatio: 85,
      requestTimeoutMs: 3000,
      rps: 100,
    },
    medium: {
      readRatio: 80,
      requestTimeoutMs: 5000,
      rps: 500,
    },
    large: {
      readRatio: 75,
      requestTimeoutMs: 8000,
      rps: 2500,
    },
  },
  dns: {
    small: {
      lookupLatencyMs: 30,
      ttlSeconds: 60,
      cacheHitRatio: 75,
    },
    medium: {
      lookupLatencyMs: 15,
      ttlSeconds: 300,
      cacheHitRatio: 90,
    },
    large: {
      lookupLatencyMs: 5,
      ttlSeconds: 3600,
      cacheHitRatio: 98,
    },
  },
  router: {
    small: {
      capacityRps: 10000,
      processingLatencyMs: 5,
      queueLimit: 200,
    },
    medium: {
      capacityRps: 50000,
      processingLatencyMs: 2,
      queueLimit: 1000,
    },
    large: {
      capacityRps: 200000,
      processingLatencyMs: 0.5,
      queueLimit: 5000,
    },
  },
  'load-balancer': {
    small: {
      algorithm: 'round-robin',
      capacityRps: 5000,
      processingLatencyMs: 5,
      queueLimit: 500,
      healthCheckIntervalMs: 10000,
    },
    medium: {
      algorithm: 'round-robin',
      capacityRps: 50000,
      processingLatencyMs: 3,
      queueLimit: 2000,
      healthCheckIntervalMs: 5000,
    },
    large: {
      algorithm: 'least-connections',
      capacityRps: 250000,
      processingLatencyMs: 1,
      queueLimit: 10000,
      healthCheckIntervalMs: 2000,
    },
  },
  'app-server': {
    small: {
      maxThroughputRps: 200,
      maxConcurrentRequests: 30,
      avgProcessingTimeMs: 60,
      cpuCores: 2,
      memoryMb: 2048,
      queueSize: 100,
      overloadBehavior: 'reject',
      health: 'healthy',
    },
    medium: {
      maxThroughputRps: 1000,
      maxConcurrentRequests: 200,
      avgProcessingTimeMs: 10,
      cpuCores: 16,
      memoryMb: 4096,
      queueSize: 500,
      overloadBehavior: 'reject',
      health: 'healthy',
    },
    large: {
      maxThroughputRps: 2000,
      maxConcurrentRequests: 300,
      avgProcessingTimeMs: 20,
      cpuCores: 16,
      memoryMb: 16384,
      queueSize: 2000,
      overloadBehavior: 'reject',
      health: 'healthy',
    },
  },
  cache: {
    small: {
      capacityMb: 256,
      lookupLatencyMs: 5,
      hitRatio: 70,
      ttlSeconds: 1800,
      populateOnMiss: true,
    },
    medium: {
      capacityMb: 1024,
      lookupLatencyMs: 3,
      hitRatio: 85,
      ttlSeconds: 3600,
      populateOnMiss: true,
    },
    large: {
      capacityMb: 8192,
      lookupLatencyMs: 1,
      hitRatio: 95,
      ttlSeconds: 14400,
      populateOnMiss: true,
    },
  },
  database: {
    small: {
      maxQueryThroughputQps: 500,
      queryLatencyMs: 60,
      connectionPoolSize: 30,
      queueCapacity: 50,
      readQueryLatencyMs: 40,
      writeQueryLatencyMs: 80,
    },
    medium: {
      maxQueryThroughputQps: 1500,
      queryLatencyMs: 45,
      connectionPoolSize: 100,
      queueCapacity: 200,
      readQueryLatencyMs: 30,
      writeQueryLatencyMs: 60,
    },
    large: {
      maxQueryThroughputQps: 5000,
      queryLatencyMs: 20,
      connectionPoolSize: 300,
      queueCapacity: 1000,
      readQueryLatencyMs: 15,
      writeQueryLatencyMs: 35,
    },
  },
  // Auxiliary presets
  cdn: {
    small: { enabled: true, edgeCapacityRps: 20000, processingLatencyMs: 15, edgeHitRatio: 70, staticContentShare: 50, ddosProtection: 'standard', ttlSeconds: 1800 },
    medium: { enabled: true, edgeCapacityRps: 100000, processingLatencyMs: 8, edgeHitRatio: 85, staticContentShare: 60, ddosProtection: 'standard', ttlSeconds: 3600 },
    large: { enabled: true, edgeCapacityRps: 500000, processingLatencyMs: 4, edgeHitRatio: 95, staticContentShare: 80, ddosProtection: 'advanced', ttlSeconds: 86400 },
  },
  firewall: {
    small: { enabled: true, capacityRps: 20000, processingLatencyMs: 3, maxBlocklistCoverage: 0.8, detectionLagMs: 3000, learnRatePerSec: 50, falsePositiveRate: 0.002 },
    medium: { enabled: true, capacityRps: 50000, processingLatencyMs: 1.5, maxBlocklistCoverage: 0.9, detectionLagMs: 2000, learnRatePerSec: 100, falsePositiveRate: 0.001 },
    large: { enabled: true, capacityRps: 200000, processingLatencyMs: 0.8, maxBlocklistCoverage: 0.98, detectionLagMs: 1000, learnRatePerSec: 500, falsePositiveRate: 0.0005 },
  },
  waf: {
    small: { enabled: true, capacityRps: 10000, processingLatencyMs: 8, sensitivity: 30, failMode: 'open', rulesets: { genericWebAttacks: true, botProtection: true, rateBasedRules: false } },
    medium: { enabled: true, capacityRps: 25000, processingLatencyMs: 5, sensitivity: 50, failMode: 'open', rulesets: { genericWebAttacks: true, botProtection: true, rateBasedRules: true } },
    large: { enabled: true, capacityRps: 100000, processingLatencyMs: 2, sensitivity: 80, failMode: 'closed', rulesets: { genericWebAttacks: true, botProtection: true, rateBasedRules: true } },
  },
  'rate-limiter': {
    small: { enabled: true, capacityRps: 20000, processingLatencyMs: 3, limitRps: 25, burst: 50, scope: 'per-source', algorithm: 'sliding-window', onExceed: 'reject-429' },
    medium: { enabled: true, capacityRps: 50000, processingLatencyMs: 1.5, limitRps: 50, burst: 75, scope: 'per-source', algorithm: 'sliding-window', onExceed: 'reject-429' },
    large: { enabled: true, capacityRps: 200000, processingLatencyMs: 0.8, limitRps: 100, burst: 150, scope: 'per-source', algorithm: 'token-bucket', onExceed: 'reject-429' },
  },
  'api-gateway': {
    small: {
      capacityRps: 10000,
      processingLatencyMs: 8,
      backendAlgorithm: 'round-robin',
      authEnabled: true,
      authLatencyMs: 20,
      authCacheHitRatio: 70,
      perRouteLimits: [],
      upstreamTimeoutMs: 5000,
      retryPolicy: RETRY_PRESETS.none,
      responseCaching: { enabled: false, ttlSeconds: 60, cacheableRoutes: [] },
    },
    medium: {
      capacityRps: 50000,
      processingLatencyMs: 4,
      backendAlgorithm: 'round-robin',
      authEnabled: true,
      authLatencyMs: 15,
      authCacheHitRatio: 80,
      perRouteLimits: [],
      upstreamTimeoutMs: 5000,
      retryPolicy: RETRY_PRESETS.none,
      responseCaching: { enabled: false, ttlSeconds: 60, cacheableRoutes: ['route-read', 'default-read'] },
    },
    large: {
      capacityRps: 150000,
      processingLatencyMs: 2,
      backendAlgorithm: 'least-connections',
      authEnabled: true,
      authLatencyMs: 8,
      authCacheHitRatio: 90,
      perRouteLimits: [],
      upstreamTimeoutMs: 5000,
      retryPolicy: RETRY_PRESETS.none,
      responseCaching: { enabled: true, ttlSeconds: 120, cacheableRoutes: ['route-read', 'default-read'] },
    },
  },
  'message-queue': {
    small: {
      capacityRps: 10000,
      processingLatencyMs: 4,
      maxQueueDepth: 10000,
      enqueueLatencyMs: 6,
      retentionSeconds: 43200,
      overflowBehavior: 'reject',
    },
    medium: {
      capacityRps: 25000,
      processingLatencyMs: 2,
      maxQueueDepth: 50000,
      enqueueLatencyMs: 4,
      retentionSeconds: 86400,
      overflowBehavior: 'reject',
    },
    large: {
      capacityRps: 100000,
      processingLatencyMs: 1,
      maxQueueDepth: 200000,
      enqueueLatencyMs: 2,
      retentionSeconds: 259200,
      overflowBehavior: 'drop-oldest',
    },
  },
  worker: {
    small: { instances: 1, concurrency: 2, avgProcessingMs: 100, maxRetries: 2, writeCostToDatabase: 1 },
    medium: { instances: 2, concurrency: 5, avgProcessingMs: 80, maxRetries: 3, writeCostToDatabase: 1 },
    large: { instances: 5, concurrency: 10, avgProcessingMs: 50, maxRetries: 5, writeCostToDatabase: 1 },
  },
  'database-replica': {
    small: { capacityQps: 400, queryLatencyMs: 35 },
    medium: { capacityQps: 800, queryLatencyMs: 25 },
    large: { capacityQps: 2000, queryLatencyMs: 15 },
  },
};

/**
 * Checks if a component's current config matches one of the preset tiers.
 * Returns 'small' | 'medium' | 'large' if exactly matching, else 'custom'.
 */
export function detectPreset(
  type: ComponentType,
  config: AnyComponentConfig
): PresetTier | 'custom' {
  const presets = COMPONENT_PRESETS[type];
  if (!presets) return 'custom';

  const cfg = config as unknown as Record<string, unknown>;

  for (const tier of ['small', 'medium', 'large'] as const) {
    const presetConfig = presets[tier] as unknown as Record<string, unknown>;
    const presetKeys = Object.keys(presetConfig);
    const configKeys = Object.keys(cfg);

    const isMatch =
      presetKeys.length === configKeys.length &&
      presetKeys.every((key) => cfg[key] === presetConfig[key]);

    if (isMatch) return tier;
  }

  return 'custom';
}
