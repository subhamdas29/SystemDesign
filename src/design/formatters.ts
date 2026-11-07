/**
 * Unified App-Wide Number and Telemetry Formatter.
 * Enforces strict en-US formatting, compact notations (1.2k, 10M RPS),
 * fixed decimals for latencies, and clean percentage representation.
 */

const standardFormatter = new Intl.NumberFormat('en-US');

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

/**
 * Formats a number with en-US digit grouping or compact notation.
 */
export function formatNumber(value: number, compact = false): string {
  if (!Number.isFinite(value)) return '0';
  if (compact && Math.abs(value) >= 1000) {
    return compactFormatter.format(value);
  }
  return standardFormatter.format(Math.round(value * 10) / 10);
}

/**
 * Formats rate metrics with RPS suffix (e.g. "1.2k RPS" or "10M RPS").
 */
export function formatRps(value: number, compact = true): string {
  return `${formatNumber(value, compact)} RPS`;
}

/**
 * Formats duration in milliseconds into "MM:SS" or "SS.S s".
 */
export function formatSimDuration(durationMs: number): string {
  const totalSec = Math.floor(durationMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats latency in milliseconds with 1 fixed decimal place (e.g. "12.4 ms").
 */
export function formatLatency(latencyMs: number): string {
  if (!Number.isFinite(latencyMs)) return '0.0 ms';
  return `${latencyMs.toFixed(1)} ms`;
}

/**
 * Formats a ratio or percentage (e.g. 0.852 or 85.2) into "85.2%".
 * If value <= 1.0, treats it as a decimal ratio (0..1) unless value is 0.
 */
export function formatPercent(value: number, isRatio = false): string {
  if (!Number.isFinite(value)) return '0.0%';
  const pct = isRatio ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}
