/**
 * Unified Bounded Metrics Store (Zustand).
 * Multi-tier resolution:
 *   - Recent 5 simulated minutes (0 - 300s): full 1-second raw resolution.
 *   - 5 - 15 simulated minutes: 5-second rolled-up buckets.
 *   - 15+ simulated minutes: 30-second rolled-up buckets.
 * Guarantees that a 10-minute run at 1,000,000 RPS never grows memory without bound.
 */

import { create } from 'zustand';
import { MetricsSample, RunResult } from '../types/metrics';
import { rollupMetrics, getSampleAtTime } from '../engine/metrics/rollup';

export type DashboardDisplayState = 'collapsed' | 'compact' | 'expanded';
export type DashboardTab = 'overview' | 'health' | 'charts';
export type ChartsTimeWindow = '60s' | 'all';

export interface MetricsStoreState {
  samples: MetricsSample[];
  latestSample: MetricsSample | null;
  timeTravelTimeMs: number | null; // null = viewing live playback
  dashboardState: DashboardDisplayState;
  activeDashboardTab: DashboardTab;
  chartsTimeWindow: ChartsTimeWindow;
  currentRunResult: RunResult | null;
  isRunSummaryOpen: boolean;

  // Actions
  ingestSample: (sample: MetricsSample) => void;
  setTimeTravelTime: (timeMs: number | null) => void;
  setDashboardState: (state: DashboardDisplayState) => void;
  toggleDashboardState: () => void;
  setActiveDashboardTab: (tab: DashboardTab) => void;
  setChartsTimeWindow: (window: ChartsTimeWindow) => void;
  setRunResult: (result: RunResult | null) => void;
  openRunSummary: () => void;
  closeRunSummary: () => void;
  clearMetrics: () => void;

  // Selectors
  getActiveSample: () => MetricsSample | null;
  getNodeHistory: (nodeId: string) => { timeMs: number; rps: number; queue: number; util: number }[];
}

// In-memory multi-tier buffers
let rawRecentSamples: MetricsSample[] = [];
let mediumBucketSamples: MetricsSample[] = [];
let coarseBucketSamples: MetricsSample[] = [];

export const useMetricsStore = create<MetricsStoreState>((set, get) => ({
  samples: [],
  latestSample: null,
  timeTravelTimeMs: null,
  dashboardState: 'collapsed',
  activeDashboardTab: 'overview',
  chartsTimeWindow: '60s',
  currentRunResult: null,
  isRunSummaryOpen: false,

  ingestSample: (sample: MetricsSample) => {
    rawRecentSamples.push(sample);

    // Roll up excess raw samples into 5-second medium buckets
    // Keep 300 samples (5 minutes at 1s resolution)
    while (rawRecentSamples.length > 300 && rawRecentSamples.length - 300 >= 5) {
      const chunk = rawRecentSamples.splice(0, 5);
      const rolled = rollupMetrics(chunk, 5000);
      mediumBucketSamples.push(...rolled);
    }

    // Roll up excess medium samples into 30-second coarse buckets
    // Keep 120 samples (10 minutes at 5s resolution)
    while (mediumBucketSamples.length > 120 && mediumBucketSamples.length - 120 >= 6) {
      const chunk = mediumBucketSamples.splice(0, 6);
      const rolled = rollupMetrics(chunk, 30000);
      coarseBucketSamples.push(...rolled);
    }

    // Consolidated ordered view
    const consolidated = [...coarseBucketSamples, ...mediumBucketSamples, ...rawRecentSamples];

    set({
      samples: consolidated,
      latestSample: sample,
    });
  },

  setTimeTravelTime: (timeMs: number | null) => set({ timeTravelTimeMs: timeMs }),
  setDashboardState: (dashboardState: DashboardDisplayState) => set({ dashboardState }),
  toggleDashboardState: () => {
    const current = get().dashboardState;
    if (current === 'collapsed') set({ dashboardState: 'compact' });
    else if (current === 'compact') set({ dashboardState: 'expanded' });
    else set({ dashboardState: 'compact' });
  },
  setActiveDashboardTab: (activeDashboardTab: DashboardTab) => set({ activeDashboardTab }),
  setChartsTimeWindow: (chartsTimeWindow: ChartsTimeWindow) => set({ chartsTimeWindow }),
  setRunResult: (currentRunResult: RunResult | null) => set({ currentRunResult }),
  openRunSummary: () => set({ isRunSummaryOpen: true }),
  closeRunSummary: () => set({ isRunSummaryOpen: false }),

  clearMetrics: () => {
    rawRecentSamples = [];
    mediumBucketSamples = [];
    coarseBucketSamples = [];
    set({
      samples: [],
      latestSample: null,
      timeTravelTimeMs: null,
      currentRunResult: null,
      isRunSummaryOpen: false,
    });
  },

  getActiveSample: () => {
    const { timeTravelTimeMs, latestSample, samples } = get();
    if (timeTravelTimeMs === null) {
      return latestSample;
    }
    return getSampleAtTime(samples, timeTravelTimeMs) ?? latestSample;
  },

  getNodeHistory: (nodeId: string) => {
    const { samples } = get();
    // Return last 60 samples
    const recent = samples.slice(-60);
    return recent.map((s) => {
      const n = s.nodes[nodeId];
      return {
        timeMs: s.timeMs,
        rps: n?.processedRps ?? 0,
        queue: n?.queueLength ?? 0,
        util: n?.utilization ?? 0,
      };
    });
  },
}));

// Selectors
export const selectMetricsSamples = (state: MetricsStoreState) => state.samples;
export const selectLatestMetricsSample = (state: MetricsStoreState) => state.latestSample;
export const selectTimeTravelTime = (state: MetricsStoreState) => state.timeTravelTimeMs;
export const selectDashboardState = (state: MetricsStoreState) => state.dashboardState;
export const selectActiveDashboardTab = (state: MetricsStoreState) => state.activeDashboardTab;
export const selectChartsTimeWindow = (state: MetricsStoreState) => state.chartsTimeWindow;
export const selectCurrentRunResult = (state: MetricsStoreState) => state.currentRunResult;
export const selectIsRunSummaryOpen = (state: MetricsStoreState) => state.isRunSummaryOpen;
