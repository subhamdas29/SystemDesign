/**
 * Attacker Mode Type Definitions & Schemas (Phase 8A).
 * Defines multi-class traffic attributes, attack scenarios, campaigns, and validation.
 */

import { z } from 'zod';
import type { GraphConfig } from './graph';

export type TrafficOrigin = 'legitimate' | 'malicious';

export type AttackTargetLayer =
  | 'network'
  | 'http'
  | 'application'
  | 'database'
  | 'internal';

export type AttackScenarioId =
  | 'volumetric-flood'
  | 'http-flood'
  | 'slow-connection'
  | 'cache-busting-scraper'
  | 'credential-brute-force'
  | 'credential-stuffing-distributed'
  | 'injection-attempts'
  | 'compromised-server';

export interface TrafficClassAttributes {
  origin: TrafficOrigin;
  attackKind?: AttackScenarioId;
  costMultiplier: number; // CPU/DB work multiplier relative to normal request (default 1.0)
  connectionHoldMs: number; // Concurrency slot holding time (e.g. slowloris)
  cacheable: boolean; // false forces cache miss and bypass
  sourceCount: number; // number of distinct sources generating this traffic
  targetLayer: AttackTargetLayer;
  exposureRisk?: number; // 0 to 1, probability of incrementing exposure events if reaching DB
}

export interface AttackScenarioDefinition {
  id: AttackScenarioId;
  name: string;
  targetLayer: AttackTargetLayer;
  plainLanguage: {
    whatItIs: string;
    whatItTargets: string;
    whatStopsIt: string;
    whatDoesNotStopIt: string;
  };
  recommendedDefense: string;
  defaultCostMultiplier: number;
  defaultConnectionHoldMs: number;
  defaultCacheable: boolean;
  defaultSourceCount: number;
  defaultExposureRisk?: number;
  intensityRange: {
    min: number;
    max: number;
    step: number;
    defaultRps: number;
    unit: string;
  };
}

export interface CampaignPhase {
  id: string;
  scenarioId: AttackScenarioId;
  startMs: number;
  durationMs: number;
  intensityRps: number;
  sourceCount?: number;
  targetNodeId?: string; // used for internal attacks like 'compromised-server'
  params?: Record<string, number>;
}

export interface AttackCampaign {
  id: string;
  name: string;
  description: string;
  phases: CampaignPhase[];
}

export const CampaignPhaseSchema = z.object({
  id: z.string().min(1, 'Phase ID is required'),
  scenarioId: z.enum([
    'volumetric-flood',
    'http-flood',
    'slow-connection',
    'cache-busting-scraper',
    'credential-brute-force',
    'credential-stuffing-distributed',
    'injection-attempts',
    'compromised-server',
  ]),
  startMs: z.number().min(0, 'Phase start time must be 0s or greater'),
  durationMs: z.number().min(100, 'Phase duration must be at least 100ms'),
  intensityRps: z.number().min(1, 'Intensity must be at least 1 RPS'),
  sourceCount: z.number().min(1).optional(),
  targetNodeId: z.string().optional(),
  params: z.record(z.string(), z.number()).optional(),
});

export const AttackCampaignSchema = z.object({
  id: z.string().min(1, 'Campaign ID is required'),
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string(),
  phases: z.array(CampaignPhaseSchema),
});

/**
 * Validates campaign phases against total simulation duration and graph topology.
 * Produces plain-language human-friendly error messages.
 */
export function validateCampaign(
  campaign: AttackCampaign,
  runDurationMs: number,
  graph?: GraphConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const parseResult = AttackCampaignSchema.safeParse(campaign);

  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(issue.message);
    }
  }

  for (const phase of campaign.phases) {
    const phaseEndMs = phase.startMs + phase.durationMs;
    if (phaseEndMs > runDurationMs) {
      const durationSec = Math.round(runDurationMs / 1000);
      const endSec = (phaseEndMs / 1000).toFixed(1);
      errors.push(
        `Phase "${phase.scenarioId}" ends at ${endSec}s, which exceeds the simulation duration of ${durationSec}s.`
      );
    }

    if (phase.scenarioId === 'compromised-server') {
      if (!phase.targetNodeId) {
        errors.push(
          `Compromised server attack requires a target application server to be selected.`
        );
      } else if (graph) {
        const targetNode = graph.nodes.find((n) => n.id === phase.targetNodeId);
        if (!targetNode) {
          errors.push(
            `Target server "${phase.targetNodeId}" does not exist in the current architecture.`
          );
        } else if (targetNode.type !== 'app-server') {
          errors.push(
            `Target "${phase.targetNodeId}" must be an Application Server.`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
