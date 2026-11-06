/**
 * Zod validation schemas for GraphConfig and node configurations.
 */

import { z } from 'zod';
import { COMPONENT_TYPES } from './components';

export const ComponentTypeSchema = z.enum(COMPONENT_TYPES);

const BaseConfigSchema = z.object({
  capacity: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
});

export const ClientConfigSchema = BaseConfigSchema.extend({
  rps: z.number().positive(),
  trafficPattern: z.enum(['constant', 'spike', 'step']),
});

export const DnsConfigSchema = BaseConfigSchema.extend({
  ttlSeconds: z.number().positive(),
});

export const CdnConfigSchema = BaseConfigSchema.extend({
  hitRatio: z.number().min(0).max(1),
  cacheTtlSeconds: z.number().positive(),
});

export const RouterConfigSchema = BaseConfigSchema.extend({
  algorithm: z.enum(['static', 'dynamic']),
});

export const FirewallConfigSchema = BaseConfigSchema.extend({
  dropRate: z.number().min(0).max(1),
});

export const WafConfigSchema = BaseConfigSchema.extend({
  inspectionDepthMs: z.number().nonnegative(),
  blockMaliciousOnly: z.boolean(),
});

export const RateLimiterConfigSchema = BaseConfigSchema.extend({
  maxTokens: z.number().positive(),
  refillRatePerSec: z.number().positive(),
});

export const LoadBalancerConfigSchema = BaseConfigSchema.extend({
  algorithm: z.enum(['round-robin', 'least-connections', 'ip-hash']),
});

export const ApiGatewayConfigSchema = BaseConfigSchema.extend({
  rateLimitEnabled: z.boolean(),
  authValidationMs: z.number().nonnegative(),
});

export const AppServerConfigSchema = BaseConfigSchema.extend({
  maxConcurrency: z.number().positive(),
  queueSize: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
});

export const CacheConfigSchema = BaseConfigSchema.extend({
  hitRatio: z.number().min(0).max(1),
  maxEntries: z.number().positive(),
  evictionPolicy: z.enum(['lru', 'lfu']),
});

export const DatabaseConfigSchema = BaseConfigSchema.extend({
  maxConnections: z.number().positive(),
  readCapacity: z.number().positive(),
  writeCapacity: z.number().positive(),
});

export const MessageQueueConfigSchema = BaseConfigSchema.extend({
  maxQueueDepth: z.number().positive(),
  retentionHours: z.number().positive(),
});

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
