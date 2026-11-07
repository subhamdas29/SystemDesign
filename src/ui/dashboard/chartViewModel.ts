/**
 * Pure Chart View-Model & Marker Generator.
 * Decimates time-series data and derives monochrome-first chart models,
 * reference lines, and event markers.
 * Decoupled from React and rendering layers.
 */

import { MetricsSample, ChartNotableEvent } from '../../types/metrics';
import { decimateSeries } from '../../engine/metrics/rollup';

export interface TrafficChartPoint {
  timeMs: number;
  timeSec: number;
  incomingRps: number;
  successfulRps: number;
  errorRps: number;
}

export interface LatencyChartPoint {
  timeMs: number;
  timeSec: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
}

export interface UtilizationChartPoint {
  timeMs: number;
  timeSec: number;
  nodes: Record<string, number>; // nodeId -> utilization (0-100)
}

export interface QueueChartPoint {
  timeMs: number;
  timeSec: number;
  nodes: Record<string, { queue: number; limit: number }>;
}

export interface FormattedChartData {
  timeRange: { minMs: number; maxMs: number };
  trafficSeries: TrafficChartPoint[];
  latencySeries: LatencyChartPoint[];
  utilizationSeries: UtilizationChartPoint[];
  queueSeries: QueueChartPoint[];
  topNodes: string[];
  clientTimeoutMs: number;
  events: ChartNotableEvent[];
  accessibleSummary: string;
}

/**
 * Builds decimated, synchronized chart series for the 4 time-series charts.
 */
export function buildChartViewModel(
  samples: MetricsSample[],
  window: '60s' | 'all',
  _currentSimTimeMs: number,
  clientTimeoutMs = 5000
): FormattedChartData {
  if (samples.length === 0) {
    return {
      timeRange: { minMs: 0, maxMs: 1000 },
      trafficSeries: [],
      latencySeries: [],
      utilizationSeries: [],
      queueSeries: [],
      topNodes: [],
      clientTimeoutMs,
      events: [],
      accessibleSummary: 'No simulation data recorded yet.',
    };
  }

  // Determine window bounds
  const latestTimeMs = samples[samples.length - 1]!.timeMs;
  let filtered = samples;

  if (window === '60s') {
    const cutoff = Math.max(0, latestTimeMs - 60000);
    filtered = samples.filter((s) => s.timeMs >= cutoff);
  }

  const minMs = filtered[0]?.timeMs ?? 0;
  const maxMs = Math.max(minMs + 1000, filtered[filtered.length - 1]?.timeMs ?? 1000);

  // Identify top 5 nodes by peak utilization
  const nodePeakUtil = new Map<string, number>();
  for (const s of filtered) {
    for (const [nodeId, n] of Object.entries(s.nodes)) {
      const current = nodePeakUtil.get(nodeId) ?? 0;
      if (n.utilization > current) {
        nodePeakUtil.set(nodeId, n.utilization);
      }
    }
  }

  const topNodes = Array.from(nodePeakUtil.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nodeId]) => nodeId);

  // Decimate points to <= 300 points for ultra-smooth 60fps rendering
  const decimatedSamples = decimateSeries(
    filtered,
    300,
    (s) => s.system.incomingRps + s.system.p99Ms
  );

  const trafficSeries: TrafficChartPoint[] = [];
  const latencySeries: LatencyChartPoint[] = [];
  const utilizationSeries: UtilizationChartPoint[] = [];
  const queueSeries: QueueChartPoint[] = [];

  let peakTraffic = 0;
  let peakLatency = 0;
  let totalErrors = 0;

  for (const s of decimatedSamples) {
    const timeSec = Math.round(s.timeMs / 1000);
    const errorRps = s.system.failedRps + s.system.rejectedRps + s.system.timedOutRps;

    trafficSeries.push({
      timeMs: s.timeMs,
      timeSec,
      incomingRps: s.system.incomingRps,
      successfulRps: s.system.successfulRps,
      errorRps,
    });

    latencySeries.push({
      timeMs: s.timeMs,
      timeSec,
      avgMs: Math.round(s.system.avgLatencyMs),
      p95Ms: Math.round(s.system.p95Ms),
      p99Ms: Math.round(s.system.p99Ms),
    });

    const nodeUtils: Record<string, number> = {};
    const nodeQueues: Record<string, { queue: number; limit: number }> = {};

    for (const nodeId of topNodes) {
      const n = s.nodes[nodeId];
      nodeUtils[nodeId] = Math.round((n?.utilization ?? 0) * 100);
      nodeQueues[nodeId] = {
        queue: n?.queueLength ?? 0,
        limit: n?.queueLimit ?? 100,
      };
    }

    utilizationSeries.push({
      timeMs: s.timeMs,
      timeSec,
      nodes: nodeUtils,
    });

    queueSeries.push({
      timeMs: s.timeMs,
      timeSec,
      nodes: nodeQueues,
    });

    if (s.system.incomingRps > peakTraffic) peakTraffic = s.system.incomingRps;
    if (s.system.p99Ms > peakLatency) peakLatency = s.system.p99Ms;
    totalErrors += errorRps;
  }

  // Notable event markers detection
  const events: ChartNotableEvent[] = [];
  let foundFirstRejection = false;
  let foundFirstTimeout = false;

  for (const s of filtered) {
    if (!foundFirstRejection && s.system.rejectedRps > 0) {
      foundFirstRejection = true;
      events.push({
        timeMs: s.timeMs,
        type: 'first_rejection',
        label: 'First Rejection',
        description: `Requests began rejecting at ${Math.round(s.timeMs / 1000)}s (${s.system.rejectedRps} req/s)`,
      });
    }

    if (!foundFirstTimeout && s.system.timedOutRps > 0) {
      foundFirstTimeout = true;
      events.push({
        timeMs: s.timeMs,
        type: 'first_timeout',
        label: 'First Timeout',
        description: `Requests began timing out at ${Math.round(s.timeMs / 1000)}s`,
      });
    }
  }

  const durationSec = Math.round((maxMs - minMs) / 1000);
  const accessibleSummary = `Simulation metrics over ${durationSec}s: Traffic peaked at ${peakTraffic.toLocaleString()} RPS, P99 latency peaked at ${Math.round(
    peakLatency
  )}ms. Total error events: ${totalErrors.toLocaleString()}.`;

  return {
    timeRange: { minMs, maxMs },
    trafficSeries,
    latencySeries,
    utilizationSeries,
    queueSeries,
    topNodes,
    clientTimeoutMs,
    events,
    accessibleSummary,
  };
}
