/**
 * Collapsible event log drawer.
 * Displays monotonically ordered simulation events in JetBrains Mono with
 * event type and request ID filtering, plus click-to-highlight path tracing.
 */

import React, { useState, useMemo } from 'react';
import {
  useSimulationStore,
  selectSimRecentEvents,
  selectIsEventLogOpen,
  selectSelectedEventRequestId,
  selectIsTracingNextRequest,
} from '../../store';
import { useGraphStore, selectGraph } from '../../store/graphStore';

export const EventLogPanel: React.FC = () => {
  const isOpen = useSimulationStore(selectIsEventLogOpen);
  const toggleOpen = useSimulationStore((s) => s.toggleEventLog);
  const events = useSimulationStore(selectSimRecentEvents);
  const selectedReqId = useSimulationStore(selectSelectedEventRequestId);
  const selectEventReqId = useSimulationStore((s) => s.selectEventRequestId);
  const traceNextRequest = useSimulationStore((s) => s.traceNextRequest);
  const isTracingNext = useSimulationStore(selectIsTracingNextRequest);
  const graph = useGraphStore(selectGraph);

  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [nodeFilter, setNodeFilter] = useState<string>('ALL');
  const [searchReqId, setSearchReqId] = useState<string>('');

  // Map request outcomes for fast filtering
  const requestOutcomeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of events) {
      if (ev.type === 'REQUEST_REJECTED') {
        map.set(ev.requestId, 'rejected');
      } else if (ev.type === 'REQUEST_TIMED_OUT') {
        map.set(ev.requestId, 'timed-out');
      } else if (ev.type === 'REQUEST_FAILED') {
        map.set(ev.requestId, 'failed');
      } else if (ev.type === 'RESPONSE_RECEIVED' && !map.has(ev.requestId)) {
        map.set(ev.requestId, 'succeeded');
      }
    }
    return map;
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const matchType = typeFilter === 'ALL' || ev.type === typeFilter;
      const matchReq =
        !searchReqId || ev.requestId.toLowerCase().includes(searchReqId.toLowerCase());
      const matchNode =
        nodeFilter === 'ALL' || ev.nodeId === nodeFilter || ev.targetNodeId === nodeFilter;
      let matchOutcome = true;
      if (outcomeFilter !== 'ALL') {
        const reqOutcome = requestOutcomeMap.get(ev.requestId);
        matchOutcome = reqOutcome === outcomeFilter;
      }
      return matchType && matchReq && matchNode && matchOutcome;
    });
  }, [events, typeFilter, searchReqId, nodeFilter, outcomeFilter, requestOutcomeMap]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute bottom-14 left-80 right-80 z-20 bg-[#111113]/95 backdrop-blur-md border-t border-x border-[#3f3f46] rounded-t-xl shadow-2xl flex flex-col h-64 select-none animate-in slide-in-from-bottom duration-200"
      aria-label="Simulation Event Log"
    >
      {/* Drawer Header */}
      <div className="h-10 px-4 border-b border-[#27272a] flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white tracking-wide uppercase text-[11px]">
            Live Event Stream
          </span>
          <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
            ({filteredEvents.length} events)
          </span>

          <button
            type="button"
            onClick={traceNextRequest}
            title="Arm tracer to capture next incoming request"
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all flex items-center gap-1 ${
              isTracingNext
                ? 'bg-white text-black font-bold border-white'
                : 'bg-[#18181b] hover:bg-[#222226] text-white border-[#3f3f46]'
            }`}
          >
            <span>⚡</span>
            <span>{isTracingNext ? 'Arming...' : 'Trace Next'}</span>
          </button>

          {selectedReqId && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/10 border border-white/20 text-[10px] font-mono text-white">
              <span>Tracing: {selectedReqId}</span>
              <button
                type="button"
                onClick={() => selectEventReqId(null)}
                className="hover:text-amber-300 ml-1"
                title="Clear trace"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          {/* Node Filter */}
          <select
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            className="h-6 px-1.5 rounded bg-[#18181b] border border-[#3f3f46] text-white font-mono text-[10px] outline-none max-w-28"
            title="Filter by Component"
          >
            <option value="ALL">All Nodes</option>
            {graph.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label || n.id}
              </option>
            ))}
          </select>

          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="h-6 px-1.5 rounded bg-[#18181b] border border-[#3f3f46] text-white font-mono text-[10px] outline-none"
            title="Filter by Outcome"
          >
            <option value="ALL">All Outcomes</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="rejected">Rejected</option>
            <option value="timed-out">Timed Out</option>
          </select>

          {/* Event Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-6 px-1.5 rounded bg-[#18181b] border border-[#3f3f46] text-white font-mono text-[10px] outline-none"
            title="Filter by Event Type"
          >
            <option value="ALL">All Types</option>
            <option value="REQUEST_CREATED">REQUEST_CREATED</option>
            <option value="DNS_LOOKUP">DNS_LOOKUP</option>
            <option value="REQUEST_RECEIVED">REQUEST_RECEIVED</option>
            <option value="REQUEST_QUEUED">REQUEST_QUEUED</option>
            <option value="REQUEST_PROCESSING_STARTED">PROCESSING_STARTED</option>
            <option value="LOAD_BALANCED">LOAD_BALANCED</option>
            <option value="CACHE_HIT">CACHE_HIT</option>
            <option value="CACHE_MISS">CACHE_MISS</option>
            <option value="DATABASE_QUERY">DATABASE_QUERY</option>
            <option value="REQUEST_REJECTED">REQUEST_REJECTED</option>
            <option value="REQUEST_TIMED_OUT">REQUEST_TIMED_OUT</option>
            <option value="REQUEST_FAILED">REQUEST_FAILED</option>
            <option value="RESPONSE_RECEIVED">RESPONSE_RECEIVED</option>
          </select>

          {/* Request ID Filter */}
          <input
            type="text"
            placeholder="Req ID..."
            value={searchReqId}
            onChange={(e) => setSearchReqId(e.target.value)}
            className="h-6 px-2 rounded bg-[#18181b] border border-[#3f3f46] text-white font-mono text-[10px] outline-none w-20 placeholder:text-[#71717a]"
          />

          <button
            type="button"
            onClick={toggleOpen}
            className="text-xs text-[var(--color-text-muted)] hover:text-white px-2 py-0.5 rounded hover:bg-white/10"
            title="Close event log"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-1">
        {filteredEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--color-text-faint)] text-xs">
            No events match the selected filters.
          </div>
        ) : (
          filteredEvents.map((ev) => {
            const isSelected = selectedReqId === ev.requestId;
            const isError =
              ev.type === 'REQUEST_REJECTED' ||
              ev.type === 'REQUEST_FAILED' ||
              ev.type === 'REQUEST_TIMED_OUT';
            const isSuccess = ev.type === 'RESPONSE_RECEIVED';
            const isCache = ev.type === 'CACHE_HIT';

            return (
              <div
                key={ev.id}
                onClick={() => selectEventReqId(ev.requestId, graph)}
                className={`
                  px-2.5 py-1 rounded cursor-pointer transition-colors flex items-center gap-2 border
                  ${
                    isSelected
                      ? 'bg-white/15 border-white text-white font-semibold'
                      : isError
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-200 hover:bg-amber-950/30'
                      : isSuccess
                      ? 'bg-white/5 border-white/20 text-[#f4f4f5] hover:bg-white/10'
                      : isCache
                      ? 'bg-white/5 border-white/15 text-[var(--color-text-secondary)] hover:bg-white/10'
                      : 'bg-[#141417] border-transparent text-[var(--color-text-muted)] hover:bg-[#18181b]'
                  }
                `}
              >
                <span className="text-[10px] text-[var(--color-text-faint)] w-14 shrink-0">
                  {ev.timestamp.toFixed(1)}ms
                </span>

                <span
                  className={`px-1 rounded text-[9px] uppercase tracking-wider shrink-0 ${
                    isError
                      ? 'bg-amber-500/20 text-amber-300'
                      : isSuccess
                      ? 'bg-white/20 text-white'
                      : 'bg-white/10 text-[var(--color-text-secondary)]'
                  }`}
                >
                  {ev.type}
                </span>

                <span className="text-[10px] text-white/80 shrink-0">{ev.requestId}</span>

                <span className="text-[10px] text-[var(--color-text-faint)] shrink-0">
                  @{ev.nodeId}
                </span>

                {ev.targetNodeId && (
                  <span className="text-[10px] text-white/60 shrink-0">
                    → {ev.targetNodeId}
                  </span>
                )}

                {ev.details && (
                  <span className="text-[10px] text-[var(--color-text-faint)] truncate ml-auto">
                    {JSON.stringify(ev.details)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
