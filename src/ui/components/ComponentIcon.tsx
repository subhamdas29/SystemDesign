/**
 * Infrastructure Component Icon Component.
 * Inlines normalized SVGs from /src/assets/icons with currentColor.
 * Matches the redesign aesthetic: crisp white line icons on dark canvas,
 * burnt orange for threats, 16px in nav/menus, ~48px on canvas.
 */

import React from 'react';
import type { ComponentType } from '@types';

import apiGatewaySvg from '../../assets/icons/api-gateway.svg?raw';
import appServerSvg from '../../assets/icons/app-server.svg?raw';
import cdnSvg from '../../assets/icons/cdn.svg?raw';
import clientSvg from '../../assets/icons/client.svg?raw';
import databaseSvg from '../../assets/icons/database.svg?raw';
import databaseReplicaSvg from '../../assets/icons/database-replica.svg?raw';
import dnsSvg from '../../assets/icons/dns.svg?raw';
import firewallSvg from '../../assets/icons/firewall.svg?raw';
import kafkaSvg from '../../assets/icons/kafka.svg?raw';
import loadBalancerSvg from '../../assets/icons/load-balancer.svg?raw';
import nginxReverseProxySvg from '../../assets/icons/nginx-reverse-proxy.svg?raw';
import rateLimiterSvg from '../../assets/icons/rate-limiter.svg?raw';
import redisSvg from '../../assets/icons/redis.svg?raw';
import threatSvg from '../../assets/icons/threat.svg?raw';
import wafSvg from '../../assets/icons/waf.svg?raw';
import workerSvg from '../../assets/icons/worker.svg?raw';

const SVG_MAP: Record<string, string> = {
  client: clientSvg,
  dns: dnsSvg,
  cdn: cdnSvg,
  'load-balancer': loadBalancerSvg,
  'api-gateway': apiGatewaySvg,
  router: nginxReverseProxySvg,
  'app-server': appServerSvg,
  cache: redisSvg,
  database: databaseSvg,
  'database-replica': databaseReplicaSvg,
  'message-queue': kafkaSvg,
  worker: workerSvg,
  'rate-limiter': rateLimiterSvg,
  waf: wafSvg,
  firewall: firewallSvg,
  'threat-source': threatSvg,
};

interface ComponentIconProps {
  type: ComponentType | 'threat-source' | string;
  className?: string;
  size?: number;
  color?: string;
}

export const ComponentIcon: React.FC<ComponentIconProps> = ({
  type,
  className = '',
  size = 48,
  color,
}) => {
  const isThreat = type === 'threat-source' || type === 'threat';
  const defaultColor = isThreat ? '#D9541E' : '#FFFFFF';
  const finalColor = color ?? defaultColor;
  const rawSvg = SVG_MAP[type] ?? clientSvg;

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        color: finalColor,
      }}
      title={`${type} component`}
      dangerouslySetInnerHTML={{
        __html: rawSvg.replace(
          /<svg([^>]*)(width="[^"]*")?([^>]*)(height="[^"]*")?([^>]*)>/,
          `<svg$1$3$5 width="${size}" height="${size}" style="max-width:100%;max-height:100%;display:block;stroke-width:2px;">`
        ),
      }}
    />
  );
};
