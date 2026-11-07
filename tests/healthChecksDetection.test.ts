import { describe, it, expect } from 'vitest';
import { createStarterGraph, addComponent } from '../src/builder';
import { createSimulation } from '../src/engine';

describe('Phase 7: Load Balancer Health Checks & Detection Delay', () => {
  it('detects unhealthy backend after unhealthyThreshold failures and routes around it', () => {
    let graph = createStarterGraph();
    graph = addComponent(graph, 'load-balancer');
    graph = addComponent(graph, 'app-server');
    graph = addComponent(graph, 'app-server');

    const appServers = graph.nodes.filter((n) => n.type === 'app-server');
    expect(appServers.length).toBe(3);
    const targetServer = appServers[0]!.id;

    // Health check config: 500ms interval, unhealthyThreshold: 2
    const configuredGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.type === 'load-balancer') {
          return {
            ...n,
            config: {
              ...n.config,
              healthCheckIntervalMs: 500,
              unhealthyThreshold: 2,
              healthyThreshold: 2,
            },
          };
        }
        return n;
      }),
    };

    // Scenario: targetServer crashes at t=1000ms for 2000ms
    const sim = createSimulation({
      graph: configuredGraph,
      traffic: { peakRps: 60, durationMs: 5000, mode: 'discrete' },
      seed: 42,
      scenarioScript: [
        {
          t: 1000,
          action: 'inject',
          failureType: 'app-server-crash',
          targetId: targetServer,
          durationMs: 2000,
        },
      ],
    });

    // Advance to t=1200ms: During the detection window, targetServer receives requests and fails
    const snapDuringLag = sim.advanceTo(1200);
    expect(snapDuringLag.counters.failed).toBeGreaterThan(0);

    // Advance to t=2500ms: Health checker has detected outage (2 failed probes) and routed traffic to surviving backends
    const snapAfterDetection = sim.advanceTo(2500);
    const targetState = snapAfterDetection.runtimeNodes[targetServer];
    expect(targetState?.healthCheckState).toBe('unhealthy');

    // Traffic continues to succeed via the remaining 2 servers
    expect(snapAfterDetection.counters.succeeded).toBeGreaterThan(50);
  });
});
