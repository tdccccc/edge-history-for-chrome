import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_MIGRATION_KEY,
  loadSettings,
  normalizeSettings,
  saveSettings,
  watchSettings
} from '../../shared/settings.js';

function createArea(initial = {}, behavior = {}) {
  const data = { ...initial };
  const listeners = new Set();
  return {
    data,
    listeners,
    async get() {
      if (behavior.getError) throw new Error(behavior.getError);
      return { ...data };
    },
    async set(patch) {
      if (behavior.setError) throw new Error(behavior.setError);
      const previous = { ...data };
      Object.assign(data, patch);
      const changes = {};
      for (const [key, value] of Object.entries(patch)) {
        changes[key] = { oldValue: previous[key], newValue: value };
      }
      for (const listener of listeners) listener(changes, behavior.area || 'local');
    },
    emit(changes, area = 'sync') {
      for (const listener of listeners) listener(changes, area);
    }
  };
}

function installChrome(local, sync) {
  const listeners = new Set();
  const onChanged = {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    emit(changes, area = 'sync') {
      for (const listener of listeners) listener(changes, area);
    }
  };
  globalThis.chrome = {
    storage: {
      local,
      sync,
      onChanged
    }
  };
  return onChanged;
}

test('migrates 1.2.0 local settings into an empty sync store once', async () => {
  const local = createArea({ theme: 'dark', pageSize: 120, welcomeDismissed: true });
  const sync = createArea({});
  installChrome(local, sync);

  const loaded = await loadSettings();
  assert.equal(loaded.settings.theme, 'dark');
  assert.equal(loaded.settings.pageSize, 120);
  assert.equal(loaded.settings.welcomeDismissed, true);
  assert.equal(loaded.area, 'sync');
  assert.equal(loaded.migrated, true);
  assert.equal(sync.data.theme, 'dark');
  assert.equal(local.data[SETTINGS_MIGRATION_KEY], true);

  // A later local change must not overwrite the synced value after migration.
  local.data.theme = 'light';
  const second = await loadSettings();
  assert.equal(second.settings.theme, 'dark');
  assert.equal(second.migrated, false);
});

test('does not overwrite settings already present in sync', async () => {
  const local = createArea({ theme: 'light', showVisitCounts: false, language: 'zh-CN' });
  const sync = createArea({ theme: 'dark', showVisitCounts: true });
  installChrome(local, sync);

  const loaded = await loadSettings();
  assert.equal(loaded.settings.theme, 'dark');
  assert.equal(loaded.settings.showVisitCounts, true);
  // Missing sync keys are filled from local without clobbering existing keys.
  assert.equal(loaded.settings.language, 'zh-CN');
  assert.equal(sync.data.language, 'zh-CN');
  assert.equal(sync.data.theme, 'dark');
});

test('falls back to local when sync cannot be read', async () => {
  const local = createArea({ theme: 'light', showVisitCounts: false, language: 'en' });
  const sync = createArea({}, { getError: 'sync unavailable' });
  installChrome(local, sync);

  const loaded = await loadSettings();
  assert.equal(loaded.area, 'local');
  assert.equal(loaded.synced, false);
  assert.equal(loaded.settings.theme, 'light');
  assert.equal(loaded.settings.showVisitCounts, false);
  assert.match(loaded.error.message, /sync unavailable/);
});

test('saves locally when the sync write fails', async () => {
  const local = createArea({ theme: 'system' });
  const sync = createArea({}, { setError: 'quota exceeded' });
  installChrome(local, sync);

  const saved = await saveSettings({ language: 'zh-CN', theme: 'dark' });
  assert.equal(saved.ok, true);
  assert.equal(saved.area, 'local');
  assert.equal(saved.synced, false);
  assert.match(saved.error.message, /quota/);
  assert.equal(local.data.language, 'zh-CN');
  assert.equal(local.data.theme, 'dark');
});

test('saves to sync and mirrors the patch to local', async () => {
  const local = createArea({});
  const sync = createArea({});
  installChrome(local, sync);

  const saved = await saveSettings({ openInNewTab: true });
  assert.deepEqual(saved, { ok: true, area: 'sync', synced: true, error: null });
  assert.equal(sync.data.openInNewTab, true);
  assert.equal(local.data.openInNewTab, true);
});

test('normalizes corrupt settings', () => {
  assert.deepEqual(
    normalizeSettings({ theme: 'purple', language: 'fr', pageSize: -4, showVisitCounts: 'yes' }),
    {
      theme: 'system',
      language: 'system',
      showVisitCounts: true,
      openInNewTab: false,
      pageSize: 100,
      mergeDuplicates: true,
      welcomeDismissed: false
    }
  );
});

test('watchSettings refreshes merged settings from either area', async () => {
  const local = createArea({ theme: 'light' });
  const sync = createArea({ language: 'system' });
  const onChanged = installChrome(local, sync);

  const seen = new Promise((resolve) => {
    const unsubscribe = watchSettings((settings) => {
      unsubscribe();
      resolve(settings);
    });
    sync.data.language = 'en';
    onChanged.emit({ language: { oldValue: 'system', newValue: 'en' } }, 'sync');
  });

  const settings = await seen;
  assert.equal(settings.language, 'en');
  assert.equal(settings.theme, 'light');
});
