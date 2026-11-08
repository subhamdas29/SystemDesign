import React from 'react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Play / Pause simulation' },
    { key: 'S', desc: 'Step forward one discrete event' },
    { key: 'R', desc: 'Reset simulation to t = 0' },
    { key: '1 / 2 / 4 / 8', desc: 'Set simulation playback speed' },
    { key: '?', desc: 'Toggle keyboard shortcuts reference' },
    { key: 'Esc', desc: 'Close active dialog, modal, or drawer' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4"
    >
      <div className="w-full max-w-md bg-[#141416] border border-[#27272a] rounded-2xl shadow-2xl p-6 text-white font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-[#27272a] mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⌨️</span>
            <h2 id="shortcuts-modal-title" className="text-sm font-semibold">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--color-text-muted)] hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2.5">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-[#18181b] border border-[#27272a]"
            >
              <span className="text-xs text-[var(--color-text-muted)]">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-[#27272a] text-white font-mono text-xs border border-[#3f3f46] shadow-sm">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
