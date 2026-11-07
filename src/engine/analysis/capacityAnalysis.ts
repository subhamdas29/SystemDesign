/**
 * Static capacity analysis for system design architectures.
 * Pure TypeScript with ZERO React, DOM, or side-effects.
 */

import {
  GraphConfig,
  ComponentType,
  CacheConfig,
  DatabaseConfig,
  AppServerConfig,
  ClientConfig,
} from '../../types';
import { getComponentModel } from '../components/registry';
import {
  StaticCapacityAnalysis,
  ComponentCapacityResult,
  TrafficMix,
} from './types';

export function analyzeCapacity(
  graph: GraphConfig,
  trafficMix?: TrafficMix
): StaticCapacityAnalysis {
  const componentBreakdown: Record<string, ComponentCapacityResult> = {};

  const clientNode = graph.nodes.find((n) => n.type === 'client');
  const cacheNode = graph.nodes.find((n) => n.type === 'cache');
  const appServerNodes = graph.nodes.filter((n) => n.type === 'app-server');
  const entryPointNode = graph.nodes.find(
    (n) => n.type === 'load-balancer' || n.type === 'api-gateway'
  );

  // 1. Determine read/write ratio
  const clientConfig = clientNode?.config as ClientConfig | undefined;
  const readRatio =
    trafficMix?.readRatio !== undefined
      ? trafficMix.readRatio
      : clientConfig?.readRatio !== undefined
      ? clientConfig.readRatio / 100
      : 0.8;
  const writeRatio = Math.max(0, 1 - readRatio);

  // 2. Cache hit ratio
  let cacheHitRatio = 0;
  if (cacheNode) {
    const cacheCfg = cacheNode.config as CacheConfig;
    const isDown = (cacheCfg as { health?: string }).health === 'down';
    cacheHitRatio = isDown ? 0 : Math.max(0, Math.min(100, cacheCfg.hitRatio ?? 80)) / 100;
  }

  const appCount = Math.max(1, appServerNodes.length);

  // 3. Compute capacity and load share for each component
  for (const node of graph.nodes) {
    const type = node.type;
    let loadShare: number;
    let effectiveCapacity: number;
    let limitingFactor: string;

    if (type === 'client') {
      loadShare = 1.0;
      effectiveCapacity = 10000000;
      limitingFactor = 'Client ingress generator';
    } else if (type === 'dns') {
      loadShare = 1.0;
      effectiveCapacity = 100000;
      limitingFactor = 'DNS cache and lookup capacity';
    } else if (
      type === 'router' ||
      type === 'firewall' ||
      type === 'waf' ||
      type === 'rate-limiter' ||
      type === 'load-balancer' ||
      type === 'api-gateway'
    ) {
      loadShare = 1.0;
      const model = getComponentModel(type);
      effectiveCapacity = model.getEffectiveCapacityRps(node.config);
      limitingFactor = `${type} packet/request processing capacity`;
    } else if (type === 'app-server') {
      loadShare = entryPointNode ? 1.0 / appCount : 1.0;
      const model = getComponentModel(type);
      effectiveCapacity = model.getEffectiveCapacityRps(node.config);
      const appCfg = node.config as AppServerConfig;
      limitingFactor = `Concurrency limit (${appCfg.maxConcurrentRequests} conns) and CPU cores (${appCfg.cpuCores})`;
    } else if (type === 'cache') {
      loadShare = readRatio;
      const model = getComponentModel(type);
      effectiveCapacity = model.getEffectiveCapacityRps(node.config);
      limitingFactor = 'Memory lookup operations limit';
    } else if (type === 'database') {
      if (cacheNode) {
        // Writes always hit DB; reads hit DB only on cache miss
        loadShare = writeRatio + readRatio * (1 - cacheHitRatio);
      } else {
        loadShare = 1.0;
      }

      const dbCfg = node.config as DatabaseConfig;
      const readLatency = dbCfg.readQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 20;
      const writeLatency = dbCfg.writeQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 30;
      const avgLatencyMs = Math.max(1, readRatio * readLatency + writeRatio * writeLatency);

      // Concurrency ceiling = poolSize / (latency in sec)
      const poolCapacity = Math.floor(dbCfg.connectionPoolSize / (avgLatencyMs / 1000));
      effectiveCapacity = Math.min(dbCfg.maxQueryThroughputQps, poolCapacity);

      limitingFactor =
        poolCapacity < dbCfg.maxQueryThroughputQps
          ? `Connection pool (${dbCfg.connectionPoolSize} conns @ ${Math.round(avgLatencyMs)}ms)`
          : `Max query throughput (${dbCfg.maxQueryThroughputQps} QPS)`;
    } else {
      const model = getComponentModel(type);
      effectiveCapacity = model.getEffectiveCapacityRps(node.config);
      loadShare = 1.0;
      limitingFactor = `${type} processing limit`;
    }

    const maxSustainable =
      loadShare > 0
        ? Math.round((effectiveCapacity / loadShare) * 10) / 10
        : Infinity;

    componentBreakdown[node.id] = {
      nodeId: node.id,
      type,
      effectiveCapacityRps: effectiveCapacity,
      loadShare: Math.round(loadShare * 1000) / 1000,
      maxSustainableClientRps: maxSustainable,
      limitingFactor,
    };
  }

  // 4. Find the bottleneck node (excluding client)
  let bottleneckNodeId = '';
  let bottleneckType: ComponentType = 'database';
  let minRps = Infinity;

  for (const [id, comp] of Object.entries(componentBreakdown)) {
    if (comp.type === 'client') continue;
    if (comp.maxSustainableClientRps < minRps) {
      minRps = comp.maxSustainableClientRps;
      bottleneckNodeId = id;
      bottleneckType = comp.type;
    }
  }

  if (!bottleneckNodeId) {
    bottleneckNodeId = clientNode?.id ?? 'client-1';
    bottleneckType = 'client';
    minRps = 10000;
  }

  const sustainableRps = Math.floor(minRps);

  // 5. Build beginner-friendly explanation and suggested fixes
  let explanation: string;
  const suggestedFixes: ComponentType[] = [];

  switch (bottleneckType) {
    case 'database': {
      const dbSharePercent = Math.round(
        (componentBreakdown[bottleneckNodeId]?.loadShare ?? 1.0) * 100
      );
      if (!cacheNode) {
        explanation = `The Database is your system's bottleneck, sustaining at most ${sustainableRps.toLocaleString()} RPS because it handles 100% of all read and write queries directly.`;
        suggestedFixes.push('cache');
      } else {
        explanation = `The Database is your system's bottleneck, sustaining at most ${sustainableRps.toLocaleString()} RPS because it still serves ${dbSharePercent}% of traffic (writes + cache misses).`;
        suggestedFixes.push('cache', 'database');
      }
      break;
    }

    case 'app-server': {
      explanation = `The App Server tier is the bottleneck, sustaining at most ${sustainableRps.toLocaleString()} RPS across ${appCount} instance${appCount > 1 ? 's' : ''}.`;
      if (!entryPointNode) {
        suggestedFixes.push('load-balancer');
      } else if (appCount < 10) {
        suggestedFixes.push('app-server');
      }
      break;
    }

    case 'load-balancer':
    case 'api-gateway': {
      explanation = `The ${bottleneckType === 'load-balancer' ? 'Load Balancer' : 'API Gateway'} is saturated at ${componentBreakdown[bottleneckNodeId]?.effectiveCapacityRps.toLocaleString()} RPS ingress.`;
      suggestedFixes.push('load-balancer');
      break;
    }

    case 'router':
    case 'firewall':
    case 'waf':
    case 'rate-limiter': {
      explanation = `The ${bottleneckType} capacity of ${componentBreakdown[bottleneckNodeId]?.effectiveCapacityRps.toLocaleString()} RPS limits total traffic.`;
      suggestedFixes.push(bottleneckType);
      break;
    }

    default:
      explanation = `System throughput is limited to ${sustainableRps.toLocaleString()} RPS by ${bottleneckType}.`;
  }

  return {
    sustainableRps,
    bottleneckNodeId,
    bottleneckType,
    explanation,
    suggestedFixes,
    componentBreakdown,
  };
}
