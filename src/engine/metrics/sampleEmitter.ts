/**
 * Standard Metrics Sample Emitter.
 * Constructs uniform MetricsSample instances for both Discrete and Aggregate modes.
 * Decoupled from React.
 */

import { SimulationSnapshot } from '../protocol';
import { GraphConfig, AppServerConfig, DatabaseConfig } from '../../types';
import { MetricsSample, SystemMetricSample, NodeMetricSample } from '../../types/metrics';
import { createEmptyHistogram, recordLatencyInHistogram } from './histogram';

export function emitMetricsSample(
  snapshot: SimulationSnapshot,
  graph: GraphConfig,
  previousSnapshot?: SimulationSnapshot | null
): MetricsSample {
  const timeMs = snapshot.timeMs;
  const timeDeltaSec = previousSnapshot ? Math.max(0.1, (timeMs - previousSnapshot.timeMs) / 1000) : 1.0;

  // Rate calculations
  const createdDelta = previousSnapshot
    ? Math.max(0, snapshot.counters.created - previousSnapshot.counters.created)
    : snapshot.counters.created;
  const succeededDelta = previousSnapshot
    ? Math.max(0, snapshot.counters.succeeded - previousSnapshot.counters.succeeded)
    : snapshot.counters.succeeded;
  const failedDelta = previousSnapshot
    ? Math.max(0, snapshot.counters.failed - previousSnapshot.counters.failed)
    : snapshot.counters.failed;
  const rejectedDelta = previousSnapshot
    ? Math.max(0, snapshot.counters.rejected - previousSnapshot.counters.rejected)
    : snapshot.counters.rejected;
  const timedOutDelta = previousSnapshot
    ? Math.max(0, snapshot.counters.timedOut - previousSnapshot.counters.timedOut)
    : snapshot.counters.timedOut;
  const retriedDelta = previousSnapshot
    ? Math.max(0, (snapshot.counters.retried ?? 0) - (previousSnapshot.counters.retried ?? 0))
    : (snapshot.counters.retried ?? 0);

  const incomingRps = Math.round(createdDelta / timeDeltaSec);
  const successfulRps = Math.round(succeededDelta / timeDeltaSec);
  const failedRps = Math.round(failedDelta / timeDeltaSec);
  const rejectedRps = Math.round(rejectedDelta / timeDeltaSec);
  const timedOutRps = Math.round(timedOutDelta / timeDeltaSec);
  const retryRps = Math.round(retriedDelta / timeDeltaSec);

  // Multi-class split rates
  const legitCreatedDelta = previousSnapshot
    ? Math.max(
        0,
        (snapshot.counters.legitimate?.created ?? 0) -
          (previousSnapshot.counters.legitimate?.created ?? 0)
      )
    : snapshot.counters.legitimate?.created ?? 0;
  const malCreatedDelta = previousSnapshot
    ? Math.max(
        0,
        (snapshot.counters.malicious?.created ?? 0) -
          (previousSnapshot.counters.malicious?.created ?? 0)
      )
    : snapshot.counters.malicious?.created ?? 0;

  const legitimateIncomingRps = Math.round(legitCreatedDelta / timeDeltaSec);
  const maliciousIncomingRps = Math.round(malCreatedDelta / timeDeltaSec);
  const legitimateSuccessRate = snapshot.counters.legitimateSuccessRate ?? 100;
  const attackTrafficShare = snapshot.counters.attackTrafficShare ?? 0;
  const exposureEventsCount = snapshot.counters.exposureEvents ?? 0;
  const compromisedServersCount = snapshot.counters.compromisedServersCount ?? 0;
  const dataEgressMb = snapshot.counters.dataEgressMb ?? 0;

  // Phase 8B: Defense rate calculations
  const blockedMalDelta = previousSnapshot
    ? Math.max(0, (snapshot.counters.blockedMalicious ?? 0) - (previousSnapshot.counters.blockedMalicious ?? 0))
    : (snapshot.counters.blockedMalicious ?? 0);
  const blockedLegitDelta = previousSnapshot
    ? Math.max(0, (snapshot.counters.blockedLegitimate ?? 0) - (previousSnapshot.counters.blockedLegitimate ?? 0))
    : (snapshot.counters.blockedLegitimate ?? 0);
  const blockedMaliciousRps = Math.round(blockedMalDelta / timeDeltaSec);
  const blockedLegitimateRps = Math.round(blockedLegitDelta / timeDeltaSec);

  const totalMaliciousCreated = snapshot.counters.malicious?.created ?? 0;
  const totalMaliciousBlocked = snapshot.counters.blockedMalicious ?? 0;
  const attackBlockedPercent = totalMaliciousCreated > 0
    ? Math.min(100, Math.round((totalMaliciousBlocked / totalMaliciousCreated) * 1000) / 10)
    : 0;

  let circuitBreakerOpenCount = 0;
  let quarantinedServerCount = 0;
  for (const nState of Object.values(snapshot.runtimeNodes)) {
    if (nState.circuitBreakerState === 'open') circuitBreakerOpenCount++;
    if (nState.isQuarantined) quarantinedServerCount++;
  }

  // Server instance counts
  const appNodes = graph.nodes.filter((n) => n.type === 'app-server');
  const totalServerInstances = appNodes.length;
  let healthyServerCount = 0;

  for (const n of appNodes) {
    const state = snapshot.runtimeNodes[n.id];
    if (state && state.status !== 'failed') {
      healthyServerCount++;
    }
  }

  // Latency Histogram for sample
  const hist = createEmptyHistogram();
  if (snapshot.latencySummary.averageMs > 0) {
    // Distribute sample counts according to summary
    recordLatencyInHistogram(hist, snapshot.latencySummary.p50Ms, Math.max(1, Math.round(successfulRps * 0.5)));
    recordLatencyInHistogram(hist, snapshot.latencySummary.p95Ms, Math.max(1, Math.round(successfulRps * 0.45)));
    recordLatencyInHistogram(hist, snapshot.latencySummary.p99Ms, Math.max(1, Math.round(successfulRps * 0.05)));
  }

  const system: SystemMetricSample = {
    timeMs,
    incomingRps,
    successfulRps,
    failedRps,
    rejectedRps,
    timedOutRps,
    retryRps,
    amplificationFactor: snapshot.amplificationFactor ?? 1.0,
    orphanedWorkCount: snapshot.counters.orphanedWork ?? 0,
    packetLossCount: snapshot.counters.packetLoss ?? 0,
    activeFailureCount: snapshot.activeFailures?.length ?? 0,
    avgLatencyMs: snapshot.latencySummary.averageMs,
    p50Ms: snapshot.latencySummary.p50Ms,
    p95Ms: snapshot.latencySummary.p95Ms,
    p99Ms: snapshot.latencySummary.p99Ms,
    inFlightRequests: snapshot.counters.inFlight,
    totalServerInstances,
    healthyServerCount,
    latencyHistogram: hist,
    legitimateIncomingRps,
    maliciousIncomingRps,
    legitimateSuccessRate,
    attackTrafficShare,
    exposureEventsCount,
    compromisedServersCount,
    dataEgressMb,
    blockedMaliciousRps,
    blockedLegitimateRps,
    attackBlockedPercent,
    activeInstancesCount: snapshot.counters.activeInstancesCount,
    circuitBreakerOpenCount,
    quarantinedServerCount,
    autoscalingCostDollars: snapshot.counters.autoscalingCostDollars,
    queueDepth: snapshot.counters.queueDepth ?? 0,
    consumerLagMs: snapshot.counters.consumerLagMs ?? 0,
    replicationLagMs: snapshot.counters.replicationLagMs ?? 0,
    staleReadsCount: snapshot.counters.staleReadsCount ?? 0,
    asyncJobsEnqueued: snapshot.counters.asyncJobsEnqueued ?? 0,
    asyncJobsProcessed: snapshot.counters.asyncJobsProcessed ?? 0,
  };

  const nodes: Record<string, NodeMetricSample> = {};

  for (const node of graph.nodes) {
    const nState = snapshot.runtimeNodes[node.id];
    let queueLimit = 100;
    let cpu = 15;
    let mem = 256;

    if (node.type === 'app-server') {
      const cfg = node.config as AppServerConfig;
      queueLimit = cfg?.queueSize ?? 100;
      const util = nState?.utilization ?? 0;
      cpu = Math.min(100, Math.round(10 + util * 85));
      mem = Math.round((cfg?.memoryMb ?? 2048) * (0.25 + util * 0.65));
    } else if (node.type === 'database') {
      const cfg = node.config as DatabaseConfig;
      queueLimit = cfg?.queueCapacity ?? 200;
      const util = nState?.utilization ?? 0;
      cpu = Math.min(100, Math.round(5 + util * 90));
      mem = 1024 + Math.round(util * 2048);
    } else if (node.type === 'load-balancer' || node.type === 'api-gateway') {
      queueLimit = 500;
      cpu = Math.min(100, Math.round(5 + (nState?.utilization ?? 0) * 40));
      mem = 512;
    }

    const util = nState?.utilization ?? 0;
    const procRps = Math.round((nState?.currentRps ?? 0) * (util > 0 ? 1 : 0.8));
    const rejRps = (nState?.errorRate ?? 0) > 0 ? Math.round((nState?.currentRps ?? 0) * (nState?.errorRate ?? 0)) : 0;

    nodes[node.id] = {
      nodeId: node.id,
      type: node.type,
      incomingRps: nState?.currentRps ?? 0,
      processedRps: procRps,
      rejectedRps: rejRps,
      utilization: util,
      queueLength: nState?.queueDepth ?? 0,
      queueLimit,
      estimatedCpuPercent: cpu,
      estimatedMemoryMb: mem,
      attackTrafficShare: nState?.attackTrafficShare ?? 0,
      isCompromised: nState?.isCompromised ?? false,
      isQuarantined: nState?.isQuarantined ?? false,
      circuitBreakerState: nState?.circuitBreakerState,
      activeInstances: nState?.activeInstances,
      pendingInstances: nState?.pendingInstances,
      blockedMaliciousRps: nState?.blockedMaliciousRps ?? 0,
      blockedLegitimateRps: nState?.blockedLegitimateRps ?? 0,
      status: nState?.status ?? 'healthy',
    };
  }

  return {
    timeMs,
    system,
    nodes,
  };
}
