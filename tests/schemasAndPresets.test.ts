import { describe, it, expect } from 'vitest';
import {
  COMPONENT_TYPES,
  DEFAULT_CONFIGS,
  CONFIG_SCHEMAS,
  validateNodeConfig,
} from '../src/types';
import { COMPONENT_PRESETS, detectPreset } from '../src/engine/components/presets';

describe('Component Schemas and Presets', () => {
  it('every default config passes its respective Zod schema', () => {
    for (const type of COMPONENT_TYPES) {
      const config = DEFAULT_CONFIGS[type];
      const schema = CONFIG_SCHEMAS[type];
      const result = schema.safeParse(config);
      expect(result.success, `Default config for ${type} failed schema validation: ${result.error?.message}`).toBe(true);
    }
  });

  it('every preset (Small, Medium, Large) passes its respective schema', () => {
    for (const type of COMPONENT_TYPES) {
      const presets = COMPONENT_PRESETS[type];
      for (const tier of ['small', 'medium', 'large'] as const) {
        const config = presets[tier];
        const schema = CONFIG_SCHEMAS[type];
        const result = schema.safeParse(config);
        expect(
          result.success,
          `Preset ${tier} for ${type} failed schema validation: ${result.error?.message}`
        ).toBe(true);
      }
    }
  });

  it('detectPreset accurately identifies matching tiers and falls back to custom', () => {
    for (const type of COMPONENT_TYPES) {
      const presets = COMPONENT_PRESETS[type];
      expect(detectPreset(type, presets.small)).toBe('small');
      expect(detectPreset(type, presets.medium)).toBe('medium');
      expect(detectPreset(type, presets.large)).toBe('large');

      // Mutate a field
      const customConfig = { ...presets.medium, rps: 9999999 };
      expect(detectPreset(type, customConfig as never)).toBe('custom');
    }
  });

  it('boundary values pass and out-of-range values fail with clear plain-language messages', () => {
    // Client readRatio bounds [0, 100]
    expect(validateNodeConfig('client', { readRatio: 0, requestTimeoutMs: 1000, rps: 500 }).valid).toBe(true);
    expect(validateNodeConfig('client', { readRatio: 100, requestTimeoutMs: 1000, rps: 500 }).valid).toBe(true);

    const clientUnder = validateNodeConfig('client', { readRatio: -1, requestTimeoutMs: 1000, rps: 500 });
    expect(clientUnder.valid).toBe(false);
    expect(clientUnder.errors[0]).toContain('Read ratio cannot be less than 0%');

    const clientOver = validateNodeConfig('client', { readRatio: 101, requestTimeoutMs: 1000, rps: 500 });
    expect(clientOver.valid).toBe(false);
    expect(clientOver.errors[0]).toContain('Read ratio cannot exceed 100%');

    // App Server concurrency min 1
    const serverBadConcurrency = validateNodeConfig('app-server', {
      ...DEFAULT_CONFIGS['app-server'],
      maxConcurrentRequests: 0,
    });
    expect(serverBadConcurrency.valid).toBe(false);
    expect(serverBadConcurrency.errors[0]).toContain('Concurrency must be at least 1');

    // Cache hitRatio bounds
    const cacheBadHit = validateNodeConfig('cache', {
      ...DEFAULT_CONFIGS.cache,
      hitRatio: 150,
    });
    expect(cacheBadHit.valid).toBe(false);
    expect(cacheBadHit.errors[0]).toContain('Hit ratio cannot exceed 100%');
  });
});
