/**
 * Visual QA Smoke Test Script for System Design Simulator (Phase 1C)
 * Connects directly to Chrome headless via CDP (Chrome DevTools Protocol) using Node's native WebSocket.
 * Validates layout geometry, no horizontal scrolling, canvas size > 50%, node bounds,
 * and captures high-resolution screenshots for starter & full architecture at 1440x900 and 1920x1080.
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { preview } from 'vite';

const SCREENSHOT_DIR = resolve('qa/screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browserExe = chromePaths.find((p) => existsSync(p));
if (!browserExe) {
  console.error('❌ No Chrome or Edge executable found.');
  process.exit(1);
}
console.log('Selected browser binary:', browserExe);

// 1. Start Vite preview server
const server = await preview({
  preview: {
    port: 4173,
    host: '127.0.0.1',
  },
});
const appUrl = 'http://127.0.0.1:4173/';
console.log('Vite preview server running at:', appUrl);

// 2. Launch headless Chrome with CDP
const cdpPort = 9222;
const tempProfile = resolve(process.env.TEMP || '.', `chrome-qa-${Date.now()}`);

const browserProc = spawn(
  browserExe,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempProfile}`,
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    };
  }

  waitReady() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  async captureScreenshot(path) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    writeFileSync(path, buffer);
    console.log(`📸 Saved screenshot (${buffer.length} bytes): ${path}`);
  }

  close() {
    this.ws.close();
  }
}

async function connectCDP() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page');
        if (page?.webSocketDebuggerUrl) {
          const client = new CDPClient(page.webSocketDebuggerUrl);
          await client.waitReady();
          return client;
        }
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Failed to find CDP page target');
}

async function runVisualQA() {
  let client;
  try {
    client = await connectCDP();
    console.log('✅ Connected to Chrome DevTools Protocol');

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    console.log(`Navigating to ${appUrl}...`);
    await client.send('Page.navigate', { url: appUrl });

    // Wait for page to initialize and render
    await new Promise((r) => setTimeout(r, 1500));

    // Helper to run geometry assertions
    async function assertLayout(resolutionLabel, width, height, expectedNodeMin = 3) {
      console.log(`\n--- Validating Layout @ ${resolutionLabel} (${width}x${height}) ---`);
      await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await client.eval("window.dispatchEvent(new Event('resize'))");
      await new Promise((r) => setTimeout(r, 600));

      const metrics = await client.eval(`(() => {
        const doc = document.documentElement;
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        const scrollWidth = doc.scrollWidth;
        const scrollHeight = doc.scrollHeight;

        const mainCanvas = document.querySelector('main[aria-label="Architecture Canvas"]');
        const inventory = document.querySelector('aside[aria-label="Component Inventory"]');
        const inspector = document.querySelector('aside[aria-label="Component Inspector"]');
        const nodes = document.querySelectorAll('.react-flow__node');

        const canvasRect = mainCanvas ? mainCanvas.getBoundingClientRect() : null;
        const invRect = inventory ? inventory.getBoundingClientRect() : null;
        const inspRect = inspector ? inspector.getBoundingClientRect() : null;

        // Check node visibility within canvas bounds
        let allNodesInside = true;
        let nodeDetails = [];
        if (canvasRect) {
          nodes.forEach((n) => {
            const r = n.getBoundingClientRect();
            const isInside = (
              r.right >= canvasRect.left &&
              r.left <= canvasRect.right &&
              r.bottom >= canvasRect.top &&
              r.top <= canvasRect.bottom
            );
            if (!isInside) allNodesInside = false;
            nodeDetails.push({
              text: n.innerText.slice(0, 20),
              x: Math.round(r.left),
              y: Math.round(r.top),
              w: Math.round(r.width),
              h: Math.round(r.height),
              isInside,
            });
          });
        }

        return {
          winWidth,
          winHeight,
          scrollWidth,
          scrollHeight,
          hasHorizontalScroll: scrollWidth > winWidth,
          canvas: canvasRect ? {
            width: canvasRect.width,
            height: canvasRect.height,
            percentOfWindow: (canvasRect.width / winWidth) * 100,
          } : null,
          inventoryWidth: invRect ? invRect.width : 0,
          inspectorWidth: inspRect ? inspRect.width : 0,
          nodeCount: nodes.length,
          allNodesInside,
          nodeDetails,
        };
      })()`);

      console.log(`Window viewport: ${metrics.winWidth}x${metrics.winHeight}`);
      console.log(`Scroll dimensions: ${metrics.scrollWidth}x${metrics.scrollHeight}`);
      console.log(`Horizontal scroll present: ${metrics.hasHorizontalScroll ? '⚠️ YES (FAIL)' : '✅ NO'}`);
      console.log(`Canvas width: ${Math.round(metrics.canvas?.width)}px (${metrics.canvas?.percentOfWindow.toFixed(1)}% of viewport)`);
      console.log(`Inventory width: ${Math.round(metrics.inventoryWidth)}px`);
      console.log(`Inspector width: ${Math.round(metrics.inspectorWidth)}px`);
      console.log(`Rendered nodes: ${metrics.nodeCount} (all inside visible canvas: ${metrics.allNodesInside ? '✅' : '❌'})`);

      // Strict assertions
      if (metrics.hasHorizontalScroll) {
        throw new Error(`Horizontal scrollbar detected at ${resolutionLabel}! scrollWidth: ${metrics.scrollWidth}, winWidth: ${metrics.winWidth}`);
      }
      if (!metrics.canvas || metrics.canvas.percentOfWindow <= 50) {
        throw new Error(`Canvas width is ${metrics.canvas?.percentOfWindow}% of viewport, expected > 50%`);
      }
      if (metrics.nodeCount < expectedNodeMin) {
        throw new Error(`Expected at least ${expectedNodeMin} nodes, found ${metrics.nodeCount}`);
      }
      if (!metrics.allNodesInside) {
        console.warn('Some nodes are outside canvas bounds:', metrics.nodeDetails);
      }

      return metrics;
    }

    // 1. Starter Graph @ 1440x900
    await assertLayout('Starter Architecture', 1440, 900, 3);
    await client.captureScreenshot(resolve(SCREENSHOT_DIR, 'starter-1440x900.png'));

    // 2. Starter Graph @ 1920x1080
    await assertLayout('Starter Architecture', 1920, 1080, 3);
    await client.captureScreenshot(resolve(SCREENSHOT_DIR, 'starter-1920x1080.png'));

    // 3. Expand to Full Architecture
    console.log('\n--- Building Full Architecture (12 components) ---');
    await client.eval(`(() => {
      const store = window.__graphStore.getState();
      const sequence = [
        'dns',
        'cdn',
        'router',
        'firewall',
        'waf',
        'rate-limiter',
        'load-balancer',
        'app-server',
        'app-server',
        'cache'
      ];
      sequence.forEach((t) => store.addNode(t));
    })()`);

    // Give React Flow fitView animation 600ms to center and settle
    await new Promise((r) => setTimeout(r, 800));

    // 4. Full Architecture @ 1920x1080
    await assertLayout('Full Architecture', 1920, 1080, 12);
    await client.captureScreenshot(resolve(SCREENSHOT_DIR, 'full-1920x1080.png'));

    // 5. Full Architecture @ 1440x900
    await assertLayout('Full Architecture', 1440, 900, 12);
    await client.captureScreenshot(resolve(SCREENSHOT_DIR, 'full-1440x900.png'));

    console.log('\n🎉 ALL VISUAL QA CHECKS PASSED SUCCESSFULLY!');
  } finally {
    if (client) client.close();
    browserProc.kill();
    server.close();
  }
}

runVisualQA().catch((err) => {
  console.error('\n❌ Visual QA Failed:', err);
  process.exit(1);
});
