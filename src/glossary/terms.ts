/**
 * Plain-Language Systems Design Glossary (Phase 10).
 * Concise explanations with concrete real-world examples for engineering terms.
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
  example: string;
  category: 'metrics' | 'architecture' | 'failures' | 'security';
}

export const GLOSSARY_TERMS: Record<string, GlossaryEntry> = {
  rps: {
    term: 'RPS (Requests Per Second)',
    definition: 'The rate of incoming traffic requests arriving at a system per second.',
    example: 'A checkout service receiving 500 RPS processes 30,000 requests every minute.',
    category: 'metrics',
  },
  p50: {
    term: 'P50 Latency (Median)',
    definition: 'The response time that 50% of requests complete within. Represents typical user experience.',
    example: 'If P50 is 35ms, half of your users receive a response in 35ms or faster.',
    category: 'metrics',
  },
  p95: {
    term: 'P95 Latency (95th Percentile)',
    definition: 'The response time that 95% of requests complete within. Captures mild tail latency spikes.',
    example: 'If P95 is 120ms, only 1 in 20 requests experiences a slower response time.',
    category: 'metrics',
  },
  p99: {
    term: 'P99 Latency (Tail Latency)',
    definition: 'The response time that 99% of requests complete within. Reflects severe queueing, garbage collection pauses, or database lock contention.',
    example: 'At 10,000 RPS, a P99 of 450ms means 100 users every second experience nearly half a second of delay.',
    category: 'metrics',
  },
  queue: {
    term: 'Request Queue',
    definition: 'A buffer holding incoming requests when worker threads or connection pools are fully saturated.',
    example: 'If an app server can only execute 10 concurrent database queries, the 11th request waits in queue.',
    category: 'architecture',
  },
  bottleneck: {
    term: 'System Bottleneck',
    definition: 'The single component in an end-to-end architecture with the lowest sustainable throughput, capping total system capacity.',
    example: 'If an App Server can do 2,000 RPS but the Database caps at 300 RPS, the Database is the bottleneck.',
    category: 'architecture',
  },
  cache_hit: {
    term: 'Cache Hit Ratio',
    definition: 'The percentage of incoming read queries served directly from fast in-memory storage without hitting backend databases.',
    example: 'An 85% cache hit ratio means only 15 out of 100 requests need to query the primary database.',
    category: 'architecture',
  },
  ttl: {
    term: 'TTL (Time To Live)',
    definition: 'The lifespan duration before a cached item expires and must be re-fetched from the authoritative source.',
    example: 'A user profile cached with a 60-second TTL will serve fast stale reads for 1 minute before refreshing.',
    category: 'architecture',
  },
  backoff: {
    term: 'Exponential Backoff with Jitter',
    definition: 'A retry strategy where clients double their waiting delay between attempts and add random jitter to prevent synchronized retry storms.',
    example: 'Waiting 100ms, then 200ms, then 400ms prevents 10,000 clients from retrying simultaneously.',
    category: 'failures',
  },
  circuit_breaker: {
    term: 'Circuit Breaker',
    definition: 'A safety mechanism that trips open when downstream failure rates exceed a threshold, failing fast without overloading struggling backends.',
    example: 'If a payment gateway fails 50% of calls, the circuit breaker opens for 30s to allow the gateway to recover.',
    category: 'failures',
  },
  replica_lag: {
    term: 'Replication Lag',
    definition: 'The delay in milliseconds between a write committing on a primary database and replicating to asynchronous read replicas.',
    example: 'With 150ms replication lag, a user reading their post immediately after publishing may temporarily see stale data.',
    category: 'architecture',
  },
  sharding: {
    term: 'Database Sharding',
    definition: 'Partitioning a database horizontally across multiple independent servers using a shard key hash.',
    example: 'Hashing User ID modulo 4 evenly splits 10 million user records across 4 database shards.',
    category: 'architecture',
  },
  zipf_skew: {
    term: 'Zipf Key Skew (Hot Shards)',
    definition: 'Power-law traffic distribution where a tiny fraction of keys receive the vast majority of all read/write traffic.',
    example: 'A celebrity user with 50M followers causes a single shard to melt while other shards remain idle.',
    category: 'architecture',
  },
  amplification: {
    term: 'Amplification Factor (Retry Storm)',
    definition: 'The multiplier of client requests caused by aggressive retries when backends slow down or fail.',
    example: 'An amplification factor of 3.0x turns a 1,000 RPS traffic stream into 3,000 RPS hammering the database.',
    category: 'failures',
  },
  waf: {
    term: 'WAF (Web Application Firewall)',
    definition: 'Layer 7 application filter that inspects HTTP paths, query parameters, and headers to block malicious signatures.',
    example: 'Blocking SQL injection patterns or malicious scraping bots before they reach application servers.',
    category: 'security',
  },
  cdn: {
    term: 'CDN Anycast Protection',
    definition: 'A globally distributed edge network that absorbs and disperses massive volumetric floods near the traffic source.',
    example: 'A 50 Gbps volumetric DDoS is soaked across 100 global edge locations, protecting the origin server.',
    category: 'security',
  },
  rate_limiter: {
    term: 'Rate Limiter (Token Bucket)',
    definition: 'A traffic shaper that restricts request frequency per client IP or token, rejecting excess requests with HTTP 429.',
    example: 'Restricting each client to 60 requests per minute to prevent credential stuffing and brute-force attacks.',
    category: 'security',
  },
};
