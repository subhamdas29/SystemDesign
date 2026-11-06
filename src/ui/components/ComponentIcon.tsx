import React from 'react';
import { ComponentType } from '@types';
import { getComponentImageUrl } from '@design/resourceRegistry';

interface ComponentIconProps {
  type: ComponentType;
  className?: string;
  size?: number;
}

/**
 * Renders the infrastructure image for a component, or a neutral silver-outline
 * placeholder icon if the resource is missing.
 */
export const ComponentIcon: React.FC<ComponentIconProps> = ({
  type,
  className = 'w-8 h-8',
  size = 32,
}) => {
  const imageUrl = getComponentImageUrl(type);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={`${type} icon`}
        className={`${className} object-contain filter grayscale contrast-125 brightness-110 drop-shadow`}
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }

  // Neutral silver-outline placeholder icon
  return (
    <div
      className={`flex items-center justify-center rounded border border-[var(--color-border-silver)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] shadow-sm ${className}`}
      style={{ width: size, height: size }}
      title={`Placeholder for ${type}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 text-[var(--color-text-secondary)]"
      >
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    </div>
  );
};
