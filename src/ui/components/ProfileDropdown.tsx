/**
 * Profile Dropdown Menu (Top Navigation Right).
 * Per R1 fix: Contains Guide and Tutorials only, plus a temporary "Legacy panels" entry (plain label).
 * Removed internal reference text ("Section 6"), Shortcuts, and Settings.
 */

import React, { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/uiStore';

interface ProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLegacyPanels: () => void;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  isOpen,
  onClose,
  onOpenLegacyPanels,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const setGuideOpen = useUiStore((s) => s.setGuideOpen);
  const setTourOpen = useUiStore((s) => s.setTourOpen);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-52 bg-[#1B1E24] border border-[#2A2E39] rounded shadow-2xl py-1 text-[#F3EEE3] font-mono text-xs z-50 select-none animate-in fade-in slide-in-from-top-1 duration-150"
      role="menu"
      aria-label="Profile and Help Menu"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          setGuideOpen(true);
        }}
        className="w-full text-left px-3.5 py-2 hover:bg-[#252932] transition-colors flex items-center justify-between text-xs"
      >
        <span>Guide</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          setTourOpen(true);
        }}
        className="w-full text-left px-3.5 py-2 hover:bg-[#252932] transition-colors flex items-center justify-between text-xs"
      >
        <span>Tutorials</span>
      </button>

      <div className="h-px bg-[#2A2E39] my-1" />

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          onOpenLegacyPanels();
        }}
        className="w-full text-left px-3.5 py-2 text-[#D9541E] hover:bg-[#252932] transition-colors flex items-center justify-between text-xs font-medium"
      >
        <span>Legacy panels</span>
      </button>
    </div>
  );
};

export default ProfileDropdown;
