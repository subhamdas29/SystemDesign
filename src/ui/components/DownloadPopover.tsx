/**
 * Download Architecture Popover.
 * Allows downloading the architecture as JSON, with PNG/JPEG shown as disabled next-step options.
 * Adheres strictly to the redesign tokens and motion rules.
 */

import React, { useEffect, useRef } from 'react';
import { useGraphStore, selectGraph } from '../../store/graphStore';

interface DownloadPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadPopover: React.FC<DownloadPopoverProps> = ({ isOpen, onClose }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const graph = useGraphStore(selectGraph);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose]);

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(graph, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `life-of-a-request-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-72 p-3 rounded-lg bg-[#111113] border border-[#27272A] shadow-2xl z-50 font-mono text-xs select-none animate-in fade-in slide-in-from-top-1 duration-200"
      role="dialog"
      aria-label="Download Project Architecture"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-[#27272A]">
          <span className="font-bold text-[#F3EEE3] tracking-wide uppercase text-[11px]">
            Export Design
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#71717A] hover:text-white transition-colors"
            aria-label="Close download popover"
          >
            ✕
          </button>
        </div>

        {/* 1. Architecture JSON - Active */}
        <button
          type="button"
          onClick={handleDownloadJson}
          className="w-full text-left p-2.5 rounded bg-[#18181B] hover:bg-[#222226] border border-[#27272A] hover:border-white/40 transition-colors flex items-center justify-between group cursor-pointer"
        >
          <div>
            <div className="font-semibold text-white text-xs">Architecture JSON</div>
            <div className="text-[10px] text-[#A1A1AA]">Full deterministic configuration (.json)</div>
          </div>
          <span className="text-white/60 group-hover:text-white text-xs">↓</span>
        </button>

        {/* 2. PNG Image - Disabled Next Step */}
        <div
          className="w-full text-left p-2.5 rounded bg-[#131316] border border-[#1E1E22] opacity-50 cursor-not-allowed flex items-center justify-between"
          title="Coming in the next step"
        >
          <div>
            <div className="font-semibold text-[#A1A1AA] text-xs">PNG Snapshot</div>
            <div className="text-[10px] text-[#71717A]">High-res diagram export (.png)</div>
          </div>
          <span className="text-[9px] text-[#D9541E] uppercase font-bold tracking-wider">
            Coming next
          </span>
        </div>

        {/* 3. JPEG Image - Disabled Next Step */}
        <div
          className="w-full text-left p-2.5 rounded bg-[#131316] border border-[#1E1E22] opacity-50 cursor-not-allowed flex items-center justify-between"
          title="Coming in the next step"
        >
          <div>
            <div className="font-semibold text-[#A1A1AA] text-xs">JPEG Compressed</div>
            <div className="text-[10px] text-[#71717A]">Optimized web graphic (.jpeg)</div>
          </div>
          <span className="text-[9px] text-[#D9541E] uppercase font-bold tracking-wider">
            Coming next
          </span>
        </div>
      </div>
    </div>
  );
};

export default DownloadPopover;
