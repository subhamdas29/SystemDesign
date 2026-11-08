import { GraphConfig } from '../../types';
import { TrafficConfig } from '../../engine/protocol';

export interface TutorialStep {
  id: string;
  instruction: string;
  explanation: string;
  targetElement?: string; // e.g. '#play-button', '[data-node-id="app-server"]', '#tab-charts'
  checkCompletion: (context: {
    graph: GraphConfig;
    simStatus: string;
    counters: {
      created: number;
      succeeded: number;
      rejected: number;
      failed: number;
      timedOut?: number;
      blocked?: number;
      inFlight?: number;
    };
    activeFailures: unknown[];
  }) => boolean;
}

export interface Tutorial {
  id: string;
  title: string;
  subtitle: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedMinutes: number;
  initialGraph: (baseGraph: GraphConfig) => GraphConfig;
  initialTraffic: TrafficConfig;
  steps: TutorialStep[];
}
