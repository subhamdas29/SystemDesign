import React from 'react';
import { Header } from './ui/components/Header';
import { InventoryPanel } from './ui/components/InventoryPanel';
import { InspectorPanel } from './ui/components/InspectorPanel';
import { Canvas } from './ui/canvas/Canvas';
import { ControlBar } from './ui/components/ControlBar';
import { Dashboard } from './ui/components/Dashboard';
import { EventLogPanel } from './ui/components/EventLogPanel';
import { RequestTraceDrawer } from './ui/components/RequestTraceDrawer';
import { RunSummaryModal } from './ui/dashboard/RunSummaryModal';
import { ChaosPanel } from './ui/components/ChaosPanel';
import { ScenarioPresetsModal } from './ui/components/ScenarioPresetsModal';
import {
  useUiStore,
  selectHint,
  selectIsInventoryOpen,
  selectIsInspectorOpen,
} from '@store';

export const App: React.FC = () => {
  const hint = useUiStore(selectHint);
  const setHint = useUiStore((s) => s.setHint);

  const isInventoryOpen = useUiStore(selectIsInventoryOpen);
  const toggleInventory = useUiStore((s) => s.toggleInventory);
  const isInspectorOpen = useUiStore(selectIsInspectorOpen);
  const toggleInspector = useUiStore((s) => s.toggleInspector);

  return (
    <div className="h-full w-full min-h-[100dvh] grid grid-rows-[56px_1fr_64px] bg-[#0b0b0d] text-white overflow-hidden select-none font-sans">
      {/* 1. Header (Fixed Height 56px) */}
      <Header />

      {/* 2. Main Workspace (CSS Grid: Inventory | Canvas 1fr | Inspector) */}
      <div className="grid grid-cols-[auto_1fr_auto] h-full w-full min-h-0 min-w-0 relative overflow-hidden">
        {/* Left Column: Inventory Panel */}
        {isInventoryOpen ? (
          <div className="w-[320px] h-full shrink-0 relative overflow-hidden z-10 transition-all duration-200">
            <InventoryPanel />
          </div>
        ) : (
          <aside
            className="w-10 h-full shrink-0 bg-[#131316] border-r border-[#27272a] flex flex-col items-center py-3 z-10"
            aria-label="Collapsed Inventory Panel"
          >
            <button
              type="button"
              onClick={toggleInventory}
              title="Expand Inventory Panel"
              className="w-7 h-7 rounded-lg bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white text-xs flex items-center justify-center transition-all shadow-sm"
            >
              ▶
            </button>
            <span className="mt-8 text-[11px] font-bold text-[var(--color-text-muted)] tracking-widest uppercase [writing-mode:vertical-lr] rotate-180">
              Inventory
            </span>
          </aside>
        )}

        {/* Center Column: Central Canvas (1fr, guaranteed non-zero dimensions) */}
        <main
          className="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-dot-grid flex-1"
          aria-label="Architecture Canvas"
        >
          <Canvas />
          <Dashboard />
          <EventLogPanel />
          <RequestTraceDrawer />
          <RunSummaryModal />
          <ChaosPanel />
          <ScenarioPresetsModal />

          {/* Gentle Educational Hint Toast */}
          {hint && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-[#18181b]/95 backdrop-blur-md border border-white/40 shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
              <span className="text-white text-sm">💡</span>
              <span className="text-xs font-medium text-white">{hint}</span>
              <button
                type="button"
                onClick={() => setHint(null)}
                className="text-xs text-[var(--color-text-muted)] hover:text-white ml-2 p-1 rounded hover:bg-white/10"
                aria-label="Dismiss hint"
              >
                ✕
              </button>
            </div>
          )}
        </main>

        {/* Right Column: Inspector Panel */}
        {isInspectorOpen ? (
          <div className="w-[360px] h-full shrink-0 relative overflow-hidden z-10 transition-all duration-200">
            <InspectorPanel />
          </div>
        ) : (
          <aside
            className="w-10 h-full shrink-0 bg-[#131316] border-l border-[#27272a] flex flex-col items-center py-3 z-10"
            aria-label="Collapsed Inspector Panel"
          >
            <button
              type="button"
              onClick={toggleInspector}
              title="Expand Inspector Panel"
              className="w-7 h-7 rounded-lg bg-[#18181b] hover:bg-[#222226] text-white border border-[#3f3f46] hover:border-white text-xs flex items-center justify-center transition-all shadow-sm"
            >
              ◀
            </button>
            <span className="mt-8 text-[11px] font-bold text-[var(--color-text-muted)] tracking-widest uppercase [writing-mode:vertical-lr]">
              Inspector
            </span>
          </aside>
        )}
      </div>

      {/* 3. Bottom Simulation Control Bar (Fixed Height 64px) */}
      <ControlBar />
    </div>
  );
};

export default App;
