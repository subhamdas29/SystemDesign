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

/**
 * Calculates Zipf probability weights for N shards with skew parameter s.
 * Returns array of probabilities summing to 1.0 for shards 0 .. N-1.
 */
export function calculateZipfWeights(shardCount: number, skew: number = 1.2): number[] {
  if (shardCount <= 1) return [1.0];
  const weights: number[] = [];
  let total = 0;
  for (let i = 1; i <= shardCount; i++) {
    const w = 1.0 / Math.pow(i, skew);
    weights.push(w);
    total += w;
  }
  return weights.map((w) => w / total);
}

/**
 * Calculates effective sharded throughput capacity.
 * Overall throughput is limited by the busiest shard:
 * RPS_max = Capacity_shard / P_hot = (Capacity_total / N) / P_hot
 */
export function calculateShardedMaxThroughput(
  totalCapacity: number,
  shardCount: number,
  distribution: 'uniform' | 'zipf-skewed' = 'uniform',
  skew: number = 1.2
): {
  shardCapacities: number[];
  shardProbabilities: number[];
  busiestShardIndex: number;
  maxSustainableRps: number;
  imbalanceRatio: number;
} {
  const n = Math.max(1, shardCount);
  const baseShardCap = totalCapacity / n;
  const shardCapacities = new Array(n).fill(baseShardCap);

  let probs: number[];
  if (distribution === 'zipf-skewed') {
    probs = calculateZipfWeights(n, skew);
  } else {
    probs = new Array(n).fill(1.0 / n);
  }

  const maxProb = Math.max(...probs);
  const busiestIdx = probs.indexOf(maxProb);
  const maxSustainable = maxProb > 0 ? baseShardCap / maxProb : totalCapacity;
  const imbalanceRatio = maxProb / (1.0 / n);

  return {
    shardCapacities,
    shardProbabilities: probs,
    busiestShardIndex: busiestIdx,
    maxSustainableRps: Math.round(maxSustainable),
    imbalanceRatio: Math.round(imbalanceRatio * 100) / 100,
  };
}

export const databaseModel: ComponentBehaviorModel<DatabaseConfig> = {
  getEffectiveCapacityRps(config) {
    if (config.shardCount && config.shardCount > 1) {
      const sharded = calculateShardedMaxThroughput(
        config.maxQueryThroughputQps,
        config.shardCount,
        config.shardKeyDistribution ?? 'uniform',
        config.zipfSkew ?? 1.2
      );
      return sharded.maxSustainableRps;
    }
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
