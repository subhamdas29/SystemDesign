import React from 'react';
import {
  useSimulationStore,
  selectSimulationError,
  useGraphStore,
  selectGraph,
} from '@store';

export const SimulationErrorBanner: React.FC = () => {
  const error = useSimulationStore(selectSimulationError);
  const clearError = useSimulationStore((s) => s.clearSimulationError);
  const restart = useSimulationStore((s) => s.restartSimulation);
  const graph = useGraphStore(selectGraph);

  if (!error) return null;

  return (
    <div
      role="alert"
      className="absolute top-4 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[90%] px-4 py-3 rounded-xl bg-[#18181b]/95 backdrop-blur-md border border-red-500/50 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-red-400 text-base shrink-0">⚠️</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Simulation Error</p>
          <p className="text-[11px] text-[var(--color-text-muted)] truncate" title={error}>
            {error}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => restart(graph)}
          className="px-2.5 py-1 rounded bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors"
        >
          Restart simulation
        </button>
        <button
          type="button"
          onClick={clearError}
          className="text-xs text-[var(--color-text-muted)] hover:text-white p-1 rounded hover:bg-white/10"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
