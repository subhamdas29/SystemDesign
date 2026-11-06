/**
 * Pure behavior model for Primary Database.
 * Connection pool state transitions and query latency accounting.
 */

import { DatabaseConfig } from '../../types';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export type PoolAcquisitionResult = 'acquired' | 'queued' | 'rejected';

/**
 * Pure state transition for acquiring a database connection from the pool.
 */
export function acquireConnection(
  activeConnections: number,
  poolSize: number,
  queueDepth: number,
  queueCapacity: number
): PoolAcquisitionResult {
  if (activeConnections < poolSize) {
    return 'acquired';
  }
  if (queueDepth < queueCapacity) {
    return 'queued';
  }
  return 'rejected';
}

/**
 * Pure state transition for releasing a database connection back to the pool.
 */
export function releaseConnection(activeConnections: number): number {
  return Math.max(0, activeConnections - 1);
}

export const databaseModel: ComponentBehaviorModel<DatabaseConfig> = {
  getEffectiveCapacityRps(config) {
    return config.maxQueryThroughputQps;
  },

  getServiceTimeMs(config, context) {
    const ctx = context as { isWrite?: boolean } | undefined;
    if (ctx?.isWrite) {
      return config.writeQueryLatencyMs;
    }
    return config.readQueryLatencyMs ?? config.queryLatencyMs;
  },

  getUtilization(arrivalRateRps, config) {
    if (config.maxQueryThroughputQps <= 0) return 1.0;
    return Math.max(0, arrivalRateRps / config.maxQueryThroughputQps);
  },

  decideOverflow(queueLength, config): OverflowDecision {
    if (queueLength >= config.queueCapacity) {
      return 'reject';
    }
    return queueLength === 0 ? 'accept' : 'queue';
  },
};
