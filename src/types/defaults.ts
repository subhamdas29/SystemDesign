/**
 * Default configurations for each component type.
 * Used during node insertion or when swapping components.
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
    capacity: 10000,
    latencyMs: 1,
    rps: 500,
    trafficPattern: 'constant',
  },
  dns: {
    capacity: 50000,
    latencyMs: 15,
    ttlSeconds: 300,
  },
  cdn: {
    capacity: 100000,
    latencyMs: 10,
    hitRatio: 0.8,
    cacheTtlSeconds: 3600,
  },
  router: {
    capacity: 50000,
    latencyMs: 2,
    algorithm: 'dynamic',
  },
  firewall: {
    capacity: 50000,
    latencyMs: 2,
    dropRate: 0,
  },
  waf: {
    capacity: 25000,
    latencyMs: 8,
    inspectionDepthMs: 5,
    blockMaliciousOnly: true,
  },
  'rate-limiter': {
    capacity: 50000,
    latencyMs: 2,
    maxTokens: 5000,
    refillRatePerSec: 2000,
  },
  'load-balancer': {
    capacity: 50000,
    latencyMs: 3,
    algorithm: 'round-robin',
  },
  'api-gateway': {
    capacity: 30000,
    latencyMs: 5,
    rateLimitEnabled: true,
    authValidationMs: 4,
  },
  'app-server': {
    capacity: 1000,
    latencyMs: 35,
    maxConcurrency: 150,
    queueSize: 500,
    errorRate: 0.001,
  },
  cache: {
    capacity: 20000,
    latencyMs: 3,
    hitRatio: 0.85,
    maxEntries: 100000,
    evictionPolicy: 'lru',
  },
  database: {
    capacity: 500,
    latencyMs: 45,
    maxConnections: 100,
    readCapacity: 400,
    writeCapacity: 100,
  },
  'message-queue': {
    capacity: 50000,
    latencyMs: 5,
    maxQueueDepth: 100000,
    retentionHours: 24,
  },
};

export function getDefaultConfig(type: ComponentType): AnyComponentConfig {
  return { ...DEFAULT_CONFIGS[type] };
}
