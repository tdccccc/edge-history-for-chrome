/**
 * Built-in update reminder ("update check") for the extension.
 *
 * The extension is not on the Chrome Web Store and has no update_url, so
 * new versions have to be installed by hand. On startup the extension asks
 * the GitHub Releases API for the latest release tag and compares it with
 * the installed version. When a newer release exists, the history page
 * shows a dismissible banner with a download link.
 *
 * This module is pure except for the small storage helpers at the bottom,
 * which follow the same storage access pattern as shared/settings.js and
 * shared/pending-delete.js so they work in the real extension, in demo
 * mode, and in unit tests that install a fake globalThis.chrome. The
 * network call itself never throws and never blocks startup: any failure
 * just leaves the stored state unchanged, to be retried on a later start.
 */

export const UPDATE_CHECK_API_URL = 'https://api.github.com/repos/tdccccc/edge-history-for-chrome/releases/latest';
export const UPDATE_CHECK_RELEASES_URL = 'https://github.com/tdccccc/edge-history-for-chrome/releases';
export const UPDATE_CHECK_STORAGE_KEY = 'edgeHistoryUpdateCheck';
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function getApi() {
  return globalThis.__demoChrome || globalThis.chrome;
}

/**
 * Parse a version string into { major, minor, patch, prerelease }.
 * Accepts an optional leading "v" and one to three numeric parts
 * ("1.4.0", "v1.4", "1"); a "-suffix" marks a prerelease. Anything else
 * returns null.
 */
export function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] || null
  };
}

/**
 * Compare two version strings: -1, 0 or 1. A release sorts after a
 * prerelease of the same numbers. Returns null when either side does not
 * parse.
 */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (const part of ['major', 'minor', 'patch']) {
    if (left[part] !== right[part]) return left[part] < right[part] ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

/** True when `latest` is a newer version than `current`. */
export function isNewerVersion(latest, current) {
  return compareVersions(latest, current) === 1;
}

/**
 * Pull { version, url } out of a GitHub "latest release" API payload.
 * Returns null when the payload has no usable tag. The release page URL
 * falls back to the tag URL when html_url is missing.
 */
export function parseLatestRelease(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const tag = typeof payload.tag_name === 'string' ? payload.tag_name.trim() : '';
  if (!parseVersion(tag)) return null;
  const url = typeof payload.html_url === 'string' && payload.html_url
    ? payload.html_url
    : `${UPDATE_CHECK_RELEASES_URL}/tag/${encodeURIComponent(tag)}`;
  return { version: tag.replace(/^v/, ''), url };
}

/** Drop malformed state (e.g. from a corrupt or hand-edited store). */
export function normalizeUpdateState(value) {
  const fallback = {
    checkedAt: 0,
    latestVersion: null,
    latestUrl: null,
    dismissedVersion: null
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const checkedAt = Number.isFinite(value.checkedAt) && value.checkedAt > 0 ? value.checkedAt : 0;
  const latestVersion = typeof value.latestVersion === 'string' && parseVersion(value.latestVersion)
    ? value.latestVersion
    : null;
  const latestUrl = typeof value.latestUrl === 'string' && value.latestUrl ? value.latestUrl : null;
  const dismissedVersion = typeof value.dismissedVersion === 'string' && parseVersion(value.dismissedVersion)
    ? value.dismissedVersion
    : null;
  return { checkedAt, latestVersion, latestUrl, dismissedVersion };
}

/** True when no check has run yet, or the last one is over a day old. */
export function shouldCheckUpdate(state, now = Date.now()) {
  const normalized = normalizeUpdateState(state);
  return !normalized.checkedAt || now - normalized.checkedAt >= UPDATE_CHECK_INTERVAL_MS;
}

/**
 * True when the stored latest release is newer than the installed version
 * and the user has not dismissed that exact version.
 */
export function shouldShowUpdate(state, currentVersion) {
  const normalized = normalizeUpdateState(state);
  if (!normalized.latestVersion) return false;
  if (!isNewerVersion(normalized.latestVersion, currentVersion)) return false;
  return normalized.dismissedVersion !== normalized.latestVersion;
}

/** Record that the user dismissed the banner for `version`. */
export function dismissUpdate(state, version) {
  const normalized = normalizeUpdateState(state);
  if (!parseVersion(version)) return normalized;
  return { ...normalized, dismissedVersion: version };
}

/**
 * Run one update check, at most once a day.
 *
 * Returns { state, update, checked }: `state` is the (possibly updated)
 * stored state, `update` is { version, url } when a newer release was
 * found (null otherwise), and `checked` says whether the network was
 * actually hit. Any network or payload failure leaves the state
 * untouched and is swallowed, so the check never breaks startup.
 */
export async function checkForUpdate({
  fetchImpl = globalThis.fetch,
  currentVersion = '',
  now = Date.now(),
  state = null
} = {}) {
  const normalized = normalizeUpdateState(state);
  if (!shouldCheckUpdate(normalized, now)) {
    return { state: normalized, update: null, checked: false };
  }
  try {
    if (typeof fetchImpl !== 'function') return { state: normalized, update: null, checked: false };
    const response = await fetchImpl(UPDATE_CHECK_API_URL, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response?.ok) return { state: normalized, update: null, checked: false };
    const release = parseLatestRelease(await response.json());
    if (!release) return { state: normalized, update: null, checked: false };
    const next = {
      ...normalized,
      checkedAt: now,
      latestVersion: release.version,
      latestUrl: release.url
    };
    // A newer release re-arms the banner: a dismissal for an older
    // version must not hide it.
    if (normalized.dismissedVersion && normalized.dismissedVersion !== release.version) {
      next.dismissedVersion = null;
    }
    return {
      state: next,
      update: isNewerVersion(release.version, currentVersion) ? release : null,
      checked: true
    };
  } catch {
    return { state: normalized, update: null, checked: false };
  }
}

/* ------------------------------------------------------------ persistence */

/** Load the stored check state; a missing/broken store reads as never checked. */
export async function loadUpdateState() {
  const local = getApi()?.storage?.local;
  if (!local?.get) return normalizeUpdateState(null);
  try {
    const result = await local.get({ [UPDATE_CHECK_STORAGE_KEY]: null });
    return normalizeUpdateState(result?.[UPDATE_CHECK_STORAGE_KEY]);
  } catch {
    return normalizeUpdateState(null);
  }
}

/** Persist the check state (best-effort: a failed write must not break the page). */
export async function saveUpdateState(state) {
  const local = getApi()?.storage?.local;
  if (!local?.set) return false;
  try {
    await local.set({ [UPDATE_CHECK_STORAGE_KEY]: normalizeUpdateState(state) });
    return true;
  } catch {
    return false;
  }
}
