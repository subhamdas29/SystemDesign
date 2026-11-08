import React from 'react';
import { useAttackStore } from '../../store/attackStore';

export const ScenarioDetailsModal: React.FC = () => {
  const isOpen = useAttackStore((s) => s.isDetailsModalOpen);
  const scenario = useAttackStore((s) => s.selectedScenarioForDetails);
  const close = useAttackStore((s) => s.closeScenarioDetails);

  if (!isOpen || !scenario) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenario-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-gradient-to-b from-[#18181c] to-[#111113] border border-[#3f3f46] shadow-2xl overflow-hidden text-white font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#27272a] bg-[#141416]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 text-lg shadow-[0_0_12px_rgba(245,158,11,0.2)]">
              🛡️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="scenario-details-title" className="text-base font-bold text-white tracking-tight">
                  {scenario.name}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wider font-semibold">
                  {scenario.targetLayer}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Educational Conceptual Breakdown & Defense Guide
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#a1a1aa] hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {/* Conceptual 4-Part Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* What it is */}
            <div className="p-4 rounded-xl bg-[#141417] border border-[#27272a]">
              <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider mb-2">
                <span className="text-amber-400">🔍</span> What It Is
              </div>
              <p className="text-xs text-[#d4d4d8] leading-relaxed">
                {scenario.plainLanguage.whatItIs}
              </p>
            </div>

            {/* What it targets */}
            <div className="p-4 rounded-xl bg-[#141417] border border-[#27272a]">
              <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider mb-2">
                <span className="text-red-400">🎯</span> What It Targets
              </div>
              <p className="text-xs text-[#d4d4d8] leading-relaxed">
                {scenario.plainLanguage.whatItTargets}
              </p>
            </div>

            {/* What stops it */}
            <div className="p-4 rounded-xl bg-[#141417] border border-emerald-500/20 bg-emerald-950/10">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 uppercase tracking-wider mb-2">
                <span>🛡️</span> What Stops It
              </div>
              <p className="text-xs text-emerald-200/90 leading-relaxed">
                {scenario.plainLanguage.whatStopsIt}
              </p>
            </div>

            {/* What does not stop it */}
            <div className="p-4 rounded-xl bg-[#141417] border border-red-500/20 bg-red-950/10">
              <div className="flex items-center gap-2 text-xs font-bold text-red-300 uppercase tracking-wider mb-2">
                <span>⚠️</span> What Does NOT Stop It
              </div>
              <p className="text-xs text-red-200/90 leading-relaxed">
                {scenario.plainLanguage.whatDoesNotStopIt}
              </p>
            </div>
          </div>

          {/* Recommended Architecture Defense */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/30 to-[#141417] border border-amber-500/40 shadow-sm">
            <div className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>💡</span> Recommended Architectural Defense
            </div>
            <p className="text-xs text-amber-100/90 leading-relaxed">
              {scenario.recommendedDefense}
            </p>
          </div>

          {/* Abstract Attack Profile Characteristics */}
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-2.5">
              Simulation Traffic Profile
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-[#141417] border border-[#27272a]">
                <div className="text-[10px] text-[var(--color-text-muted)]">Default RPS</div>
                <div className="text-white font-bold mt-0.5">{scenario.intensityRange.defaultRps.toLocaleString()}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#141417] border border-[#27272a]">
                <div className="text-[10px] text-[var(--color-text-muted)]">Cost Multiplier</div>
                <div className="text-white font-bold mt-0.5">{scenario.defaultCostMultiplier}x</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#141417] border border-[#27272a]">
                <div className="text-[10px] text-[var(--color-text-muted)]">Connection Hold</div>
                <div className="text-white font-bold mt-0.5">{scenario.defaultConnectionHoldMs} ms</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#141417] border border-[#27272a]">
                <div className="text-[10px] text-[var(--color-text-muted)]">Cacheable</div>
                <div className="text-white font-bold mt-0.5">{scenario.defaultCacheable ? 'Yes' : 'No (Bypasses)'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-[#27272a] bg-[#141416]">
          <button
            type="button"
            onClick={close}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#27272a] hover:bg-[#3f3f46] text-white transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
