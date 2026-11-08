/**
 * Small, dependency-free helpers shared by the full history page and popup.
 * Everything runs locally; there is no network access anywhere in the UI.
 */

import { getLocale, t } from './i18n.js';

export {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  ensureSettings,
  getSettings,
  loadSettings,
  saveSettings,
  watchSettings
} from './settings.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

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
/**
 * Stable identity for "the same page" in history. Chrome stores one entry per
 * distinct URL, so pages with the same title and path can otherwise appear once
 * per query string, fragment, trailing slash, or trailing numeric id
 * (/topic/123/21 vs /topic/123/22). Keep the host and title in the key so
 * unrelated pages with a generic title are not collapsed together.
 */
export function historyItemKey(title, url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return `${String(title || '').trim().toLocaleLowerCase()}\u0000${String(url || '')}`;
  }

  let path = parsed.pathname.replace(/\/+$/, '') || '/';
  // /topic/2971299/21 and /topic/2971299/23 are the same thread; collapse
  // the trailing post id only when the preceding segment is numeric too, so
  // an id-bearing path such as /zh/apps/6474233312 keeps its identity.
  path = path.replace(/\/(\d+)\/\d+$/, '/$1') || '/';

  const host = ['http:', 'https:'].includes(parsed.protocol)
    ? parsed.hostname.toLocaleLowerCase().replace(/^www\./, '')
    : `${parsed.protocol}//${parsed.hostname}`;
  const label = String(title || '').trim().toLocaleLowerCase();
  return `${host}\u0000${label}\u0000${path}`;
}

export function urlParts(url) {
  const parsed = parseUrl(url);
  if (!parsed) return { host: String(url || ''), rest: '' };

  if (parsed.protocol === 'file:') {
    return { host: t('url.localFile'), rest: safeDecode(parsed.pathname) };
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

const formatterCache = new Map();

function getFormatter(kind, options) {
  const locale = getLocale();
  const key = `${kind}:${locale}:${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (formatter) return formatter;

  if (kind === 'number') formatter = new Intl.NumberFormat(locale, options);
  else if (kind === 'relative') formatter = new Intl.RelativeTimeFormat(locale, options);
  else formatter = new Intl.DateTimeFormat(locale, options);

  formatterCache.set(key, formatter);
  return formatter;
}

function dateFormat(options) {
  return getFormatter('date', options);
}

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
  return dateFormat({ hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatFullDate(value) {
  return dateFormat({ dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatDay(value) {
  return dateFormat({ dateStyle: 'long' }).format(new Date(value));
}

function formatShortDate(value) {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return dateFormat({
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  }).format(date);
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
  if (day === today) return t('time.today');
  if (day === startOfDay(addDays(now, -1))) return t('time.yesterday');

  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return dateFormat({
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  }).format(date);
}

export function relativeTime(value, now = Date.now()) {
  if (!value) return '';
  const diff = Math.max(0, now - value);
  if (diff < 60 * 1000) return t('time.justNow');
  if (diff < 60 * 60 * 1000) {
    return getFormatter('relative', { numeric: 'auto', style: 'long' })
      .format(-Math.floor(diff / 60000), 'minute');
  }

  const day = startOfDay(value);
  const today = startOfDay(now);
  if (day === today) return t('time.todayAt', { time: formatTime(value) });
  if (day === startOfDay(addDays(now, -1))) return t('time.yesterdayAt', { time: formatTime(value) });
  if (Math.round((today - day) / DAY_MS) < 7) {
    const weekday = dateFormat({ weekday: 'long' }).format(new Date(value));
    return `${weekday} ${formatTime(value)}`;
  }

  return formatShortDate(value);
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
    case 'hour': return t('range.hour');
    case '24h': return t('range.24h');
    case 'today': return t('range.today');
    case 'yesterday': return t('range.yesterday');
    case '7d': return t('range.7d');
    case '30d': return t('range.30d');
    case 'custom': {
      const start = custom.start ? parseDateInput(custom.start) : null;
      const end = custom.end ? parseDateInput(custom.end) : null;
      if (!start && !end) return t('range.custom');
      const startText = start ? formatShortDate(start.getTime()) : t('range.earliest');
      const endText = end ? formatShortDate(end.getTime()) : t('range.now');
      return `${startText} – ${endText}`;
    }
    default: return t('range.all');
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

export function formatCount(value) {
  return getFormatter('number', {}).format(Number(value) || 0);
}

export function pluralTabs(count) {
  return t('count.tabs', { count });
}

export function transitionLabel(transition) {
  const key = `transition.${transition}`;
  const label = t(key);
  return label === key ? (transition || t('common.visit')) : label;
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
