/**
 * Runnable Scenario Presets for Phase 7.
 * Provides curated system design disaster scenarios, cascade demonstrations,
 * and resilience comparison studies.
 */

import { GraphConfig } from '../../types';
import { TrafficConfig } from '../../engine/protocol';
import { ScenarioCommand } from '../failures/types';
import { RETRY_PRESETS } from '../../types/components';
import { createStarterGraph, addComponent, swapComponent } from '../../builder';

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

export const PHASE_9_PRESETS: ScenarioPreset[] = [
  {
    id: 'basic-web-app',
    title: 'Basic Web App',
    subtitle: 'Standard 3-tier baseline architecture without async queue or replicas',
    description:
      'Baseline web cluster: Client -> DNS -> Load Balancer -> App Servers -> Cache -> Database. Evaluates steady-state 500 RPS traffic with 80% reads and 20% writes.',
    educationalTakeaway:
      'The foundational multi-tier design isolates compute from storage; in-memory caching absorbs the majority of read queries, leaving the single primary database to handle writes and cache misses.',
    traffic: {
      peakRps: 500,
      durationMs: 45000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [],
    configureGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      g = addComponent(g, 'app-server');
      return g;
    },
  },

  {
    id: 'read-heavy-replicas',
    title: 'Read-Heavy App with Cache & Replicas',
    subtitle: '1,200 RPS read-heavy traffic offloaded across 2 read replicas',
    description:
      '90% read traffic. Cache absorbs high-frequency hits; cache-miss reads are distributed across 2 read replicas via round-robin, keeping the primary database free to handle writes.',
    educationalTakeaway:
      'Read replicas horizontally scale query capacity for read-heavy workloads. However, replication lag can lead to stale reads if replicas cannot apply writes quickly enough.',
    traffic: {
      peakRps: 1200,
      durationMs: 45000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [],
    configureGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      g = addComponent(g, 'app-server');
      g = addComponent(g, 'database-replica');
      g = addComponent(g, 'database-replica');
      return {
        ...g,
        nodes: g.nodes.map((n) => {
          if (n.type === 'client') {
            return { ...n, config: { ...n.config, readRatio: 90 } };
          }
          if (n.type === 'database') {
            return {
              ...n,
              config: {
                ...n.config,
                readFromReplicasShare: 90,
              },
            };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'write-spike-queue',
    title: 'Write Spike Absorbed by a Queue',
    subtitle: '1,500 RPS write burst absorbed asynchronously into Message Queue',
    description:
      'A sharp spike in write traffic hits at t=10s. App Servers enqueue jobs into the Message Queue and immediately return HTTP 202 Accepted (<5ms user latency). Background workers drain the queue and persist to the database at a sustainable pace.',
    educationalTakeaway:
      'Asynchronous queues decouple user-perceived write latency from database ingestion throughput, acting as shock absorbers that protect databases from transient bursts.',
    traffic: {
      peakRps: 1500,
      durationMs: 45000,
      pattern: 'spike',
      patternParams: {
        type: 'spike',
        baselineRps: 100,
        spikeStartMs: 10000,
        spikeDurationMs: 12000,
      },
      mode: 'discrete',
    },
    scenarioScript: [],
    configureGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      g = addComponent(g, 'message-queue');
      g = addComponent(g, 'worker');
      return {
        ...g,
        nodes: g.nodes.map((n) => {
          if (n.type === 'client') {
            return { ...n, config: { ...n.config, readRatio: 20 } };
          }
          if (n.type === 'app-server') {
            return {
              ...n,
              config: {
                ...n.config,
                asyncWriteShare: 90,
                enqueueLatencyMs: 4,
              },
            };
          }
          if (n.type === 'worker') {
            return {
              ...n,
              config: {
                ...n.config,
                instances: 2,
                concurrency: 8,
                jobProcessingLatencyMs: 25,
              },
            };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'queue-falls-behind',
    title: 'Queue That Falls Behind',
    subtitle: 'Sustained write arrival exceeds worker capacity, causing queue overflow',
    description:
      'Continuous 250 RPS write traffic with an under-provisioned worker pool (max throughput ~30 RPS). Queue depth and consumer lag monotonically increase until queueLimit is breached, demonstrating queue backpressure and rejection (503).',
    educationalTakeaway:
      'Queues only buffer temporary spikes. If arrival rate continuously exceeds drain rate, queue depth grows unbounded and backpressure or data loss is inevitable.',
    traffic: {
      peakRps: 250,
      durationMs: 45000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [],
    configureGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      g = addComponent(g, 'message-queue');
      g = addComponent(g, 'worker');
      return {
        ...g,
        nodes: g.nodes.map((n) => {
          if (n.type === 'client') {
            return { ...n, config: { ...n.config, readRatio: 10 } };
          }
          if (n.type === 'app-server') {
            return {
              ...n,
              config: {
                ...n.config,
                asyncWriteShare: 95,
              },
            };
          }
          if (n.type === 'message-queue') {
            return {
              ...n,
              config: {
                ...n.config,
                queueLimit: 300,
                overflowStrategy: 'reject',
              },
            };
          }
          if (n.type === 'worker') {
            return {
              ...n,
              config: {
                ...n.config,
                instances: 1,
                concurrency: 2,
                jobProcessingLatencyMs: 70,
              },
            };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'hot-shard',
    title: 'Hot Shard',
    subtitle: '4 shards with Zipf key distribution saturates Shard 0 while other shards idle',
    description:
      'Database partitioned into 4 shards with Zipf-skewed key distribution. Shard 0 receives >60% of all queries, bottlenecking the entire cluster at RPS_max = Cap_shard / P_hot while shards 1-3 run below 15% utilization.',
    educationalTakeaway:
      'Non-uniform access patterns create hot shards. Adding more shards does not resolve a hot partition problem because total cluster throughput is bounded by the single most accessed shard.',
    traffic: {
      peakRps: 400,
      durationMs: 45000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [],
    configureGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      g = addComponent(g, 'app-server');
      return {
        ...g,
        nodes: g.nodes.map((n) => {
          if (n.type === 'database') {
            return {
              ...n,
              config: {
                ...n.config,
                shardCount: 4,
                shardKeyDistribution: 'zipf-skewed',
                zipfSkew: 1.2,
                maxQueryThroughputQps: 600,
              },
            };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'api-gateway-auth-ratelimit',
    title: 'API Gateway with Auth and Per-Route Limits',
    subtitle: 'API Gateway verifies tokens and throttles /api/write with HTTP 429',
    description:
      'API Gateway replaces Load Balancer at Slot 2. It performs token verification with a local auth cache and enforces per-route rate limits (e.g. 60 RPS on /api/write), shielding downstream App Servers from overloads.',
    educationalTakeaway:
      'API Gateways centralize peripheral infrastructure logic: authentication token caching prevents repeated verification overhead, and fine-grained route rate limiting prevents endpoint abuse.',
    traffic: {
      peakRps: 450,
      durationMs: 45000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [],
    configureGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      const lbNode = g.nodes.find((n) => n.type === 'load-balancer');
      if (lbNode) {
        g = swapComponent(g, lbNode.id, 'api-gateway');
      }
      g = addComponent(g, 'app-server');
      return {
        ...g,
        nodes: g.nodes.map((n) => {
          if (n.type === 'api-gateway') {
            return {
              ...n,
              config: {
                ...n.config,
                authEnabled: true,
                authLatencyMs: 6,
                authCacheHitRatio: 85,
                routeRateLimits: {
                  '/api/write': 60,
                  '/api/auth': 40,
                },
              },
            };
          }
          return n;
        }),
      };
    },
  },

  {
    id: 'primary-failover',
    title: 'Primary Failure and Failover',
    subtitle: 'Primary DB crashes at t=15s; healthy replica promoted after detection window',
    description:
      'Cluster with primary database and 2 read replicas. At t=15s, primary database crashes. During the detection (3s) and promotion (2s) window, write operations fail. Once promoted, writes automatically resume on the promoted replica.',
    educationalTakeaway:
      'High-availability database setups require health detection and leader election before failover completes, resulting in an unavoidable brief write outage window.',
    traffic: {
      peakRps: 250,
      durationMs: 45000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    scenarioScript: [
      {
        t: 15000,
        action: 'inject',
        failureType: 'db-crash',
        targetId: 'database-1',
        durationMs: 25000,
        params: {},
      },
    ],
    configureGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      g = addComponent(g, 'database-replica');
      g = addComponent(g, 'database-replica');
      return {
        ...g,
        nodes: g.nodes.map((n) => {
          if (n.type === 'database') {
            return {
              ...n,
              config: {
                ...n.config,
                autoFailoverEnabled: true,
                failoverDetectionMs: 3000,
                failoverPromotionMs: 2000,
              },
            };
          }
          return n;
        }),
      };
    },
  },
];

export const ALL_PRESETS: ScenarioPreset[] = [...SCENARIO_PRESETS, ...PHASE_9_PRESETS];
