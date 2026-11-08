/**
 * Edge 风格历史记录 — service worker
 *
 * The history UI talks to chrome.history / chrome.sessions directly. This
 * worker owns install defaults, the welcome page, the selection context menu
 * and the "hist" omnibox entry point.
 */

import { ensureSettings } from './shared/settings.js';
import {
  buildOmniboxSuggestions,
  escapeOmniboxXml,
  normalizeSearchQuery
} from './shared/search.js';

const HISTORY_PAGE = 'history.html';
const CONTEXT_MENU_ID = 'edge-history-search-selection';
const OMNIBOX_SUGGESTION_LIMIT = 8;

function i18nMessage(key, fallback, substitutions = []) {
  try {
    return chrome.i18n.getMessage(key, substitutions) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Focus an existing full-history tab instead of opening duplicates. A search
 * query is delivered to the already-open page via runtime messaging; if the
 * page is not ready, its URL is replaced with a deep link as a fallback.
 */
async function openHistoryPage(suffix = '', query = '') {
  const baseUrl = chrome.runtime.getURL(HISTORY_PAGE);
  const normalizedQuery = normalizeSearchQuery(query);
  const searchSuffix = normalizedQuery ? `?q=${encodeURIComponent(normalizedQuery)}` : '';

  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    const existing = contexts.find((context) =>
      (context.documentUrl || '').startsWith(baseUrl)
    );

    if (existing && existing.tabId >= 0) {
      if (normalizedQuery) {
        let handled = false;
        try {
          // chrome.tabs.sendMessage targets content scripts, not extension
          // pages. Runtime messaging is what the popup already uses to reach
          // an open full-history page.
          const response = await chrome.runtime.sendMessage({
            type: 'edge-history:action',
            action: 'search',
            query: normalizedQuery
          });
          handled = Boolean(response?.ok);
        } catch {
          handled = false;
        }

        if (!handled) {
          try {
            await chrome.tabs.update(existing.tabId, {
              url: `${baseUrl}${searchSuffix}`
            });
          } catch (error) {
            console.debug('Could not deep-link the history tab', error);
          }
        }
      }

      await chrome.tabs.update(existing.tabId, { active: true });
      if (existing.windowId && existing.windowId !== chrome.windows.WINDOW_ID_NONE) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return;
    }
  } catch (error) {
    // Older Chrome versions or restricted contexts: fall through to a new tab.
    console.debug('Could not focus existing history tab', error);
  }

  await chrome.tabs.create({ url: `${baseUrl}${suffix || searchSuffix}` });
}

function openHistorySearch(query) {
  openHistoryPage('', query).catch((error) => {
    console.debug('Could not open history search', error);
  });
}

function ensureContextMenu() {
  if (!chrome.contextMenus?.create) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: i18nMessage('contextMenuSearch', 'Search history for "%s"'),
      contexts: ['selection']
    }, () => {
      if (chrome.runtime.lastError) {
        console.debug('Could not create history context menu', chrome.runtime.lastError);
      }
    });
  });
}

function setOmniboxDefault() {
  try {
    chrome.omnibox?.setDefaultSuggestion({
      description: i18nMessage('omniboxDefault', 'Search history')
    });
  } catch (error) {
    console.debug('Could not set the omnibox default suggestion', error);
  }
}

chrome.contextMenus?.onClicked.addListener((info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  const query = normalizeSearchQuery(info.selectionText);
  if (!query) return;
  openHistorySearch(query);
});

chrome.omnibox?.onInputChanged.addListener((text, suggest) => {
  const query = normalizeSearchQuery(text);

  if (!query) {
    setOmniboxDefault();
    suggest([]);
    return;
  }

  const escapedQuery = escapeOmniboxXml(query);
  try {
    chrome.omnibox.setDefaultSuggestion({
      description: i18nMessage(
        'omniboxSearch',
        `Search history for “${escapedQuery}”`,
        [escapedQuery]
      )
    });
  } catch (error) {
    console.debug('Could not set the omnibox search suggestion', error);
  }

  chrome.history.search({
    text: query,
    startTime: 0,
    maxResults: OMNIBOX_SUGGESTION_LIMIT * 2
  }).then((items) => {
    const extensionBase = chrome.runtime.getURL('');
    const filtered = (Array.isArray(items) ? items : []).filter((item) =>
      item?.url && !item.url.startsWith(extensionBase)
    );
    suggest(buildOmniboxSuggestions(filtered, OMNIBOX_SUGGESTION_LIMIT));
  }).catch((error) => {
    console.debug('Could not read history for omnibox suggestions', error);
    suggest([]);
  });
});

chrome.omnibox?.onInputEntered.addListener((text) => {
  openHistorySearch(normalizeSearchQuery(text));
});

async function setupIntegrations({ freshInstall = false } = {}) {
  await ensureSettings({ freshInstall });
  ensureContextMenu();
  setOmniboxDefault();
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Migrate 1.2.0 local settings to sync; on a fresh install also make sure
  // the welcome card is visible even if another device dismissed it.
  await setupIntegrations({ freshInstall: reason === 'install' });

  if (reason === 'install') {
    await openHistoryPage('?welcome=1');
  }
});

chrome.runtime.onStartup.addListener(() => {
  // Context menus and the omnibox default survive worker restarts, but
  // rebuilding them keeps updates and unclear storage states deterministic.
  ensureContextMenu();
  setOmniboxDefault();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-history') {
    openHistoryPage().catch((error) => {
      console.debug('Could not open history from the command shortcut', error);
    });
  }
});
