import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGraphStore } from '../src/store';
import { AppServerConfig } from '../src/types';

describe('Config Edits, Presets, and Undo/Redo Batching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGraphStore.getState().reset();
    useGraphStore.setState({ history: [], future: [] });
  });

  it('updates node config and records single undo step for standard edit', () => {
    const store = useGraphStore.getState();
    const serverNode = store.graph.nodes.find((n) => n.type === 'app-server')!;

    store.updateNodeConfig(serverNode.id, { maxThroughputRps: 1800 });

    const updatedNode = useGraphStore.getState().graph.nodes.find((n) => n.id === serverNode.id)!;
    expect((updatedNode.config as AppServerConfig).maxThroughputRps).toBe(1800);
    expect(useGraphStore.getState().history).toHaveLength(1);

    // Undo reverts back to default
    useGraphStore.getState().undo();
    const revertedNode = useGraphStore.getState().graph.nodes.find((n) => n.id === serverNode.id)!;
    expect((revertedNode.config as AppServerConfig).maxThroughputRps).toBe(1000);
  });

  it('batches rapid debounced config edits into one single history entry', () => {
    const store = useGraphStore.getState();
    const serverNode = store.graph.nodes.find((n) => n.type === 'app-server')!;

    // Simulate rapid slider drag: 1100 -> 1200 -> 1300 -> 1500
    store.updateNodeConfig(serverNode.id, { maxThroughputRps: 1100 }, true);
    vi.advanceTimersByTime(50);
    store.updateNodeConfig(serverNode.id, { maxThroughputRps: 1200 }, true);
    vi.advanceTimersByTime(50);
    store.updateNodeConfig(serverNode.id, { maxThroughputRps: 1300 }, true);
    vi.advanceTimersByTime(50);
    store.updateNodeConfig(serverNode.id, { maxThroughputRps: 1500 }, true);

    // Before timer fires, history hasn't committed new entry yet
    expect(useGraphStore.getState().history).toHaveLength(0);

    // Fast-forward past debounce window (300ms)
    vi.advanceTimersByTime(350);

    // Now exactly 1 history entry should exist
    expect(useGraphStore.getState().history).toHaveLength(1);
    const finalNode = useGraphStore.getState().graph.nodes.find((n) => n.id === serverNode.id)!;
    expect((finalNode.config as AppServerConfig).maxThroughputRps).toBe(1500);

    // A single undo should revert back to original 1000
    useGraphStore.getState().undo();
    const undoneNode = useGraphStore.getState().graph.nodes.find((n) => n.id === serverNode.id)!;
    expect((undoneNode.config as AppServerConfig).maxThroughputRps).toBe(1000);
  });

  it('applies presets to node and permits undo', () => {
    const store = useGraphStore.getState();
    const dbNode = store.graph.nodes.find((n) => n.type === 'database')!;

    // Apply 'large' preset
    store.applyPreset(dbNode.id, 'large');
    let updatedDb = useGraphStore.getState().graph.nodes.find((n) => n.id === dbNode.id)!;
    expect((updatedDb.config as { maxQueryThroughputQps: number }).maxQueryThroughputQps).toBe(5000);

    // Undo reverts back to medium default (500)
    useGraphStore.getState().undo();
    updatedDb = useGraphStore.getState().graph.nodes.find((n) => n.id === dbNode.id)!;
    expect((updatedDb.config as { maxQueryThroughputQps: number }).maxQueryThroughputQps).toBe(500);
  });

  it('applyConfigToAll updates all App Servers in one single step and single undo', () => {
    // Add Load Balancer and 2nd App Server
    useGraphStore.getState().addNode('load-balancer');
    useGraphStore.getState().addNode('app-server');

    const servers = useGraphStore.getState().graph.nodes.filter((n) => n.type === 'app-server');
    expect(servers).toHaveLength(2);

    const historyBefore = useGraphStore.getState().history.length;

    // Apply custom config to all App Servers
    const customConfig: Partial<AppServerConfig> = {
      maxThroughputRps: 3500,
      cpuCores: 8,
    };
    useGraphStore.getState().applyConfigToAll('app-server', customConfig as never);

    // Verify all App Servers updated
    const updatedServers = useGraphStore.getState().graph.nodes.filter((n) => n.type === 'app-server');
    expect((updatedServers[0]!.config as AppServerConfig).maxThroughputRps).toBe(3500);
    expect((updatedServers[1]!.config as AppServerConfig).maxThroughputRps).toBe(3500);

    // Exactly 1 history step added
    expect(useGraphStore.getState().history.length).toBe(historyBefore + 1);

    // Undo reverts both servers in 1 step
    useGraphStore.getState().undo();
    const undoneServers = useGraphStore.getState().graph.nodes.filter((n) => n.type === 'app-server');
    expect((undoneServers[0]!.config as AppServerConfig).maxThroughputRps).toBe(1000);
    expect((undoneServers[1]!.config as AppServerConfig).maxThroughputRps).toBe(1000);
  });
});
