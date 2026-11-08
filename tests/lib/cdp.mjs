/**
 * Dependency-free Chrome DevTools Protocol harness for the Edge History
 * extension.
 *
 * Everything here uses Node 22 built-ins: child_process, crypto, fs, http and
 * the global WebSocket. Designed to be reused by future regression tests
 * (pagination, exports, search, ...).
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { createServer, get as httpGet } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const DEFAULT_CHROME_BIN =
  '/home/tiandc/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';

const STATIC_MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const activeChromes = new Set();
let cleanupHandlersInstalled = false;

function installCleanupHandlers() {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;
  const cleanup = () => {
    for (const chrome of [...activeChromes]) chrome.killSync();
  };
  process.on('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      cleanup();
      process.exit(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 129);
    });
  }
}

function killProcessTree(pid, signal) {
  if (!pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Fall through to a direct kill (e.g. if the child stopped being a
      // process-group leader).
    }
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone.
  }
}

function tail(text, limit = 6000) {
  const value = String(text || '');
  return value.length > limit ? value.slice(-limit) : value;
}

export function resolveChromeBin(configured) {
  const bin = configured || process.env.CHROME_BIN || DEFAULT_CHROME_BIN;
  const absolute = resolve(bin);
  if (!existsSync(absolute)) {
    throw new Error(
      `Chrome for Testing binary not found: ${absolute}\n` +
        'Set CHROME_BIN to a Chrome for Testing binary (stable Chrome ignores --load-extension).'
    );
  }
  return absolute;
}

/**
 * Chrome derives an unpacked extension's ID from the SHA-256 of its absolute
 * path: take the first 16 bytes as hex and map each nibble 0..f to a..p.
 */
export function computeUnpackedExtensionId(extensionDir) {
  const absolute = resolve(extensionDir);
  const digest = createHash('sha256').update(absolute, 'utf8').digest('hex');
  return digest
    .slice(0, 32)
    .split('')
    .map((nibble) => String.fromCharCode(97 + Number.parseInt(nibble, 16)))
    .join('');
}

export class CdpError extends Error {
  constructor(message, { code, data } = {}) {
    super(message);
    this.name = 'CdpError';
    this.code = code;
    this.data = data;
  }
}

/**
 * One WebSocket connection to a CDP endpoint (browser or page).
 */
export class CdpConnection {
  static async connect(wsUrl, { timeoutMs = 10000 } = {}) {
    if (!wsUrl) throw new Error('Cannot connect to CDP without a webSocketDebuggerUrl');
    const socket = new WebSocket(wsUrl);
    const connection = new CdpConnection(socket);
    await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        try {
          socket.close();
        } catch {
          // ignore
        }
        reject(new Error(`Timed out after ${timeoutMs}ms connecting to CDP: ${wsUrl}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
      };
      const onOpen = () => {
        cleanup();
        resolvePromise();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to connect to CDP: ${wsUrl}`));
      };
      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onError);
    });
    return connection;
  }

  constructor(socket) {
    this.socket = socket;
    this._nextId = 1;
    this._pending = new Map();
    this._listeners = new Map();
    this._closed = false;
    this._closeError = null;
    socket.addEventListener('message', (event) => this._handleMessage(event));
    socket.addEventListener('close', () => this._handleClose());
    socket.addEventListener('error', () => this._handleClose(new Error('CDP WebSocket error')));
  }

  get closed() {
    return this._closed;
  }

  on(method, listener) {
    const listeners = this._listeners.get(method) || new Set();
    listeners.add(listener);
    this._listeners.set(method, listeners);
    return () => {
      const current = this._listeners.get(method);
      if (!current) return;
      current.delete(listener);
      if (!current.size) this._listeners.delete(method);
    };
  }

  waitForEvent(method, { predicate, timeoutMs = 15000, description } = {}) {
    return new Promise((resolvePromise, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => {
        unsubscribe();
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for CDP event ${method}` +
              (description ? ` (${description})` : '')
          )
        );
      }, timeoutMs);
      unsubscribe = this.on(method, (params) => {
        if (predicate && !predicate(params)) return;
        clearTimeout(timer);
        unsubscribe();
        resolvePromise(params);
      });
    });
  }

  send(method, params = {}, { timeoutMs = 15000 } = {}) {
    if (this._closed) {
      return Promise.reject(
        new CdpError(`Cannot send ${method}: CDP connection is closed`, {
          data: this._closeError
        })
      );
    }
    const id = this._nextId++;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Timed out after ${timeoutMs}ms sending CDP command ${method}`));
      }, timeoutMs);
      this._pending.set(id, { resolve: resolvePromise, reject, timer, method });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(error);
      }
    });
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    this._closeError = new Error('CDP connection closed');
    this._rejectPending(this._closeError);
    try {
      this.socket.close();
    } catch {
      // ignore
    }
  }

  _handleMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id) {
      const entry = this._pending.get(message.id);
      if (!entry) return;
      this._pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) {
        entry.reject(
          new CdpError(`CDP ${entry.method} failed: ${message.error.message}`, {
            code: message.error.code,
            data: message.error.data
          })
        );
      } else {
        entry.resolve(message.result);
      }
      return;
    }
    if (message.method) {
      const listeners = this._listeners.get(message.method);
      if (!listeners) return;
      for (const listener of [...listeners]) {
        try {
          listener(message.params, message);
        } catch (error) {
          console.error(`CDP event listener for ${message.method} failed:`, error);
        }
      }
    }
  }

  _handleClose(error) {
    if (this._closed) return;
    this._closed = true;
    this._closeError = error || new Error('CDP connection closed');
    this._rejectPending(this._closeError);
  }

  _rejectPending(error) {
    for (const entry of this._pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this._pending.clear();
  }
}

