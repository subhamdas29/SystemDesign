/**
 * Component types and their specific configuration interfaces.
 * Configuration describes what the user designed (static), separate from runtime state.
 */

export const COMPONENT_TYPES = [
  'client',
  'dns',
  'cdn',
  'router',
  'firewall',
  'waf',
  'rate-limiter',
  'load-balancer',
  'api-gateway',
  'app-server',
  'cache',
  'database',
  'message-queue',
  'worker',
  'database-replica',
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

import type {
  FirewallConfig,
  WafConfig,
  RateLimiterConfig,
  CdnConfig,
  AutoscalingPolicy,
  CircuitBreakerPolicy,
  ConnectionLimitsConfig,
  HardeningOptions,
} from './defenses';

export type {
  FirewallConfig,
  WafConfig,
  RateLimiterConfig,
  CdnConfig,
  AutoscalingPolicy,
  CircuitBreakerPolicy,
  ConnectionLimitsConfig,
  HardeningOptions,
};

export type RetryBackoffType = 'none' | 'fixed' | 'exponential' | 'exponential_jitter';

export type RetryCondition = 'timeout' | '5xx' | 'rejected' | 'connection_failure';

export interface RetryPolicy {
  maxAttempts: number; // 1 to 5 (1 = no retries)
  retryOn: RetryCondition[];
  backoff: RetryBackoffType;
  baseDelayMs: number;
  maxDelayMs: number;
  retryBudgetPct?: number; // 0 = unlimited, or e.g. 20 (max 20% retries)
}

export type RetryPresetName = 'none' | 'naive' | 'exponential_jitter';

export const RETRY_PRESETS: Record<RetryPresetName, RetryPolicy> = {
  none: {
    maxAttempts: 1,
    retryOn: ['timeout', '5xx'],
    backoff: 'none',
    baseDelayMs: 0,
    maxDelayMs: 0,
  },
  naive: {
    maxAttempts: 3,
    retryOn: ['timeout', '5xx', 'rejected'],
    backoff: 'none',
    baseDelayMs: 0,
    maxDelayMs: 0,
  },
  exponential_jitter: {
    maxAttempts: 3,
    retryOn: ['timeout', '5xx', 'rejected'],
    backoff: 'exponential_jitter',
    baseDelayMs: 100,
    maxDelayMs: 2000,
    retryBudgetPct: 20,
  },
};

// --- Core Component Configs ---

import type { WorkloadRoute } from './routes';

export type { WorkloadRoute };

export interface ClientConfig {
  readRatio: number; // Share of read vs write requests (0 to 100%, default 80%)
  requestTimeoutMs: number; // Max wait time for response before timing out (default 5000ms)
  rps: number; // Generated request rate (default 500 rps)
  uniqueUsers?: number; // Unique legitimate source users (default derived from RPS, max 10,000)
  variabilityCv?: number; // Coefficient of variation for client pacing (default 0.5)
  retryPolicy?: RetryPolicy; // Client-side request retry policy
  routes?: WorkloadRoute[]; // Phase 9: Custom workload routes breakdown
}

export interface DnsConfig {
  lookupLatencyMs: number; // Time to resolve DNS record (default 15ms)
  ttlSeconds: number; // Time-to-live for cached DNS entries (default 300s)
  cacheHitRatio: number; // Percentage of requests resolved from local DNS cache (0 to 100%, default 90%)
  variabilityCv?: number; // Lognormal latency coefficient of variation (default 0.5)
}

export interface RouterConfig {
  capacityRps: number; // Maximum packet forwarding capacity (default 50000 rps)
  processingLatencyMs: number; // Hardware routing latency per packet (default 2ms)
  queueLimit: number; // Buffer limit for queued packets (default 1000)
  variabilityCv?: number; // Lognormal latency coefficient of variation (default 0.5)
}

export type LoadBalancerAlgorithm =
  | 'round-robin'
  | 'weighted-round-robin'
  | 'least-connections'
  | 'random';

export interface LoadBalancerConfig {
  algorithm: LoadBalancerAlgorithm;
  capacityRps: number; // Max traffic routing capacity (default 50000 rps)
  processingLatencyMs: number; // Overhead per routed request (default 3ms)
  queueLimit: number; // Max queued requests before backpressure (default 2000)
  healthCheckIntervalMs: number; // How often backends are polled (default 5000ms)
  upstreamTimeoutMs?: number; // Timeout waiting for upstream backend (default 5000ms)
  unhealthyThreshold?: number; // Consecutive probe failures to mark down (default 3)
  healthyThreshold?: number; // Consecutive probe successes to mark up (default 2)
  variabilityCv?: number; // Lognormal latency coefficient of variation (default 0.5)
  retryPolicy?: RetryPolicy; // Upstream request retry policy
  perBackendWeights?: Record<string, number>; // Backend instance weights (1 to 100)
  circuitBreaker?: CircuitBreakerPolicy; // Upstream backend circuit breaker
  connectionLimits?: ConnectionLimitsConfig; // Ingress connection ceiling
}

export type AppServerOverloadBehavior = 'reject' | 'drop-oldest' | 'timeout';
export type ComponentHealth = 'healthy' | 'degraded' | 'down';

export interface AppServerConfig {
  maxThroughputRps: number; // Theoretical ceiling throughput (default 1000 rps)
  maxConcurrentRequests: number; // Max parallel active execution threads (default 150)
  avgProcessingTimeMs: number; // Average application compute time per request (default 35ms)
  cpuCores: number; // Available CPU cores (default 4)
  memoryMb: number; // Total allocated application RAM in MB (default 4096)
  queueSize: number; // Request queue buffer size (default 500)
  overloadBehavior: AppServerOverloadBehavior; // Action when queue fills (default 'reject')
  health: ComponentHealth; // Operational status (default 'healthy')
  instances?: number; // Active instance count (default 1, managed by autoscaling)
  databaseTimeoutMs?: number; // Max wait time for database response (default 3000ms)
  cacheTimeoutMs?: number; // Max wait time for cache response (default 500ms)
  variabilityCv?: number; // Lognormal service time variability CV (default 0.5)
  retryPolicy?: RetryPolicy; // Retry policy for downstream DB/cache calls
  autoscaling?: AutoscalingPolicy; // Horizontal pod/server autoscaling policy
  circuitBreaker?: CircuitBreakerPolicy; // Downstream dependency circuit breaker
  connectionLimits?: ConnectionLimitsConfig; // Sockets and slowloris connection limits
  hardening?: HardeningOptions; // Host and runtime security hardening

  // Phase 9: Async worker write offloading
  asyncWriteShare?: number; // Share of write requests enqueued asynchronously (0 to 100%, default 80%)
  enqueueLatencyMs?: number; // Client latency overhead to enqueue to message queue (default 4ms)
}

export interface CacheConfig {
  capacityMb: number; // In-memory cache storage in MB (default 1024)
  lookupLatencyMs: number; // Memory access time (default 3ms)
  hitRatio: number; // Percentage of read requests found in cache (0 to 100%, default 85%)
  ttlSeconds: number; // Expiration lifetime for cache entries (default 3600s)
  populateOnMiss: boolean; // Whether cache misses load data into cache (default true)
  variabilityCv?: number; // Lognormal latency coefficient of variation (default 0.5)
  warmupPeriodMs?: number; // Time in ms to ramp from cold to target hit ratio after flush (default 10000ms)
}

export interface DatabaseFailoverConfig {
  enabled: boolean;
  detectionMs: number; // Failure detection timeout before promotion (default 3000ms)
  promotionMs: number; // Time required to promote replica to primary (default 2000ms)
}

export interface DatabaseConfig {
  maxQueryThroughputQps: number; // Database operations limit (default 500 qps)
  queryLatencyMs: number; // Default baseline query execution time (default 45ms)
  connectionPoolSize: number; // Maximum open active client connections (default 100)
  queueCapacity: number; // Pending query buffer size (default 200)
  readQueryLatencyMs: number; // Optimized read query latency (default 30ms)
  writeQueryLatencyMs: number; // Transactional write query latency (default 60ms)
  variabilityCv?: number; // Lognormal query latency variability CV (default 0.5)
  hardening?: HardeningOptions; // Least-privilege & injection hardening

  // Phase 9: Read Replicas
  readFromReplicasShare?: number; // Share of read queries routed to read replicas (0 to 100%, default 90%)
  replicationApplyRate?: number; // Max write transactions replicas can apply per sec (default 300)
  stalenessThresholdMs?: number; // Replication lag threshold for stale read warning (default 1000ms)
  failover?: DatabaseFailoverConfig;

  // Phase 9: Sharding
  shardCount?: number; // Shard partition count: 1, 2, 4, 8 (default 1)
  shardKeyDistribution?: 'uniform' | 'zipf-skewed'; // Key distribution pattern (default 'uniform')
  zipfSkew?: number; // Skew parameter s (default 1.2)
  crossShardQueryShare?: number; // Percentage of queries spanning multiple shards (default 10%)
  crossShardPenaltyMultiplier?: number; // Latency and throughput multiplier on cross-shard queries (default 1.5)
}

// --- Phase 9 Components ---

export interface ApiGatewayPerRouteLimit {
  routeId: string;
  limitRps: number;
  scope: 'per-source' | 'global';
}

export interface ApiGatewayResponseCaching {
  enabled: boolean;
  ttlSeconds: number;
  cacheableRoutes: string[]; // List of routeIds eligible for edge caching
}

export interface ApiGatewayConfig {
  capacityRps: number; // Max gateway routing capacity (default 50000 rps)
  processingLatencyMs: number; // Base gateway overhead (default 4ms)
  backendAlgorithm: LoadBalancerAlgorithm; // Algorithm for routing to app servers
  authEnabled: boolean; // Whether token/credential authentication is verified
  authLatencyMs: number; // Latency cost of full auth check on miss (default 15ms)
  authCacheHitRatio: number; // Percentage of auth verifications served from cache (default 80%)
  perRouteLimits: ApiGatewayPerRouteLimit[]; // Per-route rate limits
  upstreamTimeoutMs: number; // Timeout waiting for upstream response (default 5000ms)
  retryPolicy: RetryPolicy; // Upstream request retry policy
  responseCaching: ApiGatewayResponseCaching; // Edge response caching policy
  circuitBreaker?: CircuitBreakerPolicy;
  connectionLimits?: ConnectionLimitsConfig;
}

export interface MessageQueueConfig {
  capacityRps: number; // Maximum queue enqueue throughput (default 25000 rps)
  processingLatencyMs: number; // Broker overhead per message (default 2ms)
  maxQueueDepth: number; // Max messages buffered in memory/disk (default 50000)
  enqueueLatencyMs: number; // Producer enqueue round-trip time (default 4ms)
  retentionSeconds: number; // Message retention period (default 86400s / 24h)
  overflowBehavior: 'reject' | 'drop-oldest'; // Behavior when maxQueueDepth is exceeded
}

export interface WorkerConfig {
  instances: number; // Number of parallel worker server instances (1 to 10, default 2)
  concurrency: number; // Parallel jobs per worker instance (default 5)
  avgProcessingMs: number; // Background job processing compute time (default 80ms)
  maxRetries: number; // Retries before pushing to dead-letter counter (default 3)
  writeCostToDatabase: number; // Number of DB write operations per completed job (default 1)
}

export interface DatabaseReplicaConfig {
  capacityQps: number; // Read query limit for this replica instance (default 800 qps)
  queryLatencyMs: number; // Optimized read execution latency (default 25ms)
}

export type AnyComponentConfig =
  | ClientConfig
  | DnsConfig
  | RouterConfig
  | LoadBalancerConfig
  | AppServerConfig
  | CacheConfig
  | DatabaseConfig
  | CdnConfig
  | FirewallConfig
  | WafConfig
  | RateLimiterConfig
  | ApiGatewayConfig
  | MessageQueueConfig
  | WorkerConfig
  | DatabaseReplicaConfig;
