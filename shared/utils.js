/**
 * Small, dependency-free helpers shared by the full history page and popup.
 * Everything runs locally; there is no network access anywhere in the UI.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export const DEFAULT_SETTINGS = {
  theme: 'system',
  showVisitCounts: true,
  openInNewTab: false,
  pageSize: 100,
  mergeDuplicates: true,
  welcomeDismissed: false
};

export const TRANSITION_LABELS = {
  link: '点击链接',
  typed: '地址栏输入',
  auto_bookmark: '书签',
  auto_subframe: '子框架',
  manual_subframe: '手动子框架',
  generated: '自动跳转',
  auto_toplevel: '自动打开',
  form_submit: '表单提交',
  reload: '重新加载',
  keyword: '搜索关键字',
  keyword_generated: '关键字跳转'
};

export function getChromeApi() {
  return globalThis.__demoChrome || globalThis.chrome;
}

export function isDemo() {
  return Boolean(globalThis.__demoChrome);
}

/**
 * Chrome records visits to extension pages as ordinary history entries. Without
 * this guard the history UI would list (and search) its own pages, making the
 * first rows of every visit look like browsing history.
 */
export function isOwnExtensionPage(url) {
  if (isDemo()) return false;
  try {
    const base = getChromeApi().runtime.getURL('');
    return base.startsWith('chrome-extension://') && String(url || '').startsWith(base);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ text */

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/**
 * Escapes text and wraps every search token with <mark>. Tokens are matched
 * case-insensitively without regexes, so arbitrary user input stays safe.
 */
export function highlight(text, query) {
  const source = String(text ?? '');
  const tokens = [...new Set(
    String(query || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
  )].sort((a, b) => b.length - a.length);

  if (!tokens.length) return escapeHtml(source);

  const lower = source.toLocaleLowerCase();
  const ranges = [];
  let cursor = 0;

  while (cursor < source.length) {
    let bestPos = -1;
    let bestToken = '';
    for (const token of tokens) {
      const pos = lower.indexOf(token.toLocaleLowerCase(), cursor);
      if (pos === -1) continue;
      if (bestPos === -1 || pos < bestPos || (pos === bestPos && token.length > bestToken.length)) {
        bestPos = pos;
        bestToken = token;
      }
    }
    if (bestPos === -1) break;
    ranges.push([bestPos, bestPos + bestToken.length]);
    cursor = bestPos + Math.max(1, bestToken.length);
  }

  let html = '';
  let index = 0;
  for (const [start, end] of ranges) {
    html += escapeHtml(source.slice(index, start));
    html += `<mark>${escapeHtml(source.slice(start, end))}</mark>`;
    index = end;
  }
  return html + escapeHtml(source.slice(index));
}

export function normalizeTitle(title, url) {
  const clean = String(title || '').trim();
  return clean || String(url || '');
}

export function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/* -------------------------------------------------------------------- url */

export function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function canOpenUrl(url) {
  const parsed = parseUrl(url);
  return Boolean(parsed && ['http:', 'https:', 'file:', 'ftp:'].includes(parsed.protocol));
}

export function isHttpUrl(url) {
  const parsed = parseUrl(url);
  return Boolean(parsed && ['http:', 'https:'].includes(parsed.protocol));
}

export function siteKeyOf(url) {
  const parsed = parseUrl(url);
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return '';
  return parsed.hostname.toLowerCase();
}

export function siteLabelOf(url) {
  return siteKeyOf(url).replace(/^www\./, '');
}

/**
 * Split a URL into a compact host and the rest for a two-tone display.
 * Handles chrome:// and file:// pages without throwing.
 */
const TRACKING_PARAMS = /^(?:utm_[a-z0-9_]+|fbclid|gclid|yclid|msclkid|mc_cid|mc_eid|igshid|si|spm|scm|vd_source|share_source|share_medium)$/i;

/**
 * Best-effort identity for "the same page" in history. Chrome stores one entry
 * per distinct URL, so the same page can otherwise appear once per fragment,
 * common tracking parameter, trailing slash, or www host. Query parameters are
 * preserved (apart from known tracking keys) because they often select real
 * content.
 */
export function canonicalHistoryUrl(url) {
  try {
    const parsed = new URL(String(url));
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '');
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    }
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    return parsed.href;
  } catch {
    return String(url || '');
  }
}

export function urlParts(url) {
  const parsed = parseUrl(url);
  if (!parsed) return { host: String(url || ''), rest: '' };

  if (parsed.protocol === 'file:') {
    return { host: '本地文件', rest: safeDecode(parsed.pathname) };
  }

  const rest = (parsed.pathname === '/' ? '' : parsed.pathname) + parsed.search + parsed.hash;

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return { host: parsed.hostname.replace(/^www\./, ''), rest: safeDecode(rest) };
  }

  const host = parsed.hostname
    ? `${parsed.protocol}//${parsed.hostname}`
    : parsed.protocol;
  return { host, rest: safeDecode(rest) };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function faviconUrl(url, size = 32) {
  if (!url) return '';
  if (globalThis.__demoChrome) return '';
  try {
    return chrome.runtime.getURL(
      `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`
    );
  } catch {
    return '';
  }
}

const TILE_COLORS = [
  ['#e7f0fb', '#0f5c9e'],
  ['#f0eafa', '#6b3fa0'],
  ['#e8f6ee', '#146c43'],
  ['#fff1e6', '#a34b00'],
  ['#fdecec', '#a4262c'],
  ['#e6f5f8', '#066a7a'],
  ['#f3f0e6', '#6b5a13'],
  ['#eef0f5', '#3b4a63']
];

export function hashString(value) {
  let hash = 0;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function tileStyle(seed) {
  const [background, color] = TILE_COLORS[hashString(seed) % TILE_COLORS.length];
  return `--tile-bg:${background};--tile-fg:${color};`;
}

export function letterFor(url, title = '') {
  const source = String(title || '').trim() || siteLabelOf(url) || String(url || '');
  const first = Array.from(source)[0] || '?';
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

/* ------------------------------------------------------------------- time */

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function startOfDay(value = Date.now()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function startOfNextDay(value = Date.now()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function addDays(value = Date.now(), days = 0) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function endOfDay(value = Date.now()) {
  // Inclusive end for display purposes; use startOfNextDay for exclusive
  // chrome.history query bounds.
  return startOfNextDay(value) - 1;
}

export function dateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTime(value) {
  return timeFormatter.format(new Date(value));
}

export function formatFullDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${formatTime(value)}`;
}

export function formatDay(value) {
  const date = new Date(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * Chrome session timestamps have appeared in both seconds and milliseconds
 * across versions. Normalise conservatively: anything before 2001 in ms is
 * almost certainly a seconds value.
 */
export function toMillis(value) {
  const timestamp = Number(value) || 0;
  return timestamp > 0 && timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

export function formatDateHeader(value, now = Date.now()) {
  const date = new Date(value);
  const today = startOfDay(now);
  const day = startOfDay(value);
  if (day === today) return '今天';
  if (day === startOfDay(addDays(now, -1))) return '昨天';

  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const prefix = sameYear ? '' : `${date.getFullYear()}年`;
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}

export function relativeTime(value, now = Date.now()) {
  if (!value) return '';
  const diff = Math.max(0, now - value);
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;

  const day = startOfDay(value);
  const today = startOfDay(now);
  if (day === today) return `今天 ${formatTime(value)}`;
  if (day === startOfDay(addDays(now, -1))) return `昨天 ${formatTime(value)}`;
  if (Math.round((today - day) / DAY_MS) < 7) return `${WEEKDAYS[new Date(value).getDay()]} ${formatTime(value)}`;

  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return `${sameYear ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatDateInput(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatRangeLabel(range, custom = {}) {
  switch (range) {
    case 'hour': return '最近 1 小时';
    case '24h': return '最近 24 小时';
    case 'today': return '今天';
    case 'yesterday': return '昨天';
    case '7d': return '最近 7 天';
    case '30d': return '最近 30 天';
    case 'custom': {
      const start = custom.start ? parseDateInput(custom.start) : null;
      const end = custom.end ? parseDateInput(custom.end) : null;
      if (!start && !end) return '自定义范围';
      const startText = start ? `${start.getMonth() + 1}/${start.getDate()}` : '最早';
      const endText = end ? `${end.getMonth() + 1}/${end.getDate()}` : '现在';
      return `${startText} – ${endText}`;
    }
    default: return '全部时间';
  }
}

export function parseDateInput(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getRangeBounds(range, custom = {}, now = Date.now()) {
  const today = startOfDay(now);
  switch (range) {
    case 'hour':
      return { startTime: now - 60 * 60 * 1000, endTime: now };
    case '24h':
      return { startTime: now - 24 * 60 * 60 * 1000, endTime: now };
    case 'today':
      return { startTime: today, endTime: now };
    case 'yesterday':
      return { startTime: startOfDay(addDays(now, -1)), endTime: today };
    case '7d':
      return { startTime: startOfDay(addDays(now, -6)), endTime: now };
    case '30d':
      return { startTime: startOfDay(addDays(now, -29)), endTime: now };
    case 'custom': {
      const start = parseDateInput(custom.start);
      const end = parseDateInput(custom.end);
      if (!start && !end) return { startTime: 0, endTime: now };
      const startTime = start ? start.getTime() : 0;
      const endTime = end ? Math.min(now, startOfNextDay(end)) : now;
      if (startTime >= endTime) return { startTime: 0, endTime: 0 };
      return { startTime, endTime };
    }
    default:
      return { startTime: 0, endTime: now };
  }
}

/* ------------------------------------------------------------------ misc */

export function debounce(fn, wait = 200) {
  let timer = 0;
  const debounced = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => window.clearTimeout(timer);
  return debounced;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const COUNT_FORMATTER = new Intl.NumberFormat('zh-CN');

export function formatCount(value) {
  return COUNT_FORMATTER.format(Number(value) || 0);
}

export function pluralTabs(count) {
  return `${formatCount(count)} 个标签页`;
}

export function transitionLabel(transition) {
  return TRANSITION_LABELS[transition] || transition || '访问';
}

export function groupItemsByDate(items) {
  const groups = [];
  const byKey = new Map();

  for (const item of items) {
    const key = dateKey(item.lastVisitTime);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        timestamp: startOfDay(item.lastVisitTime),
        label: formatDateHeader(item.lastVisitTime),
        items: []
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts where the async clipboard API is unavailable.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export async function getSettings() {
  const api = getChromeApi();
  try {
    const stored = await api.storage.local.get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch) {
  const api = getChromeApi();
  try {
    await api.storage.local.set(patch);
  } catch {
    // Settings are non-critical; the in-memory state still applies.
  }
}

export function getVersion() {
  try {
    return getChromeApi().runtime.getManifest().version;
  } catch {
    return '1.0.0';
  }
}

/** Opens (or focuses) the full history page from the popup. */
export async function focusOrOpenHistory(suffix = '') {
  const api = getChromeApi();
  const base = api.runtime.getURL('history.html');

  try {
    if (api.runtime.getContexts) {
      const contexts = await api.runtime.getContexts({ contextTypes: ['TAB'] });
      const existing = contexts.find((context) =>
        (context.documentUrl || '').startsWith(base)
      );
      if (existing && existing.tabId >= 0) {
        await api.tabs.update(existing.tabId, { active: true });
        if (existing.windowId && existing.windowId !== api.windows.WINDOW_ID_NONE) {
          await api.windows.update(existing.windowId, { focused: true });
        }
        return;
      }
    }
  } catch {
    // Fall back to opening a fresh tab.
  }

  await api.tabs.create({ url: `${base}${suffix}` });
}

/** Resolve a theme preference to the concrete light/dark mode. */
export function resolveTheme(theme, prefersDark) {
  if (theme === 'light' || theme === 'dark') return theme;
  return prefersDark ? 'dark' : 'light';
}
