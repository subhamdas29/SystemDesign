/**
 * Component Inventory Panel.
 * Displays available infrastructure building blocks organized by architectural tier.
 * Features compact right-aligned Add buttons, uniform icon badges, plain-language tooltips,
 * and collapsible panel controls.
 */

import React, { useMemo } from 'react';
import { ComponentType } from '@types';
import { COMPONENT_RULES, canAdd } from '@builder';
import { ComponentIcon } from './ComponentIcon';
import { useGraphStore, selectGraph } from '@store';
import { useUiStore } from '@store';

interface TierSection {
  title: string;
  types: ComponentType[];
}

export const InventoryPanel: React.FC = () => {
  const graph = useGraphStore(selectGraph);
  const addNode = useGraphStore((s) => s.addNode);
  const setHint = useUiStore((s) => s.setHint);
  const toggleInventory = useUiStore((s) => s.toggleInventory);

  // Filter available v1 components and partition by architectural tier
  const tierSections: TierSection[] = useMemo(() => {
    const v1Types = (Object.keys(COMPONENT_RULES) as ComponentType[]).filter(
      (type) => COMPONENT_RULES[type].enabledInRelease === 'v1'
    );

    const asyncScalingTypes: ComponentType[] = ['message-queue', 'worker', 'database-replica'];

    const sections: TierSection[] = [
      {
        title: 'Edge & Routing (Tiers 2-4)',
        types: v1Types.filter((t) => [2, 3, 4].includes(COMPONENT_RULES[t].slot)),
      },
      {
        title: 'Security & Traffic (Tiers 5-7)',
        types: v1Types.filter((t) => [5, 6, 7].includes(COMPONENT_RULES[t].slot)),
      },
      {
        title: 'Entry Point (Tier 8)',
        types: v1Types.filter((t) => COMPONENT_RULES[t].slot === 8),
      },
      {
        title: 'Compute Servers (Tier 9)',
        types: v1Types.filter((t) => COMPONENT_RULES[t].slot === 9 && !asyncScalingTypes.includes(t)),
      },
      {
        title: 'Storage & Caching (Tiers 10-11)',
        types: v1Types.filter(
          (t) => [10, 11].includes(COMPONENT_RULES[t].slot) && !asyncScalingTypes.includes(t)
        ),
      },
      {
        title: 'Async and data scaling',
        types: v1Types.filter((t) => asyncScalingTypes.includes(t)),
      },
    ];

    return sections.filter((s) => s.types.length > 0);
  }, []);

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
      className="w-full h-full flex flex-col bg-[#131316] border-r border-[#27272a] select-none z-10"
      aria-label="Component Inventory"
    >
      {/* Panel Header */}
      <div className="h-14 px-4 border-b border-[#27272a] flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xs font-bold text-white tracking-wider uppercase font-sans">
            Inventory
          </h2>
          <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
            Click Add to place components
          </p>
        </div>

        <button
          type="button"
          onClick={toggleInventory}
          className="w-6 h-6 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 flex items-center justify-center text-xs transition-all"
          title="Collapse Inventory panel"
          aria-label="Collapse Inventory panel"
        >
          ◀
        </button>
      </div>

      {/* Scrollable Tier List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {tierSections.map((section) => (
          <div key={section.title} className="space-y-2">
            <h3 className="text-[10px] font-mono font-bold text-[var(--color-text-faint)] tracking-widest uppercase px-1">
              {section.title}
            </h3>

            <div className="space-y-2">
              {section.types.map((type) => {
                const rule = COMPONENT_RULES[type];
                const check = canAdd(graph, type);
                const isAllowed = check.allowed;

                return (
                  <div
                    key={type}
                    className={`
                      p-2.5 rounded-xl border transition-all duration-150 bg-[#111113]
                      ${
                        isAllowed
                          ? 'border-[#333338] hover:border-[#8e8e93] hover:shadow-[0_0_12px_rgba(255,255,255,0.06)]'
                          : 'border-[#222226] opacity-60'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      {/* Left: Uniform 40x40 Icon Badge */}
                      <ComponentIcon type={type} size={40} />

                      {/* Center: Details */}
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate font-sans">
                            {rule.label}
                          </span>
                          <span className="text-[9px] font-mono text-[var(--color-text-faint)] bg-white/5 px-1 py-0.2 rounded border border-white/10 shrink-0">
                            T{rule.slot}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 mt-0.5 leading-snug font-sans">
                          {rule.whyHere}
                        </p>
                      </div>

                      {/* Right: Compact Add Button */}
                      <button
                        type="button"
                        disabled={!isAllowed}
                        onClick={() => handleAdd(type)}
                        title={!isAllowed ? check.reason : `Add ${rule.label} to architecture`}
                        aria-label={`Add ${rule.label}`}
                        className={`
                          h-7 px-2.5 rounded-lg text-xs font-mono font-medium shrink-0 transition-all flex items-center gap-1
                          ${
                            isAllowed
                              ? 'bg-[#18181b] hover:bg-[#222226] text-white border border-[#b8b8b8] hover:border-white hover:shadow-[0_0_10px_rgba(255,255,255,0.25)] active:scale-95'
                              : 'bg-[#141416] text-[#71717a] border border-[#27272a] cursor-not-allowed opacity-50'
                          }
                        `}
                      >
                        <span className="text-sm font-bold leading-none">+</span>
                        <span>Add</span>
                      </button>
                    </div>

                    {/* Prerequisite Guidance (Only when disabled and prerequisite suggested) */}
                    {!isAllowed && check.suggestedPrerequisite && (
                      <div className="mt-2 pt-1.5 border-t border-[#1f1f23]">
                        <button
                          type="button"
                          onClick={() =>
                            handleAddPrerequisiteAndSelf(check.suggestedPrerequisite!, type)
                          }
                          className="w-full py-1 px-2 rounded bg-white/5 hover:bg-white/10 text-white text-[10px] font-mono border border-white/20 transition-all flex items-center justify-between"
                        >
                          <span>Add {COMPONENT_RULES[check.suggestedPrerequisite].label} first</span>
                          <span className="text-white/60">→</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
