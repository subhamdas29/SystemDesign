/**
 * Workload routes and traffic mix definitions (Phase 9).
 * Defines per-route shares, kinds, cost multipliers, and cacheability.
 * Guarantees 100% backward compatibility with readRatio.
 */

import { z } from 'zod';

export type RouteKind = 'read' | 'write' | 'auth' | 'static';

export interface WorkloadRoute {
  id: string;
  label: string;
  share: number; // percentage (0 to 100), all route shares sum to 100
  kind: RouteKind;
  costMultiplier: number; // compute/query cost multiplier (default 1.0)
  cacheable: boolean;
}

export const RouteKindSchema = z.enum(['read', 'write', 'auth', 'static']);

export const WorkloadRouteSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  share: z.number().min(0).max(100),
  kind: RouteKindSchema,
  costMultiplier: z.number().min(0.1).max(50),
  cacheable: z.boolean(),
});

export type WorkloadRoutePresetId = 'simple-read-write' | 'ecommerce' | 'social-feed' | 'login-heavy';

export interface WorkloadRoutePreset {
  id: WorkloadRoutePresetId;
  label: string;
  description: string;
  routes: WorkloadRoute[];
}

export const WORKLOAD_ROUTE_PRESETS: Record<WorkloadRoutePresetId, WorkloadRoutePreset> = {
  'simple-read-write': {
    id: 'simple-read-write',
    label: 'Simple Read/Write',
    description: 'Standard web application with 80% read queries and 20% write transactions.',
    routes: [
      { id: 'route-read', label: 'Read Queries', share: 80, kind: 'read', costMultiplier: 1.0, cacheable: true },
      { id: 'route-write', label: 'Write Transactions', share: 20, kind: 'write', costMultiplier: 1.0, cacheable: false },
    ],
  },
  ecommerce: {
    id: 'ecommerce',
    label: 'E-commerce',
    description: 'Product catalog browsing, user authentication, and multi-item checkout transactions.',
    routes: [
      { id: 'route-browse', label: 'Product Catalog Browse', share: 60, kind: 'read', costMultiplier: 1.0, cacheable: true },
      { id: 'route-checkout', label: 'Cart & Checkout', share: 25, kind: 'write', costMultiplier: 2.0, cacheable: false },
      { id: 'route-auth', label: 'User Login & Auth', share: 10, kind: 'auth', costMultiplier: 1.5, cacheable: false },
      { id: 'route-static', label: 'Static Product Images', share: 5, kind: 'static', costMultiplier: 0.5, cacheable: true },
    ],
  },
  'social-feed': {
    id: 'social-feed',
    label: 'Social Feed',
    description: 'High read-heavy timeline feeds, likes/reactions, and token validation.',
    routes: [
      { id: 'route-feed', label: 'Timeline Feed Reads', share: 85, kind: 'read', costMultiplier: 1.0, cacheable: true },
      { id: 'route-post', label: 'Posts & Reactions', share: 10, kind: 'write', costMultiplier: 1.2, cacheable: false },
      { id: 'route-session', label: 'Session Token Check', share: 5, kind: 'auth', costMultiplier: 1.0, cacheable: false },
    ],
  },
  'login-heavy': {
    id: 'login-heavy',
    label: 'Login-Heavy',
    description: 'Heavy identity provider and SSO traffic with password verification and token generation.',
    routes: [
      { id: 'route-login', label: 'SSO & Password Verify', share: 40, kind: 'auth', costMultiplier: 2.0, cacheable: false },
      { id: 'route-account', label: 'Account Data Read', share: 40, kind: 'read', costMultiplier: 1.0, cacheable: true },
      { id: 'route-update', label: 'Profile Updates', share: 20, kind: 'write', costMultiplier: 1.5, cacheable: false },
    ],
  },
};

/**
 * Returns effective routes for a client configuration.
 * If client.routes is non-empty, returns client.routes.
 * Otherwise, synthesizes two routes exactly matching the client's readRatio:
 * - default-read: share = readRatio, kind = 'read', cacheable = true
 * - default-write: share = 100 - readRatio, kind = 'write', cacheable = false
 */
export function getEffectiveRoutes(clientConfig?: {
  routes?: WorkloadRoute[];
  readRatio?: number;
}): WorkloadRoute[] {
  if (clientConfig?.routes && clientConfig.routes.length > 0) {
    return clientConfig.routes;
  }
  const readRatio = clientConfig?.readRatio ?? 80;
  return [
    {
      id: 'default-read',
      label: 'Read Queries',
      share: readRatio,
      kind: 'read',
      costMultiplier: 1.0,
      cacheable: true,
    },
    {
      id: 'default-write',
      label: 'Write Transactions',
      share: Math.max(0, 100 - readRatio),
      kind: 'write',
      costMultiplier: 1.0,
      cacheable: false,
    },
  ];
}

/**
 * Deterministically picks a route given a random roll in [0, 1).
 */
export function pickRouteFromRoll(routes: WorkloadRoute[], roll: number): WorkloadRoute {
  if (routes.length === 0) {
    return {
      id: 'default-read',
      label: 'Read Queries',
      share: 100,
      kind: 'read',
      costMultiplier: 1.0,
      cacheable: true,
    };
  }

  const totalShare = routes.reduce((sum, r) => sum + r.share, 0);
  if (totalShare <= 0) return routes[0]!;

  const target = roll * totalShare;
  let accumulated = 0;
  for (const route of routes) {
    accumulated += route.share;
    if (target < accumulated) {
      return route;
    }
  }

  return routes[routes.length - 1]!;
}
