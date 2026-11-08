/**
 * Baseline layout/loading regressions. Feature-level checks live in
 * demo-features.mjs and extension-features.mjs.
 */

import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  capturePageErrors,
  loadExtension,
  openActionPopup,
  pinClock
} from './lib/cdp.mjs';

const POPUP_WIDTH = 378;
const POPUP_HEIGHT = 500;

const POPUP_LAYOUT_EXPRESSION = `(() => {
  const html = document.documentElement;
  const body = document.body;
  const popup = document.querySelector('.popup');
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: html.clientWidth,
    clientHeight: html.clientHeight,
    htmlScrollWidth: html.scrollWidth,
    htmlScrollHeight: html.scrollHeight,
    bodyScrollWidth: body.scrollWidth,
    bodyScrollHeight: body.scrollHeight,
    popupWidth: popup ? popup.getBoundingClientRect().width : null,
    popupHeight: popup ? popup.getBoundingClientRect().height : null
  };
})()`;

function assertNoOuterScroll(metrics, label) {
  assert.ok(
    metrics.htmlScrollWidth <= metrics.innerWidth,
    `${label}: documentElement.scrollWidth (${metrics.htmlScrollWidth}) exceeds innerWidth (${metrics.innerWidth})`
  );
  assert.ok(
    metrics.bodyScrollWidth <= metrics.innerWidth,
    `${label}: body.scrollWidth (${metrics.bodyScrollWidth}) exceeds innerWidth (${metrics.innerWidth})`
  );
  assert.ok(
    metrics.htmlScrollHeight <= metrics.innerHeight,
    `${label}: documentElement.scrollHeight (${metrics.htmlScrollHeight}) exceeds innerHeight (${metrics.innerHeight})`
  );
  assert.ok(
    metrics.bodyScrollHeight <= metrics.innerHeight,
    `${label}: body.scrollHeight (${metrics.bodyScrollHeight}) exceeds innerHeight (${metrics.innerHeight})`
  );
}

function assertPopupWidth(metrics, label, expectedWidth = POPUP_WIDTH) {
  assert.equal(metrics.innerWidth, expectedWidth, `${label}: window.innerWidth`);
  assert.equal(metrics.clientWidth, expectedWidth, `${label}: documentElement.clientWidth`);
  assert.equal(
    Math.round(metrics.popupWidth ?? -1),
    expectedWidth,
    `${label}: .popup offset width`
  );
}

export async function runDemoBaseline({ test, chrome, server }) {
  await test('demo history: 18 date groups / 36 rows, no page errors', async () => {
    const page = await chrome.newPage();
    const pageErrors = capturePageErrors(page);
    try {
      await pinClock(page);
      await page.setViewport(1440, 960);
      await page.navigate(`${server.url}/history.html?demo=1`);
      await page.waitForFunction(
        "document.querySelectorAll('.history-row').length > 0",
        { timeoutMs: 15000, description: 'demo history rows to render' }
      );
      // The list renders in one pass, but give async favicon/image work and
      // late console errors a chance to surface before asserting.
      await delay(250);
      const counts = await page.evaluate(`({
        groups: document.querySelectorAll('.history-group').length,
        rows: document.querySelectorAll('.history-row').length
      })`);
      assert.equal(counts.rows, 36, 'demo history row count');
      assert.equal(counts.groups, 18, 'demo history date-group count');
      assert.deepEqual(
        pageErrors.errors,
        [],
        'demo history page errors (uncaught exceptions / console.error)'
      );
    } finally {
      pageErrors.stop();
      await page.close();
    }
  });

  await test('demo popup: 378x500 content width, no outer scroll', async () => {
    const page = await chrome.newPage();
    try {
      await pinClock(page);
      await page.setViewport(POPUP_WIDTH, POPUP_HEIGHT);
      await page.navigate(`${server.url}/popup.html?demo=1`);
      await page.waitForFunction("document.querySelectorAll('.p-row').length > 0", {
        timeoutMs: 15000,
        description: 'demo popup rows to render'
      });
      await delay(150);
      const metrics = await page.evaluate(POPUP_LAYOUT_EXPRESSION);
      assertPopupWidth(metrics, 'demo popup');
      assert.equal(metrics.innerHeight, POPUP_HEIGHT, 'demo popup: window.innerHeight');
      assertNoOuterScroll(metrics, 'demo popup');
    } finally {
      await page.close();
    }
  });
}

export async function runExtensionBaseline({ test, chrome, repoRoot }) {
  let extension = null;

  await test('real extension: loads, history.html opens, chrome.history present', async () => {
    extension = await loadExtension(chrome, repoRoot);
    assert.match(extension.extensionId, /^[a-p]{32}$/, 'computed unpacked extension ID shape');
    assert.equal(extension.runtime.id, extension.extensionId, 'chrome.runtime.id matches computed ID');
    assert.equal(extension.runtime.hasHistory, true, 'chrome.history is available on the page');
    assert.match(
      extension.runtime.url,
      new RegExp(`^chrome-extension://${extension.extensionId}/history\\.html`),
      'history.html opened inside the extension'
    );
  });

  await test('real action popup: 378px wide, no outer scroll', async () => {
    assert.ok(extension?.page, 'requires the extension baseline test to have loaded a page');
    const popup = await openActionPopup(chrome, extension.page);
    try {
      const popupExtensionId = await popup.evaluate('chrome.runtime.id');
      assert.equal(popupExtensionId, extension.extensionId, 'popup belongs to the loaded extension');

      const metrics = await popup.evaluate(POPUP_LAYOUT_EXPRESSION);
      assertPopupWidth(metrics, 'action popup');
      assertNoOuterScroll(metrics, 'action popup');
      console.log(
        `    action popup viewport: ${metrics.innerWidth}x${metrics.innerHeight}, ` +
          `html/body scrollHeight: ${metrics.htmlScrollHeight}/${metrics.bodyScrollHeight}`
      );

      // Optional resize branch. Headless Chrome currently exposes no browser
      // window for an extension action popup, so this normally reports the
      // limitation instead of failing the baseline.
      let resizedMetrics = null;
      let resizeError = null;
      try {
        const { windowId, bounds } = await chrome.windowForTarget(popup.targetId);
        const before = bounds || (await chrome.getWindowBounds(windowId));
        if (before.height === 470 && before.width === POPUP_WIDTH) {
          throw new Error('popup window was already 378x470; resize was not observable');
        }
        await chrome.setWindowBounds(windowId, { width: POPUP_WIDTH, height: 470 });
        await popup.waitForFunction(
          `window.innerHeight !== ${Number(metrics.innerHeight)}`,
          { timeoutMs: 3000, description: 'action popup viewport height after Browser.setWindowBounds' }
        );
        resizedMetrics = await popup.evaluate(POPUP_LAYOUT_EXPRESSION);
      } catch (error) {
        resizeError = error.message;
      }

      if (resizedMetrics) {
        assertPopupWidth(resizedMetrics, 'resized action popup');
        assertNoOuterScroll(resizedMetrics, 'resized action popup');
        console.log(
          `    resized action popup viewport: ${resizedMetrics.innerWidth}x${resizedMetrics.innerHeight}; no outer scroll`
        );
      } else {
        console.log(
          `    note: real action-popup resize (378x470 via Browser.setWindowBounds) ` +
            `is not testable in this headless Chrome: ${resizeError}`
        );
      }
    } finally {
      await popup.close();
    }
  });
}
