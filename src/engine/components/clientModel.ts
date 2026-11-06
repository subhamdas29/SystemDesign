/**
 * Pure behavior model for Client cohort.
 */

import { ClientConfig } from '../../types';
import { ComponentBehaviorModel, OverflowDecision } from './types';
import { PRNG } from '../rng';

export function decideRequestType(config: ClientConfig, rng: PRNG): 'read' | 'write' {
  const ratio = Math.max(0, Math.min(100, config.readRatio)) / 100;
  return rng.next() < ratio ? 'read' : 'write';
}

export const clientModel: ComponentBehaviorModel<ClientConfig> = {
  getEffectiveCapacityRps(config) {
    return config.rps;
  },

  getServiceTimeMs() {
    return 0; // Clients generate requests, zero ingress service time
  },

  getUtilization() {
    return 1.0;
  },

  decideOverflow(): OverflowDecision {
    return 'accept';
  },
};
