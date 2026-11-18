/**
 * Edge Path Geometry & Arc-Length Sampling Module.
 * Ensures packets and flow particles strictly follow the routed edge path (including bends),
 * sampling from the exact same geometry used to render the SVG edge.
 */

import { getSmoothStepPath, Position } from '@xyflow/react';
import type { Point2D } from './packetPosition';

export interface EdgeGeometry {
  pathString: string;
  polyline: Point2D[];
  totalLength: number;
}

// Global cache of registered edge paths from CustomEdge renderers or direct calculation
const edgePathCache = new Map<string, string>();
const edgeGeometryCache = new Map<string, EdgeGeometry>();

/**
 * Register an edge's rendered SVG path string (called by CustomEdge).
 */
export function registerEdgePath(edgeId: string, pathString: string): void {
  if (edgePathCache.get(edgeId) !== pathString) {
    edgePathCache.set(edgeId, pathString);
    edgeGeometryCache.delete(edgeId); // Invalidate cached geometry
  }
}

/**
 * Clear the edge path cache (used for testing or layout resets).
 */
export function clearEdgePathCache(): void {
  edgePathCache.clear();
  edgeGeometryCache.clear();
}

/**
 * Parses an SVG path string containing M, L, H, V, Q into a fine-grained polyline.
 * Smooth step paths from React Flow consist of M, L, and Q commands.
 */
export function parseSvgPathToPolyline(pathStr: string, stepsPerCurve = 16): Point2D[] {
  if (!pathStr || pathStr.trim() === '') {
    return [];
  }

  const points: Point2D[] = [];
  // Match command letter followed by numeric coordinates
  const commandMatches = pathStr.match(/([a-zA-Z])([^a-zA-Z]*)/g) || [];
  let currX = 0;
  let currY = 0;

  for (const cmdStr of commandMatches) {
    const type = cmdStr[0];
    const args = cmdStr
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    switch (type) {
      case 'M':
      case 'm': {
        currX = args[0] ?? 0;
        currY = args[1] ?? 0;
        points.push({ x: currX, y: currY });
        break;
      }
      case 'L':
      case 'l': {
        for (let i = 0; i < args.length; i += 2) {
          currX = args[i] ?? currX;
          currY = args[i + 1] ?? currY;
          points.push({ x: currX, y: currY });
        }
        break;
      }
      case 'H':
      case 'h': {
        for (let i = 0; i < args.length; i++) {
          currX = args[i] ?? currX;
          points.push({ x: currX, y: currY });
        }
        break;
      }
      case 'V':
      case 'v': {
        for (let i = 0; i < args.length; i++) {
          currY = args[i] ?? currY;
          points.push({ x: currX, y: currY });
        }
        break;
      }
      case 'Q':
      case 'q': {
        for (let i = 0; i < args.length; i += 4) {
          const cx = args[i] ?? currX;
          const cy = args[i + 1] ?? currY;
          const endX = args[i + 2] ?? currX;
          const endY = args[i + 3] ?? currY;
          const startX = currX;
          const startY = currY;

          for (let step = 1; step <= stepsPerCurve; step++) {
            const t = step / stepsPerCurve;
            const inv = 1 - t;
            const x = inv * inv * startX + 2 * inv * t * cx + t * t * endX;
            const y = inv * inv * startY + 2 * inv * t * cy + t * t * endY;
            points.push({ x, y });
          }
          currX = endX;
          currY = endY;
        }
        break;
      }
      default:
        break;
    }
  }

  return points;
}

/**
 * Computes total arc length and returns cumulative lengths for polyline segments.
 */
export function computePolylineLength(points: Point2D[]): {
  totalLength: number;
  segmentLengths: number[];
} {
  if (points.length < 2) {
    return { totalLength: 0, segmentLengths: [] };
  }

  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    segmentLengths.push(dist);
    totalLength += dist;
  }

  return { totalLength, segmentLengths };
}

/**
 * Samples a point along a polyline by exact arc-length progress [0.0, 1.0].
 */
