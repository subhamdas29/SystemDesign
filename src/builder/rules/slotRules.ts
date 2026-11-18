/**
 * Component slot rules and metadata.
 * Pure data definitions editable by system architects.
 * Governs where components can be placed in the request path and prerequisites.
 */

import { z } from 'zod';
import { ComponentType, ComponentTypeSchema } from '../../types';

export type PathBehavior = 'forward' | 'lookup' | 'terminal';
export type ReleaseVersion = 'v1' | 'later';

export interface PrerequisiteRule {
  type?: ComponentType;
  anyOf?: ComponentType[];
  reason: string;
}

export interface ComponentSlotRule {
  type: ComponentType;
  label: string;
  slot: number; // Tier order: 1 (Client) to 11 (Database)
  maxCount: number;
  minCount: number;
  fanOut: boolean;
  requires: PrerequisiteRule[];
  swapGroup?: string;
  removable: boolean;
  pathBehavior: PathBehavior;
  enabledInRelease: ReleaseVersion;
  whyHere: string;
}

export const PrerequisiteRuleSchema = z.object({
  type: ComponentTypeSchema.optional(),
  anyOf: z.array(ComponentTypeSchema).optional(),
  reason: z.string().min(1),
});

export const ComponentSlotRuleSchema = z.object({
  type: ComponentTypeSchema,
  label: z.string().min(1),
  slot: z.number().int().min(1).max(20),
  maxCount: z.number().int().positive(),
  minCount: z.number().int().nonnegative(),
  fanOut: z.boolean(),
  requires: z.array(PrerequisiteRuleSchema),
  swapGroup: z.string().optional(),
  removable: z.boolean(),
  pathBehavior: z.enum(['forward', 'lookup', 'terminal']),
  enabledInRelease: z.enum(['v1', 'later']),
  whyHere: z.string().min(1),
});

export const COMPONENT_RULES: Record<ComponentType, ComponentSlotRule> = {
  client: {
    type: 'client',
    label: 'Client Device',
    slot: 1,
    maxCount: 1,
    minCount: 1,
    fanOut: false,
    requires: [],
    removable: false,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Originates user requests (web browsers, mobile apps) into your architecture.',
  },
  dns: {
    type: 'dns',
    label: 'DNS Resolver',
    slot: 2,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [],
    removable: true,
    pathBehavior: 'lookup',
    enabledInRelease: 'v1',
    whyHere: 'Translates domain names into destination IP addresses before traffic connects.',
  },
  cdn: {
    type: 'cdn',
    label: 'Content Delivery Network',
    slot: 3,
    maxCount: 1,
    minCount: 1,
    fanOut: false,
    requires: [],
    removable: false,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Caches static and edge content globally close to users to reduce origin traffic.',
  },
  router: {
    type: 'router',
    label: 'Network Router',
    slot: 4,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [],
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Directs incoming network packets across network hops toward the system boundary.',
  },
  firewall: {
    type: 'firewall',
    label: 'Network Firewall',
    slot: 5,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [],
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Filters network traffic based on IP protocols, ports, and packet inspection rules.',
  },
  waf: {
    type: 'waf',
    label: 'Web App Firewall (WAF)',
    slot: 6,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [],
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Inspects HTTP payload layer to intercept SQL injection, XSS, and exploit attacks.',
  },
  'rate-limiter': {
    type: 'rate-limiter',
    label: 'Rate Limiter',
    slot: 7,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [],
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Enforces request limits per client to shield downstream services from traffic floods.',
  },
  'load-balancer': {
    type: 'load-balancer',
    label: 'Load Balancer',
    slot: 8,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [],
    swapGroup: 'entry-point',
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Distributes incoming traffic across multiple application server instances.',
  },
  'api-gateway': {
    type: 'api-gateway',
    label: 'API Gateway',
    slot: 8,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [],
    swapGroup: 'entry-point',
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Unifies API routing, SSL termination, and authentication at the cluster boundary.',
  },
  'app-server': {
    type: 'app-server',
    label: 'App Server',
    slot: 9,
    maxCount: 10,
    minCount: 1,
    fanOut: true,
    requires: [], // Handled dynamically in canAdd: 2nd+ requires entry-point
    removable: true, // Cannot remove last one
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Executes core application logic, coordinates business workflows, and queries databases.',
  },
  cache: {
    type: 'cache',
    label: 'In-Memory Cache',
    slot: 10,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [
      {
        type: 'database',
        reason: 'A cache needs a Database behind it to store persistent records on cache misses.',
      },
      {
        type: 'app-server',
        reason: 'A cache needs an App Server in front of it to perform read and write lookups.',
      },
    ],
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Serves frequent database reads from high-speed memory to drop latency and DB load.',
  },
  database: {
    type: 'database',
    label: 'Primary Database',
    slot: 11,
    maxCount: 1,
    minCount: 1,
    fanOut: false,
    requires: [],
    removable: true, // Cannot remove if cache depends on it or if it's the only primary
    pathBehavior: 'terminal',
    enabledInRelease: 'v1',
    whyHere: 'The authoritative source of persistent data for all business transactions.',
  },
  'message-queue': {
    type: 'message-queue',
    label: 'Message Queue',
    slot: 9,
    maxCount: 1,
    minCount: 0,
    fanOut: false,
    requires: [
      {
        type: 'app-server',
        reason: 'A message queue requires an App Server to enqueue background tasks.',
      },
      {
        type: 'database',
        reason: 'A message queue requires a Database for background workers to persist jobs.',
      },
    ],
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Buffers asynchronous write traffic and decouples long-running background tasks from immediate user request latency.',
  },
  worker: {
    type: 'worker',
    label: 'Async Worker',
    slot: 10,
    maxCount: 10,
    minCount: 0,
    fanOut: true,
    requires: [
      {
        type: 'message-queue',
        reason: 'Async workers require a Message Queue to pull background jobs from.',
      },
    ],
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Pulls background tasks asynchronously from the queue and commits completed jobs to the database.',
  },
  'database-replica': {
    type: 'database-replica',
    label: 'Read Replica',
    slot: 11,
    maxCount: 5,
    minCount: 0,
    fanOut: true,
    requires: [
      {
        type: 'database',
        reason: 'A read replica requires a Primary Database to replicate data from.',
      },
    ],
    removable: true,
    pathBehavior: 'forward',
    enabledInRelease: 'v1',
    whyHere: 'Replicates data from the primary database to serve read-only queries with horizontal scale.',
  },
};

/**
 * Validate all slot rules against Zod schema at runtime.
 */
export function validateRules(): void {
  for (const [key, rule] of Object.entries(COMPONENT_RULES)) {
    ComponentSlotRuleSchema.parse(rule);
    if (key !== rule.type) {
      throw new Error(`Rule key mismatch: ${key} vs ${rule.type}`);
    }
  }
}

// Validate rules immediately on module evaluation
validateRules();
