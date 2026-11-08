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
  DatabaseReplicaConfig,
} from '../../types';
import { getComponentModel } from '../components/registry';
import { calculateShardedMaxThroughput } from '../components/databaseModel';
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
  const mqNode = graph.nodes.find((n) => n.type === 'message-queue');
  const workerNodes = graph.nodes.filter((n) => n.type === 'worker');
  const replicaNodes = graph.nodes.filter((n) => n.type === 'database-replica');
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
      const dbCfg = node.config as DatabaseConfig;
      let readMissShare = cacheNode ? readRatio * (1 - cacheHitRatio) : readRatio;
      if (replicaNodes.length > 0) {
        const replicaShare = (dbCfg.readFromReplicasShare ?? 90) / 100;
        readMissShare *= (1 - replicaShare);
      }
      loadShare = writeRatio + readMissShare;

      const readLatency = dbCfg.readQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 20;
      const writeLatency = dbCfg.writeQueryLatencyMs ?? dbCfg.queryLatencyMs ?? 30;
      const avgLatencyMs = Math.max(1, readRatio * readLatency + writeRatio * writeLatency);

      // Concurrency ceiling = poolSize / (latency in sec)
      const poolCapacity = Math.floor(dbCfg.connectionPoolSize / (avgLatencyMs / 1000));
      effectiveCapacity = Math.min(dbCfg.maxQueryThroughputQps, poolCapacity);

      if (dbCfg.shardCount && dbCfg.shardCount > 1) {
        const sharded = calculateShardedMaxThroughput(
          dbCfg.maxQueryThroughputQps,
          dbCfg.shardCount,
          dbCfg.shardKeyDistribution ?? 'uniform',
          dbCfg.zipfSkew ?? 1.2
        );
        effectiveCapacity = Math.min(effectiveCapacity, sharded.maxSustainableRps);
        limitingFactor =
          dbCfg.shardKeyDistribution === 'zipf-skewed'
            ? `Hot shard saturation: Shard 1 bottleneck (${sharded.maxSustainableRps} QPS)`
            : `Sharded throughput (${dbCfg.maxQueryThroughputQps} QPS across ${dbCfg.shardCount} shards)`;
      } else {
        limitingFactor =
          poolCapacity < dbCfg.maxQueryThroughputQps
            ? `Connection pool (${dbCfg.connectionPoolSize} conns @ ${Math.round(avgLatencyMs)}ms)`
            : `Max query throughput (${dbCfg.maxQueryThroughputQps} QPS)`;
      }
    } else if (type === 'message-queue') {
      loadShare = writeRatio * 0.8;
      const model = getComponentModel(type);
      effectiveCapacity = model.getEffectiveCapacityRps(node.config);
      limitingFactor = 'Message Queue broker throughput limit';
    } else if (type === 'worker') {
      loadShare = (writeRatio * 0.8) / Math.max(1, workerNodes.length);
      const model = getComponentModel(type);
      effectiveCapacity = model.getEffectiveCapacityRps(node.config);
      limitingFactor = 'Async Worker processing concurrency limit';
    } else if (type === 'database-replica') {
      loadShare = (readRatio * (1 - cacheHitRatio) * 0.9) / Math.max(1, replicaNodes.length);
      effectiveCapacity = (node.config as DatabaseReplicaConfig).capacityQps;
      limitingFactor = 'Read Replica query throughput limit';
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
      const dbCfg = graph.nodes.find((n) => n.id === bottleneckNodeId)?.config as DatabaseConfig | undefined;
      const dbSharePercent = Math.round(
        (componentBreakdown[bottleneckNodeId]?.loadShare ?? 1.0) * 100
      );
      if (dbCfg?.shardCount && dbCfg.shardCount > 1 && dbCfg.shardKeyDistribution === 'zipf-skewed') {
        explanation = `One shard is hot: Shard 1 is saturated by skewed key distribution while other shards have free headroom. Improve key distribution or add shards.`;
        suggestedFixes.push('database');
      } else if (!cacheNode && replicaNodes.length === 0) {
        explanation = `The Database is your system's bottleneck, sustaining at most ${sustainableRps.toLocaleString()} RPS because it handles 100% of all read and write queries directly. Reads are overloading the Database: add a Cache or read replicas.`;
        suggestedFixes.push('cache', 'database-replica');
      } else if (writeRatio > 0.4 && !mqNode) {
        explanation = `The Database is your system's bottleneck under heavy write load. Writes spike: add a Message Queue and Workers.`;
        suggestedFixes.push('message-queue', 'worker');
      } else {
        explanation = `The Database is your system's bottleneck, sustaining at most ${sustainableRps.toLocaleString()} RPS because it still serves ${dbSharePercent}% of traffic (writes + cache misses).`;
        suggestedFixes.push('cache', 'database-replica');
      }
      break;
    }

    case 'message-queue': {
      explanation = `The Message Queue throughput limit of ${componentBreakdown[bottleneckNodeId]?.effectiveCapacityRps.toLocaleString()} RPS is the bottleneck. Increase queue capacity or add workers.`;
      suggestedFixes.push('message-queue', 'worker');
      break;
    }

    case 'worker': {
      explanation = `Async Workers cannot keep up with the queue arrival rate. Add more Worker instances to increase drain throughput.`;
      suggestedFixes.push('worker');
      break;
    }

    case 'database-replica': {
      explanation = `Read Replicas are saturated at ${componentBreakdown[bottleneckNodeId]?.effectiveCapacityRps.toLocaleString()} QPS. Add more replica instances to spread query load.`;
      suggestedFixes.push('database-replica');
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
