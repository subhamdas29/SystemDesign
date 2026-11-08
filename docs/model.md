# Mathematical Model and Theoretical Reference

> Comprehensive documentation of the mathematical formulas, queueing theory models, fluid equations, assumptions, and known inaccuracies implemented in the Life of a Request simulator across all 10 phases.

---

## 1. Traffic Generation Models

### 1.1 Poisson Arrival Process
In discrete simulation mode, requests arrive according to a Poisson point process with rate parameter $\lambda(t)$ requests per millisecond ($\lambda_{\text{sec}} / 1000$). The inter-arrival times $\Delta t$ between consecutive requests follow an exponential distribution:

$$\Delta t = -\frac{\ln(1 - U)}{\lambda}$$

where $U \sim \text{Uniform}(0, 1)$ generated via the deterministic pseudo-random number generator (PRNG).

### 1.2 Traffic Patterns
- **Constant Rate**: $\lambda(t) = \text{RPS}_{\text{peak}}$
- **Gradual Ramp**: $\lambda(t) = \text{RPS}_{\text{start}} + (\text{RPS}_{\text{peak}} - \text{RPS}_{\text{start}}) \cdot \frac{t}{T_{\text{duration}}}$
- **Sudden Spike**:
  $$\lambda(t) = \begin{cases} \text{RPS}_{\text{peak}} & \text{if } t_{\text{spike}} \le t \le t_{\text{spike}} + D_{\text{spike}} \\ \text{RPS}_{\text{baseline}} & \text{otherwise} \end{cases}$$
- **Burst Pattern**: Repeating periodic pulses with period $T_{\text{period}}$ and duty cycle $D_{\text{duty}}$.

---

## 2. Latency and Service Time Models

### 2.1 Lognormal Service Distribution
Service times at computational nodes (App Servers, Databases, Workers) are modeled using a lognormal distribution, reflecting the reality that service times are non-negative and exhibit positive skew with long tail latencies (P95, P99):

$$X = e^{\mu + \sigma Z}, \quad Z \sim \mathcal{N}(0, 1)$$

Given an expected mean service time $m$ and shape parameter $\sigma$:

$$\mu = \ln(m) - \frac{\sigma^2}{2}$$

The standard normal variate $Z$ is generated via the Box-Muller transform:

$$Z = \sqrt{-2 \ln U_1} \cos(2\pi U_2)$$

### 2.2 Network Edge Latency
Each network connection edge adds transit latency:

$$L_{\text{edge}} = \max(1, \mu_{\text{edge}} + \text{jitter})$$

where jitter is sampled from a normal distribution $\mathcal{N}(0, \sigma_{\text{jitter}}^2)$. Packet loss is simulated as a Bernoulli trial with probability $P_{\text{loss}}$.

---

## 3. Queueing Dynamics ($M/M/c/K$ Model)

Components with finite concurrency limits $c$ (worker threads or database connections) and bounded queue buffer $K$ follow $M/M/c/K$ queueing dynamics:

- **Service Phase**: Up to $c$ requests execute concurrently.
- **Queue Phase**: Excess arrivals enter FIFO queue up to capacity $K$.
- **Rejection Phase**: When queue depth reaches $K$, incoming requests are rejected immediately with HTTP 503 (Service Unavailable).

---

## 4. In-Memory Caching & Cold-Start Warm-up

### 4.1 Hit Ratio & Offload
Read queries query the cache first. With effective hit ratio $H(t)$:
- Cache Hit probability: $P(\text{Hit}) = H(t)$ (serviced in 1–2 ms, does not touch Database)
- Cache Miss probability: $P(\text{Miss}) = 1 - H(t)$ (forwards query to Primary Database or Read Replica)

### 4.2 Linear Cold Cache Warm-up
When a cache starts cold, its hit ratio warms linearly up to configured maximum $H_{\max}$ over duration $T_{\text{warm}}$:

$$H(t) = H_{\max} \cdot \min\left(1, \frac{t}{T_{\text{warm}}}\right)$$

During $t < T_{\text{warm}}$, the surge of cache misses creates a thundering herd on downstream database connection pools.

---

## 5. Retries, Timeouts, and Load Amplification

### 5.1 Exponential Backoff with Full Jitter
Failed or timed-out requests retry up to $N_{\text{retries}}$ times. The backoff delay before attempt $i$ is calculated using full jitter:

