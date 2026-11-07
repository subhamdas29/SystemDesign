/**
 * Interactive Simulation Control Bar.
 * Controls playback (Play, Pause, Step, Reset, Speed), timeline scrubbing,
 * execution mode badges, traffic configuration modal opener, and event log toggle.
 */

import React, { useEffect, useRef } from 'react';
import {
  useSimulationStore,
  selectSimPlayStatus,
  selectSimSpeed,
  selectSimTimeMs,
  selectSimDurationMs,
  selectSimRps,
  selectSimSeed,
  selectIsEventLogOpen,
  selectTrafficConfig,
  selectActiveMode,
  selectIsTrafficModalOpen,
  selectVisualizationDisplayMode,
  SimulationSpeed,
} from '../../store/simulationStore';
import { useGraphStore, selectGraph, selectValidation } from '../../store/graphStore';
import { TrafficModal } from './TrafficModal';

export const ControlBar: React.FC = () => {
  const status = useSimulationStore(selectSimPlayStatus);
  const speed = useSimulationStore(selectSimSpeed);
  const simTimeMs = useSimulationStore(selectSimTimeMs);
  const durationMs = useSimulationStore(selectSimDurationMs);
  const rps = useSimulationStore(selectSimRps);
  const seed = useSimulationStore(selectSimSeed);
  const isEventLogOpen = useSimulationStore(selectIsEventLogOpen);
  const isTrafficModalOpen = useSimulationStore(selectIsTrafficModalOpen);
  const trafficConfig = useSimulationStore(selectTrafficConfig);
  const activeMode = useSimulationStore(selectActiveMode);
  const displayMode = useSimulationStore(selectVisualizationDisplayMode);
  const setDisplayMode = useSimulationStore((s) => s.setDisplayMode);

  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const step = useSimulationStore((s) => s.step);
  const reset = useSimulationStore((s) => s.reset);
  const seek = useSimulationStore((s) => s.seek);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  const setSeed = useSimulationStore((s) => s.setSeed);
  const randomizeSeed = useSimulationStore((s) => s.randomizeSeed);
  const toggleEventLog = useSimulationStore((s) => s.toggleEventLog);
  const tickFrame = useSimulationStore((s) => s.tickFrame);
  const openTrafficModal = useSimulationStore((s) => s.openTrafficModal);

  const graph = useGraphStore(selectGraph);
  const validation = useGraphStore(selectValidation);

  // UI-side requestAnimationFrame driving loop
  const lastFrameTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let animId: number;

    const loop = (timestamp: number) => {
      if (lastFrameTimeRef.current !== null && status === 'running') {
        const deltaMs = Math.min(100, timestamp - lastFrameTimeRef.current);
        tickFrame(deltaMs, graph);
      }
      lastFrameTimeRef.current = timestamp;
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [status, tickFrame, graph]);

  const handlePlayToggle = () => {
    if (status === 'running') {
      pause();
    } else {
      play(graph);
    }
  };

  return (
    <>
      <footer
        className="h-16 w-full bg-[#131316] border-t border-[#27272a] px-5 flex items-center justify-between select-none z-30"
        aria-label="Simulation Control Bar"
      >
        {/* Left: Playback Controls & Speed */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePlayToggle}
            disabled={!validation.valid}
            title={!validation.valid ? `Cannot simulate: ${validation.errors[0]}` : 'Play / Pause simulation'}
            className={`
              h-8 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all
              ${
                !validation.valid
                  ? 'bg-[#18181b] text-[#52525b] border border-[#27272a] cursor-not-allowed'
                  : status === 'running'
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                  : 'bg-white text-black hover:bg-[#e4e4e7] border border-white shadow-[0_0_12px_rgba(255,255,255,0.3)] active:scale-95'
              }
            `}
          >
            <span>{status === 'running' ? '⏸' : '▶'}</span>
            <span>{status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'}</span>
          </button>

          <button
            type="button"
            onClick={() => step(graph)}
            disabled={!validation.valid || status === 'running'}
            title="Step forward one event / tick"
            className="h-8 px-2.5 rounded-lg bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white text-xs font-mono disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            ⏯ Step
          </button>

          <button
            type="button"
            onClick={() => reset(graph)}
            title="Reset simulation to t=0"
            className="h-8 px-2.5 rounded-lg bg-[#18181b] hover:bg-[#222226] text-[var(--color-text-secondary)] hover:text-white border border-[#3f3f46] hover:border-white text-xs font-mono transition-all"
          >
            ↺ Reset
          </button>

          <div className="h-5 w-px bg-[#27272a] mx-1" />

          {/* Speed Toggles */}
          <div className="flex items-center gap-0.5 bg-[#0b0b0d] p-0.5 rounded-lg border border-[#27272a]">
            {([1, 2, 4, 8] as SimulationSpeed[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`h-7 px-2 rounded-md text-[11px] font-mono transition-all ${
                  speed === s
                    ? 'bg-[#222226] text-white font-bold border border-white/30 shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Center: Timeline Scrubber */}
        <div className="flex-1 max-w-sm mx-4 flex items-center gap-3">
          <span className="font-mono text-xs text-white w-14 text-right">
            {Math.round(simTimeMs)}ms
          </span>

          <input
            type="range"
            min={0}
            max={durationMs}
            step={10}
            value={simTimeMs}
            onChange={(e) => seek(Number(e.target.value), graph)}
            className="flex-1 accent-white h-1.5 bg-[#27272a] rounded-lg appearance-none cursor-pointer"
          />

          <span className="font-mono text-xs text-[var(--color-text-faint)] w-14">
            {durationMs}ms
          </span>
        </div>

        {/* Right: Traffic Config Button, Mode Badge, Volume indicator & Log Toggle */}
        <div className="flex items-center gap-2.5 text-xs font-mono">
          {/* Display Mode Toggle: Individual vs Aggregate */}
          <div
            className="flex items-center bg-[#0b0b0d] p-0.5 rounded-lg border border-[#27272a]"
            role="group"
            aria-label="Visualization Mode"
          >
            <button
              type="button"
              onClick={() => setDisplayMode('individual')}
              title="Individual Requests: render discrete packets with motion trails"
              className={`h-7 px-2 rounded-md text-[11px] font-mono transition-all flex items-center gap-1 ${
                displayMode === 'individual'
                  ? 'bg-[#222226] text-white font-bold border border-white/30 shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              <span>⚪</span>
              <span className="hidden xl:inline">Packets</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('aggregate')}
              title="Aggregate Flow: render continuous high-throughput flowing particle bands"
              className={`h-7 px-2 rounded-md text-[11px] font-mono transition-all flex items-center gap-1 ${
                displayMode === 'aggregate'
                  ? 'bg-[#222226] text-white font-bold border border-white/30 shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              <span>〰</span>
              <span className="hidden xl:inline">Flow</span>
            </button>
          </div>

          {/* Active Mode Badge with Tooltip */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#18181b] border border-[#27272a] cursor-help"
            title={
              activeMode === 'aggregate'
                ? 'Aggregate mode: fixed 100ms ticks, Little’s Law back-pressure, supporting up to 1M req/s'
                : 'Discrete mode: individual request event scheduling with Poisson arrivals'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                activeMode === 'aggregate' ? 'bg-amber-400' : 'bg-cyan-400'
              }`}
            />
            <span className="text-[11px] uppercase font-bold text-white tracking-wider">
              {trafficConfig.mode === 'auto' ? `Auto (${activeMode})` : activeMode}
            </span>
          </div>

          {/* Traffic Modal Button with current traffic summary */}
          <button
            type="button"
            onClick={openTrafficModal}
            title="Configure traffic rate, patterns, and execution mode"
            className="h-8 px-3 rounded-lg bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span className="font-semibold">{rps.toLocaleString()} RPS</span>
            <span className="text-[10px] text-[var(--color-text-muted)] capitalize">
              ({trafficConfig.pattern})
            </span>
          </button>

          {/* Sampled indicator in Aggregate mode */}
          {activeMode === 'aggregate' && (
            <span className="text-[10px] text-[var(--color-text-faint)] hidden lg:inline">
              • 20 sampled/s
            </span>
          )}

          {/* Seed Input */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={seed}
              disabled={status === 'running'}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-14 h-7 px-1 rounded bg-[#18181b] border border-[#3f3f46] text-white font-mono text-[11px] outline-none text-center disabled:opacity-50"
            />
            <button
              type="button"
              disabled={status === 'running'}
              onClick={randomizeSeed}
              title="Generate random seed"
              className="h-7 px-1.5 rounded bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all disabled:opacity-50"
            >
              🎲
            </button>
          </div>

          <div className="h-5 w-px bg-[#27272a] mx-0.5" />

          {/* Event Log Toggle */}
          <button
            type="button"
            onClick={toggleEventLog}
            className={`h-8 px-2.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-1.5 ${
              isEventLogOpen
                ? 'bg-white text-black font-semibold border-white shadow-sm'
                : 'bg-[#18181b] hover:bg-[#222226] text-[var(--color-text-secondary)] hover:text-white border-[#3f3f46] hover:border-white'
            }`}
          >
            <span>📜</span>
            <span>Log</span>
          </button>
        </div>
      </footer>

      {/* Traffic Configuration Modal */}
      {isTrafficModalOpen && <TrafficModal />}
    </>
  );
};
