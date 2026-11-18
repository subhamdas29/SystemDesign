import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../src/store';

describe('Undo / Redo Store Logic', () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    // clear history after reset to test cleanly
    useGraphStore.setState({ history: [], future: [] });
  });

  it('records history and undoes an added component', () => {
    const store = useGraphStore.getState();
    expect(store.graph.nodes).toHaveLength(4);

    // Add Load Balancer
    const addRes = store.addNode('load-balancer');
    expect(addRes.success).toBe(true);
    expect(useGraphStore.getState().graph.nodes).toHaveLength(5);
    expect(useGraphStore.getState().history).toHaveLength(1);

    // Undo
    useGraphStore.getState().undo();
    expect(useGraphStore.getState().graph.nodes).toHaveLength(4);
    expect(useGraphStore.getState().future).toHaveLength(1);

    // Redo
    useGraphStore.getState().redo();
    expect(useGraphStore.getState().graph.nodes).toHaveLength(5);
    expect(useGraphStore.getState().future).toHaveLength(0);
  });

  it('resets to starter graph', () => {
    useGraphStore.getState().addNode('load-balancer');
    useGraphStore.getState().addNode('app-server');
    expect(useGraphStore.getState().graph.nodes).toHaveLength(6);

    useGraphStore.getState().reset();
    expect(useGraphStore.getState().graph.nodes).toHaveLength(4);
    expect(useGraphStore.getState().graph.nodes.map((n) => n.type)).toEqual([
      'client',
      'cdn',
      'app-server',
      'database',
    ]);
  });
});
