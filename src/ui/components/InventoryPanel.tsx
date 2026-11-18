/**
 * Component Inventory Drawer (R2 Section 5).
 * Opens from the left under the list icon.
 * Sections by tier:
 * - Each item: a large icon (40-48px) followed by name, and a one-line plain description
 * - "+ Add" is a quiet text button (cream text, underline on hover/focus), not a filled cream block
 * - Components already in graph show quiet "Added" or "Already added" in muted grey text
 * - Disabled items show quiet label with reason in tooltip; NO red/orange error paragraph
 */

import React, { useMemo } from 'react';
import { ComponentType } from '@types';
import { COMPONENT_RULES, COMPONENT_DESCRIPTIONS, canAdd } from '@builder';
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

  // Partition available components by architectural tier (Main layer)
  const tierSections: TierSection[] = useMemo(() => {
    const v1Types = (Object.keys(COMPONENT_RULES) as ComponentType[]).filter(
      (type) => COMPONENT_RULES[type].enabledInRelease === 'v1'
    );

    const asyncScalingTypes: ComponentType[] = ['message-queue', 'worker', 'database-replica'];

    const sections: TierSection[] = [
      {
        title: 'Edge & Ingress (Tiers 2-4)',
        types: v1Types.filter((t) => [2, 3, 4].includes(COMPONENT_RULES[t].slot)),
      },
      {
        title: 'Security & Inspection (Tiers 5-7)',
        types: v1Types.filter((t) => [5, 6, 7].includes(COMPONENT_RULES[t].slot)),
      },
      {
        title: 'Entry Point (Tier 8)',
        types: v1Types.filter((t) => COMPONENT_RULES[t].slot === 8),
      },
      {
        title: 'Core Compute (Tier 9)',
        types: v1Types.filter((t) => COMPONENT_RULES[t].slot === 9 && !asyncScalingTypes.includes(t)),
      },
      {
        title: 'Persistence & Caching (Tiers 10-11)',
        types: v1Types.filter(
          (t) => [10, 11].includes(COMPONENT_RULES[t].slot) && !asyncScalingTypes.includes(t)
        ),
      },
      {
        title: 'Async & Data Scaling',
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
      className="w-full h-full flex flex-col bg-[#15181E] border-r border-[#2A2E39] select-none font-mono text-[#F3EEE3] z-20 transition-transform duration-[220ms] ease-out shadow-2xl"
      aria-label="Component Inventory Drawer"
    >
      {/* Drawer Top Bar */}
      <div className="h-14 px-5 border-b border-[#2A2E39] flex items-center justify-between shrink-0 bg-[#1B1E24]">
        <div>
          <h2 className="text-xs font-bold text-[#F3EEE3] tracking-wider uppercase">
            Inventory
          </h2>
          <p className="text-[10px] text-[#8E8E8E]">
            Add components to architecture
          </p>
        </div>
        <button
          type="button"
          onClick={toggleInventory}
          title="Close Inventory"
          aria-label="Close Inventory"
          className="w-6 h-6 rounded text-[#8E8E8E] hover:text-[#F3EEE3] hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Sections by Tier */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {tierSections.map((section) => (
          <div key={section.title} className="space-y-2">
            <h3 className="text-[10px] uppercase font-bold text-[#8E8E8E] tracking-widest px-1">
              {section.title}
            </h3>

            <div className="space-y-1.5">
              {section.types.map((type) => {
                const rule = COMPONENT_RULES[type];
                const addCheck = canAdd(graph, type);
                const desc = COMPONENT_DESCRIPTIONS[type]?.whatItIs || rule.whyHere;
                const nodeCount = graph.nodes.filter((n) => n.type === type).length;
                const alreadyInGraph = nodeCount > 0;
                const isMax = nodeCount >= rule.maxCount;

                return (
                  <div
                    key={type}
                    className="p-2.5 rounded bg-[#1B1E24] border border-[#2A2E39] hover:border-[#8E8E8E] transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Large Icon (40px) + Name & Plain 1-line description */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="shrink-0">
                          <ComponentIcon type={type} size={40} color="#FFFFFF" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[#F3EEE3] truncate">
                            {rule.label}
                          </div>
                          <div
                            className="text-[10px] text-[#8E8E8E] truncate leading-tight mt-0.5"
                            title={desc}
                          >
                            {desc}
                          </div>
                        </div>
                      </div>

                      {/* Quiet Action Control */}
                      <div className="shrink-0 flex items-center justify-end">
                        {addCheck.allowed ? (
                          <button
                            type="button"
                            onClick={() => handleAdd(type)}
                            className="text-xs text-[#F3EEE3] hover:underline focus:underline bg-transparent border-0 cursor-pointer p-0 font-medium transition-colors"
                          >
                            + Add
                          </button>
                        ) : alreadyInGraph && !rule.fanOut ? (
                          <span
                            title={addCheck.reason || 'Already added to architecture'}
                            className="text-xs text-[#8E8E8E] cursor-default select-none"
                          >
                            Added
                          </span>
                        ) : isMax ? (
                          <span
                            title={addCheck.reason || 'Maximum instances reached'}
                            className="text-xs text-[#8E8E8E] cursor-default select-none"
                          >
                            Added ({nodeCount})
                          </span>
                        ) : addCheck.suggestedPrerequisite ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleAddPrerequisiteAndSelf(addCheck.suggestedPrerequisite!, type)
                            }
                            title={addCheck.reason}
                            className="text-[11px] text-[#8E8E8E] hover:text-[#F3EEE3] hover:underline focus:underline bg-transparent border-0 cursor-pointer p-0 transition-colors"
                          >
                            + {COMPONENT_RULES[addCheck.suggestedPrerequisite].label.split(' ')[0]} first
                          </button>
                        ) : (
                          <span
                            title={addCheck.reason}
                            className="text-xs text-[#8E8E8E] cursor-default select-none"
                          >
                            Already added
                          </span>
                        )}
                      </div>
                    </div>
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

export default InventoryPanel;
