/**
 * Pagination helper for chrome.history.search.
 *
 * Chrome has no offset parameter: pages are requested with an exclusive
 * endTime cursor. When more than one page of results shares the exact same
 * lastVisitTime (history imports, bulk addUrl calls, tied visits), a normal
 * cursor gets stuck on that timestamp. Detect that case and widen the fetch
 * limit until the tied boundary is exhausted.
 */

export const MAX_HISTORY_PAGE_SIZE = 5000;

export function nextHistoryPage({
  returned,
  pageSize,
  startTime,
  cursor = null,
  tieLimit = 0
} = {}) {
  const items = Array.isArray(returned) ? returned : [];
  if (!items.length) {
    return { cursor, exhausted: true, tieLimit: 0 };
  }

  const times = items.map((item) => Number(item?.lastVisitTime) || 0);
  const oldest = Math.min(...times);
  const allSameTime = times.every((time) => time === oldest);
  const fullPage = items.length >= pageSize;

  // A full page of identical timestamps may hide more rows at that boundary.
  // Widen the next request instead of declaring the list finished.
  if (allSameTime && fullPage) {
    if (pageSize >= MAX_HISTORY_PAGE_SIZE) {
      return { cursor: oldest, exhausted: true, tieLimit: 0 };
    }
    const nextLimit = Math.min(
      Math.max(pageSize * 4, 1000),
      MAX_HISTORY_PAGE_SIZE
    );
    return { cursor: oldest, exhausted: false, tieLimit: nextLimit };
  }

  if (!fullPage || oldest <= startTime) {
    return { cursor, exhausted: true, tieLimit: 0 };
  }

  if (cursor != null && oldest >= cursor) {
    return { cursor, exhausted: true, tieLimit: 0 };
  }

  return { cursor: oldest, exhausted: false, tieLimit: 0 };
}
