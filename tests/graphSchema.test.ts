import { describe, it, expect } from 'vitest';
import { GraphConfigSchema } from '../src/types';
import { createStarterGraph } from '../src/builder';

describe('GraphConfig Schema and Starter Graph', () => {
  it('starter graph validates successfully against Zod schema', () => {
    const starter = createStarterGraph();
    const result = GraphConfigSchema.safeParse(starter);
    expect(result.success).toBe(true);
  });

  it('starter graph has client -> cdn -> app-server -> database in order', () => {
    const starter = createStarterGraph();
    expect(starter.nodes.map((n) => n.type)).toEqual(['client', 'cdn', 'app-server', 'database']);
    expect(starter.edges).toHaveLength(3);
    expect(starter.edges[0]!.source).toBe('client-1');
    expect(starter.edges[0]!.target).toBe('cdn-1');
    expect(starter.edges[1]!.source).toBe('cdn-1');
    expect(starter.edges[1]!.target).toBe('app-server-1');
    expect(starter.edges[2]!.source).toBe('app-server-1');
    expect(starter.edges[2]!.target).toBe('database-1');
  });

  it('rejects graph with missing required properties', () => {
    const invalid = { version: 1, nodes: [] };
    const result = GraphConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
