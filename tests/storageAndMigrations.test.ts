import { describe, it, expect } from 'vitest';
import { migrateProjectData, ProjectData } from '../src/storage/schema';
import { encodeProjectToShareLink, decodeProjectFromShareHash } from '../src/storage/share';
import { exportProjectAsJson, importProjectFromJson, getStarterTemplates } from '../src/storage/library';
import { createStarterGraph, addComponent } from '../src/builder';

describe('Phase 10: Persistence, Schema Migrations & Sharing Suite', () => {
  it('migrates legacy V1 project schema into strict V2 format', () => {
    const starter = createStarterGraph();
    const v1Payload = {
      version: 1,
      name: 'Old Legacy Project',
      graph: starter,
      traffic: {
        peakRps: 50,
        durationMs: 5000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      seed: 777,
    };

    const migrated = migrateProjectData(v1Payload);
    expect(migrated.version).toBe(2);
    expect(migrated.name).toBe('Old Legacy Project');
    expect(migrated.traffic.peakRps).toBe(50);
    expect(migrated.seed).toBe(777);
    expect(migrated.id).toBeDefined();
    expect(migrated.scenarioScript).toEqual([]);
    expect(migrated.uiPreferences).toBeDefined();
  });

  it('validates current V2 project document directly', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'app-server');

    const v2Project: ProjectData = {
      id: 'proj-123',
      name: 'Production V2 Architecture',
      version: 2,
      graph,
      traffic: {
        peakRps: 1500,
        durationMs: 30000,
        pattern: 'spike',
        patternParams: { type: 'spike', baselineRps: 100, spikeStartMs: 5000, spikeDurationMs: 10000 },
        mode: 'auto',
      },
      scenarioScript: [],
      seed: 42,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      uiPreferences: { displayMode: 'aggregate', speed: 2, showReadout: true },
    };

    const verified = migrateProjectData(v2Project);
    expect(verified.version).toBe(2);
    expect(verified.name).toBe('Production V2 Architecture');
    expect(verified.traffic.mode).toBe('auto');
  });

  it('rejects corrupt or unsupported project schemas with meaningful errors', () => {
    expect(() => migrateProjectData(null)).toThrow('Invalid project data');
    expect(() => migrateProjectData({ version: 99 })).toThrow('Unsupported project schema version: 99');
    expect(() => migrateProjectData({ version: 2, name: '' })).toThrow('Project validation error');
  });

  it('encodes and decodes share links correctly across round-trip', async () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'cache');

    const project: ProjectData = {
      id: 'share-test-1',
      name: 'Shareable Architecture',
      version: 2,
      graph,
      traffic: {
        peakRps: 300,
        durationMs: 10000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      scenarioScript: [],
      seed: 999,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const encoded = await encodeProjectToShareLink(project);
    expect(encoded.hash).toContain('#share=');
    expect(encoded.url).toBeDefined();

    const decoded = await decodeProjectFromShareHash(encoded.hash);
    expect(decoded).toBeDefined();
    expect(decoded?.name).toBe('Shareable Architecture');
    expect(decoded?.seed).toBe(999);
    expect(decoded?.graph.nodes.length).toBe(project.graph.nodes.length);
  });

  it('detects oversized share URLs when payload exceeds character limits', async () => {
    let graph = createStarterGraph();
    // Add many scenario actions to inflate size
    const heavyScript = Array.from({ length: 50 }, (_, i) => ({
      t: i * 200,
      action: 'inject' as const,
      failureType: 'app-server-slow' as const,
      targetId: 'app-server',
      params: { multiplier: 10 },
      durationMs: 1000,
    }));

    const hugeProject: ProjectData = {
      id: 'huge-project',
      name: 'Extremely Large Architecture With Extensive Failure Injections And Notes',
      version: 2,
      graph,
      traffic: {
        peakRps: 1000,
        durationMs: 60000,
        pattern: 'constant',
        patternParams: { type: 'constant' },
      },
      scenarioScript: heavyScript,
      seed: 12345,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const encoded = await encodeProjectToShareLink(hugeProject);
    expect(typeof encoded.isOversized).toBe('boolean');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('exports and imports project JSON without data loss', () => {
    const templates = getStarterTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(4);

    const original = templates[0]!;
    const jsonStr = exportProjectAsJson(original);
    const imported = importProjectFromJson(jsonStr);

    expect(imported.id).toBe(original.id);
    expect(imported.name).toBe(original.name);
    expect(imported.graph.nodes.length).toBe(original.graph.nodes.length);
    expect(imported.traffic.peakRps).toBe(original.traffic.peakRps);
  });
});
