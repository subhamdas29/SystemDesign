/**
 * Simulation runtime store skeleton.
 * Separated from GraphConfig. In later phases, this will bridge to the Web Worker.
 */

import { create } from 'zustand';
import { NodeRuntimeState, SystemMetrics } from '../types';

export type SimulationStatus = 'idle' | 'running' | 'paused';
export type SimulationSpeed = 1 | 2 | 4 | 8;

export interface SimulationStoreState {
  status: SimulationStatus;
  speed: SimulationSpeed;
  tick: number;
  runtimeNodes: Record<string, NodeRuntimeState>;
  metrics: SystemMetrics;

  // Actions
  setStatus: (status: SimulationStatus) => void;
  setSpeed: (speed: SimulationSpeed) => void;
  setTick: (tick: number) => void;
  resetSimulation: () => void;
}

const initialMetrics: SystemMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  droppedRequests: 0,
  currentThroughputRps: 0,
  averageLatencyMs: 0,
  p99LatencyMs: 0,
};

export const useSimulationStore = create<SimulationStoreState>((set) => ({
  status: 'idle',
  speed: 1,
  tick: 0,
  runtimeNodes: {},
  metrics: initialMetrics,

  setStatus: (status: SimulationStatus) => set({ status }),
  setSpeed: (speed: SimulationSpeed) => set({ speed }),
  setTick: (tick: number) => set({ tick }),
  resetSimulation: () =>
    set({
      status: 'idle',
      tick: 0,
      runtimeNodes: {},
      metrics: initialMetrics,
    }),
}));

// Selectors
export const selectSimStatus = (state: SimulationStoreState) => state.status;
export const selectSimSpeed = (state: SimulationStoreState) => state.speed;
export const selectSimTick = (state: SimulationStoreState) => state.tick;
export const selectSimMetrics = (state: SimulationStoreState) => state.metrics;
export const selectRuntimeNodes = (state: SimulationStoreState) => state.runtimeNodes;
