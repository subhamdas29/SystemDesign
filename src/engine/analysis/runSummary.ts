/**
 * Pure Run Summary Builder.
 * Synthesizes holistic post-run performance diagnostics, first saturation point,
 * degradation duration, and actionable architectural remedies.
 * STRICT: ZERO React, DOM, Date.now(), or Math.random() imports.
 */

import { GraphConfig } from '../../types';
import { TrafficConfig, SimulationSnapshot } from '../protocol';
import {
  RunSummaryData,
  RunResult,
  MetricsSample,
  FirstSaturatedComponent,
  SuggestedFix,
} from '../../types/metrics';
import { classifySystemHealth } from './health';
import { analyzeCapacity } from './capacityAnalysis';

/**
 * Pure hash function for determinism verification.
 */
export function computeConfigHash(graph: GraphConfig, traffic: TrafficConfig, seed: number): string {
  const content = JSON.stringify({
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, config: n.config })),
    edges: graph.edges.map((e) => ({ source: e.source, target: e.target })),
    traffic: { rps: traffic.peakRps, duration: traffic.durationMs, pattern: traffic.pattern },
    seed,
  });

  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0;
  }
  return `run-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

const FIX_TEMPLATES: Record<string, { title: string; description: string }> = {
  cache: {
    title: 'Introduce a Cache Layer',
    description: 'Add a Cache component between App Server and Database to absorb repeated read queries and prevent database pool exhaustion.',
  },
  'load-balancer': {
    title: 'Deploy a Load Balancer',
    description: 'Place a Load Balancer at the edge to distribute incoming traffic evenly across multiple backend server instances.',
  },
  'app-server': {
    title: 'Scale Out App Servers',
    description: 'Increase the number of App Server instances to distribute concurrent processing and prevent CPU/thread saturation.',
  },
  cdn: {
    title: 'Add a Content Delivery Network (CDN)',
    description: 'Cache static assets and API read responses closer to users at the edge.',
  },
  router: {
    title: 'Add an Edge Router',
    description: 'Buffer and route network traffic efficiently before reaching application servers.',
  },
};

/**
 * Builds the comprehensive RunSummaryData and serializable RunResult.
 * Deterministic: identical graph, traffic, seed, and snapshots produce the exact same RunResult.
 */
export function buildRunSummary(params: {
  graph: GraphConfig;
  traffic: TrafficConfig;
  seed: number;
  samples: MetricsSample[];
  finalSnapshot: SimulationSnapshot;
  timestamp?: number;
}): RunResult {
  const { graph, traffic, seed, samples, finalSnapshot, timestamp } = params;

  const totalCreated = finalSnapshot.counters.created;
  const totalSucceeded = finalSnapshot.counters.succeeded;
  const totalFailed = finalSnapshot.counters.failed;
  const totalRejected = finalSnapshot.counters.rejected;
  const totalTimedOut = finalSnapshot.counters.timedOut;

  const totalEnded = totalSucceeded + totalFailed + totalRejected + totalTimedOut;
  const successRatePercent = totalEnded > 0 ? Math.round((totalSucceeded / totalEnded) * 1000) / 10 : 100;

  // Peak RPS calculations
  let peakHandled = 0;
  let peakOffered = traffic.peakRps ?? 100;
  let peakAmplification = finalSnapshot.amplificationFactor ?? 1.0;

  for (const s of samples) {
    if (s.system.successfulRps > peakHandled) {
      peakHandled = s.system.successfulRps;
    }
    if (s.system.incomingRps > peakOffered) {
      peakOffered = s.system.incomingRps;
    }
    if (s.system.amplificationFactor && s.system.amplificationFactor > peakAmplification) {
      peakAmplification = s.system.amplificationFactor;
    }
  }

  // Build cascade timeline from events and samples
  const cascadeTimeline: import('../../types/metrics').CascadeTimelineEvent[] = [];
  const events = finalSnapshot.recentEvents || [];

  for (const ev of events) {
    if (ev.type === 'FAILURE_INJECTED') {
      cascadeTimeline.push({
        timeMs: ev.timestamp,
        type: 'failure_injected',
        label: `Failure Injected: ${ev.failureType}`,
        description: `Injected ${ev.failureType} on ${ev.nodeId}`,
        severity: 'critical',
      });
    } else if (ev.type === 'FAILURE_REMOVED') {
      cascadeTimeline.push({
        timeMs: ev.timestamp,
        type: 'recovery',
        label: `Failure Removed`,
        description: `Failure on ${ev.nodeId} was resolved/removed`,
        severity: 'info',
      });
    } else if (ev.type === 'HEALTH_CHECK_FAILED') {
      cascadeTimeline.push({
        timeMs: ev.timestamp,
        type: 'saturation',
        label: `Health Check Failed`,
        description: `Load balancer marked ${ev.nodeId} unhealthy and removed it from rotation`,
        severity: 'warning',
      });
    } else if (ev.type === 'HEALTH_CHECK_RECOVERED') {
      cascadeTimeline.push({
        timeMs: ev.timestamp,
        type: 'recovery',
        label: `Health Check Recovered`,
        description: `Load balancer detected ${ev.nodeId} healthy and returned it to rotation`,
        severity: 'info',
      });
    }
  }

  // Detect retry storms in samples if not already in timeline
  let retryStormRecorded = false;
  for (const s of samples) {
    if (!retryStormRecorded && s.system.amplificationFactor && s.system.amplificationFactor >= 1.5) {
      cascadeTimeline.push({
        timeMs: s.timeMs,
        type: 'retry_storm',
        label: 'Retry Storm Detected',
        description: `Retries amplified traffic to ${(s.system.amplificationFactor * 100).toFixed(0)}% of baseline load`,
        severity: 'critical',
      });
      retryStormRecorded = true;
    }
  }

  cascadeTimeline.sort((a, b) => a.timeMs - b.timeMs);

  // First saturated component identification
  let firstSaturated: FirstSaturatedComponent | null = null;
  let timeDegradedMs = 0;
  let timeCriticalMs = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const health = classifySystemHealth(s.system, graph, finalSnapshot.bottleneck);

    const stepMs = i > 0 ? Math.max(100, s.timeMs - samples[i - 1]!.timeMs) : 1000;
    if (health.status === 'critical') {
      timeCriticalMs += stepMs;
    } else if (health.status === 'degraded') {
      timeDegradedMs += stepMs;
    }

    if (!firstSaturated) {
      for (const [nodeId, nSample] of Object.entries(s.nodes)) {
        if (
          nSample.status === 'overloaded' ||
          nSample.queueLength >= nSample.queueLimit * 0.8 ||
          nSample.rejectedRps > 0
        ) {
          firstSaturated = {
            nodeId,
            type: nSample.type,
            timeMs: s.timeMs,
            reason:
              nSample.rejectedRps > 0
                ? `Queue capacity full (${nSample.queueLength}/${nSample.queueLimit}), rejecting ${nSample.rejectedRps} req/s`
                : `Queue depth reached ${nSample.queueLength} requests at ${(nSample.utilization * 100).toFixed(0)}% utilization`,
          };
          break;
        }
      }
    }
  }

  // Static Capacity Analysis for suggested fixes
  const capacityAnalysis = analyzeCapacity(graph);
  const suggestedFixes: SuggestedFix[] = [];

  for (const fixType of capacityAnalysis.suggestedFixes.slice(0, 3)) {
    const template = FIX_TEMPLATES[fixType] ?? {
      title: `Add ${fixType}`,
      description: `Integrate ${fixType} to scale capacity.`,
    };
    suggestedFixes.push({
      title: template.title,
      description: template.description,
      componentType: fixType,
    });
  }

  if (suggestedFixes.length === 0 && finalSnapshot.bottleneck) {
    suggestedFixes.push({
      title: `Optimize ${finalSnapshot.bottleneck.nodeId}`,
      description: finalSnapshot.bottleneck.reason,
      componentType: finalSnapshot.bottleneck.type,
    });
  }

  const identifiedBottleneck = finalSnapshot.bottleneck
    ? `${finalSnapshot.bottleneck.nodeId} (${finalSnapshot.bottleneck.type}): ${finalSnapshot.bottleneck.reason}`
    : capacityAnalysis.bottleneckNodeId
    ? `${capacityAnalysis.bottleneckNodeId}: ${capacityAnalysis.explanation}`
    : null;

  if (peakAmplification > 1.25 || (finalSnapshot.counters.retried ?? 0) > 50) {
    suggestedFixes.unshift({
      title: 'Configure Exponential Backoff with Jitter',
      description: `Client retries amplified load by ${peakAmplification.toFixed(1)}x. Switch retry policy to exponential backoff with full jitter and a 20% retry budget to suppress cascades.`,
      componentType: 'client',
    });
  }

  const summaryData: RunSummaryData = {
    totalRequests: totalCreated,
    successRatePercent,
    peakRpsHandled: peakHandled,
    peakRpsOffered: peakOffered,
    avgLatencyMs: finalSnapshot.latencySummary.averageMs,
    p99LatencyMs: finalSnapshot.latencySummary.p99Ms,
    totalSucceeded,
    totalFailed,
    totalRejected,
    totalTimedOut,
    totalRetries: finalSnapshot.counters.retried ?? 0,
    peakAmplificationFactor: Math.round(peakAmplification * 100) / 100,
    cascadeTimeline,
    firstSaturatedComponent: firstSaturated,
    identifiedBottleneck,
    timeSpentDegradedMs: Math.round(timeDegradedMs),
    timeSpentCriticalMs: Math.round(timeCriticalMs),
    suggestedFixes,
  };

  const configHash = computeConfigHash(graph, traffic, seed);
  const effectiveTimestamp = timestamp ?? finalSnapshot.timeMs;

  return {
    runId: `${configHash}-${effectiveTimestamp}`,
    timestamp: effectiveTimestamp,
    configHash,
    seed,
    trafficConfig: traffic,
    graphConfig: graph,
    summary: summaryData,
    metrics: samples,
  };
}
