/**
 * Project Library & Starter Templates Engine (Phase 10).
 * Handles project creation, duplication, renaming, deletion, JSON import/export,
 * and starter templates pre-population.
 */

import { ProjectData, migrateProjectData } from './schema';
import { storage } from './db';
import { createStarterGraph, addComponent } from '../builder';

export function getStarterTemplates(): ProjectData[] {
  const now = Date.now();

  // Template 1: Starter Microservices
  let graph1 = createStarterGraph();
  graph1 = addComponent(graph1, 'api-gateway');
  graph1 = addComponent(graph1, 'app-server');
  graph1 = addComponent(graph1, 'cache');

  const template1: ProjectData = {
    id: 'template-microservices',
    name: 'Starter Microservices',
    version: 2,
    graph: graph1,
    traffic: {
      peakRps: 250,
      durationMs: 15000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'auto',
    },
    scenarioScript: [],
    seed: 101,
    createdAt: now,
    updatedAt: now,
    uiPreferences: { displayMode: 'individual', speed: 1, showReadout: true },
  };

  // Template 2: Async Queue & Background Workers
  let graph2 = createStarterGraph();
  graph2 = addComponent(graph2, 'api-gateway');
  graph2 = addComponent(graph2, 'message-queue');
  graph2 = addComponent(graph2, 'worker');

  const template2: ProjectData = {
    id: 'template-async-queue',
    name: 'Async Queue & Background Workers',
    version: 2,
    graph: graph2,
    traffic: {
      peakRps: 500,
      durationMs: 20000,
      pattern: 'burst',
      patternParams: { type: 'burst', baselineRps: 100, periodMs: 5000, dutyCycle: 0.4 },
      mode: 'auto',
    },
    scenarioScript: [],
    seed: 202,
    createdAt: now,
    updatedAt: now,
    uiPreferences: { displayMode: 'individual', speed: 1, showReadout: true },
  };

  // Template 3: Read Replicas & High Availability
  let graph3 = createStarterGraph();
  graph3 = addComponent(graph3, 'load-balancer');
  graph3 = addComponent(graph3, 'app-server');
  graph3 = addComponent(graph3, 'database-replica');

  const template3: ProjectData = {
    id: 'template-read-replicas',
    name: 'Read Replicas & High Availability',
    version: 2,
    graph: graph3,
    traffic: {
      peakRps: 1200,
      durationMs: 20000,
      pattern: 'ramp',
      patternParams: { type: 'ramp', startRps: 200 },
      mode: 'auto',
    },
    scenarioScript: [],
    seed: 303,
    createdAt: now,
    updatedAt: now,
    uiPreferences: { displayMode: 'aggregate', speed: 1, showReadout: true },
  };

  // Template 4: Hardened Edge Defenses
  let graph4 = createStarterGraph();
  graph4 = addComponent(graph4, 'cdn');
  graph4 = addComponent(graph4, 'firewall');
  graph4 = addComponent(graph4, 'waf');
  graph4 = addComponent(graph4, 'rate-limiter');

  const template4: ProjectData = {
    id: 'template-hardened-edge',
    name: 'Hardened Edge Defenses',
    version: 2,
    graph: graph4,
    traffic: {
      peakRps: 2000,
      durationMs: 30000,
      pattern: 'spike',
      patternParams: { type: 'spike', baselineRps: 200, spikeStartMs: 5000, spikeDurationMs: 10000 },
      mode: 'auto',
    },
    scenarioScript: [],
    seed: 404,
    createdAt: now,
    updatedAt: now,
    uiPreferences: { displayMode: 'aggregate', speed: 1, showReadout: true },
  };

  return [template1, template2, template3, template4];
}

export function exportProjectAsJson(project: ProjectData): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectFromJson(jsonString: string): ProjectData {
  try {
    const parsed = JSON.parse(jsonString);
    return migrateProjectData(parsed);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Invalid JSON file.');
  }
}

export async function duplicateProject(project: ProjectData): Promise<ProjectData> {
  const now = Date.now();
  const copy: ProjectData = {
    ...project,
    id: `proj-${now}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${project.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await storage.saveProject(copy);
  return copy;
}
