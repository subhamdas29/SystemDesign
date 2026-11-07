/**
 * Deterministic seeded pseudo-random number generator (Mulberry32).
 * Pure TypeScript with zero nondeterministic dependencies.
 */

export interface PRNG {
  /** Return next float in range [0, 1) */
  next(): number;
  /** Return next integer in range [min, max] */
  nextInt(min: number, max: number): number;
  /** Return current internal state seed */
  getSeed(): number;
}

/**
 * Creates a deterministic Mulberry32 PRNG instance.
 * Given the same seed, always produces the identical sequence of numbers.
 */
export function createPRNG(seed: number): PRNG {
  let s = Math.floor(Math.abs(seed)) >>> 0;
  // Prevent zero seed lockup
  if (s === 0) s = 1;

  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(min: number, max: number): number {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(next() * (high - low + 1)) + low;
  }

  return {
    next,
    nextInt,
    getSeed: () => s,
  };
}
