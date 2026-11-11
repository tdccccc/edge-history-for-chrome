import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_STORAGE_KEY,
  checkForUpdate,
  compareVersions,
  dismissUpdate,
  isNewerVersion,
  loadUpdateState,
  normalizeUpdateState,
  parseLatestRelease,
  parseVersion,
  saveUpdateState,
  shouldCheckUpdate,
  shouldShowUpdate
} from '../../shared/update-check.js';

const NOW = 1780000000000;
const DAY = 24 * 60 * 60 * 1000;

function state(overrides = {}) {
  return {
    checkedAt: NOW - DAY,
    latestVersion: '1.4.0',
    latestUrl: 'https://github.com/tdccccc/edge-history-for-chrome/releases/tag/v1.4.0',
    dismissedVersion: null,
    ...overrides
  };
}

function fakeFetch(payload, { ok = true } = {}) {
  let calls = 0;
  let lastUrl = null;
  const fetchImpl = async (url) => {
    calls += 1;
    lastUrl = url;
    return {
      ok,
      async json() {
        return payload;
      }
    };
  };
  return { fetchImpl, get calls() { return calls; }, get lastUrl() { return lastUrl; } };
}

test('parseVersion accepts v-prefixed and short versions, rejects garbage', () => {
  assert.deepEqual(parseVersion('v1.4.0'), { major: 1, minor: 4, patch: 0, prerelease: null });
  assert.deepEqual(parseVersion('1.4'), { major: 1, minor: 4, patch: 0, prerelease: null });
  assert.deepEqual(parseVersion('1'), { major: 1, minor: 0, patch: 0, prerelease: null });
  assert.deepEqual(parseVersion('1.4.0-beta.1'), { major: 1, minor: 4, patch: 0, prerelease: 'beta.1' });
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion('1.4.0.1'), null);
  assert.equal(parseVersion(null), null);
});

test('compareVersions orders numerically and ranks releases above prereleases', () => {
  assert.equal(compareVersions('1.4.0', '1.3.0'), 1);
  assert.equal(compareVersions('1.3.0', '1.4.0'), -1);
  assert.equal(compareVersions('1.4.0', '1.4.0'), 0);
  assert.equal(compareVersions('v1.4.0', '1.3.9'), 1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('1.4.0-beta', '1.4.0'), -1);
  assert.equal(compareVersions('1.4.0', '1.4.0-beta'), 1);
  assert.equal(compareVersions('1.4.0', 'garbage'), null);
  assert.equal(compareVersions('garbage', '1.4.0'), null);
});

test('isNewerVersion only fires on a strictly newer release', () => {
  assert.equal(isNewerVersion('1.4.0', '1.3.0'), true);
  assert.equal(isNewerVersion('1.3.0', '1.3.0'), false);
  assert.equal(isNewerVersion('1.2.0', '1.3.0'), false);
  assert.equal(isNewerVersion('v1.4.0', '1.3.0'), true);
  assert.equal(isNewerVersion('1.4.0-beta', '1.3.0'), true);
  assert.equal(isNewerVersion('garbage', '1.3.0'), false);
});

test('parseLatestRelease reads the tag and release URL, with a tag-URL fallback', () => {
  assert.deepEqual(
    parseLatestRelease({
      tag_name: 'v1.4.0',
      html_url: 'https://github.com/tdccccc/edge-history-for-chrome/releases/tag/v1.4.0'
    }),
    {
      version: '1.4.0',
      url: 'https://github.com/tdccccc/edge-history-for-chrome/releases/tag/v1.4.0'
    }
  );
  assert.deepEqual(
    parseLatestRelease({ tag_name: 'v1.5.0' }),
    {
      version: '1.5.0',
      url: 'https://github.com/tdccccc/edge-history-for-chrome/releases/tag/v1.5.0'
    }
  );
  assert.equal(parseLatestRelease({}), null);
  assert.equal(parseLatestRelease({ tag_name: 'not-a-version' }), null);
  assert.equal(parseLatestRelease(null), null);
  assert.equal(parseLatestRelease([]), null);
});

test('normalizeUpdateState drops malformed fields and keeps valid ones', () => {
  assert.deepEqual(normalizeUpdateState(null), {
    checkedAt: 0,
    latestVersion: null,
    latestUrl: null,
    dismissedVersion: null
  });
  assert.deepEqual(normalizeUpdateState({ checkedAt: NOW, latestVersion: 'garbage' }), {
    checkedAt: NOW,
    latestVersion: null,
    latestUrl: null,
    dismissedVersion: null
  });
  assert.deepEqual(normalizeUpdateState(state()), state());
});

test('shouldCheckUpdate runs at most once a day', () => {
  assert.equal(shouldCheckUpdate(null, NOW), true);
  assert.equal(shouldCheckUpdate({ checkedAt: 0 }, NOW), true);
  assert.equal(shouldCheckUpdate(state({ checkedAt: NOW - 60 * 1000 }), NOW), false);
  assert.equal(shouldCheckUpdate(state({ checkedAt: NOW - UPDATE_CHECK_INTERVAL_MS }), NOW), true);
  assert.equal(shouldCheckUpdate(state({ checkedAt: NOW - DAY - 1000 }), NOW), true);
});

