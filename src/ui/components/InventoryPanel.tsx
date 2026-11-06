import React from 'react';
import { ComponentType } from '@types';
import { COMPONENT_RULES, canAdd } from '@builder';
import { ComponentIcon } from './ComponentIcon';
import { useGraphStore, selectGraph } from '@store';
import { useUiStore } from '@store';

export const InventoryPanel: React.FC = () => {
  const graph = useGraphStore(selectGraph);
  const addNode = useGraphStore((s) => s.addNode);
  const setHint = useUiStore((s) => s.setHint);

  // List all v1 components in logical tier order, excluding 'later' release components
  const availableComponents = (Object.keys(COMPONENT_RULES) as ComponentType[]).filter(
    (type) => COMPONENT_RULES[type].enabledInRelease === 'v1'
  );

  const handleAdd = (type: ComponentType) => {
    const res = addNode(type);
    if (res.success) {
      if (type === 'load-balancer') {
        const serverCount = graph.nodes.filter((n) => n.type === 'app-server').length;
        if (serverCount <= 1) {
          setHint('Tip: Add more App Servers to spread load across the cluster.');
        }
      }
    }
  };

  const handleAddPrerequisiteAndSelf = (prereq: ComponentType, selfType: ComponentType) => {
    const res1 = addNode(prereq);
    if (res1.success) {
      setTimeout(() => {
        addNode(selfType);
      }, 50);
    }
  };

  return (
    <aside
      className="w-80 h-full flex flex-col bg-[#131316] border-r border-[#27272a] select-none z-10"
      aria-label="Component Inventory"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase">Inventory</h2>
          <p className="text-xs text-[var(--color-text-muted)]">Click Add to auto-place components</p>
        </div>
      </div>

      {/* Component List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {availableComponents.map((type) => {
          const rule = COMPONENT_RULES[type];
          const check = canAdd(graph, type);
          const isAllowed = check.allowed;

          return (
            <div
              key={type}
              className={`
                p-3 rounded-lg border transition-all duration-150 bg-[#111113]
                ${isAllowed ? 'border-[#3f3f46] hover:border-[#8e8e93]' : 'border-[#27272a] opacity-80'}
              `}
            >
              <div className="flex items-start gap-3">
                <div className="p-1 rounded bg-[#18181b] border border-[#27272a] shrink-0">
                  <ComponentIcon type={type} size={28} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate">
                      {rule.label}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
                      Tier {rule.slot}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 mt-0.5">
                    {rule.whyHere}
                  </p>
                </div>
              </div>

              {/* Action Buttons & Prerequisites */}
              <div className="mt-2.5 pt-2 border-t border-[#222226] flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!isAllowed}
                    onClick={() => handleAdd(type)}
                    title={!isAllowed ? check.reason : `Add ${rule.label} to architecture`}
                    aria-label={`Add ${rule.label}`}
                    className={`
                      w-full py-1.5 px-3 rounded text-xs font-medium transition-all duration-150
                      flex items-center justify-center gap-1.5
                      ${
                        isAllowed
                          ? 'bg-[#18181b] hover:bg-[#222226] text-white border border-[#b8b8b8] hover:border-white hover:shadow-[0_0_10px_rgba(255,255,255,0.2)] active:scale-[0.98]'
                          : 'bg-[#141416] text-[#71717a] border border-[#27272a] cursor-not-allowed'
                      }
                    `}
                  >
                    <span>+</span>
                    <span>Add</span>
                  </button>
                </div>

                {/* Reason & Prerequisite Resolution */}
                {!isAllowed && (
                  <div className="text-[10px] text-[var(--color-text-faint)] px-1">
                    <div className="flex items-start gap-1">
                      <span className="text-[#a1a1aa] shrink-0">ℹ</span>
                      <span>{check.reason}</span>
                    </div>

                    {check.suggestedPrerequisite && (
                      <button
                        type="button"
                        onClick={() =>
                          handleAddPrerequisiteAndSelf(check.suggestedPrerequisite!, type)
                        }
                        className="mt-1.5 w-full py-1 px-2 rounded bg-white/5 hover:bg-white/10 text-white text-[10px] font-mono border border-white/20 transition-all text-left flex items-center justify-between"
                      >
                        <span>Add {COMPONENT_RULES[check.suggestedPrerequisite].label} first</span>
                        <span className="text-white/60">→</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
