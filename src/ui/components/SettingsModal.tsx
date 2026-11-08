import React, { useState } from 'react';
import { storage } from '../../storage/db';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [packetCap, setPacketCap] = useState<number>(() => {
    return Number(localStorage.getItem('setting_packet_cap') || '200');
  });
  const [numberFormat, setNumberFormat] = useState<'compact' | 'full'>(() => {
    return (localStorage.getItem('setting_number_format') as any) || 'compact';
  });
  const [adaptiveQuality, setAdaptiveQuality] = useState<boolean>(() => {
    return localStorage.getItem('setting_adaptive_quality') !== 'false';
  });
  const [showReadout, setShowReadout] = useState<boolean>(() => {
    return localStorage.getItem('setting_show_readout') !== 'false';
  });
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  const handleSavePacketCap = (cap: number) => {
    setPacketCap(cap);
    localStorage.setItem('setting_packet_cap', String(cap));
  };

  const handleSaveNumberFormat = (fmt: 'compact' | 'full') => {
    setNumberFormat(fmt);
    localStorage.setItem('setting_number_format', fmt);
  };

  const handleToggleAdaptive = () => {
    const val = !adaptiveQuality;
    setAdaptiveQuality(val);
    localStorage.setItem('setting_adaptive_quality', String(val));
  };

  const handleToggleReadout = () => {
    const val = !showReadout;
    setShowReadout(val);
    localStorage.setItem('setting_show_readout', String(val));
  };

  const handleClearAll = async () => {
    await storage.clearAllData();
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4"
    >
      <div className="w-full max-w-md bg-[#141416] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden text-white font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 id="settings-modal-title" className="text-base font-semibold">
                Simulator Settings
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Performance, formatting, and storage preferences
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Packet Concurrency Cap */}
          <div>
            <label className="block text-xs font-semibold text-white mb-1.5">
              Packet Concurrency Cap
            </label>
            <div className="flex items-center gap-2">
              {[50, 100, 200].map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => handleSavePacketCap(cap)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    packetCap === cap
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'bg-[#18181b] hover:bg-[#222226] border border-[#27272a] text-neutral-300'
                  }`}
                >
                  {cap} Packets
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[var(--color-text-faint)] mt-1">
              Limits the maximum simultaneous animated packets rendered on canvas.
            </p>
          </div>

          {/* Number Formatting */}
          <div>
            <label className="block text-xs font-semibold text-white mb-1.5">
              Number Formatting
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSaveNumberFormat('compact')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  numberFormat === 'compact'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'bg-[#18181b] hover:bg-[#222226] border border-[#27272a] text-neutral-300'
                  }`}
              >
                Compact (1.2M, 50k)
              </button>
              <button
                type="button"
                onClick={() => handleSaveNumberFormat('full')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  numberFormat === 'full'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'bg-[#18181b] hover:bg-[#222226] border border-[#27272a] text-neutral-300'
                  }`}
              >
                Full (1,200,000)
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2 border-t border-[#222226]">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">Adaptive Performance Quality</p>
                <p className="text-[11px] text-[var(--color-text-faint)]">
                  Automatically lower packet caps if frame budget exceeds 16.6ms
                </p>
              </div>
              <input
                type="checkbox"
                checked={adaptiveQuality}
                onChange={handleToggleAdaptive}
                className="w-4 h-4 rounded bg-neutral-800 border-neutral-600 text-white cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">Show Simulation Readout Badge</p>
                <p className="text-[11px] text-[var(--color-text-faint)]">
                  Display bottom-left badge showing simulated RPS and in-flight count
                </p>
              </div>
              <input
                type="checkbox"
                checked={showReadout}
                onChange={handleToggleReadout}
                className="w-4 h-4 rounded bg-neutral-800 border-neutral-600 text-white cursor-pointer"
              />
            </div>
          </div>

          {/* Data Reset */}
          <div className="pt-3 border-t border-[#222226]">
            <label className="block text-xs font-semibold text-red-400 mb-1">
              Data Management
            </label>
            {confirmClear ? (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/80 space-y-2">
                <p className="text-xs text-red-200">
                  Are you sure? This will permanently delete all saved projects, autosaves, and preferences.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-semibold rounded text-xs transition-colors"
                  >
                    Yes, Delete Everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-xs font-medium text-red-300 transition-colors"
              >
                Clear All Local Data & Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