test('shouldShowUpdate hides dismissed and up-to-date versions', () => {
  assert.equal(shouldShowUpdate(state(), '1.3.0'), true);
  assert.equal(shouldShowUpdate(state({ dismissedVersion: '1.4.0' }), '1.3.0'), false);
  assert.equal(shouldShowUpdate(state({ dismissedVersion: '1.3.0' }), '1.3.0'), true);
  assert.equal(shouldShowUpdate(state(), '1.4.0'), false);
  assert.equal(shouldShowUpdate(state(), '1.5.0'), false);
  assert.equal(shouldShowUpdate({ checkedAt: NOW }, '1.3.0'), false);
});

test('dismissUpdate records the dismissed version', () => {
  assert.equal(dismissUpdate(state(), '1.4.0').dismissedVersion, '1.4.0');
  assert.equal(dismissUpdate(state(), 'garbage').dismissedVersion, null);
});

test('checkForUpdate fetches once a day and reports a newer release', async () => {
  const fake = fakeFetch({ tag_name: 'v1.4.0', html_url: 'https://example.com/r/1.4.0' });
  const result = await checkForUpdate({
    fetchImpl: fake.fetchImpl,
    currentVersion: '1.3.0',
    now: NOW,
    state: { checkedAt: 0, latestVersion: null, latestUrl: null, dismissedVersion: null }
  });
  assert.equal(fake.calls, 1);
  assert.equal(result.checked, true);
  assert.deepEqual(result.update, { version: '1.4.0', url: 'https://example.com/r/1.4.0' });
  assert.equal(result.state.checkedAt, NOW);
  assert.equal(result.state.latestVersion, '1.4.0');
});

test('checkForUpdate skips the network when checked recently', async () => {
  const { fetchImpl, calls } = fakeFetch({ tag_name: 'v1.4.0' });
  const result = await checkForUpdate({
    fetchImpl,
    currentVersion: '1.3.0',
    now: NOW,
    state: state({ checkedAt: NOW - 60 * 1000 })
  });
  assert.equal(calls, 0);
  assert.equal(result.checked, false);
  assert.equal(result.update, null);
  assert.equal(result.state.latestVersion, '1.4.0');
});

test('checkForUpdate reports no update when already on the latest version', async () => {
  const { fetchImpl } = fakeFetch({ tag_name: 'v1.4.0', html_url: 'https://example.com/r/1.4.0' });
  const result = await checkForUpdate({
    fetchImpl,
    currentVersion: '1.4.0',
    now: NOW,
    state: { checkedAt: 0, latestVersion: null, latestUrl: null, dismissedVersion: null }
  });
  assert.equal(result.checked, true);
  assert.equal(result.update, null);
  assert.equal(result.state.latestVersion, '1.4.0');
});

test('checkForUpdate re-arms the banner when a newer release replaces a dismissed one', async () => {
  const { fetchImpl } = fakeFetch({ tag_name: 'v1.5.0', html_url: 'https://example.com/r/1.5.0' });
  const result = await checkForUpdate({
    fetchImpl,
    currentVersion: '1.3.0',
    now: NOW,
    state: state({ dismissedVersion: '1.4.0' })
  });
  assert.equal(result.state.dismissedVersion, null);
  assert.deepEqual(result.update, { version: '1.5.0', url: 'https://example.com/r/1.5.0' });
});

test('checkForUpdate never throws and leaves state alone on failure', async () => {
  const failing = async () => { throw new Error('offline'); };
  const before = { checkedAt: 0, latestVersion: null, latestUrl: null, dismissedVersion: null };
  const failed = await checkForUpdate({ fetchImpl: failing, currentVersion: '1.3.0', now: NOW, state: before });
  assert.equal(failed.checked, false);
  assert.equal(failed.update, null);
  assert.deepEqual(failed.state, before);

  const { fetchImpl } = fakeFetch({ tag_name: 'v1.4.0' }, { ok: false });
  const badStatus = await checkForUpdate({ fetchImpl, currentVersion: '1.3.0', now: NOW, state: before });
  assert.equal(badStatus.checked, false);
  assert.deepEqual(badStatus.state, before);

  const garbage = fakeFetch({ tag_name: 'not-a-version' });
  const badPayload = await checkForUpdate({
    fetchImpl: garbage.fetchImpl,
    currentVersion: '1.3.0',
    now: NOW,
    state: before
  });
  assert.equal(badPayload.checked, false);
  assert.deepEqual(badPayload.state, before);
});

test('update state round-trips through chrome.storage.local', async () => {
  const data = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(defaults) {
          const result = {};
          for (const [key, fallback] of Object.entries(defaults || {})) {
            result[key] = key in data ? data[key] : fallback;
          }
          return result;
        },
        async set(patch) {
          Object.assign(data, patch);
        }
      }
    }
  };

  const saved = state({ checkedAt: NOW });
  assert.equal(await saveUpdateState(saved), true);
  assert.equal(data[UPDATE_CHECK_STORAGE_KEY].latestVersion, '1.4.0');
  assert.deepEqual(await loadUpdateState(), saved);
  delete globalThis.chrome;
});
