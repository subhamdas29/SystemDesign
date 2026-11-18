import React, { useState, useEffect } from 'react';
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
import { AttackConsole } from './ui/components/AttackConsole';
import { ScenarioDetailsModal } from './ui/components/ScenarioDetailsModal';
import { SimulationErrorBanner } from './ui/components/SimulationErrorBanner';
import { ProjectLibraryModal } from './ui/components/ProjectLibraryModal';
import { ShareModal } from './ui/components/ShareModal';
import { SharedProjectBanner } from './ui/components/SharedProjectBanner';
import { ExampleGalleryModal } from './ui/components/ExampleGalleryModal';
import { SettingsModal } from './ui/components/SettingsModal';
import { WelcomeTour, shouldShowWelcomeTour } from './ui/tour/WelcomeTour';
import { TutorialRunner } from './ui/tour/TutorialRunner';
import { KeyboardShortcutsModal } from './ui/help/KeyboardShortcutsModal';
import { SimulationGuideModal } from './ui/help/SimulationGuideModal';
import { TUTORIALS } from './scenarios/tutorials/catalog';
import { useAutosave } from './storage/useAutosave';
import { ComingSoonPage } from './ui/pages/ComingSoonPage';
import { PresetsPage } from './ui/pages/PresetsPage';
import {
  useUiStore,
  selectHint,
  selectActiveNavTab,
  selectIsFocusMode,
  selectIsInventoryOpen,
  selectIsInspectorOpen,
  selectIsProjectLibraryOpen,
  selectIsShareModalOpen,
  selectIsExampleGalleryOpen,
  selectIsSettingsModalOpen,
  selectIsTourOpen,
  selectIsShortcutsOpen,
  selectIsGuideOpen,
  selectActiveTutorialId,
  useAttackStore,
} from '@store';

