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

// --- Core Component Configs ---

export interface ClientConfig {
  readRatio: number; // Share of read vs write requests (0 to 100%, default 80%)
  requestTimeoutMs: number; // Max wait time for response before timing out (default 5000ms)
  rps: number; // Generated request rate (default 500 rps)
}

export interface DnsConfig {
  lookupLatencyMs: number; // Time to resolve DNS record (default 15ms)
  ttlSeconds: number; // Time-to-live for cached DNS entries (default 300s)
  cacheHitRatio: number; // Percentage of requests resolved from local DNS cache (0 to 100%, default 90%)
}

export interface RouterConfig {
  capacityRps: number; // Maximum packet forwarding capacity (default 50000 rps)
  processingLatencyMs: number; // Hardware routing latency per packet (default 2ms)
  queueLimit: number; // Buffer limit for queued packets (default 1000)
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
}

export interface CacheConfig {
  capacityMb: number; // In-memory cache storage in MB (default 1024)
  lookupLatencyMs: number; // Memory access time (default 3ms)
  hitRatio: number; // Percentage of read requests found in cache (0 to 100%, default 85%)
  ttlSeconds: number; // Expiration lifetime for cache entries (default 3600s)
  populateOnMiss: boolean; // Whether cache misses load data into cache (default true)
}

export interface DatabaseConfig {
  maxQueryThroughputQps: number; // Database operations limit (default 500 qps)
  queryLatencyMs: number; // Default baseline query execution time (default 45ms)
  connectionPoolSize: number; // Maximum open active client connections (default 100)
  queueCapacity: number; // Pending query buffer size (default 200)
  readQueryLatencyMs: number; // Optimized read query latency (default 30ms)
  writeQueryLatencyMs: number; // Transactional write query latency (default 60ms)
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
