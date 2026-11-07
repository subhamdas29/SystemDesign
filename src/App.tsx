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
import { useUiStore, selectHint } from '@store';

export const App: React.FC = () => {
  const hint = useUiStore(selectHint);
  const setHint = useUiStore((s) => s.setHint);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0b0b0d] text-white overflow-hidden">
      {/* Top Application Header */}
      <Header />

      {/* Main Workspace (Inventory + Canvas + Inspector) */}
      <div className="flex-1 flex min-h-0 relative">
        <InventoryPanel />

        <main className="flex-1 h-full relative overflow-hidden" aria-label="Architecture Canvas">
          <Canvas />
          <Dashboard />
          <EventLogPanel />
          <RequestTraceDrawer />
          <RunSummaryModal />

          {/* Gentle Educational Hint Toast */}
          {hint && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-xl bg-[#18181b]/95 backdrop-blur border border-white/40 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
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

        <InspectorPanel />
      </div>

      {/* Bottom Simulation Control Bar */}
      <ControlBar />
    </div>
  );
};

export default App;