/**
 * A page target with convenience helpers for navigation/evaluation/waits.
 */
export class PageSession {
  constructor(connection, target, owner) {
    this.connection = connection;
    this.target = target;
    this.targetId = target.id;
    this.owner = owner;
  }

  send(method, params = {}, options = {}) {
    return this.connection.send(method, params, options);
  }

  on(method, listener) {
    return this.connection.on(method, listener);
  }

  waitForEvent(method, options = {}) {
    return this.connection.waitForEvent(method, options);
  }

  async evaluate(
    expression,
    { awaitPromise = true, returnByValue = true, userGesture = false, timeoutMs = 15000 } = {}
  ) {
    const result = await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise, returnByValue, userGesture },
      { timeoutMs }
    );
    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'Runtime.evaluate threw an exception';
      throw new Error(
        `Evaluation failed: ${description}\n--- expression ---\n${String(expression).slice(0, 600)}`
      );
    }
    return result.result?.value;
  }

  async waitForFunction(
    expression,
    { timeoutMs = 10000, intervalMs = 50, description } = {}
  ) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const value = await this.evaluate(expression, {
          timeoutMs: Math.min(5000, Math.max(1000, deadline - Date.now()))
        });
        if (value) return value;
        lastError = null;
      } catch (error) {
        lastError = error;
      }
      await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    }
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for ${description || expression}` +
        (lastError ? ` (last evaluation error: ${lastError.message})` : '')
    );
  }

  async navigate(url, { timeoutMs = 20000, waitForLoad = true } = {}) {
    if (!waitForLoad) {
      const result = await this.send('Page.navigate', { url }, { timeoutMs });
      if (result.errorText) throw new Error(`Navigation to ${url} failed: ${result.errorText}`);
      return result;
    }
    const loadPromise = this.waitForEvent('Page.loadEventFired', {
      timeoutMs,
      description: url
    }).then(
      () => null,
      (error) => error
    );
    const result = await this.send('Page.navigate', { url }, { timeoutMs });
    if (result.errorText) {
      throw new Error(`Navigation to ${url} failed: ${result.errorText}`);
    }
    const loadResult = await loadPromise;
    if (loadResult) {
      // A load event can be missed if the document was already complete
      // (e.g. an in-document navigation). Accept a completed document.
      const readyState = await this.evaluate('document.readyState').catch(() => null);
      if (readyState !== 'complete') throw loadResult;
    }
    await this.waitForFunction('document.readyState === "complete"', {
      timeoutMs: 5000,
      description: 'document.readyState === "complete"'
    }).catch(() => {});
    return result;
  }

  async setViewport(width, height, { deviceScaleFactor = 1, mobile = false } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile
    });
  }

  async clearViewport() {
    await this.send('Emulation.clearDeviceMetricsOverride');
  }

  async screenshot(filePath, { format = 'png', captureBeyondViewport = false } = {}) {
    const { data } = await this.send('Page.captureScreenshot', {
      format,
      captureBeyondViewport
    });
    writeFileSync(filePath, Buffer.from(data, 'base64'));
    return filePath;
  }

  /**
   * Register a script that runs before any page script. Use pinClock() for
   * wall-clock-dependent demo fixtures.
   */
  async addInitScript(source) {
    return this.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  async close() {
    this.connection.close();
    this.owner?._sessions.delete(this);
  }
}

/**
 * Demo fixtures are relative to Date.now(), so the number of date groups
 * changes with the wall clock (17 at 23:xx UTC, 18 during most of the day,
 * 19 at 01:xx/11:xx/12:xx UTC). Pin the browser clock before loading demo
 * pages to make the baseline deterministic: 2026-11-08T15:00:00Z yields
 * exactly 18 groups in the UTC timezone that launchChrome() sets by default.
 */
export const FIXED_DEMO_NOW = Date.UTC(2026, 10, 8, 15, 0, 0);

export async function pinClock(page, timestamp = FIXED_DEMO_NOW) {
  await page.addInitScript(`(() => {
    const fixedNow = ${Number(timestamp)};
    Date.now = () => fixedNow;
  })();`);
}

/**
 * Capture uncaught exceptions and console.error calls from a page.
 * Returns { errors, stop() }.
 */
export function capturePageErrors(page) {
  const errors = [];
  const offException = page.on('Runtime.exceptionThrown', ({ exceptionDetails } = {}) => {
    errors.push({
      type: 'exception',
      text:
        exceptionDetails?.exception?.description ||
        exceptionDetails?.text ||
        'Uncaught exception',
      url: exceptionDetails?.url || '',
      lineNumber: exceptionDetails?.lineNumber
    });
  });
  const offConsole = page.on('Runtime.consoleAPICalled', (params = {}) => {
    if (params.type !== 'error') return;
    errors.push({
      type: 'console.error',
      text: (params.args || [])
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ')
    });
  });
  return {
    errors,
    stop() {
      offException();
      offConsole();
    }
  };
}

function fetchJson(port, pathname, { timeoutMs = 5000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const request = httpGet(
      { host: '127.0.0.1', port, path: pathname, timeout: timeoutMs },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(
              new Error(`DevTools endpoint ${pathname} returned HTTP ${response.statusCode}`)
            );
            return;
          }
          try {
            resolvePromise(JSON.parse(body));
          } catch (error) {
            reject(
              new Error(`DevTools endpoint ${pathname} returned invalid JSON: ${error.message}`)
            );
          }
        });
      }
    );
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out after ${timeoutMs}ms fetching DevTools ${pathname}`));
    });
    request.on('error', reject);
  });
}

