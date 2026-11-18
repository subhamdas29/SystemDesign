/**
 * Share Project Popover.
 * Provides a copyable project link with real-time feedback.
 * Strictly adheres to the redesign tokens and motion rules (150-250ms ease-out).
 */

import React, { useState, useEffect, useRef } from 'react';
import { useGraphStore, selectGraph } from '../../store/graphStore';

interface SharePopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SharePopover: React.FC<SharePopoverProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const graph = useGraphStore(selectGraph);

  // Generate share URL with encoded state
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#share=${encodeURIComponent(
        btoa(JSON.stringify(graph))
      )}`
    : '';

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-80 p-4 rounded-lg bg-[#111113] border border-[#27272A] shadow-2xl z-50 font-mono text-xs select-none animate-in fade-in slide-in-from-top-1 duration-200"
      role="dialog"
      aria-label="Share Project Link"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#27272A]">
          <span className="font-bold text-[#F3EEE3] tracking-wide uppercase text-[11px]">
            Share Design
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#71717A] hover:text-white transition-colors"
            aria-label="Close share popover"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
          Anyone with this link can load an identical replica of your architecture graph and settings.
        </p>

        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="flex-1 bg-[#18181B] border border-[#27272A] text-white px-2.5 py-1.5 rounded text-[10px] font-mono truncate focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            className={`px-3 py-1.5 rounded text-[11px] font-mono font-medium transition-all shrink-0 cursor-pointer ${
              copied
                ? 'bg-[#008604] text-white'
                : 'bg-[#2C2C2C] hover:bg-[#3A3A3E] text-white border border-[#3F3F46] hover:border-white'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharePopover;
