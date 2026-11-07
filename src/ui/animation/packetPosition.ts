/**
 * Pure functions for packet animation positioning as a function of simulated time.
 * Never uses Date.now(), requestAnimationFrame, or stateful tweens.
 * Boundary-tested and speed-independent.
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Calculates normalized progress [0.0, 1.0] along a single hop or edge.
 * Pure function of simulated time.
 */
export function calculatePacketProgress(
  simTimeMs: number,
  hopStartTimeMs: number,
  hopEndTimeMs: number
): number {
  if (hopEndTimeMs <= hopStartTimeMs) {
    return 1.0;
  }
  if (simTimeMs <= hopStartTimeMs) {
    return 0.0;
  }
  if (simTimeMs >= hopEndTimeMs) {
    return 1.0;
  }

  const progress = (simTimeMs - hopStartTimeMs) / (hopEndTimeMs - hopStartTimeMs);
  return Math.max(0.0, Math.min(1.0, progress));
}

/**
 * Linearly interpolates a point between two 2D coordinates.
 */
export function interpolatePoint(p1: Point2D, p2: Point2D, progress: number): Point2D {
  const clampedProgress = Math.max(0.0, Math.min(1.0, progress));
  return {
    x: p1.x + (p2.x - p1.x) * clampedProgress,
    y: p1.y + (p2.y - p1.y) * clampedProgress,
  };
}

/**
 * Determines whether a packet is actively in-flight on a hop at a given simulated time.
 */
export function isPacketInFlight(
  simTimeMs: number,
  hopStartTimeMs: number,
  hopEndTimeMs: number
): boolean {
  return simTimeMs >= hopStartTimeMs && simTimeMs <= hopEndTimeMs;
}

/**
 * Computes the 2D position along a multi-segment path (e.g., ortho / smooth-step edge).
 */
export function interpolateAlongPath(pathPoints: Point2D[], progress: number): Point2D {
  if (pathPoints.length === 0) {
    return { x: 0, y: 0 };
  }
  if (pathPoints.length === 1) {
    return { ...pathPoints[0]! };
  }

  const clampedProgress = Math.max(0.0, Math.min(1.0, progress));
  if (clampedProgress === 0.0) return { ...pathPoints[0]! };
  if (clampedProgress === 1.0) return { ...pathPoints[pathPoints.length - 1]! };

  // Calculate segment lengths
  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = pathPoints[i]!;
    const p2 = pathPoints[i + 1]!;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    segmentLengths.push(dist);
    totalLength += dist;
  }

  if (totalLength <= 0) {
    return { ...pathPoints[0]! };
  }

  const targetDist = clampedProgress * totalLength;
  let accumulatedDist = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i]!;
    if (accumulatedDist + segLen >= targetDist) {
      const segProgress = segLen > 0 ? (targetDist - accumulatedDist) / segLen : 0;
      return interpolatePoint(pathPoints[i]!, pathPoints[i + 1]!, segProgress);
    }
    accumulatedDist += segLen;
  }

  return { ...pathPoints[pathPoints.length - 1]! };
}
