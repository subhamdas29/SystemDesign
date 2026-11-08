/**
 * Phase 10 Visual QA Screenshot Automation Script
 * Connects to headless Chrome/Edge via CDP (Chrome DevTools Protocol).
 * Captures all 7 required Phase 10 views at 1440x900 and 1920x1080 (plus 768px tablet):
 *   a) Welcome tour step
 *   b) Tutorial step with highlighted instruction & progress
 *   c) Example gallery
 *   d) Project library and share dialog
 *   e) Settings panel
 *   f) Running 1M RPS aggregate simulation with dashboard expanded
 *   g) Tablet width layout (768px)
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

// 1. Build and start Vite preview server
const server = await preview({
  preview: {
    port: 4175,
    host: '127.0.0.1',
  },
});
const appUrl = 'http://127.0.0.1:4175/';
console.log('Vite preview server running at:', appUrl);

// 2. Launch headless Chrome with CDP
const cdpPort = 9225;
const tempProfile = resolve(process.env.TEMP || '.', `chrome-qa-phase10-${Date.now()}`);

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

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 1000,
    });
    await this.eval("window.dispatchEvent(new Event('resize'))");
    await new Promise((r) => setTimeout(r, 600));
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

async function connectCDP(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page');
        if (page?.webSocketDebuggerUrl) {
          const client = new CDPClient(page.webSocketDebuggerUrl);
          await client.waitReady();
          return client;
        }
      }
    } catch (err) {
      if (i % 10 === 0) console.log(`Waiting for CDP on port ${port}... (${err.message})`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Failed to find CDP page target');
}

async function runVisualQAPhase10() {
  let client = null;
  try {
    client = await connectCDP(cdpPort);
    console.log('✅ Connected to CDP');

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    console.log('Navigating to simulator at:', appUrl);
    await client.send('Page.navigate', { url: appUrl });
    await new Promise((r) => setTimeout(r, 2000));

    const resolutions = [
      { label: '1440x900', w: 1440, h: 900 },
      { label: '1920x1080', w: 1920, h: 1080 },
    ];

    for (const res of resolutions) {
      console.log(`\n================ Viewport: ${res.label} ================`);
      await client.setViewport(res.w, res.h);
      await new Promise((r) => setTimeout(r, 500));

      // --- A) Welcome Tour Step ---
      console.log(`[A] Capturing Welcome Tour @ ${res.label}`);
      await client.eval(`(() => {
        const uiStore = window.__uiStore.getState();
        uiStore.setTourOpen(true);
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase10-welcome-tour-${res.label}.png`)
      );

      // Close tour
      await client.eval(`(() => {
        window.__uiStore.getState().setTourOpen(false);
      })()`);
      await new Promise((r) => setTimeout(r, 400));

      // --- B) Tutorial Step with highlighted instruction & progress ---
      console.log(`[B] Capturing Guided Tutorial Step @ ${res.label}`);
      await client.eval(`(() => {
        const uiStore = window.__uiStore.getState();
        uiStore.startTutorial('tutorial-load-balancer-scale-out');
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase10-tutorial-step-${res.label}.png`)
      );

      // Exit tutorial
      await client.eval(`(() => {
        window.__uiStore.getState().exitTutorial();
      })()`);
      await new Promise((r) => setTimeout(r, 400));

      // --- C) Example Gallery ---
      console.log(`[C] Capturing Example Gallery Modal @ ${res.label}`);
      await client.eval(`(() => {
        window.__uiStore.getState().setExampleGalleryOpen(true);
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase10-example-gallery-${res.label}.png`)
      );

      // Close gallery
      await client.eval(`(() => {
        window.__uiStore.getState().setExampleGalleryOpen(false);
      })()`);
      await new Promise((r) => setTimeout(r, 400));

      // --- D) Project Library & Share Dialog ---
      console.log(`[D] Capturing Project Library & Share Dialog @ ${res.label}`);
      await client.eval(`(() => {
        window.__uiStore.getState().setShareModalOpen(true);
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase10-project-share-${res.label}.png`)
      );

      // Close share dialog, open project library
      await client.eval(`(() => {
        const uiStore = window.__uiStore.getState();
        uiStore.setShareModalOpen(false);
        uiStore.setProjectLibraryOpen(true);
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase10-project-library-${res.label}.png`)
      );

      // Close library
      await client.eval(`(() => {
        window.__uiStore.getState().setProjectLibraryOpen(false);
      })()`);
      await new Promise((r) => setTimeout(r, 400));

      // --- E) Settings Panel ---
      console.log(`[E] Capturing Settings Panel @ ${res.label}`);
      await client.eval(`(() => {
        window.__uiStore.getState().setSettingsModalOpen(true);
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase10-settings-panel-${res.label}.png`)
      );

      // Close settings
      await client.eval(`(() => {
        window.__uiStore.getState().setSettingsModalOpen(false);
      })()`);
      await new Promise((r) => setTimeout(r, 400));

      // --- F) Running 1M RPS aggregate simulation with dashboard expanded ---
      console.log(`[F] Running 1M RPS Aggregate Simulation @ ${res.label}`);
      await client.eval(`(() => {
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const metricsStore = window.__metricsStore.getState();
        const uiStore = window.__uiStore.getState();

        // Load multi-tier enterprise architecture
        simStore.loadScenarioPreset('resilient-enterprise', graphStore.graph);
        simStore.setTrafficConfig({
          peakRps: 1000000,
          durationMs: 600000,
          pattern: 'constant',
          patternParams: { type: 'constant' },
          mode: 'aggregate',
        }, graphStore.graph);

        // Advance to 300,000ms (5 minutes)
        simStore.seek(300000, graphStore.graph);
        // Expand dashboard
        uiStore.setDashboardOpen(true);
        metricsStore.setActiveDashboardTab('overview');
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase10-1m-rps-dashboard-${res.label}.png`)
      );

      // Collapse dashboard
      await client.eval(`(() => {
        window.__uiStore.getState().setDashboardOpen(false);
      })()`);
      await new Promise((r) => setTimeout(r, 400));
    }

    // --- G) Tablet Width Layout (768px) ---
    console.log(`\n================ Viewport: Tablet 768x1024 ================`);
    await client.setViewport(768, 1024);
    await new Promise((r) => setTimeout(r, 800));

    await client.captureScreenshot(
      resolve(SCREENSHOT_DIR, `phase10-tablet-layout-768px.png`)
    );

    console.log('\n🎉 ALL PHASE 10 VISUAL QA SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    if (client) client.close();
    browserProc.kill();
    server.close();
  }
}

runVisualQAPhase10().catch((err) => {
  console.error('\n❌ Phase 10 Visual QA Failed:', err);
  process.exit(1);
});
