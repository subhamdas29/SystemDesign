import React from 'react';
import { ProjectData } from '../../storage/schema';
import { storage } from '../../storage/db';

interface SharedProjectBannerProps {
  sharedProject: ProjectData | null;
  onDismiss: () => void;
  onSavedAsCopy: () => void;
}

export const SharedProjectBanner: React.FC<SharedProjectBannerProps> = ({
  sharedProject,
  onDismiss,
  onSavedAsCopy,
}) => {
  if (!sharedProject) return null;

  const handleOpenAsMyCopy = async () => {
    const copy: ProjectData = {
      ...sharedProject,
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${sharedProject.name} (My Copy)`,
      updatedAt: Date.now(),
    };
    await storage.saveProject(copy);
    // Clear URL hash cleanly without reloading
    window.history.replaceState(null, '', window.location.pathname);
    onSavedAsCopy();
  };

  return (
    <div
      role="banner"
      className="w-full bg-[#161619] border-b border-[#27272a] px-4 py-2 flex items-center justify-between text-xs text-white z-30 shrink-0"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">🔗</span>
        <span>
          Viewing shared project:{' '}
          <strong className="text-white font-semibold">{sharedProject.name}</strong>.
          Changes made here will not overwrite the original link.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpenAsMyCopy}
          className="px-3 py-1 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors shadow-sm"
        >
          Open as my copy
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 text-[var(--color-text-muted)] hover:text-white rounded"
          aria-label="Dismiss banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
