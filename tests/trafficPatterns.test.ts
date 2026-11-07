import { describe, it, expect } from 'vitest';
import { rpsAt, computeTrafficSummary } from '../src/scenarios/traffic/patterns';
import { TrafficConfig } from '../src/scenarios/traffic/types';

describe('Traffic Patterns and Profiles', () => {
  it('computes constant traffic rate and summary', () => {
    const config: TrafficConfig = {
      peakRps: 500,
      durationMs: 10000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'auto',
    };

    expect(rpsAt(0, config)).toBe(500);
    expect(rpsAt(5000, config)).toBe(500);
    expect(rpsAt(10000, config)).toBe(500);
    expect(rpsAt(12000, config)).toBe(0); // past duration

    const summary = computeTrafficSummary(config);
    expect(summary.peakRps).toBe(500);
    expect(summary.averageRps).toBe(500);
    expect(summary.totalRequests).toBe(5000); // 500 RPS * 10s
  });

  it('computes linear ramp traffic pattern and summary', () => {
    const config: TrafficConfig = {
      peakRps: 1000,
      durationMs: 10000,
      pattern: 'ramp',
      patternParams: { type: 'ramp', startRps: 200 },
      mode: 'auto',
    };

    expect(rpsAt(0, config)).toBe(200);
    expect(rpsAt(5000, config)).toBe(600); // halfway = 200 + 400 = 600
    expect(rpsAt(10000, config)).toBe(1000);

    const summary = computeTrafficSummary(config);
    expect(summary.peakRps).toBe(1000);
    expect(summary.averageRps).toBe(600); // (200 + 1000) / 2
    expect(summary.totalRequests).toBe(6000); // 600 avg * 10s
  });

  it('computes sudden spike traffic pattern and summary', () => {
    const config: TrafficConfig = {
      peakRps: 5000,
      durationMs: 10000,
      pattern: 'spike',
      patternParams: {
        type: 'spike',
        baselineRps: 200,
        spikeStartMs: 3000,
        spikeDurationMs: 2000, // from 3s to 5s
      },
      mode: 'auto',
    };

    expect(rpsAt(1000, config)).toBe(200);
    expect(rpsAt(3000, config)).toBe(5000);
    expect(rpsAt(4500, config)).toBe(5000);
    expect(rpsAt(5000, config)).toBe(200); // spike ended
    expect(rpsAt(8000, config)).toBe(200);

    const summary = computeTrafficSummary(config);
    expect(summary.peakRps).toBe(5000);
    // 2s @ 5000 = 10,000 + 8s @ 200 = 1,600 -> total = 11,600
    expect(summary.totalRequests).toBe(11600);
    expect(summary.averageRps).toBe(1160);
  });

  it('computes repeating burst traffic pattern and summary', () => {
    const config: TrafficConfig = {
      peakRps: 2000,
      durationMs: 10000,
      pattern: 'burst',
      patternParams: {
        type: 'burst',
        baselineRps: 100,
        periodMs: 2000,
        dutyCycle: 0.25, // 25% of 2s = 500ms at peak
      },
      mode: 'auto',
    };

    // First cycle [0, 2000ms]
    expect(rpsAt(100, config)).toBe(2000);
    expect(rpsAt(400, config)).toBe(2000);
    expect(rpsAt(600, config)).toBe(100);
    expect(rpsAt(1800, config)).toBe(100);

    // Second cycle [2000ms, 4000ms]
    expect(rpsAt(2100, config)).toBe(2000);
    expect(rpsAt(2600, config)).toBe(100);

    const summary = computeTrafficSummary(config);
    // 0.25 * 2000 + 0.75 * 100 = 500 + 75 = 575 RPS avg
    expect(summary.averageRps).toBe(575);
    expect(summary.totalRequests).toBe(5750);
  });
});
