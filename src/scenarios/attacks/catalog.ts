/**
 * Data-driven Attack Scenarios Catalog (Phase 8A).
 * Conceptual, defender-focused threat profiles with zero executable payload code or network commands.
 */

import type { AttackScenarioDefinition, AttackScenarioId } from '../../types/attacks';

export const ATTACK_SCENARIOS: Record<AttackScenarioId, AttackScenarioDefinition> = {
  'volumetric-flood': {
    id: 'volumetric-flood',
    name: 'Volumetric Flood (Network Layer)',
    targetLayer: 'network',
    plainLanguage: {
      whatItIs:
        'A high-volume flood of network requests aimed at overwhelming ingress bandwidth and connection tracking tables.',
      whatItTargets:
        'Network perimeter bandwidth, router queue capacity, and frontend load balancer ingress buffers.',
      whatStopsIt:
        'Anycast edge distribution, upstream ISP scrubbing, and network-layer rate limiting.',
      whatDoesNotStopIt:
        'Application server optimization, database indexing, or scaling backend workers.',
    },
    recommendedDefense: 'Edge scrubbing & Network-layer Rate Limiting',
    defaultCostMultiplier: 0.1,
    defaultConnectionHoldMs: 0,
    defaultCacheable: false,
    defaultSourceCount: 10000,
    defaultExposureRisk: 0,
    intensityRange: {
      min: 100,
      max: 50000,
      step: 100,
      defaultRps: 4000,
      unit: 'req/s',
    },
  },

  'http-flood': {
    id: 'http-flood',
    name: 'HTTP Flood (Application Layer)',
    targetLayer: 'application',
    plainLanguage: {
      whatItIs:
        'A surge of syntactically valid HTTP requests targeted at computationally demanding application endpoints.',
      whatItTargets:
        'Application server CPU, worker thread pools, heap memory, and downstream query queues.',
      whatStopsIt:
        'Web Application Firewalls (WAF), behavioral throttling, cryptographic proof-of-work challenges, and adaptive rate limiters.',
      whatDoesNotStopIt:
        'Perimeter network firewalls or simply provisioning additional network bandwidth.',
    },
    recommendedDefense: 'WAF & Behavioral Application Rate Limiting',
    defaultCostMultiplier: 5.0,
    defaultConnectionHoldMs: 40,
    defaultCacheable: false,
    defaultSourceCount: 500,
    defaultExposureRisk: 0,
    intensityRange: {
      min: 50,
      max: 10000,
      step: 50,
      defaultRps: 1000,
      unit: 'req/s',
    },
  },

  'slow-connection': {
    id: 'slow-connection',
    name: 'Slow-Connection Attack (Slowloris)',
    targetLayer: 'http',
    plainLanguage: {
      whatItIs:
        'An attack that initiates concurrent HTTP connections and intentionally transmits data very slowly to keep sockets open.',
      whatItTargets:
        'Concurrent connection pools, operating system socket descriptors, and thread-per-connection limits.',
      whatStopsIt:
        'Strict client connection timeouts, minimum transfer rate thresholds, and asynchronous reverse proxies with epoll/kqueue.',
      whatDoesNotStopIt:
        'Volumetric bandwidth filters or standard request-rate throttling without connection limits.',
    },
    recommendedDefense: 'Aggressive Client Timeouts & Reverse Proxy Concurrency Caps',
    defaultCostMultiplier: 0.2,
    defaultConnectionHoldMs: 8000,
    defaultCacheable: false,
    defaultSourceCount: 200,
    defaultExposureRisk: 0,
    intensityRange: {
      min: 10,
      max: 1000,
      step: 10,
      defaultRps: 120,
      unit: 'active conns',
    },
  },

  'cache-busting-scraper': {
    id: 'cache-busting-scraper',
    name: 'Cache-Busting Scraper',
    targetLayer: 'database',
    plainLanguage: {
      whatItIs:
        'Automated high-frequency scraping using randomized parameters to guarantee cache misses on every request.',
      whatItTargets:
        'Database read connection pools and database query execution capacity while frontend caches stay underutilized.',
      whatStopsIt:
        'Query parameter normalization, automated bot reputation scoring, and query result caching at the persistence tier.',
      whatDoesNotStopIt:
        'Expanding cache memory capacity without URL and parameter normalization.',
    },
    recommendedDefense: 'Bot Management & Database Connection Pool Isolation',
    defaultCostMultiplier: 2.5,
    defaultConnectionHoldMs: 15,
    defaultCacheable: false,
    defaultSourceCount: 60,
    defaultExposureRisk: 0,
    intensityRange: {
      min: 20,
      max: 5000,
      step: 20,
      defaultRps: 400,
      unit: 'req/s',
    },
  },

  'credential-brute-force': {
    id: 'credential-brute-force',
    name: 'Credential Brute Force',
    targetLayer: 'application',
    plainLanguage: {
      whatItIs:
        'Rapid, automated authentication requests targeted at login services originating from a small pool of attacker IP addresses.',
      whatItTargets:
        'Authentication microservices, cryptographic key derivation / password hashing CPU, and account state storage.',
      whatStopsIt:
        'Per-IP rate limiting, progressive request delays, temporary account lockout policies, and Multi-Factor Authentication (MFA).',
      whatDoesNotStopIt:
        'Content Delivery Networks (CDNs) and general bandwidth overprovisioning.',
    },
    recommendedDefense: 'Per-IP Rate Limiting & Adaptive Lockout Policies',
    defaultCostMultiplier: 4.0,
    defaultConnectionHoldMs: 25,
    defaultCacheable: false,
    defaultSourceCount: 3,
    defaultExposureRisk: 0.05,
    intensityRange: {
      min: 10,
      max: 2000,
      step: 10,
      defaultRps: 250,
      unit: 'req/s',
    },
  },

  'credential-stuffing-distributed': {
    id: 'credential-stuffing-distributed',
    name: 'Distributed Credential Stuffing',
    targetLayer: 'application',
    plainLanguage: {
      whatItIs:
        'Automated login attempts using compromised credential lists, distributed across thousands of residential IP addresses to bypass simple per-IP limits.',
      whatItTargets:
        'Identity verification services, user account security, and application server authentication pipelines.',
      whatStopsIt:
        'Device fingerprinting, breached credential registries, IP reputation feeds, and behavioral risk scoring.',
      whatDoesNotStopIt:
        'Static per-IP rate limits (individual bots maintain low request rates that blend with normal users).',
    },
    recommendedDefense: 'Device Fingerprinting & IP Reputation Intelligence',
    defaultCostMultiplier: 4.0,
    defaultConnectionHoldMs: 25,
    defaultCacheable: false,
    defaultSourceCount: 5000,
    defaultExposureRisk: 0.1,
    intensityRange: {
      min: 50,
      max: 10000,
      step: 50,
      defaultRps: 800,
      unit: 'req/s',
    },
  },

  'injection-attempts': {
    id: 'injection-attempts',
    name: 'Injection Attempts (Abstract)',
    targetLayer: 'database',
    plainLanguage: {
      whatItIs:
        'Abstract unvalidated input requests probing the backend persistence layer for unauthorized data access or privilege elevation.',
      whatItTargets:
        'Persistence tier integrity, confidentiality of database records, and query compilation subsystems.',
      whatStopsIt:
        'Parameterized queries (PreparedStatements), Object-Relational Mappers (ORMs), strict input schemas, and WAF inspection.',
      whatDoesNotStopIt:
        'Network firewalls, load balancing algorithms, or database replication.',
    },
    recommendedDefense: 'WAF SQLi Signature Rules & Parameterized Prepared Statements',
    defaultCostMultiplier: 1.5,
    defaultConnectionHoldMs: 20,
    defaultCacheable: false,
    defaultSourceCount: 25,
    defaultExposureRisk: 0.8,
    intensityRange: {
      min: 5,
      max: 1000,
      step: 5,
      defaultRps: 80,
      unit: 'req/s',
    },
  },

  'compromised-server': {
    id: 'compromised-server',
    name: 'Compromised Server (Abstract Malware)',
    targetLayer: 'internal',
    plainLanguage: {
      whatItIs:
        'Simulated malware activity on an internal application server causing host CPU drain, lateral spread to adjacent servers, and outbound data exfiltration.',
      whatItTargets:
        'Internal server computing capacity, service mesh trust boundaries, and confidential data egress channels.',
      whatStopsIt:
        'Zero-trust network architecture, egress firewalls, microsegmentation, and host-based intrusion detection (EDR/IDS).',
      whatDoesNotStopIt:
        'Perimeter ingress firewalls and edge CDNs (since the threat operates from inside the internal perimeter).',
    },
    recommendedDefense: 'Egress Filtering, Microsegmentation & Host EDR',
    defaultCostMultiplier: 1.0,
    defaultConnectionHoldMs: 0,
    defaultCacheable: false,
    defaultSourceCount: 1,
    defaultExposureRisk: 0,
    intensityRange: {
      min: 1,
      max: 100,
      step: 1,
      defaultRps: 1,
      unit: 'infected hosts',
    },
  },
};

export const ATTACK_SCENARIOS_LIST: AttackScenarioDefinition[] = Object.values(ATTACK_SCENARIOS);
