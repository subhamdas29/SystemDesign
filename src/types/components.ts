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

export interface BaseComponentConfig {
  capacity: number; // Max RPS or concurrency
  latencyMs: number; // Base processing latency in ms
}

export interface ClientConfig extends BaseComponentConfig {
  rps: number;
  trafficPattern: 'constant' | 'spike' | 'step';
}

export interface DnsConfig extends BaseComponentConfig {
  ttlSeconds: number;
}

export interface CdnConfig extends BaseComponentConfig {
  hitRatio: number; // 0 to 1
  cacheTtlSeconds: number;
}

export interface RouterConfig extends BaseComponentConfig {
  algorithm: 'static' | 'dynamic';
}

export interface FirewallConfig extends BaseComponentConfig {
  dropRate: number; // 0 to 1
}

export interface WafConfig extends BaseComponentConfig {
  inspectionDepthMs: number;
  blockMaliciousOnly: boolean;
}

export interface RateLimiterConfig extends BaseComponentConfig {
  maxTokens: number;
  refillRatePerSec: number;
}

export interface LoadBalancerConfig extends BaseComponentConfig {
  algorithm: 'round-robin' | 'least-connections' | 'ip-hash';
}

export interface ApiGatewayConfig extends BaseComponentConfig {
  rateLimitEnabled: boolean;
  authValidationMs: number;
}

export interface AppServerConfig extends BaseComponentConfig {
  maxConcurrency: number;
  queueSize: number;
  errorRate: number; // 0 to 1
}

export interface CacheConfig extends BaseComponentConfig {
  hitRatio: number; // 0 to 1
  maxEntries: number;
  evictionPolicy: 'lru' | 'lfu';
}

export interface DatabaseConfig extends BaseComponentConfig {
  maxConnections: number;
  readCapacity: number;
  writeCapacity: number;
}

export interface MessageQueueConfig extends BaseComponentConfig {
  maxQueueDepth: number;
  retentionHours: number;
}

export type AnyComponentConfig =
  | ClientConfig
  | DnsConfig
  | CdnConfig
  | RouterConfig
  | FirewallConfig
  | WafConfig
  | RateLimiterConfig
  | LoadBalancerConfig
  | ApiGatewayConfig
  | AppServerConfig
  | CacheConfig
  | DatabaseConfig
  | MessageQueueConfig;
