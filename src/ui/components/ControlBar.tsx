/**
 * Interactive Simulation Control Bar (Redesign).
 * Minimalist schematic bar at bottom (#2C2C2C, 45px height).
 * Font: Roboto Mono Medium 11px. Controls playback, scrub timeline, speed, RPS, and logs.
 * A9: Prioritized overflow into a "More" popover on tablet 768px so the bottom bar never clips.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  useSimulationStore,
  selectSimPlayStatus,
  selectSimSpeed,
  selectSimTimeMs,
  selectSimDurationMs,
  selectSimRps,
  selectSimSeed,
  selectIsEventLogOpen,
  selectVisualizationDisplayMode,
  SimulationSpeed,
} from '../../store/simulationStore';
import { useGraphStore, selectGraph, selectValidation } from '../../store/graphStore';
import { TrafficModal } from './TrafficModal';
import { formatRps } from '../../design/formatters';

export const ControlBar: React.FC = () => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const status = useSimulationStore(selectSimPlayStatus);
  const speed = useSimulationStore(selectSimSpeed);
  const simTimeMs = useSimulationStore(selectSimTimeMs);
  const durationMs = useSimulationStore(selectSimDurationMs);
  const rps = useSimulationStore(selectSimRps);
  const seed = useSimulationStore(selectSimSeed);
  const isEventLogOpen = useSimulationStore(selectIsEventLogOpen);
  const displayMode = useSimulationStore(selectVisualizationDisplayMode);
  const setDisplayMode = useSimulationStore((s) => s.setDisplayMode);

  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const step = useSimulationStore((s) => s.step);
  const reset = useSimulationStore((s) => s.reset);
  const seek = useSimulationStore((s) => s.seek);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  const randomizeSeed = useSimulationStore((s) => s.randomizeSeed);
  const toggleEventLog = useSimulationStore((s) => s.toggleEventLog);
  const tickFrame = useSimulationStore((s) => s.tickFrame);
  const openTrafficModal = useSimulationStore((s) => s.openTrafficModal);

  const graph = useGraphStore(selectGraph);
  const validation = useGraphStore(selectValidation);

  // Close "More" popover on outside click or Esc
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMoreOpen) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener('mousedown', handleOutside);
      window.addEventListener('keydown', handleKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isMoreOpen]);

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
        className="h-[45px] w-full px-3 md:px-5 flex items-center justify-between select-none z-30 font-mono text-[11px] border-t border-[#3A3A3E] shrink-0"
        style={{ backgroundColor: '#2C2C2C' }}
        aria-label="Simulation Control Bar"
      >
        {/* Left: Playback Controls & Speed */}
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePlayToggle}
            disabled={!validation.valid}
            title={!validation.valid ? `Cannot simulate: ${validation.errors[0]}` : 'Play / Pause simulation'}
            className={`
              h-7 px-3 rounded text-[11px] font-mono font-medium flex items-center justify-center transition-all cursor-pointer
              ${
                !validation.valid
                  ? 'bg-[#1F1F22] text-[#52525B] cursor-not-allowed'
                  : status === 'running'
                  ? 'bg-[#D9541E] text-white font-bold'
                  : 'bg-white text-black hover:bg-[#E4E4E7]'
              }
            `}
          >
            <span>{status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'}</span>
          </button>

          <button
            type="button"
            onClick={() => step(graph)}
            disabled={!validation.valid || status === 'running'}
            title="Step forward one tick"
            className="h-7 px-2 rounded bg-[#3A3A3E] hover:bg-[#48484E] text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            Step
          </button>

          <button
            type="button"
            onClick={() => reset(graph)}
            title="Reset simulation to t=0"
            className="h-7 px-2 rounded bg-[#3A3A3E] hover:bg-[#48484E] text-[#D4D4D4] hover:text-white transition-all cursor-pointer"
          >
            Reset
          </button>

          {/* Desktop-only speed toggles */}
          <div className="hidden xl:flex items-center bg-[#1E1E22] p-0.5 rounded border border-[#3A3A3E] ml-1">
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
        <div className="flex-1 max-w-xs md:max-w-sm mx-2 md:mx-4 flex items-center gap-2 shrink min-w-0">
          <span className="font-mono text-[10px] md:text-[11px] text-[#F3EEE3] w-10 md:w-12 text-right shrink-0">
            {Math.round(simTimeMs)}ms
          </span>

          <input
            type="range"
            min={0}
            max={durationMs}
            step={10}
            value={simTimeMs}
            onChange={(e) => seek(Number(e.target.value), graph)}
            className="flex-1 accent-white h-1 bg-[#1A1A1D] rounded appearance-none cursor-pointer min-w-0"
            aria-label="Simulation Time Slider"
          />

          <span className="font-mono text-[10px] md:text-[11px] text-[#8F96A3] w-10 md:w-12 shrink-0">
            {durationMs}ms
          </span>
        </div>

        {/* Right: Traffic, Display Mode, Seed & More Overflow Popover */}
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0 text-[11px] font-mono">
          {/* Traffic Modal Button (Always visible) */}
          <button
            type="button"
            onClick={openTrafficModal}
            title="Configure traffic rate and patterns"
            className="h-7 px-2.5 rounded bg-[#3A3A3E] hover:bg-[#48484E] text-[#F3EEE3] transition-all flex items-center gap-1 cursor-pointer"
          >
            <span>{formatRps(rps, false)}</span>
          </button>

          {/* Desktop-only direct buttons */}
          <div className="hidden lg:flex items-center gap-2">
            {/* Display Mode: Packets vs Flow */}
            <div className="flex items-center bg-[#1E1E22] p-0.5 rounded border border-[#3A3A3E]">
              <button
                type="button"
                onClick={() => setDisplayMode('individual')}
                className={`h-6 px-2 rounded text-[10px] font-mono transition-all ${
                  displayMode === 'individual' ? 'bg-[#656565] text-white font-bold' : 'text-[#8F96A3] hover:text-white'
                }`}
              >
                Packets
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('aggregate')}
                className={`h-6 px-2 rounded text-[10px] font-mono transition-all ${
                  displayMode === 'aggregate' ? 'bg-[#656565] text-white font-bold' : 'text-[#8F96A3] hover:text-white'
                }`}
              >
                Flow
              </button>
            </div>

            {/* Randomize Seed button */}
            <button
              type="button"
              onClick={randomizeSeed}
              title={`Current Seed: ${seed}. Click to randomize`}
              className="h-7 px-2 rounded bg-[#3A3A3E] hover:bg-[#48484E] text-[#F3EEE3] transition-all cursor-pointer"
            >
              Rnd
            </button>

            {/* Event Log button */}
            <button
              type="button"
              onClick={toggleEventLog}
              className={`h-7 px-2 rounded transition-all cursor-pointer ${
                isEventLogOpen
                  ? 'bg-[#F3EEE3] text-[#15181E] font-bold'
                  : 'bg-[#3A3A3E] hover:bg-[#48484E] text-[#F3EEE3]'
              }`}
            >
              Logs
            </button>
          </div>

          {/* Tablet & Narrow Screen "More ▾" Overflow Popover (A9) */}
          <div className="relative lg:hidden" ref={moreRef}>
            <button
              type="button"
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              className="h-7 px-2 rounded bg-[#3A3A3E] hover:bg-[#48484E] text-[#F3EEE3] transition-all flex items-center gap-1 cursor-pointer"
              aria-label="More simulation controls"
              aria-expanded={isMoreOpen}
            >
              <span>More</span>
              <span className="text-[9px]">▾</span>
            </button>

            {isMoreOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-56 bg-[#1B1E24] border border-[#2A2E39] rounded shadow-2xl p-3 text-xs space-y-2.5 z-50 font-mono animate-in fade-in duration-150">
                {/* Speed Controls */}
                <div>
                  <div className="text-[10px] text-[#8F96A3] mb-1">Sim Speed</div>
                  <div className="flex items-center gap-1 bg-[#15181E] p-0.5 rounded border border-[#2A2E39]">
                    {([1, 2, 4, 8] as SimulationSpeed[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSpeed(s);
                          setIsMoreOpen(false);
                        }}
                        className={`flex-1 py-1 rounded text-[10px] ${
                          speed === s ? 'bg-[#F3EEE3] text-[#15181E] font-bold' : 'text-[#8F96A3]'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Display Mode */}
                <div>
                  <div className="text-[10px] text-[#8F96A3] mb-1">Display Mode</div>
                  <div className="flex items-center gap-1 bg-[#15181E] p-0.5 rounded border border-[#2A2E39]">
                    <button
                      type="button"
                      onClick={() => {
                        setDisplayMode('individual');
                        setIsMoreOpen(false);
                      }}
                      className={`flex-1 py-1 rounded text-[10px] ${
                        displayMode === 'individual' ? 'bg-[#F3EEE3] text-[#15181E] font-bold' : 'text-[#8F96A3]'
                      }`}
                    >
                      Packets
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDisplayMode('aggregate');
                        setIsMoreOpen(false);
                      }}
                      className={`flex-1 py-1 rounded text-[10px] ${
                        displayMode === 'aggregate' ? 'bg-[#F3EEE3] text-[#15181E] font-bold' : 'text-[#8F96A3]'
                      }`}
                    >
                      Flow
                    </button>
                  </div>
                </div>

                <div className="h-px bg-[#2A2E39]" />

                {/* Randomize Seed & Logs */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      randomizeSeed();
                      setIsMoreOpen(false);
                    }}
                    className="flex-1 py-1 px-2 rounded bg-[#2A2E39] hover:bg-[#343A46] text-[#F3EEE3] text-[10px] text-center"
                  >
                    Rnd Seed
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      toggleEventLog();
                      setIsMoreOpen(false);
                    }}
                    className="flex-1 py-1 px-2 rounded bg-[#2A2E39] hover:bg-[#343A46] text-[#F3EEE3] text-[10px] text-center"
                  >
                    {isEventLogOpen ? 'Hide Logs' : 'Show Logs'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* Traffic Modal */}
      <TrafficModal />
    </>
  );
};

export default ControlBar;