async function waitForDevtools(profileDir, child, getStderr, { timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const portFile = join(profileDir, 'DevToolsActivePort');
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Chrome exited (code ${child.exitCode}, signal ${child.signalCode}) before DevTools started.\n` +
          `--- chrome stderr ---\n${tail(getStderr())}`
      );
    }
    let port = null;
    try {
      const lines = readFileSync(portFile, 'utf8').trim().split(/\r?\n/).filter(Boolean);
      port = Number(lines[0]);
    } catch (error) {
      // The file can be absent or half-written while Chrome starts.
      if (error?.code !== 'ENOENT') lastError = error;
    }
    if (Number.isInteger(port) && port > 0) {
      try {
        // The HTTP endpoint becomes ready shortly after the file is written.
        const version = await fetchJson(port, '/json/version', { timeoutMs: 1000 });
        return { port, version, browserWSUrl: version.webSocketDebuggerUrl };
      } catch (error) {
        lastError = error;
      }
    }
    await delay(100);
  }
  throw new Error(
    `Chrome DevTools did not start within ${timeoutMs}ms.` +
      (lastError ? `\nLast error: ${lastError.message}` : '') +
      `\n--- chrome stderr ---\n${tail(getStderr())}`
  );
}

export class ChromeInstance {
  constructor({ child, port, version, browserWSUrl, chromeBin, tmpRoot, profileDir, homeDir, stderrRef }) {
    this.child = child;
    this.port = port;
    this.version = version;
    this.browserWSUrl = browserWSUrl;
    this.chromeBin = chromeBin;
    this.tmpRoot = tmpRoot;
    this.profileDir = profileDir;
    this.homeDir = homeDir;
    this._stderrRef = stderrRef;
    this._sessions = new Set();
    this._browserConnection = null;
    this._closed = false;
    this._killed = false;
    activeChromes.add(this);
  }

  get pid() {
    return this.child.pid;
  }

  stderr() {
    return this._stderrRef.value;
  }

  async targets() {
    return fetchJson(this.port, '/json/list');
  }

  async waitForTarget(
    predicate,
    { timeoutMs = 15000, intervalMs = 100, description = 'target' } = {}
  ) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const targets = await this.targets();
        const match = targets.find(predicate);
        if (match) return match;
        lastError = null;
      } catch (error) {
        lastError = error;
      }
      await delay(intervalMs);
    }
    const targets = await this.targets().catch(() => []);
    const summary = targets
      .map((target) => `${target.type} ${target.url || '(no url)'}`)
      .join('\n  ');
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for ${description}.` +
        (lastError ? ` Last discovery error: ${lastError.message}` : '') +
        (summary ? `\nCurrent targets:\n  ${summary}` : '')
    );
  }

  async connectToTarget(target) {
    if (!target?.webSocketDebuggerUrl) {
      throw new Error(
        `Target ${target?.id || '(unknown)'} (${target?.type || '?'} ${target?.url || ''}) has no webSocketDebuggerUrl`
      );
    }
    const connection = await CdpConnection.connect(target.webSocketDebuggerUrl);
    const page = new PageSession(connection, target, this);
    this._sessions.add(page);
    try {
      await connection.send('Page.enable');
      await connection.send('Runtime.enable');
    } catch (error) {
      page.close();
      throw error;
    }
    return page;
  }

  async firstPage({ timeoutMs = 15000 } = {}) {
    const target = await this.waitForTarget((item) => item.type === 'page', {
      timeoutMs,
      description: 'a page target'
    });
    return this.connectToTarget(target);
  }

  async newPage(url = 'about:blank') {
    const browser = await this.browser();
    const { targetId } = await browser.send('Target.createTarget', { url });
    const target = await this.waitForTarget((item) => item.id === targetId, {
      timeoutMs: 15000,
      description: `page target ${targetId}`
    });
    return this.connectToTarget(target);
  }

  async browser() {
    if (this._browserConnection) return this._browserConnection;
    this._browserConnection = await CdpConnection.connect(this.browserWSUrl);
    return this._browserConnection;
  }

  async windowForTarget(targetId) {
    const browser = await this.browser();
    return browser.send('Browser.getWindowForTarget', { targetId });
  }

  async getWindowBounds(windowId) {
    const browser = await this.browser();
    const { bounds } = await browser.send('Browser.getWindowBounds', { windowId });
    return bounds;
  }

  async setWindowBounds(windowId, bounds) {
    const browser = await this.browser();
    await browser.send('Browser.setWindowBounds', { windowId, bounds });
  }

  async closeTarget(targetId) {
    const browser = await this.browser();
    await browser.send('Target.closeTarget', { targetId });
  }

  killSync() {
    if (this._killed) return;
    this._killed = true;
    this._closed = true;
    activeChromes.delete(this);
    for (const session of this._sessions) {
      try {
        session.connection.close();
      } catch {
        // ignore
      }
    }
    this._sessions.clear();
    try {
      this._browserConnection?.close();
    } catch {
      // ignore
    }
    killProcessTree(this.child.pid, 'SIGKILL');
    try {
      rmSync(this.tmpRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Best-effort at process exit.
    }
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    activeChromes.delete(this);
    for (const session of [...this._sessions]) {
      try {
        await session.close();
      } catch {
        // ignore
      }
    }
    this._sessions.clear();
    try {
      this._browserConnection?.close();
    } catch {
      // ignore
    }
    this._browserConnection = null;
    await terminateChild(this.child, 2500);
    try {
      rmSync(this.tmpRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (error) {
      console.error(`Could not remove temporary Chrome directory ${this.tmpRoot}:`, error.message);
    }
    this._killed = true;
  }
}

async function terminateChild(child, graceMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolvePromise) => child.once('exit', resolvePromise));
  killProcessTree(child.pid, 'SIGTERM');
  const timedOut = await Promise.race([
    exited.then(() => false),
    delay(graceMs).then(() => true)
  ]);
  if (!timedOut) return;
  killProcessTree(child.pid, 'SIGKILL');
  await Promise.race([exited, delay(1500)]);
}

