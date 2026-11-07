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

/**
 * Deterministically samples a standard normal variable Z ~ N(0, 1) via Box-Muller transform.
 */
export function sampleStandardNormal(rng: PRNG): number {
  let u1 = rng.next();
  while (u1 <= 1e-12) u1 = rng.next(); // avoid log(0)
  const u2 = rng.next();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Samples a normally distributed random value with given mean and standard deviation.
 */
export function sampleGaussian(mean: number, stdDev: number, rng: PRNG): number {
  if (stdDev <= 0) return mean;
  return mean + stdDev * sampleStandardNormal(rng);
}

/**
 * Samples a log-normally distributed random value with given expected mean and coefficient of variation (cv).
 * Formulas:
 *   sigma_L = sqrt(ln(1 + cv^2))
 *   mu_L = ln(mean) - 0.5 * sigma_L^2
 *   X = exp(mu_L + sigma_L * Z)
 * Ensures mean E[X] = mean and Var(X) = (cv * mean)^2.
 */
export function sampleLognormal(mean: number, cv: number, rng: PRNG): number {
  if (mean <= 0) return 0;
  if (cv <= 0) return mean;

  const cvClamped = Math.max(0.01, Math.min(3.0, cv));
  const sigmaL = Math.sqrt(Math.log(1.0 + cvClamped * cvClamped));
  const muL = Math.log(mean) - 0.5 * sigmaL * sigmaL;
  const z = sampleStandardNormal(rng);

  return Math.exp(muL + sigmaL * z);
}
