import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_HISTORY_PAGE_SIZE, nextHistoryPage } from '../../shared/pagination.js';

const item = (lastVisitTime) => ({ lastVisitTime, url: 'https://example.com/' + lastVisitTime });

test('normal mixed pages move the cursor', () => {
  assert.deepEqual(
    nextHistoryPage({
      returned: [item(1000), item(900), item(800)],
      pageSize: 3,
      startTime: 0,
      cursor: 1200
    }),
    { cursor: 800, exhausted: false, tieLimit: 0 }
  );
});

test('a short page is exhausted', () => {
  assert.deepEqual(
    nextHistoryPage({
      returned: [item(1000), item(900)],
      pageSize: 3,
      startTime: 0,
      cursor: 1200
    }),
    { cursor: 1200, exhausted: true, tieLimit: 0 }
  );
});

test('a full page of tied timestamps widens the next request', () => {
  assert.deepEqual(
    nextHistoryPage({
      returned: Array.from({ length: 100 }, () => item(5000)),
      pageSize: 100,
      startTime: 0,
      cursor: null
    }),
    { cursor: 5000, exhausted: false, tieLimit: 1000 }
  );
});

test('a widened request that returns fewer rows is exhausted', () => {
  assert.deepEqual(
    nextHistoryPage({
      returned: Array.from({ length: 300 }, (_, index) => item(index < 150 ? 5000 : 4999)),
      pageSize: 1000,
      startTime: 0,
      cursor: 5000
    }),
    { cursor: 5000, exhausted: true, tieLimit: 0 }
  );
});

test('ties at the range boundary still widen before giving up', () => {
  const result = nextHistoryPage({
    returned: Array.from({ length: 50 }, () => item(0)),
    pageSize: 50,
    startTime: 0,
    cursor: 0
  });
  assert.equal(result.exhausted, false);
  assert.equal(result.tieLimit, 1000);
});

test('a full page at the wide cap cannot make progress', () => {
  assert.deepEqual(
    nextHistoryPage({
      returned: Array.from({ length: MAX_HISTORY_PAGE_SIZE }, () => item(7)),
      pageSize: MAX_HISTORY_PAGE_SIZE,
      startTime: 0,
      cursor: 7
    }),
    { cursor: 7, exhausted: true, tieLimit: 0 }
  );
});

test('empty results end pagination', () => {
  assert.deepEqual(
    nextHistoryPage({ returned: [], pageSize: 100, startTime: 0, cursor: 10 }),
    { cursor: 10, exhausted: true, tieLimit: 0 }
  );
});
