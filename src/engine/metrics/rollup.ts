/**
 * Pure metrics rollup, min/max preserving decimation, and time-lookup functions.
 * Strictly decoupled from React and DOM.
 */

import { MetricsSample, SystemMetricSample, NodeMetricSample } from '../../types/metrics';
import { mergeHistograms, computePercentilesFromHistogram } from './histogram';

/**
 * Rolls up fine-grained metrics samples into coarser time buckets (e.g., 5s or 30s).
 * Merges histograms cleanly and tracks rate averages and peaks.
 */
export function rollupMetrics(
  samples: MetricsSample[],
  bucketSizeMs: number
): MetricsSample[] {
  if (samples.length === 0 || bucketSizeMs <= 1000) {
    return samples;
  }

  const buckets = new Map<number, MetricsSample[]>();

  for (const sample of samples) {
    const bucketKey = Math.floor(sample.timeMs / bucketSizeMs) * bucketSizeMs;
    const existing = buckets.get(bucketKey);
    if (!existing) {
      buckets.set(bucketKey, [sample]);
    } else {
      existing.push(sample);
    }
  }

  const rolled: MetricsSample[] = [];

  for (const [bucketTimeMs, group] of buckets.entries()) {
    if (group.length === 0) continue;
    const count = group.length;

    // Merge system metrics
    let incomingRpsSum = 0;
    let successfulRpsSum = 0;
    let failedRpsSum = 0;
    let rejectedRpsSum = 0;
    let timedOutRpsSum = 0;
    let inFlightSum = 0;
    let healthyServersSum = 0;
    let totalServers = 0;
    const histograms: number[][] = [];

    for (const s of group) {
      incomingRpsSum += s.system.incomingRps;
      successfulRpsSum += s.system.successfulRps;
      failedRpsSum += s.system.failedRps;
      rejectedRpsSum += s.system.rejectedRps;
      timedOutRpsSum += s.system.timedOutRps;
      inFlightSum += s.system.inFlightRequests;
      healthyServersSum += s.system.healthyServerCount;
      totalServers = s.system.totalServerInstances;
      if (s.system.latencyHistogram) {
        histograms.push(s.system.latencyHistogram);
      }
    }

    const mergedHist = mergeHistograms(histograms);
    const latencyStats = computePercentilesFromHistogram(mergedHist);

    const system: SystemMetricSample = {
      timeMs: bucketTimeMs,
      incomingRps: Math.round(incomingRpsSum / count),
      successfulRps: Math.round(successfulRpsSum / count),
      failedRps: Math.round(failedRpsSum / count),
      rejectedRps: Math.round(rejectedRpsSum / count),
      timedOutRps: Math.round(timedOutRpsSum / count),
      avgLatencyMs: latencyStats.averageMs,
      p50Ms: latencyStats.p50Ms,
      p95Ms: latencyStats.p95Ms,
      p99Ms: latencyStats.p99Ms,
      inFlightRequests: Math.round(inFlightSum / count),
      totalServerInstances: totalServers,
      healthyServerCount: Math.round(healthyServersSum / count),
      latencyHistogram: mergedHist,
    };

    // Merge per-node metrics
    const nodeIds = Object.keys(group[0]?.nodes ?? {});
    const nodes: Record<string, NodeMetricSample> = {};

    for (const nodeId of nodeIds) {
      let nodeInRps = 0;
      let nodeProcRps = 0;
      let nodeRejRps = 0;
      let nodeUtil = 0;
      let nodeQueue = 0;
      let nodeQueueLimit = 0;
      let nodeCpu = 0;
      let nodeMem = 0;
      let nodeType = group[0]?.nodes[nodeId]?.type ?? 'app-server';
      let worstStatus: NodeMetricSample['status'] = 'healthy';

      for (const s of group) {
        const n = s.nodes[nodeId];
        if (!n) continue;
        nodeType = n.type;
        nodeInRps += n.incomingRps;
        nodeProcRps += n.processedRps;
        nodeRejRps += n.rejectedRps;
        nodeUtil = Math.max(nodeUtil, n.utilization); // Preserve peak utilization
        nodeQueue = Math.max(nodeQueue, n.queueLength); // Preserve peak queue depth
        nodeQueueLimit = n.queueLimit;
        nodeCpu = Math.max(nodeCpu, n.estimatedCpuPercent);
        nodeMem = Math.max(nodeMem, n.estimatedMemoryMb);

        if (n.status === 'failed') worstStatus = 'failed';
        else if (n.status === 'overloaded' && worstStatus !== 'failed') worstStatus = 'overloaded';
        else if (n.status === 'warning' && worstStatus === 'healthy') worstStatus = 'warning';
      }

      nodes[nodeId] = {
        nodeId,
        type: nodeType,
        incomingRps: Math.round(nodeInRps / count),
        processedRps: Math.round(nodeProcRps / count),
        rejectedRps: Math.round(nodeRejRps / count),
        utilization: Math.round(nodeUtil * 100) / 100,
        queueLength: nodeQueue,
        queueLimit: nodeQueueLimit,
        estimatedCpuPercent: Math.round(nodeCpu),
        estimatedMemoryMb: Math.round(nodeMem),
        status: worstStatus,
      };
    }

    rolled.push({
      timeMs: bucketTimeMs,
      system,
      nodes,
    });
  }

  return rolled.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Min/Max-preserving decimation algorithm.
 * Guarantees that any peak spike or steep drop is not lost when downsampling to ~maxPoints points.
 */
export function decimateSeries<T extends { timeMs: number }>(
  points: T[],
  maxPoints = 500,
  getValue?: (item: T) => number
): T[] {
  if (points.length <= maxPoints || maxPoints < 4) {
    return points;
  }

  const result: T[] = [];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  result.push(first);

  const numBuckets = Math.floor((maxPoints - 2) / 2);
  const bucketSize = (points.length - 2) / numBuckets;

  const valueExtractor = getValue ?? ((item: T & Record<string, unknown>) => {
    // Default to first numeric property
    const val = (item as unknown as { value?: number }).value;
    return typeof val === 'number' ? val : 0;
  });

  for (let i = 0; i < numBuckets; i++) {
    const startIndex = 1 + Math.floor(i * bucketSize);
    const endIndex = Math.min(points.length - 1, 1 + Math.floor((i + 1) * bucketSize));

    if (startIndex >= endIndex) continue;

    let minPoint = points[startIndex]!;
    let minVal = valueExtractor(minPoint);
    let maxPoint = points[startIndex]!;
    let maxVal = valueExtractor(maxPoint);

    for (let j = startIndex + 1; j < endIndex; j++) {
      const p = points[j]!;
      const val = valueExtractor(p);
      if (val < minVal) {
        minVal = val;
        minPoint = p;
      }
      if (val > maxVal) {
        maxVal = val;
        maxPoint = p;
      }
    }

    // Preserve temporal ordering within bucket
    if (minPoint.timeMs < maxPoint.timeMs) {
      result.push(minPoint);
      if (minPoint !== maxPoint) {
        result.push(maxPoint);
      }
    } else {
      result.push(maxPoint);
      if (minPoint !== maxPoint) {
        result.push(minPoint);
      }
    }
  }

  result.push(last);
  return result;
}

/**
 * Finds the metrics sample closest in time to targetTimeMs using binary search.
 */
export function getSampleAtTime(
  samples: MetricsSample[],
  targetTimeMs: number
): MetricsSample | null {
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0]!;

  let low = 0;
  let high = samples.length - 1;

  if (targetTimeMs <= samples[low]!.timeMs) return samples[low]!;
  if (targetTimeMs >= samples[high]!.timeMs) return samples[high]!;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midTime = samples[mid]!.timeMs;

    if (midTime === targetTimeMs) {
      return samples[mid]!;
    }
    if (midTime < targetTimeMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Choose the closer neighbor
  const before = samples[Math.max(0, high)]!;
  const after = samples[Math.min(samples.length - 1, low)]!;
  return Math.abs(before.timeMs - targetTimeMs) <= Math.abs(after.timeMs - targetTimeMs)
    ? before
    : after;
}
