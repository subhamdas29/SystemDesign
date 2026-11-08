/**
 * Zod validation schemas for GraphConfig and node configurations.
 * Contains clear, beginner-friendly validation error messages.
 */

import { z } from 'zod';
import { COMPONENT_TYPES, ComponentType } from './components';
import { WorkloadRouteSchema } from './routes';
import {
  FirewallConfigSchema,
  WafConfigSchema,
  RateLimiterConfigSchema,
  CdnConfigSchema,
  AutoscalingPolicySchema,
  CircuitBreakerPolicySchema,
  ConnectionLimitsConfigSchema,
  HardeningOptionsSchema,
} from './defenses';

export {
  FirewallConfigSchema,
  WafConfigSchema,
  RateLimiterConfigSchema,
  CdnConfigSchema,
  AutoscalingPolicySchema,
  CircuitBreakerPolicySchema,
  ConnectionLimitsConfigSchema,
  HardeningOptionsSchema,
};

export const ComponentTypeSchema = z.enum(COMPONENT_TYPES);

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5),
  retryOn: z.array(z.enum(['timeout', '5xx', 'rejected', 'connection_failure'])),
  backoff: z.enum(['none', 'fixed', 'exponential', 'exponential_jitter']),
  baseDelayMs: z.number().min(0).max(10000),
  maxDelayMs: z.number().min(0).max(60000),
  retryBudgetPct: z.number().min(0).max(100).optional(),
});

export const ClientConfigSchema = z.object({
  readRatio: z
    .number({ error: 'Read ratio must be a number' })
    .min(0, 'Read ratio cannot be less than 0%')
    .max(100, 'Read ratio cannot exceed 100%'),
  requestTimeoutMs: z
    .number({ error: 'Timeout must be a number' })
    .min(100, 'Timeout must be at least 100 ms')
    .max(60000, 'Timeout cannot exceed 60,000 ms (1 minute)'),
  rps: z
    .number({ error: 'RPS must be a number' })
    .min(1, 'RPS must be at least 1 req/s')
    .max(1000000, 'RPS cannot exceed 1,000,000 req/s'),
  uniqueUsers: z.number().int().min(1).max(1000000).optional(),
  variabilityCv: z.number().min(0).max(5).optional(),
  retryPolicy: RetryPolicySchema.optional(),
  routes: z.array(WorkloadRouteSchema).optional(),
});

export const DnsConfigSchema = z.object({
  lookupLatencyMs: z
    .number({ error: 'Lookup latency must be a number' })
    .min(1, 'Lookup latency must be at least 1 ms')
    .max(1000, 'Lookup latency cannot exceed 1,000 ms'),
  ttlSeconds: z
    .number({ error: 'TTL must be a number' })
    .min(1, 'TTL must be at least 1 second')
    .max(86400, 'TTL cannot exceed 86,400 seconds (24 hours)'),
  cacheHitRatio: z
    .number({ error: 'DNS hit ratio must be a number' })
    .min(0, 'DNS hit ratio cannot be less than 0%')
    .max(100, 'DNS hit ratio cannot exceed 100%'),
  variabilityCv: z.number().min(0).max(5).optional(),
});

export const RouterConfigSchema = z.object({
  capacityRps: z
    .number({ error: 'Capacity must be a number' })
    .min(10, 'Router capacity must be at least 10 rps')
    .max(10000000, 'Router capacity cannot exceed 10,000,000 rps'),
  processingLatencyMs: z
    .number({ error: 'Latency must be a number' })
    .min(0.1, 'Routing latency must be at least 0.1 ms')
    .max(500, 'Routing latency cannot exceed 500 ms'),
  queueLimit: z
    .number({ error: 'Queue limit must be a number' })
    .min(0, 'Queue limit cannot be negative')
    .max(100000, 'Queue limit cannot exceed 100,000 packets'),
  variabilityCv: z.number().min(0).max(5).optional(),
});

export const LoadBalancerConfigSchema = z.object({
  algorithm: z.enum(['round-robin', 'weighted-round-robin', 'least-connections', 'random'], {
    error: 'Algorithm must be round-robin, weighted-round-robin, least-connections, or random',
  }),
  capacityRps: z
    .number({ error: 'Capacity must be a number' })
    .min(10, 'Capacity must be at least 10 rps')
    .max(10000000, 'Capacity cannot exceed 10,000,000 rps'),
  processingLatencyMs: z
    .number({ error: 'Latency must be a number' })
    .min(0.1, 'Processing latency must be at least 0.1 ms')
    .max(500, 'Processing latency cannot exceed 500 ms'),
  queueLimit: z
    .number({ error: 'Queue limit must be a number' })
    .min(0, 'Queue limit cannot be negative')
    .max(100000, 'Queue limit cannot exceed 100,000 requests'),
  healthCheckIntervalMs: z
    .number({ error: 'Health check interval must be a number' })
    .min(500, 'Health check interval must be at least 500 ms')
    .max(60000, 'Health check interval cannot exceed 60,000 ms'),
  upstreamTimeoutMs: z.number().min(50).max(60000).optional(),
  unhealthyThreshold: z.number().int().min(1).max(10).optional(),
  healthyThreshold: z.number().int().min(1).max(10).optional(),
  variabilityCv: z.number().min(0).max(5).optional(),
  retryPolicy: RetryPolicySchema.optional(),
  perBackendWeights: z.record(z.string(), z.number().min(1).max(100)).optional(),
  circuitBreaker: CircuitBreakerPolicySchema.optional(),
  connectionLimits: ConnectionLimitsConfigSchema.optional(),
});

