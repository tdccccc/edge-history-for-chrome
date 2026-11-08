import './shared/demo.js';
import { mountIcons, icon } from './shared/icons.js';
import {
  DEFAULT_SETTINGS,
  addDays,
  canOpenUrl,
  canonicalHistoryUrl,
  clamp,
  copyText,
  debounce,
  escapeHtml,
  faviconUrl,
  formatCount,
  formatDateInput,
  formatFullDate,
  formatRangeLabel,
  formatTime,
  getChromeApi,
  getRangeBounds,
  getSettings,
  getVersion,
  groupItemsByDate,
  highlight,
  isDemo,
  isEditableTarget,
  isHttpUrl,
  isOwnExtensionPage,
  letterFor,
  normalizeTitle,
  parseDateInput,
  pluralTabs,
  relativeTime,
  resolveTheme,
  saveSettings,
  siteKeyOf,
  siteLabelOf,
  startOfDay,
  startOfNextDay,
  tileStyle,
  toMillis,
  transitionLabel,
  urlParts
} from './shared/utils.js';

const api = getChromeApi();
const SESSION_LIMIT = 25;
// chrome.history.search endTime is exclusive. Nudge the cursor by a tiny
// amount so a page boundary never drops sibling visits that share the exact
// same lastVisitTime (history imports and rapid addUrl calls can produce them).
const SEARCH_TIME_EPSILON = 1;

const VIEW_META = {
  history: {
    title: '历史记录',
    subtitle: '按日期查看、搜索和管理你的浏览记录',
    documentTitle: '历史记录'
  },
  closed: {
    title: '最近关闭',
    subtitle: '恢复最近关闭的标签页或整个窗口',
    documentTitle: '最近关闭'
  },
  devices: {
    title: '来自其他设备',
    subtitle: '打开在其他设备上正在浏览的标签页',
    documentTitle: '来自其他设备'
  }
};

const state = {
  view: 'history',
  query: '',
  queries: { history: '', closed: '', devices: '' },
  appliedQuery: '',
  range: 'all',
  custom: { start: '', end: '' },
  items: [],
  seen: new Set(),
  canonicalIndex: new Map(),
  cursor: null,
  exhausted: false,
  loading: false,
  requestId: 0,
  error: null,
  loadedOnce: false,
  selectMode: false,
  selected: new Set(),
  collapsed: new Set(),
  settings: { ...DEFAULT_SETTINGS },
  closed: [],
  closedLoaded: false,
  closedLoading: false,
  closedRequestId: 0,
  closedDirty: false,
  closedError: null,
  devices: [],
  devicesLoaded: false,
  devicesLoading: false,
  devicesError: null,
  welcome: false,
  themeMedia: null,
  modalOpen: false,
  modalPreviousFocus: null,
  modalOnClose: null,
  menuItemId: null,
  menuAnchor: null,
  restoring: false,
  historyScrollTop: 0
};

let el = null;
let nextItemId = 1;
const itemIndex = new Map();
let historyObserver = null;

const runSearch = debounce(() => commitSearch(), 220);

init().catch((error) => {
  console.error('History page failed to initialise', error);
  if (el?.toastRegion) {
    showToast(`页面初始化失败：${friendlyError(error)}`, 'error', 6000);
  }
});

async function init() {
  cacheDom();
  mountIcons();
  bindEvents();
  bindRuntimeMessages();

  state.settings = await getSettings();
  state.settings.theme = ['system', 'light', 'dark'].includes(state.settings.theme)
    ? state.settings.theme
    : 'system';

  setupTheme();
  initFromUrl();
  state.queries[state.view] = state.query;
  updateSidebarShortcut();
  updateSearchUI();
  updateRangeUI();
  syncViewChrome();
  updateWelcomeVisibility();

  if (isDemo()) el.demoBadge.hidden = false;
  el.versionLabel.textContent = `v${getVersion().replace(/-.*$/, '')}`;
  el.shortcutCard.title = '可在 chrome://extensions/shortcuts 中修改';

  try {
    api.sessions.onChanged.addListener?.(debounce(() => {
      state.closedLoaded = false;
      state.devicesLoaded = false;
      if (state.view === 'closed') loadClosed(true);
      else if (state.view === 'devices') loadDevices(true);
    }, 300));
  } catch {
    // Sessions events are optional.
  }

  if (!api?.history) {
    state.error = new Error('无法访问 Chrome 历史记录 API。请通过扩展页面打开，或使用 ?demo=1 预览。');
    state.loadedOnce = true;
    renderHistory();
    updateResultCount();
    return;
  }

  if (state.view === 'history') {
    await loadHistoryReset();
  } else if (state.view === 'closed') {
    await loadClosed();
  } else {
    await loadDevices();
  }

  // Observe the sentinel only after the first render has settled; otherwise
  // content-visibility estimates can briefly make it look visible and trigger
  // an unnecessary second page fetch.
  window.setTimeout(setupHistoryObserver, 200);

  if (new URLSearchParams(location.search).get('settings') === '1') {
    openSettings();
    const url = new URL(location.href);
    url.searchParams.delete('settings');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }
}

