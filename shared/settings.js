/**
 * Settings persistence shared by the full history page, the popup and the
 * service worker.
 *
 * chrome.storage.sync is the primary store so preferences follow the signed-in
 * Chrome profile. chrome.storage.local remains a fallback (and the migration
 * source for users upgrading from 1.2.0, which only used local storage).
 */

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  language: 'system',
  showVisitCounts: true,
  openInNewTab: false,
  pageSize: 100,
  mergeDuplicates: true,
  welcomeDismissed: false
});

export const SETTINGS_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));

// A local-only marker: syncing it would suppress migration on other devices.
const MIGRATION_KEY = '_edgeHistorySettingsMigratedToSync';

const THEMES = new Set(['system', 'light', 'dark']);
const LANGUAGES = new Set(['system', 'zh-CN', 'en']);

function getApi() {
  return globalThis.__demoChrome || globalThis.chrome;
}

function getAreas() {
  const api = getApi();
  return {
    local: api?.storage?.local || null,
    sync: api?.storage?.sync || null,
    onChanged: api?.storage?.onChanged || null
  };
}

function pickSettings(source) {
  const result = {};
  if (!source || typeof source !== 'object') return result;
  for (const key of SETTINGS_KEYS) {
    if (Object.hasOwn(source, key) && source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

function asBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Keep stored values in a shape the UI can rely on. Unknown or corrupt values
 * fall back to defaults instead of breaking a page during startup.
 */
export function normalizeSettings(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const pageSize = Number(input.pageSize);
  return {
    theme: THEMES.has(input.theme) ? input.theme : DEFAULT_SETTINGS.theme,
    language: LANGUAGES.has(input.language) ? input.language : DEFAULT_SETTINGS.language,
    showVisitCounts: asBoolean(input.showVisitCounts, DEFAULT_SETTINGS.showVisitCounts),
    openInNewTab: asBoolean(input.openInNewTab, DEFAULT_SETTINGS.openInNewTab),
    pageSize: Number.isFinite(pageSize) && pageSize > 0
      ? Math.round(pageSize)
      : DEFAULT_SETTINGS.pageSize,
    mergeDuplicates: asBoolean(input.mergeDuplicates, DEFAULT_SETTINGS.mergeDuplicates),
    welcomeDismissed: asBoolean(input.welcomeDismissed, DEFAULT_SETTINGS.welcomeDismissed)
  };
}

function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}

async function readArea(area) {
  return (await area.get(null)) || {};
}

/**
 * Load settings with sync-first semantics.
 *
 * Migration runs once per profile: known settings that exist only in local are
 * copied to sync without overwriting values already synced from another
 * device. A successful migration is recorded locally so subsequent loads do
 * not re-upload stale local values.
 *
 * The returned metadata lets the UI explain when sync is unavailable and the
 * values are local-only.
 */
export async function loadSettings({ migrate = true } = {}) {
  const { local, sync } = getAreas();
  let localAll = {};
  let localError = null;

  if (local) {
    try {
      localAll = await readArea(local);
    } catch (error) {
      localError = toError(error);
    }
  }

  const localSettings = pickSettings(localAll);

  if (!sync) {
    return {
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...localSettings }),
      area: 'local',
      synced: false,
      migrated: false,
      error: localError,
      migrationError: null
    };
  }

  let syncAll;
  try {
    syncAll = await readArea(sync);
  } catch (error) {
    // Sync exists but cannot be read (enterprise policy, transient failure).
    // The local copy is still a complete, usable store.
    return {
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...localSettings }),
      area: 'local',
      synced: false,
      migrated: false,
      error: toError(error),
      migrationError: null
    };
  }

  const syncSettings = pickSettings(syncAll);
  let migrated = false;
  let migrationError = null;

  if (migrate && localAll[MIGRATION_KEY] !== true) {
    const patch = {};
    for (const key of SETTINGS_KEYS) {
      if (Object.hasOwn(localSettings, key) && !Object.hasOwn(syncSettings, key)) {
        patch[key] = localSettings[key];
      }
    }

    if (Object.keys(patch).length) {
      try {
        await sync.set(patch);
        Object.assign(syncSettings, pickSettings(patch));
        migrated = true;
      } catch (error) {
        migrationError = toError(error);
      }
    }

    if (!migrationError) {
      try {
        await local?.set({ [MIGRATION_KEY]: true });
      } catch {
        // The marker is an optimisation; a failed write only retries later.
      }
    }
  }

  // Sync wins for keys present there. Local fills the gaps so a partially
  // populated sync profile still keeps the user's existing preferences.
  return {
    settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...localSettings, ...syncSettings }),
    area: 'sync',
    synced: true,
    migrated,
    error: null,
    migrationError
  };
}

export async function getSettings(options) {
  return (await loadSettings(options)).settings;
}

/**
 * Persist a settings patch. Sync is always tried first; a failed sync write
 * (quota, disabled sync, policy) falls back to local so the current device
 * still remembers the choice.
 */
export async function saveSettings(patch = {}) {
  const known = pickSettings(patch);
  if (!Object.keys(known).length) {
    return { ok: true, area: 'none', synced: false, error: null };
  }

  const { local, sync } = getAreas();
  let syncError = null;

  if (sync) {
    try {
      await sync.set(known);
      // Mirror for fast local recovery and for a future sync outage. This is
      // deliberately best-effort and never changes the success result.
      try {
        await local?.set(known);
      } catch {
        // Ignore; sync already has the authoritative values.
      }
      return { ok: true, area: 'sync', synced: true, error: null };
    } catch (error) {
      syncError = toError(error);
    }
  }

  if (local) {
    try {
      await local.set(known);
      return {
        ok: true,
        area: 'local',
        synced: false,
        error: syncError
      };
    } catch (error) {
      return {
        ok: false,
        area: 'none',
        synced: false,
        error: toError(error),
        syncError
      };
    }
  }

  return {
    ok: false,
    area: 'none',
    synced: false,
    error: syncError || new Error('No storage area available')
  };
}

/**
 * Install/update hook. Runs the local -> sync migration and, on a fresh
 * install, makes sure the welcome card is visible on this device.
 */
export async function ensureSettings({ freshInstall = false } = {}) {
  const loaded = await loadSettings({ migrate: true });
  if (freshInstall) {
    const result = await saveSettings({ welcomeDismissed: false });
    loaded.settings = { ...loaded.settings, welcomeDismissed: false };
    if (!result.ok) loaded.error = result.error;
  }
  return loaded;
}

/**
 * Watch both storage areas. Pages receive the fully merged settings, so a
 * popup and a full-history tab always agree even when only one area fired.
 */
export function watchSettings(callback) {
  const { onChanged } = getAreas();
  if (!onChanged?.addListener) return () => {};

  let pending = false;
  const listener = (changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') return;
    const changedSettings = Object.keys(changes || {}).some((key) => SETTINGS_KEYS.includes(key));
    if (!changedSettings || pending) return;

    pending = true;
    // Collapse the sync + local mirror writes from a single save into one
    // refresh, without delaying an update from another page.
    queueMicrotask(async () => {
      pending = false;
      try {
        const loaded = await loadSettings({ migrate: false });
        callback(loaded.settings, loaded);
      } catch {
        // A transient storage failure should not break the open page.
      }
    });
  };

  onChanged.addListener(listener);
  return () => onChanged.removeListener?.(listener);
}

export const SETTINGS_MIGRATION_KEY = MIGRATION_KEY;
