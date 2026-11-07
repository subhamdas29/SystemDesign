/**
 * Pure Live Inspector View-Model.
 * Derives strongly-typed live telemetry and sparklines for inspected nodes.
 * Strictly decoupled from React rendering loop.
 */

import { GraphNode, AppServerConfig, LoadBalancerConfig, CacheConfig, DatabaseConfig } from '../../types';
import { SimulationSnapshot } from '../../engine/protocol';
import { NodeLiveMetrics, MetricSparklinePoint, BackendShareInfo } from './types';
import { COMPONENT_RULES } from '../../builder/rules/slotRules';

export function deriveLiveMetrics(
  node: GraphNode,
  snapshot: SimulationSnapshot,
  sparklineHistory1: MetricSparklinePoint[] = [],
  sparklineHistory2: MetricSparklinePoint[] = []
): NodeLiveMetrics {
  const nodeState = snapshot.runtimeNodes[node.id];
  const type = node.type;
  const label = node.label || COMPONENT_RULES[type]?.label || type;

  const status = nodeState?.status ?? 'healthy';
  const utilization = nodeState?.utilization ?? 0;
  const queueDepth = nodeState?.queueDepth ?? 0;
  const currentRps = nodeState?.currentRps ?? 0;
  const utilizationPercent = Math.round(utilization * 100);

  // Derive plain-language status diagnosis
  let statusReason = 'Operating normally within safe capacity limits';
  if (status === 'failed') {
    statusReason = 'Node is down / failing requests (503)';
  } else if (status === 'overloaded') {
    statusReason =
      queueDepth > 0
        ? `Queue saturated (${queueDepth} queued) causing request drops`
        : `Severe capacity overload (${utilizationPercent}% utilization)`;
  } else if (status === 'warning') {
    statusReason = `High sustained load (${utilizationPercent}% utilization)`;
  }

  const result: NodeLiveMetrics = {
    nodeId: node.id,
    type,
    label,
    status,
    statusReason,
    utilizationPercent,
    currentRps,
    sparkline1: {
      label: 'Throughput',
      points: sparklineHistory1,
      currentValue: currentRps,
      unit: 'req/s',
    },
    sparkline2: {
      label: 'Queue Depth',
      points: sparklineHistory2,
      currentValue: queueDepth,
      unit: 'reqs',
    },
  };

  // Component-specific sections
  if (type === 'app-server') {
    const cfg = node.config as AppServerConfig;
    const errorRate = nodeState?.errorRate ?? 0;
    const processedRps = Math.round(currentRps * (1 - errorRate));
    const rejectedRps = Math.round(currentRps * errorRate);
    const memoryMb = cfg.memoryMb ?? 4096;

    result.appServer = {
      incomingRps: currentRps,
      processedRps,
      rejectedRps,
      activeRequests: nodeState?.activeConnections ?? 0,
      queueDepth,
      queueLimit: cfg.queueSize ?? 500,
      estimatedCpuPercent: Math.min(100, Math.round(utilizationPercent * 0.9 + (queueDepth > 0 ? 10 : 0))),
      estimatedMemoryMb: Math.round(memoryMb * (0.25 + 0.7 * (utilizationPercent / 100))),
      failureCount: rejectedRps,
    };

    result.sparkline1 = {
      label: 'Throughput',
      points: sparklineHistory1,
      currentValue: processedRps,
      unit: 'RPS',
    };
    result.sparkline2 = {
      label: 'Queue Depth',
      points: sparklineHistory2,
      currentValue: queueDepth,
      unit: 'queued',
    };
  } else if (type === 'load-balancer' || type === 'api-gateway') {
    const cfg = node.config as LoadBalancerConfig;
    const backends: BackendShareInfo[] = [];

    // Find all app servers in snapshot
    const appNodes = Object.keys(snapshot.runtimeNodes).filter(
      (k) => k.startsWith('app') || k.includes('server')
    );
    const totalActive = appNodes.reduce(
      (sum, k) => sum + (snapshot.runtimeNodes[k]?.activeConnections ?? 0),
      0
    );

    for (const appId of appNodes) {
      const appState = snapshot.runtimeNodes[appId];
      const conns = appState?.activeConnections ?? 0;
      const sharePercent =
        totalActive > 0 ? Math.round((conns / totalActive) * 100) : Math.round(100 / Math.max(1, appNodes.length));

      backends.push({
        id: appId,
        label: appId,
        activeConnections: conns,
        sharePercent,
        health: appState?.status === 'failed' ? 'down' : appState?.status === 'warning' ? 'degraded' : 'healthy',
      });
    }

    result.loadBalancer = {
      algorithm: cfg.algorithm ?? 'round-robin',
      incomingRps: currentRps,
      backends,
    };
  } else if (type === 'cache') {
    const cfg = node.config as CacheConfig;
    const hits = snapshot.recentEvents.filter((e) => e.type === 'CACHE_HIT').length;
    const misses = snapshot.recentEvents.filter((e) => e.type === 'CACHE_MISS').length;
    const observedHitRatio = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : cfg.hitRatio ?? 85;

    result.cache = {
      hits,
      misses,
      observedHitRatio,
      configuredHitRatio: cfg.hitRatio ?? 85,
      opsPerSec: currentRps,
      estimatedMemoryPercent: Math.min(95, Math.max(10, Math.round(40 + utilizationPercent * 0.5))),
    };

    result.sparkline1 = {
      label: 'Cache Ops',
      points: sparklineHistory1,
      currentValue: currentRps,
      unit: 'ops/s',
    };
    result.sparkline2 = {
      label: 'Observed Hit %',
      points: sparklineHistory2,
      currentValue: observedHitRatio,
      unit: '%',
    };
  } else if (type === 'database') {
    const cfg = node.config as DatabaseConfig;
    const poolSize = cfg.connectionPoolSize ?? 100;
    const queryRate = currentRps;

    result.database = {
      queryRateQps: queryRate,
      readRateQps: Math.round(queryRate * 0.8),
      writeRateQps: Math.round(queryRate * 0.2),
      activeConnections: nodeState?.activeConnections ?? 0,
      poolSize,
      waitingQueries: queueDepth,
      avgLatencyMs: snapshot.latencySummary.averageMs,
      p95LatencyMs: snapshot.latencySummary.p95Ms,
    };

    result.sparkline1 = {
      label: 'Queries',
      points: sparklineHistory1,
      currentValue: queryRate,
      unit: 'QPS',
    };
    result.sparkline2 = {
      label: 'Waiting Queries',
      points: sparklineHistory2,
      currentValue: queueDepth,
      unit: 'waiting',
    };
  } else {
    result.generic = {
      metric1Label: 'Current Volume',
      metric1Value: `${currentRps.toLocaleString()} req/s`,
      metric2Label: 'Queue Depth',
      metric2Value: queueDepth,
    };
  }

  return result;
}
