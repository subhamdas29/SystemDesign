/**
 * Pure Run Summary Builder.
 * Synthesizes holistic post-run performance diagnostics, first saturation point,
 * degradation duration, and actionable architectural remedies.
 * STRICT: ZERO React, DOM, Date.now(), or Math.random() imports.
 */

import {
  GraphConfig,
  ComponentType,
  CdnConfig,
  FirewallConfig,
  WafConfig,
  RateLimiterConfig,
  AppServerConfig,
  DatabaseConfig,
  LoadBalancerConfig,
} from '../../types';
import { SimulationEvent } from '../../types/runtime';
import { TrafficConfig, SimulationSnapshot } from '../protocol';
import {
  RunSummaryData,
  RunResult,
  MetricsSample,
  FirstSaturatedComponent,
  SuggestedFix,
} from '../../types/metrics';
import {
  DefenseEffectivenessReportData,
  DefenseItemReport,
  PhaseTimingSummary,
  DefenseVerdict,
} from '../../types/defenses';
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
  previousRunSummary?: RunSummaryData | null;
}): RunResult {
  const { graph, traffic, seed, samples, finalSnapshot, timestamp, previousRunSummary } = params;

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
    } else if (ev.type === 'ATTACK_PHASE_STARTED') {
      cascadeTimeline.push({
        timeMs: ev.timestamp,
        type: 'attack_phase',
        label: `Attack Phase Started: ${ev.details?.scenarioId ?? 'Malicious Traffic'}`,
        description: `Injected attack load (${ev.details?.rps ?? 0} RPS) targeting ${ev.details?.targetLayer ?? 'infrastructure'}`,
        severity: 'warning',
      });
    } else if (ev.type === 'EXPOSURE_EVENT') {
      cascadeTimeline.push({
        timeMs: ev.timestamp,
        type: 'security_exposure',
        label: `Security Exposure Event on ${ev.nodeId}`,
        description: `High-risk injection query executed against database without upstream sanitization`,
        severity: 'critical',
      });
    } else if (ev.type === 'SERVER_COMPROMISED') {
      cascadeTimeline.push({
        timeMs: ev.timestamp,
        type: 'server_compromised',
        label: `Server Compromised: ${ev.nodeId}`,
        description: `Lateral movement established foothold on backend server instance`,
        severity: 'critical',
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

  // First failed component identification
  let firstFailedComponent:
    | { nodeId: string; type: ComponentType; timeMs: number; reason: string }
    | null = null;
  for (const ev of events) {
    if (
      ev.type === 'REQUEST_FAILED' &&
      !firstFailedComponent &&
      ev.nodeId !== 'client' &&
      ev.nodeId !== 'threat-source'
    ) {
      const node = graph.nodes.find((n) => n.id === ev.nodeId);
      if (node) {
        firstFailedComponent = {
          nodeId: ev.nodeId,
          type: node.type,
          timeMs: ev.timestamp,
          reason:
            (ev.details?.reason as string) || `Request failed (${ev.details?.statusCode || 500})`,
        };
      }
    }
  }

  // Synthesize Defender Takeaways for attack campaigns
  const defenderTakeaways: string[] = [];
  const isAttackRun =
    (finalSnapshot.counters.malicious?.created ?? 0) > 0 ||
    (finalSnapshot.counters.attackTrafficShare ?? 0) > 0;

  if (isAttackRun) {
    if ((finalSnapshot.counters.exposureEvents ?? 0) > 0) {
      defenderTakeaways.push(
        'Deploy a Web Application Firewall (WAF) to inspect incoming payloads, parameterize database queries, and block SQL/command injection attempts at the edge.'
      );
    }
    if ((finalSnapshot.counters.attackTrafficShare ?? 0) > 20) {
      defenderTakeaways.push(
        'Implement an Edge Rate Limiter with token-bucket or sliding-window algorithms to shed malicious volumetric spikes before backend compute is overwhelmed.'
      );
    }
    if ((finalSnapshot.counters.compromisedServersCount ?? 0) > 0) {
      defenderTakeaways.push(
        'Enforce Zero-Trust network segmentation, strict egress firewalls, and least-privilege service accounts to halt lateral movement and data exfiltration.'
      );
    }
    if (finalSnapshot.counters.orphanedWork && finalSnapshot.counters.orphanedWork > 10) {
      defenderTakeaways.push(
        'Configure connection-level timeouts and max concurrent connections per IP on reverse proxies to mitigate slow-connection resource holding attacks.'
      );
    }
    if (defenderTakeaways.length === 0) {
      defenderTakeaways.push(
        'Layered edge defense (WAF, Rate Limiting, CDN caching) shields origin servers from unauthenticated, high-cost, or uncacheable request patterns.'
      );
    }
  }

  // Phase 8B: Defense Effectiveness Report Synthesis
  const defenseReport = buildDefenseEffectivenessReport({
    graph,
    events,
    samples,
    counters: finalSnapshot.counters,
    latencySummary: finalSnapshot.latencySummary,
    isAttackRun,
    firstSaturated,
    previousRunSummary,
  });

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
    firstFailedComponent,
    identifiedBottleneck,
    timeSpentDegradedMs: Math.round(timeDegradedMs),
    timeSpentCriticalMs: Math.round(timeCriticalMs),
    suggestedFixes,
    isAttackRun,
    legitimateSuccessRate: finalSnapshot.counters.legitimateSuccessRate ?? 100,
    attackTrafficShare: finalSnapshot.counters.attackTrafficShare ?? 0,
    exposureEvents: finalSnapshot.counters.exposureEvents ?? 0,
    compromisedServersCount: finalSnapshot.counters.compromisedServersCount ?? 0,
    dataEgressMb: finalSnapshot.counters.dataEgressMb ?? 0,
    defenderTakeaways,

    // Phase 8B: Defense Report & Totals
    defenseReport,
    totalMaliciousBlocked: finalSnapshot.counters.blockedMalicious ?? 0,
    totalFalsePositives: finalSnapshot.counters.blockedLegitimate ?? 0,
    totalAutoscalingCost: finalSnapshot.counters.autoscalingCostDollars ?? 0,
    exposureLimitedCount: finalSnapshot.counters.exposureLimitedCount ?? 0,
    exposureFullCount: finalSnapshot.counters.exposureFullCount ?? 0,
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

/**
 * Pure Defense Effectiveness Report Builder.
 * Evaluates individual defense items, policy efficacy, verdicts, timing summaries,
 * unmitigated risks, and deltas from previous runs.
 */
export function buildDefenseEffectivenessReport(params: {
  graph: GraphConfig;
  events: SimulationEvent[];
  samples: MetricsSample[];
  counters: import('../protocol').SimulationCounters;
  latencySummary: import('../protocol').LatencySummary;
  isAttackRun: boolean;
  firstSaturated: FirstSaturatedComponent | null;
  previousRunSummary?: RunSummaryData | null;
}): DefenseEffectivenessReportData {
  const { graph, events, samples, counters, latencySummary, isAttackRun, firstSaturated, previousRunSummary } = params;
  const defenses: DefenseItemReport[] = [];

  const totalMaliciousCreated = counters.malicious?.created ?? 0;
  const totalMaliciousRequests = totalMaliciousCreated > 0
    ? totalMaliciousCreated
    : (counters.malicious?.reachedTarget ?? 0) + (counters.malicious?.dropped ?? 0) + (counters.blockedMalicious ?? 0);

  // 1. CDN
  const cdnNode = graph.nodes.find((n) => n.type === 'cdn');
  if (cdnNode) {
    const cfg = cdnNode.config as CdnConfig;
    const inspected = counters.defenseInspected?.['cdn'] ?? 0;
    const blockedMal = counters.defenseBlockedMalicious?.['cdn'] ?? 0;
    const blockedLegit = counters.defenseBlockedLegitimate?.['cdn'] ?? 0;
    const passed = Math.max(0, inspected - blockedMal - blockedLegit);
    const pct = totalMaliciousRequests > 0 ? Math.round((blockedMal / totalMaliciousRequests) * 100) : 0;
    let verdict: DefenseVerdict = 'inactive';
    let verdictReason = 'CDN operational; serving static assets.';
    if (cfg.enabled !== false) {
      if (blockedMal > 0) {
        if (pct >= 60) {
          verdict = 'effective';
          verdictReason = 'Anycast edge scrubbed volumetric DDoS flood before it reached origin servers.';
        } else {
          verdict = 'partially-effective';
          verdictReason = 'CDN absorbed a significant portion of traffic, but origin was still pressured.';
        }
      } else if (isAttackRun) {
        verdict = 'bypassed';
        verdictReason = 'Dynamic or cache-busting traffic passed through to origin without edge hits.';
      }
    } else {
      verdict = 'inactive';
      verdictReason = 'CDN component disabled.';
    }
    defenses.push({
      defenseKey: 'cdn',
      label: 'CDN & Edge Shield',
      type: 'component',
      inspectedCount: inspected,
      blockedMaliciousCount: blockedMal,
      blockedMaliciousPercent: pct,
      blockedLegitimateCount: blockedLegit,
      passedCount: passed,
      addedLatencyMs: cfg.processingLatencyMs ?? 10,
      costDollars: 0,
      verdict,
      verdictReason,
    });
  }

  // 2. Firewall
  const fwNode = graph.nodes.find((n) => n.type === 'firewall');
  if (fwNode) {
    const cfg = fwNode.config as FirewallConfig;
    const inspected = counters.defenseInspected?.['firewall'] ?? 0;
    const blockedMal = counters.defenseBlockedMalicious?.['firewall'] ?? 0;
    const blockedLegit = counters.defenseBlockedLegitimate?.['firewall'] ?? 0;
    const passed = Math.max(0, inspected - blockedMal - blockedLegit);
    const pct = totalMaliciousRequests > 0 ? Math.round((blockedMal / totalMaliciousRequests) * 100) : 0;
    let verdict: DefenseVerdict = 'inactive';
    let verdictReason = 'Firewall stateful inspection active; no malicious IPs matched.';
    if (cfg.enabled !== false) {
      if (blockedLegit > 50 || (inspected > 0 && blockedLegit / inspected > 0.03)) {
        verdict = 'hurt-legitimate-users';
        verdictReason = 'Aggressive IP filtering resulted in false positives, dropping legitimate users.';
      } else if (pct >= 60) {
        verdict = 'effective';
        verdictReason = 'Blocked malicious source IPs following detection lag.';
      } else if (blockedMal > 0) {
        verdict = 'partially-effective';
        verdictReason = 'Blocked known attack IPs, but distributed botnet sources bypassed the blocklist.';
      } else if (isAttackRun) {
        verdict = 'bypassed';
        verdictReason = 'High source cardinality botnet bypassed IP blocklist capacity.';
      }
    } else {
      verdict = 'inactive';
      verdictReason = 'Firewall component disabled.';
    }
    defenses.push({
      defenseKey: 'firewall',
      label: 'Network Firewall',
      type: 'component',
      inspectedCount: inspected,
      blockedMaliciousCount: blockedMal,
      blockedMaliciousPercent: pct,
      blockedLegitimateCount: blockedLegit,
      passedCount: passed,
      addedLatencyMs: cfg.processingLatencyMs ?? 2,
      costDollars: 0,
      verdict,
      verdictReason,
    });
  }

  // 3. WAF
  const wafNode = graph.nodes.find((n) => n.type === 'waf');
  if (wafNode) {
    const cfg = wafNode.config as WafConfig;
    const inspected = counters.defenseInspected?.['waf'] ?? 0;
    const blockedMal = counters.defenseBlockedMalicious?.['waf'] ?? 0;
    const blockedLegit = counters.defenseBlockedLegitimate?.['waf'] ?? 0;
    const passed = Math.max(0, inspected - blockedMal - blockedLegit);
    const pct = totalMaliciousRequests > 0 ? Math.round((blockedMal / totalMaliciousRequests) * 100) : 0;
    let verdict: DefenseVerdict = 'inactive';
    let verdictReason = 'WAF inspecting HTTP traffic; no signature violations detected.';
    if (cfg.enabled !== false) {
      if (blockedLegit > 50 || (inspected > 0 && blockedLegit / inspected > 0.03)) {
        verdict = 'hurt-legitimate-users';
        verdictReason = 'High WAF sensitivity caused false positives, blocking legitimate application requests.';
      } else if (pct >= 60) {
        verdict = 'effective';
        verdictReason = 'Signature rulesets identified and blocked exploit attempts and malicious payloads.';
      } else if (blockedMal > 0) {
        verdict = 'partially-effective';
        verdictReason = 'Blocked malicious signatures, but some non-matching attack traffic reached backends.';
      } else if (isAttackRun) {
        verdict = 'bypassed';
        verdictReason = 'Attack traffic did not match active signature rulesets or bypassed inspection.';
      }
    } else {
      verdict = 'inactive';
      verdictReason = 'WAF component disabled.';
    }
    defenses.push({
      defenseKey: 'waf',
      label: 'Web Application Firewall (WAF)',
      type: 'component',
      inspectedCount: inspected,
      blockedMaliciousCount: blockedMal,
      blockedMaliciousPercent: pct,
      blockedLegitimateCount: blockedLegit,
      passedCount: passed,
      addedLatencyMs: cfg.processingLatencyMs ?? 5,
      costDollars: 0,
      verdict,
      verdictReason,
    });
  }

  // 4. Rate Limiter
  const rlNode = graph.nodes.find((n) => n.type === 'rate-limiter');
  if (rlNode) {
    const cfg = rlNode.config as RateLimiterConfig;
    const inspected = counters.defenseInspected?.['rate-limiter'] ?? 0;
    const blockedMal = counters.defenseBlockedMalicious?.['rate-limiter'] ?? 0;
    const blockedLegit = counters.defenseBlockedLegitimate?.['rate-limiter'] ?? 0;
    const passed = Math.max(0, inspected - blockedMal - blockedLegit);
    const pct = totalMaliciousRequests > 0 ? Math.round((blockedMal / totalMaliciousRequests) * 100) : 0;
    let verdict: DefenseVerdict = 'inactive';
    let verdictReason = 'Rate limiting active; traffic within thresholds.';
    if (cfg.enabled !== false) {
      if (blockedLegit > 50 || (inspected > 0 && blockedLegit / inspected > 0.03) || (cfg.scope === 'global' && blockedLegit > 10)) {
        verdict = 'hurt-legitimate-users';
        verdictReason = cfg.scope === 'global'
          ? 'Global rate limit throttled legitimate users alongside attack traffic.'
          : 'Strict rate limits throttled legitimate user traffic.';
      } else if (pct >= 60) {
        verdict = 'effective';
        verdictReason = 'Rate limiter throttled abusive sources, preventing backend capacity overload.';
      } else if (blockedMal > 0) {
        verdict = 'partially-effective';
        verdictReason = 'Rate limiter shed surge volume, but distributed sources remained under limits.';
      } else if (isAttackRun) {
        verdict = 'bypassed';
        verdictReason = 'Per-source limits were ineffective against distributed botnets with low per-IP volume.';
      }
    } else {
      verdict = 'inactive';
      verdictReason = 'Rate Limiter disabled.';
    }
    defenses.push({
      defenseKey: 'rate-limiter',
      label: 'Rate Limiter',
      type: 'component',
      inspectedCount: inspected,
      blockedMaliciousCount: blockedMal,
      blockedMaliciousPercent: pct,
      blockedLegitimateCount: blockedLegit,
      passedCount: passed,
      addedLatencyMs: 1,
      costDollars: 0,
      verdict,
      verdictReason,
    });
  }

  // 5. Host & Node Policies
  const appNode = graph.nodes.find((n) => n.type === 'app-server');
  const lbNode = graph.nodes.find((n) => n.type === 'load-balancer');
  const dbNode = graph.nodes.find((n) => n.type === 'database');

  // Autoscaling
  const asPolicy = (appNode?.config as AppServerConfig)?.autoscaling;
  if (asPolicy?.enabled) {
    const cost = counters.autoscalingCostDollars ?? 0;
    const activeInst = counters.activeInstancesCount ?? 1;
    let verdict: DefenseVerdict = 'inactive';
    let verdictReason = 'Autoscaling active; baseline capacity was sufficient.';
    if (activeInst > (asPolicy.minInstances ?? 1) || cost > 0) {
      if (firstSaturated?.type === 'database') {
        verdict = 'bypassed';
        verdictReason = 'Scaled out App Servers, but saturated the downstream Database connection pool without improving throughput.';
      } else if ((counters.legitimateSuccessRate ?? 100) >= 80) {
        verdict = 'effective';
        verdictReason = `Dynamically scaled to ${activeInst} instances to absorb load (cost: $${cost.toFixed(2)}).`;
      } else {
        verdict = 'partially-effective';
        verdictReason = `Scaled instances, but reached max instances (${asPolicy.maxInstances ?? 5}) or encountered downstream backpressure.`;
      }
    }
    defenses.push({
      defenseKey: 'autoscaling',
      label: 'App Autoscaling',
      type: 'node-policy',
      inspectedCount: counters.created,
      blockedMaliciousCount: 0,
      blockedMaliciousPercent: 0,
      blockedLegitimateCount: 0,
      passedCount: counters.succeeded,
      addedLatencyMs: 0,
      costDollars: cost,
      verdict,
      verdictReason,
    });
  }

  // Circuit Breakers
  const cbPolicy = (appNode?.config as AppServerConfig)?.circuitBreaker || (lbNode?.config as LoadBalancerConfig)?.circuitBreaker;
  if (cbPolicy?.enabled) {
    const openedEvent = events.find((e) => e.type === 'CIRCUIT_OPENED');
    let verdict: DefenseVerdict = 'inactive';
    let verdictReason = 'Circuit breaker healthy; stayed in CLOSED state.';
    if (openedEvent) {
      verdict = 'effective';
      verdictReason = 'Tripped open during backend degradation, fast-failing traffic to prevent cascading queue exhaustion.';
    }
    defenses.push({
      defenseKey: 'circuit-breaker',
      label: 'Circuit Breaker',
      type: 'node-policy',
      inspectedCount: counters.created,
      blockedMaliciousCount: 0,
      blockedMaliciousPercent: 0,
      blockedLegitimateCount: 0,
      passedCount: counters.succeeded,
      addedLatencyMs: 0,
      costDollars: 0,
      verdict,
      verdictReason,
    });
  }

  // Connection Limits
  const connLimits = (lbNode?.config as LoadBalancerConfig)?.connectionLimits || (appNode?.config as AppServerConfig)?.connectionLimits;
  if (connLimits?.enabled) {
    let verdict: DefenseVerdict = 'inactive';
    let verdictReason = 'Connection limits active; concurrency stayed within bounds.';
    if (isAttackRun && (counters.orphanedWork ?? 0) === 0) {
      verdict = 'effective';
      verdictReason = 'Strict header timeout terminated slow connection attempts, preventing thread exhaustion.';
    } else if (isAttackRun && (counters.orphanedWork ?? 0) > 10) {
      verdict = 'partially-effective';
      verdictReason = 'Connection limits helped, but slow-client connection holding consumed worker threads.';
    }
    defenses.push({
      defenseKey: 'connection-limits',
      label: 'Connection Limits',
      type: 'node-policy',
      inspectedCount: counters.created,
      blockedMaliciousCount: 0,
      blockedMaliciousPercent: 0,
      blockedLegitimateCount: 0,
      passedCount: counters.succeeded,
      addedLatencyMs: 0,
      costDollars: 0,
      verdict,
      verdictReason,
    });
  }

  // Hardening
  const appHardening = (appNode?.config as AppServerConfig)?.hardening;
  const dbHardening = (dbNode?.config as DatabaseConfig)?.hardening;
  if (appHardening?.parameterizedQueries || dbHardening?.parameterizedQueries || appHardening?.autoQuarantine || appHardening?.egressFiltering) {
    let verdict: DefenseVerdict = 'inactive';
    let verdictReason = 'Hardening policies configured and enforcing baseline security controls.';
    if (isAttackRun) {
      if ((counters.exposureEvents ?? 0) === 0 && (appHardening?.parameterizedQueries || dbHardening?.parameterizedQueries)) {
        verdict = 'effective';
        verdictReason = 'Parameterized queries neutralized SQL/command injection payloads, protecting database integrity.';
      } else if (events.some((e) => e.type === 'SERVER_QUARANTINED')) {
        verdict = 'effective';
        verdictReason = 'Compromised server quarantined and safely reimaged.';
      } else if (appHardening?.egressFiltering && (counters.dataEgressMb ?? 0) < 5) {
        verdict = 'effective';
        verdictReason = 'Egress security rules restricted lateral exfiltration channels.';
      }
    }
    defenses.push({
      defenseKey: 'hardening',
      label: 'Host & DB Hardening',
      type: 'node-policy',
      inspectedCount: counters.created,
      blockedMaliciousCount: 0,
      blockedMaliciousPercent: 0,
      blockedLegitimateCount: 0,
      passedCount: counters.succeeded,
      addedLatencyMs: 0,
      costDollars: 0,
      verdict,
      verdictReason,
    });
  }

  // Phase Timing Summaries
  const phaseTimingSummaries: PhaseTimingSummary[] = [];
  const phaseEvents = events.filter((e) => e.type === 'ATTACK_PHASE_STARTED');
  for (const pEv of phaseEvents) {
    const phaseId = (pEv.details?.scenarioId as string) || 'attack-phase';
    const name = (pEv.details?.name as string) || (pEv.details?.scenarioId as string) || 'Attack Phase';
    const startMs = pEv.timestamp;
    const durMs = (pEv.details?.durationMs as number) || 20000;
    const endMs = startMs + durMs;

    const beforeSamples = samples.filter((s) => s.timeMs < startMs);
    const duringSamples = samples.filter((s) => s.timeMs >= startMs && s.timeMs <= endMs);
    const afterSamples = samples.filter((s) => s.timeMs > endMs);

    const calcLegit = (smps: MetricsSample[]) => {
      if (smps.length === 0) return 100;
      const sum = smps.reduce((acc, s) => acc + (s.system.legitimateSuccessRate ?? (s.system.incomingRps > 0 ? (s.system.successfulRps / s.system.incomingRps) * 100 : 100)), 0);
      return Math.round((sum / smps.length) * 10) / 10;
    };

    const calcP99 = (smps: MetricsSample[]) => {
      if (smps.length === 0) return 0;
      const max = Math.max(...smps.map((s) => s.system.p99Ms));
      return Math.round(max * 10) / 10;
    };

    phaseTimingSummaries.push({
      phaseId,
      name,
      legitSuccessRateBefore: calcLegit(beforeSamples),
      legitSuccessRateDuring: calcLegit(duringSamples),
      legitSuccessRateAfter: calcLegit(afterSamples),
      p99LatencyBeforeMs: calcP99(beforeSamples),
      p99LatencyDuringMs: calcP99(duringSamples),
      p99LatencyAfterMs: calcP99(afterSamples),
    });
  }

  // Unmitigated Risks
  const unmitigatedRisks: string[] = [];
  if (!cdnNode && isAttackRun) {
    unmitigatedRisks.push('Edge is unbuffered: No CDN to cache static assets or absorb volumetric DDoS floods.');
  }
  if (!fwNode && isAttackRun) {
    unmitigatedRisks.push('Network perimeter is open: No firewall to block repeat offending IP ranges or rate-burst origins.');
  }
  if (!wafNode && (counters.exposureEvents ?? 0) > 0) {
    unmitigatedRisks.push('Application layer exposed: No Web Application Firewall (WAF) to inspect HTTP request bodies for SQL injection or exploit signatures.');
  }
  if (!rlNode && isAttackRun) {
    unmitigatedRisks.push('No rate limits: Endpoints lack request quotas, allowing single or low-source botnets to saturate backend workers.');
  }
  if (appNode && !(appNode.config as AppServerConfig)?.circuitBreaker?.enabled) {
    unmitigatedRisks.push('Cascading failure risk: Lack of circuit breaker allows downstream outages to exhaust upstream connection pools.');
  }
  if (appNode && !(appNode.config as AppServerConfig)?.autoscaling?.enabled && firstSaturated?.type === 'app-server') {
    unmitigatedRisks.push('Fixed compute capacity: App server queue saturated without autoscaling policy to dynamically provision instances.');
  }
  if (dbNode && !(dbNode.config as DatabaseConfig)?.hardening?.parameterizedQueries && (counters.exposureEvents ?? 0) > 0) {
    unmitigatedRisks.push('Database vulnerability: Queries do not enforce parameterization, leaving data vulnerable to injection attacks.');
  }

  // Total summary metrics
  const totalMaliciousBlockedCount = counters.blockedMalicious ?? 0;
  const totalMaliciousBlockedPercent = totalMaliciousRequests > 0
    ? Math.round((totalMaliciousBlockedCount / totalMaliciousRequests) * 100)
    : 0;
  const totalFalsePositivesCount = counters.blockedLegitimate ?? 0;
  const totalAutoscalingCostDollars = counters.autoscalingCostDollars ?? 0;

  // Previous Run Delta
  let previousRunDelta: DefenseEffectivenessReportData['previousRunDelta'] | undefined;
  if (previousRunSummary) {
    const prevLegitRate = previousRunSummary.legitimateSuccessRate ?? previousRunSummary.successRatePercent;
    const currLegitRate = counters.legitimateSuccessRate ?? (counters.succeeded / Math.max(1, counters.created) * 100);
    const prevP99 = previousRunSummary.p99LatencyMs;
    const currP99 = latencySummary.p99Ms;
    const prevBlockedPct = previousRunSummary.defenseReport?.totalMaliciousBlockedPercent ?? 0;

    previousRunDelta = {
      legitSuccessRateDiff: Math.round((currLegitRate - prevLegitRate) * 10) / 10,
      p99LatencyDiffMs: Math.round((currP99 - prevP99) * 10) / 10,
      maliciousBlockedPercentDiff: Math.round((totalMaliciousBlockedPercent - prevBlockedPct) * 10) / 10,
    };
  }

  return {
    defenses,
    totalMaliciousBlockedCount,
    totalMaliciousBlockedPercent,
    totalFalsePositivesCount,
    totalAutoscalingCostDollars,
    phaseTimingSummaries,
    unmitigatedRisks,
    previousRunDelta,
  };
}
