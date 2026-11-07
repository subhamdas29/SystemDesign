import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatRps,
  formatSimDuration,
  formatLatency,
  formatPercent,
} from '../src/design/formatters';

describe('Design formatters', () => {
  it('formats standard numbers with en-US digit grouping', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(50000)).toBe('50,000');
    expect(formatNumber(45.67)).toBe('45.7');
  });

  it('formats compact numbers for large values', () => {
    expect(formatNumber(1000, true)).toBe('1K');
    expect(formatNumber(100000, true)).toBe('100K');
    expect(formatNumber(1000000, true)).toBe('1M');
  });

  it('formats RPS with proper suffix', () => {
    expect(formatRps(500)).toBe('500 RPS');
    expect(formatRps(10000, true)).toBe('10K RPS');
    expect(formatRps(10000, false)).toBe('10,000 RPS');
  });

  it('formats simulation duration to MM:SS', () => {
    expect(formatSimDuration(0)).toBe('00:00');
    expect(formatSimDuration(65000)).toBe('01:05');
    expect(formatSimDuration(600000)).toBe('10:00');
  });

  it('formats latency with 1 decimal place', () => {
    expect(formatLatency(12.42)).toBe('12.4 ms');
    expect(formatLatency(0.5)).toBe('0.5 ms');
  });

  it('formats percentages correctly', () => {
    expect(formatPercent(99.2)).toBe('99.2%');
    expect(formatPercent(0.852, true)).toBe('85.2%');
  });
});
