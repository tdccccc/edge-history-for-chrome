import './shared/demo.js';
import { mountIcons, icon } from './shared/icons.js';
import { applyI18n, setLanguage, t } from './shared/i18n.js';
import {
  canOpenUrl,
  historyItemKey,
  debounce,
  escapeHtml,
  faviconUrl,
  formatCount,
  formatRangeLabel,
  formatTime,
  getChromeApi,
  getRangeBounds,
  groupItemsByDate,
  loadSettings,
  watchSettings,
  highlight,
  isDemo,
  isOwnExtensionPage,
  letterFor,
  normalizeTitle,
  relativeTime,
  resolveTheme,
  tileStyle,
  toMillis,
  urlParts
} from './shared/utils.js';

const api = getChromeApi();
const PAGE_SIZE = 60;
const SEARCH_TIME_EPSILON = 1;
const RANGES = ['all', 'hour', '24h', 'today', 'yesterday', '7d', '30d'];

const state = {
  settings: {},
  settingsArea: 'local',
  view: 'history',
  query: '',
  range: 'all',
  items: [],
  seen: new Set(),
  canonicalIndex: new Map(),
  cursor: null,
  exhausted: false,
  loading: false,
  requestId: 0,
  error: null,
  loadedOnce: false,
  closed: [],
  closedLoaded: false,
  closedLoading: false,
  closedRequestId: 0,
  closedDirty: false,
  closedError: null,
  restoring: false
};

let el = null;
let toastTimer = 0;
let toastHideTimer = 0;
let nextItemId = 1;
let historyObserver = null;

const runSearch = debounce(() => applySearch(), 200);

init().catch((error) => {
  console.error('Popup failed to initialise', error);
  if (el?.historyList) {
    el.historyList.innerHTML = `<div class="p-empty p-error">${t('popup.initError')}</div>`;
  }
});

async function init() {
  cacheDom();
  mountIcons();

  const loadedSettings = await loadSettings();
  state.settings = loadedSettings.settings;
  state.settingsArea = loadedSettings.area;
  setLanguage(state.settings.language);
  applyI18n(document);
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings.theme === 'system') applyTheme();
  });
  bindEvents();
  bindSettingsWatch();

  if (isDemo()) el.demoPill.hidden = false;
  updateShortcutHint();
  updateSearchUi();

  const params = new URLSearchParams(location.search);
  const requestedView = params.get('view') === 'closed' ? 'closed' : 'history';
  const requestedRange = params.get('range');
  const query = (params.get('q') || '').trim();

  if (RANGES.includes(requestedRange)) state.range = requestedRange;
  if (query) {
    state.query = query;
    el.searchInput.value = query;
    updateSearchUi();
  }

  state.view = requestedView;
  applyViewUi();
  updateRangeUi();

  if (state.view === 'history') {
    await loadHistoryReset();
    // The closed tab should be useful as soon as it is opened, without
    // delaying the initial history render.
    void loadClosed();
  } else {
    await loadClosed();
    // History is loaded lazily when the user switches to that tab.
  }

  window.setTimeout(setupHistoryObserver, 200);
  window.setTimeout(() => el.searchInput.focus(), 60);
}

function cacheDom() {
  el = {
    settingsBtn: document.getElementById('settingsBtn'),
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    searchKbd: document.getElementById('searchKbd'),
    scrollArea: document.getElementById('scrollArea'),
    historyTab: document.getElementById('historyTab'),
    closedTab: document.getElementById('closedTab'),
    filterWrap: document.getElementById('filterWrap'),
    rangeBtn: document.getElementById('rangeBtn'),
    rangeLabel: document.getElementById('rangeLabel'),
    rangePopover: document.getElementById('rangePopover'),
    historyView: document.getElementById('historyView'),
    historyCount: document.getElementById('historyCount'),
    historyList: document.getElementById('historyList'),
    listFooter: document.getElementById('listFooter'),
    sentinel: document.getElementById('sentinel'),
    closedView: document.getElementById('closedView'),
    closedCount: document.getElementById('closedCount'),
    closedList: document.getElementById('closedList'),
    openFull: document.getElementById('openFull'),
    demoPill: document.getElementById('demoPill'),
    toast: document.getElementById('toast')
  };
}

