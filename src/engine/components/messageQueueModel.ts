/**
 * Message Queue Behavior Model (Phase 9).
 * Pure TypeScript with ZERO React, DOM, or network dependencies.
 */

import { MessageQueueConfig } from '../../types/components';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export const messageQueueModel: ComponentBehaviorModel<MessageQueueConfig> = {
  getEffectiveCapacityRps(config: MessageQueueConfig): number {
    return Math.max(10, config.capacityRps);
  },

  getServiceTimeMs(config: MessageQueueConfig): number {
    return Math.max(0.1, config.processingLatencyMs);
  },

  getUtilization(arrivalRateRps: number, config: MessageQueueConfig): number {
    return arrivalRateRps / Math.max(1, config.capacityRps);
  },

  decideOverflow(queueLength: number, config: MessageQueueConfig): OverflowDecision {
    if (queueLength >= config.maxQueueDepth) {
      return config.overflowBehavior === 'drop-oldest' ? 'drop' : 'reject';
    }
    if (queueLength > 0) return 'queue';
    return 'accept';
  },
};