export const App: React.FC = () => {
  const hint = useUiStore(selectHint);
  const setHint = useUiStore((s) => s.setHint);

  const activeNavTab = useUiStore(selectActiveNavTab);
  const isFocusMode = useUiStore(selectIsFocusMode);
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode);

  const isInventoryOpen = useUiStore(selectIsInventoryOpen);
  const isInspectorOpen = useUiStore(selectIsInspectorOpen);
  const isAttackerMode = useAttackStore((s) => s.isAttackerMode);

  // Modals state
  const isProjectLibraryOpen = useUiStore(selectIsProjectLibraryOpen);
  const setProjectLibraryOpen = useUiStore((s) => s.setProjectLibraryOpen);
  const isShareModalOpen = useUiStore(selectIsShareModalOpen);
  const setShareModalOpen = useUiStore((s) => s.setShareModalOpen);
  const isExampleGalleryOpen = useUiStore(selectIsExampleGalleryOpen);
  const setExampleGalleryOpen = useUiStore((s) => s.setExampleGalleryOpen);
  const isSettingsModalOpen = useUiStore(selectIsSettingsModalOpen);
  const setSettingsModalOpen = useUiStore((s) => s.setSettingsModalOpen);
  const isTourOpen = useUiStore(selectIsTourOpen);
  const setTourOpen = useUiStore((s) => s.setTourOpen);
  const isShortcutsOpen = useUiStore(selectIsShortcutsOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const isGuideOpen = useUiStore(selectIsGuideOpen);
  const setGuideOpen = useUiStore((s) => s.setGuideOpen);
  const activeTutorialId = useUiStore(selectActiveTutorialId);
  const exitTutorial = useUiStore((s) => s.exitTutorial);

  // Responsive / Mobile screen warning
  const [isMobileScreen, setIsMobileScreen] = useState(false);
  const [isMobileBannerDismissed, setIsMobileBannerDismissed] = useState(false);

  // Autosave & Share Link Management
  const { sharedProject, clearSharedProject } = useAutosave();

  // First-run welcome tour check
  useEffect(() => {
    if (shouldShowWelcomeTour() && !window.location.hash.includes('#share=')) {
      setTourOpen(true);
    }
  }, [setTourOpen]);

  // Window resize check for responsive layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeTutorial = TUTORIALS.find((t) => t.id === activeTutorialId) || null;

  return (
    <div className="h-full w-full min-h-[100dvh] flex flex-col bg-[#0b0b0d] text-white overflow-hidden select-none font-sans">
      {/* Mobile Screen Notice */}
      {isMobileScreen && !isMobileBannerDismissed && (
        <div className="bg-amber-950/90 border-b border-amber-600/60 px-4 py-2 text-xs text-amber-200 flex items-center justify-between z-50">
          <span>📱 Life of a Request is best viewed on a larger screen (tablet or desktop).</span>
          <button
            type="button"
            onClick={() => setIsMobileBannerDismissed(true)}
            className="p-1 text-white hover:text-amber-300 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Shared Project Banner */}
      <SharedProjectBanner
        sharedProject={sharedProject}
        onDismiss={clearSharedProject}
        onSavedAsCopy={clearSharedProject}
      />

      {/* 1. Header (Hidden in Focus/Clean Eye Mode) */}
      {!isFocusMode && <Header />}

      {/* Floating Exit Button for Eye / Clean Mode */}
      {isFocusMode && (
        <button
          type="button"
          onClick={toggleFocusMode}
          title="Restore Application Navigation and Controls (Esc)"
          aria-label="Restore Application UI"
          className="absolute top-4 left-4 z-50 px-3 py-1.5 rounded-full bg-[#18181B]/90 hover:bg-[#222226] border border-[#3F3F46] hover:border-white text-white font-mono text-[11px] shadow-2xl transition-all flex items-center gap-2 cursor-pointer backdrop-blur-md"
        >
          <span className="w-2 h-2 rounded-full bg-[#D9541E] inline-block" />
          <span>Show UI (Esc)</span>
        </button>
      )}

      {/* 2. Workspace Content based on activeNavTab */}
      {activeNavTab === 'create' ? (
        <>
          <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden">
            {/* Left Column: Inventory Panel or Attack Console (Hidden in Focus Mode) */}
            {!isFocusMode && isInventoryOpen && (
              <div className="w-[340px] max-w-[85vw] h-full shrink-0 relative overflow-hidden z-10 transition-all duration-200">
                {isAttackerMode ? <AttackConsole /> : <InventoryPanel />}
              </div>
            )}

            {/* Center Column: Central Canvas */}
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
              <ScenarioDetailsModal />
              <SimulationErrorBanner />

              {/* Active Interactive Tutorial Runner */}
              <TutorialRunner tutorial={activeTutorial} onExit={exitTutorial} />

              {/* Gentle Educational Hint Toast */}
              {hint && !isFocusMode && (
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

            {/* Right Column: Inspector Panel (Hidden in Focus Mode) */}
            {!isFocusMode && isInspectorOpen && (
              <div className="w-[360px] max-w-[85vw] h-full shrink-0 relative overflow-hidden z-10 transition-all duration-200">
                <InspectorPanel />
              </div>
            )}
          </div>

          {/* 3. Bottom Control Bar (Hidden in Focus Mode) */}
          {!isFocusMode && <ControlBar />}
        </>
      ) : activeNavTab === 'presets' ? (
        <PresetsPage />
      ) : activeNavTab === 'problems' ? (
        <ComingSoonPage
          title="System Design Challenges & Problems"
          subtitle="Curated architecture interview problems with realistic traffic patterns, automated grading, and constraint verification."
          badge="Problems Mode"
        />
      ) : (
        <ComingSoonPage
          title="Interactive Architecture Interview"
          subtitle="Real-time multi-tier system design interview simulations with adaptive workload testing and architectural trade-off evaluations."
          badge="Interview Mode"
        />
      )}

      {/* Modals & Overlays */}
      <ProjectLibraryModal
        isOpen={isProjectLibraryOpen}
        onClose={() => setProjectLibraryOpen(false)}
      />
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
      <ExampleGalleryModal
        isOpen={isExampleGalleryOpen}
        onClose={() => setExampleGalleryOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
      <WelcomeTour
        isOpen={isTourOpen}
        onClose={() => setTourOpen(false)}
      />
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <SimulationGuideModal
        isOpen={isGuideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </div>
  );
};

export default App;
