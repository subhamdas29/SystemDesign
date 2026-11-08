/**
 * Async Worker Behavior Model (Phase 9).
 * Pure TypeScript with ZERO React, DOM, or network dependencies.
 */

import { WorkerConfig } from '../../types/components';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export const workerModel: ComponentBehaviorModel<WorkerConfig> = {
  getEffectiveCapacityRps(config: WorkerConfig): number {
    const instances = Math.max(1, config.instances ?? 1);
    const concurrency = Math.max(1, config.concurrency ?? 1);
    const avgMs = Math.max(1, config.avgProcessingMs ?? 50);
    // Jobs per second = (instances * concurrency) / (avgMs / 1000)
    return Math.round((instances * concurrency * 1000) / avgMs);
  },

  getServiceTimeMs(config: WorkerConfig): number {
    return Math.max(1, config.avgProcessingMs ?? 50);
  },

  getUtilization(arrivalRateRps: number, config: WorkerConfig): number {
    const capacity = this.getEffectiveCapacityRps(config);
    return arrivalRateRps / Math.max(1, capacity);
  },

  decideOverflow(queueLength: number, config: WorkerConfig): OverflowDecision {
    const instances = Math.max(1, config.instances ?? 1);
    const concurrency = Math.max(1, config.concurrency ?? 1);
    const maxActive = instances * concurrency * 2;
    if (queueLength >= maxActive) return 'reject';
    if (queueLength > 0) return 'queue';
    return 'accept';
  },
};
