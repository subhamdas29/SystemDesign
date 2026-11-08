/**
 * Attack Campaign Presets & Utilities (Phase 8A).
 * Multi-phase coordinated campaigns recorded deterministically in the simulation script.
 */

import type { AttackCampaign, CampaignPhase } from '../../types/attacks';
import { ATTACK_SCENARIOS } from './catalog';

export const CAMPAIGN_PRESETS: AttackCampaign[] = [
  {
    id: 'recon-then-flood',
    name: 'Recon then flood',
    description:
      'Low-rate application probing to identify sensitive endpoints, followed by a sudden, massive volumetric flood saturating the router and ingress load balancer.',
    phases: [
      {
        id: 'phase-recon',
        scenarioId: 'http-flood',
        startMs: 0,
        durationMs: 8000,
        intensityRps: 80,
        sourceCount: 50,
      },
      {
        id: 'phase-flood',
        scenarioId: 'volumetric-flood',
        startMs: 8000,
        durationMs: 22000,
        intensityRps: 4500,
        sourceCount: 8000,
      },
    ],
  },
  {
    id: 'scrape-bust-cache-overload-db',
    name: 'Scrape, bust the cache, overload the database',
    description:
      'Cache-busting scrapers send randomized query parameters forcing 100% cache misses, completely bypassing frontend caching and exhausting the database connection pool.',
    phases: [
      {
        id: 'phase-cache-bust',
        scenarioId: 'cache-busting-scraper',
        startMs: 3000,
        durationMs: 25000,
        intensityRps: 350,
        sourceCount: 100,
      },
    ],
  },
  {
    id: 'slow-drain-then-http-flood',
    name: 'Slow drain then HTTP flood',
    description:
      'Low-RPS slowloris connections silently consume all available server concurrency slots and sockets, leaving zero capacity when an HTTP flood follows.',
    phases: [
      {
        id: 'phase-slowloris',
        scenarioId: 'slow-connection',
        startMs: 0,
        durationMs: 25000,
        intensityRps: 120,
        sourceCount: 200,
      },
      {
        id: 'phase-http-surge',
        scenarioId: 'http-flood',
        startMs: 10000,
        durationMs: 18000,
        intensityRps: 1200,
        sourceCount: 500,
      },
    ],
  },
  {
    id: 'credential-stuffing-wave',
    name: 'Credential stuffing wave',
    description:
      'Distributed authentication attack spreading across thousands of distinct source IP addresses, overwhelming password verification CPU and bypassing basic per-IP limits.',
    phases: [
      {
        id: 'phase-stuffing',
        scenarioId: 'credential-stuffing-distributed',
        startMs: 4000,
        durationMs: 22000,
        intensityRps: 900,
        sourceCount: 5000,
      },
    ],
  },
  {
    id: 'foothold-and-spread',
    name: 'Foothold and spread',
    description:
      'Internal threat actor establishes a foothold on an application server, drains local computing capacity, exfiltrates outbound data, and laterally infects peer application servers.',
    phases: [
      {
        id: 'phase-foothold',
        scenarioId: 'compromised-server',
        startMs: 4000,
        durationMs: 24000,
        intensityRps: 1,
        sourceCount: 1,
        targetNodeId: 'app-server-1',
        params: {
          capacityDrainFactor: 0.5,
          lateralSpreadRate: 0.15,
          egressRateMbPerSec: 5,
        },
      },
    ],
  },
];

/**
 * Creates a default starter campaign for manual editing in the Attack Console.
 */
export function createDefaultCampaign(): AttackCampaign {
  return {
    id: 'custom-campaign',
    name: 'Custom Attack Campaign',
    description: 'User-configured multi-phase attack scenario.',
    phases: [
      {
        id: `phase-${Date.now()}-1`,
        scenarioId: 'http-flood',
        startMs: 2000,
        durationMs: 15000,
        intensityRps: 600,
        sourceCount: 300,
      },
    ],
  };
}

/**
 * Converts a campaign phase into a runtime traffic class configuration.
 */
export function getPhaseTrafficAttributes(phase: CampaignPhase) {
  const scenario = ATTACK_SCENARIOS[phase.scenarioId];
  return {
    origin: 'malicious' as const,
    attackKind: phase.scenarioId,
    costMultiplier: scenario?.defaultCostMultiplier ?? 1.0,
    connectionHoldMs: scenario?.defaultConnectionHoldMs ?? 0,
    cacheable: scenario?.defaultCacheable ?? false,
    sourceCount: phase.sourceCount ?? scenario?.defaultSourceCount ?? 1,
    targetLayer: scenario?.targetLayer ?? 'http',
    exposureRisk: scenario?.defaultExposureRisk ?? 0,
  };
}