function cacheDom() {
  el = {
    app: document.getElementById('app'),
    content: document.getElementById('content'),
    pageTitle: document.getElementById('pageTitle'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    historyHeaderActions: document.getElementById('historyHeaderActions'),
    refreshActions: document.getElementById('refreshActions'),
    historyToolbar: document.getElementById('historyToolbar'),
    rangeWrap: document.getElementById('rangeWrap'),
    searchField: document.getElementById('searchField'),
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    searchKbd: document.getElementById('searchKbd'),
    rangeBtn: document.getElementById('rangeBtn'),
    rangeLabel: document.getElementById('rangeLabel'),
    rangePopover: document.getElementById('rangePopover'),
    customRangeBtn: document.getElementById('customRangeBtn'),
    customRange: document.getElementById('customRange'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    applyRange: document.getElementById('applyRange'),
    resultCount: document.getElementById('resultCount'),
    welcomeBanner: document.getElementById('welcomeBanner'),
    welcomeShortcut: document.getElementById('welcomeShortcut'),
    dismissWelcome: document.getElementById('dismissWelcome'),
    closeWelcome: document.getElementById('closeWelcome'),
    historyView: document.getElementById('historyView'),
    historyList: document.getElementById('historyList'),
    sentinel: document.getElementById('sentinel'),
    listFooter: document.getElementById('listFooter'),
    closedView: document.getElementById('closedView'),
    closedMeta: document.getElementById('closedMeta'),
    closedList: document.getElementById('closedList'),
    devicesView: document.getElementById('devicesView'),
    devicesMeta: document.getElementById('devicesMeta'),
    devicesList: document.getElementById('devicesList'),
    selectBtn: document.getElementById('selectBtn'),
    exportBtn: document.getElementById('exportBtn'),
    clearBtn: document.getElementById('clearBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    bulkBar: document.getElementById('bulkBar'),
    bulkCount: document.getElementById('bulkCount'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    bulkDeleteBtn: document.getElementById('bulkDeleteBtn'),
    exitSelectBtn: document.getElementById('exitSelectBtn'),
    rowMenu: document.getElementById('rowMenu'),
    modalLayer: document.getElementById('modalLayer'),
    toastRegion: document.getElementById('toastRegion'),
    ariaStatus: document.getElementById('ariaStatus'),
    themeBtn: document.getElementById('themeBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    versionLabel: document.getElementById('versionLabel'),
    demoBadge: document.getElementById('demoBadge'),
    shortcutCard: document.getElementById('shortcutCard')
  };
}

/* --------------------------------------------------------------- settings */

function setupTheme() {
  state.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  state.themeMedia.addEventListener?.('change', () => {
    if (state.settings.theme === 'system') applyTheme();
  });
  applyTheme();
}

function applyTheme() {
  const resolved = resolveTheme(state.settings.theme, state.themeMedia?.matches);
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem('edge-history-theme', state.settings.theme);
  } catch {
    // localStorage is a progressive enhancement only.
  }

  const iconName = state.settings.theme === 'system'
    ? 'monitor'
    : resolved === 'dark'
      ? 'moon'
      : 'sun';
  el.themeBtn.innerHTML = icon(iconName);
  const label = state.settings.theme === 'system'
    ? `跟随系统（当前${resolved === 'dark' ? '深色' : '浅色'}）`
    : resolved === 'dark'
      ? '深色'
      : '浅色';
  el.themeBtn.title = `主题：${label}，点击切换`;
  el.themeBtn.setAttribute('aria-label', el.themeBtn.title);
}

function setTheme(theme) {
  if (!['system', 'light', 'dark'].includes(theme)) return;
  state.settings.theme = theme;
  saveSettings({ theme });
  applyTheme();
  document.querySelectorAll('[data-theme-value]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.themeValue === theme);
  });
}

function toggleTheme() {
  const resolved = resolveTheme(state.settings.theme, state.themeMedia?.matches);
  setTheme(resolved === 'dark' ? 'light' : 'dark');
}

/* ------------------------------------------------------------------- view */

function initFromUrl() {
  const params = new URLSearchParams(location.search);
  const requestedView = params.get('view');
  state.view = Object.hasOwn(VIEW_META, requestedView) ? requestedView : 'history';
  state.welcome = params.get('welcome') === '1';

  const range = params.get('range');
  if (['all', 'hour', '24h', 'today', 'yesterday', '7d', '30d', 'custom'].includes(range)) {
    state.range = range;
    if (range === 'custom') {
      const start = params.get('start');
      const end = params.get('end');
      if (/^\d{4}-\d{2}-\d{2}$/.test(start || '')) state.custom.start = start;
      if (/^\d{4}-\d{2}-\d{2}$/.test(end || '')) state.custom.end = end;
      if (!state.custom.start && !state.custom.end) state.range = 'all';
    }
  }

  const query = params.get('q');
  if (query) {
    state.query = query.trim();
    el.searchInput.value = state.query;
  }
}

function updateUrlState() {
  const url = new URL(location.href);
  if (state.view !== 'history') url.searchParams.set('view', state.view);
  else url.searchParams.delete('view');
  if (state.query) url.searchParams.set('q', state.query);
  else url.searchParams.delete('q');

  if (state.view === 'history' && state.range !== 'all') url.searchParams.set('range', state.range);
  else url.searchParams.delete('range');
  if (state.view === 'history' && state.range === 'custom') {
    if (state.custom.start) url.searchParams.set('start', state.custom.start);
    else url.searchParams.delete('start');
    if (state.custom.end) url.searchParams.set('end', state.custom.end);
    else url.searchParams.delete('end');
  } else {
    url.searchParams.delete('start');
    url.searchParams.delete('end');
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function syncViewChrome() {
  const meta = VIEW_META[state.view];
  el.pageTitle.textContent = meta.title;
  el.pageSubtitle.textContent = meta.subtitle;
  document.title = `${meta.documentTitle} · Edge 风格历史记录`;
  el.app.dataset.view = state.view;

  el.historyToolbar.hidden = false;
  el.rangeWrap.hidden = state.view !== 'history';
  el.resultCount.hidden = state.view !== 'history';
  el.historyHeaderActions.hidden = state.view !== 'history';
  el.refreshActions.hidden = state.view === 'history';
  el.historyView.hidden = state.view !== 'history';
  el.closedView.hidden = state.view !== 'closed';
  el.devicesView.hidden = state.view !== 'devices';

  for (const button of document.querySelectorAll('.nav-item[data-view]')) {
    const active = button.dataset.view === state.view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }

  if (state.view !== 'history') {
    closeRangePopover();
    closeRowMenu();
    if (state.selectMode) exitSelectMode();
  }

  updateSearchPlaceholder();
  updateSearchUI();
  updateRefreshButton();
  updateWelcomeVisibility();

  const activeView = state.view === 'history'
    ? el.historyView
    : state.view === 'closed'
      ? el.closedView
      : el.devicesView;
  activeView.classList.remove('is-entering');
  window.requestAnimationFrame(() => activeView.classList.add('is-entering'));
}

function switchView(view) {
  if (!Object.hasOwn(VIEW_META, view) || view === state.view) return;

  if (state.view === 'history') state.historyScrollTop = el.content.scrollTop;
  runSearch.cancel();
  state.queries[state.view] = state.query;
  closeRangePopover();
  closeRowMenu();
  if (state.selectMode) exitSelectMode();

  state.view = view;
  state.query = state.queries[view] || '';
  el.searchInput.value = state.query;
  updateSearchUI();
  syncViewChrome();
  updateUrlState();

  window.requestAnimationFrame(() => {
    el.content.scrollTop = view === 'history' ? state.historyScrollTop : 0;
  });

  if (view === 'history') {
    if (!state.loadedOnce || state.appliedQuery !== state.query) loadHistoryReset();
  } else if (view === 'closed') {
    // Always re-read sessions on entry: a tab may have been closed while the
    // user was on the history view. Keep the old DOM visible while refreshing.
    loadClosed(true);
  } else {
    loadDevices(true);
  }
}

/* ------------------------------------------------------------ history data */

function historyBounds() {
  return getRangeBounds(state.range, state.custom);
}

function currentPageSize() {
  return clamp(Number(state.settings.pageSize) || 100, 50, 100);
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
  state.selected.clear();
  itemIndex.clear();
  closeRowMenu();
  if (state.selectMode) exitSelectMode();
  renderHistory();
  updateResultCount();
}

async function loadHistoryReset() {
  if (state.view !== 'history') return;
  resetHistoryData();
  state.collapsed.clear();
  state.loadedOnce = true;
  state.appliedQuery = state.query;
  el.content.scrollTop = 0;
  state.historyScrollTop = 0;
  await loadHistoryMore();
}

async function loadHistoryMore() {
  if (state.view !== 'history' || state.loading || state.exhausted || !state.loadedOnce) return;
  if (!api?.history) return;

  const bounds = historyBounds();
  // chrome.history.search treats endTime as exclusive. Using cursor - 1 skips
  // every visit that shares the boundary millisecond (Chrome stores visit
  // times with sub-millisecond precision), so pass the cursor unchanged.
  const endTime = state.cursor == null
    ? bounds.endTime
    : Math.min(state.cursor + SEARCH_TIME_EPSILON, bounds.endTime);

  if (endTime < bounds.startTime) {
    state.exhausted = true;
    renderHistory();
    updateResultCount();
    return;
  }

  const pageSize = currentPageSize();
  const requestId = ++state.requestId;
  const newIdFloor = nextItemId;
  const mergedIds = new Set();
  const lastExistingTime = state.items.length ? state.items[state.items.length - 1].lastVisitTime : Infinity;
  state.loading = true;
  state.error = null;
  closeRowMenu();
  if (state.items.length) renderFooter();
  else renderHistory();
  updateResultCount();

  try {
    const query = {
      // Chrome requires "text" to be present even when searching all history.
      text: state.query.trim(),
      startTime: bounds.startTime,
      endTime,
      maxResults: pageSize
    };

    const results = await api.history.search(query);
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
        ? canonicalHistoryUrl(raw.url)
        : raw.url;
      const existing = state.canonicalIndex.get(canonicalKey);
      if (existing) {
        existing.visitCount += Number(raw.visitCount) || 1;
        if (!existing.mergedUrls.includes(raw.url)) existing.mergedUrls.push(raw.url);
        mergedIds.add(existing._id);
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
      itemIndex.set(item._id, item);
      state.canonicalIndex.set(canonicalKey, item);
    }

    state.items.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
    rebuildItemIndex();

    if (!returned.length || returned.length < pageSize) {
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
    console.error('Failed to load history', error);
  } finally {
    if (requestId === state.requestId) {
      const appended = state.items.filter((item) => item._id >= newIdFloor);
      const outOfOrder = appended.some((item) => item.lastVisitTime > lastExistingTime);
      state.loading = false;

      if (!state.items.length || outOfOrder || !el.historyList.querySelector('.history-group')) {
        renderHistory();
      } else {
        if (appended.length) appendHistoryItems(appended);
        renderFooter();
      }
      updateResultCount();
      refreshVisitChips(mergedIds);
    }
  }
}

function rebuildItemIndex() {
  itemIndex.clear();
  for (const item of state.items) itemIndex.set(item._id, item);
}

function rebuildCanonicalIndex() {
  state.canonicalIndex.clear();
  for (const item of state.items) {
    const key = state.settings.mergeDuplicates ? canonicalHistoryUrl(item.url) : item.url;
    if (!state.canonicalIndex.has(key)) state.canonicalIndex.set(key, item);
  }
}

function refreshVisitChips(ids) {
  if (!ids.size) return;
  for (const id of ids) {
    const item = itemIndex.get(id);
    if (!item) continue;
    const row = el.historyList.querySelector(`.history-row[data-id="${id}"]`);
    if (!row) continue;
    let chip = row.querySelector('.visit-chip');
    if (!state.settings.showVisitCounts || item.visitCount <= 1) {
      chip?.remove();
      continue;
    }
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'visit-chip';
      chip.title = `${item.visitCount} 次访问`;
      row.querySelector('.row-meta')?.prepend(chip);
    }
    chip.textContent = `${formatCount(item.visitCount)} 次`;
    chip.title = `${item.visitCount} 次访问`;
  }
}

function setupHistoryObserver() {
  historyObserver?.disconnect();
  historyObserver = new IntersectionObserver((entries) => {
    if (state.error) return;
    if (entries.some((entry) => entry.isIntersecting)) loadHistoryMore();
  }, {
    root: el.content,
    rootMargin: '600px 0px'
  });
  historyObserver.observe(el.sentinel);
}

/* --------------------------------------------------------- history render */

function renderHistory() {
  if (!el) return;
  closeRowMenu();

  if (state.error && !state.items.length) {
    el.historyList.innerHTML = emptyMarkup({
      iconName: 'alert',
      error: true,
      title: '无法读取历史记录',
      text: friendlyError(state.error),
      actions: '<button class="btn btn-primary" type="button" data-action="retry-history">重试</button>'
    });
  } else if (!state.items.length && state.loading) {
    el.historyList.innerHTML = skeletonMarkup();
  } else if (!state.items.length) {
    el.historyList.innerHTML = emptyHistoryMarkup();
  } else {
    const groups = groupItemsByDate(state.items);
    el.historyList.innerHTML = groups.map(groupMarkup).join('');
  }

  renderFooter();
}

function groupMarkup(group) {
  const collapsed = state.collapsed.has(group.key);
  const estimatedHeight = collapsed ? 43 : group.items.length * 56 + 43;
  return `
    <section class="history-group${collapsed ? ' is-collapsed' : ''}" data-group="${escapeHtml(group.key)}" style="contain-intrinsic-size:auto ${estimatedHeight}px">
      <button class="group-head" type="button" data-action="toggle-group" data-group-key="${escapeHtml(group.key)}" aria-expanded="${String(!collapsed)}">
        <span class="group-chevron">${icon('chevron-down')}</span>
        <span class="group-title">${escapeHtml(group.label)}</span>
        <span class="group-count">${formatCount(group.items.length)} 条</span>
        <span class="group-line" aria-hidden="true"></span>
      </button>
      <div class="group-body"${collapsed ? ' hidden' : ''}>
        ${group.items.map(rowMarkup).join('')}
      </div>
    </section>`;
}

function appendHistoryItems(items) {
  if (!items.length) return;
  if (!el.historyList.querySelector('.history-group')) {
    renderHistory();
    return;
  }

  for (const group of groupItemsByDate(items)) {
    const existing = [...el.historyList.children].find((section) => section.dataset.group === group.key);
    if (existing) {
      const body = existing.querySelector('.group-body');
      if (!body) continue;
      body.insertAdjacentHTML('beforeend', group.items.map(rowMarkup).join(''));
      const count = body.querySelectorAll('.history-row').length;
      const countEl = existing.querySelector('.group-count');
      if (countEl) countEl.textContent = `${formatCount(count)} 条`;
      const collapsed = existing.classList.contains('is-collapsed');
      existing.style.containIntrinsicSize = `auto ${collapsed ? 43 : count * 56 + 43}px`;
    } else {
      el.historyList.insertAdjacentHTML('beforeend', groupMarkup(group));
    }
  }
}

function rowMarkup(item) {
  const { host, rest } = urlParts(item.url);
  const title = normalizeTitle(item.title, item.url);
  const selected = state.selected.has(item._id);
  const favicon = faviconUrl(item.url, 32);
  const visitChip = state.settings.showVisitCounts && item.visitCount > 1
    ? `<span class="visit-chip" title="${item.visitCount} 次访问">${formatCount(item.visitCount)} 次</span>`
    : '';

  return `
    <article class="history-row${selected ? ' is-selected' : ''}" data-id="${item._id}" role="listitem">
      <label class="row-check" aria-label="选择 ${escapeHtml(title)}">
        <input type="checkbox" data-role="check" ${selected ? 'checked' : ''}>
      </label>
      ${faviconMarkup(item.url, title, favicon)}
      <div class="row-main">
        <a class="row-title" href="${hrefFor(item.url)}" data-role="open" title="${escapeHtml(title)}">${highlight(title, state.query)}</a>
        <div class="row-url">
          <span class="u-host">${highlight(host, state.query)}</span>
          ${rest ? `<span class="u-path">${highlight(rest, state.query)}</span>` : ''}
        </div>
      </div>
      <div class="row-meta">
        ${visitChip}
        <time class="row-time" datetime="${new Date(item.lastVisitTime).toISOString()}" title="${escapeHtml(formatFullDate(item.lastVisitTime))}">${formatTime(item.lastVisitTime)}</time>
      </div>
      <button class="icon-btn row-more" type="button" data-role="menu" aria-label="更多操作" aria-haspopup="menu" aria-expanded="false" title="更多操作">${icon('more')}</button>
    </article>`;
}

function faviconMarkup(url, title, precomputedUrl = '') {
  const favicon = precomputedUrl || faviconUrl(url, 32);
  return `
    <span class="favicon-tile${favicon ? '' : ' is-fallback'}" style="${tileStyle(url)}">
      ${favicon ? `<img class="favicon-img" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}
      <span class="favicon-letter">${escapeHtml(letterFor(url, title))}</span>
    </span>`;
}

function skeletonMarkup(count = 8) {
  return `<div class="skeleton-list" aria-label="正在加载历史记录">${Array.from({ length: count }, () => `
    <div class="skeleton-row">
      <div class="skeleton-block sk-icon"></div>
      <div class="sk-lines">
        <div class="skeleton-block sk-line"></div>
        <div class="skeleton-block sk-line short"></div>
      </div>
      <div class="skeleton-block sk-time"></div>
    </div>`).join('')}</div>`;
}

function emptyMarkup({ iconName = 'history', title, text, actions = '', error = false }) {
  return `
    <div class="empty">
      <div class="empty-icon${error ? ' is-error' : ''}">${icon(iconName)}</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
    </div>`;
}

function emptyHistoryMarkup() {
  if (state.query) {
    return emptyMarkup({
      iconName: 'search',
      title: '未找到相关历史记录',
      text: `没有与“${state.query}”匹配的标题或网址。试试其他关键词，或调整时间范围。`,
      actions: `
        <button class="btn btn-primary" type="button" data-action="clear-search">清除搜索</button>
        ${state.range !== 'all' ? '<button class="btn btn-ghost" type="button" data-action="show-all">显示全部时间</button>' : ''}`
    });
  }

  if (state.range !== 'all') {
    return emptyMarkup({
      iconName: 'calendar',
      title: '此时间范围内没有历史记录',
      text: `当前筛选范围是“${formatRangeLabel(state.range, state.custom)}”。可以换个时间范围，或查看全部记录。`,
      actions: '<button class="btn btn-primary" type="button" data-action="show-all">显示全部时间</button>'
    });
  }

  return emptyMarkup({
    iconName: 'history',
    title: '还没有历史记录',
    text: '打开一些网页后，你的浏览记录会按日期出现在这里。也可以试着搜索标题或网址。'
  });
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

function renderFooter() {
  if (!el) return;
  const hadFocus = el.listFooter.contains(document.activeElement);
  let html = '';

  if (!state.items.length) {
    html = '';
  } else if (state.loading) {
    html = '<span class="spinner" aria-hidden="true"></span><span>正在加载更多…</span>';
  } else if (state.error) {
    html = `
      ${icon('alert')}
      <span>加载失败：${escapeHtml(friendlyError(state.error))}</span>
      <button class="btn btn-quiet" type="button" data-action="retry-history">重试</button>`;
  } else if (state.exhausted) {
    html = `
      <span class="end-mark" aria-hidden="true"></span>
      <span>已显示全部 ${formatCount(state.items.length)} 条记录</span>`;
  } else {
    html = `
      <span>继续滚动以加载更多</span>
      <button class="btn btn-quiet" type="button" data-action="load-more">加载更多</button>`;
  }

  el.listFooter.innerHTML = html;
  restoreFooterFocus(hadFocus);
}

function updateResultCount() {
  if (!el) return;
  if (!state.loadedOnce) {
    el.resultCount.textContent = '';
  } else if (state.loading && !state.items.length) {
    el.resultCount.textContent = '正在加载…';
  } else if (!state.items.length) {
    el.resultCount.textContent = state.error ? '加载失败' : '0 条';
  } else if (state.exhausted) {
    el.resultCount.textContent = `共 ${formatCount(state.items.length)} 条`;
  } else {
    el.resultCount.textContent = `已加载 ${formatCount(state.items.length)} 条`;
  }
}

/* --------------------------------------------------------------- selection */

function enterSelectMode({ keepSelection = false } = {}) {
  if (state.view !== 'history') return;
  state.selectMode = true;
  if (!keepSelection) state.selected.clear();
  el.app.classList.add('selecting');
  el.selectBtn.setAttribute('aria-pressed', 'true');
  el.selectBtn.querySelector('span').textContent = '完成';
  el.bulkBar.hidden = false;
  updateAllSelectionVisuals();
  updateBulkBar();
  window.requestAnimationFrame(() => el.bulkBar.classList.add('is-visible'));
  announce('已进入选择模式');
}

function exitSelectMode() {
  if (!state.selectMode) return;
  state.selectMode = false;
  state.selected.clear();
  el.app.classList.remove('selecting');
  el.selectBtn.setAttribute('aria-pressed', 'false');
  el.selectBtn.querySelector('span').textContent = '选择';
  el.bulkBar.classList.remove('is-visible');
  el.bulkBar.hidden = true;
  updateAllSelectionVisuals();
  updateBulkBar();
}

function toggleSelectMode() {
  if (state.selectMode) exitSelectMode();
  else enterSelectMode();
}

function setSelection(id, selected) {
  if (!itemIndex.has(id)) return;
  if (selected) state.selected.add(id);
  else state.selected.delete(id);

  const row = el.historyList.querySelector(`.history-row[data-id="${id}"]`);
  if (row) {
    row.classList.toggle('is-selected', selected);
    const checkbox = row.querySelector('input[data-role="check"]');
    if (checkbox) checkbox.checked = selected;
  }
  updateBulkBar();
}

function updateAllSelectionVisuals() {
  for (const row of el.historyList.querySelectorAll('.history-row')) {
    const id = Number(row.dataset.id);
    const selected = state.selected.has(id);
    row.classList.toggle('is-selected', selected);
    const checkbox = row.querySelector('input[data-role="check"]');
    if (checkbox) checkbox.checked = selected;
  }
}

function updateBulkBar() {
  const count = state.selected.size;
  const allSelected = state.items.length > 0 && count === state.items.length;
  el.bulkCount.innerHTML = `已选择 <strong>${formatCount(count)}</strong> 项`;
  el.bulkDeleteBtn.disabled = count === 0;
  el.selectAllBtn.textContent = allSelected ? '取消全选' : '全选已加载';
}

function toggleSelectAll() {
  const allSelected = state.items.length > 0 && state.selected.size === state.items.length;
  state.selected.clear();
  if (!allSelected) {
    for (const item of state.items) state.selected.add(item._id);
  }
  updateAllSelectionVisuals();
  updateBulkBar();
}

async function deleteSelected() {
  const items = state.items.filter((item) => state.selected.has(item._id));
  if (!items.length) return;

  const confirmed = await showConfirm({
    title: '删除选中的历史记录？',
    message: `将删除选中的 ${items.length} 条记录的全部浏览记录。Chrome 以网址为单位保存历史，删除会移除这些网址的所有访问记录，而不是只删除某一次访问。`,
    note: '此操作无法撤销，也不会删除 Cookie、缓存或书签。',
    confirmLabel: '删除'
  });
  if (!confirmed) return;

  const urls = items.flatMap((item) => item.mergedUrls?.length ? item.mergedUrls : [item.url]);
  const deleted = await deleteItemUrls(urls);
  if (deleted > 0) showToast(`已删除 ${formatCount(items.length)} 条记录`, 'success');
  else showToast('没有记录被删除，请重试', 'error');
  if (!state.items.length && state.selectMode) exitSelectMode();
}

async function deleteItemUrls(urls) {
  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return 0;

  const settled = await Promise.allSettled(unique.map((url) => api.history.deleteUrl({ url })));
  const deletedUrls = new Set();
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') deletedUrls.add(unique[index]);
  });

  if (deletedUrls.size) {
    // Stop an in-flight "load more" from appending rows based on the old list.
    state.requestId += 1;
    state.loading = false;
    state.items = state.items.filter((item) => !deletedUrls.has(item.url));
    state.seen = new Set(state.items.flatMap((item) => item.mergedUrls || [item.url]));
    rebuildItemIndex();
    rebuildCanonicalIndex();
    state.selected.clear();

    if (!state.items.length) {
      // The visible page can be emptied while older pages still exist. Reload
      // from the current query/filter instead of declaring the history empty.
      state.loadedOnce = true;
      await loadHistoryReset();
    } else {
      renderHistory();
      updateResultCount();
      updateBulkBar();
    }
  }

  return deletedUrls.size;
}

/* --------------------------------------------------------------- row menu */

function openRowMenu(id, anchor) {
  const item = itemIndex.get(id);
  if (!item) return;

  if (state.menuItemId === id && !el.rowMenu.hidden) {
    closeRowMenu();
    return;
  }

  closeRowMenu();
  const openable = canOpenUrl(item.url);
  const http = isHttpUrl(item.url);
  const site = siteLabelOf(item.url);
  const entries = [];

  if (openable) entries.push({ action: 'open', icon: 'external', label: '在新标签页中打开' });
  entries.push({ action: 'copy', icon: 'copy', label: '复制链接' });
  entries.push({ action: 'visits', icon: 'clock', label: '查看访问记录' });
  entries.push({ divider: true });
  entries.push({ action: 'delete', icon: 'trash', label: '删除此记录', danger: true });
  if (http) {
    entries.push({
      action: 'delete-site',
      icon: 'trash',
      label: `删除 ${site || '此站点'} 的所有记录`,
      danger: true
    });
  }

  el.rowMenu.innerHTML = entries.map((entry) => {
    if (entry.divider) return '<div class="context-divider" role="separator"></div>';
    return `<button class="context-item${entry.danger ? ' is-danger' : ''}" type="button" role="menuitem" data-menu-action="${entry.action}">
      ${icon(entry.icon)}<span>${escapeHtml(entry.label)}</span>
    </button>`;
  }).join('');

  state.menuItemId = id;
  state.menuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  el.rowMenu.hidden = false;
  el.rowMenu.style.left = '0px';
  el.rowMenu.style.top = '0px';

  const rect = anchor.getBoundingClientRect();
  const menuRect = el.rowMenu.getBoundingClientRect();
  const left = clamp(rect.right - menuRect.width, 8, window.innerWidth - menuRect.width - 8);
  const below = rect.bottom + 5;
  const top = below + menuRect.height > window.innerHeight - 8
    ? Math.max(8, rect.top - menuRect.height - 5)
    : below;
  el.rowMenu.style.left = `${left}px`;
  el.rowMenu.style.top = `${top}px`;
  el.rowMenu.querySelector('.context-item')?.focus();
}

function closeRowMenu({ restoreFocus = false } = {}) {
  if (!el || el.rowMenu.hidden) return;
  const anchor = state.menuAnchor;
  if (anchor?.isConnected) anchor.setAttribute('aria-expanded', 'false');
  el.rowMenu.hidden = true;
  el.rowMenu.innerHTML = '';
  state.menuItemId = null;
  state.menuAnchor = null;
  if (restoreFocus && anchor?.isConnected) anchor.focus();
}

async function onRowMenuAction(action) {
  const item = itemIndex.get(state.menuItemId);
  if (!item) return;
  closeRowMenu({ restoreFocus: true });

  if (action === 'open') {
    openHistoryItem(item, { forceNewTab: true });
    return;
  }

  if (action === 'copy') {
    const copied = await copyText(item.url);
    showToast(copied ? '链接已复制' : '复制失败，请手动选择网址', copied ? 'success' : 'error');
    return;
  }

  if (action === 'visits') {
    openVisits(item);
    return;
  }

  if (action === 'delete') {
    await deleteItem(item);
    return;
  }

  if (action === 'delete-site') {
    await deleteSite(item);
  }
}

async function deleteItem(item) {
  const title = normalizeTitle(item.title, item.url);
  const urls = item.mergedUrls?.length ? item.mergedUrls : [item.url];
  const mergedNote = urls.length > 1
    ? `这条记录合并了 ${urls.length} 个网址变体，会一并删除。`
    : '';
  const confirmed = await showConfirm({
    title: '删除此历史记录？',
    message: `将删除“${title}”的全部访问记录（共 ${item.visitCount || 1} 次）。${mergedNote}Chrome 以网址为单位保存历史，因此无法只删除其中一次访问。`,
    note: '此操作无法撤销。',
    confirmLabel: '删除'
  });
  if (!confirmed) return;

  const index = state.items.findIndex((candidate) => candidate._id === item._id);
  const deleted = await deleteItemUrls(urls);
  showToast(deleted ? '已删除该记录' : '删除失败，请重试', deleted ? 'success' : 'error');
  if (!deleted) return;

  const next = state.items[Math.min(Math.max(index, 0), state.items.length - 1)];
  const row = next
    ? el.historyList.querySelector(`.history-row[data-id="${next._id}"]`)
    : null;
  (row?.querySelector('.row-more') || el.searchInput).focus();
  if (!state.items.length && state.selectMode) exitSelectMode();
}

async function deleteSite(item) {
  const host = siteKeyOf(item.url);
  if (!host) return;
  const label = host.replace(/^www\./, '');

  const confirmed = await showConfirm({
    title: '删除此站点的历史记录？',
    message: `将删除 ${label} 这个主机下所有网址的全部浏览记录（不含子域名），包括当前页面中尚未显示的记录。Chrome 的历史记录以网址为单位，无法只删除某一次访问。`,
    note: '此操作无法撤销，可能需要几秒钟。',
    confirmLabel: '全部删除'
  });
  if (!confirmed) return;

  showToast(`正在删除 ${label} 的历史记录…`, 'info', 5000);
  let collected = { urls: new Set(), complete: false };
  try {
    collected = await collectSiteUrls(host);
  } catch (error) {
    console.error('Failed to collect site URLs', error);
  }

  const urls = collected.urls;
  // Always include the rows already loaded, even if the search above failed.
  for (const local of state.items) {
    if (siteKeyOf(local.url) === host) urls.add(local.url);
  }
  urls.add(item.url);

  const deleted = await deleteItemUrls([...urls]);
  if (!deleted) {
    showToast('没有记录被删除，请重试', 'error');
  } else if (!collected.complete) {
    showToast(`已删除 ${formatCount(deleted)} 条；部分站点记录未能收集，可能仍有剩余`, 'error', 5000);
  } else {
    showToast(`已删除 ${label} 的 ${formatCount(deleted)} 条记录`, 'success');
  }
  if (!state.items.length && state.selectMode) exitSelectMode();
}

async function collectSiteUrls(host) {
  const urls = new Set();
  const base = host.replace(/^www\./, '');
  const hosts = new Set([host, base, `www.${base}`]);
  let cursor = null;

  for (let page = 0; page < 40; page += 1) {
    const query = {
      text: base,
      startTime: 0,
      // endTime is exclusive in chrome.history.search; include siblings with
      // the exact same timestamp before moving on.
      endTime: cursor == null ? Date.now() : Math.min(cursor + SEARCH_TIME_EPSILON, Date.now()),
      maxResults: 500
    };

    let results;
    try {
      results = await api.history.search(query);
    } catch (error) {
      console.error('Failed to collect site URLs', error);
      return { urls, complete: false };
    }
    if (!Array.isArray(results)) return { urls, complete: false };
    if (!results.length) return { urls, complete: true };

    for (const result of results) {
      if (hosts.has(siteKeyOf(result.url))) urls.add(result.url);
    }

    if (results.length < 500) return { urls, complete: true };
    const oldest = Math.min(...results.map((result) => Number(result.lastVisitTime) || 0));
    if (!Number.isFinite(oldest) || (cursor != null && oldest >= cursor)) {
      return { urls, complete: false };
    }
    cursor = oldest;
  }

  return { urls, complete: false };
}

/* ------------------------------------------------------------------ visits */

function openVisits(item) {
  closeRowMenu();
  const title = normalizeTitle(item.title, item.url);
  const body = `
    <div class="modal-target">
      ${faviconMarkup(item.url, title)}
      <div class="modal-target-copy">
        <span class="modal-target-title">${escapeHtml(title)}</span>
        <span class="modal-target-url">${escapeHtml(item.url)}</span>
      </div>
    </div>
    <div id="visitBody">
      <div class="modal-loading"><span class="spinner" aria-hidden="true"></span><span>正在读取访问明细…</span></div>
    </div>`;

  openModal({
    title: '访问记录',
    bodyHtml: body,
    wide: true,
    footerHtml: '<button class="btn btn-ghost" type="button" data-modal-close>关闭</button>',
    onMount(modal) {
      const container = modal.querySelector('#visitBody');
      api.history.getVisits({ url: item.url }).then((visits) => {
        if (!modal.isConnected || !container) return;
        const sorted = (Array.isArray(visits) ? visits : [])
          .slice()
          .sort((a, b) => b.visitTime - a.visitTime);
        const shown = sorted.slice(0, 300);

        container.innerHTML = `
          <div class="visit-summary">该网址共有 ${formatCount(sorted.length)} 次访问${sorted.length > shown.length ? `，下面显示最近 ${formatCount(shown.length)} 次` : ''}。</div>
          ${shown.length ? `<div class="visit-list">${shown.map((visit) => `
            <div class="visit-row">
              <span class="visit-time">${escapeHtml(formatFullDate(visit.visitTime))}</span>
              <span class="visit-transition">${escapeHtml(transitionLabel(visit.transition))}</span>
            </div>`).join('')}</div>` : '<div class="empty"><p>没有可用的访问明细。</p></div>'}`;
      }).catch((error) => {
        if (!modal.isConnected || !container) return;
        container.innerHTML = `<div class="modal-callout is-warning">${icon('alert')}<span>无法读取访问明细：${escapeHtml(friendlyError(error))}</span></div>`;
      });
    }
  });
}

/* ------------------------------------------------------------------ closed */

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
  updateRefreshButton();
  renderClosed();
  const requestId = ++state.closedRequestId;

  try {
    const sessions = await api.sessions.getRecentlyClosed({ maxResults: SESSION_LIMIT });
    if (requestId !== state.closedRequestId) return;
    state.closed = Array.isArray(sessions) ? sessions.slice(0, SESSION_LIMIT) : [];
    state.closedLoaded = true;
  } catch (error) {
    if (requestId !== state.closedRequestId) return;
    console.error('Failed to load recently closed sessions', error);
    state.closedError = error;
  } finally {
    if (requestId !== state.closedRequestId) return;
    state.closedLoading = false;
    updateRefreshButton();
    if (state.view === 'closed') renderClosed();
    if (state.closedDirty) {
      state.closedDirty = false;
      loadClosed(true);
    }
  }
}

function sessionMatchesQuery(session, query) {
  const q = query.toLocaleLowerCase();
  const tabs = session.tab ? [session.tab] : (session.window?.tabs || []);
  return tabs.some((tab) => `${tab.title || ''} ${tab.url || ''}`.toLocaleLowerCase().includes(q));
}

function filteredClosedSessions() {
  const query = state.query.trim();
  if (!query) return state.closed.map((session, index) => ({ session, index }));
  return state.closed
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => sessionMatchesQuery(session, query));
}

function renderClosed() {
  if (!el) return;
  const sessions = filteredClosedSessions();

  if (state.closedLoading) {
    el.closedMeta.textContent = state.closedLoaded ? `正在刷新 · ${state.closed.length} 个关闭项` : '正在读取…';
  } else if (state.closedError) {
    el.closedMeta.textContent = '读取失败';
  } else if (state.query) {
    el.closedMeta.textContent = `${formatCount(sessions.length)} 个匹配项`;
  } else {
    el.closedMeta.textContent = `${formatCount(state.closed.length)} 个关闭项`;
  }

  if (state.closedLoading && !state.closed.length) {
    el.closedList.innerHTML = `<div class="empty"><span class="spinner" aria-hidden="true"></span><h2>正在读取最近关闭的记录</h2></div>`;
    return;
  }

  if (state.closedError) {
    el.closedList.innerHTML = emptyMarkup({
      iconName: 'alert',
      error: true,
      title: '无法读取最近关闭的标签页',
      text: friendlyError(state.closedError),
      actions: '<button class="btn btn-primary" type="button" data-action="refresh-closed">重试</button>'
    });
    return;
  }

  if (!state.closed.length) {
    el.closedList.innerHTML = emptyMarkup({
      iconName: 'restore',
      title: '没有最近关闭的标签页',
      text: '关闭标签页或窗口后，它们会出现在这里，可以一键恢复。',
      actions: '<button class="btn btn-quiet" type="button" data-action="refresh-closed">刷新</button>'
    });
    return;
  }

  if (!sessions.length) {
    el.closedList.innerHTML = emptyMarkup({
      iconName: 'search',
      title: '没有匹配的关闭项',
      text: `没有与“${state.query}”匹配的已关闭标签页。`,
      actions: '<button class="btn btn-primary" type="button" data-action="clear-search">清除搜索</button>'
    });
    return;
  }

  el.closedList.innerHTML = sessions.map(({ session, index }) => sessionMarkup(session, index)).join('');
}

function sessionMarkup(session, index) {
  const time = session.lastModified ? relativeTime(toMillis(session.lastModified)) : '';

  if (session.tab) {
    const tab = session.tab;
    const title = normalizeTitle(tab.title, tab.url) || '未命名标签页';
    return `
      <article class="session-card is-single">
        <div class="single-session">
          ${faviconMarkup(tab.url, title)}
          <div class="single-session-main">
            <a class="single-session-title" href="${hrefFor(tab.url)}" data-open-url="${escapeHtml(tab.url)}">${highlight(title, state.query)}</a>
            <span class="single-session-url">${highlight(displayUrl(tab.url), state.query)}</span>
          </div>
          <span class="single-session-time">${escapeHtml(time)}</span>
          <button class="btn btn-soft session-restore" type="button" data-action="restore" data-session-index="${index}">
            ${icon('restore')}<span>恢复</span>
          </button>
        </div>
      </article>`;
  }

  const tabs = (session.window?.tabs || []).filter((tab) => tab.url);
  return `
    <article class="session-card">
      <div class="session-head">
        <span class="session-window-icon">${icon('window')}</span>
        <div class="session-head-copy">
          <strong>窗口 · ${pluralTabs(tabs.length)}</strong>
          <span>${escapeHtml(time || '最近关闭')}</span>
        </div>
        <button class="btn btn-soft session-restore" type="button" data-action="restore" data-session-index="${index}">
          ${icon('restore')}<span>恢复窗口</span>
        </button>
      </div>
      <div class="session-tabs">
        ${tabs.map((tab) => sessionTabMarkup(tab)).join('')}
      </div>
    </article>`;
}

function sessionTabMarkup(tab) {
  const title = normalizeTitle(tab.title, tab.url) || '未命名标签页';
  return `
    <a class="session-tab" href="${hrefFor(tab.url)}" data-open-url="${escapeHtml(tab.url)}">
      ${faviconMarkup(tab.url, title)}
      <span class="session-tab-main">
        <span class="session-tab-title">${highlight(title, state.query)}</span>
        <span class="session-tab-url">${highlight(displayUrl(tab.url), state.query)}</span>
      </span>
      <span class="session-tab-open">${icon('external')}</span>
    </a>`;
}

async function restoreSession(index) {
  const session = state.closed[index];
  if (!session || state.restoring) return;

  const sessionId = session.tab?.sessionId ?? session.window?.sessionId;
  const trigger = el.closedList.querySelector(`[data-session-index="${index}"]`);
  trigger?.classList.add('is-restoring');
  if (trigger) trigger.disabled = true;
  state.restoring = true;

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
    updateRefreshButton();

    showToast(session.window ? '已恢复窗口' : '已恢复标签页', 'success');
    await loadClosed(true);
  } catch (error) {
    console.error('Failed to restore session', error);
    showToast(`恢复失败：${friendlyError(error)}`, 'error');
    trigger?.classList.remove('is-restoring');
    if (trigger) trigger.disabled = false;
  } finally {
    state.restoring = false;
  }
}

/* ----------------------------------------------------------------- devices */

async function loadDevices(force = false) {
  if (state.devicesLoading) return;
  if (state.devicesLoaded && !force) {
    renderDevices();
    return;
  }

  state.devicesLoading = true;
  state.devicesError = null;
  updateRefreshButton();
  renderDevices();

  try {
    const devices = await api.sessions.getDevices({ maxResults: 20 });
    state.devices = Array.isArray(devices) ? devices : [];
    state.devicesLoaded = true;
  } catch (error) {
    console.error('Failed to load synced devices', error);
    state.devicesError = error;
  } finally {
    state.devicesLoading = false;
    updateRefreshButton();
    if (state.view === 'devices') renderDevices();
  }
}

function tabMatchesQuery(tab, query) {
  return `${tab.title || ''} ${tab.url || ''}`.toLocaleLowerCase().includes(query);
}

function filteredDevices(devices, query) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return devices;

  return devices.map((device) => {
    const sessions = (device.sessions || []).map((session) => {
      if (session.tab) return tabMatchesQuery(session.tab, q) ? session : null;
      const tabs = (session.window?.tabs || []).filter((tab) => tabMatchesQuery(tab, q));
      if (!tabs.length) return null;
      return { ...session, window: { ...session.window, tabs } };
    }).filter(Boolean);

    return sessions.length ? { ...device, sessions } : null;
  }).filter(Boolean);
}

function renderDevices() {
  if (!el) return;
  const devices = filteredDevices(state.devices, state.query);
  const totalTabs = countDeviceTabs(devices);

  if (state.devicesLoading) {
    el.devicesMeta.textContent = state.devicesLoaded
      ? `正在刷新 · ${formatCount(state.devices.length)} 台设备`
      : '正在读取…';
  } else if (state.devicesError) {
    el.devicesMeta.textContent = '读取失败';
  } else if (state.query) {
    el.devicesMeta.textContent = `${formatCount(devices.length)} 台设备 · ${formatCount(totalTabs)} 个匹配标签页`;
  } else if (state.devices.length) {
    el.devicesMeta.textContent = `${formatCount(state.devices.length)} 台设备 · ${formatCount(totalTabs)} 个标签页`;
  } else {
    el.devicesMeta.textContent = '0 台设备';
  }

  if (state.devicesLoading && !state.devices.length) {
    el.devicesList.innerHTML = `<div class="empty"><span class="spinner" aria-hidden="true"></span><h2>正在读取同步的标签页</h2></div>`;
    return;
  }

  if (state.devicesError) {
    el.devicesList.innerHTML = emptyMarkup({
      iconName: 'alert',
      error: true,
      title: '无法读取其他设备的标签页',
      text: friendlyError(state.devicesError),
      actions: '<button class="btn btn-primary" type="button" data-action="refresh-devices">重试</button>'
    });
    return;
  }

  if (!state.devices.length) {
    el.devicesList.innerHTML = `
      <div class="sync-empty">
        <div class="empty-icon">${icon('devices')}</div>
        <h2>还没有来自其他设备的标签页</h2>
        <p>Chrome 没有返回已同步的会话。跨设备标签页需要登录同一个 Google 账号，并在同步设置中开启“打开的标签页”。</p>
        <div class="sync-steps">
          <div class="sync-step"><span class="sync-step-num">1</span><span>在这台电脑的 Chrome 中登录你的 Google 账号。</span></div>
          <div class="sync-step"><span class="sync-step-num">2</span><span>打开同步，并勾选“打开的标签页”这一项。</span></div>
          <div class="sync-step"><span class="sync-step-num">3</span><span>在手机或其他电脑上保持 Chrome 打开，然后点击刷新。</span></div>
        </div>
        <div class="empty-actions">
          <button class="btn btn-primary" type="button" data-action="open-sync-settings">打开 Chrome 同步设置</button>
          <button class="btn btn-quiet" type="button" data-action="refresh-devices">刷新</button>
        </div>
      </div>`;
    return;
  }

  if (!devices.length) {
    el.devicesList.innerHTML = emptyMarkup({
      iconName: 'search',
      title: '没有匹配的标签页',
      text: `没有与“${state.query}”匹配的其他设备标签页。`,
      actions: '<button class="btn btn-primary" type="button" data-action="clear-search">清除搜索</button>'
    });
    return;
  }

  el.devicesList.innerHTML = devices.map(deviceMarkup).join('');
}

function deviceMarkup(device) {
  const name = String(device.deviceName || '未知设备');
  const sessions = Array.isArray(device.sessions) ? device.sessions : [];
  const tabCount = countDeviceTabs([device]);

  return `
    <article class="device-card">
      <div class="device-head">
        <span class="device-icon">${icon(deviceIcon(name))}</span>
        <div class="device-head-copy">
          <h3>${escapeHtml(name)}</h3>
          <p>${formatCount(sessions.length)} 个窗口 · ${formatCount(tabCount)} 个标签页</p>
        </div>
      </div>
      ${sessions.map((session) => deviceSessionMarkup(session)).join('')}
    </article>`;
}

function deviceSessionMarkup(session) {
  const tabs = session.tab
    ? [session.tab]
    : (session.window?.tabs || []).filter((tab) => tab.url);
  const time = session.lastModified ? relativeTime(toMillis(session.lastModified)) : '';

  return `
    <div class="device-session">
      <div class="device-session-head">
        ${icon('window')}
        <span>窗口 · ${pluralTabs(tabs.length)}</span>
        ${time ? `<span class="device-session-time">${escapeHtml(time)}</span>` : ''}
      </div>
      <div class="device-tabs">
        ${tabs.map((tab) => {
          const title = normalizeTitle(tab.title, tab.url);
          return `
            <a class="device-tab" href="${hrefFor(tab.url)}" data-open-url="${escapeHtml(tab.url)}">
              ${faviconMarkup(tab.url, title)}
              <span class="device-tab-main">
                <span class="device-tab-title">${highlight(title, state.query)}</span>
                <span class="device-tab-url">${highlight(displayUrl(tab.url), state.query)}</span>
              </span>
              <span class="device-tab-open">${icon('arrow-up-right')}</span>
            </a>`;
        }).join('')}
      </div>
    </div>`;
}

function countDeviceTabs(devices) {
  let count = 0;
  for (const device of devices || []) {
    for (const session of device.sessions || []) {
      if (session.tab) count += 1;
      else count += (session.window?.tabs || []).filter((tab) => tab.url).length;
    }
  }
  return count;
}

function deviceIcon(name) {
  if (/ipad|tablet|平板/i.test(name)) return 'tablet';
  if (/iphone|android|phone|手机/i.test(name)) return 'phone';
  return 'laptop';
}

/* --------------------------------------------------------------- welcome */

function reloadAfterQueryChange() {
  state.queries[state.view] = state.query;
  updateUrlState();
  if (state.view === 'history') loadHistoryReset();
  else if (state.view === 'closed') renderClosed();
  else renderDevices();
}

function switchToHistory({ focus = false } = {}) {
  if (state.view !== 'history') {
    state.queries[state.view] = state.query;
    state.view = 'history';
    state.query = state.queries.history || '';
    el.searchInput.value = state.query;
    updateSearchUI();
    syncViewChrome();
    updateUrlState();
    window.requestAnimationFrame(() => {
      el.content.scrollTop = state.historyScrollTop || 0;
    });
  }
  if (!state.loadedOnce || state.appliedQuery !== state.query) loadHistoryReset();
  if (focus) el.searchInput.focus();
}

function focusHistoryView() {
  switchToHistory();
}

function showAllHistory() {
  closeRangePopover();
  closeRowMenu();
  if (state.view !== 'history') state.queries[state.view] = state.query;

  state.view = 'history';
  state.query = '';
  state.queries.history = '';
  state.range = 'all';
  state.custom = { start: '', end: '' };
  el.searchInput.value = '';
  runSearch.cancel();
  updateSearchUI();
  updateRangeUI();
  syncViewChrome();
  updateUrlState();
  window.requestAnimationFrame(() => {
    el.content.scrollTop = 0;
  });
  loadHistoryReset();
}

function searchFromExternal(query, range = 'all') {
  const value = String(query || '').trim();
  const validRange = ['all', 'hour', '24h', 'today', 'yesterday', '7d', '30d'].includes(range) ? range : 'all';
  state.queries[state.view] = state.query;
  state.view = 'history';
  state.query = value;
  state.queries.history = value;
  state.range = validRange;
  state.custom = { start: '', end: '' };
  el.searchInput.value = value;
  runSearch.cancel();
  updateSearchUI();
  updateRangeUI();
  syncViewChrome();
  updateUrlState();
  window.requestAnimationFrame(() => {
    el.content.scrollTop = 0;
  });
  loadHistoryReset();
}

function bindRuntimeMessages() {
  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== 'edge-history:action') return false;

      if (message.action === 'settings') openSettings();
      else if (message.action === 'all') showAllHistory();
      else if (message.action === 'search') searchFromExternal(message.query, message.range);
      else if (message.action === 'range') searchFromExternal('', message.range);
      else if (message.action === 'history') focusHistoryView();
      else if (message.action === 'closed' || message.action === 'devices') switchView(message.action);

      sendResponse?.({ ok: true });
      return false;
    });
  } catch (error) {
    console.debug('Runtime messaging unavailable', error);
  }
}

function updateWelcomeVisibility() {
  el.welcomeBanner.hidden = !(state.welcome && state.view === 'history');
}

async function dismissWelcome() {
  state.welcome = false;
  state.settings.welcomeDismissed = true;
  updateWelcomeVisibility();
  await saveSettings({ welcomeDismissed: true });
  const url = new URL(location.href);
  url.searchParams.delete('welcome');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function visibleRowTitles() {
  return [...el.historyList.querySelectorAll('.row-title')]
    .filter((node) => node.offsetParent !== null);
}

/* --------------------------------------------------------------- search */

function updateSearchUI() {
  const hasValue = Boolean(el.searchInput.value.trim());
  el.searchField.classList.toggle('has-value', hasValue);
  el.searchClear.hidden = !hasValue;
}

function updateSearchPlaceholder() {
  const labels = {
    history: '搜索历史记录（标题或网址）',
    closed: '搜索最近关闭（标题或网址）',
    devices: '搜索来自其他设备的标签页'
  };
  const label = labels[state.view] || labels.history;
  el.searchInput.placeholder = label;
  el.searchInput.setAttribute('aria-label', label);
}

function handleSearchInput() {
  updateSearchUI();
  if (state.view === 'history') {
    runSearch();
    return;
  }

  runSearch.cancel();
  const value = el.searchInput.value.trim();
  if (value === state.query) return;
  state.query = value;
  state.queries[state.view] = value;
  updateUrlState();
  if (state.view === 'closed') renderClosed();
  else renderDevices();
}

function commitSearch() {
  const value = el.searchInput.value.trim();
  if (value === state.query) return;
  state.query = value;
  updateSearchUI();
  updateUrlState();
  reloadAfterQueryChange();
}

function clearSearch({ focus = true } = {}) {
  if (!state.query && !el.searchInput.value) return;
  el.searchInput.value = '';
  state.query = '';
  runSearch.cancel();
  updateSearchUI();
  updateUrlState();
  reloadAfterQueryChange();
  if (focus) el.searchInput.focus();
}

function commitSearchNow() {
  runSearch.cancel();
  const value = el.searchInput.value.trim();
  if (value !== state.query) {
    state.query = value;
    updateSearchUI();
    updateUrlState();
    reloadAfterQueryChange();
    return true;
  }
  return false;
}

/* --------------------------------------------------------------- range */

function updateRangeUI() {
  el.rangeLabel.textContent = formatRangeLabel(state.range, state.custom);
  for (const button of el.rangePopover.querySelectorAll('[data-range]')) {
    const selected = button.dataset.range === state.range;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
}

function toggleRangePopover(force) {
  const willOpen = typeof force === 'boolean' ? force : el.rangePopover.hidden;
  if (willOpen) {
    updateRangeUI();
    el.customRange.hidden = state.range !== 'custom';
    if (state.range === 'custom') fillCustomDates();
    el.rangePopover.hidden = false;
    el.rangeBtn.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => {
      const target = el.rangePopover.querySelector('.popover-item.is-selected') || el.rangePopover.querySelector('.popover-item');
      target?.focus();
    });
  } else {
    closeRangePopover();
  }
}

function closeRangePopover({ restoreFocus = false } = {}) {
  if (!el || el.rangePopover.hidden) return;
  el.rangePopover.hidden = true;
  el.rangeBtn.setAttribute('aria-expanded', 'false');
  el.customRangeBtn?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) el.rangeBtn.focus();
}

function fillCustomDates() {
  if (!el.startDate.value) {
    el.startDate.value = state.custom.start || formatDateInput(addDays(Date.now(), -6));
  }
  if (!el.endDate.value) {
    el.endDate.value = state.custom.end || formatDateInput(Date.now());
  }
}

function applyRange(range, custom = null) {
  state.range = range;
  if (custom) state.custom = custom;
  updateRangeUI();
  closeRangePopover();
  updateUrlState();
  loadHistoryReset();
}

function applyCustomRange() {
  const start = el.startDate.value;
  const end = el.endDate.value;
  if (!start || !end) {
    showToast('请选择开始和结束日期', 'error');
    return;
  }
  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);
  if (!startDate || !endDate) {
    showToast('日期格式无效', 'error');
    return;
  }
  if (startDate > endDate) {
    showToast('开始日期不能晚于结束日期', 'error');
    return;
  }
  if (startOfDay(endDate.getTime()) > startOfDay(Date.now())) {
    showToast('不能选择未来的日期', 'error');
    return;
  }
  state.custom = { start, end };
  applyRange('custom', state.custom);
}

/* ------------------------------------------------------------------ clear */

function openClearDialog() {
  closeRowMenu();
  closeRangePopover();

  const body = `
    <p>选择要清除的时间范围。此操作只删除 Chrome 的浏览历史，不会删除 Cookie、缓存、下载记录或书签。</p>
    <label class="field-label">时间范围
      <select id="clearRange" autofocus>
        <option value="hour" selected>最近 1 小时</option>
        <option value="today">今天</option>
        <option value="7d">最近 7 天</option>
        <option value="30d">最近 30 天</option>
        <option value="all">全部时间</option>
        <option value="custom">自定义范围…</option>
      </select>
    </label>
    <div class="custom-clear-range" id="clearCustom" hidden>
      <label class="field-label">开始日期<input type="date" id="clearStart"></label>
      <label class="field-label">结束日期<input type="date" id="clearEnd"></label>
    </div>
    <div class="clear-native">
      <span>Cookie、缓存、下载记录等需要在 Chrome 的“清除浏览数据”中处理。</span>
      <button class="btn btn-quiet" type="button" id="openClearSettings">打开 Chrome 清除浏览数据</button>
    </div>
    <div class="modal-callout is-warning">
      ${icon('alert')}
      <span>历史记录清除后无法撤销。同步到其他设备的历史记录是否受影响，取决于 Chrome 的同步状态。</span>
    </div>
    <label class="check-line">
      <input type="checkbox" id="clearAck">
      <span>我了解此操作无法撤销</span>
    </label>`;

  openModal({
    title: '清除历史记录',
    bodyHtml: body,
    footerHtml: `
      <button class="btn btn-ghost" type="button" data-modal-close>取消</button>
      <button class="btn btn-danger" type="button" id="clearConfirm" disabled>清除历史记录</button>`,
    onMount(modal) {
      const rangeSelect = modal.querySelector('#clearRange');
      const custom = modal.querySelector('#clearCustom');
      const ack = modal.querySelector('#clearAck');
      const confirm = modal.querySelector('#clearConfirm');
      const start = modal.querySelector('#clearStart');
      const end = modal.querySelector('#clearEnd');

      modal.querySelector('#openClearSettings')?.addEventListener('click', async () => {
        try {
          await api.tabs.create({ url: 'chrome://settings/clearBrowserData' });
        } catch (error) {
          console.error('Failed to open Chrome clear browsing data', error);
          const copied = await copyText('chrome://settings/clearBrowserData');
          showToast(
            copied ? '已复制地址，请在地址栏打开' : '请在地址栏打开 chrome://settings/clearBrowserData',
            copied ? 'info' : 'error'
          );
        }
      });

      start.value = formatDateInput(addDays(Date.now(), -6));
      end.value = formatDateInput(Date.now());

      const syncAck = () => {
        confirm.disabled = !ack.checked;
      };
      ack.addEventListener('change', syncAck);
      rangeSelect.addEventListener('change', () => {
        custom.hidden = rangeSelect.value !== 'custom';
        if (rangeSelect.value === 'custom') start.focus();
      });

      confirm.addEventListener('click', async () => {
        const range = rangeSelect.value;
        let bounds = null;

        if (range === 'custom') {
          if (!start.value || !end.value) {
            showToast('请选择开始和结束日期', 'error');
            return;
          }
          const startDate = parseDateInput(start.value);
          const endDate = parseDateInput(end.value);
          if (!startDate || !endDate) {
            showToast('日期格式无效', 'error');
            return;
          }
          if (startDate > endDate) {
            showToast('开始日期不能晚于结束日期', 'error');
            return;
          }
          if (startOfDay(endDate.getTime()) > startOfDay(Date.now())) {
            showToast('不能选择未来的日期', 'error');
            return;
          }
          bounds = {
            startTime: startOfDay(startDate.getTime()),
            endTime: Math.min(Date.now(), startOfNextDay(endDate.getTime()))
          };
          if (bounds.startTime >= bounds.endTime) {
            showToast('此范围内没有可清除的历史记录', 'info');
            return;
          }
        } else if (range !== 'all') {
          bounds = clearRangeBounds(range);
        }

        confirm.disabled = true;
        confirm.textContent = '正在清除…';

        try {
          if (range === 'all') await api.history.deleteAll();
          else await api.history.deleteRange(bounds);
          closeModal();
          resetHistoryData();
          state.loadedOnce = false;
          if (state.view === 'history') await loadHistoryReset();
          showToast('已清除历史记录', 'success');
        } catch (error) {
          console.error('Failed to clear history', error);
          showToast(`清除失败：${friendlyError(error)}`, 'error');
          confirm.disabled = false;
          confirm.textContent = '清除历史记录';
        }
      });
    }
  });
}

function clearRangeBounds(range) {
  if (['hour', 'today', '7d', '30d'].includes(range)) {
    return getRangeBounds(range);
  }
  return { startTime: 0, endTime: Date.now() };
}

/* ------------------------------------------------------------------ export */

function openExportDialog() {
  closeRowMenu();
  closeRangePopover();

  const body = `
    <p>把浏览历史导出到本地文件。文件只包含标题、网址、访问次数和最后访问时间，不包含 Cookie、缓存、密码或下载记录。</p>
    <div class="export-options">
      <label class="field-label"><span>导出范围</span>
        <select id="exportScope">
          <option value="all" selected>全部历史</option>
          <option value="current">当前搜索 / 时间筛选</option>
        </select>
      </label>
      <label class="field-label"><span>文件格式</span>
        <select id="exportFormat">
          <option value="csv" selected>CSV（Excel 可打开）</option>
          <option value="json">JSON</option>
        </select>
      </label>
    </div>
    <div class="modal-callout is-warning">
      ${icon('alert')}
      <span>导出的文件可能包含敏感浏览记录，请自行妥善保管。</span>
    </div>`;

  openModal({
    title: '导出浏览数据',
    bodyHtml: body,
    footerHtml: `
      <button class="btn btn-ghost" type="button" data-modal-close>取消</button>
      <button class="btn btn-primary" type="button" id="exportConfirm">导出</button>`,
    onMount(modal) {
      const scopeSelect = modal.querySelector('#exportScope');
      const formatSelect = modal.querySelector('#exportFormat');
      const confirm = modal.querySelector('#exportConfirm');

      confirm.addEventListener('click', async () => {
        const scope = scopeSelect.value;
        const format = formatSelect.value;
        confirm.disabled = true;
        confirm.textContent = '正在导出…';

        try {
          const items = await collectExportItems(scope, (count) => {
            confirm.textContent = `正在导出… ${formatCount(count)} 条`;
          });
          if (!items.length) {
            showToast('没有可导出的历史记录', 'error');
            confirm.disabled = false;
            confirm.textContent = '导出';
            return;
          }
          downloadExport(items, format, scope);
          closeModal();
          showToast(`已导出 ${formatCount(items.length)} 条历史记录`, 'success');
        } catch (error) {
          console.error('Failed to export history', error);
          showToast(`导出失败：${friendlyError(error)}`, 'error');
          confirm.disabled = false;
          confirm.textContent = '导出';
        }
      });
    }
  });
}

async function collectExportItems(scope = 'all', onProgress) {
  if (!api?.history) return [];
  const bounds = scope === 'current' ? historyBounds() : { startTime: 0, endTime: Date.now() };
  const text = scope === 'current' ? state.query.trim() : '';
  const seen = new Set();
  const items = [];
  let cursor = null;

  for (let page = 0; page < 200; page += 1) {
    const endTime = cursor == null ? bounds.endTime : Math.min(cursor + SEARCH_TIME_EPSILON, bounds.endTime);
    if (endTime <= bounds.startTime) break;

    const results = await api.history.search({
      text,
      startTime: bounds.startTime,
      endTime,
      maxResults: 1000
    });
    if (!Array.isArray(results) || !results.length) break;

    let oldest = Infinity;
    for (const raw of results) {
      if (!raw?.url) continue;
      const lastVisitTime = Number(raw.lastVisitTime) || 0;
      oldest = Math.min(oldest, lastVisitTime);
      if (lastVisitTime < bounds.startTime || lastVisitTime > bounds.endTime) continue;
      if (isOwnExtensionPage(raw.url)) continue;
      if (seen.has(raw.url)) continue;
      seen.add(raw.url);
      items.push({
        ...raw,
        title: normalizeTitle(raw.title, raw.url),
        lastVisitTime,
        visitCount: Number(raw.visitCount) || 1
      });
    }

    onProgress?.(items.length);
    if (results.length < 1000) break;
    if (!Number.isFinite(oldest) || oldest <= bounds.startTime) break;
    if (cursor != null && oldest >= cursor) break;
    cursor = oldest;
  }

  items.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  return items;
}

function downloadExport(items, format, scope) {
  const date = formatDateInput(Date.now());
  const scopeLabel = scope === 'current' ? '当前筛选' : '全部历史';
  const filename = `edge-history-${date}.${format}`;

  let content;
  let mime;
  if (format === 'json') {
    content = JSON.stringify({
      exportedAt: new Date().toISOString(),
      scope: scopeLabel,
      count: items.length,
      items: items.map((item) => ({
        title: item.title,
        url: item.url,
        visitCount: item.visitCount,
        lastVisitTime: new Date(item.lastVisitTime).toISOString(),
        lastVisitTimeMs: item.lastVisitTime
      }))
    }, null, 2);
    mime = 'application/json;charset=utf-8';
  } else {
    const rows = [
      ['标题', '网址', '访问次数', '最后访问时间'].map(csvCell).join(','),
      ...items.map((item) => [
        item.title,
        item.url,
        item.visitCount,
        new Date(item.lastVisitTime).toISOString()
      ].map(csvCell).join(','))
    ];
    content = `\uFEFF${rows.join('\r\n')}\r\n`;
    mime = 'text/csv;charset=utf-8';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

function csvCell(value) {
  let text = String(value ?? '');
  // Prevent spreadsheet formula injection in titles that start with = + - @.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/* ---------------------------------------------------------------- settings */

function openSettings() {
  closeRowMenu();
  closeRangePopover();

  const themeButton = (value, label, iconName) => `
    <button type="button" data-theme-value="${value}" class="${state.settings.theme === value ? 'is-active' : ''}">
      ${icon(iconName)}<span>${label}</span>
    </button>`;

  const switchButton = (key, label, checked) => `
    <button class="switch" type="button" role="switch" aria-checked="${checked}" aria-label="${escapeHtml(label)}" data-setting="${key}"></button>`;

  const mac = isMacPlatform();
  const shortcut = mac ? '⌥ + ⇧ + H' : 'Alt + H';
  const version = escapeHtml(getVersion());

  const body = `
    <section class="settings-section">
      <h3>外观</h3>
      <div class="setting-row">
        <div class="setting-copy"><strong>主题</strong><p>跟随系统，或固定为浅色 / 深色。</p></div>
        <div class="segmented" id="themeSegmented">
          ${themeButton('system', '跟随', 'monitor')}
          ${themeButton('light', '浅色', 'sun')}
          ${themeButton('dark', '深色', 'moon')}
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy"><strong>显示访问次数</strong><p>在记录右侧显示该网址的累计访问次数。</p></div>
        ${switchButton('showVisitCounts', '显示访问次数', state.settings.showVisitCounts)}
      </div>
      <div class="setting-row">
        <div class="setting-copy"><strong>合并重复页面</strong><p>同一页面仅有 #片段、常见跟踪参数、末尾斜杠或 www 差异时只显示一条；不同查询参数仍分开。</p></div>
        ${switchButton('mergeDuplicates', '合并重复页面', state.settings.mergeDuplicates)}
      </div>
      <div class="setting-row">
        <div class="setting-copy"><strong>在新标签页中打开</strong><p>点击历史记录时保留当前页面。也可以按住 Ctrl / ⌘ 临时在新标签页打开。</p></div>
        ${switchButton('openInNewTab', '在新标签页中打开', state.settings.openInNewTab)}
      </div>
    </section>

    <section class="settings-section">
      <h3>数据</h3>
      <div class="setting-row">
        <div class="setting-copy"><strong>清除浏览历史</strong><p>只清除历史记录，不影响 Cookie、缓存、下载或书签。</p></div>
        <button class="btn btn-ghost" type="button" id="settingsClear">清除…</button>
      </div>
      <div class="settings-note">
        此扩展不会上传任何数据，没有网络请求或分析统计。历史记录、最近关闭和同步标签页都直接读取 Chrome 的本地 API。
      </div>
    </section>

    <section class="settings-section">
      <h3>快捷键</h3>
      <div class="setting-row">
        <div class="setting-copy"><strong>打开完整历史记录</strong><p>当前快捷键：<code>${shortcut}</code>。Chrome 不允许扩展占用 Ctrl+H，可以在扩展快捷键页面修改。</p></div>
        <button class="btn btn-ghost" type="button" id="copyShortcutPath">复制设置地址</button>
      </div>
      <div class="settings-note">
        打开 <code>chrome://extensions/shortcuts</code>，找到“Edge 风格历史记录”即可自定义快捷键。
      </div>
    </section>

    <section class="settings-section">
      <h3>关于</h3>
      <div class="setting-row">
        <div class="setting-copy">
          <strong>Edge 风格历史记录</strong>
          <p>为 Chrome 带来按日期分组、搜索筛选和最近关闭等更顺手的浏览体验。</p>
          <div class="about-meta"><span>版本 ${version}</span><span>本地运行 · 无追踪</span></div>
        </div>
      </div>
      <div class="settings-note">
        受 Chrome 扩展权限限制，本扩展无法替换 <code>chrome://history</code> 或 Ctrl+H，也无法读取 Edge 的历史记录。跨设备标签页依赖 Chrome 同步。
      </div>
    </section>`;

  openModal({
    title: '设置',
    bodyHtml: body,
    wide: true,
    footerHtml: '<button class="btn btn-primary" type="button" data-modal-close>完成</button>',
    onMount(modal) {
      for (const button of modal.querySelectorAll('[data-theme-value]')) {
        button.addEventListener('click', () => setTheme(button.dataset.themeValue));
      }

      for (const button of modal.querySelectorAll('[data-setting]')) {
        button.addEventListener('click', () => {
          const key = button.dataset.setting;
          const value = button.getAttribute('aria-checked') !== 'true';
          button.setAttribute('aria-checked', String(value));
          state.settings[key] = value;
          saveSettings({ [key]: value });
          if (key === 'showVisitCounts') {
            renderHistory();
          }
          if (key === 'mergeDuplicates') {
            state.loadedOnce = false;
            if (state.view === 'history') loadHistoryReset();
          }
        });
      }

      modal.querySelector('#settingsClear')?.addEventListener('click', () => {
        closeModal();
        openClearDialog();
      });

      modal.querySelector('#copyShortcutPath')?.addEventListener('click', async () => {
        const copied = await copyText('chrome://extensions/shortcuts');
        showToast(
          copied ? '已复制快捷键设置地址' : '复制失败，请手动输入 chrome://extensions/shortcuts',
          copied ? 'success' : 'error'
        );
      });
    }
  });
}

/* ----------------------------------------------------------------- modals */

function openModal({ title, bodyHtml, footerHtml = '', wide = false, onMount, onClose }) {
  if (state.modalOpen) closeModal();
  state.modalPreviousFocus = document.activeElement;
  state.modalOnClose = onClose || null;
  state.modalOpen = true;

  el.modalLayer.innerHTML = `
    <div class="modal-backdrop" data-modal-close></div>
    <div class="modal${wide ? ' is-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <h2 id="modalTitle">${escapeHtml(title)}</h2>
        <button class="icon-btn" type="button" data-modal-close aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>`;
  el.modalLayer.hidden = false;
  document.body.classList.add('modal-open');
  window.requestAnimationFrame(() => el.modalLayer.classList.add('is-open'));

  onMount?.(el.modalLayer.querySelector('.modal'));

  window.requestAnimationFrame(() => {
    const modal = el.modalLayer.querySelector('.modal');
    if (!modal) return;
    const preferred = modal.querySelector(
      '[autofocus], .modal-body input:not([disabled]), .modal-body select:not([disabled]), .modal-footer .btn-ghost, .modal-footer .btn-primary:not([disabled]), .modal-head [data-modal-close]'
    );
    preferred?.focus();
  });
}

function closeModal() {
  if (!state.modalOpen) return;
  const onClose = state.modalOnClose;
  const previous = state.modalPreviousFocus;
  state.modalOpen = false;
  state.modalOnClose = null;
  state.modalPreviousFocus = null;

  el.modalLayer.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  const layer = el.modalLayer;
  window.setTimeout(() => {
    if (!state.modalOpen) {
      layer.hidden = true;
      layer.innerHTML = '';
    }
  }, 170);

  onClose?.();
  if (!state.modalOpen && previous?.isConnected) previous.focus();
}

function showConfirm({ title, message, note = '', confirmLabel = '删除', cancelLabel = '取消' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };

    openModal({
      title,
      bodyHtml: `
        <p>${escapeHtml(message)}</p>
        ${note ? `<div class="modal-callout is-warning">${icon('alert')}<span>${escapeHtml(note)}</span></div>` : ''}`,
      footerHtml: `
        <button class="btn btn-ghost" type="button" id="confirmCancel">${escapeHtml(cancelLabel)}</button>
        <button class="btn btn-danger" type="button" id="confirmOk">${escapeHtml(confirmLabel)}</button>`,
      onMount(modal) {
        modal.querySelector('#confirmCancel')?.addEventListener('click', () => finish(false));
        modal.querySelector('#confirmOk')?.addEventListener('click', () => finish(true));
      },
      onClose() {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }
    });
  });
}

/* ------------------------------------------------------------------ toast */

function showToast(message, type = 'info', duration = 2800) {
  if (!el?.toastRegion) return;
  const toast = document.createElement('div');
  toast.className = `toast is-${type}`;
  const iconName = type === 'success' ? 'circle-check' : type === 'error' ? 'alert' : 'info';
  toast.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span>`;
  el.toastRegion.appendChild(toast);

  while (el.toastRegion.children.length > 4) {
    el.toastRegion.firstElementChild?.remove();
  }

  window.requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 220);
  }, duration);
}

function announce(message) {
  if (!el?.ariaStatus) return;
  el.ariaStatus.textContent = '';
  window.setTimeout(() => {
    el.ariaStatus.textContent = message;
  }, 30);
}

/* ----------------------------------------------------------------- events */

function bindEvents() {
  for (const button of document.querySelectorAll('.nav-item[data-view]')) {
    button.addEventListener('click', () => switchView(button.dataset.view));
  }

  el.themeBtn.addEventListener('click', toggleTheme);
  el.settingsBtn.addEventListener('click', openSettings);

  el.selectBtn.addEventListener('click', toggleSelectMode);
  el.exportBtn.addEventListener('click', openExportDialog);
  el.clearBtn.addEventListener('click', openClearDialog);
  el.refreshBtn.addEventListener('click', () => {
    if (state.view === 'closed') loadClosed(true);
    else if (state.view === 'devices') loadDevices(true);
  });

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
        visibleRowTitles()[0]?.click();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (el.searchInput.value) clearSearch();
      else el.searchInput.blur();
      return;
    }

    if (event.key === 'ArrowDown') {
      const root = state.view === 'history'
        ? el.historyList
        : state.view === 'closed'
          ? el.closedList
          : el.devicesList;
      const first = state.view === 'history'
        ? visibleRowTitles()[0]
        : root?.querySelector('a[href], [data-open-url]');
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  el.searchClear.addEventListener('click', () => clearSearch());

  el.rangeBtn.addEventListener('click', () => toggleRangePopover());
  for (const button of el.rangePopover.querySelectorAll('[data-range]')) {
    button.addEventListener('click', () => {
      const range = button.dataset.range;
      if (range === 'custom') {
        el.customRange.hidden = false;
        el.customRangeBtn.setAttribute('aria-expanded', 'true');
        fillCustomDates();
        el.startDate.focus();
        return;
      }
      applyRange(range);
    });
  }
  el.applyRange.addEventListener('click', applyCustomRange);

  el.dismissWelcome.addEventListener('click', dismissWelcome);
  el.closeWelcome.addEventListener('click', dismissWelcome);

  el.historyList.addEventListener('click', onHistoryClick);
  el.historyList.addEventListener('change', onHistoryChange);
  el.listFooter.addEventListener('click', onFooterClick);
  el.closedList.addEventListener('click', onClosedClick);
  el.devicesList.addEventListener('click', onDevicesClick);

  el.selectAllBtn.addEventListener('click', toggleSelectAll);
  el.clearSelectionBtn.addEventListener('click', () => {
    state.selected.clear();
    updateAllSelectionVisuals();
    updateBulkBar();
  });
  el.bulkDeleteBtn.addEventListener('click', deleteSelected);
  el.exitSelectBtn.addEventListener('click', exitSelectMode);

  el.rowMenu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-action]');
    if (!button) return;
    const action = button.dataset.menuAction;
    if (action) onRowMenuAction(action);
  });

  el.rowMenu.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...el.rowMenu.querySelectorAll('.context-item')];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else next = (index - 1 + items.length) % items.length;
    items[next].focus();
  });

  el.rowMenu.addEventListener('focusout', (event) => {
    if (!el.rowMenu.hidden && !el.rowMenu.contains(event.relatedTarget)) {
      closeRowMenu();
    }
  });

  el.modalLayer.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) {
      closeModal();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!el.rowMenu.hidden
      && !el.rowMenu.contains(event.target)
      && !event.target.closest('[data-role="menu"]')) {
      closeRowMenu();
    }
    if (!el.rangePopover.hidden
      && !el.rangePopover.contains(event.target)
      && !el.rangeBtn.contains(event.target)) {
      closeRangePopover();
    }
  }, true);

  document.addEventListener('keydown', onDocumentKeydown);

  document.addEventListener('focusin', (event) => {
    if (!el.rowMenu.hidden
      && !el.rowMenu.contains(event.target)
      && !event.target.closest('[data-role="menu"]')) {
      closeRowMenu();
    }
  });

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.classList.contains('favicon-img')) return;
    image.closest('.favicon-tile')?.classList.add('is-fallback');
  }, true);

  el.content.addEventListener('scroll', () => {
    if (state.view === 'history') state.historyScrollTop = el.content.scrollTop;
    if (!el.rowMenu.hidden) closeRowMenu();
  }, { passive: true });

  window.addEventListener('resize', () => {
    closeRowMenu();
    closeRangePopover();
  });
}

function onHistoryClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === 'toggle-group') {
      const key = actionButton.dataset.groupKey;
      const group = actionButton.closest('.history-group');
      const body = group?.querySelector('.group-body');
      if (!group || !body) return;
      const collapsed = !state.collapsed.has(key);
      if (collapsed) state.collapsed.add(key);
      else state.collapsed.delete(key);
      group.classList.toggle('is-collapsed', collapsed);
      body.hidden = collapsed;
      actionButton.setAttribute('aria-expanded', String(!collapsed));
      const count = body.querySelectorAll('.history-row').length;
      group.style.containIntrinsicSize = `auto ${collapsed ? 43 : count * 56 + 43}px`;
      return;
    }
    if (action === 'clear-search') {
      clearSearch();
      return;
    }
    if (action === 'show-all') {
      applyRange('all');
      return;
    }
    if (action === 'retry-history') {
      loadHistoryReset();
      return;
    }
    return;
  }

  const row = event.target.closest('.history-row');
  if (!row) return;
  const id = Number(row.dataset.id);
  const item = itemIndex.get(id);
  if (!item) return;

  if (event.target.closest('[data-role="menu"]')) {
    event.preventDefault();
    openRowMenu(id, event.target.closest('[data-role="menu"]'));
    return;
  }

  if (event.target.closest('.row-check') || event.target.closest('input')) return;

  const link = event.target.closest('[data-role="open"]');

  if (state.selectMode) {
    if (link) event.preventDefault();
    setSelection(id, !state.selected.has(id));
    return;
  }

  if (link) {
    event.preventDefault();
    event.stopPropagation();
    openHistoryItem(item, {
      forceNewTab: event.metaKey || event.ctrlKey || event.shiftKey
    });
    return;
  }

  if (window.getSelection()?.toString()) return;
  openHistoryItem(item, {
    forceNewTab: event.metaKey || event.ctrlKey || event.shiftKey
  });
}

