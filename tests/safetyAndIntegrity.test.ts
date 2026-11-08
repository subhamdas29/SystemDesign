import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ATTACK_SCENARIOS_LIST } from '../src/scenarios/attacks';
import { createStarterGraph } from '../src/builder/placement';
import { useGraphStore } from '../src/store/graphStore';

describe('Phase 8A: Safety Rules and Architectural Integrity', () => {
  it('safety rule: catalog contains conceptual defender-focused descriptions, zero exploit payloads', () => {
    // Dangerous patterns that MUST NEVER exist in scenario descriptions or definitions
    const forbiddenPatterns = [
      /1\s*=\s*1/i,
      /drop\s+table/i,
      /union\s+select/i,
      /<script[\s>]/i,
      /curl\s+-/i,
      /rm\s+-rf/i,
      /eval\s*\(/i,
      /\/bin\/sh/i,
      /\/bin\/bash/i,
      /nc\s+-e/i,
    ];

    expect(ATTACK_SCENARIOS_LIST.length).toBe(8);

    for (const scenario of ATTACK_SCENARIOS_LIST) {
      const texts = [
        scenario.id,
        scenario.name,
        scenario.plainLanguage.whatItIs,
        scenario.plainLanguage.whatItTargets,
        scenario.plainLanguage.whatStopsIt,
        scenario.plainLanguage.whatDoesNotStopIt,
        scenario.recommendedDefense,
      ];

      for (const text of texts) {
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(text)).toBe(false);
        }
      }
    }
  });

  it('safety rule: /src/engine never imports network APIs (fetch, WebSocket, XMLHttpRequest, etc.)', () => {
    const engineDir = path.resolve(__dirname, '../src/engine');

    const checkDir = (dir: string) => {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          checkDir(fullPath);
        } else if (file.name.endsWith('.ts') || file.name.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf8');

          // Ensure no network API imports
          expect(content).not.toMatch(/from\s+['"](http|https|net|ws|node-fetch)['"]/i);
          expect(content).not.toMatch(/\bWebSocket\b/);
          expect(content).not.toMatch(/\bXMLHttpRequest\b/);
          expect(content).not.toMatch(/\bfetch\s*\(/);
        }
      }
    };

    checkDir(engineDir);
  });

  it('architectural integrity: threat-source node is virtual and never written to GraphConfig', () => {
    const starter = createStarterGraph();
    expect(starter.nodes.some((n) => (n.type as string) === 'threat-source')).toBe(false);

    // Verify graphStore state never contains threat-source
    const graphInStore = useGraphStore.getState().graph;
    expect(graphInStore.nodes.some((n) => (n.type as string) === 'threat-source')).toBe(false);
  });
});
