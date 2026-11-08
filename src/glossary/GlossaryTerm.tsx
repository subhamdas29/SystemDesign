import React, { useState } from 'react';
import { GLOSSARY_TERMS, GlossaryEntry } from './terms';

interface GlossaryTermProps {
  id: keyof typeof GLOSSARY_TERMS | string;
  children?: React.ReactNode;
  className?: string;
}

export const GlossaryTerm: React.FC<GlossaryTermProps> = ({ id, children, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const entry: GlossaryEntry | undefined = GLOSSARY_TERMS[id];

  if (!entry) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={() => setIsOpen(!isOpen)}
    >
      <span
        tabIndex={0}
        role="button"
        aria-label={`Explain ${entry.term}`}
        className="cursor-help underline decoration-dotted decoration-neutral-400 hover:decoration-white hover:text-white transition-colors"
      >
        {children || entry.term}
      </span>

      {isOpen && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-[#18181b] border border-[#3f3f46] rounded-xl shadow-2xl z-50 text-left pointer-events-none animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-1">
            <span>💡</span>
            <span>{entry.term}</span>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mb-2">
            {entry.definition}
          </p>
          <div className="p-2 rounded bg-white/5 border border-white/5 text-[10px] text-neutral-300 font-sans leading-normal">
            <strong className="text-white">Example: </strong>
            {entry.example}
          </div>
        </div>
      )}
    </span>
  );
};
