/**
 * Interactive Simulation Control Bar (Redesign).
 * Minimalist schematic bar at bottom (#2C2C2C, 45px height).
 * Font: Roboto Mono Medium 11px. Controls playback, scrub timeline, speed, RPS, and logs.
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
  selectVisualizationDisplayMode,
  SimulationSpeed,
} from '../../store/simulationStore';
import { useGraphStore, selectGraph, selectValidation } from '../../store/graphStore';
import { TrafficModal } from './TrafficModal';
import { formatRps } from '../../design/formatters';

export const ControlBar: React.FC = () => {
  const status = useSimulationStore(selectSimPlayStatus);
  const speed = useSimulationStore(selectSimSpeed);
  const simTimeMs = useSimulationStore(selectSimTimeMs);
  const durationMs = useSimulationStore(selectSimDurationMs);
  const rps = useSimulationStore(selectSimRps);
  const seed = useSimulationStore(selectSimSeed);
  const isEventLogOpen = useSimulationStore(selectIsEventLogOpen);
  const trafficConfig = useSimulationStore(selectTrafficConfig);
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
        className="h-[45px] w-full px-5 flex items-center justify-between select-none z-30 font-mono text-[11px] border-t border-[#3A3A3E]"
        style={{ backgroundColor: '#2C2C2C' }}
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
              h-7 px-3 rounded text-[11px] font-mono font-medium flex items-center gap-1.5 transition-all
              ${
                !validation.valid
                  ? 'bg-[#1F1F22] text-[#52525B] cursor-not-allowed'
                  : status === 'running'
                  ? 'bg-[#D9541E] text-white font-bold'
                  : 'bg-white text-black hover:bg-[#E4E4E7]'
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
            className="h-7 px-2.5 rounded bg-[#3A3A3E] hover:bg-[#48484E] text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Step
          </button>

          <button
            type="button"
            onClick={() => reset(graph)}
            title="Reset simulation to t=0"
            className="h-7 px-2.5 rounded bg-[#3A3A3E] hover:bg-[#48484E] text-[#D4D4D4] hover:text-white transition-all"
          >
            Reset
          </button>

          <div className="h-4 w-px bg-[#44444A] mx-1" />

          {/* Speed Toggles: 1x, 2x, 4x, 8x */}
          <div className="flex items-center bg-[#1E1E22] p-0.5 rounded border border-[#3A3A3E]">
            {([1, 2, 4, 8] as SimulationSpeed[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`h-6 px-1.5 rounded text-[10px] font-mono transition-all ${
                  speed === s
                    ? 'bg-[#656565] text-white font-bold'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Center: Timeline Scrubber */}
        <div className="flex-1 max-w-sm mx-4 flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-white w-12 text-right">
            {Math.round(simTimeMs)}ms
          </span>

          <input
            type="range"
            min={0}
            max={durationMs}
            step={10}
            value={simTimeMs}
            onChange={(e) => seek(Number(e.target.value), graph)}
            className="flex-1 accent-white h-1 bg-[#1A1A1D] rounded appearance-none cursor-pointer"
          />

          <span className="font-mono text-[11px] text-[#A1A1AA] w-12">
            {durationMs}ms
          </span>
        </div>

        {/* Right: Traffic Config Button, Mode Badge, Volume indicator & Log Toggle */}
        <div className="flex items-center gap-2.5 text-[11px] font-mono">
          {/* Display Mode Toggle: Individual vs Flow */}
          <div
            className="flex items-center bg-[#1E1E22] p-0.5 rounded border border-[#3A3A3E]"
            role="group"
            aria-label="Visualization Mode"
          >
            <button
              type="button"
              onClick={() => setDisplayMode('individual')}
              title="Individual Requests: discrete packet circles"
              className={`h-6 px-2 rounded text-[10px] font-mono transition-all ${
                displayMode === 'individual'
                  ? 'bg-[#656565] text-white font-bold'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              Packets
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('aggregate')}
              title="Aggregate Flow: continuous particle stream"
              className={`h-6 px-2 rounded text-[10px] font-mono transition-all ${
                displayMode === 'aggregate'
                  ? 'bg-[#656565] text-white font-bold'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              Flow
            </button>
          </div>

          {/* Traffic Modal Button with current traffic summary */}
          <button
            type="button"
            onClick={openTrafficModal}
            title="Configure traffic rate, patterns, and execution mode"
            className="h-7 px-2.5 rounded bg-[#3A3A3E] hover:bg-[#48484E] text-white transition-all flex items-center gap-1.5"
          >
            <span>{formatRps(rps, false)}</span>
            <span className="text-[10px] text-[#A1A1AA] capitalize">
              ({trafficConfig.pattern})
            </span>
          </button>

          {/* Seed Input */}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              title="Simulation deterministic PRNG Seed"
              placeholder="Seed"
              className="w-16 h-7 px-1.5 bg-[#1A1A1D] border border-[#3A3A3E] text-white rounded text-[10px] font-mono focus:border-white focus:outline-none"
            />
            <button
              type="button"
              onClick={randomizeSeed}
              title="Generate new random seed"
              className="w-7 h-7 bg-[#3A3A3E] hover:bg-[#48484E] text-white rounded flex items-center justify-center text-xs"
            >
              🎲
            </button>
          </div>

          {/* Event Log Drawer Button */}
          <button
            type="button"
            onClick={toggleEventLog}
            title={isEventLogOpen ? 'Close Event Log' : 'Open Event Log'}
            className={`h-7 px-2.5 rounded transition-all ${
              isEventLogOpen
                ? 'bg-[#D9541E] text-white font-bold'
                : 'bg-[#3A3A3E] hover:bg-[#48484E] text-white'
            }`}
          >
            Log
          </button>
        </div>
      </footer>

      {/* Traffic Configuration Modal */}
      <TrafficModal />
    </>
  );
};

export default ControlBar;
