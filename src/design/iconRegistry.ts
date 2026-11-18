/**
 * Typed Icon Registry for "Life of a Request".
 * Maps component keys and UI actions to normalized SVGs with neutral fallbacks and dev warnings.
 */

import type { ComponentType } from '../types';

// Raw SVG imports from src/assets/icons/
import apiGatewaySvg from '../assets/icons/api-gateway.svg?raw';
import appServerSvg from '../assets/icons/app-server.svg?raw';
import arrowDropDownSvg from '../assets/icons/arrow_drop_down.svg?raw';
import cdnSvg from '../assets/icons/cdn.svg?raw';
import clientSvg from '../assets/icons/client.svg?raw';
import databaseReplicaSvg from '../assets/icons/database-replica.svg?raw';
import databaseSvg from '../assets/icons/database.svg?raw';
import dnsSvg from '../assets/icons/dns.svg?raw';
import downloadSvg from '../assets/icons/download.svg?raw';
import eyeSvg from '../assets/icons/eye.svg?raw';
import firewallSvg from '../assets/icons/firewall.svg?raw';
import folderSvg from '../assets/icons/Folder.svg?raw';
import handSvg from '../assets/icons/hand.svg?raw';
import inventorySvg from '../assets/icons/inventory.svg?raw';
import kafkaSvg from '../assets/icons/kafka.svg?raw';
import layersSvg from '../assets/icons/Layers.svg?raw';
import loadBalancerSvg from '../assets/icons/load-balancer.svg?raw';
import nginxReverseProxySvg from '../assets/icons/nginx-reverse-proxy.svg?raw';
import rateLimiterSvg from '../assets/icons/rate-limiter.svg?raw';
import redisSvg from '../assets/icons/redis.svg?raw';
import shareSvg from '../assets/icons/share.svg?raw';
import threatSvg from '../assets/icons/threat.svg?raw';
import userSvg from '../assets/icons/User.svg?raw';
import wafSvg from '../assets/icons/waf.svg?raw';
import workerSvg from '../assets/icons/worker.svg?raw';

export type ComponentIconKey = ComponentType | 'threat-source' | 'threat';

export type UiActionIconKey =
  | 'folder'
  | 'share'
  | 'download'
  | 'user'
  | 'profile'
  | 'inventory'
  | 'eye'
  | 'hand'
  | 'layers'
  | 'caret_down'
  | 'play'
  | 'pause'
  | 'step'
  | 'reset'
  | 'chaos'
  | 'undo'
  | 'redo'
  | 'settings'
  | 'close'
  | 'help';

/** Neutral SVG placeholder: a stroked geometric box with an interior notch */
export const NEUTRAL_PLACEHOLDER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="18" height="18" rx="3" />
  <circle cx="12" cy="12" r="3" />
</svg>`;

/** Component icons map */
const COMPONENT_ICONS: Record<string, string> = {
  client: clientSvg,
  dns: dnsSvg,
  cdn: cdnSvg,
  'load-balancer': loadBalancerSvg,
  'api-gateway': apiGatewaySvg,
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
  threat: threatSvg,
  // Note: 'router' uses reverse proxy SVG as temporary bridge
  router: nginxReverseProxySvg,
};

/** UI action icons map */
const UI_ACTION_ICONS: Record<string, string> = {
  folder: folderSvg,
  share: shareSvg,
  download: downloadSvg,
  user: userSvg,
  profile: userSvg,
  inventory: inventorySvg,
  eye: eyeSvg,
  hand: handSvg,
  layers: layersSvg,
  caret_down: arrowDropDownSvg,
};

/** Missing icons cataloged for user visibility */
export const MISSING_ICONS = [
  'router (dedicated router icon missing from /design-reference/icons; currently aliased to nginx-reverse-proxy.svg)',
  'play (UI action without dedicated SVG in /design-reference/icons; rendered as text label per section 4)',
  'pause (UI action without dedicated SVG; rendered as text label per section 4)',
  'step (UI action without dedicated SVG; rendered as text label per section 4)',
  'reset (UI action without dedicated SVG; rendered as text label per section 4)',
  'chaos (UI action without dedicated SVG; rendered as text label per section 3)',
  'undo (UI action without dedicated SVG; rendered as text label per section 3)',
  'redo (UI action without dedicated SVG; rendered as text label per section 3)',
  'settings (UI action without dedicated SVG; rendered as text label per section 3)',
  'close (UI action without dedicated SVG; rendered with native typographic glyph)',
  'help (UI action without dedicated SVG; rendered in profile dropdown)',
] as const;

/**
 * Retrieves the SVG markup for a given component key.
 * Logs a dev warning and returns a neutral placeholder if missing.
 */
export function getComponentIconSvg(key: ComponentIconKey | string): string {
  const svg = COMPONENT_ICONS[key];
  if (!svg) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn(`[IconRegistry] Missing icon for component key: "${key}". Using neutral placeholder.`);
    }
    return NEUTRAL_PLACEHOLDER_SVG;
  }
  return svg;
}

/**
 * Retrieves the SVG markup for a given UI action key.
 * Logs a dev warning and returns a neutral placeholder if missing.
 */
export function getUiActionIconSvg(key: UiActionIconKey | string): string {
  const svg = UI_ACTION_ICONS[key];
  if (!svg) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn(`[IconRegistry] Missing icon for UI action key: "${key}". Using neutral placeholder.`);
    }
    return NEUTRAL_PLACEHOLDER_SVG;
  }
  return svg;
}

/**
 * Checks whether an icon exists in the registry.
 */
export function hasIcon(key: string): boolean {
  return Boolean(COMPONENT_ICONS[key] || UI_ACTION_ICONS[key]);
}

/**
 * Returns the documented list of missing icons.
 */
export function getMissingIconsList(): readonly string[] {
  return MISSING_ICONS;
}