function onHistoryChange(event) {
  const checkbox = event.target.closest('input[data-role="check"]');
  if (!checkbox) return;
  const row = checkbox.closest('.history-row');
  if (!row) return;
  const checked = checkbox.checked;
  if (!state.selectMode) enterSelectMode({ keepSelection: true });
  setSelection(Number(row.dataset.id), checked);
}

function onFooterClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'load-more') loadHistoryMore();
  if (button.dataset.action === 'retry-history') loadHistoryMore();
}

function onClosedClick(event) {
  const clear = event.target.closest('[data-action="clear-search"]');
  if (clear) {
    clearSearch();
    return;
  }

  const refresh = event.target.closest('[data-action="refresh-closed"]');
  if (refresh) {
    loadClosed(true);
    return;
  }

  const restore = event.target.closest('[data-action="restore"]');
  if (restore) {
    restoreSession(Number(restore.dataset.sessionIndex));
    return;
  }

  const link = event.target.closest('[data-open-url]');
  if (link) {
    event.preventDefault();
    openNewTab(link.dataset.openUrl);
  }
}

async function onDevicesClick(event) {
  const clear = event.target.closest('[data-action="clear-search"]');
  if (clear) {
    clearSearch();
    return;
  }

  const sync = event.target.closest('[data-action="open-sync-settings"]');
  if (sync) {
    try {
      await api.tabs.create({ url: 'chrome://settings/syncSetup' });
    } catch (error) {
      console.error('Failed to open Chrome sync settings', error);
      const copied = await copyText('chrome://settings/syncSetup');
      showToast(
        copied ? '已复制同步设置地址，请在地址栏打开' : '请在地址栏打开 chrome://settings/syncSetup',
        copied ? 'info' : 'error'
      );
    }
    return;
  }

  const refresh = event.target.closest('[data-action="refresh-devices"]');
  if (refresh) {
    loadDevices(true);
    return;
  }

  const link = event.target.closest('[data-open-url]');
  if (link) {
    event.preventDefault();
    openNewTab(link.dataset.openUrl);
  }
}