export function samplePolylineAtProgress(
  points: Point2D[],
  progress: number,
  isReverse = false
): Point2D {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  if (points.length === 1) {
    return { ...points[0]! };
  }

  const effectiveProgress = isReverse
    ? 1.0 - Math.max(0.0, Math.min(1.0, progress))
    : Math.max(0.0, Math.min(1.0, progress));

  if (effectiveProgress <= 0.0) return { ...points[0]! };
  if (effectiveProgress >= 1.0) return { ...points[points.length - 1]! };

  const { totalLength, segmentLengths } = computePolylineLength(points);
  if (totalLength <= 0) {
    return { ...points[0]! };
  }

  const targetDist = effectiveProgress * totalLength;
  let accumulatedDist = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i]!;
    if (accumulatedDist + segLen >= targetDist) {
      const segProgress = segLen > 0 ? (targetDist - accumulatedDist) / segLen : 0;
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      return {
        x: p1.x + (p2.x - p1.x) * segProgress,
        y: p1.y + (p2.y - p1.y) * segProgress,
      };
    }
    accumulatedDist += segLen;
  }

  return { ...points[points.length - 1]! };
}

/**
 * Calculates the shortest distance from a 2D point to any segment of a polyline.
 */
export function distanceToPolyline(point: Point2D, polyline: Point2D[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return Math.hypot(point.x - polyline[0]!.x, point.y - polyline[0]!.y);

  let minDistance = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      const dist = Math.hypot(point.x - a.x, point.y - a.y);
      if (dist < minDistance) minDistance = dist;
      continue;
    }

    // Projection scalar t on segment [0, 1]
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;

    const dist = Math.hypot(point.x - projX, point.y - projY);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance;
}

/**
 * Computes standard smooth-step SVG edge path matching React Flow's exact geometry.
 */
export function computeEdgeSmoothStepPath(
  sourceHandle: Point2D,
  targetHandle: Point2D,
  borderRadius = 8
): string {
  const [path] = getSmoothStepPath({
    sourceX: sourceHandle.x,
    sourceY: sourceHandle.y,
    sourcePosition: Position.Right,
    targetX: targetHandle.x,
    targetY: targetHandle.y,
    targetPosition: Position.Left,
    borderRadius,
  });
  return path;
}

/**
 * Retrieves or builds the cached EdgeGeometry for an edge.
 */
export function getEdgeGeometry(
  edgeId: string,
  sourceHandle: Point2D,
  targetHandle: Point2D,
  borderRadius = 8
): EdgeGeometry {
  const cached = edgeGeometryCache.get(edgeId);
  if (cached) {
    return cached;
  }

  // Use registered path if available, or compute using smooth-step geometry
  const pathString =
    edgePathCache.get(edgeId) ||
    computeEdgeSmoothStepPath(sourceHandle, targetHandle, borderRadius);

  const polyline = parseSvgPathToPolyline(pathString);
  const { totalLength } = computePolylineLength(polyline);

  const geom: EdgeGeometry = {
    pathString,
    polyline,
    totalLength,
  };

  edgeGeometryCache.set(edgeId, geom);
  return geom;
}

/**
 * Primary API: Samples a packet position along an edge's routed SVG path.
 */
export function sampleEdgePoint(
  edgeId: string,
  sourceHandle: Point2D,
  targetHandle: Point2D,
  progress: number,
  isReverse = false,
  borderRadius = 8
): Point2D {
  const geom = getEdgeGeometry(edgeId, sourceHandle, targetHandle, borderRadius);
  return samplePolylineAtProgress(geom.polyline, progress, isReverse);
}

// Expose helper on window for QA/automation and geometry verification
if (typeof window !== 'undefined') {
  (window as any).__edgeGeometry = {
    getEdgeGeometry,
    sampleEdgePoint,
    distanceToPolyline,
    parseSvgPathToPolyline,
    computeEdgeSmoothStepPath,
  };
}
