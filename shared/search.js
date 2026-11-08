/**
 * Pure helpers for the omnibox and context-menu search entry points. Kept
 * separate from the service worker so they can be unit-tested in Node.
 */

export const MAX_QUERY_LENGTH = 200;

export function normalizeSearchQuery(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export function hostOfUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname) return parsed.hostname.replace(/^www\./i, '');
    return parsed.protocol.replace(/:$/, '');
  } catch {
    return '';
  }
}

export function escapeOmniboxXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Build at most `max` omnibox suggestions from history items. Descriptions
 * deliberately expose only the page title and hostname; paths and queries are
 * not shown in the dropdown.
 */
export function buildOmniboxSuggestions(items, max = 8) {
  const suggestions = [];
  const seen = new Set();

  for (const item of items || []) {
    if (!item || !item.url) continue;
    const host = hostOfUrl(item.url);
    const title = compact(item.title) || host || item.url;
    const content = title.slice(0, 120);
    if (!content || seen.has(content)) continue;
    seen.add(content);
    const displayTitle = title.length > 90 ? `${title.slice(0, 89)}…` : title;
    const description = host
      ? `${escapeOmniboxXml(displayTitle)} <dim>${escapeOmniboxXml(host)}</dim>`
      : escapeOmniboxXml(displayTitle);
    suggestions.push({ content, description });
    if (suggestions.length >= max) break;
  }

  return suggestions;
}