function onDocumentKeydown(event) {
  if (state.modalOpen) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key === 'Tab') {
      trapModalFocus(event);
    }
    return;
  }

  if (event.key === 'Escape') {
    if (!el.rowMenu.hidden) {
      event.preventDefault();
      closeRowMenu({ restoreFocus: true });
      return;
    }
    if (!el.rangePopover.hidden) {
      event.preventDefault();
      closeRangePopover({ restoreFocus: true });
      return;
    }
    if (state.selectMode) {
      event.preventDefault();
      exitSelectMode();
      return;
    }
    if (document.activeElement === el.searchInput) {
      el.searchInput.blur();
    }
    return;
  }

  if (event.key === '/' && !isEditableTarget(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    el.searchInput.focus();
    el.searchInput.select();
    return;
  }

  if (state.view !== 'history') return;

  if (state.selectMode
    && (event.key === 'Delete' || event.key === 'Backspace')
    && !isEditableTarget(event.target)
    && state.selected.size) {
    event.preventDefault();
    deleteSelected();
    return;
  }

  if (state.selectMode
    && (event.metaKey || event.ctrlKey)
    && event.key.toLowerCase() === 'a'
    && !isEditableTarget(event.target)) {
    event.preventDefault();
    toggleSelectAll();
    return;
  }

  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp')
    && !isEditableTarget(event.target)
    && !el.historyView.hidden) {
    const titles = visibleRowTitles();
    if (!titles.length) return;
    const index = titles.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown'
      ? titles[Math.min(titles.length - 1, index + 1)]
      : titles[Math.max(0, index - 1)];
    next?.focus();
  }
}

