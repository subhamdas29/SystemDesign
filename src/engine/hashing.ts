/**
 * Pure deterministic hashing utilities for simulation event stream verification.
 * Uses 32-bit FNV-1a algorithm with hex output.
 */

import { SimulationEvent } from '../types/runtime';

export function computeHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let j = 0; j < str.length; j++) {
    hash ^= str.charCodeAt(j);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashEventStream(events: SimulationEvent[]): string {
  let hash = 0x811c9dc5; // FNV offset basis

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    // Serialize core event properties deterministically
    const str = `${e.id}|${e.timestamp}|${e.type}|${e.requestId}|${e.nodeId}|${e.targetNodeId ?? ''}|${JSON.stringify(e.details ?? {})}`;

    for (let j = 0; j < str.length; j++) {
      hash ^= str.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193);
    }
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