/**
 * Launch headless Chrome with an isolated temporary profile and HOME.
 */
export async function launchChrome({
  chromeBin: configuredChromeBin,
  extensionPath,
  windowSize = { width: 1280, height: 900 },
  timezone = 'UTC',
  extraArgs = [],
  startupTimeoutMs = 25000
} = {}) {
  const chromeBin = resolveChromeBin(configuredChromeBin);
  const tmpRoot = mkdtempSync(join(tmpdir(), 'edge-history-cdp-'));
  const profileDir = join(tmpRoot, 'profile');
  const homeDir = join(tmpRoot, 'home');
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });

  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    `--window-size=${windowSize.width},${windowSize.height}`,
    ...extraArgs
  ];

  let resolvedExtensionPath = null;
  if (extensionPath) {
    resolvedExtensionPath = resolve(extensionPath);
    args.push(
      `--disable-extensions-except=${resolvedExtensionPath}`,
      `--load-extension=${resolvedExtensionPath}`
    );
  }
  args.push('about:blank');

  const env = {
    ...process.env,
    HOME: homeDir,
    // Chromium derives the local time zone from TZ on Linux. A fixed, neutral
    // zone keeps date-group baselines reproducible across machines.
    TZ: timezone,
    XDG_CONFIG_HOME: join(homeDir, '.config'),
    XDG_CACHE_HOME: join(homeDir, '.cache'),
    XDG_DATA_HOME: join(homeDir, '.local', 'share')
  };
  mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
  mkdirSync(env.XDG_CACHE_HOME, { recursive: true });
  mkdirSync(env.XDG_DATA_HOME, { recursive: true });

  const stderrRef = { value: '' };
  const child = spawn(chromeBin, args, {
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: process.platform !== 'win32'
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrRef.value += chunk;
    if (stderrRef.value.length > 128 * 1024) {
      stderrRef.value = stderrRef.value.slice(-128 * 1024);
    }
  });
  let spawnError = null;
  child.once('error', (error) => {
    spawnError = error;
  });

  installCleanupHandlers();

  let devtools;
  try {
    const deadline = Date.now() + startupTimeoutMs;
    while (!devtools) {
      if (spawnError) throw new Error(`Failed to launch Chrome: ${spawnError.message}`);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `Chrome did not expose a DevTools endpoint within ${startupTimeoutMs}ms.\n` +
            `--- chrome stderr ---\n${tail(stderrRef.value)}`
        );
      }
      try {
        devtools = await waitForDevtools(profileDir, child, () => stderrRef.value, {
          timeoutMs: Math.min(remaining, 8000)
        });
      } catch (error) {
        // Bail out immediately if Chrome died; otherwise retry until the
        // overall startup timeout expires.
        if (
          spawnError ||
          Date.now() >= deadline ||
          /Chrome exited|Failed to launch Chrome/.test(error.message)
        ) {
          throw error;
        }
      }
    }
  } catch (error) {
    killProcessTree(child.pid, 'SIGKILL');
    try {
      rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // ignore
    }
    throw error;
  }

  const chrome = new ChromeInstance({
    child,
    port: devtools.port,
    version: devtools.version,
    browserWSUrl: devtools.browserWSUrl,
    chromeBin,
    tmpRoot,
    profileDir,
    homeDir,
    stderrRef
  });
  chrome.extensionPath = resolvedExtensionPath;
  return chrome;
}

