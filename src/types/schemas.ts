/**
 * Zod validation schemas for GraphConfig and node configurations.
 * Contains clear, beginner-friendly validation error messages.
 */

import { z } from 'zod';
import { COMPONENT_TYPES, ComponentType } from './components';

export const ComponentTypeSchema = z.enum(COMPONENT_TYPES);

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
  perBackendWeights: z.record(z.string(), z.number().min(1).max(100)).optional(),
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
});

// Stubs for remaining components
export const CdnConfigSchema = z.object({
  capacityRps: z.number().min(10),
  processingLatencyMs: z.number().min(0.1),
  hitRatio: z.number().min(0).max(100),
  cacheTtlSeconds: z.number().min(1),
});

export const FirewallConfigSchema = z.object({
  capacityRps: z.number().min(10),
  processingLatencyMs: z.number().min(0.1),
  dropRate: z.number().min(0).max(100),
});

export const WafConfigSchema = z.object({
  capacityRps: z.number().min(10),
  processingLatencyMs: z.number().min(0.1),
  inspectionDepthMs: z.number().min(0),
  blockMaliciousOnly: z.boolean(),
});

export const RateLimiterConfigSchema = z.object({
  capacityRps: z.number().min(10),
  processingLatencyMs: z.number().min(0.1),
  maxTokens: z.number().min(1),
  refillRatePerSec: z.number().min(1),
});

export const ApiGatewayConfigSchema = z.object({
  capacityRps: z.number().min(10),
  processingLatencyMs: z.number().min(0.1),
  rateLimitEnabled: z.boolean(),
  authValidationMs: z.number().min(0),
});

export const MessageQueueConfigSchema = z.object({
  capacityRps: z.number().min(10),
  processingLatencyMs: z.number().min(0.1),
  maxQueueDepth: z.number().min(1),
  retentionHours: z.number().min(1),
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

export const AnyConfigSchema = z.record(z.string(), z.unknown());

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  type: ComponentTypeSchema,
  config: AnyConfigSchema,
  label: z.string().optional(),
});

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.enum(['request', 'replication']),
  isLookup: z.boolean().optional(),
});

export const GraphConfigSchema = z.object({
  version: z.number().int().positive(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});
