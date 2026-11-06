/**
 * Pure behavior model for App Server.
 * Derives effective capacity from the minimum of max throughput, concurrency ceiling,
 * and CPU core limits, scaling by operational health.
 */

import { AppServerConfig } from '../../types';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export const appServerModel: ComponentBehaviorModel<AppServerConfig> = {
  getEffectiveCapacityRps(config) {
    if (config.health === 'down') {
      return 0;
    }

    // Little's Law concurrency capacity = concurrency / service time in seconds
    const serviceTimeSec = Math.max(0.001, config.avgProcessingTimeMs / 1000);
    const concurrencyCapacity = config.maxConcurrentRequests / serviceTimeSec;

    // CPU-bound ceiling = cores * (1000 / processingTime)
    const cpuCapacity = config.cpuCores * (1000 / Math.max(1, config.avgProcessingTimeMs));

    // Effective baseline is the tightest bottleneck
    const baseline = Math.floor(
      Math.min(config.maxThroughputRps, concurrencyCapacity, cpuCapacity)
    );

    // Apply health status factor
    if (config.health === 'degraded') {
      return Math.floor(baseline * 0.5);
    }

    return baseline;
  },

  getServiceTimeMs(config) {
    return config.avgProcessingTimeMs;
  },

  getUtilization(arrivalRateRps, config) {
    const capacity = appServerModel.getEffectiveCapacityRps(config);
    if (capacity <= 0) return 1.0;
    return Math.max(0, arrivalRateRps / capacity);
  },

  decideOverflow(queueLength, config): OverflowDecision {
    if (queueLength >= config.queueSize) {
      if (config.overloadBehavior === 'drop-oldest') {
        return 'drop';
      }
      return 'reject';
    }
    return queueLength === 0 ? 'accept' : 'queue';
  },
};
