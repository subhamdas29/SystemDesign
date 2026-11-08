/**
 * Share Link Encoder & Decoder (Phase 10).
 * Uses native browser CompressionStream / DecompressionStream (deflate) + base64url.
 * Automatically checks URL length against the ~2000 character limit.
 */

import { ProjectData, migrateProjectData } from './schema';

export interface ShareEncodeResult {
  url: string;
  hash: string;
  length: number;
  isOversized: boolean; // Length > 2000 chars
}

/**
 * Converts a Uint8Array to URL-safe base64 string.
 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts a URL-safe base64 string back to Uint8Array.
 */
function fromBase64Url(base64url: string): Uint8Array {
  let b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compresses and encodes project data into a URL hash string.
 */
export async function encodeProjectToShareLink(project: ProjectData): Promise<ShareEncodeResult> {
  const json = JSON.stringify(project);
  let hashPayload = '';

  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate'));
      const buffer = await new Response(stream).arrayBuffer();
      hashPayload = toBase64Url(new Uint8Array(buffer));
    } catch {
      // Fallback to uncompressed base64url
      hashPayload = toBase64Url(new TextEncoder().encode(json));
    }
  } else {
    hashPayload = toBase64Url(new TextEncoder().encode(json));
  }

  const hash = `#share=${hashPayload}`;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://lifeofarequest.app/';
  const fullUrl = `${baseUrl}${hash}`;
  const length = fullUrl.length;

  return {
    url: fullUrl,
    hash,
    length,
    isOversized: length > 2000,
  };
}

/**
 * Decodes and decompresses a project from a URL share hash.
 */
export async function decodeProjectFromShareHash(hash: string): Promise<ProjectData | null> {
  if (!hash || !hash.includes('#share=')) return null;

  const payload = hash.split('#share=')[1];
  if (!payload) return null;

  try {
    const bytes = fromBase64Url(payload);

    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
        const text = await new Response(stream).text();
        return migrateProjectData(JSON.parse(text));
      } catch {
        // Fallback to plain text decode
        const text = new TextDecoder().decode(bytes);
        return migrateProjectData(JSON.parse(text));
      }
    } else {
      const text = new TextDecoder().decode(bytes);
      return migrateProjectData(JSON.parse(text));
    }
  } catch {
    return null;
  }
}