/* --------------------------------------------------------------- settings */

let settingsWatchTimer = 0;

function bindSettingsWatch() {
  watchSettings((next, meta) => {
    window.clearTimeout(settingsWatchTimer);
    settingsWatchTimer = window.setTimeout(() => applySettingsUpdate(next, meta), 60);
  });
}

function applyLanguagePreference(preference) {
  setLanguage(preference);
  applyI18n(document);
  updateShortcutHint();
  applyViewUi();
  updateRangeUi();
  updateCounts();
  if (state.items.length) renderHistory();
  if (state.closedLoaded) renderClosed();
}

function applySettingsUpdate(next, meta) {
  if (!next) return;
  const previous = state.settings;
  if (JSON.stringify(previous) === JSON.stringify(next)) return;

  state.settings = next;
  if (meta?.area) state.settingsArea = meta.area;
  if (previous.language !== next.language) applyLanguagePreference(next.language);
  if (previous.theme !== next.theme) applyTheme();
  if (previous.showVisitCounts !== next.showVisitCounts) renderHistory();
  if (previous.mergeDuplicates !== next.mergeDuplicates && state.view === 'history') {
    loadHistoryReset();
  }
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

/* ------------------------------------------------------------------- view */

function applyViewUi() {
  const history = state.view === 'history';
  el.historyTab.classList.toggle('is-active', history);
  el.closedTab.classList.toggle('is-active', !history);
  el.historyTab.setAttribute('aria-selected', String(history));
  el.closedTab.setAttribute('aria-selected', String(!history));
  el.historyTab.tabIndex = history ? 0 : -1;
  el.closedTab.tabIndex = history ? -1 : 0;

  el.filterWrap.hidden = !history;
  el.historyView.hidden = !history;
  el.closedView.hidden = history;

  const placeholder = history ? t('popup.searchHistory') : t('popup.searchClosed');
  el.searchInput.placeholder = placeholder;
  el.searchInput.setAttribute('aria-label', placeholder);

  updateCounts();
}

function switchView(view) {
  if (view === state.view) return;
  closeRangeMenu();
  clearSearch({ focus: false, reload: false });

  state.view = view;
  applyViewUi();
  el.scrollArea.scrollTop = 0;

  if (view === 'history') {
    loadHistoryReset();
  } else {
    renderClosed();
    loadClosed(true);
  }
}

/* ------------------------------------------------------------- history data */

function historyBounds() {
  return getRangeBounds(state.range);
}

function resetHistoryData() {
  state.requestId += 1;
  state.items = [];
  state.seen.clear();
  state.canonicalIndex.clear();
  state.cursor = null;
  state.exhausted = false;
  state.loading = false;
  state.error = null;
  state.loadedOnce = false;
}

async function loadHistoryReset() {
  if (state.view !== 'history') return;
  resetHistoryData();
  state.loadedOnce = true;
  el.scrollArea.scrollTop = 0;
  renderHistory();
  updateCounts();
  await loadHistoryMore();
}

async function loadHistoryMore() {
  if (state.view !== 'history' || state.loading || state.exhausted || !state.loadedOnce) return;
  if (!api?.history) return;

  const bounds = historyBounds();
  // chrome.history.search treats endTime as exclusive, so the cursor can be
  // passed unchanged. Subtracting 1ms drops visits that share the boundary
  // millisecond (Chrome stores visit times with sub-millisecond precision).
  const endTime = state.cursor == null ? bounds.endTime : Math.min(state.cursor + SEARCH_TIME_EPSILON, bounds.endTime);
  if (endTime <= bounds.startTime) {
    state.exhausted = true;
    renderHistory();
    updateCounts();
    return;
  }

  const requestId = ++state.requestId;
  const newIdFloor = nextItemId;
  const lastExistingTime = state.items.length ? state.items[state.items.length - 1].lastVisitTime : Infinity;
  state.loading = true;
  state.error = null;
  if (state.items.length) renderListFooter();
  else renderHistory();
  updateCounts();

  try {
    const results = await api.history.search({
      text: state.query,
      startTime: bounds.startTime,
      endTime,
      maxResults: PAGE_SIZE
    });
    if (requestId !== state.requestId) return;

    const returned = Array.isArray(results) ? results : [];
    let oldest = Infinity;

    for (const raw of returned) {
      if (!raw?.url) continue;
      const lastVisitTime = Number(raw.lastVisitTime) || 0;
      oldest = Math.min(oldest, lastVisitTime);

      if (lastVisitTime < bounds.startTime || lastVisitTime > bounds.endTime) continue;
      if (isOwnExtensionPage(raw.url)) continue;
      if (state.seen.has(raw.url)) continue;
      state.seen.add(raw.url);

      const canonicalKey = state.settings.mergeDuplicates
        ? historyItemKey(raw.title, raw.url)
        : raw.url;
      const existing = state.canonicalIndex.get(canonicalKey);
      if (existing) {
        existing.visitCount += Number(raw.visitCount) || 1;
        if (!existing.mergedUrls.includes(raw.url)) existing.mergedUrls.push(raw.url);
        continue;
      }

      const item = {
        ...raw,
        title: normalizeTitle(raw.title, raw.url),
        lastVisitTime,
        visitCount: Number(raw.visitCount) || 1,
        mergedUrls: [raw.url],
        _id: nextItemId++
      };
      state.items.push(item);
      state.canonicalIndex.set(canonicalKey, item);
    }

    state.items.sort((a, b) => b.lastVisitTime - a.lastVisitTime);

    if (!returned.length || returned.length < PAGE_SIZE) {
      state.exhausted = true;
    } else if (!Number.isFinite(oldest) || oldest <= bounds.startTime) {
      state.exhausted = true;
    } else if (state.cursor != null && oldest >= state.cursor) {
      state.exhausted = true;
    } else {
      state.cursor = oldest;
    }
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.error = error;
    console.error('Failed to load history in popup', error);
  } finally {
    if (requestId === state.requestId) {
      const appended = state.items.filter((item) => item._id >= newIdFloor);
      const outOfOrder = appended.some((item) => item.lastVisitTime > lastExistingTime);
      state.loading = false;

      if (!state.items.length || outOfOrder || !el.historyList.querySelector('.p-group')) {
        renderHistory();
      } else {
        if (appended.length) appendHistoryItems(appended);
        renderListFooter();
      }
      updateCounts();
    }
  }
}

function setupHistoryObserver() {
  historyObserver?.disconnect();
  historyObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadHistoryMore();
  }, {
    root: el.scrollArea,
    rootMargin: '160px 0px'
  });
  historyObserver.observe(el.sentinel);
}

