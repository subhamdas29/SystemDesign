/**
 * Minimalist Coming Soon Page for Problems and Interview modes.
 * Built strictly with redesign tokens: #0B0B0D canvas background, Cream #F3EEE3 typography,
 * Burnt Orange #D9541E accents. No fake content, no placeholder cards.
 */

import React from 'react';
import { useUiStore } from '../../store/uiStore';

interface ComingSoonPageProps {
  title: string;
  subtitle: string;
  badge: string;
  actionLabel?: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({
  title,
  subtitle,
  badge,
  actionLabel = 'Back to Create',
}) => {
  const setActiveNavTab = useUiStore((s) => s.setActiveNavTab);

  return (
    <div
      className="flex-1 w-full h-full flex flex-col items-center justify-center p-8 select-none font-mono text-center"
      style={{ backgroundColor: '#0B0B0D' }}
    >
      <div className="max-w-md space-y-4">
        {/* Category Badge */}
        <div className="inline-block px-2.5 py-1 text-[11px] font-mono tracking-widest text-[#D9541E] uppercase border border-[#D9541E]/40 rounded">
          {badge}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold tracking-tight text-[#F3EEE3]">
          {title}
        </h1>

        {/* Subtitle */}
        <p className="text-xs text-[#A1A1AA] leading-relaxed">
          {subtitle}
        </p>

        {/* Return Button */}
        <div className="pt-4">
          <button
            type="button"
            onClick={() => setActiveNavTab('create')}
            className="px-4 py-2 rounded text-xs font-mono font-medium bg-[#2C2C2C] hover:bg-[#3A3A3E] text-white border border-[#3F3F46] hover:border-white transition-all cursor-pointer"
          >
            ← {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonPage;
