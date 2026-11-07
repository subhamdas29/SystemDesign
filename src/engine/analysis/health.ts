/**
 * Pure System Health Model.
 * Evaluates system and node health states with plain-language diagnoses.
 * Decoupled from React and external libraries.
 */

import { SystemMetricSample, NodeMetricSample, SystemHealthResult } from '../../types/metrics';
import { GraphConfig, ClientConfig } from '../../types';
import { RuntimeBottleneck } from './types';

export interface HealthThresholds {
  errorRateDegraded: number; // 0.01 (1%)
  errorRateCritical: number; // 0.10 (10%)
  latencyRatioDegraded: number; // 0.50 (50% of client requestTimeoutMs)
  latencyRatioCritical: number; // 0.90 (90% of client requestTimeoutMs)
  queueFillDegraded: number; // 0.70 (70% of queue limit)
  queueFillCritical: number; // 0.90 (90% of queue limit)
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  errorRateDegraded: 0.01,
  errorRateCritical: 0.10,
  latencyRatioDegraded: 0.50,
  latencyRatioCritical: 0.90,
  queueFillDegraded: 0.70,
  queueFillCritical: 0.90,
};

/**
 * Classifies overall system health into healthy, degraded, or critical,
 * accompanied by clear, beginner-friendly plain language reasons.
 */
export function classifySystemHealth(
  sample: SystemMetricSample,
  graph: GraphConfig,
  bottleneck: RuntimeBottleneck | null = null,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): SystemHealthResult {
  const details: string[] = [];

  // 1. Check App Server instance health
  if (sample.totalServerInstances > 0 && sample.healthyServerCount === 0) {
    return {
      status: 'critical',
      reason: 'No healthy servers available: all app server instances are down or offline.',
      details: ['Total server instances: ' + sample.totalServerInstances, 'Healthy instances: 0'],
    };
  }

  // 2. Compute error rate
  const totalCompletedOrErrored =
    sample.successfulRps + sample.failedRps + sample.rejectedRps + sample.timedOutRps;
  const errorRps = sample.failedRps + sample.rejectedRps + sample.timedOutRps;
  const errorRate = totalCompletedOrErrored > 0 ? errorRps / totalCompletedOrErrored : 0;

  // 3. Client timeout lookup
  const clientNode = graph.nodes.find((n) => n.type === 'client');
  const clientConfig = clientNode?.config as ClientConfig | undefined;
  const requestTimeoutMs = clientConfig?.requestTimeoutMs ?? 5000;
  const latencyRatio = sample.p99Ms / requestTimeoutMs;

  // 4. Critical Health Conditions
  if (errorRate >= thresholds.errorRateCritical) {
    const errorPct = Math.round(errorRate * 100);
    const bottleneckReason = bottleneck
      ? `the ${bottleneck.nodeId} (${bottleneck.type}) queue is full.`
      : 'downstream backends are overwhelmed.';
    return {
      status: 'critical',
      reason: `Error rate is ${errorPct}%: ${bottleneckReason}`,
      details: [
        `Rejection rate: ${sample.rejectedRps} req/s`,
        `Timeout rate: ${sample.timedOutRps} req/s`,
        `Failed rate: ${sample.failedRps} req/s`,
      ],
    };
  }

  if (latencyRatio >= thresholds.latencyRatioCritical) {
    return {
      status: 'critical',
      reason: `P99 latency (${Math.round(sample.p99Ms)}ms) has breached ${Math.round(thresholds.latencyRatioCritical * 100)}% of client timeout (${requestTimeoutMs}ms).`,
      details: [`P99 Latency: ${Math.round(sample.p99Ms)}ms`, `Timeout threshold: ${requestTimeoutMs}ms`],
    };
  }

  // 5. Degraded Health Conditions
  if (errorRate >= thresholds.errorRateDegraded) {
    const errorPct = (errorRate * 100).toFixed(1);
    const bottleneckReason = bottleneck
      ? `bottleneck detected on ${bottleneck.nodeId} (${bottleneck.type}).`
      : 'some requests are failing or rejected.';
    return {
      status: 'degraded',
      reason: `Error rate is ${errorPct}%: ${bottleneckReason}`,
      details: [`Error rate: ${errorPct}%`, `Successful RPS: ${sample.successfulRps}`],
    };
  }

  if (latencyRatio >= thresholds.latencyRatioDegraded) {
    return {
      status: 'degraded',
      reason: `High P99 latency (${Math.round(sample.p99Ms)}ms) approaching client timeout (${requestTimeoutMs}ms).`,
      details: [`P99: ${Math.round(sample.p99Ms)}ms`, `Average: ${Math.round(sample.avgLatencyMs)}ms`],
    };
  }

  // Check if bottleneck has a saturated queue
  if (bottleneck && bottleneck.queueDepth > 0) {
    return {
      status: 'degraded',
      reason: `Queue buildup on ${bottleneck.nodeId} (${bottleneck.queueDepth} requests waiting).`,
      details: [bottleneck.reason],
    };
  }

  if (sample.totalServerInstances > 0 && sample.healthyServerCount < sample.totalServerInstances) {
    return {
      status: 'degraded',
      reason: `${sample.totalServerInstances - sample.healthyServerCount} of ${sample.totalServerInstances} app servers are degraded or offline.`,
      details: [`Healthy servers: ${sample.healthyServerCount}/${sample.totalServerInstances}`],
    };
  }

  // 6. Healthy
  return {
    status: 'healthy',
    reason: 'All infrastructure components operating within normal latency and error limits.',
    details,
  };
}

/**
 * Classifies the health status of an individual infrastructure node,
 * consistent with node ring states from Phase 4 and 5.
 */
export function classifyNodeStatus(
  nodeSample: NodeMetricSample,
  componentConfig?: { health?: string; queueLimit?: number }
): 'healthy' | 'warning' | 'overloaded' | 'failed' {
  if (componentConfig?.health === 'down' || nodeSample.status === 'failed') {
    return 'failed';
  }

  const queueLimit = nodeSample.queueLimit || componentConfig?.queueLimit || 100;
  const queueFillRatio = queueLimit > 0 ? nodeSample.queueLength / queueLimit : 0;

  if (queueFillRatio >= 0.8 || nodeSample.utilization >= 0.95 || nodeSample.rejectedRps > 0) {
    return 'overloaded';
  }

  if (queueFillRatio >= 0.5 || nodeSample.utilization >= 0.75) {
    return 'warning';
  }

  return 'healthy';
}
