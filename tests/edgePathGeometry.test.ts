import { describe, it, expect } from 'vitest';
import {
  parseSvgPathToPolyline,
  distanceToPolyline,
  computeEdgeSmoothStepPath,
  sampleEdgePoint,
  getEdgeGeometry,
} from '../src/ui/animation/edgePathGeometry';
import { createStarterGraph } from '../src/builder';
import { computeLayout } from '../src/builder/layout';

describe('Item 15: Routed Edge Path Geometry & Packet Sampling', () => {
  it('parses smooth-step SVG paths with rounded corners into dense polylines', () => {
    const src = { x: 100, y: 50 };
    const tgt = { x: 400, y: 200 };
    const svgPath = computeEdgeSmoothStepPath(src, tgt, 8);

    expect(svgPath).toContain('M');
    expect(svgPath).toContain('Q'); // Has quadratic bezier curves at bends

    const polyline = parseSvgPathToPolyline(svgPath, 16);
    expect(polyline.length).toBeGreaterThan(20);
    expect(polyline[0]!.x).toBeCloseTo(src.x, 1);
    expect(polyline[0]!.y).toBeCloseTo(src.y, 1);
    expect(polyline[polyline.length - 1]!.x).toBeCloseTo(tgt.x, 1);
    expect(polyline[polyline.length - 1]!.y).toBeCloseTo(tgt.y, 1);
  });

  it('guarantees that for 100 progress values per edge, every packet point is within 1 px of the edge path', () => {
    const testCases = [
      { name: 'Straight horizontal edge', src: { x: 0, y: 50 }, tgt: { x: 300, y: 50 } },
      { name: 'Moderate bend (downward)', src: { x: 100, y: 40 }, tgt: { x: 350, y: 180 } },
      { name: 'Large bend (upward)', src: { x: 100, y: 220 }, tgt: { x: 450, y: 60 } },
      { name: 'Sharp step', src: { x: 140, y: 120 }, tgt: { x: 260, y: 350 } },
    ];

    for (const tc of testCases) {
      const edgeId = `test-edge-${tc.name}`;
      const geom = getEdgeGeometry(edgeId, tc.src, tc.tgt, 8);

      for (let i = 0; i <= 100; i++) {
        const progress = i / 100;
        const pt = sampleEdgePoint(edgeId, tc.src, tc.tgt, progress, false, 8);

        // Distance from sampled point to the polyline representing the exact SVG path
        const dist = distanceToPolyline(pt, geom.polyline);
        expect(dist).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('samples all starter architecture edges (including bends) within 1 px for 100 progress values', () => {
    const starterGraph = createStarterGraph();
    const layout = computeLayout(starterGraph);
    const nodeWidth = 140;

    for (const edge of starterGraph.edges) {
      const srcNodePos = layout[edge.source]!;
      const tgtNodePos = layout[edge.target]!;

      const srcHandle = { x: srcNodePos.x + nodeWidth, y: srcNodePos.y + 20 };
      const tgtHandle = { x: tgtNodePos.x, y: tgtNodePos.y + 20 };

      const geom = getEdgeGeometry(edge.id, srcHandle, tgtHandle, 8);

      // Forward direction (request packets)
      for (let i = 0; i <= 100; i++) {
        const progress = i / 100;
        const pt = sampleEdgePoint(edge.id, srcHandle, tgtHandle, progress, false, 8);
        const dist = distanceToPolyline(pt, geom.polyline);
        expect(dist).toBeLessThanOrEqual(1.0);
      }

      // Reverse direction (response packets)
      for (let i = 0; i <= 100; i++) {
        const progress = i / 100;
        const pt = sampleEdgePoint(edge.id, srcHandle, tgtHandle, progress, true, 8);
        const dist = distanceToPolyline(pt, geom.polyline);
        expect(dist).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('correctly maps 0% and 100% progress to exact start and end handles', () => {
    const src = { x: 200, y: 100 };
    const tgt = { x: 500, y: 350 };
    const edgeId = 'boundary-test-edge';

    const startPt = sampleEdgePoint(edgeId, src, tgt, 0.0, false, 8);
    expect(startPt.x).toBeCloseTo(src.x, 1);
    expect(startPt.y).toBeCloseTo(src.y, 1);

    const endPt = sampleEdgePoint(edgeId, src, tgt, 1.0, false, 8);
    expect(endPt.x).toBeCloseTo(tgt.x, 1);
    expect(endPt.y).toBeCloseTo(tgt.y, 1);

    // Reverse boundary mapping
    const revStartPt = sampleEdgePoint(edgeId, src, tgt, 0.0, true, 8);
    expect(revStartPt.x).toBeCloseTo(tgt.x, 1);
    expect(revStartPt.y).toBeCloseTo(tgt.y, 1);

    const revEndPt = sampleEdgePoint(edgeId, src, tgt, 1.0, true, 8);
    expect(revEndPt.x).toBeCloseTo(src.x, 1);
    expect(revEndPt.y).toBeCloseTo(src.y, 1);
  });
});
