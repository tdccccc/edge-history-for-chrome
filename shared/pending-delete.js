/**
 * Delayed deletion ("delete protection") for the full history page.
 *
 * Chrome's history API has no restore/undo: once deleteUrl runs, the visits
 * are gone. So a delete is never executed immediately. Instead the rows are
 * hidden, a snapshot of each row is kept in a pending queue, and the real
 * deleteUrl calls only run after a 30-second window in which the user can
 * undo. The queue is persisted to chrome.storage.local so a close/refresh
 * inside the window does not silently lose it: on the next open, entries
 * whose window has already expired are executed, and entries whose window
 * has not expired are cancelled (their rows are simply reloaded from
 * Chrome history, which was never touched).
 *
 * This module is pure except for the small storage helpers at the bottom,
 * which follow the same storage access pattern as shared/settings.js so
 * they work in the real extension, in demo mode, and in unit tests that
 * install a fake globalThis.chrome.
 */

export const PENDING_DELETE_WINDOW_MS = 30000;
export const PENDING_DELETE_STORAGE_KEY = 'edgeHistoryPendingDeletes';
export const PENDING_DELETE_VERSION = 1;

function getApi() {
  return globalThis.__demoChrome || globalThis.chrome;
}

function cloneItem(item) {
  if (!item || typeof item !== 'object') return null;
  const mergedUrls = [...new Set([
    ...(Array.isArray(item.mergedUrls) ? item.mergedUrls : []),
    item.url
  ].filter((url) => typeof url === 'string' && url))];
  if (!mergedUrls.length) return null;
  return { ...item, mergedUrls };
}

function uniqueUrls(urls) {
  return [...new Set((Array.isArray(urls) ? urls : []).filter((url) => typeof url === 'string' && url))];
}

function makeId(now) {
  return `pending-${now}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

/**
 * Build a pending delete from snapshots of the rows being removed.
 * entries: [{ item, index }] where index is the row's position in the
 * current list, used to restore it to (approximately) its original place.
 */
export function createPendingDelete({ id, entries = [], urls = null, now = Date.now(), windowMs = PENDING_DELETE_WINDOW_MS } = {}) {
  const snapshots = [];
  const collectedUrls = [];
  for (const entry of entries) {
    const item = cloneItem(entry?.item);
    if (!item?.url) continue;
    snapshots.push({
      index: Number.isFinite(entry?.index) ? entry.index : snapshots.length,
      item
    });
    collectedUrls.push(...item.mergedUrls);
  }
  const allUrls = uniqueUrls(urls ?? collectedUrls);
  if (!allUrls.length) return null;
  const createdAt = Number.isFinite(now) ? now : Date.now();
  return {
    id: typeof id === 'string' && id ? id : makeId(createdAt),
    version: PENDING_DELETE_VERSION,
    createdAt,
    executeAt: createdAt + (Number.isFinite(windowMs) ? windowMs : PENDING_DELETE_WINDOW_MS),
    urls: allUrls,
    items: snapshots
  };
}

export function isPendingDeleteDue(pending, now = Date.now()) {
  return Boolean(pending) && Number.isFinite(pending.executeAt) && now >= pending.executeAt;
}

/** Drop malformed entries (e.g. from a corrupt or hand-edited store). */
export function normalizePendingDeletes(value) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set();
  const result = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    if (typeof raw.id !== 'string' || !raw.id || seenIds.has(raw.id)) continue;
    if (!Number.isFinite(raw.createdAt) || !Number.isFinite(raw.executeAt)) continue;
    const urls = uniqueUrls(raw.urls);
    if (!urls.length) continue;
    const items = [];
    for (const entry of Array.isArray(raw.items) ? raw.items : []) {
      const item = cloneItem(entry?.item);
      if (!item?.url) continue;
      items.push({
        index: Number.isFinite(entry?.index) ? entry.index : items.length,
        item
      });
    }
    // items may be empty for a site delete whose collected URLs were not
    // loaded as rows; the URLs alone are enough to execute or cancel it.
    seenIds.add(raw.id);
    result.push({
      id: raw.id,
      version: PENDING_DELETE_VERSION,
      createdAt: raw.createdAt,
      executeAt: raw.executeAt,
      urls,
      items
    });
  }
  return result.sort((a, b) => a.executeAt - b.executeAt);
}

export function partitionPendingDeletes(list, now = Date.now()) {
  const normalized = normalizePendingDeletes(list);
  return {
    due: normalized.filter((pending) => isPendingDeleteDue(pending, now)),
    remaining: normalized.filter((pending) => !isPendingDeleteDue(pending, now))
  };
}

export function removePendingDelete(list, id) {
  return normalizePendingDeletes(list).filter((pending) => pending.id !== id);
}

export function pendingDeleteUrls(list) {
  return new Set(normalizePendingDeletes(list).flatMap((pending) => pending.urls));
}

/**
 * Restore snapshots into the current list. Rows already present (by _id or
 * URL) are skipped so a restore can never duplicate a row. The list is
 * re-sorted by lastVisitTime afterwards, which matches the order the page
 * normally renders in.
 */
export function restorePendingItems(currentItems, pending) {
  const items = Array.isArray(currentItems) ? [...currentItems] : [];
  const presentIds = new Set(items.map((item) => item?._id));
  const presentUrls = new Set(items.flatMap((item) => item?.mergedUrls || (item?.url ? [item.url] : [])));
  const snapshots = [...(pending?.items || [])].sort((a, b) => a.index - b.index);
  for (const snapshot of snapshots) {
    const item = cloneItem(snapshot?.item);
    if (!item?.url) continue;
    if (presentIds.has(item._id) || presentUrls.has(item.url)) continue;
    const at = Math.max(0, Math.min(Number.isFinite(snapshot.index) ? snapshot.index : items.length, items.length));
    items.splice(at, 0, item);
    presentIds.add(item._id);
    for (const url of item.mergedUrls) presentUrls.add(url);
  }
  items.sort((a, b) => (Number(b.lastVisitTime) || 0) - (Number(a.lastVisitTime) || 0));
  return items;
}

/* ------------------------------------------------------------ persistence */

/** Load the persisted queue; a missing/broken store reads as empty. */
export async function loadPendingDeletes() {
  const local = getApi()?.storage?.local;
  if (!local?.get) return [];
  try {
    const result = await local.get({ [PENDING_DELETE_STORAGE_KEY]: [] });
    return normalizePendingDeletes(result?.[PENDING_DELETE_STORAGE_KEY]);
  } catch {
    return [];
  }
}

/** Persist the queue (best-effort: a failed write must not break the page). */
export async function savePendingDeletes(list) {
  const local = getApi()?.storage?.local;
  if (!local?.set) return false;
  try {
    await local.set({ [PENDING_DELETE_STORAGE_KEY]: normalizePendingDeletes(list) });
    return true;
  } catch {
    return false;
  }
}

export async function clearPendingDeletes() {
  return savePendingDeletes([]);
}