/**
 * Open the extension's history page, compute the unpacked extension ID from the
 * directory path, and verify chrome.runtime.id matches it.
 */
export async function loadExtension(
  chrome,
  extensionDir,
  { pagePath = 'history.html', timeoutMs = 15000 } = {}
) {
  const absolute = resolve(extensionDir);
  const expectedId = computeUnpackedExtensionId(absolute);
  const page = await chrome.newPage('about:blank');
  const url = `chrome-extension://${expectedId}/${pagePath}`;
  try {
    await page.navigate(url, { timeoutMs });
    const runtime = await page.waitForFunction(
      `(() => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return false;
        return {
          id: chrome.runtime.id,
          hasHistory: Boolean(chrome.history && chrome.history.search),
          url: location.href
        };
      })()`,
      { timeoutMs, description: 'extension runtime on the loaded page' }
    );
    if (runtime.id !== expectedId) {
      throw new Error(
        `Computed unpacked extension ID ${expectedId} does not match chrome.runtime.id ${runtime.id}.`
      );
    }
    return {
      extensionId: expectedId,
      extensionUrl: `chrome-extension://${expectedId}/`,
      page,
      runtime
    };
  } catch (error) {
    const targets = await chrome.targets().catch(() => []);
    const extensionTargets = targets
      .filter((target) => String(target.url || '').startsWith('chrome-extension://'))
      .map((target) => `${target.type} ${target.url}`);
    page.close();
    throw new Error(
      `Failed to load extension from ${absolute}.` +
        `\nComputed extension ID: ${expectedId}` +
        `\nTried URL: ${url}` +
        (extensionTargets.length
          ? `\nExtension targets currently visible:\n  ${extensionTargets.join('\n  ')}`
          : '\nNo chrome-extension:// targets are visible; the extension did not load.') +
        `\nOriginal error: ${error.message}`
    );
  }
}

