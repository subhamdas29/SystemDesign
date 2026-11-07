import { describe, it, expect } from 'vitest';
import {
  calculatePacketProgress,
  interpolatePoint,
  interpolateAlongPath,
  isPacketInFlight,
} from '../src/ui/animation/packetPosition';

describe('Packet Position as a Function of Simulated Time', () => {
  it('correctly clamps at start (0.0) and end (1.0) boundaries', () => {
    const hopStart = 1000;
    const hopEnd = 2000;

    // Before hop starts
    expect(calculatePacketProgress(500, hopStart, hopEnd)).toBe(0.0);
    expect(calculatePacketProgress(1000, hopStart, hopEnd)).toBe(0.0);

    // Mid hop
    expect(calculatePacketProgress(1500, hopStart, hopEnd)).toBe(0.5);
    expect(calculatePacketProgress(1250, hopStart, hopEnd)).toBe(0.25);
    expect(calculatePacketProgress(1750, hopStart, hopEnd)).toBe(0.75);

    // After hop ends
    expect(calculatePacketProgress(2000, hopStart, hopEnd)).toBe(1.0);
    expect(calculatePacketProgress(2500, hopStart, hopEnd)).toBe(1.0);
  });

  it('handles zero or negative duration gracefully', () => {
    expect(calculatePacketProgress(1000, 1000, 1000)).toBe(1.0);
    expect(calculatePacketProgress(1500, 2000, 1000)).toBe(1.0);
  });

  it('is completely speed-independent and freeze-safe (pause)', () => {
    const hopStart = 200;
    const hopEnd = 400;

    // Pause at t=300ms
    const pos1 = calculatePacketProgress(300, hopStart, hopEnd);
    const pos2 = calculatePacketProgress(300, hopStart, hopEnd);
    expect(pos1).toBe(pos2);
    expect(pos1).toBe(0.5);

    // Seeking backwards from 350ms to 250ms
    const forward = calculatePacketProgress(350, hopStart, hopEnd);
    const backward = calculatePacketProgress(250, hopStart, hopEnd);
    expect(forward).toBe(0.75);
    expect(backward).toBe(0.25);
    expect(backward).toBeLessThan(forward);
  });

  it('interpolates along multi-segment 2D paths correctly', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];

    const pStart = interpolateAlongPath(path, 0.0);
    expect(pStart).toEqual({ x: 0, y: 0 });

    const pMid = interpolateAlongPath(path, 0.5);
    expect(pMid).toEqual({ x: 100, y: 0 }); // At corner (100 distance out of 200 total)

    const pThreeQuarter = interpolateAlongPath(path, 0.75);
    expect(pThreeQuarter).toEqual({ x: 100, y: 50 }); // Halfway down second segment

    const pEnd = interpolateAlongPath(path, 1.0);
    expect(pEnd).toEqual({ x: 100, y: 100 });
  });

  it('interpolates single 2D segment with interpolatePoint', () => {
    const a = { x: 10, y: 20 };
    const b = { x: 30, y: 60 };
    const mid = interpolatePoint(a, b, 0.5);
    expect(mid).toEqual({ x: 20, y: 40 });
  });

  it('checks in-flight status correctly', () => {
    expect(isPacketInFlight(999, 1000, 2000)).toBe(false);
    expect(isPacketInFlight(1000, 1000, 2000)).toBe(true);
    expect(isPacketInFlight(1500, 1000, 2000)).toBe(true);
    expect(isPacketInFlight(2000, 1000, 2000)).toBe(true);
    expect(isPacketInFlight(2001, 1000, 2000)).toBe(false);
  });
});
