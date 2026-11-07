/**
 * Default configurations for each component type.
 * Used during node insertion, reset, or when swapping components.
 */

import {
  type ComponentType,
  type ClientConfig,
  type DnsConfig,
  type CdnConfig,
  type RouterConfig,
  type FirewallConfig,
  type WafConfig,
  type RateLimiterConfig,
  type LoadBalancerConfig,
  type ApiGatewayConfig,
  type AppServerConfig,
  type CacheConfig,
  type DatabaseConfig,
  type MessageQueueConfig,
  type AnyComponentConfig,
  RETRY_PRESETS,
} from './components';

export const DEFAULT_CONFIGS: {
  client: ClientConfig;
  dns: DnsConfig;
  cdn: CdnConfig;
  router: RouterConfig;
  firewall: FirewallConfig;
  waf: WafConfig;
  'rate-limiter': RateLimiterConfig;
  'load-balancer': LoadBalancerConfig;
  'api-gateway': ApiGatewayConfig;
  'app-server': AppServerConfig;
  cache: CacheConfig;
  database: DatabaseConfig;
  'message-queue': MessageQueueConfig;
} = {
  client: {
    readRatio: 80,
    requestTimeoutMs: 5000,
    rps: 500,
    variabilityCv: 0.5,
    retryPolicy: RETRY_PRESETS.none,
  },
  dns: {
    lookupLatencyMs: 15,
    ttlSeconds: 300,
    cacheHitRatio: 90,
    variabilityCv: 0.5,
  },
  router: {
    capacityRps: 50000,
    processingLatencyMs: 2,
    queueLimit: 1000,
    variabilityCv: 0.5,
  },
  'load-balancer': {
    algorithm: 'round-robin',
    capacityRps: 50000,
    processingLatencyMs: 3,
    queueLimit: 2000,
    healthCheckIntervalMs: 5000,
    upstreamTimeoutMs: 5000,
    unhealthyThreshold: 3,
    healthyThreshold: 2,
    variabilityCv: 0.5,
    retryPolicy: RETRY_PRESETS.none,
  },
  'app-server': {
    maxThroughputRps: 1000,
    maxConcurrentRequests: 200,
    avgProcessingTimeMs: 10,
    cpuCores: 16,
    memoryMb: 4096,
    queueSize: 500,
    overloadBehavior: 'reject',
    health: 'healthy',
    databaseTimeoutMs: 3000,
    cacheTimeoutMs: 500,
    variabilityCv: 0.5,
    retryPolicy: RETRY_PRESETS.none,
  },
  cache: {
    capacityMb: 1024,
    lookupLatencyMs: 3,
    hitRatio: 85,
    ttlSeconds: 3600,
    populateOnMiss: true,
    variabilityCv: 0.5,
    warmupPeriodMs: 10000,
  },
  database: {
    maxQueryThroughputQps: 500,
    queryLatencyMs: 45,
    connectionPoolSize: 100,
    queueCapacity: 200,
    readQueryLatencyMs: 30,
    writeQueryLatencyMs: 60,
    variabilityCv: 0.5,
  },
  cdn: {
    capacityRps: 100000,
    processingLatencyMs: 10,
    hitRatio: 80,
    cacheTtlSeconds: 3600,
  },
  firewall: {
    capacityRps: 50000,
    processingLatencyMs: 2,
    dropRate: 0,
  },
  waf: {
    capacityRps: 25000,
    processingLatencyMs: 8,
    inspectionDepthMs: 5,
    blockMaliciousOnly: true,
  },
  'rate-limiter': {
    capacityRps: 50000,
    processingLatencyMs: 2,
    maxTokens: 5000,
    refillRatePerSec: 2000,
  },
  'api-gateway': {
    capacityRps: 30000,
    processingLatencyMs: 5,
    rateLimitEnabled: true,
    authValidationMs: 4,
  },
  'message-queue': {
    capacityRps: 50000,
    processingLatencyMs: 5,
    maxQueueDepth: 100000,
    retentionHours: 24,
  },
};

export function getDefaultConfig(type: ComponentType): AnyComponentConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIGS[type])) as AnyComponentConfig;
}
