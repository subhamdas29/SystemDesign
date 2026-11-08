/**
 * Infrastructure Component Icon Badge.
 * Renders each logo in a uniform square badge with object-fit: contain.
 * Logos on transparent backgrounds receive a subtle light-silver badge background
 * ensuring clear contrast on the dark canvas.
 * Missing assets render a distinct, branded typographic badge so components
 * sharing placeholders are immediately distinguishable.
 */

import React from 'react';
import { ComponentType } from '@types';
import { getComponentImageUrl } from '@design/resourceRegistry';

interface ComponentIconProps {
  type: ComponentType;
  className?: string;
  size?: number;
}

const PLACEHOLDER_LABELS: Record<string, string> = {
  firewall: 'FW',
  waf: 'WAF',
  'rate-limiter': 'RL',
  router: 'RTR',
  'message-queue': 'MQ',
  client: 'CLI',
  dns: 'DNS',
  cdn: 'CDN',
  'load-balancer': 'LB',
  'api-gateway': 'GW',
  'app-server': 'APP',
  cache: 'MEM',
  database: 'DB',
  worker: 'WRK',
  'database-replica': 'REP',
};

export const ComponentIcon: React.FC<ComponentIconProps> = ({
  type,
  className = '',
  size = 36,
}) => {
  const imageUrl = getComponentImageUrl(type);
  const shortLabel = PLACEHOLDER_LABELS[type] ?? type.slice(0, 3).toUpperCase();

  return (
    <div
      className={`relative shrink-0 rounded-lg flex items-center justify-center overflow-hidden transition-all duration-150 bg-[#1c1c22] border border-[#3f3f46] shadow-sm ${className}`}
      style={{ width: size, height: size }}
      title={`${type} component`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${type} icon`}
          className="w-full h-full object-contain p-1 filter contrast-125 brightness-110 drop-shadow-sm select-none"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#222228] to-[#141418] border border-white/20 rounded-[6px]">
          <span className="font-mono font-bold text-[10px] text-white tracking-wider">
            {shortLabel}
          </span>
        </div>
      )}
    </div>
  );
};
