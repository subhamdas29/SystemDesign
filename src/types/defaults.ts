/**
 * Default configurations for each component type.
 * Used during node insertion, reset, or when swapping components.
 */

import type {
  ComponentType,
  ClientConfig,
  DnsConfig,
  CdnConfig,
  RouterConfig,
  FirewallConfig,
  WafConfig,
  RateLimiterConfig,
  LoadBalancerConfig,
  ApiGatewayConfig,
  AppServerConfig,
  CacheConfig,
  DatabaseConfig,
  MessageQueueConfig,
  AnyComponentConfig,
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
  },
  dns: {
    lookupLatencyMs: 15,
    ttlSeconds: 300,
    cacheHitRatio: 90,
  },
  router: {
    capacityRps: 50000,
    processingLatencyMs: 2,
    queueLimit: 1000,
  },
  'load-balancer': {
    algorithm: 'round-robin',
    capacityRps: 50000,
    processingLatencyMs: 3,
    queueLimit: 2000,
    healthCheckIntervalMs: 5000,
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
  },
  cache: {
    capacityMb: 1024,
    lookupLatencyMs: 3,
    hitRatio: 85,
    ttlSeconds: 3600,
    populateOnMiss: true,
  },
  database: {
    maxQueryThroughputQps: 500,
    queryLatencyMs: 45,
    connectionPoolSize: 100,
    queueCapacity: 200,
    readQueryLatencyMs: 30,
    writeQueryLatencyMs: 60,
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
