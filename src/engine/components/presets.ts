/**
 * Beginner-friendly presets (Small, Medium, Large) for core components.
 * Pure data definitions with internally consistent realistic values.
 */

import { ComponentType, AnyComponentConfig } from '../../types';

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
      maxConcurrentRequests: 150,
      avgProcessingTimeMs: 35,
      cpuCores: 4,
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
    small: { capacityRps: 20000, processingLatencyMs: 15, hitRatio: 70, cacheTtlSeconds: 1800 },
    medium: { capacityRps: 100000, processingLatencyMs: 10, hitRatio: 80, cacheTtlSeconds: 3600 },
    large: { capacityRps: 500000, processingLatencyMs: 5, hitRatio: 90, cacheTtlSeconds: 86400 },
  },
  firewall: {
    small: { capacityRps: 20000, processingLatencyMs: 4, dropRate: 0 },
    medium: { capacityRps: 50000, processingLatencyMs: 2, dropRate: 0 },
    large: { capacityRps: 200000, processingLatencyMs: 1, dropRate: 0 },
  },
  waf: {
    small: { capacityRps: 10000, processingLatencyMs: 12, inspectionDepthMs: 8, blockMaliciousOnly: true },
    medium: { capacityRps: 25000, processingLatencyMs: 8, inspectionDepthMs: 5, blockMaliciousOnly: true },
    large: { capacityRps: 100000, processingLatencyMs: 4, inspectionDepthMs: 2, blockMaliciousOnly: true },
  },
  'rate-limiter': {
    small: { capacityRps: 20000, processingLatencyMs: 3, maxTokens: 1000, refillRatePerSec: 500 },
    medium: { capacityRps: 50000, processingLatencyMs: 2, maxTokens: 5000, refillRatePerSec: 2000 },
    large: { capacityRps: 200000, processingLatencyMs: 1, maxTokens: 20000, refillRatePerSec: 10000 },
  },
  'api-gateway': {
    small: { capacityRps: 10000, processingLatencyMs: 8, rateLimitEnabled: true, authValidationMs: 6 },
    medium: { capacityRps: 30000, processingLatencyMs: 5, rateLimitEnabled: true, authValidationMs: 4 },
    large: { capacityRps: 100000, processingLatencyMs: 2, rateLimitEnabled: true, authValidationMs: 2 },
  },
  'message-queue': {
    small: { capacityRps: 20000, processingLatencyMs: 10, maxQueueDepth: 25000, retentionHours: 12 },
    medium: { capacityRps: 50000, processingLatencyMs: 5, maxQueueDepth: 100000, retentionHours: 24 },
    large: { capacityRps: 250000, processingLatencyMs: 2, maxQueueDepth: 500000, retentionHours: 72 },
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