$$t_{\text{backoff}} = \text{rand}\left(0, \min(t_{\max}, t_{\text{base}} \cdot 2^{i})\right)$$

### 5.2 Amplification Factor
When downstream services slow down or fail, retried requests amplify system load. The load amplification factor $A$ is:

$$A = \frac{\text{Total Requests Dispatched}}{\text{Original Client Invocations}}$$

When $A > 1.5$, a retry storm alert is triggered.

---

## 6. Attacker Mode & Multi-Class Flow Conservation

Every request carries a strict traffic class tuple $(\text{origin}, \text{kind})$, where origin is $\in \{\text{legitimate}, \text{malicious}\}$.

### Strict Conservation Law
At any point in simulated time:

$$\text{Created} = \text{In-Flight} + \text{Succeeded} + \text{Failed} + \text{Rejected} + \text{TimedOut} + \text{Blocked}$$

This conservation invariant is validated and asserted in test suites across both discrete and fluid simulation modes.

---

## 7. Edge Defenses & Mitigation

- **CDN Anycast Protection**: Absorbs volumetric L3/L4 floods with absorption efficiency $E_{\text{cdn}} \in [0.90, 0.99]$.
- **Layer 3/4 Firewall**: Maintains dynamic blocklist coverage $C(t) = \min(C_{\max}, \text{rate} \cdot (t - t_{\text{detect}}))$.
- **WAF (Layer 7)**: Inspects query paths and payloads with signature accuracy ($98\%$ true positive, $0.5\%$ false positive rate).
- **Token Bucket Rate Limiter**: Tokens refill continuously at rate $r$. A request consumes 1 token. When bucket tokens $< 1$, requests are rejected with HTTP 429.

---

## 8. Asynchronous Processing & Read Replicas

### 8.1 Message Queue & Worker Drain
Write requests produce asynchronous jobs enqueued into the Message Queue.
- Arrival rate: $\lambda_{\text{write}}$
- Worker pool drain capacity:
  $$C_{\text{drain}} = N_{\text{workers}} \cdot \frac{1000}{\text{avgProcessingMs}}$$
- If $\lambda_{\text{write}} > C_{\text{drain}}$, queue depth accumulates linearly:
  $$\frac{dQ}{dt} = \lambda_{\text{write}} - C_{\text{drain}}$$

### 8.2 Database Read Replicas & Lag
Read queries that miss cache are distributed across $N_{\text{replicas}}$ read replicas.
Replication lag is modeled as a function of primary write volume:

$$\text{Lag}(t) = \text{Lag}_{\text{base}} + \alpha \cdot \text{QPS}_{\text{write}}$$

---

## 9. Database Sharding & Zipf Key Skew

With $N_{\text{shards}}$ shards, query routing uses hash partitioning: $\text{shard} = \text{hash}(\text{key}) \pmod{N_{\text{shards}}}$.
Under key skew, query key frequencies follow Zipf's law:

$$P(k) = \frac{1 / k^s}{\sum_{i=1}^{M} (1 / i^s)}$$

With skew exponent $s = 1.2$, the top $1\%$ of keys receive over $50\%$ of queries, demonstrating hot shard saturation.

---

## 10. Fluid Aggregate ODE Engine

For massive throughput ($\lambda > 1,000$ RPS up to $1,000,000$ RPS), discrete per-event queueing is computationally intractable at 60 FPS. The fluid engine represents traffic as continuous flow rates $F_i(t)$ governed by conservation ODEs:

$$\frac{d Q_i}{dt} = F_{\text{in}, i}(t) - \min(C_i, Q_i(t) / \tau_i)$$

Integration uses deterministic fixed-step Euler evaluation ($\Delta t = 100\text{ ms}$).

---

## 11. Known Assumptions and Inaccuracies

While accurate for architectural decision-making, the simulation makes simplifying assumptions:
1. **Thread Scheduling**: Operating system kernel context-switching and CPU cache line invalidations are approximated via lognormal tail variance rather than cycle-accurate CPU architecture emulation.
2. **Network Protocol Stack**: TCP three-way handshakes, window scaling, and slow start are modeled via edge latency and connection pools rather than packet-level TCP state machines.
3. **Database Locks**: Lock contention (row/table lock waits) is modeled through queue buildup and elevated service times rather than full transactional ACID lock graphs.
4. **Memory Allocation**: Garbage collection pauses are modeled as lognormal tail latency spikes rather than V8/JVM heap generational GC tracking.