export const AppServerConfigSchema = z.object({
  maxThroughputRps: z
    .number({ error: 'Max throughput must be a number' })
    .min(10, 'Max throughput must be at least 10 rps')
    .max(100000, 'Max throughput cannot exceed 100,000 rps'),
  maxConcurrentRequests: z
    .number({ error: 'Max concurrency must be a number' })
    .min(1, 'Concurrency must be at least 1 request')
    .max(20000, 'Concurrency cannot exceed 20,000 requests'),
  avgProcessingTimeMs: z
    .number({ error: 'Processing time must be a number' })
    .min(1, 'Processing time must be at least 1 ms')
    .max(10000, 'Processing time cannot exceed 10,000 ms'),
  cpuCores: z
    .number({ error: 'CPU cores must be a number' })
    .min(1, 'Must have at least 1 CPU core')
    .max(256, 'Cannot exceed 256 CPU cores'),
  memoryMb: z
    .number({ error: 'Memory must be a number' })
    .min(256, 'Memory must be at least 256 MB')
    .max(1048576, 'Memory cannot exceed 1,048,576 MB (1 TB)'),
  queueSize: z
    .number({ error: 'Queue size must be a number' })
    .min(0, 'Queue size cannot be negative')
    .max(50000, 'Queue size cannot exceed 50,000 requests'),
  overloadBehavior: z.enum(['reject', 'drop-oldest', 'timeout'], {
    error: 'Overload behavior must be reject, drop-oldest, or timeout',
  }),
  health: z.enum(['healthy', 'degraded', 'down'], {
    error: 'Health must be healthy, degraded, or down',
  }),
  instances: z.number().int().min(1).max(10).optional(),
  databaseTimeoutMs: z.number().min(50).max(60000).optional(),
  cacheTimeoutMs: z.number().min(10).max(30000).optional(),
  variabilityCv: z.number().min(0).max(5).optional(),
  retryPolicy: RetryPolicySchema.optional(),
  autoscaling: AutoscalingPolicySchema.optional(),
  circuitBreaker: CircuitBreakerPolicySchema.optional(),
  connectionLimits: ConnectionLimitsConfigSchema.optional(),
  hardening: HardeningOptionsSchema.optional(),
  asyncWriteShare: z.number().min(0).max(100).optional(),
  enqueueLatencyMs: z.number().min(0).max(1000).optional(),
});

export const CacheConfigSchema = z.object({
  capacityMb: z
    .number({ error: 'Cache capacity must be a number' })
    .min(16, 'Cache capacity must be at least 16 MB')
    .max(1048576, 'Cache capacity cannot exceed 1,048,576 MB'),
  lookupLatencyMs: z
    .number({ error: 'Lookup latency must be a number' })
    .min(0.1, 'Lookup latency must be at least 0.1 ms')
    .max(100, 'Lookup latency cannot exceed 100 ms'),
  hitRatio: z
    .number({ error: 'Hit ratio must be a number' })
    .min(0, 'Hit ratio cannot be less than 0%')
    .max(100, 'Hit ratio cannot exceed 100%'),
  ttlSeconds: z
    .number({ error: 'TTL must be a number' })
    .min(1, 'TTL must be at least 1 second')
    .max(604800, 'TTL cannot exceed 604,800 seconds (7 days)'),
  populateOnMiss: z.boolean({ error: 'Populate on miss must be true or false' }),
  variabilityCv: z.number().min(0).max(5).optional(),
  warmupPeriodMs: z.number().min(0).max(60000).optional(),
});

export const DatabaseConfigSchema = z.object({
  maxQueryThroughputQps: z
    .number({ error: 'Max throughput must be a number' })
    .min(10, 'Database throughput must be at least 10 qps')
    .max(100000, 'Database throughput cannot exceed 100,000 qps'),
  queryLatencyMs: z
    .number({ error: 'Query latency must be a number' })
    .min(1, 'Query latency must be at least 1 ms')
    .max(5000, 'Query latency cannot exceed 5,000 ms'),
  connectionPoolSize: z
    .number({ error: 'Connection pool size must be a number' })
    .min(1, 'Connection pool must be at least 1 connection')
    .max(5000, 'Connection pool cannot exceed 5,000 connections'),
  queueCapacity: z
    .number({ error: 'Queue capacity must be a number' })
    .min(0, 'Queue capacity cannot be negative')
    .max(20000, 'Queue capacity cannot exceed 20,000 queries'),
  readQueryLatencyMs: z
    .number({ error: 'Read query latency must be a number' })
    .min(1, 'Read latency must be at least 1 ms')
    .max(5000, 'Read latency cannot exceed 5,000 ms'),
  writeQueryLatencyMs: z
    .number({ error: 'Write query latency must be a number' })
    .min(1, 'Write latency must be at least 1 ms')
    .max(5000, 'Write latency cannot exceed 5,000 ms'),
  variabilityCv: z.number().min(0).max(5).optional(),
  hardening: HardeningOptionsSchema.optional(),
  readFromReplicasShare: z.number().min(0).max(100).optional(),
  replicationApplyRate: z.number().min(1).max(100000).optional(),
  stalenessThresholdMs: z.number().min(0).max(60000).optional(),
  failover: z
    .object({
      enabled: z.boolean(),
      detectionMs: z.number().min(100).max(60000),
      promotionMs: z.number().min(100).max(60000),
    })
    .optional(),
  shardCount: z.number().int().min(1).max(8).optional(),
  shardKeyDistribution: z.enum(['uniform', 'zipf-skewed']).optional(),
  zipfSkew: z.number().min(0.1).max(5).optional(),
  crossShardQueryShare: z.number().min(0).max(100).optional(),
  crossShardPenaltyMultiplier: z.number().min(1).max(10).optional(),
});