/* ----------------------------------------------------------- history render */

function renderHistory() {
  if (!el) return;

  if (state.error && !state.items.length) {
    el.historyList.innerHTML = emptyMarkup({
      iconName: 'alert',
      title: t('popup.readErrorTitle'),
      text: friendlyError(state.error),
      error: true,
      actions: `<button class="p-empty-action" type="button" data-action="retry-history">${t('common.retry')}</button>`
    });
  } else if (state.loading && !state.items.length) {
    el.historyList.innerHTML = skeletonMarkup(6);
  } else if (!state.items.length) {
    el.historyList.innerHTML = emptyHistoryMarkup();
  } else {
    const groups = groupItemsByDate(state.items);
    el.historyList.innerHTML = groups.map(groupMarkup).join('');
  }

  renderListFooter();
}

function groupMarkup(group) {
  return `
    <section class="p-group" data-group="${escapeHtml(group.key)}" aria-label="${escapeHtml(group.label)}">
      <h3 class="p-group-head">
        <span class="p-group-title">${escapeHtml(group.label)}</span>
        <span class="p-group-count">${formatCount(group.items.length)}</span>
      </h3>
      <div class="p-group-body">
        ${group.items.map(rowMarkup).join('')}
      </div>
    </section>`;
}

function appendHistoryItems(items) {
  if (!items.length) return;
  if (!el.historyList.querySelector('.p-group')) {
    renderHistory();
    return;
  }

  for (const group of groupItemsByDate(items)) {
    const existing = [...el.historyList.children].find((section) => section.dataset.group === group.key);
    if (existing) {
      const body = existing.querySelector('.p-group-body');
      if (!body) continue;
      body.insertAdjacentHTML('beforeend', group.items.map(rowMarkup).join(''));
      const count = body.querySelectorAll('.p-row').length;
      const countEl = existing.querySelector('.p-group-count');
      if (countEl) countEl.textContent = formatCount(count);
    } else {
      el.historyList.insertAdjacentHTML('beforeend', groupMarkup(group));
    }
  }
}

