import React, { memo } from 'react';
import { Handle, Position, NodeProps, useViewport } from '@xyflow/react';
import { GraphNode, ComponentType } from '@types';
import { COMPONENT_RULES } from '@builder';
import { ComponentIcon } from '../components/ComponentIcon';
import { useUiStore, selectSelectedNodeId, selectDraggingSwapNodeId } from '@store';
import { useGraphStore, selectGraph } from '@store';
import {
  useSimulationStore,
  selectHighlightedPath,
  selectRuntimeBottleneck,
  selectStaticCapacity,
  selectActiveFailures,
} from '@store';
import { canSwap } from '@builder';

export interface CustomNodeData extends GraphNode {
  isStarter?: boolean;
}

function getNodeSummaryBadge(type: ComponentType, config: unknown): string {
  if (!config) return '';
  const c = config as Record<string, unknown>;
  switch (type) {
    case 'client':
      return `${c.rps ?? 500} rps`;
    case 'dns':
      return `${c.cacheHitRatio ?? 90}% hit`;
    case 'router':
      return `${c.capacityRps ? Number(c.capacityRps).toLocaleString() : '50k'} rps`;
    case 'load-balancer':
      return String(c.algorithm ?? 'round-robin');
    case 'app-server':
      return `${c.maxThroughputRps ?? 1000} rps`;
    case 'cache':
      return `${c.hitRatio ?? 85}% hit`;
    case 'database': {
      const dbCfg = c as Record<string, unknown>;
      if (dbCfg.shardCount && Number(dbCfg.shardCount) > 1) {
        return `${dbCfg.shardCount} Shards (${dbCfg.shardKeyDistribution === 'zipf-skewed' ? 'Zipf' : 'Uni'})`;
      }
      return `${c.maxQueryThroughputQps ?? 500} qps`;
    }
    case 'database-replica':
      return `${c.capacityQps ?? 800} qps (replica)`;
    case 'message-queue':
      return `${c.capacityRps ? Number(c.capacityRps).toLocaleString() : '25k'} rps`;
    case 'worker':
      return `${c.instances ?? 2}x (${(Number(c.instances ?? 2)) * Number(c.concurrency ?? 5)} conns)`;
    case 'api-gateway':
      return `${c.capacityRps ? Number(c.capacityRps).toLocaleString() : '30k'} rps`;
    default:
      return '';
  }
}

