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
  type WorkerConfig,
  type DatabaseReplicaConfig,
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
  worker: WorkerConfig;
  'database-replica': DatabaseReplicaConfig;
} = {
  client: {
    readRatio: 80,
    requestTimeoutMs: 5000,
    rps: 500,
    uniqueUsers: 2500,
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
    circuitBreaker: {
      enabled: false,
      errorRateThreshold: 0.5,
      minRequestsInWindow: 10,
      windowSec: 5,
      openDurationSec: 5,
      halfOpenProbes: 3,
      fallback: 'none',
    },
    connectionLimits: {
      enabled: false,
      maxConnections: 500,
      perSourceMaxConnections: 20,
      headerTimeoutMs: 3000,
      idleTimeoutMs: 10000,
    },
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
    instances: 1,
    databaseTimeoutMs: 3000,
    cacheTimeoutMs: 500,
    variabilityCv: 0.5,
    retryPolicy: RETRY_PRESETS.none,
    autoscaling: {
      enabled: false,
      minInstances: 1,
      maxInstances: 6,
      scaleOutUtilizationPct: 75,
      scaleOutAfterSec: 3,
      provisioningDelaySec: 5,
      scaleInUtilizationPct: 30,
      cooldownSec: 10,
      costPerInstanceHour: 0.08,
    },
    circuitBreaker: {
      enabled: false,
      errorRateThreshold: 0.5,
      minRequestsInWindow: 10,
      windowSec: 5,
      openDurationSec: 5,
      halfOpenProbes: 3,
      fallback: 'none',
    },
    connectionLimits: {
      enabled: false,
      maxConnections: 300,
      perSourceMaxConnections: 10,
      headerTimeoutMs: 3000,
      idleTimeoutMs: 10000,
    },
    hardening: {
      parameterizedQueries: false,
      patchedSystem: true,
      leastPrivilegeDb: false,
      networkSegmentation: false,
      autoQuarantine: false,
      quarantineDetectionLagMs: 3000,
      reimageDurationMs: 5000,
      egressFiltering: false,
    },
    asyncWriteShare: 80,
    enqueueLatencyMs: 4,
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
    hardening: {
      parameterizedQueries: false,
      patchedSystem: true,
      leastPrivilegeDb: false,
      networkSegmentation: false,
      autoQuarantine: false,
      quarantineDetectionLagMs: 3000,
      reimageDurationMs: 5000,
      egressFiltering: false,
    },
    readFromReplicasShare: 90,
    replicationApplyRate: 300,
    stalenessThresholdMs: 1000,
    shardCount: 1,
    shardKeyDistribution: 'uniform',
    crossShardQueryShare: 10,
    crossShardPenaltyMultiplier: 1.5,
  },
  cdn: {
    enabled: true,
    processingLatencyMs: 8,
    staticContentShare: 60,
    edgeHitRatio: 85,
    edgeCapacityRps: 100000,
    ddosProtection: 'standard',
    ttlSeconds: 3600,
  },
  firewall: {
    enabled: true,
    maxBlocklistCoverage: 0.9,
    detectionLagMs: 2000,
    learnRatePerSec: 100,
    capacityRps: 50000,
    processingLatencyMs: 1.5,
    falsePositiveRate: 0.001,
  },
  waf: {
    enabled: true,
    rulesets: {
      genericWebAttacks: true,
      botProtection: true,
      rateBasedRules: true,
    },
    sensitivity: 50,
    failMode: 'open',
    capacityRps: 25000,
    processingLatencyMs: 5,
  },
  'rate-limiter': {
    enabled: true,
    algorithm: 'sliding-window',
    scope: 'per-source',
    limitRps: 50,
    burst: 75,
    onExceed: 'reject-429',
    capacityRps: 50000,
    processingLatencyMs: 1.5,
  },
  'api-gateway': {
    capacityRps: 50000,
    processingLatencyMs: 4,
    backendAlgorithm: 'round-robin',
    authEnabled: true,
    authLatencyMs: 15,
    authCacheHitRatio: 80,
    perRouteLimits: [],
    upstreamTimeoutMs: 5000,
    retryPolicy: RETRY_PRESETS.none,
    responseCaching: {
      enabled: false,
      ttlSeconds: 60,
      cacheableRoutes: ['route-read', 'route-browse', 'default-read'],
    },
    circuitBreaker: {
      enabled: false,
      errorRateThreshold: 0.5,
      minRequestsInWindow: 10,
      windowSec: 5,
      openDurationSec: 5,
      halfOpenProbes: 3,
      fallback: 'none',
    },
    connectionLimits: {
      enabled: false,
      maxConnections: 500,
      perSourceMaxConnections: 20,
      headerTimeoutMs: 3000,
      idleTimeoutMs: 10000,
    },
  },
  'message-queue': {
    capacityRps: 25000,
    processingLatencyMs: 2,
    maxQueueDepth: 50000,
    enqueueLatencyMs: 4,
    retentionSeconds: 86400,
    overflowBehavior: 'reject',
  },
  worker: {
    instances: 2,
    concurrency: 5,
    avgProcessingMs: 80,
    maxRetries: 3,
    writeCostToDatabase: 1,
  },
  'database-replica': {
    capacityQps: 800,
    queryLatencyMs: 25,
  },
};

export function getDefaultConfig(type: ComponentType): AnyComponentConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIGS[type])) as AnyComponentConfig;
}
