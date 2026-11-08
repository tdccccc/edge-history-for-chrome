/**
 * Feature-level CDP tests that run against the unpacked extension with real
 * chrome.history / chrome.sessions / chrome.storage APIs.
 */

import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  capturePageErrors,
  loadExtension,
  openActionPopup
} from './lib/cdp.mjs';

const CJK = /[\u3400-\u9fff]/;
const POPUP_WIDTH = 378;

const POPUP_LAYOUT_EXPRESSION = `(() => {
  const html = document.documentElement;
  const body = document.body;
  const popup = document.querySelector('.popup');
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    htmlScrollWidth: html.scrollWidth,
    htmlScrollHeight: html.scrollHeight,
    bodyScrollWidth: body.scrollWidth,
    bodyScrollHeight: body.scrollHeight,
    popupWidth: popup ? popup.getBoundingClientRect().width : null
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

async function openExtensionPage(chrome, extensionUrl, path, selector = '.app') {
  const page = await chrome.newPage(extensionUrl + path);
  await page.waitForFunction(`document.readyState === 'complete' && document.querySelector(${JSON.stringify(selector)})`, {
    timeoutMs: 15000,
    description: path + ' to render'
  });
  return page;
}

async function reload(page, selector = '.app') {
  await page.send('Page.reload', { ignoreCache: true });
  await page.waitForFunction(
    `document.readyState === 'complete' && document.querySelector(${JSON.stringify(selector)})`,
    { timeoutMs: 15000, description: 'reloaded page' }
  );
  await delay(150);
}

async function setSync(page, patch) {
  await page.evaluate(`chrome.storage.sync.set(${JSON.stringify(patch)})`);
}

async function waitForLanguage(page, language) {
  await page.waitForFunction(
    `document.documentElement.lang === ${JSON.stringify(language)}`,
    { timeoutMs: 8000, description: 'language ' + language }
  );
}

export async function runExtensionFeatures({ test, chrome, repoRoot }) {
  const extension = await loadExtension(chrome, repoRoot);
  const baseUrl = extension.extensionUrl;

  await test('real extension i18n: English/Chinese empty UI, settings and dialogs have no CJK leaks', async () => {
    const page = await openExtensionPage(chrome, baseUrl, 'history.html');
    const errors = capturePageErrors(page);
    try {
      await page.evaluate('chrome.history.deleteAll()');
      await setSync(page, { language: 'en' });
      await reload(page);
      await waitForLanguage(page, 'en');
      await page.waitForFunction("document.querySelector('.empty h2')");

      assert.equal(await page.evaluate("document.querySelector('.empty h2').textContent"), 'No history yet');
      assertNoCjk(await page.evaluate('document.body.innerText'), 'English empty history');
      assert.equal(await page.evaluate('document.title'), 'History · Edge-style History');

      for (const [button, selector, label] of [
        ['settingsBtn', '#languageSelect', 'settings'],
        ['clearBtn', '#clearConfirm', 'clear history'],
        ['exportBtn', '#exportConfirm', 'export']
      ]) {
        await page.evaluate(`document.getElementById(${JSON.stringify(button)}).click()`);
        await page.waitForFunction(`document.querySelector(${JSON.stringify(selector)})`);
        assertNoCjk(await page.evaluate("document.querySelector('#modalLayer').innerText"), 'English ' + label + ' dialog');
        await page.evaluate("document.querySelector('#modalLayer [data-modal-close]').click()");
        await delay(250);
      }

      await page.evaluate("document.querySelector('.nav-item[data-view=closed]').click()");
      await page.waitForFunction("!document.querySelector('#closedView').hidden");
      await delay(400);
      assertNoCjk(await page.evaluate("document.querySelector('#closedView').innerText"), 'English recently closed view');

      await page.evaluate("document.querySelector('.nav-item[data-view=devices]').click()");
      await page.waitForFunction("!document.querySelector('#devicesView').hidden");
      await delay(400);
      assertNoCjk(await page.evaluate("document.querySelector('#devicesView').innerText"), 'English devices view');

      await page.evaluate("document.querySelector('.nav-item[data-view=history]').click()");
      await delay(200);
      await setSync(page, { language: 'zh-CN' });
      await waitForLanguage(page, 'zh-CN');
      assert.equal(await page.evaluate("document.querySelector('#pageTitle').textContent"), '历史记录');
      assert.deepEqual(
        await page.evaluate("[...document.querySelectorAll('.nav-label')].map((node) => node.textContent)"),
        ['历史记录', '最近关闭', '来自其他设备']
      );

      await setSync(page, { language: 'en' });
      await waitForLanguage(page, 'en');
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  }, { timeoutMs: 60000 });

  await test('real extension storage: local migration to sync and live cross-page updates', async () => {
    const page = await openExtensionPage(chrome, baseUrl, 'history.html');
    const errors = capturePageErrors(page);
    try {
      await page.evaluate(`(async () => {
        await chrome.storage.sync.clear();
        const local = await chrome.storage.local.get(null);
        delete local._edgeHistorySettingsMigratedToSync;
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          ...local,
          theme: 'dark',
          language: 'zh-CN',
          showVisitCounts: false,
          openInNewTab: false,
          pageSize: 100,
          mergeDuplicates: true,
          welcomeDismissed: true
        });
      })()`);
      await reload(page);
      await waitForLanguage(page, 'zh-CN');

      const migrated = await page.evaluate(`(async () => ({
        sync: await chrome.storage.sync.get(null),
        local: await chrome.storage.local.get(null),
        theme: document.documentElement.dataset.theme
      }))()`);
      assert.equal(migrated.sync.theme, 'dark');
      assert.equal(migrated.sync.language, 'zh-CN');
      assert.equal(migrated.sync.showVisitCounts, false);
      assert.equal(migrated.theme, 'dark');
      assert.equal(migrated.local._edgeHistorySettingsMigratedToSync, true);

      const popup = await openExtensionPage(chrome, baseUrl, 'popup.html', '.popup');
      try {
        await waitForLanguage(popup, 'zh-CN');
        assert.equal(await popup.evaluate("document.documentElement.dataset.theme"), 'dark');
        assert.equal(await popup.evaluate("document.querySelector('.p-brand strong').textContent"), '历史记录');

        await setSync(page, { language: 'en', theme: 'light' });
        await waitForLanguage(page, 'en');
        await waitForLanguage(popup, 'en');
        assert.equal(await popup.evaluate("document.documentElement.dataset.theme"), 'light');
        assert.equal(await popup.evaluate("document.querySelector('.p-brand strong').textContent"), 'History');
        assert.deepEqual(errors.errors, []);
      } finally {
        await popup.close();
      }
    } finally {
      errors.stop();
      await page.close();
    }
  }, { timeoutMs: 60000 });

  await test('real extension context menu/omnibox: menu exists and search route updates the open page', async () => {
    const page = await openExtensionPage(chrome, baseUrl, 'history.html');
    const errors = capturePageErrors(page);
    try {
      await setSync(page, { language: 'en' });
      await waitForLanguage(page, 'en');
      await page.evaluate('chrome.history.deleteAll()');
      await page.evaluate(`(async () => {
        for (const url of ['https://example.com/alpha', 'https://example.com/beta']) {
          await chrome.history.addUrl({ url });
        }
      })()`);
      await reload(page);
      await page.waitForFunction("document.querySelectorAll('.history-row').length === 2");

      const manifest = await page.evaluate(`({
        permissions: chrome.runtime.getManifest().permissions,
        omnibox: chrome.runtime.getManifest().omnibox
      })`);
      assert.ok(manifest.permissions.includes('contextMenus'));
      assert.deepEqual(manifest.omnibox, { keyword: 'hist' });

      const messages = await page.evaluate(`({
        menu: chrome.i18n.getMessage('contextMenuSearch'),
        omnibox: chrome.i18n.getMessage('omniboxSearch', ['alpha']),
        fallback: chrome.i18n.getMessage('omniboxDefault')
      })`);
      assert.match(messages.menu, /%s/);
      assert.match(messages.omnibox, /alpha/);
      assert.equal(messages.fallback, 'Search history');

      const menuStatus = await page.evaluate(`new Promise((resolve) => {
        chrome.contextMenus.update('edge-history-search-selection', {
          title: chrome.i18n.getMessage('contextMenuSearch')
        }, () => resolve(chrome.runtime.lastError?.message || 'ok'));
      })`);
      assert.equal(menuStatus, 'ok');

      const popup = await openExtensionPage(chrome, baseUrl, 'popup.html', '.popup');
      try {
        await popup.evaluate(`chrome.runtime.sendMessage({
          type: 'edge-history:action',
          action: 'search',
          query: 'alpha'
        })`);
        await page.waitForFunction("location.search.includes('q=alpha')");
        await page.waitForFunction("document.querySelectorAll('.history-row').length === 1");
        assert.equal(await page.evaluate("document.querySelector('#searchInput').value"), 'alpha');
        assert.match(await page.evaluate("document.querySelector('.row-title').textContent"), /alpha/);
        assert.deepEqual(errors.errors, []);
      } finally {
        await popup.close();
      }
    } finally {
      errors.stop();
      await page.close();
    }
  }, { timeoutMs: 60000 });

  await test('real extension recently closed: re-entering the view force-refreshes sessions', async () => {
    const page = await openExtensionPage(chrome, baseUrl, 'history.html');
    const errors = capturePageErrors(page);
    try {
      await setSync(page, { language: 'en' });
      await waitForLanguage(page, 'en');
      await page.evaluate("document.querySelector('.nav-item[data-view=history]').click()");

      const sessionCount = () => page.evaluate(
        'chrome.sessions.getRecentlyClosed({ maxResults: 25 }).then((list) => list.length)'
      );

      let before = await sessionCount();
      const tabId = await page.evaluate(
        `chrome.tabs.create({ url: 'https://example.com/closed-one' }).then((tab) => tab.id)`
      );
      // A tab closed while it is still loading is not always added to the
      // session list; let it settle into a normal tab first.
      await page.waitForFunction(
        `chrome.tabs.get(${Number(tabId)}).then((tab) => tab.status === 'complete').catch(() => false)`,
        { timeoutMs: 5000 }
      ).catch(() => {});
      await delay(250);
      await page.evaluate(`chrome.tabs.remove(${Number(tabId)})`);
      await page.waitForFunction(
        `chrome.sessions.getRecentlyClosed({ maxResults: 25 }).then((list) => list.length > ${before})`,
        { timeoutMs: 8000, description: 'first closed session' }
      );

      await page.evaluate("document.querySelector('.nav-item[data-view=closed]').click()");
      await page.waitForFunction("!document.querySelector('#closedView').hidden && document.querySelectorAll('.session-card').length > 0");
      const firstCount = await page.evaluate("document.querySelectorAll('.session-card').length");
      assert.ok(firstCount > 0, 'first closed view should show a session');

      await page.evaluate("document.querySelector('.nav-item[data-view=history]').click()");
      await delay(250);
      before = await sessionCount();
      const secondTabId = await page.evaluate(
        `chrome.tabs.create({ url: 'https://example.com/closed-two' }).then((tab) => tab.id)`
      );
      await page.waitForFunction(
        `chrome.tabs.get(${Number(secondTabId)}).then((tab) => tab.status === 'complete').catch(() => false)`,
        { timeoutMs: 5000 }
      ).catch(() => {});
      await delay(250);
      await page.evaluate(`chrome.tabs.remove(${Number(secondTabId)})`);
      await page.waitForFunction(
        `chrome.sessions.getRecentlyClosed({ maxResults: 25 }).then((list) => list.length > ${before})`,
        { timeoutMs: 8000, description: 'second closed session' }
      );

      await page.evaluate("document.querySelector('.nav-item[data-view=closed]').click()");
      await page.waitForFunction(
        `document.querySelectorAll('.session-card').length > ${firstCount}`,
        { timeoutMs: 8000, description: 'closed view to refresh with the new session' }
      );
      assert.ok(
        await page.evaluate("document.querySelectorAll('.session-card').length") > firstCount,
        're-entering recently closed must refresh sessions'
      );
      assert.deepEqual(errors.errors, []);
    } finally {
      errors.stop();
      await page.close();
    }
  }, { timeoutMs: 60000 });

  await test('real action popup: 378px, no outer scroll, English and Chinese', async () => {
    const page = await openExtensionPage(chrome, baseUrl, 'history.html');
    try {
      await setSync(page, { language: 'en' });
      await waitForLanguage(page, 'en');
      const english = await openActionPopup(chrome, page);
      try {
        await waitForLanguage(english, 'en');
        const metrics = await english.evaluate(POPUP_LAYOUT_EXPRESSION);
        assert.equal(metrics.innerWidth, POPUP_WIDTH);
        assertNoOuterScroll(metrics, 'English action popup');
        const text = await english.evaluate("document.querySelector('.p-header').innerText + document.querySelector('.p-toolbar').innerText");
        assertNoCjk(text, 'English action popup');
        assert.match(await english.evaluate("document.querySelector('.p-tab').textContent"), /History/);
      } finally {
        await english.close();
      }

      await setSync(page, { language: 'zh-CN' });
      await waitForLanguage(page, 'zh-CN');
      const chinese = await openActionPopup(chrome, page);
      try {
        await waitForLanguage(chinese, 'zh-CN');
        const metrics = await chinese.evaluate(POPUP_LAYOUT_EXPRESSION);
        assert.equal(metrics.innerWidth, POPUP_WIDTH);
        assertNoOuterScroll(metrics, 'Chinese action popup');
        assert.equal(await chinese.evaluate("document.querySelector('.p-brand strong').textContent"), '历史记录');
        assert.equal(await chinese.evaluate("document.querySelector('#rangeLabel').textContent"), '全部时间');
      } finally {
        await chinese.close();
      }
      console.log('    note: real action-popup height is fixed at 500 in headless CFT; the 470px branch is covered by the demo viewport test');
    } finally {
      await setSync(page, { language: 'en' });
      await page.close();
    }
  }, { timeoutMs: 60000 });
}
