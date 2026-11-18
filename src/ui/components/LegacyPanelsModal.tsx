/**
 * Temporary Legacy Panels Access Menu (R1 Specification).
 * Ensures that no existing features from Phases 1-10 are hidden or deleted while the
 * new information architecture from /docs/ia.md is reviewed and approved.
 */

import React from 'react';
import { useUiStore } from '../../store/uiStore';
import { useMetricsStore } from '../../store/metricsStore';
import { useSimulationStore } from '../../store/simulationStore';

interface LegacyPanelsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegacyPanelsModal: React.FC<LegacyPanelsModalProps> = ({ isOpen, onClose }) => {
  const toggleProjectLibrary = useUiStore((s) => s.toggleProjectLibrary);
  const toggleChaosPanel = useUiStore((s) => s.toggleChaosPanel);
  const toggleSettingsModal = useUiStore((s) => s.toggleSettingsModal);
  const toggleShortcuts = useUiStore((s) => s.toggleShortcuts);
  const setGuideOpen = useUiStore((s) => s.setGuideOpen);
  const setTourOpen = useUiStore((s) => s.setTourOpen);
  const setDashboardState = useMetricsStore((s) => s.setDashboardState);
  const toggleEventLog = useSimulationStore((s) => s.toggleEventLog);
  const openTrafficModal = useSimulationStore((s) => s.openTrafficModal);
  const setMode = useUiStore((s) => s.setMode);

  if (!isOpen) return null;

  const actions = [
    {
      title: 'Metrics Dashboard & Charts',
      desc: 'Deep-dive telemetry, capacity analysis, and 60s/All time charts',
      action: () => {
        setDashboardState('expanded');
        onClose();
      },
    },
    {
      title: 'Chaos & Failure Panel',
      desc: 'Inject node outages, latency spikes, and partitioned networks',
      action: () => {
        toggleChaosPanel();
        onClose();
      },
    },
    {
      title: 'Attack Console & Campaign Editor',
      desc: 'Attacker mode console with DDoS, slowloris, and brute-force campaigns',
      action: () => {
        setMode('attacker');
        onClose();
      },
    },
    {
      title: 'Live Event Log Panel',
      desc: 'Virtualized chronological stream of request processing events',
      action: () => {
        toggleEventLog();
        onClose();
      },
    },
    {
      title: 'Traffic & Arrival Pattern Modal',
      desc: 'Configure request rates, Poisson/burst patterns, and discrete vs aggregate mode',
      action: () => {
        openTrafficModal();
        onClose();
      },
    },
    {
      title: 'Project Library (Saved Designs)',
      desc: 'Browse, load, and manage locally saved architecture designs',
      action: () => {
        toggleProjectLibrary();
        onClose();
      },
    },
    {
      title: 'Interactive Tutorials & Guided Tour',
      desc: 'Step-by-step walkthroughs of core system design fundamentals',
      action: () => {
        setTourOpen(true);
        onClose();
      },
    },
    {
      title: 'Simulation Guide & Architecture Handbook',
      desc: 'Interactive documentation on nodes, slots, and distributed defense patterns',
      action: () => {
        setGuideOpen(true);
        onClose();
      },
    },
    {
      title: 'Keyboard Shortcuts Reference',
      desc: 'Hotkey cheatsheet (Space to Play, S to Step, R to Reset, ? for help)',
      action: () => {
        toggleShortcuts();
        onClose();
      },
    },
    {
      title: 'System & Engine Settings',
      desc: 'Worker thread configuration, animation caps, and PRNG seeds',
      action: () => {
        toggleSettingsModal();
        onClose();
      },
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in select-none font-mono text-xs"
      role="dialog"
      aria-label="Legacy Panels Menu"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] bg-[#111113] border border-[#27272A] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#27272A] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-[#F3EEE3] tracking-wide uppercase">
              Legacy Panels & Feature Directory
            </h2>
            <p className="text-[11px] text-[#A1A1AA]">
              Temporary access to all pre-redesign tools per Section 6 and /docs/ia.md.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded text-[#71717A] hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
            aria-label="Close Legacy Panels Modal"
          >
            ✕
          </button>
        </div>

        {/* Action list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {actions.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={item.action}
              className="w-full text-left p-3 rounded-lg bg-[#18181B] hover:bg-[#222226] border border-[#27272A] hover:border-white/40 transition-colors flex items-center justify-between group cursor-pointer"
            >
              <div className="space-y-0.5">
                <div className="font-semibold text-white group-hover:text-[#F3EEE3] text-xs">
                  {item.title}
                </div>
                <div className="text-[10px] text-[#A1A1AA]">{item.desc}</div>
              </div>
              <span className="text-white/40 group-hover:text-white text-xs pl-2">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LegacyPanelsModal;
