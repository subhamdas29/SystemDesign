/**
 * Phase 8A Visual QA Screenshot Automation Script
 * Connects to headless Chrome/Edge via CDP (Chrome DevTools Protocol).
 * Captures all 4 required Phase 8A views at 1440x900 and 1920x1080:
 *   a) Attacker Mode idle with Attack Console and campaign timeline.
 *   b) "Scrape, bust the cache, overload the database" preset mid-run with amber diamond packets and degraded health.
 *   c) Charts tab with Legitimate vs Malicious traffic and latency spikes.
 *   d) Post-run attack summary modal showing Legitimate Success Rate and Defender Takeaways.
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
    port: 4174,
    host: '127.0.0.1',
  },
});
const appUrl = 'http://127.0.0.1:4174/';
console.log('Vite preview server running at:', appUrl);

// 2. Launch headless Chrome with CDP
const cdpPort = 9224;
const tempProfile = resolve(process.env.TEMP || '.', `chrome-qa-phase8a-${Date.now()}`);

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
    } catch (err) {
      if (i % 10 === 0) console.log(`Waiting for CDP on port ${cdpPort}... (${err.message})`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Failed to find CDP page target');
}

async function runVisualQAPhase8A() {
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

      // --- A) Attacker Mode idle with Attack Console & campaign timeline ---
      console.log(`[A] Enabling Attacker Mode & Loading Architecture @ ${res.label}`);
      await client.eval(`(() => {
        const graphStore = window.__graphStore.getState();
        const attackStore = window.__attackStore.getState();
        const uiStore = window.__uiStore.getState();

        // Build standard 5-tier architecture: client, router, lb, app-server, cache, db
        const sequence = ['router', 'load-balancer', 'app-server', 'cache'];
        sequence.forEach((t) => graphStore.addNode(t));

        // Enable Attacker Mode
        attackStore.setAttackerMode(true);
        if (!uiStore.isInventoryOpen) {
          uiStore.toggleInventory();
        }
      })()`);
      await new Promise((r) => setTimeout(r, 1000));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase8a-idle-${res.label}.png`)
      );

      // --- B) "Scrape, bust the cache, overload the database" preset mid-run ---
      console.log(`[B] Running "scrape-bust-cache-overload-db" preset @ ${res.label}`);
      await client.eval(`(() => {
        const attackStore = window.__attackStore.getState();
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const metricsStore = window.__metricsStore.getState();

        attackStore.loadPreset('scrape-bust-cache-overload-db');
        metricsStore.setDashboardState('expanded');
        metricsStore.setActiveDashboardTab('overview');
        // Advance to mid-run (e.g. 8000ms)
        simStore.seek(8000, graphStore.graph);
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase8a-midrun-${res.label}.png`)
      );

      // --- C) Charts tab with Legitimate vs Malicious multi-class traffic ---
      console.log(`[C] Capturing Charts Tab @ ${res.label}`);
      await client.eval(`(() => {
        const metricsStore = window.__metricsStore.getState();
        metricsStore.setDashboardState('expanded');
        metricsStore.setActiveDashboardTab('charts');
      })()`);
      await new Promise((r) => setTimeout(r, 800));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase8a-charts-${res.label}.png`)
      );

      // --- D) Post-run attack summary modal showing Legitimate Success Rate and Defender Takeaways ---
      console.log(`[D] Capturing Run Summary modal @ ${res.label}`);
      await client.eval(`(() => {
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const metricsStore = window.__metricsStore.getState();

        simStore.seek(15000, graphStore.graph);
        metricsStore.openRunSummary();
      })()`);
      await new Promise((r) => setTimeout(r, 1000));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase8a-summary-${res.label}.png`)
      );

      // Close modal before next resolution iteration
      await client.eval(`(() => {
        window.__metricsStore.getState().closeRunSummary();
      })()`);
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log('\n🎉 ALL PHASE 8A VISUAL QA SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    if (client) client.close();
    browserProc.kill();
    server.close();
  }
}

runVisualQAPhase8A().catch((err) => {
  console.error('\n❌ Phase 8A Visual QA Failed:', err);
  process.exit(1);
});
