/**
 * Pure behavior model for Network Router.
 */

import { RouterConfig } from '../../types';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export const routerModel: ComponentBehaviorModel<RouterConfig> = {
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
      return 'drop';
    }
    return queueLength === 0 ? 'accept' : 'queue';
  },
};
