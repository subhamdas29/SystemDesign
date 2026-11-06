/**
 * Shared interface definitions for pure component behavior models.
 * Zero React/DOM imports; serializable inputs and outputs.
 */

import { AnyComponentConfig, NodeRuntimeState } from '../../types';
import { PRNG } from '../rng';

export type OverflowDecision = 'accept' | 'queue' | 'reject' | 'drop';

export interface ComponentBehaviorModel<TConfig extends AnyComponentConfig = AnyComponentConfig> {
  /**
   * Calculates the maximum requests per second this component can sustain
   * taking into account its configuration and operational health status.
   */
  getEffectiveCapacityRps(config: TConfig, runtimeState?: Partial<NodeRuntimeState>): number;

  /**
   * Computes processing / service latency in milliseconds for a request.
   */
  getServiceTimeMs(config: TConfig, context: unknown, rng: PRNG): number;

  /**
   * Calculates current utilization ratio = arrivalRate / capacity.
   * Clamped to [0, Infinity).
   */
  getUtilization(arrivalRateRps: number, config: TConfig): number;

  /**
   * Decides request admission based on current queue length and buffer limits.
   */
  decideOverflow(queueLength: number, config: TConfig): OverflowDecision;
}
