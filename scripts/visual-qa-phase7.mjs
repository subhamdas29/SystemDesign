/**
 * Phase 7 Visual QA Screenshot Automation Script
 * Connects to headless Chrome/Edge via CDP (Chrome DevTools Protocol).
 * Captures all 4 required Phase 7 scenarios at 1440x900 and 1920x1080:
 *   a) Full architecture showing readable nodes with minimap and semantic zoom.
 *   b) "Slow database cascade" preset mid-run showing moving packets, node queues, active failure list, and dashboard with amplification factor.
 *   c) Charts tab with failure markers and retries/amplification chart.
 *   d) Run summary modal showing the cascade timeline.
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
const cdpPort = 9223;
const tempProfile = resolve(process.env.TEMP || '.', `chrome-qa-phase7-${Date.now()}`);

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

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await this.eval("window.dispatchEvent(new Event('resize'))");
    await new Promise((r) => setTimeout(r, 600));
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

async function runVisualQAPhase7() {
  let client;
  try {
    client = await connectCDP();
    console.log('✅ Connected to CDP');

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    console.log(`Navigating to ${appUrl}...`);
    await client.send('Page.navigate', { url: appUrl });
    await new Promise((r) => setTimeout(r, 2000));

    const resolutions = [
      { label: '1440x900', width: 1440, height: 900 },
      { label: '1920x1080', width: 1920, height: 1080 },
    ];

    for (const res of resolutions) {
      console.log(`\n================ Viewport ${res.label} ================`);
      await client.setViewport(res.width, res.height);

      // --- A) Full architecture showing readable nodes with minimap and semantic zoom ---
      console.log(`[A] Capturing Full Architecture @ ${res.label}`);
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
      await new Promise((r) => setTimeout(r, 1000));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `full-architecture-${res.label}.png`)
      );

      // --- B) "Slow database cascade" preset mid-run ---
      console.log(`[B] Loading "slow-database-cascade" scenario preset @ ${res.label}`);
      await client.eval(`(() => {
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const uiStore = window.__uiStore.getState();
        const metricsStore = window.__metricsStore.getState();
        simStore.loadScenarioPreset('slow-database-cascade', graphStore.graph);
        if (!uiStore.isChaosPanelOpen) {
          uiStore.toggleChaosPanel();
        }
        metricsStore.setActiveDashboardTab('overview');
        simStore.seek(2500, window.__graphStore.getState().graph);
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `slow-db-cascade-midrun-${res.label}.png`)
      );

      // --- C) Charts tab with failure markers and retries/amplification chart ---
      console.log(`[C] Capturing Charts tab with retries & amplification chart @ ${res.label}`);
      await client.eval(`(() => {
        const metricsStore = window.__metricsStore.getState();
        metricsStore.setActiveDashboardTab('charts');
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `charts-tab-retries-amplification-${res.label}.png`)
      );

      // --- D) Run summary modal showing the cascade timeline ---
      console.log(`[D] Capturing Run Summary modal with cascade timeline @ ${res.label}`);
      await client.eval(`(() => {
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const metricsStore = window.__metricsStore.getState();
        simStore.seek(5000, graphStore.graph);
        metricsStore.openRunSummary();
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `run-summary-cascade-timeline-${res.label}.png`)
      );

      // Close modal before next resolution iteration
      await client.eval(`(() => {
        window.__metricsStore.getState().closeRunSummary();
      })()`);
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log('\n🎉 ALL PHASE 7 VISUAL QA SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    if (client) client.close();
    browserProc.kill();
    server.close();
  }
}

runVisualQAPhase7().catch((err) => {
  console.error('\n❌ Phase 7 Visual QA Failed:', err);
  process.exit(1);
});
