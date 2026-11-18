/**
 * Profile Dropdown Menu (Top Navigation Right).
 * Offers Guide, Tutorials, Shortcuts, Settings, and the Legacy Panels directory.
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
  const toggleShortcuts = useUiStore((s) => s.toggleShortcuts);
  const toggleSettingsModal = useUiStore((s) => s.toggleSettingsModal);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-56 bg-[#111113] border border-[#27272A] rounded-lg shadow-2xl py-1 text-white font-mono text-xs z-50 select-none animate-in fade-in slide-in-from-top-1 duration-200"
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
        className="w-full text-left px-3.5 py-2 hover:bg-[#18181B] transition-colors flex items-center justify-between"
      >
        <span>Guide</span>
        <span className="text-[#71717A] text-[10px]">Handbook</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          setTourOpen(true);
        }}
        className="w-full text-left px-3.5 py-2 hover:bg-[#18181B] transition-colors flex items-center justify-between"
      >
        <span>Tutorials</span>
        <span className="text-[#71717A] text-[10px]">Interactive</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          toggleShortcuts();
        }}
        className="w-full text-left px-3.5 py-2 hover:bg-[#18181B] transition-colors flex items-center justify-between"
      >
        <span>Shortcuts</span>
        <span className="text-[#71717A] text-[10px]">?</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          toggleSettingsModal();
        }}
        className="w-full text-left px-3.5 py-2 hover:bg-[#18181B] transition-colors flex items-center justify-between"
      >
        <span>Settings</span>
        <span className="text-[#71717A] text-[10px]">Config</span>
      </button>

      <div className="h-px bg-[#27272A] my-1" />

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          onOpenLegacyPanels();
        }}
        className="w-full text-left px-3.5 py-2 text-[#D9541E] hover:bg-[#18181B] transition-colors flex items-center justify-between font-semibold"
      >
        <span>Legacy Panels</span>
        <span className="text-[10px] text-[#D9541E]/80">Section 6</span>
      </button>
    </div>
  );
};

export default ProfileDropdown;
