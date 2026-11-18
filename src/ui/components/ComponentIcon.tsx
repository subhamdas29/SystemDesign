/**
 * Infrastructure Component & UI Action Icon Component.
 * Powered by the typed icon registry with fallback neutral placeholder and dev warnings.
 * Adheres strictly to the redesign spec: 16px in nav/menus, ~48px on canvas, stroke-width 2.
 */

import React from 'react';
import type { ComponentType } from '@types';
import {
  getComponentIconSvg,
  getUiActionIconSvg,
  ComponentIconKey,
  UiActionIconKey,
} from '../../design/iconRegistry';

interface ComponentIconProps {
  type: ComponentType | ComponentIconKey | UiActionIconKey | string;
  isAction?: boolean;
  className?: string;
  size?: number;
  color?: string;
  overrideSvg?: string;
}

export const ComponentIcon: React.FC<ComponentIconProps> = ({
  type,
  isAction = false,
  className = '',
  size = 48,
  color,
  overrideSvg,
}) => {
  const isThreat = type === 'threat-source' || type === 'threat';
  const defaultColor = isThreat ? '#D9541E' : '#FFFFFF';
  const finalColor = color ?? defaultColor;

  const rawSvg =
    overrideSvg ??
    (isAction
      ? getUiActionIconSvg(type as UiActionIconKey)
      : getComponentIconSvg(type as ComponentIconKey));

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        color: finalColor,
      }}
      title={`${type} icon`}
      dangerouslySetInnerHTML={{
        __html: rawSvg.replace(
          /<svg([^>]*)(width="[^"]*")?([^>]*)(height="[^"]*")?([^>]*)>/,
          `<svg$1$3$5 width="${size}" height="${size}" style="max-width:100%;max-height:100%;display:block;stroke-width:2px;">`
        ),
      }}
    />
  );
};

export default ComponentIcon;
