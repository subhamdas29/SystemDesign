/**
 * Interactive Time-Series Charts Dashboard Tab.
 * Renders 4 synchronized monochrome-first SVG charts (Traffic, Latency, Utilization, Queues)
 * with hover crosshair, shared time cursor, seek-on-click, and event markers.
 */

import React, { useState, useMemo } from 'react';
import {
  useMetricsStore,
  selectMetricsSamples,
  selectChartsTimeWindow,
} from '../../store/metricsStore';
import { useSimulationStore, selectSimTimeMs } from '../../store/simulationStore';
import { useGraphStore, selectGraph } from '../../store/graphStore';
import { buildChartViewModel } from './chartViewModel';
import { ClientConfig } from '../../types';

export const ChartsTab: React.FC = () => {
  const samples = useMetricsStore(selectMetricsSamples);
  const timeWindow = useMetricsStore(selectChartsTimeWindow);
  const setTimeWindow = useMetricsStore((s) => s.setChartsTimeWindow);
  const setTimeTravelTime = useMetricsStore((s) => s.setTimeTravelTime);

  const simTimeMs = useSimulationStore(selectSimTimeMs);
  const seek = useSimulationStore((s) => s.seek);
  const graph = useGraphStore(selectGraph);

  const clientConfig = graph.nodes.find((n) => n.type === 'client')?.config as ClientConfig | undefined;
  const clientTimeoutMs = clientConfig?.requestTimeoutMs ?? 5000;

  // Hover state for interactive crosshair across all 4 charts
  const [hoveredTimeMs, setHoveredTimeMs] = useState<number | null>(null);

  const chartData = useMemo(() => {
    return buildChartViewModel(samples, timeWindow, simTimeMs, clientTimeoutMs);
  }, [samples, timeWindow, simTimeMs, clientTimeoutMs]);

  const { minMs, maxMs } = chartData.timeRange;
  const durationMs = Math.max(1, maxMs - minMs);

  // SVG dimensions
  const svgWidth = 640;
  const svgHeight = 120;
  const padding = { top: 16, right: 16, bottom: 22, left: 45 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  const getX = (t: number) => padding.left + Math.max(0, Math.min(plotWidth, ((t - minMs) / durationMs) * plotWidth));
  const getY = (val: number, maxVal: number) => padding.top + plotHeight - Math.max(0, Math.min(plotHeight, (val / Math.max(1, maxVal)) * plotHeight));

  const formatSec = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Click on chart -> seek simulation to that point
  const handleChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const relX = Math.max(0, Math.min(plotWidth, clickX - padding.left));
    const targetTimeMs = Math.round(minMs + (relX / plotWidth) * durationMs);
    seek(targetTimeMs, graph);
    setTimeTravelTime(targetTimeMs);
  };

  // Mouse move -> update crosshair & historical inspection
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const relX = Math.max(0, Math.min(plotWidth, mouseX - padding.left));
    const targetTimeMs = Math.round(minMs + (relX / plotWidth) * durationMs);
    setHoveredTimeMs(targetTimeMs);
    setTimeTravelTime(targetTimeMs);
  };

  const handleMouseLeave = () => {
    setHoveredTimeMs(null);
  };

  // Traffic series bounds
  const maxTraffic = useMemo(() => {
    return Math.max(10, ...chartData.trafficSeries.map((p) => Math.max(p.incomingRps, p.successfulRps, p.errorRps)));
  }, [chartData.trafficSeries]);

  // Latency series bounds
  const maxLatency = useMemo(() => {
    return Math.max(clientTimeoutMs, ...chartData.latencySeries.map((p) => Math.max(p.p99Ms, p.p95Ms)));
  }, [chartData.latencySeries, clientTimeoutMs]);

  // Retry traffic & amplification bounds
  const maxRetryTraffic = useMemo(() => {
    return Math.max(10, ...chartData.retrySeries.map((p) => Math.max(p.incomingRps, p.retryRps)));
  }, [chartData.retrySeries]);

  const maxAmplification = useMemo(() => {
    return Math.max(2.0, ...chartData.retrySeries.map((p) => p.amplificationFactor));
  }, [chartData.retrySeries]);

  // Current simulation time cursor X position
  const simCursorX = getX(simTimeMs);
  const hoverCursorX = hoveredTimeMs !== null ? getX(hoveredTimeMs) : null;

  return (
    <div className="space-y-4 font-mono select-none" role="tabpanel" aria-label="Simulation Time-Series Charts">
      {/* Header Controls & Accessible Summary */}
      <div className="flex items-center justify-between pb-2 border-b border-[#27272a]">
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          Click timeline to seek • Hover for crosshair inspect
        </div>

        {/* Window Selector */}
        <div className="flex items-center gap-1 bg-[#0b0b0d] p-0.5 rounded-lg border border-[#27272a]">
          <button
            type="button"
            onClick={() => setTimeWindow('60s')}
            className={`h-6 px-2.5 rounded text-[10px] transition-all ${
              timeWindow === '60s' ? 'bg-[#222226] text-white font-bold border border-white/20' : 'text-[var(--color-text-muted)] hover:text-white'
            }`}
          >
            Last 60s
          </button>
          <button
            type="button"
            onClick={() => setTimeWindow('all')}
            className={`h-6 px-2.5 rounded text-[10px] transition-all ${
              timeWindow === 'all' ? 'bg-[#222226] text-white font-bold border border-white/20' : 'text-[var(--color-text-muted)] hover:text-white'
            }`}
          >
            Full Run
          </button>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {chartData.accessibleSummary}
      </div>

      {/* 1. Traffic Chart */}
      <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white tracking-wide uppercase text-[11px]">
            1. Traffic Throughput (RPS)
          </span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-white">
              <span className="w-2.5 h-0.5 bg-white inline-block" /> Incoming
            </span>
            <span className="flex items-center gap-1 text-[var(--color-text-secondary)]">
              <span className="w-2.5 h-0.5 bg-[#a1a1aa] border-t border-dashed border-[#a1a1aa] inline-block" /> Processed (200)
            </span>
            <span className="flex items-center gap-1 text-amber-300">
              <span className="w-2.5 h-0.5 bg-amber-400 border-t border-dotted border-amber-400 inline-block" /> Rejections / Errors
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-28 cursor-crosshair overflow-visible"
          onClick={handleChartClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label="Traffic Throughput Chart"
        >
          {/* Grid lines */}
          <line x1={padding.left} y1={padding.top} x2={svgWidth - padding.right} y2={padding.top} stroke="#222226" strokeWidth={1} />
          <line x1={padding.left} y1={padding.top + plotHeight / 2} x2={svgWidth - padding.right} y2={padding.top + plotHeight / 2} stroke="#222226" strokeWidth={1} strokeDasharray="2,2" />
          <line x1={padding.left} y1={padding.top + plotHeight} x2={svgWidth - padding.right} y2={padding.top + plotHeight} stroke="#333338" strokeWidth={1} />

          {/* Y-Axis Labels */}
          <text x={padding.left - 6} y={padding.top + 4} fill="#71717a" fontSize={9} textAnchor="end">
            {maxTraffic.toLocaleString()}
          </text>
          <text x={padding.left - 6} y={padding.top + plotHeight / 2 + 3} fill="#71717a" fontSize={9} textAnchor="end">
            {Math.round(maxTraffic / 2).toLocaleString()}
          </text>
          <text x={padding.left - 6} y={padding.top + plotHeight} fill="#71717a" fontSize={9} textAnchor="end">
            0
          </text>

          {/* Incoming Line (Solid White) */}
          {chartData.trafficSeries.length > 1 && (
            <path
              d={chartData.trafficSeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.incomingRps, maxTraffic).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.8}
            />
          )}

          {/* Processed Line (Dashed Silver) */}
          {chartData.trafficSeries.length > 1 && (
            <path
              d={chartData.trafficSeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.successfulRps, maxTraffic).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#d4d4d8"
              strokeWidth={1.4}
              strokeDasharray="4,3"
            />
          )}

          {/* Errors Line (Dotted Amber/Light Grey) */}
          {chartData.trafficSeries.length > 1 && (
            <path
              d={chartData.trafficSeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.errorRps, maxTraffic).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1.4}
              strokeDasharray="2,2"
            />
          )}

          {/* Live Simulation Time Cursor */}
          <line x1={simCursorX} y1={padding.top} x2={simCursorX} y2={padding.top + plotHeight} stroke="#ffffff" strokeWidth={1.5} />

          {/* Hover Crosshair */}
          {hoverCursorX !== null && (
            <line x1={hoverCursorX} y1={padding.top} x2={hoverCursorX} y2={padding.top + plotHeight} stroke="#a1a1aa" strokeWidth={1} strokeDasharray="3,3" />
          )}
        </svg>
      </div>

      {/* 2. Latency Chart */}
      <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white tracking-wide uppercase text-[11px]">
            2. Latency Percentiles (ms)
          </span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-white">
              <span className="w-2.5 h-0.5 bg-white inline-block" /> Avg
            </span>
            <span className="flex items-center gap-1 text-[var(--color-text-secondary)]">
              <span className="w-2.5 h-0.5 bg-[#d4d4d8] border-t border-dashed border-[#d4d4d8] inline-block" /> P95
            </span>
            <span className="flex items-center gap-1 text-white">
              <span className="w-2.5 h-0.5 bg-white border-t border-dotted border-white inline-block" /> P99
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2.5 h-0.5 bg-rose-400 border-t border-dashed border-rose-400 inline-block" /> Timeout ({clientTimeoutMs}ms)
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-28 cursor-crosshair overflow-visible"
          onClick={handleChartClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label="Latency Chart"
        >
          {/* Timeout Reference Line */}
          <line
            x1={padding.left}
            y1={getY(clientTimeoutMs, maxLatency)}
            x2={svgWidth - padding.right}
            y2={getY(clientTimeoutMs, maxLatency)}
            stroke="#f43f5e"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          <text x={svgWidth - padding.right} y={getY(clientTimeoutMs, maxLatency) - 3} fill="#f43f5e" fontSize={8} textAnchor="end">
            Timeout: {clientTimeoutMs}ms
          </text>

          {/* Average Line */}
          {chartData.latencySeries.length > 1 && (
            <path
              d={chartData.latencySeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.avgMs, maxLatency).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.6}
            />
          )}

          {/* P95 Line (Dashed) */}
          {chartData.latencySeries.length > 1 && (
            <path
              d={chartData.latencySeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.p95Ms, maxLatency).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#d4d4d8"
              strokeWidth={1.4}
              strokeDasharray="4,3"
            />
          )}

          {/* P99 Line (Dotted) */}
          {chartData.latencySeries.length > 1 && (
            <path
              d={chartData.latencySeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.p99Ms, maxLatency).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.4}
              strokeDasharray="2,2"
            />
          )}

          <line x1={simCursorX} y1={padding.top} x2={simCursorX} y2={padding.top + plotHeight} stroke="#ffffff" strokeWidth={1.5} />
          {hoverCursorX !== null && (
            <line x1={hoverCursorX} y1={padding.top} x2={hoverCursorX} y2={padding.top + plotHeight} stroke="#a1a1aa" strokeWidth={1} strokeDasharray="3,3" />
          )}
        </svg>
      </div>

      {/* 3. Utilization Chart */}
      <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white tracking-wide uppercase text-[11px]">
            3. Component Utilization (%)
          </span>
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <span>Bands: 70% Warning • 90% Overload</span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-28 cursor-crosshair overflow-visible"
          onClick={handleChartClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label="Component Utilization Chart"
        >
          {/* 70% and 90% Reference Bands */}
          <rect x={padding.left} y={getY(90, 100)} width={plotWidth} height={plotHeight * 0.2} fill="rgba(255,255,255,0.04)" />
          <line x1={padding.left} y1={getY(70, 100)} x2={svgWidth - padding.right} y2={getY(70, 100)} stroke="#3f3f46" strokeWidth={1} strokeDasharray="3,3" />
          <line x1={padding.left} y1={getY(90, 100)} x2={svgWidth - padding.right} y2={getY(90, 100)} stroke="#52525b" strokeWidth={1} strokeDasharray="3,3" />

          {/* Node Utilization Lines */}
          {chartData.topNodes.map((nodeId, idx) => {
            const dashPatterns = ['none', '4,3', '2,2', '6,3', '1,2'];
            const strokeDash = dashPatterns[idx % dashPatterns.length];
            return (
              <path
                key={nodeId}
                d={chartData.utilizationSeries
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.nodes[nodeId] ?? 0, 100).toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke={idx === 0 ? '#ffffff' : '#a1a1aa'}
                strokeWidth={1.5}
                strokeDasharray={strokeDash}
              />
            );
          })}

          <line x1={simCursorX} y1={padding.top} x2={simCursorX} y2={padding.top + plotHeight} stroke="#ffffff" strokeWidth={1.5} />
          {hoverCursorX !== null && (
            <line x1={hoverCursorX} y1={padding.top} x2={hoverCursorX} y2={padding.top + plotHeight} stroke="#a1a1aa" strokeWidth={1} strokeDasharray="3,3" />
          )}
        </svg>
      </div>

      {/* 4. Queues Chart */}
      <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white tracking-wide uppercase text-[11px]">
            4. Component Queues (Depth vs Limit)
          </span>
          <span className="text-[10px] text-[var(--color-text-faint)]">
            Timeline: {formatSec(minMs)} → {formatSec(maxMs)}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-28 cursor-crosshair overflow-visible"
          onClick={handleChartClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label="Component Queue Chart"
        >
          {chartData.topNodes.map((nodeId, idx) => {
            const maxQueue = Math.max(10, ...chartData.queueSeries.map((q) => q.nodes[nodeId]?.limit ?? 100));
            return (
              <path
                key={nodeId}
                d={chartData.queueSeries
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.nodes[nodeId]?.queue ?? 0, maxQueue).toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke={idx === 0 ? '#ffffff' : '#d4d4d8'}
                strokeWidth={1.4}
                strokeDasharray={idx % 2 === 0 ? 'none' : '3,3'}
              />
            );
          })}

          <line x1={simCursorX} y1={padding.top} x2={simCursorX} y2={padding.top + plotHeight} stroke="#ffffff" strokeWidth={1.5} />
          {hoverCursorX !== null && (
            <line x1={hoverCursorX} y1={padding.top} x2={hoverCursorX} y2={padding.top + plotHeight} stroke="#a1a1aa" strokeWidth={1} strokeDasharray="3,3" />
          )}
        </svg>
      </div>

      {/* 5. Retries & Load Amplification Chart */}
      <div className="p-3 rounded-xl bg-[#111113] border border-[#27272a] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white tracking-wide uppercase text-[11px]">
            5. Retries & Load Amplification
          </span>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-white">
              <span className="w-2.5 h-0.5 bg-white inline-block" /> Incoming
            </span>
            <span className="flex items-center gap-1 text-amber-300">
              <span className="w-2.5 h-0.5 bg-amber-400 inline-block border-b border-dashed border-amber-400" /> Retries (RPS)
            </span>
            <span className="flex items-center gap-1 text-rose-300">
              <span className="w-2.5 h-0.5 bg-rose-500 inline-block" /> Amplification (x)
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-28 cursor-crosshair overflow-visible"
          onClick={handleChartClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label="Retries and Load Amplification Chart"
        >
          {/* Incoming Baseline Line */}
          {chartData.retrySeries.length > 1 && (
            <path
              d={chartData.retrySeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.incomingRps, maxRetryTraffic).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.4}
            />
          )}

          {/* Retry Traffic Line (Amber dashed) */}
          {chartData.retrySeries.length > 1 && (
            <path
              d={chartData.retrySeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.retryRps, maxRetryTraffic).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1.5}
              strokeDasharray="4,3"
            />
          )}

          {/* Amplification Factor Line (Rose dotted) */}
          {chartData.retrySeries.length > 1 && (
            <path
              d={chartData.retrySeries
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.timeMs).toFixed(1)} ${getY(p.amplificationFactor, maxAmplification).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="#f43f5e"
              strokeWidth={1.6}
              strokeDasharray="2,2"
            />
          )}

          {/* 1.0x baseline reference */}
          <line
            x1={padding.left}
            y1={getY(1.0, maxAmplification)}
            x2={svgWidth - padding.right}
            y2={getY(1.0, maxAmplification)}
            stroke="#52525b"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
          <text x={svgWidth - padding.right} y={getY(1.0, maxAmplification) - 3} fill="#71717a" fontSize={8} textAnchor="end">
            1.0x (No amplification)
          </text>

          <line x1={simCursorX} y1={padding.top} x2={simCursorX} y2={padding.top + plotHeight} stroke="#ffffff" strokeWidth={1.5} />
          {hoverCursorX !== null && (
            <line x1={hoverCursorX} y1={padding.top} x2={hoverCursorX} y2={padding.top + plotHeight} stroke="#a1a1aa" strokeWidth={1} strokeDasharray="3,3" />
          )}
        </svg>
      </div>
    </div>
  );
};