export const ApiGatewayPerRouteLimitSchema = z.object({
  routeId: z.string().min(1),
  limitRps: z.number().min(1),
  scope: z.enum(['per-source', 'global']),
});

export const ApiGatewayResponseCachingSchema = z.object({
  enabled: z.boolean(),
  ttlSeconds: z.number().min(1),
  cacheableRoutes: z.array(z.string()),
});

export const ApiGatewayConfigSchema = z.object({
  capacityRps: z.number().min(10),
  processingLatencyMs: z.number().min(0.1),
  backendAlgorithm: z.enum(['round-robin', 'weighted-round-robin', 'least-connections', 'random']),
  authEnabled: z.boolean(),
  authLatencyMs: z.number().min(0),
  authCacheHitRatio: z.number().min(0).max(100),
  perRouteLimits: z.array(ApiGatewayPerRouteLimitSchema),
  upstreamTimeoutMs: z.number().min(100),
  retryPolicy: RetryPolicySchema,
  responseCaching: ApiGatewayResponseCachingSchema,
  circuitBreaker: CircuitBreakerPolicySchema.optional(),
  connectionLimits: ConnectionLimitsConfigSchema.optional(),
});

export const MessageQueueConfigSchema = z.object({
  capacityRps: z.number().min(10),
  processingLatencyMs: z.number().min(0.1),
  maxQueueDepth: z.number().min(1),
  enqueueLatencyMs: z.number().min(0),
  retentionSeconds: z.number().min(1),
  overflowBehavior: z.enum(['reject', 'drop-oldest']),
});

export const WorkerConfigSchema = z.object({
  instances: z.number().int().min(1).max(10),
  concurrency: z.number().int().min(1).max(100),
  avgProcessingMs: z.number().min(1),
  maxRetries: z.number().int().min(0).max(10),
  writeCostToDatabase: z.number().min(0).max(10),
});

export const DatabaseReplicaConfigSchema = z.object({
  capacityQps: z.number().min(10),
  queryLatencyMs: z.number().min(1),
});

export const CONFIG_SCHEMAS: Record<ComponentType, z.ZodTypeAny> = {
  client: ClientConfigSchema,
  dns: DnsConfigSchema,
  router: RouterConfigSchema,
  'load-balancer': LoadBalancerConfigSchema,
  'app-server': AppServerConfigSchema,
  cache: CacheConfigSchema,
  database: DatabaseConfigSchema,
  cdn: CdnConfigSchema,
  firewall: FirewallConfigSchema,
  waf: WafConfigSchema,
  'rate-limiter': RateLimiterConfigSchema,
  'api-gateway': ApiGatewayConfigSchema,
  'message-queue': MessageQueueConfigSchema,
  worker: WorkerConfigSchema,
  'database-replica': DatabaseReplicaConfigSchema,
};

/**
 * Validate configuration for a specific component type.
 */
export function validateNodeConfig(
  type: ComponentType,
  config: unknown
): { valid: boolean; errors: string[] } {
  const schema = CONFIG_SCHEMAS[type];
  if (!schema) return { valid: true, errors: [] };

  const parsed = schema.safeParse(config);
  if (parsed.success) {
    return { valid: true, errors: [] };
  }

  const errors = parsed.error.issues.map(
    (issue) => `${issue.path.join('.') || type}: ${issue.message}`
  );
  return { valid: false, errors };
}

export const AnyConfigSchema = z.any();

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  type: ComponentTypeSchema,
  config: AnyConfigSchema,
  label: z.string().optional(),
});

export const EdgeLatencyConfigSchema = z.object({
  preset: z.string().optional(),
  baseLatencyMs: z.number().min(0).max(10000),
  jitterMs: z.number().min(0).max(5000),
  packetLossPct: z.number().min(0).max(100),
});

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.enum(['request', 'async', 'replication']),
  isLookup: z.boolean().optional(),
  latency: EdgeLatencyConfigSchema.optional(),
});

export const GraphConfigSchema = z.object({
  version: z.number().int().positive(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});
