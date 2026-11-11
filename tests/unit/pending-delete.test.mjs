import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_DELETE_STORAGE_KEY,
  PENDING_DELETE_WINDOW_MS,
  clearPendingDeletes,
  createPendingDelete,
  isPendingDeleteDue,
  loadPendingDeletes,
  normalizePendingDeletes,
  partitionPendingDeletes,
  pendingDeleteUrls,
  removePendingDelete,
  restorePendingItems,
  savePendingDeletes
} from '../../shared/pending-delete.js';

const NOW = 1780000000000;

function item(overrides = {}) {
  return {
    _id: 1,
    url: 'https://example.com/a',
    title: 'Example A',
    visitCount: 3,
    lastVisitTime: NOW - 1000,
    mergedUrls: ['https://example.com/a'],
    ...overrides
  };
}

test('createPendingDelete snapshots rows and expires 30 seconds later', () => {
  const pending = createPendingDelete({
    id: 'p1',
    entries: [
      { item: item(), index: 0 },
      { item: item({ _id: 2, url: 'https://example.com/b', lastVisitTime: NOW - 2000 }), index: 1 }
    ],
    now: NOW
  });
  assert.equal(pending.id, 'p1');
  assert.equal(pending.createdAt, NOW);
  assert.equal(pending.executeAt, NOW + PENDING_DELETE_WINDOW_MS);
  assert.deepEqual(pending.urls, ['https://example.com/a', 'https://example.com/b']);
  assert.equal(pending.items.length, 2);
  assert.equal(pending.items[0].index, 0);
  // Snapshots are copies: mutating the original must not change the snapshot.
  const original = item();
  const snapshot = createPendingDelete({ entries: [{ item: original, index: 0 }], now: NOW });
  original.mergedUrls.push('https://example.com/extra');
  assert.deepEqual(snapshot.items[0].item.mergedUrls, ['https://example.com/a']);
});

test('createPendingDelete returns null when there is nothing to delete', () => {
  assert.equal(createPendingDelete({ entries: [], now: NOW }), null);
  assert.equal(createPendingDelete({ entries: [{ item: { title: 'no url' }, index: 0 }], now: NOW }), null);
});

test('normalizePendingDeletes drops malformed entries and sorts by deadline', () => {
  const good = createPendingDelete({ id: 'later', entries: [{ item: item(), index: 0 }], now: NOW });
  const earlier = createPendingDelete({ id: 'earlier', entries: [{ item: item({ _id: 9, url: 'https://example.com/z' }), index: 0 }], now: NOW - 1000 });
  const normalized = normalizePendingDeletes([
    null,
    { id: 'bad', urls: [], items: [] },
    { id: 'bad-urls', createdAt: NOW, executeAt: NOW + 1000, urls: [''], items: [{ index: 0, item: item() }] },
    good,
    good,
    earlier
  ]);
  assert.deepEqual(normalized.map((entry) => entry.id), ['earlier', 'later']);
});

test('partitionPendingDeletes splits due from remaining at the deadline', () => {
  const due = createPendingDelete({ id: 'due', entries: [{ item: item(), index: 0 }], now: NOW - PENDING_DELETE_WINDOW_MS });
  const remaining = createPendingDelete({ id: 'remaining', entries: [{ item: item({ _id: 2, url: 'https://example.com/b' }), index: 0 }], now: NOW });
  const { due: dueList, remaining: remainingList } = partitionPendingDeletes([due, remaining], NOW);
  assert.deepEqual(dueList.map((entry) => entry.id), ['due']);
  assert.deepEqual(remainingList.map((entry) => entry.id), ['remaining']);
  assert.equal(isPendingDeleteDue(due, NOW), true);
  assert.equal(isPendingDeleteDue(remaining, NOW), false);
  assert.equal(isPendingDeleteDue(remaining, NOW + PENDING_DELETE_WINDOW_MS), true);
});

test('restorePendingItems restores rows in visit order without duplicating', () => {
  const pending = createPendingDelete({
    id: 'p1',
    entries: [{ item: item({ _id: 2, url: 'https://example.com/b', lastVisitTime: NOW - 500 }), index: 0 }],
    now: NOW
  });
  const current = [item({ _id: 3, url: 'https://example.com/c', lastVisitTime: NOW - 3000 })];
  const restored = restorePendingItems(current, pending);
  assert.deepEqual(restored.map((entry) => entry.url), ['https://example.com/b', 'https://example.com/c']);
  // Restoring the same pending delete twice must not duplicate the row.
  const restoredAgain = restorePendingItems(restored, pending);
  assert.equal(restoredAgain.length, 2);
});

test('removePendingDelete and pendingDeleteUrls cover the queue', () => {
  const first = createPendingDelete({ id: 'one', entries: [{ item: item(), index: 0 }], now: NOW });
  const second = createPendingDelete({
    id: 'two',
    entries: [{ item: item({ _id: 2, url: 'https://example.com/b' }), index: 0 }],
    now: NOW
  });
  assert.deepEqual(removePendingDelete([first, second], 'one').map((entry) => entry.id), ['two']);
  assert.deepEqual([...pendingDeleteUrls([first, second])].sort(), [
    'https://example.com/a',
    'https://example.com/b'
  ]);
});

test('pending deletes round-trip through chrome.storage.local', async () => {
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

  const pending = createPendingDelete({ id: 'stored', entries: [{ item: item(), index: 0 }], now: NOW });
  assert.equal(await savePendingDeletes([pending]), true);
  assert.equal(data[PENDING_DELETE_STORAGE_KEY].length, 1);
  assert.deepEqual((await loadPendingDeletes()).map((entry) => entry.id), ['stored']);
  assert.equal(await clearPendingDeletes(), true);
  assert.deepEqual(await loadPendingDeletes(), []);
  delete globalThis.chrome;
});
