import { spawn } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import http from 'http';

const HTML_FILE = resolve('qa/node-states-sheet.html');
const SCREENSHOT_PATH = resolve('qa/screenshots/r2-node-states-sheet.png');

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_BIN,
].filter(Boolean);

let chromePath = chromeCandidates.find((p) => existsSync(p));
if (!chromePath) {
  console.error('No Chrome binary found');
  process.exit(1);
}

const cdpPort = 9224;
const chromeProc = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--window-size=1600,1600',
  `file://${HTML_FILE}`,
]);

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let data = '';
      r.on('data', (c) => (data += c));
      r.on('end', () => res(JSON.parse(data)));
    }).on('error', rej);
  });
}

async function run() {
  await new Promise((r) => setTimeout(r, 1200));
  let targets;
  for (let i = 0; i < 20; i++) {
    try {
      targets = await getJson(`http://127.0.0.1:${cdpPort}/json`);
      if (targets && targets.length > 0) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  const page = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  await new Promise((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = (err) => rej(err);
  });

  let id = 1;
  const callbacks = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const { resolve, reject } = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const curId = id++;
      callbacks.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1500,
    height: 1800,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await new Promise((r) => setTimeout(r, 800));

  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(SCREENSHOT_PATH, Buffer.from(res.data, 'base64'));
  console.log('Saved node states sheet screenshot to:', SCREENSHOT_PATH);

  ws.close();
  chromeProc.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  chromeProc.kill();
  process.exit(1);
});
