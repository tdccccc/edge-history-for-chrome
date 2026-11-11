/**
 * Feature-level CDP tests that run against the offline demo data.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { capturePageErrors, pinClock } from './lib/cdp.mjs';

const POPUP_WIDTH = 378;
const POPUP_HEIGHT = 500;
const SHORT_HEIGHT = 470;
const CJK = /[\u3400-\u9fff]/;

const POPUP_LAYOUT_EXPRESSION = `(() => {
  const html = document.documentElement;
  const body = document.body;
  const popup = document.querySelector('.popup');
  const scroll = document.querySelector('#scrollArea');
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    htmlScrollWidth: html.scrollWidth,
    htmlScrollHeight: html.scrollHeight,
    bodyScrollWidth: body.scrollWidth,
    bodyScrollHeight: body.scrollHeight,
    popupWidth: popup ? popup.getBoundingClientRect().width : null,
    popupHeight: popup ? popup.getBoundingClientRect().height : null,
    scrollClientHeight: scroll ? scroll.clientHeight : null,
    scrollHeight: scroll ? scroll.scrollHeight : null
  };
})()`;

function assertNoOuterScroll(metrics, label) {
  assert.ok(metrics.htmlScrollWidth <= metrics.innerWidth, label + ': html width overflow');
  assert.ok(metrics.bodyScrollWidth <= metrics.innerWidth, label + ': body width overflow');
  assert.ok(metrics.htmlScrollHeight <= metrics.innerHeight, label + ': html height overflow');
  assert.ok(metrics.bodyScrollHeight <= metrics.innerHeight, label + ': body height overflow');
}

function assertNoCjk(text, label) {
  assert.equal(CJK.test(text), false, label + ' contains Chinese: ' + String(text).match(CJK)?.[0]);
}

async function openDemoPage(chrome, server, path, { width = 1440, height = 960 } = {}) {
  const page = await chrome.newPage();
  await pinClock(page);
  await page.setViewport(width, height);
  const errors = capturePageErrors(page);
  await page.navigate(server.url + path);
  return { page, errors };
}

async function loadAllHistory(page, expected, {
  container = '#content',
  row = '.history-row',
  button = '[data-action="load-more"]',
  timeoutMs = 120000
} = {}) {
  const started = Date.now();
  let lastRows = 0;
  let stalled = 0;

  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(`(() => {
      const scroller = document.querySelector(${JSON.stringify(container)});
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      return {
        rows: document.querySelectorAll(${JSON.stringify(row)}).length,
        hasButton: Boolean(document.querySelector(${JSON.stringify(button)})),
        footer: document.querySelector('#listFooter')?.textContent || ''
      };
    })()`);

    if (state.rows >= expected) return state;
    if (state.rows === lastRows) stalled += 1;
    else stalled = 0;
    lastRows = state.rows;

    // Scrolling normally triggers the sentinel. If content-visibility makes the
    // sentinel miss, the visible load-more button is the deterministic fallback.
    if (stalled >= 2 && state.hasButton) {
      await page.evaluate(`document.querySelector(${JSON.stringify(button)})?.click()`);
      stalled = 0;
    }
    await delay(150);
  }

  throw new Error(
    `Timed out loading ${expected} rows; last count ${lastRows}. ` +
    `Footer: ${await page.evaluate("document.querySelector('#listFooter')?.textContent || ''")}`
  );
}

async function waitForDownload(directory, extension, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const names = readdirSync(directory).filter((name) => name.endsWith(extension));
    for (const name of names) {
      const path = join(directory, name);
      try {
        if (statSync(path).size > 0) return path;
      } catch {
        // The file can disappear while Chrome finalises the download.
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for a ${extension} download in ${directory}`);
}

export async function runDemoFeatures({ test, chrome, server }) {
  await test('demo i18n: English shell, date headers and live language switch', async () => {
    const { page, errors } = await openDemoPage(chrome, server, '/history.html?demo=1&lang=en');
    try {
      await page.waitForFunction("document.querySelectorAll('.history-row').length > 0");
      await delay(200);

      const shell = await page.evaluate(`({
        lang: document.documentElement.lang,
        title: document.title,
        pageTitle: document.querySelector('#pageTitle').textContent,
        nav: [...document.querySelectorAll('.nav-label')].map((node) => node.textContent),
        firstGroup: document.querySelector('.group-title')?.textContent,
        count: document.querySelector('#resultCount').textContent,
        search: document.querySelector('#searchInput').placeholder,
        theme: document.querySelector('#themeBtn').title,
        ranges: [...document.querySelectorAll('#rangePopover [data-range] > span:first-child')].map((node) => node.textContent)
      })`);
      assert.equal(shell.lang, 'en');
      assert.equal(shell.title, 'History · Edge-style History');
      assert.equal(shell.pageTitle, 'History');
      assert.deepEqual(shell.nav, ['History', 'Recently closed', 'Other devices']);
      assert.equal(shell.firstGroup, 'Today');
      assert.match(shell.count, /36 items/);
      assert.equal(shell.search, 'Search history (title or URL)');
      assert.match(shell.theme, /^Theme: /);
      assert.ok(shell.ranges.includes('All time') && shell.ranges.includes('Custom range…'));
      assertNoCjk(
        await page.evaluate("document.querySelector('.sidebar').innerText + document.querySelector('.topbar').innerText"),
        'English history shell'
      );

      await page.evaluate("document.getElementById('settingsBtn').click()");
      await page.waitForFunction("document.querySelector('#languageSelect')");
      const enSettings = await page.evaluate(`({
        heading: document.querySelector('#modalTitle').textContent,
        sections: [...document.querySelectorAll('.settings-section h3')].map((node) => node.textContent),
        language: document.querySelector('#languageSelect').value,
        options: [...document.querySelectorAll('#languageSelect option')].map((node) => node.textContent),
        text: document.querySelector('#modalLayer').innerText
      })`);
      assert.equal(enSettings.heading, 'Settings');
      assert.deepEqual(enSettings.sections, ['Appearance', 'Data', 'Shortcuts', 'About']);
      assert.equal(enSettings.language, 'en');
      assert.deepEqual(enSettings.options, ['Follow browser', 'Chinese (Simplified)', 'English']);
      assertNoCjk(enSettings.text, 'English settings dialog');

      await page.evaluate(`(() => {
        const select = document.querySelector('#languageSelect');
        select.value = 'zh-CN';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await page.waitForFunction("document.documentElement.lang === 'zh-CN' && document.querySelector('#modalTitle')?.textContent === '设置'");
      const zh = await page.evaluate(`({
        nav: [...document.querySelectorAll('.nav-label')].map((node) => node.textContent),
        group: document.querySelector('.group-title')?.textContent,
        count: document.querySelector('#resultCount').textContent,
        search: document.querySelector('#searchInput').placeholder,
        heading: document.querySelector('#modalTitle').textContent,
        language: document.querySelector('#languageSelect').value
      })`);
      assert.deepEqual(zh.nav, ['历史记录', '最近关闭', '来自其他设备']);
      assert.equal(zh.group, '今天');
      assert.match(zh.count, /共 36 条/);
      assert.match(zh.search, /搜索历史记录/);
      assert.equal(zh.heading, '设置');
      assert.equal(zh.language, 'zh-CN');

      await page.evaluate(`(() => {
        const select = document.querySelector('#languageSelect');
        select.value = 'en';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await page.waitForFunction("document.documentElement.lang === 'en' && document.querySelector('#modalTitle')?.textContent === 'Settings'");
      assert.equal(await page.evaluate("document.querySelector('#languageSelect').value"), 'en');
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  });

  await test('demo popup: English/Chinese labels and no outer scroll at 500 and 470px', async () => {
    const { page, errors } = await openDemoPage(chrome, server, '/popup.html?demo=1&lang=en', {
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT
    });
    try {
      await page.waitForFunction("document.querySelectorAll('.p-row').length > 0");
      await delay(150);
      const en = await page.evaluate(`({
        lang: document.documentElement.lang,
        title: document.title,
        brand: document.querySelector('.p-brand strong').textContent,
        full: document.querySelector('#openFull').innerText,
        tabs: [...document.querySelectorAll('.p-tab')].map((node) => node.textContent),
        range: document.querySelector('#rangeLabel').textContent,
        meta: document.querySelector('.p-meta-label').textContent,
        count: document.querySelector('#historyCount').textContent,
        group: document.querySelector('.p-group-title').textContent,
        text: document.querySelector('.p-header').innerText + document.querySelector('.p-toolbar').innerText
      })`);
      assert.equal(en.lang, 'en');
      assert.equal(en.title, 'History');
      assert.equal(en.brand, 'History');
      assert.match(en.full, /Full page/);
      assert.deepEqual(en.tabs, ['History', 'Recently closed']);
      assert.equal(en.range, 'All time');
      assert.equal(en.meta, 'By date');
      assert.match(en.count, /36 items/);
      assert.equal(en.group, 'Today');
      assertNoCjk(en.text, 'English popup chrome');

      const metrics500 = await page.evaluate(POPUP_LAYOUT_EXPRESSION);
      assert.equal(metrics500.innerWidth, POPUP_WIDTH);
      assert.equal(metrics500.innerHeight, POPUP_HEIGHT);
      assert.equal(Math.round(metrics500.popupWidth), POPUP_WIDTH);
      assertNoOuterScroll(metrics500, 'popup 378x500');

      await page.setViewport(POPUP_WIDTH, SHORT_HEIGHT);
      await delay(300);
      const metrics470 = await page.evaluate(POPUP_LAYOUT_EXPRESSION);
      assert.equal(metrics470.innerWidth, POPUP_WIDTH);
      assert.equal(metrics470.innerHeight, SHORT_HEIGHT);
      assertNoOuterScroll(metrics470, 'popup 378x470');
      assert.ok(metrics470.scrollHeight > metrics470.scrollClientHeight, 'list should scroll inside the popup');
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }

    const zhPage = await openDemoPage(chrome, server, '/popup.html?demo=1&lang=zh-CN', {
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT
    });
    try {
      await zhPage.page.waitForFunction("document.querySelectorAll('.p-row').length > 0");
      const zh = await zhPage.page.evaluate(`({
        lang: document.documentElement.lang,
        brand: document.querySelector('.p-brand strong').textContent,
        tabs: [...document.querySelectorAll('.p-tab')].map((node) => node.textContent),
        range: document.querySelector('#rangeLabel').textContent,
        count: document.querySelector('#historyCount').textContent,
        group: document.querySelector('.p-group-title').textContent
      })`);
      assert.equal(zh.lang, 'zh-CN');
      assert.equal(zh.brand, '历史记录');
      assert.deepEqual(zh.tabs, ['历史记录', '最近关闭']);
      assert.equal(zh.range, '全部时间');
      assert.match(zh.count, /共 36 条/);
      assert.equal(zh.group, '今天');
      assert.deepEqual(zhPage.errors.errors, []);
    } finally {
      zhPage.errors.stop();
      await zhPage.page.close();
    }
  });

  await test('demo empty states: English history, recently closed and devices views', async () => {
    const { page, errors } = await openDemoPage(chrome, server, '/history.html?demo=1&empty=1&lang=en');
    try {
      await page.waitForFunction("document.querySelector('.empty h2')");
      const history = await page.evaluate(`({
        title: document.querySelector('.empty h2').textContent,
        body: document.body.innerText,
        count: document.querySelector('#resultCount').textContent
      })`);
      assert.equal(history.title, 'No history yet');
      assert.match(history.count, /0 items/);
      assertNoCjk(history.body, 'English empty history');

      await page.evaluate("document.querySelector('.nav-item[data-view=closed]').click()");
      await page.waitForFunction("!document.querySelector('#closedView').hidden && document.querySelector('#closedView .empty h2')");
      const closed = await page.evaluate("document.querySelector('#closedView').innerText");
      assert.match(closed, /No recently closed tabs/);
      assertNoCjk(closed, 'English empty recently closed');

      await page.evaluate("document.querySelector('.nav-item[data-view=devices]').click()");
      await page.waitForFunction("!document.querySelector('#devicesView').hidden && document.querySelector('.sync-empty h2')");
      const devices = await page.evaluate("document.querySelector('#devicesView').innerText");
      assert.match(devices, /No tabs from other devices yet/);
      assert.match(devices, /Open Chrome sync settings/);
      assertNoCjk(devices, 'English empty devices');
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  });

  await test('demo pagination: 300 tied timestamps across midnight all load', async () => {
    const { page, errors } = await openDemoPage(chrome, server, '/history.html?demo=1&count=300&tie=1&lang=en');
    try {
      await page.waitForFunction("document.querySelectorAll('.history-row').length > 0");
      const initial = await page.evaluate("document.querySelectorAll('.history-row').length");
      assert.equal(initial, 100, 'first page should contain 100 rows');
      await loadAllHistory(page, 300);
      const result = await page.evaluate(`({
        rows: document.querySelectorAll('.history-row').length,
        groups: [...document.querySelectorAll('.group-title')].map((node) => node.textContent),
        groupCounts: [...document.querySelectorAll('.group-count')].map((node) => node.textContent),
        uniqueTitles: new Set([...document.querySelectorAll('.row-title')].map((node) => node.textContent)).size,
        footer: document.querySelector('#listFooter').textContent
      })`);
      assert.equal(result.rows, 300);
      assert.deepEqual(result.groups, ['Today', 'Yesterday']);
      assert.deepEqual(result.groupCounts, ['150 items', '150 items']);
      assert.equal(result.uniqueTitles, 300);
      assert.match(result.footer, /Showing all 300 items/);
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  }, { timeoutMs: 60000 });

  await test('demo pagination: 5000 rows load by scrolling', async () => {
    const { page, errors } = await openDemoPage(chrome, server, '/history.html?demo=1&count=5000&lang=en');
    try {
      await page.waitForFunction("document.querySelectorAll('.history-row').length > 0");
      const initial = await page.evaluate("document.querySelectorAll('.history-row').length");
      assert.equal(initial, 100);
      const started = Date.now();
      await loadAllHistory(page, 5000);
      const elapsed = Date.now() - started;
      const result = await page.evaluate(`({
        rows: document.querySelectorAll('.history-row').length,
        footer: document.querySelector('#listFooter').textContent
      })`);
      assert.equal(result.rows, 5000);
      assert.match(result.footer, /Showing all 5,000 items/);
      console.log('    loaded 5000 rows in ' + (elapsed / 1000).toFixed(2) + 's');
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  }, { timeoutMs: 150000 });

  await test('demo duplicate pages: merge on/off changes row and visit counts', async () => {
    const { page, errors } = await openDemoPage(chrome, server, '/history.html?demo=1&duplicates=1&lang=en');
    try {
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 3");
      const merged = await page.evaluate(`({
        rows: document.querySelectorAll('.history-row').length,
        chips: [...document.querySelectorAll('.visit-chip')].map((node) => node.textContent),
        titles: [...document.querySelectorAll('.row-title')].map((node) => node.textContent)
      })`);
      assert.equal(merged.rows, 3);
      assert.deepEqual(merged.chips, ['10 visits', '2 visits', '3 visits']);
      assert.deepEqual(merged.titles, ['Duplicate thread', 'Duplicate thread', 'Other title']);

      await page.evaluate("__demoChrome.storage.sync.set({ mergeDuplicates: false })");
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 8");
      assert.equal(await page.evaluate("document.querySelectorAll('.history-row').length"), 8);

      await page.evaluate("__demoChrome.storage.sync.set({ mergeDuplicates: true })");
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 3");
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  });

  await test('demo popup: 300 tied timestamps all load', async () => {
    const { page, errors } = await openDemoPage(chrome, server, '/popup.html?demo=1&count=300&tie=1&lang=en', {
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT
    });
    try {
      await page.waitForFunction("document.querySelectorAll('.p-row').length > 0");
      assert.equal(await page.evaluate("document.querySelectorAll('.p-row').length"), 60);
      await loadAllHistory(page, 300, {
        container: '#scrollArea',
        row: '.p-row',
        button: '[data-action="load-more"]',
        timeoutMs: 30000
      });
      const result = await page.evaluate(`({
        rows: document.querySelectorAll('.p-row').length,
        groups: [...document.querySelectorAll('.p-group-title')].map((node) => node.textContent),
        outer: document.documentElement.scrollHeight + '/' + innerHeight
      })`);
      assert.equal(result.rows, 300);
      assert.deepEqual(result.groups, ['Today', 'Yesterday']);
      assert.equal(result.outer, '500/500');
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  }, { timeoutMs: 60000 });

  await test('demo delayed delete: row hides, undo restores it, expiry really deletes it', async () => {
    const { page, errors } = await openDemoPage(chrome, server, '/history.html?demo=1&lang=en');
    try {
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 36");
      const firstTitle = await page.evaluate("document.querySelector('.history-row .row-title')?.textContent || ''");
      const firstUrl = await page.evaluate("document.querySelector('.history-row .row-title')?.getAttribute('href') || ''");

      const deleteFirstRow = async () => {
        await page.evaluate("document.querySelector('.history-row .row-more')?.click()");
        await page.waitForFunction("document.querySelector('#rowMenu [data-menu-action=\"delete\"]')");
        await page.evaluate("document.querySelector('#rowMenu [data-menu-action=\"delete\"]')?.click()");
        await page.waitForFunction("document.querySelector('#confirmOk')");
        await page.evaluate("document.querySelector('#confirmOk')?.click()");
      };

      // Undo inside the window: the row hides, then comes back, and the
      // demo history still holds the URL (deleteUrl was never called).
      await deleteFirstRow();
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 35");
      await page.waitForFunction("document.querySelector('.toast-action')");
      const undoText = await page.evaluate("document.querySelector('.toast')?.textContent || ''");
      assert.match(undoText, /Will delete 1 item in 30 seconds/);
      await page.evaluate("document.querySelector('.toast-action')?.click()");
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 36");
      assert.equal(
        await page.evaluate("document.querySelector('.history-row .row-title')?.textContent || ''"),
        firstTitle
      );

      // Let the window expire: the row stays hidden, and the demo history
      // itself no longer contains the URL (deleteUrl really ran). A reload
      // cannot prove this in demo mode: demo data is rebuilt fresh on
      // every load, so check the live in-memory history instead.
      await deleteFirstRow();
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 35");
      await delay(32000);
      assert.equal(await page.evaluate("document.querySelectorAll('.history-row').length"), 35);
      const remainingUrls = await page.evaluate(`(async () => {
        const results = await window.__demoChrome.history.search({ text: '', startTime: 0, endTime: Date.now(), maxResults: 100 });
        return results.map((entry) => entry.url);
      })()`);
      assert.equal(remainingUrls.length, 35);
      assert.equal(remainingUrls.includes(firstUrl), false);
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  }, { timeoutMs: 90000 });

  await test('demo export: CSV/JSON counts, BOM, CRLF and headers', async () => {
    const downloads = mkdtempSync(join(tmpdir(), 'edge-history-downloads-'));
    const browser = await chrome.browser();
    await browser.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloads,
      eventsEnabled: true
    });
    const { page, errors } = await openDemoPage(chrome, server, '/history.html?demo=1&lang=en');
    try {
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 36");

      await page.evaluate("document.getElementById('exportBtn').click()");
      await page.waitForFunction("document.querySelector('#exportConfirm')");
      await page.evaluate("document.querySelector('#exportConfirm').click()");
      const csvPath = await waitForDownload(downloads, '.csv');
      const csv = readFileSync(csvPath, 'utf8');
      assert.equal(csv.charCodeAt(0), 0xFEFF, 'CSV should start with a UTF-8 BOM');
      assert.ok(csv.includes('\r\n'), 'CSV should use CRLF line endings');
      const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
      assert.equal(lines.length, 37, '36 rows plus the header');
      assert.equal(lines[0], 'Title,URL,Visit count,Last visit time');

      await delay(250);
      await page.evaluate("document.getElementById('exportBtn').click()");
      await page.waitForFunction("document.querySelector('#exportFormat')");
      await page.evaluate(`(() => {
        const select = document.querySelector('#exportFormat');
        select.value = 'json';
      })()`);
      await page.evaluate("document.querySelector('#exportConfirm').click()");
      const jsonPath = await waitForDownload(downloads, '.json');
      const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
      assert.equal(json.count, 36);
      assert.equal(json.items.length, 36);
      assert.equal(json.scope, 'All history');
      assert.ok(json.exportedAt);
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
      rmSync(downloads, { recursive: true, force: true });
    }
  }, { timeoutMs: 60000 });
}
