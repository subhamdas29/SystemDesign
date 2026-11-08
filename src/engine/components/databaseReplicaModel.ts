/**
 * Database Read Replica Behavior Model (Phase 9).
 * Pure TypeScript with ZERO React, DOM, or network dependencies.
 */

import { DatabaseReplicaConfig } from '../../types/components';
import { ComponentBehaviorModel, OverflowDecision } from './types';

export const databaseReplicaModel: ComponentBehaviorModel<DatabaseReplicaConfig> = {
  getEffectiveCapacityRps(config: DatabaseReplicaConfig): number {
    return Math.max(10, config.capacityQps);
  },

  getServiceTimeMs(config: DatabaseReplicaConfig): number {
    return Math.max(0.1, config.queryLatencyMs);
  },

  getUtilization(arrivalRateRps: number, config: DatabaseReplicaConfig): number {
    return arrivalRateRps / Math.max(1, config.capacityQps);
  },

  decideOverflow(queueLength: number, config: DatabaseReplicaConfig): OverflowDecision {
    const queueLimit = Math.max(100, Math.floor(config.capacityQps / 5));
    if (queueLength >= queueLimit) return 'reject';
    if (queueLength > 0) return 'queue';
    return 'accept';
  },
};