export const CustomNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const nodeData = data as unknown as CustomNodeData;
  const selectNode = useUiStore((s) => s.selectNode);
  const selectedNodeId = useUiStore(selectSelectedNodeId);
  const draggingSwapNodeId = useUiStore(selectDraggingSwapNodeId);
  const graph = useGraphStore(selectGraph);

  const isSelected = selected || selectedNodeId === id;
  const rule = COMPONENT_RULES[nodeData.type as ComponentType];
  const isSwappable = Boolean(rule?.swapGroup);

  // Simulation runtime state, path highlighting, and bottleneck detection
  const runtimeState = useSimulationStore((s) => s.runtimeNodes[id]);
  const highlightedPath = useSimulationStore(selectHighlightedPath);
  const runtimeBottleneck = useSimulationStore(selectRuntimeBottleneck);
  const staticCapacity = useSimulationStore(selectStaticCapacity);
  const activeFailures = useSimulationStore(selectActiveFailures);

  const { zoom } = useViewport();
  const isCompact = zoom < 0.8;
  const nodeFailure = activeFailures.find((f) => f.targetId === id);

  const isPathHighlighted = highlightedPath.includes(id);
  const isRuntimeBottleneck = runtimeBottleneck?.nodeId === id;
  const isStaticBottleneck = staticCapacity?.bottleneckNodeId === id;
  const isBottleneck = isRuntimeBottleneck || (isStaticBottleneck && (runtimeState?.utilization ?? 0) > 0.85);

  const queueDepth = runtimeState?.queueDepth ?? 0;
  const utilization = runtimeState?.utilization ?? 0;
  const healthStatus = runtimeState?.status ?? 'healthy';
  const isThreatSource = (nodeData.type as string) === 'threat-source' || id === 'threat-source';
  const isCompromised = runtimeState?.isCompromised ?? false;
  const isQuarantined = runtimeState?.isQuarantined ?? false;
  const circuitBreakerState = runtimeState?.circuitBreakerState ?? 'closed';
  const activeInstances = runtimeState?.activeInstances ?? 1;
  const pendingInstances = runtimeState?.pendingInstances ?? 0;
  const wafRulesCount = runtimeState?.wafActiveRulesetsCount;

  // Swap drag states
  const isBeingDragged = draggingSwapNodeId === id;
  const isValidSwapTarget =
    draggingSwapNodeId &&
    draggingSwapNodeId !== id &&
    canSwap(graph, draggingSwapNodeId, nodeData.type).allowed;
  const isDimmed = draggingSwapNodeId && draggingSwapNodeId !== id && !isValidSwapTarget;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(id);
  };

  if (isCompact) {
    return (
      <div
        onClick={handleClick}
        tabIndex={0}
        role="button"
        title={`${nodeData.label || nodeData.type} | Util: ${Math.round(utilization * 100)}% | Queue: ${queueDepth}`}
        aria-label={`${nodeData.label || nodeData.type} node`}
        className={`
          relative flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer select-none
          w-40 min-h-[58px] transition-all duration-200 outline-none
          bg-gradient-to-b from-[#18181c] to-[#111113]
          border
          ${
            isThreatSource
              ? 'border-dashed border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
              : isQuarantined
              ? 'border-dashed border-amber-500/90 bg-amber-950/30 opacity-70 animate-pulse'
              : isCompromised
              ? 'border-red-500/90 shadow-[0_0_18px_rgba(239,68,68,0.7)] ring-2 ring-red-500/70 animate-pulse'
              : circuitBreakerState === 'open'
              ? 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)] ring-2 ring-rose-500'
              : isBottleneck
              ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.85)] ring-2 ring-white scale-105'
              : isPathHighlighted
              ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.7)] scale-105 ring-2 ring-white'
              : isValidSwapTarget
              ? 'border-white shadow-[var(--shadow-glow-target)] scale-105 ring-2 ring-white/60'
              : isSelected
              ? 'border-white shadow-[var(--shadow-glow-selected)] ring-1 ring-white/40'
              : nodeFailure || healthStatus === 'failed'
              ? 'border-dashed border-[#71717a] opacity-75'
              : healthStatus === 'overloaded'
              ? 'border-white shadow-[0_0_12px_rgba(255,255,255,0.4)] ring-2 ring-white/60'
              : 'border-[var(--color-border-silver-light)] hover:border-white'
          }
          ${isBeingDragged ? 'opacity-70 scale-95' : ''}
          ${isDimmed ? 'opacity-30' : 'opacity-100'}
        `}
      >
        {isQuarantined && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-950 text-amber-300 border border-amber-500/80 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold tracking-wider shadow-[0_0_8px_rgba(245,158,11,0.6)] z-10 animate-pulse">
            QUARANTINED
          </div>
        )}
        {isCompromised && !isQuarantined && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-red-950 text-red-300 border border-red-500/60 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold tracking-wider shadow-[0_0_8px_rgba(239,68,68,0.6)] z-10 animate-pulse">
            COMPROMISED
          </div>
        )}
        {circuitBreakerState === 'open' && (
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-rose-950 text-rose-300 border border-rose-500 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold tracking-wider shadow-[0_0_8px_rgba(244,63,94,0.6)] z-10 animate-pulse">
            CB: OPEN
          </div>
        )}
        {circuitBreakerState === 'half-open' && (
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-amber-950 text-amber-300 border border-amber-500 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold tracking-wider shadow-[0_0_8px_rgba(245,158,11,0.6)] z-10">
            CB: HALF-OPEN
          </div>
        )}
        {nodeFailure && !isCompromised && !isQuarantined && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-red-950 text-red-300 border border-red-500/60 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold tracking-wider shadow-[0_0_8px_rgba(239,68,68,0.6)] z-10">
            FAIL
          </div>
        )}

        {rule?.slot !== 1 && !isThreatSource && (
          <Handle
            type="target"
            position={Position.Left}
            className="!w-2 !h-2 !bg-[#d4d4d4] !border !border-[#ffffff] !-left-1"
          />
        )}

        <div className="flex-shrink-0 relative">
          <ComponentIcon type={nodeData.type} size={28} />
          {(nodeFailure || healthStatus === 'failed') && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
              ✕
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white tracking-wide truncate flex items-center gap-1">
            <span>{nodeData.label || nodeData.type}</span>
            {nodeData.type === 'database-replica' && (
              <span className="text-[8px] px-1 py-0.1 bg-zinc-800 text-zinc-300 rounded font-mono">
                REP
              </span>
            )}
            {nodeData.type === 'database' && Number((nodeData.config as Record<string, unknown>)?.shardCount ?? 1) > 1 && (
              <span className="text-[8px] px-1 py-0.1 bg-zinc-800 text-zinc-300 rounded font-mono">
                ⛁{String((nodeData.config as Record<string, unknown>)?.shardCount)}S
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                healthStatus === 'failed'
                  ? 'bg-red-400'
                  : utilization > 0.8
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span>{Math.round(utilization * 100)}%</span>
            {queueDepth > 0 && <span className="text-white font-bold">Q:{queueDepth}</span>}
          </div>
        </div>

        {rule?.pathBehavior !== 'terminal' && (
          <Handle
            type="source"
            position={Position.Right}
            className="!w-2 !h-2 !bg-[#d4d4d4] !border !border-[#ffffff] !-right-1"
          />
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="button"
      title={`${nodeData.label || nodeData.type} | Util: ${Math.round(utilization * 100)}% | Queue: ${queueDepth} | Status: ${healthStatus}`}
      aria-label={`${nodeData.label || nodeData.type} node`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          selectNode(id);
        }
      }}
      className={`
        relative flex flex-col items-center justify-between p-3 rounded-xl cursor-pointer select-none
        w-44 min-h-[104px] transition-all duration-200 outline-none
        bg-gradient-to-b from-[#18181c] to-[#111113]
        border
        ${
          isThreatSource
            ? 'border-dashed border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
            : isQuarantined
            ? 'border-dashed border-amber-500/90 bg-amber-950/20 opacity-70 animate-pulse'
            : isCompromised
            ? 'border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.7)] ring-2 ring-red-500 animate-pulse'
            : circuitBreakerState === 'open'
            ? 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.6)] ring-2 ring-rose-500'
            : isBottleneck
            ? 'border-white shadow-[0_0_25px_rgba(255,255,255,0.85)] ring-2 ring-white scale-105'
            : isPathHighlighted
            ? 'border-white shadow-[0_0_25px_rgba(255,255,255,0.7)] scale-105 ring-2 ring-white'
            : isValidSwapTarget
            ? 'border-white shadow-[var(--shadow-glow-target)] scale-105 ring-2 ring-white/60'
            : isSelected
            ? 'border-white shadow-[var(--shadow-glow-selected)] ring-1 ring-white/40'
            : healthStatus === 'failed'
            ? 'border-dashed border-[#71717a] opacity-60'
            : healthStatus === 'overloaded'
            ? 'border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] ring-2 ring-white/60'
            : utilization > 0.85
            ? 'border-[#e4e4e7] ring-1 ring-white/30'
            : nodeData.type === 'database-replica'
            ? 'opacity-85 border-zinc-600/80 hover:border-zinc-400'
            : 'border-[var(--color-border-silver-light)] hover:border-white hover:shadow-[var(--shadow-glow-hover)]'
        }
        ${isBeingDragged ? 'opacity-70 scale-95' : ''}
        ${isDimmed ? 'opacity-30' : 'opacity-100'}
      `}
    >
      {/* Quarantined Badge Callout */}
      {isQuarantined && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-950 text-amber-200 border border-amber-500 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.7)] animate-pulse z-10">
          QUARANTINED
        </div>
      )}

      {/* Compromised Badge Callout */}
      {isCompromised && !isQuarantined && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-950 text-red-200 border border-red-500 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shadow-[0_0_12px_rgba(239,68,68,0.7)] animate-pulse z-10">
          COMPROMISED
        </div>
      )}

      {/* Circuit Breaker Callout */}
      {circuitBreakerState === 'open' && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-rose-950 text-rose-200 border border-rose-500 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shadow-[0_0_10px_rgba(244,63,94,0.7)] animate-pulse z-10">
          CB: OPEN
        </div>
      )}
      {circuitBreakerState === 'half-open' && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-amber-950 text-amber-200 border border-amber-500 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shadow-[0_0_10px_rgba(245,158,11,0.7)] z-10">
          CB: HALF-OPEN
        </div>
      )}

      {/* Threat Source Callout */}
      {isThreatSource && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-950 text-amber-300 border border-amber-500/80 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shadow-[0_0_10px_rgba(245,158,11,0.5)] z-10">
          ATTACK SOURCE
        </div>
      )}

      {/* Bottleneck Badge Callout */}
      {isBottleneck && !isCompromised && !isQuarantined && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shadow-[0_0_12px_rgba(255,255,255,0.9)] animate-pulse border border-white z-10">
          BOTTLENECK
        </div>
      )}

      {/* Failure Badge Callout */}
      {nodeFailure && !isBottleneck && !isCompromised && !isQuarantined && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-950 text-red-300 border border-red-500/60 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider shadow-[0_0_10px_rgba(239,68,68,0.5)] z-10">
          {nodeFailure.failureType.toUpperCase()}
        </div>
      )}

      {/* Hover Tooltip */}
      {isHovered && !isBeingDragged && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-2 rounded-lg bg-[#111113]/95 backdrop-blur-md border border-[#3f3f46] shadow-2xl text-left font-mono z-50 pointer-events-none animate-in fade-in duration-150">
          <div className="text-[11px] font-bold text-white truncate">
            {nodeData.label || nodeData.type}
          </div>
          <div className="text-[9px] text-[var(--color-text-muted)] truncate">ID: {nodeData.id}</div>
          <div className="mt-1 pt-1 border-t border-[#27272a] space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Status:</span>
              <span className={healthStatus === 'healthy' ? 'text-emerald-300' : 'text-amber-300'}>
                {healthStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Utilization:</span>
              <span className="text-white font-bold">{Math.round(utilization * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Queue Depth:</span>
              <span className="text-white">{queueDepth}</span>
            </div>
          </div>
        </div>
      )}

      {/* Input Handle (Left) */}
      {rule?.slot !== 1 && !isThreatSource && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-[#d4d4d4] !border !border-[#ffffff] !-left-1"
        />
      )}

      {/* Header with Status Indicator, Queue Badge & Swap Badge */}
      <div className="w-full flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isThreatSource
                ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'
                : healthStatus === 'failed'
                ? 'bg-[#71717a]'
                : isBottleneck || healthStatus === 'overloaded'
                ? 'bg-white shadow-[0_0_8px_#ffffff] ring-1 ring-white'
                : utilization > 0.8
                ? 'bg-[#e4e4e7] shadow-[0_0_6px_#ffffff]'
                : 'bg-[#a1a1aa]'
            }`}
            title={`Health: ${healthStatus} (Util: ${Math.round(utilization * 100)}%)`}
          />
          <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--color-text-faint)]">
            {isThreatSource ? 'ATTACK' : `Slot ${rule?.slot ?? '-'}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {nodeData.type === 'app-server' && activeInstances > 1 && (
            <span
              className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/50 font-mono font-bold shadow-sm"
              title={`Active autoscaled instances: ${activeInstances}${pendingInstances > 0 ? ` (+${pendingInstances} scaling)` : ''}`}
            >
              x{activeInstances}{pendingInstances > 0 ? `+${pendingInstances}` : ''}
            </span>
          )}

          {nodeData.type === 'waf' && wafRulesCount !== undefined && wafRulesCount > 0 && (
            <span
              className="text-[9px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-500/50 font-mono font-bold shadow-sm"
              title={`${wafRulesCount} active WAF rulesets`}
            >
              {wafRulesCount}R
            </span>
          )}

          {queueDepth > 0 && (
            <span
              className="text-[9px] px-1.5 py-0.2 rounded bg-white/20 text-white font-mono font-bold shadow-sm"
              title={`Queue depth: ${queueDepth}`}
            >
              Q:{queueDepth}
            </span>
          )}

          {nodeData.type === 'database-replica' && (
            <span
              className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-600 font-mono font-bold shadow-sm"
              title="Read Replica: serves read queries offloaded from cache misses"
            >
              REPLICA
            </span>
          )}

          {nodeData.type === 'database' && Number((nodeData.config as Record<string, unknown>)?.shardCount ?? 1) > 1 && (
            <span
              className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-200 border border-zinc-600 font-mono font-bold shadow-sm"
              title={`Sharded Database: ${(nodeData.config as Record<string, unknown>)?.shardCount} shards (${String((nodeData.config as Record<string, unknown>)?.shardKeyDistribution ?? 'uniform')})`}
            >
              ⛁ {String((nodeData.config as Record<string, unknown>)?.shardCount)} Shards
            </span>
          )}

          {isSwappable && (
            <span
              className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-[var(--color-text-secondary)] border border-white/20 font-mono"
              title="Swappable component (can swap with API Gateway or Load Balancer)"
            >
              SWAP
            </span>
          )}
        </div>
      </div>

      {/* Center Image / Icon */}
      <div className="my-1.5 flex items-center justify-center">
        <ComponentIcon type={nodeData.type} size={36} />
      </div>

      {/* Label, ID, and Summary Badge */}
      <div className="text-center w-full">
        <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
          {nodeData.label || nodeData.type}
        </div>
        <div className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">
          {nodeData.id}
        </div>
        {getNodeSummaryBadge(nodeData.type, nodeData.config) && (
          <div className="mt-1">
            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/5 border border-white/15 text-[var(--color-text-secondary)] shadow-sm truncate max-w-[140px]">
              {getNodeSummaryBadge(nodeData.type, nodeData.config)}
            </span>
          </div>
        )}
      </div>

      {/* Utilization & Queue Depth Gauges */}
      {nodeData.type !== 'client' && (
        <div className="w-full mt-2 pt-1 border-t border-[#222226] space-y-1">
          <div className="flex items-center justify-between text-[9px] font-mono text-[var(--color-text-faint)]">
            <span>Util</span>
            <span className={utilization > 0.85 ? 'text-white font-bold' : ''}>
              {Math.round(utilization * 100)}%
            </span>
          </div>
          <div className="w-full h-1 bg-[#222226] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                utilization > 0.95
                  ? 'bg-white shadow-[0_0_6px_#ffffff]'
                  : utilization > 0.8
                  ? 'bg-[#d4d4d8]'
                  : 'bg-[#71717a]'
              }`}
              style={{ width: `${Math.min(100, Math.round(utilization * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* Output Handle (Right) */}
      {rule?.pathBehavior !== 'terminal' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-[#d4d4d4] !border !border-[#ffffff] !-right-1"
        />
      )}
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
