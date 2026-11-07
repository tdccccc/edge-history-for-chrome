import './shared/demo.js';
import { mountIcons, icon } from './shared/icons.js';
import {
  canOpenUrl,
  debounce,
  escapeHtml,
  faviconUrl,
  formatCount,
  getChromeApi,
  getSettings,
  highlight,
  isDemo,
  letterFor,
  normalizeTitle,
  relativeTime,
  resolveTheme,
  tileStyle,
  toMillis,
  urlParts
} from './shared/utils.js';

const api = getChromeApi();

const state = {
  settings: {},
  loading: true,
  recentError: null,
  closedError: null,
  recent: [],
  closed: [],
  query: '',
  searching: false,
  searchError: null,
  searchResults: [],
  restoring: false
};

let el = null;
let toastTimer = 0;

init().catch((error) => {
  console.error('Popup failed to initialise', error);
  if (el?.recentList) {
    el.recentList.innerHTML = '<div class="p-empty p-error">快捷面板加载失败，请打开完整历史记录。</div>';
  }
});

async function init() {
  cacheDom();
  mountIcons();

  state.settings = await getSettings();
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings.theme === 'system') applyTheme();
  });
  bindEvents();

  if (isDemo()) el.demoPill.hidden = false;
  updateShortcutHint();
  updateSearchUi();

  await loadOverview();
  window.setTimeout(() => el.searchInput.focus(), 60);
}

function cacheDom() {
  el = {
    settingsBtn: document.getElementById('settingsBtn'),
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    searchKbd: document.getElementById('searchKbd'),
    scrollArea: document.getElementById('scrollArea'),
    mainContent: document.getElementById('mainContent'),
    recentList: document.getElementById('recentList'),
    closedList: document.getElementById('closedList'),
    closedSection: document.getElementById('closedSection'),
    viewAll: document.getElementById('viewAll'),
    viewClosed: document.getElementById('viewClosed'),
    searchView: document.getElementById('searchView'),
    searchTitle: document.getElementById('searchTitle'),
    searchCount: document.getElementById('searchCount'),
    searchList: document.getElementById('searchList'),
    searchFull: document.getElementById('searchFull'),
    openFull: document.getElementById('openFull'),
    shortcutHint: document.getElementById('shortcutHint'),
    demoPill: document.getElementById('demoPill'),
    toast: document.getElementById('toast')
  };
}

function applyTheme() {
  const resolved = resolveTheme(
    state.settings.theme,
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem('edge-history-theme', state.settings.theme);
  } catch {
    // Progressive enhancement only.
  }
}

function bindEvents() {
  el.settingsBtn.addEventListener('click', () => openAction('settings', '?settings=1'));
  el.viewAll.addEventListener('click', () => openAction('all', ''));
  el.viewClosed.addEventListener('click', () => openAction('closed', '?view=closed'));
  el.openFull.addEventListener('click', () => openAction('history', ''));
  el.searchFull.addEventListener('click', () => {
    if (state.query) openSearch(state.query);
    else openAction('history', '');
  });

  el.searchInput.addEventListener('input', (event) => {
    if (event.isComposing) return;
    updateSearchUi();
    runSearch();
  });
  el.searchInput.addEventListener('compositionend', () => {
    updateSearchUi();
    runSearch();
  });
  el.searchInput.addEventListener('search', () => {
    updateSearchUi();
    runSearch();
  });
  el.searchInput.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (el.searchInput.value) clearSearch();
      else window.close();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (state.query) openSearch(state.query);
      else openAction('history', '');
    }
  });
  el.searchClear.addEventListener('click', () => clearSearch());

  el.recentList.addEventListener('click', onRecentClick);
  el.closedList.addEventListener('click', onClosedClick);
  el.searchList.addEventListener('click', onSearchClick);

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.classList.contains('p-favicon-img')) return;
    image.closest('.p-favicon')?.classList.add('is-fallback');
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !isEditableTarget(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
    }
  });
}

const runSearch = debounce(() => performSearch(), 180);

