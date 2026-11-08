/**
 * Persistence Schema & Migration Pipeline (Phase 10).
 * Versioned schemas (v1, v2) with automatic backwards-compatible migration.
 */

import { z } from 'zod';
import { GraphConfig } from '../types';
import { TrafficConfig } from '../engine/protocol';
import { ScenarioCommand } from '../scenarios/failures/types';

// --- V1 Schema (Legacy Phase 1-6) ---
export const ProjectV1Schema = z.object({
  version: z.literal(1).optional(),
  name: z.string().default('Untitled Project'),
  graph: z.custom<GraphConfig>((val) => typeof val === 'object' && val !== null),
  traffic: z.object({
    peakRps: z.number().default(100),
    durationMs: z.number().default(10000),
    pattern: z.string().default('constant'),
    patternParams: z.record(z.string(), z.unknown()).default({}),
  }),
  seed: z.number().default(42),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});
export type ProjectV1 = z.infer<typeof ProjectV1Schema>;

// --- V2 Schema (Current: Phases 7-10 with routes, defenses, campaign, scenarios) ---
export const ProjectV2Schema = z.object({
  id: z.string(),
  name: z.string().min(1),
  version: z.literal(2).default(2),
  graph: z.custom<GraphConfig>((val) => typeof val === 'object' && val !== null),
  traffic: z.custom<TrafficConfig>((val) => typeof val === 'object' && val !== null),
  routes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        share: z.number(),
        kind: z.enum(['read', 'write', 'auth', 'static']),
        costMultiplier: z.number(),
        cacheable: z.boolean(),
      })
    )
    .optional(),
  scenarioScript: z.custom<ScenarioCommand[]>((val) => Array.isArray(val)).default([]),
  campaign: z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      phases: z.array(z.any()),
    })
    .optional(),
  defenses: z.record(z.string(), z.unknown()).optional(),
  seed: z.number().default(42),
  createdAt: z.number(),
  updatedAt: z.number(),
  uiPreferences: z
    .object({
      displayMode: z.enum(['individual', 'aggregate']).optional(),
      speed: z.number().optional(),
      showReadout: z.boolean().optional(),
    })
    .optional(),
});
export type ProjectV2 = z.infer<typeof ProjectV2Schema>;

export type ProjectData = ProjectV2;

/**
 * Validates and migrates any versioned project payload into a strict ProjectV2 document.
 */
export function migrateProjectData(raw: unknown): ProjectV2 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid project data: root must be an object');
  }

  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === 'number' ? obj.version : 1;

  if (version === 2) {
    // Validate directly against V2 schema
    const parsed = ProjectV2Schema.safeParse(obj);
    if (!parsed.success) {
      throw new Error(`Project validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }
    return parsed.data;
  }

  if (version === 1) {
    // Migrate V1 -> V2
    const v1Parsed = ProjectV1Schema.safeParse(obj);
    if (!v1Parsed.success) {
      throw new Error(`Legacy V1 project validation error: ${v1Parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const v1 = v1Parsed.data;
    const now = Date.now();

    const migrated: ProjectV2 = {
      id: (obj.id as string) || `proj-${now}-${Math.floor(Math.random() * 10000)}`,
      name: v1.name || 'Migrated Project',
      version: 2,
      graph: v1.graph,
      traffic: {
        peakRps: v1.traffic.peakRps || 100,
        durationMs: v1.traffic.durationMs || 10000,
        pattern: (v1.traffic.pattern as any) || 'constant',
        patternParams: (v1.traffic.patternParams as any) || { type: 'constant' },
        mode: 'auto',
      },
      scenarioScript: [],
      seed: v1.seed || 42,
      createdAt: v1.createdAt || now,
      updatedAt: now,
      uiPreferences: {
        displayMode: 'individual',
        speed: 1,
        showReadout: true,
      },
    };

    return migrated;
  }

  throw new Error(`Unsupported project schema version: ${version}`);
}
