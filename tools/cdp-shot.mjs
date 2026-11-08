#!/usr/bin/env node
/**
 * Development helper: load a page in headless Chrome through CDP, wait for the
 * page to settle, optionally run a snippet, and capture a screenshot.
 *
 *   node tools/cdp-shot.mjs <url> <out.png> [expression] [width] [height]
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , url, output, expression = '', widthArg = '1440', heightArg = '960'] = process.argv;
if (!url || !output) {
  console.error('Usage: node tools/cdp-shot.mjs <url> <out.png> [expression] [width] [height]');
  process.exit(1);
}

const width = Number(widthArg) || 1440;
const height = Number(heightArg) || 960;
const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'edge-history-cdp-'));
const home = mkdtempSync(join(tmpdir(), 'edge-history-home-'));
const chromeBin = process.env.CHROME_BIN
  || '/home/tiandc/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], {
  env: { ...process.env, HOME: home },
  stdio: ['ignore', 'ignore', 'ignore']
});

let socket;
try {
  await waitForDevtools(port);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No page target found');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const events = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
      return;
    }
    for (const listener of events.get(message.method) || []) listener(message.params);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  const waitEvent = (method, timeout = 15000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
    const listener = (params) => {
      clearTimeout(timer);
      events.set(method, (events.get(method) || []).filter((item) => item !== listener));
      resolve(params);
    };
    events.set(method, [...(events.get(method) || []), listener]);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });

  const loaded = waitEvent('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    const value = result?.result?.value;
    if (value !== undefined) {
      console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    }
    if (result?.exceptionDetails) {
      console.error(result.exceptionDetails.text || 'Evaluation failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  writeFileSync(output, Buffer.from(screenshot.data, 'base64'));
  console.log(`wrote ${output} (${width}x${height})`);
} finally {
  try {
    socket?.close();
  } catch {
    // ignore
  }
  chrome.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 200));
  rmSync(profile, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
}

async function waitForDevtools(devtoolsPort) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('Chrome DevTools endpoint did not start');
}
