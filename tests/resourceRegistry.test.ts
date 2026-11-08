import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getComponentImageUrl, _resetWarnedKeys } from '../src/design/resourceRegistry';

describe('Resource Registry', () => {
  beforeEach(() => {
    _resetWarnedKeys();
  });

  it('warns once in development for unknown or missing keys and returns null for placeholder', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 'custom-missing' has no image in /resources
    const url1 = getComponentImageUrl('custom-missing' as any);
    expect(url1).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Calling again does not repeat the warning
    const url2 = getComponentImageUrl('custom-missing' as any);
    expect(url2).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
