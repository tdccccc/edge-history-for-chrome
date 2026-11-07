/**
 * Edge 风格历史记录 — service worker
 *
 * The extension deliberately keeps the background worker tiny: the history UI
 * talks to the chrome.history / chrome.sessions APIs directly. This worker only
 * owns install defaults, the toolbar shortcut and the one-time welcome page.
 */

const HISTORY_PAGE = 'history.html';

const DEFAULT_SETTINGS = {
  theme: 'system',
  showVisitCounts: true,
  openInNewTab: false,
  pageSize: 100,
  welcomeDismissed: false
};

async function openHistoryPage(suffix = '') {
  const baseUrl = chrome.runtime.getURL(HISTORY_PAGE);

  // Re-use an already open history tab when possible. runtime.getContexts does
  // not require the broad "tabs" permission, which keeps the install prompt
  // focused on history/sessions access.
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    const existing = contexts.find((context) =>
      (context.documentUrl || '').startsWith(baseUrl)
    );

    if (existing && existing.tabId >= 0) {
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

  await chrome.tabs.create({ url: `${baseUrl}${suffix}` });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set({
    ...DEFAULT_SETTINGS,
    ...stored,
    // A fresh install should always see the welcome card.
    welcomeDismissed: reason === 'install' ? false : Boolean(stored.welcomeDismissed)
  });

  if (reason === 'install') {
    await openHistoryPage('?welcome=1');
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-history') {
    openHistoryPage();
  }
});
