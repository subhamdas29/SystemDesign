import React, { useState, useEffect } from 'react';
import { encodeProjectToShareLink, ShareEncodeResult } from '../../storage/share';
import { exportProjectAsJson } from '../../storage/library';
import { ProjectData } from '../../storage/schema';
import { useGraphStore, useSimulationStore } from '@store';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose }) => {
  const [shareData, setShareData] = useState<ShareEncodeResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [isEncoding, setIsEncoding] = useState(false);

  const graph = useGraphStore((s) => s.graph);
  const trafficConfig = useSimulationStore((s) => s.trafficConfig);

  useEffect(() => {
    if (isOpen) {
      setIsEncoding(true);
      setCopied(false);
      setCopiedMd(false);

      const project: ProjectData = {
        id: `share-${Date.now()}`,
        name: 'Shared Architecture',
        version: 2,
        graph,
        traffic: trafficConfig,
        scenarioScript: useSimulationStore.getState().scenarioScript,
        seed: useSimulationStore.getState().seed,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        uiPreferences: {
          displayMode: useSimulationStore.getState().displayMode,
          speed: useSimulationStore.getState().speed,
          showReadout: true,
        },
      };

      encodeProjectToShareLink(project)
        .then((res) => {
          setShareData(res);
          setIsEncoding(false);
        })
        .catch(() => {
          setIsEncoding(false);
        });
    }
  }, [isOpen, graph, trafficConfig]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    if (!shareData) return;
    await navigator.clipboard.writeText(shareData.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMarkdown = async () => {
    if (!shareData) return;
    const md = `[Life of a Request: System Architecture](${shareData.url})`;
    await navigator.clipboard.writeText(md);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  const handleExportJson = () => {
    const project: ProjectData = {
      id: `share-${Date.now()}`,
      name: 'Shared Architecture',
      version: 2,
      graph,
      traffic: trafficConfig,
      scenarioScript: useSimulationStore.getState().scenarioScript,
      seed: useSimulationStore.getState().seed,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const jsonStr = exportProjectAsJson(project);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `architecture-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4"
    >
      <div className="w-full max-w-lg bg-[#141416] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden text-white font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🔗</span>
            <div>
              <h2 id="share-modal-title" className="text-base font-semibold">
                Share Architecture
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Encode complete system configuration into a shareable URL
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
        <div className="p-6 space-y-4">
          {isEncoding ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
              Compressing architecture state...
            </div>
          ) : shareData ? (
            <>
              {shareData.isOversized && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/50 flex items-start gap-2.5 text-xs text-amber-200"
                >
                  <span className="text-base leading-none shrink-0">⚠️</span>
                  <div>
                    <p className="font-semibold text-white">Large URL Warning</p>
                    <p className="mt-0.5 text-amber-300/90 leading-relaxed">
                      This link contains {shareData.length.toLocaleString()} characters and exceeds the recommended 2,000 character limit. It may be truncated by some chat apps. For large systems, exporting JSON is recommended.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">
                  Shareable Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareData.url}
                    className="flex-1 px-3 py-2 bg-black border border-[#27272a] rounded-lg text-xs font-mono text-neutral-300 focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3.5 py-2 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors shrink-0 shadow-sm"
                  >
                    {copied ? 'Copied! ✓' : 'Copy Link'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#222226]">
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="flex-1 py-2 rounded-lg bg-[#18181b] hover:bg-[#222226] border border-[#27272a] text-xs font-medium text-white transition-colors"
                >
                  {copiedMd ? 'Copied Markdown! ✓' : 'Copy as Markdown'}
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="flex-1 py-2 rounded-lg bg-[#18181b] hover:bg-[#222226] border border-[#27272a] text-xs font-medium text-white transition-colors"
                >
                  Export JSON File
                </button>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-xs text-red-400">
              Failed to generate share link.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