function trapModalFocus(event) {
  const modal = el.modalLayer.querySelector('.modal');
  if (!modal) return;
  const focusable = [...modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )].filter((node) => node.offsetParent !== null);

  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !modal.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !modal.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

/* ------------------------------------------------------------------ open */

async function openHistoryItem(item, { forceNewTab = false } = {}) {
  if (!item) return;
  if (!canOpenUrl(item.url)) {
    showToast('Chrome 不允许扩展直接打开此类型的页面，可以复制链接后在地址栏打开', 'error');
    return;
  }

  if (forceNewTab || state.settings.openInNewTab) {
    await openNewTab(item.url);
    return;
  }

  try {
    window.location.assign(item.url);
  } catch {
    await openNewTab(item.url);
  }
}

async function openNewTab(url) {
  if (!canOpenUrl(url)) {
    showToast('Chrome 不允许扩展直接打开此类型的页面', 'error');
    return;
  }

  try {
    await api.tabs.create({ url });
  } catch (error) {
    console.error('Failed to open URL', error);
    showToast(`无法打开页面：${friendlyError(error)}`, 'error');
  }
}

/* ----------------------------------------------------------------- utils */

function hrefFor(url) {
  return canOpenUrl(url) ? escapeHtml(url) : '#';
}

function displayUrl(url) {
  const { host, rest } = urlParts(url);
  if (!host) return url;
  return `${host}${rest || ''}`;
}

