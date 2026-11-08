/**
 * Guided Interactive Tutorials Catalog (Phase 10).
 * 5 complete, step-by-step interactive system design lessons.
 */

import { Tutorial } from './types';
import { createStarterGraph, addComponent } from '../../builder';

export const TUTORIALS: Tutorial[] = [
  {
    id: 'tutorial-first-request',
    title: '1. Your First Request',
    subtitle: 'Understand the end-to-end lifecycle of a client request',
    difficulty: 'Beginner',
    estimatedMinutes: 2,
    initialGraph: () => createStarterGraph(),
    initialTraffic: {
      peakRps: 50,
      durationMs: 8000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    steps: [
      {
        id: 'start-sim',
        instruction: 'Click the Play button (or press Space) to start generating simulated traffic.',
        explanation:
          'The client initiates requests at 50 RPS. Each packet carries simulated payload size, hop latency, and timeouts.',
        checkCompletion: ({ simStatus, counters }) => simStatus === 'running' || counters.created > 5,
      },
      {
        id: 'observe-success',
        instruction: 'Observe requests flowing to the App Server and Database, then returning as successful responses.',
        explanation:
          'Notice how total latency is the sum of hop transit times plus the backend service times.',
        checkCompletion: ({ counters }) => counters.succeeded >= 20,
      },
      {
        id: 'finish-first-run',
        instruction: 'Let the simulation complete and examine the final Run Summary.',
        explanation:
          'The Run Summary aggregates P50 and P99 latency percentiles, error rates, and identifies any resource bottlenecks.',
        checkCompletion: ({ simStatus, counters }) => simStatus === 'completed' || counters.succeeded >= 100,
      },
    ],
  },
  {
    id: 'tutorial-load-balancer-scale-out',
    title: '2. Add a Load Balancer & Scale Out',
    subtitle: 'Distribute incoming traffic across horizontally scaled app servers',
    difficulty: 'Beginner',
    estimatedMinutes: 3,
    initialGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      return g;
    },
    initialTraffic: {
      peakRps: 200,
      durationMs: 10000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    steps: [
      {
        id: 'add-second-server',
        instruction: 'Add a second App Server to your architecture from the Inventory panel.',
        explanation:
          'Horizontal scaling allows distributing computational and network load across multiple stateless server instances.',
        checkCompletion: ({ graph }) => graph.nodes.filter((n) => n.type === 'app-server').length >= 2,
      },
      {
        id: 'connect-lb',
        instruction: 'Ensure the Load Balancer is connected to both App Servers.',
        explanation:
          'The Load Balancer uses round-robin or least-connections routing algorithms to balance traffic evenly.',
        checkCompletion: ({ graph }) => {
          const lbEdges = graph.edges.filter((e) => e.source === 'load-balancer');
          return lbEdges.length >= 2;
        },
      },
      {
        id: 'run-scaled-sim',
        instruction: 'Press Play and observe the Load Balancer distributing requests evenly.',
        explanation:
          'Notice how neither server exceeds its concurrency limits, keeping queues clean and response times fast.',
        checkCompletion: ({ counters }) => counters.succeeded >= 30,
      },
    ],
  },
  {
    id: 'tutorial-find-the-bottleneck',
    title: '3. Find the Bottleneck',
    subtitle: 'Diagnose database queue saturation and relieve it with caching',
    difficulty: 'Intermediate',
    estimatedMinutes: 4,
    initialGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      g = addComponent(g, 'app-server');
      // Set slow database
      g = {
        ...g,
        nodes: g.nodes.map((n) =>
          n.type === 'database'
            ? { ...n, config: { ...n.config, meanServiceTimeMs: 80, maxConnections: 5 } }
            : n
        ),
      };
      return g;
    },
    initialTraffic: {
      peakRps: 150,
      durationMs: 10000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    steps: [
      {
        id: 'observe-db-saturation',
        instruction: 'Start the simulation and observe the Database queue building up and requests timing out.',
        explanation:
          'With a 5-connection pool and 80ms service time, the database caps at ~60 RPS. Incoming 150 RPS rapidly causes 504 timeouts.',
        checkCompletion: ({ counters }) => counters.rejected > 0 || (counters.timedOut ?? 0) > 0 || counters.created > 30,
      },
      {
        id: 'add-cache',
        instruction: 'Add an In-Memory Cache between the App Servers and Database to absorb read queries.',
        explanation:
          'In-memory caches (e.g. Redis / Memcached) serve reads in 1-3ms, dramatically reducing load on relational databases.',
        checkCompletion: ({ graph }) => graph.nodes.some((n) => n.type === 'cache'),
      },
      {
        id: 'verify-cache-relief',
        instruction: 'Reset and run the simulation again. Observe the cache absorbing 85% of reads with zero timeouts.',
        explanation:
          'By caching hot reads, database query volume drops by 85%, eliminating the queue bottleneck completely.',
        checkCompletion: ({ counters }) => counters.succeeded > 50 && (counters.timedOut ?? 0) === 0,
      },
    ],
  },
  {
    id: 'tutorial-survive-a-flood',
    title: '4. Survive a Volumetric Flood',
    subtitle: 'Deploy multi-layer edge defenses to protect origin servers from DDoS',
    difficulty: 'Intermediate',
    estimatedMinutes: 4,
    initialGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'load-balancer');
      g = addComponent(g, 'app-server');
      return g;
    },
    initialTraffic: {
      peakRps: 500,
      durationMs: 12000,
      pattern: 'constant',
      patternParams: { type: 'constant' },
      mode: 'discrete',
    },
    steps: [
      {
        id: 'deploy-cdn',
        instruction: 'Add a CDN Anycast Edge component in front of your ingress load balancer.',
        explanation:
          'A CDN edge network terminates connections close to users and absorbs volumetric L3/L4 floods across global PoPs.',
        checkCompletion: ({ graph }) => graph.nodes.some((n) => n.type === 'cdn'),
      },
      {
        id: 'deploy-waf',
        instruction: 'Add a Web Application Firewall (WAF) to inspect application-layer requests.',
        explanation:
          'The WAF checks request signatures, blocking scrapers, credential stuffers, and HTTP flood patterns.',
        checkCompletion: ({ graph }) => graph.nodes.some((n) => n.type === 'waf'),
      },
      {
        id: 'verify-defense',
        instruction: 'Run the simulation and observe malicious traffic being absorbed at the edge while legitimate users succeed.',
        explanation:
          'Edge defenses filter bad traffic early, shielding origin servers from exhaustion.',
        checkCompletion: ({ counters }) => counters.succeeded > 40,
      },
    ],
  },
  {
    id: 'tutorial-queues-and-replicas',
    title: '5. Async Queues & Read Replicas',
    subtitle: 'Decouple heavy writes and scale read throughput independently',
    difficulty: 'Advanced',
    estimatedMinutes: 5,
    initialGraph: () => {
      let g = createStarterGraph();
      g = addComponent(g, 'api-gateway');
      g = addComponent(g, 'app-server');
      return g;
    },
    initialTraffic: {
      peakRps: 600,
      durationMs: 15000,
      pattern: 'burst',
      patternParams: { type: 'burst', baselineRps: 100, periodMs: 5000, dutyCycle: 0.4 },
      mode: 'auto',
    },
    steps: [
      {
        id: 'add-message-queue',
        instruction: 'Add a Message Queue and Background Worker for asynchronous write jobs.',
        explanation:
          'Message queues decouple write ingestion from execution: clients receive instant 202 Accepted responses while workers process jobs at a steady pace.',
        checkCompletion: ({ graph }) =>
          graph.nodes.some((n) => n.type === 'message-queue') && graph.nodes.some((n) => n.type === 'worker'),
      },
      {
        id: 'add-read-replica',
        instruction: 'Add a Database Read Replica to serve read queries separately from writes.',
        explanation:
          'Read replicas replicate from the primary database asynchronously, allowing horizontal scaling of read throughput.',
        checkCompletion: ({ graph }) => graph.nodes.some((n) => n.type === 'database-replica'),
      },
      {
        id: 'run-async-pipeline',
        instruction: 'Run the simulation and observe the queue buffering write bursts without overwhelming backends.',
        explanation:
          'The system remains responsive under heavy burst traffic because write bursts are absorbed in the queue and reads query replicas.',
        checkCompletion: ({ counters }) => counters.succeeded > 100,
      },
    ],
  },
];