async function loadOverview() {
  state.loading = true;
  state.recentError = null;
  state.closedError = null;
  renderOverview();

  const [recentResult, closedResult] = await Promise.allSettled([
    api.history.search({ text: '', maxResults: 4 }),
    api.sessions.getRecentlyClosed({ maxResults: 3 })
  ]);

  if (recentResult.status === 'fulfilled') {
    state.recent = Array.isArray(recentResult.value) ? recentResult.value : [];
  } else {
    state.recent = [];
    state.recentError = recentResult.reason;
    console.error('Failed to load recent history in popup', recentResult.reason);
  }

  if (closedResult.status === 'fulfilled') {
    state.closed = Array.isArray(closedResult.value) ? closedResult.value : [];
  } else {
    state.closed = [];
    state.closedError = closedResult.reason;
  }

  state.loading = false;
  renderOverview();
}

function renderOverview() {
  if (!el) return;

  if (state.loading) {
    el.recentList.innerHTML = skeletonMarkup(4);
    el.closedList.innerHTML = skeletonMarkup(2);
    return;
  }

  renderRecentList();
  renderClosedList();
}

function renderRecentList() {
  if (state.recentError) {
    el.recentList.innerHTML = `
      <div class="p-empty p-error">
        无法读取历史记录
        <button class="p-link-btn" type="button" data-action="retry-overview">重试</button>
      </div>`;
    return;
  }

  if (!state.recent.length) {
    el.recentList.innerHTML = '<div class="p-empty">还没有浏览记录。<br>打开一些网页后再来看看。</div>';
    return;
  }

  el.recentList.innerHTML = state.recent.map(historyRowMarkup).join('');
}

function renderClosedList() {
  if (state.closedError) {
    el.closedList.innerHTML = '<div class="p-empty p-error">无法读取最近关闭的标签页</div>';
    return;
  }

  if (!state.closed.length) {
    el.closedList.innerHTML = '<div class="p-empty">没有最近关闭的标签页</div>';
    return;
  }

  el.closedList.innerHTML = state.closed.map(closedRowMarkup).join('');
}

function historyRowMarkup(item) {
  const title = normalizeTitle(item.title, item.url);
  const { host } = urlParts(item.url);
  const time = relativeTime(item.lastVisitTime);

  return `
    <button class="p-row" type="button" data-url="${escapeHtml(item.url)}" title="${escapeHtml(title)}">
      ${faviconMarkup(item.url, title)}
      <span class="p-row-main">
        <span class="p-row-title">${highlight(title, state.query)}</span>
        <span class="p-row-sub">${escapeHtml(host || item.url)}</span>
      </span>
      <span class="p-row-time">${escapeHtml(time)}</span>
    </button>`;
}

function closedRowMarkup(session, index) {
  const time = session.lastModified ? relativeTime(toMillis(session.lastModified)) : '';

  if (session.tab) {
    const tab = session.tab;
    const title = normalizeTitle(tab.title, tab.url) || '未命名标签页';
    const { host } = urlParts(tab.url);
    return `
      <div class="p-closed-row" data-session-index="${index}">
        ${faviconMarkup(tab.url, title)}
        <span class="p-closed-main">
          <span class="p-closed-title">${escapeHtml(title)}</span>
          <span class="p-closed-sub">${escapeHtml(host || '标签页')}</span>
        </span>
        <span class="p-closed-time">${escapeHtml(time)}</span>
        <button class="p-restore" type="button" data-session-index="${index}" aria-label="恢复 ${escapeHtml(title)}" title="恢复标签页">
          ${icon('restore')}
        </button>
      </div>`;
  }

  const tabs = session.window?.tabs || [];
  const firstTitle = tabs[0]?.title ? normalizeTitle(tabs[0].title, tabs[0].url) : '';
  const sub = firstTitle || '包含多个标签页';
  return `
    <div class="p-closed-row" data-session-index="${index}">
      <span class="p-window-icon">${icon('window')}</span>
      <span class="p-closed-main">
        <span class="p-closed-title">窗口 · ${formatCount(tabs.length)} 个标签页</span>
        <span class="p-closed-sub">${escapeHtml(sub)}</span>
      </span>
      <span class="p-closed-time">${escapeHtml(time)}</span>
      <button class="p-restore" type="button" data-session-index="${index}" aria-label="恢复窗口，共 ${formatCount(tabs.length)} 个标签页" title="恢复窗口">
        ${icon('restore')}
      </button>
    </div>`;
}

