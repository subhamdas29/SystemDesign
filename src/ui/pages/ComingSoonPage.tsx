/**
 * Minimalist Coming Soon Page for Problems and Interview modes.
 * Per R1 fix: shows ONLY a short centered "Coming soon" message in the same visual language.
 * No feature descriptions, no mode tags, no back buttons.
 */

import React from 'react';

interface ComingSoonPageProps {
  label?: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = () => {
  return (
    <div
      className="flex-1 w-full h-full flex flex-col items-center justify-center p-8 select-none font-mono text-center"
      style={{ backgroundColor: '#0B0B0D' }}
    >
      <div className="text-sm font-mono tracking-wider text-[#F3EEE3]">
        Coming soon
      </div>
    </div>
  );
};

export default ComingSoonPage;