function rowMarkup(item) {
  const title = normalizeTitle(item.title, item.url);
  const { host } = urlParts(item.url);
  const time = formatTime(item.lastVisitTime);

  return `
    <button class="p-row" type="button" data-url="${escapeHtml(item.url)}" title="${escapeHtml(title)} · ${escapeHtml(host)}">
      ${faviconMarkup(item.url, title)}
      <span class="p-row-main">
        <span class="p-row-title">${highlight(title, state.query)}</span>
        <span class="p-row-sub">${highlight(host, state.query)}</span>
      </span>
      <span class="p-row-time">${escapeHtml(time)}</span>
    </button>`;
}

function emptyHistoryMarkup() {
  if (state.query) {
    return emptyMarkup({
      iconName: 'search',
      title: t('popup.noResultsTitle'),
      text: t('popup.noResultsText'),
      actions: `<button class="p-empty-action" type="button" data-action="clear-search">${t('common.clearSearch')}</button>`
    });
  }

  if (state.range !== 'all') {
    return emptyMarkup({
      iconName: 'calendar',
      title: t('popup.emptyRangeTitle'),
      text: t('popup.emptyRangeText', { range: formatRangeLabel(state.range) }),
      actions: `<button class="p-empty-action" type="button" data-action="show-all">${t('common.showAllTime')}</button>`
    });
  }

  return emptyMarkup({
    iconName: 'history',
    title: t('popup.emptyTitle'),
    text: t('popup.emptyText')
  });
}

function emptyMarkup({ iconName = 'history', title, text, actions = '', error = false }) {
  return `
    <div class="p-empty${error ? ' p-error' : ''}">
      <span class="p-empty-icon">${icon(iconName)}</span>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
      ${actions ? `<div class="p-empty-actions">${actions}</div>` : ''}
    </div>`;
}

function restoreFooterFocus(hadFocus) {
  if (!hadFocus) return;
  const target = el.listFooter.querySelector('[data-action="load-more"], [data-action="retry-history"]');
  if (target) {
    target.focus({ preventScroll: true });
  } else {
    el.listFooter.tabIndex = -1;
    el.listFooter.focus({ preventScroll: true });
  }
}

function renderListFooter() {
  if (!el) return;
  const hadFocus = el.listFooter.contains(document.activeElement);
  let html = '';

  if (!state.items.length) {
    html = '';
  } else if (state.loading) {
    html = `<span class="p-spinner" aria-hidden="true"></span><span>${t('common.loadingMore')}</span>`;
  } else if (state.error) {
    html = `
      <span>${t('count.failed')}</span>
      <button class="p-load-more" type="button" data-action="retry-history">${t('common.retry')}</button>`;
  } else if (state.exhausted) {
    html = `<span class="p-end-mark" aria-hidden="true"></span><span>${escapeHtml(t('count.allLoaded', { count: state.items.length }))}</span>`;
  } else {
    html = `
      <span>${t('history.scrollMore')}</span>
      <button class="p-load-more" type="button" data-action="load-more">${t('common.loadMore')}</button>`;
  }

  el.listFooter.innerHTML = html;
  restoreFooterFocus(hadFocus);
}