/**
 * Open the real action popup via chrome.action.openPopup() from an extension
 * page, then attach to the resulting popup.html target.
 */
export async function openActionPopup(
  chrome,
  extensionPage,
  { timeoutMs = 15000, settleMs = 150 } = {}
) {
  const existingIds = new Set((await chrome.targets()).map((target) => target.id));
  const extensionId = await extensionPage.evaluate('chrome.runtime.id');
  const expectedPrefix = `chrome-extension://${extensionId}/popup.html`;

  try {
    await extensionPage.evaluate(
      `(async () => {
        const win = await chrome.windows.getLastFocused();
        await chrome.windows.update(win.id, { focused: true });
        return win.id;
      })()`,
      { userGesture: true, timeoutMs: 5000 }
    );
  } catch {
    // Focusing is best-effort; openPopup normally still works in headless.
  }

  let openResult;
  try {
    openResult = await extensionPage.evaluate(
      `(async () => {
        try {
          await chrome.action.openPopup();
          return { ok: true };
        } catch (error) {
          return { ok: false, message: String((error && error.message) || error) };
        }
      })()`,
      { userGesture: true, timeoutMs: 8000 }
    );
  } catch (error) {
    throw new Error(`Could not invoke chrome.action.openPopup(): ${error.message}`);
  }
  if (!openResult?.ok) {
    throw new Error(
      `chrome.action.openPopup() failed: ${openResult?.message || 'unknown error'}`
    );
  }

  let target;
  try {
    target = await chrome.waitForTarget(
      (item) =>
        item.type === 'page' &&
        !existingIds.has(item.id) &&
        String(item.url || '').startsWith(expectedPrefix),
      {
        timeoutMs,
        intervalMs: 75,
        description: `action popup target (${expectedPrefix})`
      }
    );
  } catch (error) {
    throw new Error(
      `chrome.action.openPopup() resolved but no popup target appeared. ${error.message}`
    );
  }

  const page = await chrome.connectToTarget(target);
  try {
    await page.waitForFunction(
      'document.readyState === "complete" && Boolean(document.querySelector(".popup"))',
      { timeoutMs, description: 'popup document ready' }
    );
    await page
      .waitForFunction('document.fonts ? document.fonts.status === "loaded" : true', {
        timeoutMs: 5000,
        description: 'popup fonts loaded'
      })
      .catch(() => {});
    if (settleMs > 0) await delay(settleMs);
    return page;
  } catch (error) {
    page.close();
    throw error;
  }
}

/**
 * Minimal dependency-free static file server for the demo pages.
 */
export async function createStaticServer({ root, host = '127.0.0.1' } = {}) {
  if (!root) throw new Error('createStaticServer requires a root directory');
  const rootDir = resolve(root);
  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${host}`);
      let pathname;
      try {
        pathname = decodeURIComponent(requestUrl.pathname);
      } catch {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Bad request');
        return;
      }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const relativePath = pathname.replace(/^\/+/, '');
      const filePath = resolve(rootDir, relativePath);
      if (filePath !== rootDir && !filePath.startsWith(rootDir + sep)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }
      let stat;
      try {
        stat = statSync(filePath);
      } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      if (stat.isDirectory()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      const body = readFileSync(filePath);
      response.writeHead(200, {
        'Content-Type': STATIC_MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`Internal server error: ${error.message}`);
    }
  });

  await new Promise((resolvePromise, reject) => {
    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(0, host, () => {
      server.off('error', onError);
      resolvePromise();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://${host}:${port}`;
  return {
    server,
    port,
    url,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    }
  };
}
