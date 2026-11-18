/**
 * Free-Floating Health Indicator & Unboxed Dropdown.
 * Section 5 Specification:
 * - Free-floating text in the canvas (no box, no border, no background) at top right.
 * - Status dot, status word, RPS, error percentage, caret.
 * - Clicking opens a similarly unboxed dropdown of details (overview metrics, health reason, link to full dashboard).
 * - Typography only, no cards.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useMetricsStore } from '../../store/metricsStore';
import {
  useSimulationStore,
  selectSimRps,
  selectSimCounters,
  selectRuntimeBottleneck,
} from '../../store/simulationStore';
import { useGraphStore, selectGraph } from '../../store/graphStore';
import { classifySystemHealth } from '../../engine/analysis/health';

export const HealthIndicator: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentRps = useSimulationStore(selectSimRps);
  const counters = useSimulationStore(selectSimCounters);
  const bottleneck = useSimulationStore(selectRuntimeBottleneck);
  const graph = useGraphStore(selectGraph);
  const setDashboardState = useMetricsStore((s) => s.setDashboardState);
  const getActiveSample = useMetricsStore((s) => s.getActiveSample);

  const activeSample = getActiveSample();
  const system = activeSample?.system;

  const health = system
    ? classifySystemHealth(system, graph, bottleneck)
    : { status: 'healthy' as const, reason: 'Awaiting simulation traffic...', details: [] };

  const totalErrors = counters.failed + counters.rejected + counters.timedOut;
  const totalReqs = counters.created;
  const errorPct = totalReqs > 0 ? Math.round((totalErrors / totalReqs) * 100) : 0;
  const isHealthy = health.status === 'healthy';

  const dotColor = isHealthy ? '#008604' : health.status === 'degraded' ? '#F59E0B' : '#D9541E';

  // Outside click & escape listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="absolute top-4 right-6 z-20 font-mono select-none" ref={dropdownRef}>
      {/* 1. Free-floating text trigger (no box, no border, no background) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Simulation Health Status & Telemetry (Click for details)"
        aria-label="Simulation Health Indicator"
        aria-expanded={isOpen}
        className="flex items-center gap-2 text-[11px] font-normal text-white hover:opacity-80 transition-opacity bg-transparent border-none p-0 cursor-pointer outline-none"
      >
        <span
          className="w-2 h-2 rounded-full inline-block shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <span className="capitalize">{health.status}</span>
        <span className="text-[#A1A1AA]">{currentRps.toLocaleString()} RPS</span>
        <span className={errorPct > 5 ? 'text-[#D9541E] font-semibold' : 'text-[#A1A1AA]'}>
          {errorPct}% err
        </span>
        <span className="text-[#71717A] text-[9px] ml-0.5">▾</span>
      </button>

      {/* 2. Unboxed Typographic Details Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-72 bg-[#0B0B0D]/95 border border-[#27272A] rounded-lg p-3.5 shadow-2xl text-xs space-y-2.5 backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-150"
          role="dialog"
          aria-label="System Health Overview"
        >
          {/* Header row */}
          <div className="flex items-center justify-between pb-1.5 border-b border-[#27272A]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: dotColor }} />
              <span className="font-bold text-[#F3EEE3] tracking-wide uppercase text-[11px]">
                System {health.status}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[#71717A] hover:text-white"
              aria-label="Close health details"
            >
              ✕
            </button>
          </div>

          {/* Health diagnosis reason */}
          <div className="text-[11px] text-[#A1A1AA] leading-relaxed">
            {health.reason}
          </div>

          {/* Key telemetry readout */}
          <div className="pt-1.5 border-t border-[#1E1E22] space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[#71717A]">Incoming Rate:</span>
              <span className="text-white font-medium">{currentRps.toLocaleString()} req/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717A]">Errors / Drops:</span>
              <span className={errorPct > 5 ? 'text-[#D9541E] font-semibold' : 'text-white'}>
                {errorPct}% ({totalErrors} failed)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717A]">In-Flight:</span>
              <span className="text-white font-medium">
                {system?.inFlightRequests ?? 0} requests
              </span>
            </div>
          </div>

          {/* Link to full metrics dashboard */}
          <div className="pt-2 border-t border-[#27272A]">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setDashboardState('expanded');
              }}
              className="text-[#D9541E] hover:underline font-semibold text-[11px] block transition-colors cursor-pointer"
            >
              Open full metrics dashboard →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthIndicator;