function faviconMarkup(url, title) {
  const favicon = faviconUrl(url, 32);
  return `
    <span class="p-favicon${favicon ? '' : ' is-fallback'}" style="${tileStyle(url)}">
      ${favicon ? `<img class="p-favicon-img" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}
      <span class="p-favicon-letter">${escapeHtml(letterFor(url, title))}</span>
    </span>`;
}

function skeletonMarkup(count) {
  return `<div class="p-skeleton">${Array.from({ length: count }, () => `
    <div class="p-sk-row">
      <div class="p-sk p-sk-icon"></div>
      <div class="p-sk-lines">
        <div class="p-sk p-sk-line"></div>
        <div class="p-sk p-sk-line short"></div>
      </div>
      <div class="p-sk p-sk-time"></div>
    </div>`).join('')}</div>`;
}

/* --------------------------------------------------------------- search */

function updateSearchUi() {
  const hasValue = Boolean(el.searchInput.value.trim());
  el.searchClear.hidden = !hasValue;
  el.searchInput.closest('.p-search')?.classList.toggle('has-value', hasValue);
}

function clearSearch({ focus = true } = {}) {
  el.searchInput.value = '';
  state.query = '';
  runSearch.cancel();
  updateSearchUi();
  showOverview();
  if (focus) el.searchInput.focus();
}

async function performSearch() {
  const query = el.searchInput.value.trim();
  if (query === state.query) return;

  state.query = query;
  updateSearchUi();

  if (!query) {
    showOverview();
    return;
  }

  showSearchView();
  state.searching = true;
  state.searchError = null;
  state.searchResults = [];
  renderSearch();

  try {
    const results = await api.history.search({ text: query, maxResults: 24 });
    if (state.query !== query) return;
    state.searchResults = Array.isArray(results) ? results : [];
  } catch (error) {
    if (state.query !== query) return;
    state.searchError = error;
    console.error('Popup history search failed', error);
  } finally {
    if (state.query === query) {
      state.searching = false;
      renderSearch();
    }
  }
}

function showOverview() {
  el.mainContent.hidden = false;
  el.searchView.hidden = true;
  el.scrollArea.scrollTop = 0;
}

function showSearchView() {
  el.mainContent.hidden = true;
  el.searchView.hidden = false;
  el.scrollArea.scrollTop = 0;
}

function renderSearch() {
  if (!el) return;

  if (state.searching) {
    el.searchCount.textContent = '搜索中…';
    el.searchList.innerHTML = skeletonMarkup(5);
    return;
  }

  if (state.searchError) {
    el.searchCount.textContent = '';
    el.searchList.innerHTML = `
      <div class="p-empty p-error">
        搜索失败
        <button class="p-link-btn" type="button" data-action="retry-search">重试</button>
      </div>`;
    return;
  }

  const count = state.searchResults.length;
  el.searchCount.textContent = count ? `${formatCount(count)} 个结果` : '';

  if (!count) {
    el.searchList.innerHTML = `
      <div class="p-empty">
        <strong>未找到相关历史记录</strong>
        试试其他关键词，或打开完整页面调整时间范围。
      </div>`;
    return;
  }

  el.searchList.innerHTML = state.searchResults.map(historyRowMarkup).join('');
}

/* --------------------------------------------------------------- actions */

async function onRecentClick(event) {
  if (event.target.closest('[data-action="retry-overview"]')) {
    loadOverview();
    return;
  }

  const row = event.target.closest('[data-url]');
  if (!row) return;
  await openUrlAndClose(row.dataset.url);
}

async function onSearchClick(event) {
  if (event.target.closest('[data-action="retry-search"]')) {
    state.query = '';
    performSearch();
    return;
  }

  const row = event.target.closest('[data-url]');
  if (!row) return;
  await openUrlAndClose(row.dataset.url);
}

async function onClosedClick(event) {
  const restore = event.target.closest('[data-session-index]');
  if (!restore) return;
  await restoreSession(Number(restore.dataset.sessionIndex));
}

async function restoreSession(index) {
  const session = state.closed[index];
  if (!session || state.restoring) return;

  const sessionId = session.tab?.sessionId ?? session.window?.sessionId;
  const button = el.closedList.querySelector(`[data-session-index="${index}"].p-restore`);
  state.restoring = true;
  if (button) button.disabled = true;

  try {
    if (sessionId != null) await api.sessions.restore(sessionId);
    else await api.sessions.restore();
    showToast(session.window ? '已恢复窗口' : '已恢复标签页', 'success');
    await loadClosedOnly();
  } catch (error) {
    console.error('Failed to restore session from popup', error);
    showToast('恢复失败，请重试', 'error');
    if (button) button.disabled = false;
  } finally {
    state.restoring = false;
  }
}

async function loadClosedOnly() {
  try {
    const sessions = await api.sessions.getRecentlyClosed({ maxResults: 3 });
    state.closed = Array.isArray(sessions) ? sessions : [];
    state.closedError = null;
  } catch (error) {
    state.closedError = error;
    state.closed = [];
  }
  renderClosedList();
}

async function openUrlAndClose(url) {
  if (!canOpenUrl(url)) {
    showToast('Chrome 不允许扩展直接打开此类型的页面', 'error');
    return;
  }

  try {
    await api.tabs.create({ url });
    window.close();
  } catch (error) {
    console.error('Failed to open history item from popup', error);
    showToast('无法打开该页面', 'error');
  }
}

async function openAction(action, suffix = '') {
  if (await focusExistingHistory(action)) return;
  await createHistoryTab(suffix);
}

async function openSearch(query) {
  if (await focusExistingHistory('search', { query })) return;
  await createHistoryTab(`?q=${encodeURIComponent(query)}`);
}

async function focusExistingHistory(action, payload = {}) {
  if (!api.runtime?.getContexts) return false;

  try {
    const base = api.runtime.getURL('history.html');
    const contexts = await api.runtime.getContexts({ contextTypes: ['TAB'] });
    const existing = contexts.find((context) => (context.documentUrl || '').startsWith(base));
    if (!existing || existing.tabId < 0) return false;

    await api.runtime.sendMessage({ type: 'edge-history:action', action, ...payload });
    await api.tabs.update(existing.tabId, { active: true });
    if (existing.windowId && existing.windowId !== api.windows.WINDOW_ID_NONE) {
      await api.windows.update(existing.windowId, { focused: true });
    }
    window.close();
    return true;
  } catch (error) {
    console.debug('No existing history page could handle the action', error);
    return false;
  }
}

async function createHistoryTab(suffix = '') {
  try {
    await api.tabs.create({ url: `${api.runtime.getURL('history.html')}${suffix}` });
    window.close();
  } catch (error) {
    console.error('Failed to open full history page', error);
    showToast('无法打开完整历史记录', 'error');
  }
}

function showToast(message, type = 'info') {
  if (!el?.toast) return;
  window.clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.className = `p-toast is-${type}`;
  el.toast.hidden = false;
  window.requestAnimationFrame(() => el.toast.classList.add('is-visible'));

  toastTimer = window.setTimeout(() => {
    el.toast.classList.remove('is-visible');
    window.setTimeout(() => {
      el.toast.hidden = true;
    }, 180);
  }, 2400);
}

function updateShortcutHint() {
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '')
    || /Macintosh/i.test(navigator.userAgent);
  if (!mac) return;
  el.shortcutHint.innerHTML = '<kbd>⌥</kbd><span>+</span><kbd>⇧</kbd><kbd>H</kbd>';
  el.shortcutHint.title = 'Option + Shift + H';
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
