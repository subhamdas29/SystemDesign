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
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

// --- Retry Policies & Presets ---

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

export interface ClientConfig {
  readRatio: number; // Share of read vs write requests (0 to 100%, default 80%)
  requestTimeoutMs: number; // Max wait time for response before timing out (default 5000ms)
  rps: number; // Generated request rate (default 500 rps)
  variabilityCv?: number; // Coefficient of variation for client pacing (default 0.5)
  retryPolicy?: RetryPolicy; // Client-side request retry policy
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
  databaseTimeoutMs?: number; // Max wait time for database response (default 3000ms)
  cacheTimeoutMs?: number; // Max wait time for cache response (default 500ms)
  variabilityCv?: number; // Lognormal service time variability CV (default 0.5)
  retryPolicy?: RetryPolicy; // Retry policy for downstream DB/cache calls
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

export interface DatabaseConfig {
  maxQueryThroughputQps: number; // Database operations limit (default 500 qps)
  queryLatencyMs: number; // Default baseline query execution time (default 45ms)
  connectionPoolSize: number; // Maximum open active client connections (default 100)
  queueCapacity: number; // Pending query buffer size (default 200)
  readQueryLatencyMs: number; // Optimized read query latency (default 30ms)
  writeQueryLatencyMs: number; // Transactional write query latency (default 60ms)
  variabilityCv?: number; // Lognormal query latency variability CV (default 0.5)
}

// --- Auxiliary / Later Component Config Stubs ---

export interface CdnConfig {
  capacityRps: number;
  processingLatencyMs: number;
  hitRatio: number;
  cacheTtlSeconds: number;
}

export interface FirewallConfig {
  capacityRps: number;
  processingLatencyMs: number;
  dropRate: number;
}

export interface WafConfig {
  capacityRps: number;
  processingLatencyMs: number;
  inspectionDepthMs: number;
  blockMaliciousOnly: boolean;
}

export interface RateLimiterConfig {
  capacityRps: number;
  processingLatencyMs: number;
  maxTokens: number;
  refillRatePerSec: number;
}

export interface ApiGatewayConfig {
  capacityRps: number;
  processingLatencyMs: number;
  rateLimitEnabled: boolean;
  authValidationMs: number;
}

export interface MessageQueueConfig {
  capacityRps: number;
  processingLatencyMs: number;
  maxQueueDepth: number;
  retentionHours: number;
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
  | MessageQueueConfig;
