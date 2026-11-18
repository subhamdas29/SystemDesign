import { describe, it, expect } from 'vitest';
import { tokens } from '../src/design/tokens';

describe('Design Tokens Palette & Neutrality Rules (Item 12b)', () => {
  it('ensures no color token has blue (B) greater than red (R) and green (G) by more than 6', () => {
    function checkColor(key: string, value: any) {
      if (typeof value === 'string') {
        if (value.startsWith('#') && (value.length === 7 || value.length === 9)) {
          const r = parseInt(value.slice(1, 3), 16);
          const g = parseInt(value.slice(3, 5), 16);
          const b = parseInt(value.slice(5, 7), 16);

          const diffR = b - r;
          const diffG = b - g;

          expect(
            diffR,
            `Color token "${key}" (${value}) has blue bias over red: B - R = ${diffR} (max allowed is 6)`
          ).toBeLessThanOrEqual(6);

          expect(
            diffG,
            `Color token "${key}" (${value}) has blue bias over green: B - G = ${diffG} (max allowed is 6)`
          ).toBeLessThanOrEqual(6);
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const [subKey, subVal] of Object.entries(value)) {
          checkColor(`${key}.${subKey}`, subVal);
        }
      }
    }

    checkColor('tokens.colors', tokens.colors);
  });
});