function updateRefreshButton() {
  if (!el) return;
  const loading = state.view === 'closed' ? state.closedLoading : state.devicesLoading;
  const label = el.refreshBtn.querySelector('span');
  if (label) label.textContent = loading ? '刷新中…' : '刷新';
  el.refreshBtn.disabled = loading;
}

function friendlyError(error) {
  const message = String(error?.message || error || '未知错误');
  if (/cannot be found|no tab with id/i.test(message)) return '页面可能已经被关闭';
  if (/not available|not enabled|sync/i.test(message)) return 'Chrome 同步或会话功能当前不可用';
  return message.length > 150 ? `${message.slice(0, 150)}…` : message;
}

function updateSidebarShortcut() {
  if (!isMacPlatform()) return;
  const keys = el.shortcutCard.querySelector('.shortcut-keys');
  if (keys) {
    keys.innerHTML = '<kbd>⌥</kbd><span>+</span><kbd>⇧</kbd><kbd>H</kbd>';
    if (el.welcomeShortcut) {
      el.welcomeShortcut.innerHTML = '<kbd>⌥</kbd> + <kbd>⇧</kbd> + <kbd>H</kbd>';
    }
  }
  el.shortcutCard.title = 'Option + Shift + H，可在 chrome://extensions/shortcuts 中修改';
}

function isMacPlatform() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || '')
    || /Macintosh/i.test(navigator.userAgent);
}
