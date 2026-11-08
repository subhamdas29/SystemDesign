import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@design/index.css';
import { useGraphStore, useSimulationStore, useUiStore, useMetricsStore, useAttackStore, useDefenseStore } from '@store';

if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, unknown>;
  win.__graphStore = useGraphStore;
  win.__simulationStore = useSimulationStore;
  win.__uiStore = useUiStore;
  win.__metricsStore = useMetricsStore;
  win.__attackStore = useAttackStore;
  win.__defenseStore = useDefenseStore;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
