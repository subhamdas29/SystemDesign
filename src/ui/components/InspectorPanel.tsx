import React from 'react';
import { useGraphStore, selectGraph, selectNodes } from '@store';
import { useUiStore, selectSelectedNodeId } from '@store';
import { COMPONENT_RULES, canRemove, canSwap, ComponentSlotRule } from '@builder';
import { ComponentIcon } from './ComponentIcon';
import { ConfigForm } from './ConfigForm';
import { ComponentType } from '@types';

export const InspectorPanel: React.FC = () => {
  const graph = useGraphStore(selectGraph);
  const nodes = useGraphStore(selectNodes);
  const removeNode = useGraphStore((s) => s.removeNode);
  const swapNode = useGraphStore((s) => s.swapNode);

  const selectedNodeId = useUiStore(selectSelectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const rule: ComponentSlotRule | undefined = selectedNode
    ? COMPONENT_RULES[selectedNode.type]
    : undefined;

  const removeCheck = selectedNode ? canRemove(graph, selectedNode.id) : null;

  // Find candidate components for swapping
  const swapCandidates: ComponentType[] = selectedNode && rule?.swapGroup
    ? (Object.keys(COMPONENT_RULES) as ComponentType[]).filter(
        (t) =>
          t !== selectedNode.type &&
          COMPONENT_RULES[t].swapGroup === rule.swapGroup &&
          canSwap(graph, selectedNode.id, t).allowed
      )
    : [];

  const handleRemove = () => {
    if (!selectedNode || !removeCheck?.allowed) return;
    removeNode(selectedNode.id);
    selectNode(null);
  };

  const handleSwap = (targetType: ComponentType) => {
    if (!selectedNode) return;
    swapNode(selectedNode.id, targetType);
  };

  return (
    <aside
      className="w-80 h-full flex flex-col bg-[#131316] border-l border-[#27272a] select-none z-10"
      aria-label="Component Inspector"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase">Inspector</h2>
          <p className="text-xs text-[var(--color-text-muted)]">Configuration & Slot Rules</p>
        </div>
        {selectedNode && (
          <button
            type="button"
            onClick={() => selectNode(null)}
            className="text-xs text-[var(--color-text-muted)] hover:text-white px-2 py-1 rounded hover:bg-[#18181b]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedNode && rule ? (
          <div className="space-y-5">
            {/* Component Header Card */}
            <div className="p-3.5 rounded-xl border border-[#3f3f46] bg-[#111113] flex items-center gap-3.5">
              <div className="p-2 rounded-lg bg-[#18181b] border border-[#27272a] shrink-0">
                <ComponentIcon type={selectedNode.type} size={36} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">
                  {selectedNode.label || selectedNode.type}
                </div>
                <div className="text-xs font-mono text-[var(--color-text-muted)] truncate">
                  ID: {selectedNode.id}
                </div>
                <div className="text-[10px] font-mono text-[var(--color-text-faint)] mt-0.5">
                  Tier {rule.slot} • {rule.pathBehavior}
                </div>
              </div>
            </div>

            {/* Why Here (Educational rationale) */}
            <div className="p-3 rounded-lg border border-[#27272a] bg-[#111113]">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                Role in System
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {rule.whyHere}
              </p>
            </div>

            {/* Swap Section (if swappable) */}
            {rule.swapGroup && (
              <div className="p-3 rounded-lg border border-[#27272a] bg-[#111113] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Swap Component
                  </span>
                  <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
                    {rule.swapGroup}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Drag this node onto another in the canvas or choose below:
                </p>

                {swapCandidates.length > 0 ? (
                  <div className="flex flex-col gap-1.5 mt-2">
                    {swapCandidates.map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        onClick={() => handleSwap(candidate)}
                        className="w-full py-1.5 px-3 rounded text-xs font-mono bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white transition-all flex items-center justify-between"
                      >
                        <span>Swap with {COMPONENT_RULES[candidate].label}</span>
                        <span>⇄</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--color-text-faint)]">
                    No alternate components in this swap group.
                  </div>
                )}
              </div>
            )}

            {/* Real Interactive Configuration Form */}
            <ConfigForm node={selectedNode} />

            {/* Remove Action */}
            <div className="pt-2 border-t border-[#27272a]">
              <button
                type="button"
                disabled={!removeCheck?.allowed}
                onClick={handleRemove}
                title={removeCheck?.reason}
                aria-label={`Remove ${selectedNode.label || selectedNode.type}`}
                className={`
                  w-full py-2 px-3 rounded-lg text-xs font-medium transition-all duration-150 flex items-center justify-center gap-2
                  ${
                    removeCheck?.allowed
                      ? 'bg-[#18181b] hover:bg-[#27272a] text-white border border-[#71717a] hover:border-white hover:shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                      : 'bg-[#141416] text-[#71717a] border border-[#27272a] cursor-not-allowed'
                  }
                `}
              >
                <span>✕</span>
                <span>Remove Component</span>
              </button>

              {!removeCheck?.allowed && (
                <p className="text-[11px] text-[var(--color-text-faint)] mt-2 px-1">
                  {removeCheck?.reason}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--color-text-faint)] space-y-3">
            <div className="w-12 h-12 rounded-full border border-dashed border-[#3f3f46] flex items-center justify-center text-lg">
              🔍
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text-muted)]">No Node Selected</p>
              <p className="text-xs mt-1 leading-relaxed">
                Click any component on the canvas to inspect its role, swap options, and configuration.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