function updateCounts() {
  if (!el) return;

  if (state.view === 'closed') {
    const sessions = filteredSessions();
    if (state.closedLoading && !state.closed.length) el.closedCount.textContent = t('closed.metaLoading');
    else if (state.closedError) el.closedCount.textContent = t('closed.metaFailed');
    else if (state.query) el.closedCount.textContent = t('count.matches', { count: sessions.length });
    else el.closedCount.textContent = t('count.closed', { count: state.closed.length });
    return;
  }

  if (state.loading && !state.items.length) {
    el.historyCount.textContent = t('count.loading');
  } else if (state.error && !state.items.length) {
    el.historyCount.textContent = t('count.failed');
  } else if (!state.items.length) {
    el.historyCount.textContent = t('count.zero');
  } else if (state.query) {
    el.historyCount.textContent = t('count.search', { count: state.items.length });
  } else if (state.exhausted) {
    el.historyCount.textContent = t('count.total', { count: state.items.length });
  } else {
    el.historyCount.textContent = t('count.loaded', { count: state.items.length });
  }
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

function faviconMarkup(url, title) {
  const favicon = faviconUrl(url, 32);
  return `
    <span class="p-favicon${favicon ? '' : ' is-fallback'}" style="${tileStyle(url)}">
      ${favicon ? `<img class="p-favicon-img" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}
      <span class="p-favicon-letter">${escapeHtml(letterFor(url, title))}</span>
    </span>`;
}

/* -------------------------------------------------------------- recently closed */

async function loadClosed(force = false) {
  if (state.closedLoading) {
    if (force) state.closedDirty = true;
    return;
  }
  if (state.closedLoaded && !force) {
    renderClosed();
    return;
  }

  state.closedLoading = true;
  state.closedError = null;
  state.closedDirty = false;
  renderClosed();
  updateCounts();
  const requestId = ++state.closedRequestId;

  try {
    const sessions = await api.sessions.getRecentlyClosed({ maxResults: 25 });
    if (requestId !== state.closedRequestId) return;
    state.closed = Array.isArray(sessions) ? sessions : [];
    state.closedLoaded = true;
  } catch (error) {
    if (requestId !== state.closedRequestId) return;
    state.closedError = error;
    console.error('Failed to load recently closed sessions in popup', error);
  } finally {
    if (requestId !== state.closedRequestId) return;
    state.closedLoading = false;
    if (state.view === 'closed') renderClosed();
    updateCounts();
    if (state.closedDirty) {
      state.closedDirty = false;
      loadClosed(true);
    }
  }
}

function filteredSessions() {
  const query = state.query.trim().toLocaleLowerCase();
  if (!query) return state.closed.map((session, index) => ({ session, index }));
  return state.closed
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => sessionMatches(session, query));
}

function sessionMatches(session, query) {
  const tabs = session.tab ? [session.tab] : (session.window?.tabs || []);
  return tabs.some((tab) => `${tab.title || ''} ${tab.url || ''}`.toLocaleLowerCase().includes(query));
}

function renderClosed() {
  if (!el) return;

  const sessions = filteredSessions();

  if (state.closedLoading && !state.closed.length) {
    el.closedList.innerHTML = skeletonMarkup(5);
    updateCounts();
    return;
  }

  if (state.closedError) {
    el.closedList.innerHTML = emptyMarkup({
      iconName: 'alert',
      title: t('popup.closedErrorTitle'),
      text: friendlyError(state.closedError),
      error: true,
      actions: `<button class="p-empty-action" type="button" data-action="retry-closed">${t('common.retry')}</button>`
    });
    updateCounts();
    return;
  }

  if (!state.closed.length) {
    el.closedList.innerHTML = emptyMarkup({
      iconName: 'restore',
      title: t('popup.closedEmptyTitle'),
      text: t('popup.closedEmptyText')
    });
    updateCounts();
    return;
  }

  if (!sessions.length) {
    el.closedList.innerHTML = emptyMarkup({
      iconName: 'search',
      title: t('popup.closedNoMatchesTitle'),
      text: t('popup.closedNoMatchesText', { query: state.query }),
      actions: `<button class="p-empty-action" type="button" data-action="clear-search">${t('common.clearSearch')}</button>`
    });
    updateCounts();
    return;
  }

  el.closedList.innerHTML = sessions.map(({ session, index }) => closedRowMarkup(session, index)).join('');
  updateCounts();
}

function closedRowMarkup(session, index) {
  const time = session.lastModified ? relativeTime(toMillis(session.lastModified)) : '';

  if (session.tab) {
    const tab = session.tab;
    const title = normalizeTitle(tab.title, tab.url) || t('common.untitledTab');
    const { host } = urlParts(tab.url);
    return `
      <div class="p-closed-row" data-session-index="${index}">
        ${faviconMarkup(tab.url, title)}
        <span class="p-closed-main">
          <span class="p-closed-title">${highlight(title, state.query)}</span>
          <span class="p-closed-sub">${highlight(host || t('popup.closedTabFallback'), state.query)}</span>
        </span>
        <span class="p-closed-time">${escapeHtml(time)}</span>
        <button class="p-restore" type="button" data-session-index="${index}" aria-label="${escapeHtml(t('popup.closedRestoreAria', { title }))}" title="${escapeHtml(t('popup.closedRestoreTitle'))}">
          ${icon('restore')}
        </button>
      </div>`;
  }

  const tabs = session.window?.tabs || [];
  const matchingTab = state.query
    ? tabs.find((tab) => `${tab.title || ''} ${tab.url || ''}`.toLocaleLowerCase().includes(state.query.trim().toLocaleLowerCase()))
    : null;
  const firstTitle = matchingTab
    ? normalizeTitle(matchingTab.title, matchingTab.url)
    : tabs[0]?.title
      ? normalizeTitle(tabs[0].title, tabs[0].url)
      : '';
  const sub = firstTitle || t('popup.closedMultipleTabs');
  return `
    <div class="p-closed-row" data-session-index="${index}">
      <span class="p-window-icon">${icon('window')}</span>
      <span class="p-closed-main">
        <span class="p-closed-title">${escapeHtml(t('popup.closedWindow', { tabs: t('count.tabs', { count: tabs.length }) }))}</span>
        <span class="p-closed-sub">${highlight(sub, state.query)}</span>
      </span>
      <span class="p-closed-time">${escapeHtml(time)}</span>
      <button class="p-restore" type="button" data-session-index="${index}" aria-label="${escapeHtml(t('popup.closedRestoreWindowAria', { count: tabs.length }))}" title="${escapeHtml(t('popup.closedRestoreWindow'))}">
        ${icon('restore')}
      </button>
    </div>`;
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

    state.closedRequestId += 1;
    state.closedLoading = false;
    state.closedDirty = false;
    if (sessionId != null) {
      state.closed = state.closed.filter((candidate) =>
        (candidate.tab?.sessionId ?? candidate.window?.sessionId) !== sessionId
      );
    }
    state.closedLoaded = true;
    renderClosed();
    updateCounts();

    showToast(session.window ? t('popup.closedRestoredWindow') : t('popup.closedRestoredTab'), 'success');
    await loadClosed(true);
  } catch (error) {
    console.error('Failed to restore session from popup', error);
    showToast(t('popup.closedRestoreFailed'), 'error');
    if (button) button.disabled = false;
  } finally {
    state.restoring = false;
  }
}

/* ----------------------------------------------------------------- search */

function updateSearchUi() {
  const hasValue = Boolean(el.searchInput.value.trim());
  el.searchClear.hidden = !hasValue;
  el.searchInput.closest('.p-search')?.classList.toggle('has-value', hasValue);
}

function handleSearchInput() {
  updateSearchUi();

  if (state.view === 'closed') {
    runSearch.cancel();
    const value = el.searchInput.value.trim();
    if (value !== state.query) {
      state.query = value;
      renderClosed();
    }
    return;
  }

  runSearch();
}

function applySearch() {
  if (state.view !== 'history') return;
  const value = el.searchInput.value.trim();
  if (value === state.query) return;
  state.query = value;
  updateSearchUi();
  loadHistoryReset();
}

function clearSearch({ focus = true, reload = true } = {}) {
  el.searchInput.value = '';
  state.query = '';
  runSearch.cancel();
  updateSearchUi();

  if (state.view === 'history') {
    if (reload) loadHistoryReset();
  } else if (reload) {
    renderClosed();
  }

  if (focus) el.searchInput.focus();
}

function commitSearchNow() {
  runSearch.cancel();
  const value = el.searchInput.value.trim();

  if (state.view === 'history' && value !== state.query) {
    state.query = value;
    updateSearchUi();
    loadHistoryReset();
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ range */

function updateRangeUi() {
  el.rangeLabel.textContent = formatRangeLabel(state.range);
  for (const button of el.rangePopover.querySelectorAll('[data-range]')) {
    const selected = button.dataset.range === state.range;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
}

function toggleRangeMenu(force) {
  const willOpen = typeof force === 'boolean' ? force : el.rangePopover.hidden;
  if (!willOpen) {
    closeRangeMenu();
    return;
  }

  updateRangeUi();
  el.rangePopover.hidden = false;
  el.rangeBtn.setAttribute('aria-expanded', 'true');
  window.requestAnimationFrame(() => {
    const target = el.rangePopover.querySelector('.p-menu-item.is-selected') || el.rangePopover.querySelector('.p-menu-item');
    target?.focus();
  });
}

function closeRangeMenu({ restoreFocus = false } = {}) {
  if (!el || el.rangePopover.hidden) return;
  el.rangePopover.hidden = true;
  el.rangeBtn.setAttribute('aria-expanded', 'false');
  if (restoreFocus) el.rangeBtn.focus();
}

function applyRange(range) {
  if (!RANGES.includes(range)) return;
  state.range = range;
  updateRangeUi();
  closeRangeMenu();
  if (state.view === 'history') loadHistoryReset();
}

/* ---------------------------------------------------------------- actions */

async function onHistoryClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === 'retry-history') loadHistoryReset();
    else if (action === 'load-more') loadHistoryMore();
    else if (action === 'clear-search') clearSearch();
    else if (action === 'show-all') applyRange('all');
    return;
  }

  const row = event.target.closest('[data-url]');
  if (!row) return;
  await openUrlAndClose(row.dataset.url);
}

async function onClosedClick(event) {
  const retry = event.target.closest('[data-action="retry-closed"]');
  if (retry) {
    loadClosed(true);
    return;
  }

  const clear = event.target.closest('[data-action="clear-search"]');
  if (clear) {
    clearSearch();
    return;
  }

  const target = event.target.closest('[data-session-index]');
  if (!target) return;
  await restoreSession(Number(target.dataset.sessionIndex));
}

async function openUrlAndClose(url) {
  if (!canOpenUrl(url)) {
    showToast(t('error.openTypeShort'), 'error');
    return;
  }

  try {
    await api.tabs.create({ url });
    window.close();
  } catch (error) {
    console.error('Failed to open history item from popup', error);
    showToast(t('error.openPage'), 'error');
  }
}

async function openFullHistory() {
  if (state.view === 'history' && (state.query || state.range !== 'all')) {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.range !== 'all') params.set('range', state.range);
    if (await focusExistingHistory('search', { query: state.query, range: state.range })) return;
    await createHistoryTab(`?${params.toString()}`);
    return;
  }
  await openAction('history', '');
}

async function openAction(action, suffix = '') {
  if (await focusExistingHistory(action)) return;
  await createHistoryTab(suffix);
}

async function focusExistingHistory(action, payload = {}) {
  if (!api.runtime?.getContexts) return false;

  try {
    const base = api.runtime.getURL('history.html');
    const contexts = await api.runtime.getContexts({ contextTypes: ['TAB'] });
    const existing = contexts.find((context) => (context.documentUrl || '').startsWith(base));
    if (!existing || existing.tabId < 0) return false;

    try {
      await api.runtime.sendMessage({ type: 'edge-history:action', action, ...payload });
    } catch (error) {
      // A stale/unready history page should still be focused instead of
      // opening a duplicate tab.
      console.debug('Existing history page did not accept the action', error);
    }
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
    showToast(t('error.openFull'), 'error');
  }
}

/* ----------------------------------------------------------------- events */

function bindEvents() {
  el.settingsBtn.addEventListener('click', () => openAction('settings', '?settings=1'));
  el.openFull.addEventListener('click', () => openFullHistory());

  el.historyTab.addEventListener('click', () => switchView('history'));
  el.closedTab.addEventListener('click', () => switchView('closed'));
  for (const tab of [el.historyTab, el.closedTab]) {
    tab.addEventListener('keydown', onTabKeydown);
  }

  el.searchInput.addEventListener('input', (event) => {
    if (event.isComposing) return;
    handleSearchInput();
  });
  el.searchInput.addEventListener('compositionend', handleSearchInput);
  el.searchInput.addEventListener('search', handleSearchInput);
  el.searchInput.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      const changed = commitSearchNow();
      if (!changed && state.view === 'history') {
        el.historyList.querySelector('[data-url]')?.click();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (el.searchInput.value) clearSearch();
      else window.close();
    }
  });
  el.searchClear.addEventListener('click', () => clearSearch());

  el.rangeBtn.addEventListener('click', () => toggleRangeMenu());
  for (const button of el.rangePopover.querySelectorAll('[data-range]')) {
    button.addEventListener('click', () => applyRange(button.dataset.range));
  }

  el.historyList.addEventListener('click', onHistoryClick);
  el.listFooter.addEventListener('click', onHistoryClick);
  el.closedList.addEventListener('click', onClosedClick);


  document.addEventListener('pointerdown', (event) => {
    if (!el.rangePopover.hidden
      && !el.rangePopover.contains(event.target)
      && !el.rangeBtn.contains(event.target)) {
      closeRangeMenu();
    }
  }, true);

  document.addEventListener('keydown', onDocumentKeydown);

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.classList.contains('p-favicon-img')) return;
    image.closest('.p-favicon')?.classList.add('is-fallback');
  }, true);
}

function onTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = [el.historyTab, el.closedTab];
  const index = tabs.indexOf(event.currentTarget);
  let next;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
  else next = (index + 1) % tabs.length;
  const target = tabs[next];
  switchView(target.dataset.view);
  target.focus();
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape' && !el.rangePopover.hidden) {
    event.preventDefault();
    closeRangeMenu({ restoreFocus: true });
    return;
  }

  if (event.key === '/' && !isEditableTarget(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    el.searchInput.focus();
    el.searchInput.select();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (isEditableTarget(event.target) || state.view !== 'history') return;
    const rows = [...el.historyList.querySelectorAll('[data-url]')];
    if (!rows.length) return;
    const index = rows.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown'
      ? rows[Math.min(rows.length - 1, index + 1)]
      : rows[Math.max(0, index - 1)];
    next?.focus();
  }
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/* ------------------------------------------------------------- utilities */

function showToast(message, type = 'info') {
  if (!el?.toast) return;
  window.clearTimeout(toastTimer);
  window.clearTimeout(toastHideTimer);
  el.toast.textContent = message;
  el.toast.className = `p-toast is-${type}`;
  el.toast.hidden = false;
  window.requestAnimationFrame(() => el.toast.classList.add('is-visible'));

  toastTimer = window.setTimeout(() => {
    el.toast.classList.remove('is-visible');
    toastHideTimer = window.setTimeout(() => {
      el.toast.hidden = true;
    }, 180);
  }, 2400);
}

function updateShortcutHint() {
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '')
    || /Macintosh/i.test(navigator.userAgent);
  const shortcut = mac ? 'Option + Shift + H' : 'Alt + H';
  if (el.openFull) {
    el.openFull.title = t('popup.openFullTitle', { shortcut });
    el.openFull.setAttribute('aria-label', el.openFull.title);
  }
}

function friendlyError(error) {
  const message = String(error?.message || error || t('error.unknown'));
  if (/cannot be found|no tab with id/i.test(message)) return t('error.tabClosed');
  if (/not available|not enabled|sync/i.test(message)) return t('error.syncUnavailable');
  return message.length > 100 ? `${message.slice(0, 100)}…` : message;
}
