#!/usr/bin/env node
/**
 * Tiny dependency-free test runner for the Edge History CDP regression suite.
 *
 *   node tests/run.mjs
 *
 * Exit code is 0 only when every test passes.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer, launchChrome } from './lib/cdp.mjs';
import { runDemoBaseline, runExtensionBaseline } from './baseline.mjs';
import { runDemoFeatures } from './demo-features.mjs';
import { runExtensionFeatures } from './extension-features.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suiteStarted = performance.now();
const results = [];
let testNumber = 0;

async function test(name, fn, { timeoutMs = 45000 } = {}) {
  testNumber += 1;
  const started = performance.now();
  console.log(`\n[${testNumber}] ${name}`);
  let timer = null;
  try {
    await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Test timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      })
    ]);
    const duration = performance.now() - started;
    results.push({ name, ok: true, duration });
    console.log(`    PASS (${(duration / 1000).toFixed(2)}s)`);
  } catch (error) {
    const duration = performance.now() - started;
    results.push({ name, ok: false, duration, error });
    console.log(`    FAIL (${(duration / 1000).toFixed(2)}s)`);
    const detail = error?.stack || String(error);
    console.log(
      detail
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')
    );
  } finally {
    clearTimeout(timer);
  }
}

function printSummary() {
  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  const elapsed = (performance.now() - suiteStarted) / 1000;
  console.log(
    `\n${passed} passed, ${failed} failed, ${results.length} total (${elapsed.toFixed(2)}s)`
  );
  if (failed) {
    console.log('\nFailed tests:');
    for (const result of results.filter((item) => !item.ok)) {
      console.log(`  - ${result.name}`);
    }
  }
}

console.log('Edge History CDP regression suite');
console.log(`Repo: ${repoRoot}`);

let fatalError = null;
let demoChrome = null;
let demoServer = null;
let extensionChrome = null;

try {
  demoServer = await createStaticServer({ root: repoRoot });
  demoChrome = await launchChrome();
  console.log(`Chrome: ${demoChrome.version.Browser || demoChrome.version['User-Agent'] || 'unknown'}`);
  console.log(`Binary: ${demoChrome.chromeBin}`);
  console.log(`Demo server: ${demoServer.url}`);
  console.log('Isolation: temporary HOME + user-data-dir, TZ=UTC');
  console.log('\nDemo pages (clock pinned to 2026-11-08T15:00:00Z for stable date groups)');
  await runDemoBaseline({
    test,
    chrome: demoChrome,
    server: demoServer
  });

  console.log('\nDemo feature regressions');
  await runDemoFeatures({
    test,
    chrome: demoChrome,
    server: demoServer
  });
} catch (error) {
  fatalError = error;
} finally {
  await demoChrome?.close().catch((error) => console.error('Could not close demo Chrome:', error.message));
  await demoServer?.close().catch((error) => console.error('Could not close demo server:', error.message));
}

if (!fatalError) {
  console.log('\nPackaged extension (unpacked via --load-extension)');
  try {
    extensionChrome = await launchChrome({ extensionPath: repoRoot });
    await runExtensionBaseline({
      test,
      chrome: extensionChrome,
      repoRoot
    });

    console.log('\nExtension feature regressions');
    await runExtensionFeatures({
      test,
      chrome: extensionChrome,
      repoRoot
    });
  } catch (error) {
    fatalError = error;
  } finally {
    await extensionChrome
      ?.close()
      .catch((error) => console.error('Could not close extension Chrome:', error.message));
  }
}

if (fatalError) {
  console.log('\nFATAL: harness setup failed');
  console.log(
    (fatalError.stack || String(fatalError))
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n')
  );
}

printSummary();
if (fatalError || results.some((result) => !result.ok)) {
  process.exitCode = 1;
}
