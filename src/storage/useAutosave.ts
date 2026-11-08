import { useEffect, useRef, useState } from 'react';
import { useGraphStore, useSimulationStore } from '@store';
import { storage } from './db';
import { decodeProjectFromShareHash } from './share';
import { ProjectData } from './schema';

export function useAutosave() {
  const [sharedProject, setSharedProject] = useState<ProjectData | null>(null);
  const isInitialLoadDone = useRef(false);

  const graph = useGraphStore((s) => s.graph);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const trafficConfig = useSimulationStore((s) => s.trafficConfig);
  const setTrafficConfig = useSimulationStore((s) => s.setTrafficConfig);
  const seed = useSimulationStore((s) => s.seed);
  const setSeed = useSimulationStore((s) => s.setSeed);
  const scenarioScript = useSimulationStore((s) => s.scenarioScript);
  const resetSim = useSimulationStore((s) => s.reset);

  // 1. Initial Load: Shared Hash or Autosave
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const init = async () => {
      // Check for share link
      if (window.location.hash.startsWith('#share=')) {
        const decoded = await decodeProjectFromShareHash(window.location.hash);
        if (decoded) {
          loadGraph(decoded.graph);
          setTrafficConfig(decoded.traffic, decoded.graph);
          setSeed(decoded.seed);
          useSimulationStore.setState({
            scenarioScript: decoded.scenarioScript || [],
          });
          resetSim(decoded.graph);
          setSharedProject(decoded);
          isInitialLoadDone.current = true;
          return;
        }
      }

      // Check for autosave
      try {
        const autosaved = await storage.loadAutosave();
        if (autosaved && autosaved.graph && autosaved.graph.nodes.length > 0) {
          loadGraph(autosaved.graph);
          setTrafficConfig(autosaved.traffic, autosaved.graph);
          setSeed(autosaved.seed);
          useSimulationStore.setState({
            scenarioScript: autosaved.scenarioScript || [],
          });
          resetSim(autosaved.graph);
        }
      } catch {
        // Fallback to starter graph
      }
      isInitialLoadDone.current = true;
    };

    init();
  }, [loadGraph, setTrafficConfig, setSeed, resetSim]);

  // 2. Debounced Autosave (1000ms)
  useEffect(() => {
    if (!isInitialLoadDone.current) return;

    const timer = setTimeout(() => {
      const data: ProjectData = {
        id: 'autosave-current',
        name: 'Autosave',
        version: 2,
        graph,
        traffic: trafficConfig,
        scenarioScript,
        seed,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      storage.saveAutosave(data).catch(() => {});
    }, 1000);

    return () => clearTimeout(timer);
  }, [graph, trafficConfig, scenarioScript, seed]);

  return {
    sharedProject,
    clearSharedProject: () => setSharedProject(null),
  };
}
