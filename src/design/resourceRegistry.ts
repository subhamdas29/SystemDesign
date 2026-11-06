/**
 * Resource registry mapping component types to asset paths in /resources.
 * Handles Vite import.meta.glob resolution with graceful fallback to a neutral
 * silver-outline placeholder icon, warning once per missing key in dev.
 */

import type { ComponentType } from '../types';

// Load all image assets in /resources (both png and svg)
const resourceFiles = import.meta.glob<string>('/resources/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Alias mapping for resource filenames that might differ slightly
const RESOURCE_ALIASES: Partial<Record<ComponentType, string[]>> = {
  router: ['router.png', 'router.svg', 'nginx-reverse-proxy.png', 'nginx-reverse-proxy.svg'],
  cache: ['cache.png', 'cache.svg', 'redis-cache.png', 'redis-cache.svg'],
  'message-queue': ['message-queue.png', 'message-queue.svg', 'kafka.png', 'kafka.svg'],
  'app-server': ['app-server.png', 'app-server.svg', 'server.png', 'server.svg'],
  'load-balancer': ['load-balancer.png', 'load-balancer.svg'],
  'api-gateway': ['api-gateway.png', 'api-gateway.svg'],
  'rate-limiter': ['rate-limiter.png', 'rate-limiter.svg'],
  client: ['client.png', 'client.svg'],
  dns: ['dns.png', 'dns.svg'],
  cdn: ['cdn.png', 'cdn.svg'],
  database: ['database.png', 'database.svg'],
  firewall: ['firewall.png', 'firewall.svg'],
  waf: ['waf.png', 'waf.svg'],
};

const warnedKeys = new Set<string>();

/**
 * Resolves an image URL for a given component type from /resources.
 * Returns null if not found (caller should render neutral placeholder icon).
 */
export function getComponentImageUrl(type: ComponentType): string | null {
  const possibleNames = RESOURCE_ALIASES[type] ?? [`${type}.png`, `${type}.svg`];

  for (const name of possibleNames) {
    const directPath = `/resources/${name}`;
    if (resourceFiles[directPath]) {
      return resourceFiles[directPath];
    }
  }

  // Warn once in development if an asset is missing
  if (process.env.NODE_ENV !== 'production' && !warnedKeys.has(type)) {
    warnedKeys.add(type);
    console.warn(`[resourceRegistry] Missing asset for component type "${type}". Using neutral silver placeholder.`);
  }

  return null;
}

/**
 * Reset warned keys (useful for unit tests).
 */
export function _resetWarnedKeys(): void {
  warnedKeys.clear();
}
