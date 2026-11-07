/**
 * Interactive Request Waterfall & Trace Drawer.
 * Visualizes per-hop spans on a time axis, plain-language routing decisions,
 * and failure diagnoses for inspected or tracked requests.
 */

import React, { useEffect } from 'react';
import {
  useSimulationStore,
  selectRequestTrace,
  selectIsTraceDrawerOpen,
  selectFollowTrackedPacket,
} from '../../store/simulationStore';

export const RequestTraceDrawer: React.FC = () => {
  const isOpen = useSimulationStore(selectIsTraceDrawerOpen);
  const trace = useSimulationStore(selectRequestTrace);
  const follow = useSimulationStore(selectFollowTrackedPacket);
  const setFollow = useSimulationStore((s) => s.setFollowTrackedPacket);
  const clearTrace = useSimulationStore((s) => s.clearTrace);
  const traceNextRequest = useSimulationStore((s) => s.traceNextRequest);
  const isTracingNext = useSimulationStore((s) => s.isTracingNextRequest);

  // Clear tracking on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        clearTrace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, clearTrace]);

  if (!isOpen) return null;

  const totalDuration = trace ? Math.max(1, trace.totalDurationMs) : 100;
  const spans = trace?.spans ?? [];
  const decisions = trace?.decisions ?? [];

  return (
    <div
      className="absolute bottom-16 left-80 right-80 z-30 bg-[#111113]/95 backdrop-blur-md border border-[#3f3f46] rounded-t-2xl shadow-2xl flex flex-col max-h-96 select-none animate-in slide-in-from-bottom duration-200"
      role="region"
      aria-label="Request Trace Waterfall"
    >
      {/* Drawer Header */}
      <div className="px-5 py-3 border-b border-[#27272a] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm">🔍</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Request Trace: {trace?.requestId ?? (isTracingNext ? 'Waiting for next request...' : 'None')}
              </h3>
              {trace && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                    trace.outcome === 'succeeded'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : trace.outcome === 'rejected'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {trace.statusCode} {trace.outcome}
                </span>
              )}
              {trace?.isSampled && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-white/80 border border-white/20">
                  Sampled Request
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-[var(--color-text-secondary)] mt-0.5">
              {trace?.summaryLine ?? 'Trace is waiting for an incoming packet event.'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={traceNextRequest}
            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-all ${
              isTracingNext
                ? 'bg-white text-black font-bold border-white shadow-sm'
                : 'bg-[#18181b] hover:bg-[#222226] text-white border-[#3f3f46] hover:border-white'
            }`}
          >
            {isTracingNext ? '⏳ Arming Next...' : '⚡ Trace Next'}
          </button>

          {trace && (
            <button
              type="button"
              onClick={() => setFollow(!follow)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-all ${
                follow
                  ? 'bg-white text-black font-bold border-white'
                  : 'bg-[#18181b] hover:bg-[#222226] text-[var(--color-text-secondary)] hover:text-white border-[#3f3f46]'
              }`}
            >
              {follow ? '🎯 Following' : 'Follow'}
            </button>
          )}

          <button
            type="button"
            onClick={clearTrace}
            className="w-7 h-7 rounded-lg bg-[#18181b] hover:bg-[#222226] text-[var(--color-text-muted)] hover:text-white flex items-center justify-center text-xs transition-colors"
            title="Clear and close trace (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 space-y-4 overflow-y-auto max-h-72">
        {trace?.isSampled && (
          <div className="p-2.5 bg-white/5 border border-white/10 rounded-lg text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            ℹ️ <span className="text-white font-medium">Sampled Request Tracing:</span> Under high-concurrency aggregate mode, full tracing is attached to sampled requests (20 req/s) derived directly from system fluid state to preserve high browser rendering performance.
          </div>
        )}

        {/* Waterfall Timeline Spans */}
        {spans.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-text-faint)] uppercase tracking-wider px-1">
              <span>Hop / Operation</span>
              <span>Timeline (0ms → {Math.round(totalDuration)}ms)</span>
            </div>

            <div className="space-y-1 bg-[#0b0b0d] p-3 rounded-xl border border-[#222226]">
              {spans.map((span) => {
                const baseStart = trace?.startTimeMs ?? span.startTimeMs;
                const startRel = Math.max(0, span.startTimeMs - baseStart);
                const leftPercent = Math.min(95, (startRel / totalDuration) * 100);
                const widthPercent = Math.max(2, Math.min(100 - leftPercent, (span.durationMs / totalDuration) * 100));

                const isQueue = span.kind === 'queue';
                const isDatabase = span.kind === 'database';
                const isNetwork = span.kind === 'network';

                return (
                  <div key={span.id} className="flex items-center text-xs font-mono py-0.5">
                    <div className="w-40 shrink-0 truncate text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isQueue
                            ? 'bg-amber-400'
                            : isDatabase
                            ? 'bg-cyan-400'
                            : isNetwork
                            ? 'bg-[#71717a]'
                            : 'bg-white'
                        }`}
                      />
                      <span className="truncate">{span.nodeLabel}</span>
                    </div>

                    <div className="flex-1 h-5 bg-[#141417] rounded relative overflow-hidden mx-2 border border-[#1f1f23]">
                      <div
                        className={`absolute top-0 bottom-0 rounded transition-all flex items-center px-1.5 text-[9px] font-bold ${
                          isQueue
                            ? 'bg-amber-500/30 text-amber-200 border border-amber-500/50'
                            : isDatabase
                            ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-500/50'
                            : isNetwork
                            ? 'bg-white/10 text-[#a1a1aa] border border-white/20'
                            : 'bg-white/25 text-white border border-white/40'
                        }`}
                        style={{
                          left: `${leftPercent.toFixed(1)}%`,
                          width: `${widthPercent.toFixed(1)}%`,
                        }}
                      >
                        {span.durationMs > 2 && `${Math.round(span.durationMs)}ms`}
                      </div>
                    </div>

                    <div className="w-16 text-right shrink-0 text-[10px] text-[var(--color-text-muted)]">
                      {Math.round(span.durationMs)} ms
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Architectural Decisions & Event Log */}
        {decisions.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-faint)] block px-1">
              Architectural Decisions & Routing
            </span>
            <div className="space-y-1">
              {decisions.map((dec) => (
                <div
                  key={dec.id}
                  className="p-2 rounded-lg bg-[#18181b] border border-[#27272a] text-xs font-mono text-[var(--color-text-secondary)] flex items-start gap-2"
                >
                  <span className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                    {dec.timestampMs.toFixed(1)}ms
                  </span>
                  <span className="text-white">▸</span>
                  <span className="flex-1 leading-relaxed">{dec.summary}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
