import React from 'react';
import { useSimulationStore, selectSimStatus, selectSimSpeed, selectSimTick } from '@store';

export const ControlBar: React.FC = () => {
  const status = useSimulationStore(selectSimStatus);
  const speed = useSimulationStore(selectSimSpeed);
  const tick = useSimulationStore(selectSimTick);

  return (
    <footer
      className="h-14 w-full bg-[#131316] border-t border-[#27272a] px-6 flex items-center justify-between select-none z-10"
      aria-label="Simulation Control Bar"
    >
      {/* Playback Controls (Disabled visual shell for Phase 1) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          aria-label="Play simulation"
          title="Simulation engine launches in Phase 3"
          className="h-8 px-3 rounded bg-[#18181b] border border-[#27272a] text-[#71717a] text-xs font-medium flex items-center gap-1.5 cursor-not-allowed"
        >
          <span>▶</span>
          <span>Play</span>
        </button>

        <button
          type="button"
          disabled
          aria-label="Step simulation"
          title="Simulation engine launches in Phase 3"
          className="h-8 px-2.5 rounded bg-[#18181b] border border-[#27272a] text-[#71717a] text-xs font-mono cursor-not-allowed"
        >
          ⏯ Step
        </button>

        <div className="h-4 w-px bg-[#27272a] mx-1" />

        {/* Speed Toggles */}
        <div className="flex items-center gap-1 bg-[#111113] p-0.5 rounded border border-[#27272a]">
          {[1, 2, 4, 8].map((s) => (
            <button
              key={s}
              type="button"
              disabled
              title="Simulation engine launches in Phase 3"
              className={`h-7 px-2 rounded text-[11px] font-mono transition-colors cursor-not-allowed ${
                speed === s
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-[#71717a] hover:text-[#a1a1aa]'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Center Simulated Clock / Status */}
      <div className="flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#71717a]" />
          <span className="text-[var(--color-text-muted)] uppercase tracking-wider">
            Engine: {status} (Phase 3)
          </span>
        </div>
        <div className="text-[var(--color-text-faint)]">
          Tick: <span className="text-white">{tick}</span>
        </div>
      </div>

      {/* Right Volume / Traffic summary */}
      <div className="text-xs font-mono text-[var(--color-text-muted)] flex items-center gap-2">
        <span>Traffic:</span>
        <span className="px-2 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-white">
          500 RPS (Default)
        </span>
      </div>
    </footer>
  );
};
