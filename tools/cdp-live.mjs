#!/usr/bin/env node
/**
 * Attach to an already-running Chrome DevTools endpoint, evaluate an expression
 * in a matching page and optionally capture a screenshot.
 *
 *   node tools/cdp-live.mjs <port> <url-prefix> <expression> [out.png]
 */

import { writeFileSync } from 'node:fs';

const [, , portArg, urlPrefix = 'chrome-extension://', expression = 'document.title', output] = process.argv;
const port = Number(portArg) || 9333;

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = urlPrefix.startsWith('id:')
  ? targets.find((target) => target.id === urlPrefix.slice(3))
  : targets.find((target) =>
    target.type === 'page' && (target.url || '').startsWith(urlPrefix)
  );
if (!page) {
  console.error('No matching page target. Targets:');
  for (const target of targets) console.error(`- ${target.type} ${target.url}`);
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send('Runtime.enable');
await send('Page.enable');
if (process.env.CDP_WIDTH || process.env.CDP_HEIGHT) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(process.env.CDP_WIDTH) || 1440,
    height: Number(process.env.CDP_HEIGHT) || 960,
    deviceScaleFactor: 1,
    mobile: false
  });
}

const result = await send('Runtime.evaluate', {
  expression,
  awaitPromise: true,
  returnByValue: true
});

if (result?.exceptionDetails) {
  console.error('Evaluation failed:', result.exceptionDetails.text);
  if (result.exceptionDetails.exception?.description) {
    console.error(result.exceptionDetails.exception.description);
  }
} else {
  const value = result?.result?.value;
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

if (output) {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  writeFileSync(output, Buffer.from(screenshot.data, 'base64'));
  console.error(`wrote ${output}`);
}

socket.close();
