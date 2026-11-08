/**
 * API Gateway Behavior Model (Phase 9).
 * Pure TypeScript with ZERO React, DOM, or network dependencies.
 * Handles token authentication, per-route rate limiting, edge response caching,
 * and backend routing across application servers.
 */

import { ApiGatewayConfig } from '../../types/components';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export interface ApiGatewayEvaluationResult {
  action: 'pass' | 'reject-429' | 'reject-401' | 'response-cache-hit';
  reason?: 'ROUTE_RATE_LIMITED' | 'AUTH_FAILED' | 'RESPONSE_CACHE_HIT' | 'CAPACITY_OVERLOAD';
  addedLatencyMs: number;
  isAuthCached?: boolean;
}

/**
 * Evaluates a request passing through the API Gateway.
 */
export function evaluateApiGateway(params: {
  config: ApiGatewayConfig;
  routeId: string;
  kind?: string;
  cacheable?: boolean;
  isMalicious?: boolean;
  attackKind?: string;
  sourceCount?: number;
  routeRps?: number;
  totalInflowRps?: number;
  prngRoll?: number;
}): ApiGatewayEvaluationResult {
  const {
    config,
    routeId,
    kind,
    cacheable,
    isMalicious,
    attackKind,
    sourceCount = 1,
    routeRps = 100,
    totalInflowRps = 500,
    prngRoll = 0.5,
  } = params;

  // 1. Capacity Overload Check
  if (config.capacityRps > 0 && totalInflowRps > config.capacityRps * 1.5) {
    return {
      action: 'reject-429',
      reason: 'CAPACITY_OVERLOAD',
      addedLatencyMs: config.processingLatencyMs,
    };
  }

  // 2. Per-Route Rate Limiting Check
  const routeLimit = config.perRouteLimits?.find((rl) => rl.routeId === routeId);
  if (routeLimit && routeLimit.limitRps > 0) {
    const effectiveLimit =
      routeLimit.scope === 'per-source'
        ? routeLimit.limitRps * Math.max(1, sourceCount)
        : routeLimit.limitRps;

    if (routeRps > effectiveLimit) {
      // Exceeded route threshold
      return {
        action: 'reject-429',
        reason: 'ROUTE_RATE_LIMITED',
        addedLatencyMs: Math.max(0.2, config.processingLatencyMs * 0.5),
      };
    }
  }

  // 3. Response Caching Check
  // Hits never reach App Servers, terminating immediately at edge
  if (
    config.responseCaching?.enabled &&
    cacheable &&
    config.responseCaching.cacheableRoutes?.includes(routeId)
  ) {
    // Attack traffic with cache-busting bypasses response cache
    if (!(isMalicious && attackKind === 'cache-busting-flood')) {
      // 80% baseline cache hit ratio for cacheable routes at API Gateway
      const isCacheHit = prngRoll < 0.8;
      if (isCacheHit) {
        return {
          action: 'response-cache-hit',
          reason: 'RESPONSE_CACHE_HIT',
          addedLatencyMs: Math.max(0.5, config.processingLatencyMs * 0.6),
        };
      }
    }
  }

  // 4. Authentication Check
  let authLatency = 0;
  let isAuthCached = false;
  if (config.authEnabled && kind !== 'static') {
    const cacheHitProb = (config.authCacheHitRatio ?? 80) / 100;
    if (prngRoll < cacheHitProb) {
      isAuthCached = true;
      authLatency = 1.0; // Fast in-memory token cache lookup
    } else {
      isAuthCached = false;
      authLatency = Math.max(1.0, config.authLatencyMs ?? 15); // Full auth service RPC
    }

    // Brute-force credential stuffing attacks fail auth with high probability
    if (isMalicious && (attackKind === 'brute-force' || kind === 'auth') && prngRoll > 0.05) {
      return {
        action: 'reject-401',
        reason: 'AUTH_FAILED',
        addedLatencyMs: authLatency + config.processingLatencyMs,
        isAuthCached,
      };
    }
  }

  // 5. Passed through to backend
  return {
    action: 'pass',
    addedLatencyMs: Math.max(0.5, config.processingLatencyMs) + authLatency,
    isAuthCached,
  };
}

export const apiGatewayModel: ComponentBehaviorModel<ApiGatewayConfig> = {
  getEffectiveCapacityRps(config: ApiGatewayConfig): number {
    return Math.max(10, config.capacityRps);
  },

  getServiceTimeMs(config: ApiGatewayConfig): number {
    return Math.max(0.1, config.processingLatencyMs);
  },

  getUtilization(arrivalRateRps: number, config: ApiGatewayConfig): number {
    return arrivalRateRps / Math.max(1, config.capacityRps);
  },

  decideOverflow(queueLength: number, config: ApiGatewayConfig): OverflowDecision {
    const queueLimit = Math.max(500, Math.floor(config.capacityRps / 10));
    if (queueLength >= queueLimit) return 'reject';
    if (queueLength > 0) return 'queue';
    return 'accept';
  },
};
