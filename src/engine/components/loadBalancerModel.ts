/**
 * Pure behavior model for Load Balancer.
 * Implements round-robin, weighted round-robin, least-connections, and random routing
 * with health status filtering.
 */

import { LoadBalancerConfig, ComponentHealth } from '../../types';
import { ComponentBehaviorModel, OverflowDecision } from './types';
import { PRNG } from '../rng';

export interface BackendRuntimeInfo {
  id: string;
  health?: ComponentHealth;
  activeConnections?: number;
  queueDepth?: number;
}

/**
 * Selects the next target backend according to the chosen algorithm.
 * Filters out unhealthy ('down') backends.
 * Returns null if no healthy backends are available.
 */
export function selectBackend(
  algorithm: LoadBalancerConfig['algorithm'],
  backends: string[],
  backendStates: Record<string, BackendRuntimeInfo>,
  rng: PRNG,
  counter = 0,
  weights?: Record<string, number>
): string | null {
  // Filter out backends that are down
  const healthyBackends = backends.filter((id) => {
    const state = backendStates[id];
    return state?.health !== 'down';
  });

  if (healthyBackends.length === 0) {
    return null;
  }

  if (healthyBackends.length === 1) {
    return healthyBackends[0]!;
  }

  switch (algorithm) {
    case 'round-robin': {
      const idx = Math.abs(counter) % healthyBackends.length;
      return healthyBackends[idx]!;
    }

    case 'weighted-round-robin': {
      // Build normalized cumulative weight distribution
      const weightsMap = weights ?? {};
      const weightsList = healthyBackends.map((id) => Math.max(1, weightsMap[id] ?? 10));
      const totalWeight = weightsList.reduce((sum, w) => sum + w, 0);

      // Deterministic cycle over total weight using counter
      const targetPoint = Math.abs(counter) % totalWeight;
      let cumulative = 0;
      for (let i = 0; i < healthyBackends.length; i++) {
        cumulative += weightsList[i]!;
        if (targetPoint < cumulative) {
          return healthyBackends[i]!;
        }
      }
      return healthyBackends[0]!;
    }

    case 'least-connections': {
      let chosen = healthyBackends[0]!;
      let minConns = backendStates[chosen]?.activeConnections ?? 0;

      for (let i = 1; i < healthyBackends.length; i++) {
        const id = healthyBackends[i]!;
        const conns = backendStates[id]?.activeConnections ?? 0;
        if (conns < minConns) {
          minConns = conns;
          chosen = id;
        }
      }
      return chosen;
    }

    case 'random': {
      const idx = rng.nextInt(0, healthyBackends.length - 1);
      return healthyBackends[idx]!;
    }
  }
}

export const loadBalancerModel: ComponentBehaviorModel<LoadBalancerConfig> = {
  getEffectiveCapacityRps(config) {
    return config.capacityRps;
  },

  getServiceTimeMs(config) {
    return config.processingLatencyMs;
  },

  getUtilization(arrivalRateRps, config) {
    if (config.capacityRps <= 0) return 1.0;
    return Math.max(0, arrivalRateRps / config.capacityRps);
  },

  decideOverflow(queueLength, config): OverflowDecision {
    if (queueLength >= config.queueLimit) {
      return 'reject';
    }
    return queueLength === 0 ? 'accept' : 'queue';
  },
};
