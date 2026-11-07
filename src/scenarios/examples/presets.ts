/**
 * Runnable Scenario Presets for Phase 7.
 * Provides curated system design disaster scenarios, cascade demonstrations,
 * and resilience comparison studies.
 */

import { GraphConfig } from '../../types';
import { TrafficConfig } from '../../engine/protocol';
import { ScenarioCommand } from '../failures/types';
import { RETRY_PRESETS } from '../../types/components';

export interface ScenarioPreset {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  educationalTakeaway: string;
  traffic: TrafficConfig;
  scenarioScript: ScenarioCommand[];
  configureGraph: (baseGraph: GraphConfig) => GraphConfig;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'healthy-baseline',
    title: 'Healthy Baseline',
    subtitle: '500 RPS balanced across 3 servers with caching',
    description:
      'Standard well-architected cluster: Load Balancer distributes to 3 App Servers with In-Memory Cache and Database. No failures injected.',
    educationalTakeaway:
      'Under healthy conditions, cache absorbs ~85% of reads, keeping database load and latency low and stable.',
    traffic: {
      peakRps: 500,
      durationMs: 60000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [],
    configureGraph: (graph) => {
      // Ensure LB, 3 app servers, cache, database with default configs
      return {
        ...graph,
        nodes: graph.nodes.map((n) => {
          if (n.type === 'client') {
            return { ...n, config: { ...n.config, requestTimeoutMs: 5000, retryPolicy: RETRY_PRESETS.none } };
          }
          if (n.type === 'app-server') {
            return {
              ...n,
              config: {
                ...n.config,
                avgProcessingTimeMs: 15,
                maxThroughputRps: 1000,
                health: 'healthy',
                databaseTimeoutMs: 3000,
                cacheTimeoutMs: 500,
                retryPolicy: RETRY_PRESETS.none,
              },
            };
          }
          if (n.type === 'database') {
            return { ...n, config: { ...n.config, queryLatencyMs: 30, readQueryLatencyMs: 25, writeQueryLatencyMs: 50 } };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'slow-database-cascade',
    title: 'Slow Database Cascade (Naive Retries)',
    subtitle: 'DB latency x5 at t=30s triggers timeout cascade & retry storm',
    description:
      'At 30s, the primary database slows down 5x. Clients use naive immediate retries (3 attempts, 0 backoff). Slower queries monopolize App Server worker threads, queues overflow, requests time out, and retries amplify the incoming load into a total cascade.',
    educationalTakeaway:
      'Slow dependencies are far deadlier than crashed ones. Naive retries act as a self-inflicted DDoS on an already struggling system.',
    traffic: {
      peakRps: 400,
      durationMs: 60000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [
      {
        t: 20000,
        action: 'inject',
        failureType: 'db-slow',
        targetId: 'database-1',
        durationMs: 35000,
        params: { multiplier: 5 },
      },
    ],
    configureGraph: (graph) => {
      return {
        ...graph,
        nodes: graph.nodes.map((n) => {
          if (n.type === 'client') {
            return {
              ...n,
              config: {
                ...n.config,
                requestTimeoutMs: 2000, // Client times out at 2000ms
                retryPolicy: RETRY_PRESETS.naive, // 3 immediate retries
              },
            };
          }
          if (n.type === 'app-server') {
            return {
              ...n,
              config: {
                ...n.config,
                databaseTimeoutMs: 2500,
                maxConcurrentRequests: 80,
                queueSize: 150,
                retryPolicy: RETRY_PRESETS.none,
              },
            };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'slow-database-backoff',
    title: 'Slow Database with Exponential Backoff',
    subtitle: 'Identical 5x DB slowdown but with jittered backoff',
    description:
      'Identical 5x DB latency spike at 30s, but clients employ exponential backoff with full jitter (100ms base, 2000ms max). Rather than hammering the servers immediately, retries are staggered, suppressing the retry storm.',
    educationalTakeaway:
      'Exponential backoff with jitter breaks resonance and prevents retry synchronization, lowering the load amplification factor and allowing the database to recover.',
    traffic: {
      peakRps: 400,
      durationMs: 60000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [
      {
        t: 20000,
        action: 'inject',
        failureType: 'db-slow',
        targetId: 'database-1',
        durationMs: 35000,
        params: { multiplier: 5 },
      },
    ],
    configureGraph: (graph) => {
      return {
        ...graph,
        nodes: graph.nodes.map((n) => {
          if (n.type === 'client') {
            return {
              ...n,
              config: {
                ...n.config,
                requestTimeoutMs: 2000,
                retryPolicy: RETRY_PRESETS.exponential_jitter, // Exponential backoff + jitter
              },
            };
          }
          if (n.type === 'app-server') {
            return {
              ...n,
              config: {
                ...n.config,
                databaseTimeoutMs: 2500,
                maxConcurrentRequests: 80,
                queueSize: 150,
              },
            };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'cache-flush-stampede',
    title: 'Cache Flush Stampede (Thundering Herd)',
    subtitle: 'Cache flushed at t=25s, causing cold cache warm-up stampede',
    description:
      'At 25s, the cache is flushed. The cache hit ratio drops instantly to 0% and slowly warms up over a 10s period. 100% of read traffic stampedes directly onto the Database, driving connection pool exhaustion and query latency spikes.',
    educationalTakeaway:
      'A cold cache exposes the true capacity deficit of the primary database. Systems relying on high cache hit ratios need cache warming or read-through stampede protection.',
    traffic: {
      peakRps: 600,
      durationMs: 60000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [
      {
        t: 25000,
        action: 'inject',
        failureType: 'cache-flush',
        targetId: 'cache-1',
        durationMs: 15000,
        params: { warmupPeriodMs: 10000 },
      },
    ],
    configureGraph: (graph) => {
      return {
        ...graph,
        nodes: graph.nodes.map((n) => {
          if (n.type === 'cache') {
            return { ...n, config: { ...n.config, hitRatio: 85, warmupPeriodMs: 10000 } };
          }
          if (n.type === 'database') {
            return { ...n, config: { ...n.config, connectionPoolSize: 50, queueCapacity: 100 } };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'server-crash-detection',
    title: 'Server Crash with Health Check Delay',
    subtitle: 'Server 1 dies at t=20s; LB detection delay causes error burst',
    description:
      'One of the application servers crashes at 20s. The Load Balancer checks health every 5s and requires 3 consecutive failures before removing it. During the 15-second detection window, traffic routed to the dead server fails immediately.',
    educationalTakeaway:
      'Health check intervals create a detection lag during which users experience failures. Tuning health check thresholds balances flap resistance against failover speed.',
    traffic: {
      peakRps: 450,
      durationMs: 60000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [
      {
        t: 20000,
        action: 'inject',
        failureType: 'app-server-crash',
        targetId: 'app-server-1',
        durationMs: 30000,
        params: {},
      },
    ],
    configureGraph: (graph) => {
      return {
        ...graph,
        nodes: graph.nodes.map((n) => {
          if (n.type === 'load-balancer') {
            return {
              ...n,
              config: {
                ...n.config,
                healthCheckIntervalMs: 5000,
                unhealthyThreshold: 3,
                healthyThreshold: 2,
              },
            };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'lossy-network',
    title: 'Lossy Network with Edge Packet Drops',
    subtitle: '5% packet loss on Client-to-Edge link with retries',
    description:
      'Simulates a degraded public internet or mobile connection with 5% packet loss on the ingress link. Dropped packets are detected only when the client timeout timer expires, illustrating why network loss manifests as tail latency.',
    educationalTakeaway:
      'Network packet drops are silent; they cannot be distinguished from infinite latency without timeouts. Retries recover lost packets at the cost of latency.',
    traffic: {
      peakRps: 300,
      durationMs: 60000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [
      {
        t: 15000,
        action: 'inject',
        failureType: 'edge-packet-loss',
        targetId: 'client-edge',
        durationMs: 35000,
        params: { packetLossPct: 5 },
      },
    ],
    configureGraph: (graph) => {
      // Find client edge
      const clientNode = graph.nodes.find((n) => n.type === 'client');
      return {
        ...graph,
        nodes: graph.nodes.map((n) => {
          if (n.type === 'client') {
            return {
              ...n,
              config: {
                ...n.config,
                requestTimeoutMs: 1500,
                retryPolicy: {
                  maxAttempts: 3,
                  retryOn: ['timeout'],
                  backoff: 'exponential_jitter',
                  baseDelayMs: 100,
                  maxDelayMs: 1000,
                },
              },
            };
          }
          return n;
        }),
        edges: graph.edges.map((e) => {
          if (e.source === clientNode?.id) {
            return {
              ...e,
              latency: {
                baseLatencyMs: 40,
                jitterMs: 10,
                packetLossPct: 5,
              },
            };
          }
          return e;
        }),
      };
    },
  },
];
