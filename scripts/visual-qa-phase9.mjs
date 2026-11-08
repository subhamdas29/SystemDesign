/**
 * Phase 9 Visual QA Screenshot Automation Script
 * Connects to headless Chrome/Edge via CDP (Chrome DevTools Protocol).
 * Captures all 5 required Phase 9 scenarios at 1440x900 and 1920x1080:
 *   a) Full architecture showing async lane (Message Queue + Worker) and Replicas laid out and readable.
 *   b) "Write spike absorbed by a queue" mid-run showing queue depth, lag, and hollow job packets.
 *   c) "Hot shard" run showing per-shard load bars in live inspector.
 *   d) Inspector Live tabs for Queue and Replica.
 *   e) Charts tab with queue depth and replication lag chart (#7).
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
const tempProfile = resolve(process.env.TEMP || '.', `chrome-qa-phase9-${Date.now()}`);

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

async function runVisualQAPhase9() {
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

      // --- A) Full architecture showing async lane (MQ + Worker) and Replicas ---
      console.log(`[A] Capturing Full Architecture with Async Lane & Replicas @ ${res.label}`);
      await client.eval(`(() => {
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        simStore.loadScenarioPreset('read-heavy-replicas', graphStore.graph);
        // Add message-queue and worker to make it the full multi-lane architecture
        graphStore.addNode('message-queue');
        graphStore.addNode('worker');
        simStore.seek(1000, graphStore.graph);
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `full-architecture-phase9-${res.label}.png`)
      );

      // --- B) "Write spike absorbed by a queue" mid-run ---
      console.log(`[B] Loading "write-spike-queue" preset mid-run @ ${res.label}`);
      await client.eval(`(() => {
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const uiStore = window.__uiStore.getState();
        simStore.loadScenarioPreset('write-spike-queue', graphStore.graph);
        // Seek into the spike at t=12s
        simStore.seek(12000, graphStore.graph);
        // Select message-queue node to inspect
        const mqNode = graphStore.graph.nodes.find(n => n.type === 'message-queue');
        if (mqNode) uiStore.selectNode(mqNode.id);
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `write-spike-absorbed-queue-${res.label}.png`)
      );

      // --- C) "Hot shard" run showing per-shard load bars ---
      console.log(`[C] Loading "hot-shard" preset mid-run @ ${res.label}`);
      await client.eval(`(() => {
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const uiStore = window.__uiStore.getState();
        simStore.loadScenarioPreset('hot-shard', graphStore.graph);
        simStore.seek(8000, graphStore.graph);
        // Select database node to show per-shard load bars in live inspector
        const dbNode = graphStore.graph.nodes.find(n => n.type === 'database');
        if (dbNode) uiStore.selectNode(dbNode.id);
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `hot-shard-run-${res.label}.png`)
      );

      // --- D) Inspector Live tabs for Queue and Replica ---
      console.log(`[D] Capturing Inspector Live tab for Read Replica @ ${res.label}`);
      await client.eval(`(() => {
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const uiStore = window.__uiStore.getState();
        simStore.loadScenarioPreset('read-heavy-replicas', graphStore.graph);
        simStore.seek(5000, graphStore.graph);
        const repNode = graphStore.graph.nodes.find(n => n.type === 'database-replica');
        if (repNode) uiStore.selectNode(repNode.id);
      })()`);
      await new Promise((r) => setTimeout(r, 1000));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `inspector-live-replica-${res.label}.png`)
      );

      // --- E) Charts tab with queue depth & replication lag chart (#7) ---
      console.log(`[E] Capturing Charts Tab with Async & Data Scaling Chart (#7) @ ${res.label}`);
      await client.eval(`(() => {
        const metricsStore = window.__metricsStore.getState();
        metricsStore.setActiveDashboardTab('charts');
      })()`);
      await new Promise((r) => setTimeout(r, 1000));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `charts-tab-async-scaling-${res.label}.png`)
      );

      // Switch back to overview tab before next resolution
      await client.eval(`(() => {
        window.__metricsStore.getState().setActiveDashboardTab('overview');
      })()`);
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log('\n🎉 ALL PHASE 9 VISUAL QA SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    if (client) client.close();
    browserProc.kill();
    server.close();
  }
}

runVisualQAPhase9().catch((err) => {
  console.error('\n❌ Phase 9 Visual QA Failed:', err);
  process.exit(1);
});
