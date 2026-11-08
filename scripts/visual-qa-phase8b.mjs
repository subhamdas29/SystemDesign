/**
 * Phase 8B Visual QA Screenshot Automation Script
 * Connects to headless Chrome/Edge via CDP (Chrome DevTools Protocol).
 * Captures all 4 required Phase 8B views at 1440x900 and 1920x1080 (8 PNGs total in qa/screenshots/):
 *   a) phase8b-defenses-standard-[res].png: Defenses tab open with Standard preset active, showing perimeter cards and host policies.
 *   b) phase8b-midrun-defenses-[res].png: Mid-run campaign with blocked flow particles, WAF ruleset badges, circuit breaker state, and instance counter badges.
 *   c) phase8b-defense-report-[res].png: Defense report card in Run Summary modal showing effective verdict and positive delta.
 *   d) phase8b-hurt-users-[res].png: Run summary showing "Hurt Legitimate Users" verdict due to high sensitivity WAF or global rate limiter.
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

// 1. Start Vite preview server on port 4176
const server = await preview({
  preview: {
    port: 4176,
    host: '127.0.0.1',
  },
});
const appUrl = 'http://127.0.0.1:4176/';
console.log('Vite preview server running at:', appUrl);

// 2. Launch headless Chrome with CDP
const cdpPort = 9226;
const tempProfile = resolve(process.env.TEMP || '.', `chrome-qa-phase8b-${Date.now()}`);

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

async function runVisualQAPhase8B() {
  let client;
  try {
    client = await connectCDP();
    console.log('✅ Connected to CDP');

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    console.log(`Navigating to ${appUrl}...`);
    await client.send('Page.navigate', { url: appUrl });
    await new Promise((r) => setTimeout(r, 2500));

    const resolutions = [
      { label: '1440x900', width: 1440, height: 900 },
      { label: '1920x1080', width: 1920, height: 1080 },
    ];

    for (const res of resolutions) {
      console.log(`\n================ Viewport ${res.label} ================`);
      await client.setViewport(res.width, res.height);

      // --- A) phase8b-defenses-standard-[res].png ---
      // Defenses tab open with Standard preset active, showing perimeter cards and host policies
      console.log(`[A] Setting up Standard Defenses tab @ ${res.label}`);
      await client.eval(`(() => {
        const graphStore = window.__graphStore.getState();
        const attackStore = window.__attackStore.getState();
        const defenseStore = window.__defenseStore.getState();
        const uiStore = window.__uiStore.getState();

        // 1. Reset and construct standard base topology
        const baseSequence = ['router', 'load-balancer', 'app-server', 'cache', 'database'];
        baseSequence.forEach((t) => {
          if (!graphStore.graph.nodes.some(n => n.type === t)) {
            graphStore.addNode(t);
          }
        });

        // 2. Enable Attacker Mode and switch to Defenses tab
        attackStore.setAttackerMode(true);
        if (!uiStore.isInventoryOpen) {
          uiStore.toggleInventory();
        }
        defenseStore.setActiveTab('defenses');

        // 3. Apply Standard defense preset
        defenseStore.applyPreset('standard');
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase8b-defenses-standard-${res.label}.png`)
      );

      // --- B) phase8b-midrun-defenses-[res].png ---
      // Mid-run campaign with blocked flow particles, WAF ruleset badges, circuit breaker state, and instance counter badges
      console.log(`[B] Running attack campaign mid-run with Hardened defenses @ ${res.label}`);
      await client.eval(`(() => {
        const attackStore = window.__attackStore.getState();
        const defenseStore = window.__defenseStore.getState();
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const metricsStore = window.__metricsStore.getState();

        // Apply Hardened preset to add CDN and full zero-trust policies
        defenseStore.applyPreset('hardened');

        // Load aggressive attack preset
        attackStore.loadPreset('scrape-bust-cache-overload-db');

        // Ensure overview dashboard is open
        metricsStore.setDashboardState('expanded');
        metricsStore.setActiveDashboardTab('overview');

        // Seek to 8000ms mid-run where attack traffic is actively blocked
        simStore.seek(8000, graphStore.graph);
      })()`);
      await new Promise((r) => setTimeout(r, 1500));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase8b-midrun-defenses-${res.label}.png`)
      );

      // --- C) phase8b-defense-report-[res].png ---
      // Defense report card in Run Summary modal showing effective verdict and positive delta
      console.log(`[C] Capturing Defense Report Card in Run Summary @ ${res.label}`);
      await client.eval(`(() => {
        const defenseStore = window.__defenseStore.getState();
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const metricsStore = window.__metricsStore.getState();

        // 1. Simulate a previous undefended run with low legitimate success rate (35%)
        defenseStore.setPreviousRunSummary({
          runId: 'baseline-prev',
          timestamp: Date.now() - 60000,
          configHash: 'hash-prev',
          seed: 42,
          trafficConfig: { mode: 'aggregate', peakRps: 1000, durationMs: 15000, pattern: 'constant' },
          graphConfig: graphStore.graph,
          successRatePercent: 35.0,
          legitimateSuccessRate: 35.0,
          peakRpsHandled: 350,
          peakRpsOffered: 1000,
          avgLatencyMs: 450,
          p99LatencyMs: 1200,
          totalRequests: 15000,
          totalSucceeded: 5250,
          totalFailed: 9750,
          totalRejected: 0,
          totalTimedOut: 0,
          totalRetries: 0,
          peakAmplificationFactor: 1.0,
          cascadeTimeline: [],
          firstSaturatedComponent: null,
          firstFailedComponent: null,
          identifiedBottleneck: null,
          timeSpentDegradedMs: 8000,
          timeSpentCriticalMs: 4000,
          suggestedFixes: [],
          isAttackRun: true,
          attackTrafficShare: 60,
          exposureEvents: 12,
          compromisedServersCount: 1,
          dataEgressMb: 150,
          totalMaliciousBlocked: 0,
          totalFalsePositives: 0,
          totalAutoscalingCost: 0,
        });

        // 2. Advance current simulation to end (15000ms) with hardened defenses active
        simStore.seek(15000, graphStore.graph);

        // 3. Open Run Summary modal
        metricsStore.openRunSummary();
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      // Scroll modal slightly so Defense Effectiveness Report is centered in view
      await client.eval(`(() => {
        const modalBody = document.querySelector('[role="dialog"] .overflow-y-auto');
        if (modalBody) {
          modalBody.scrollTop = 180;
        }
      })()`);
      await new Promise((r) => setTimeout(r, 600));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase8b-defense-report-${res.label}.png`)
      );

      // Close modal before next scenario
      await client.eval(`(() => {
        window.__metricsStore.getState().closeRunSummary();
      })()`);
      await new Promise((r) => setTimeout(r, 400));

      // --- D) phase8b-hurt-users-[res].png ---
      // Run summary showing "Hurt Legitimate Users" verdict due to high sensitivity WAF or global rate limiter
      console.log(`[D] Capturing "Hurt Legitimate Users" verdict in Run Summary @ ${res.label}`);
      await client.eval(`(() => {
        const defenseStore = window.__defenseStore.getState();
        const simStore = window.__simulationStore.getState();
        const graphStore = window.__graphStore.getState();
        const metricsStore = window.__metricsStore.getState();

        // Clear previous run summary delta
        defenseStore.setPreviousRunSummary(null);

        // Configure Rate Limiter to Global scope with aggressive/punishing 10 RPS limit
        defenseStore.updateRateLimiterConfig({
          scope: 'global',
          burstCapacity: 10,
          sustainedRateRps: 15,
        });

        // Configure WAF to extreme 0.99 sensitivity causing severe false positives
        defenseStore.updateWafConfig({
          sensitivity: 0.99,
          rulesets: {
            genericWebAttacks: true,
            botProtection: true,
            rateBasedRules: true,
          },
        });

        // Re-run simulation to end (15000ms)
        simStore.seek(15000, graphStore.graph);

        // Open Run Summary modal
        metricsStore.openRunSummary();
      })()`);
      await new Promise((r) => setTimeout(r, 1200));

      // Scroll modal to defense table
      await client.eval(`(() => {
        const modalBody = document.querySelector('[role="dialog"] .overflow-y-auto');
        if (modalBody) {
          modalBody.scrollTop = 220;
        }
      })()`);
      await new Promise((r) => setTimeout(r, 600));

      await client.captureScreenshot(
        resolve(SCREENSHOT_DIR, `phase8b-hurt-users-${res.label}.png`)
      );

      // Close modal before next resolution iteration
      await client.eval(`(() => {
        window.__metricsStore.getState().closeRunSummary();
      })()`);
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log('\n🎉 ALL PHASE 8B VISUAL QA SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    if (client) client.close();
    browserProc.kill();
    server.close();
  }
}

runVisualQAPhase8B().catch((err) => {
  console.error('\n❌ Phase 8B Visual QA Failed:', err);
  process.exit(1);
});
