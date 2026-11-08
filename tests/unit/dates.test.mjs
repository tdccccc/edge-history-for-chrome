import test from 'node:test';
import assert from 'node:assert/strict';

// Set the timezone before importing utils.js so its Date/Intl work uses the
// DST-observing zone. Node applies runtime TZ changes to Date on Linux.
process.env.TZ = 'America/New_York';

const {
  addDays,
  dateKey,
  formatDateHeader,
  getRangeBounds,
  startOfDay,
  startOfNextDay
} = await import('../../shared/utils.js');
const { setLanguage } = await import('../../shared/i18n.js');

setLanguage('en');

test('test process is running in America/New_York', () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/New_York');
});

test('spring-forward day has 23 local hours', () => {
  const noon = new Date(2026, 2, 8, 12, 0, 0).getTime();
  const start = startOfDay(noon);
  const next = startOfNextDay(noon);
  assert.equal(start, new Date(2026, 2, 8, 0, 0, 0).getTime());
  assert.equal(next, new Date(2026, 2, 9, 0, 0, 0).getTime());
  assert.equal(next - start, 23 * 60 * 60 * 1000);
});

test('fall-back day has 25 local hours', () => {
  const noon = new Date(2026, 10, 1, 12, 0, 0).getTime();
  const start = startOfDay(noon);
  const next = startOfNextDay(noon);
  assert.equal(start, new Date(2026, 10, 1, 0, 0, 0).getTime());
  assert.equal(next, new Date(2026, 10, 2, 0, 0, 0).getTime());
  assert.equal(next - start, 25 * 60 * 60 * 1000);
});

test('addDays preserves local midnight across DST transitions', () => {
  const spring = new Date(2026, 2, 7, 0, 0, 0).getTime();
  assert.equal(startOfDay(addDays(spring, 1)), new Date(2026, 2, 8, 0, 0, 0).getTime());
  assert.equal(startOfDay(addDays(spring, 2)), new Date(2026, 2, 9, 0, 0, 0).getTime());

  const fall = new Date(2026, 9, 31, 0, 0, 0).getTime();
  assert.equal(startOfDay(addDays(fall, 1)), new Date(2026, 10, 1, 0, 0, 0).getTime());
  assert.equal(startOfDay(addDays(fall, 2)), new Date(2026, 10, 2, 0, 0, 0).getTime());
});

test('today range ends at the actual local day boundary on fall-back day', () => {
  const now = new Date(2026, 10, 1, 12, 0, 0).getTime();
  const bounds = getRangeBounds('today', {}, now);
  assert.equal(bounds.startTime, new Date(2026, 10, 1, 0, 0, 0).getTime());
  assert.equal(bounds.endTime, now);
  assert.equal(startOfNextDay(bounds.startTime) - bounds.startTime, 25 * 60 * 60 * 1000);
});

test('yesterday and 7d ranges use local day boundaries, not fixed 24h offsets', () => {
  const fallNoon = new Date(2026, 10, 1, 12, 0, 0).getTime();
  const yesterday = getRangeBounds('yesterday', {}, fallNoon);
  assert.equal(yesterday.startTime, new Date(2026, 9, 31, 0, 0, 0).getTime());
  assert.equal(yesterday.endTime, new Date(2026, 10, 1, 0, 0, 0).getTime());

  const now = new Date(2026, 10, 3, 12, 0, 0).getTime();
  const sevenDays = getRangeBounds('7d', {}, now);
  assert.equal(sevenDays.startTime, new Date(2026, 9, 28, 0, 0, 0).getTime());
  assert.equal(sevenDays.endTime, now);
});

test('date header labels respect DST-adjacent days', () => {
  const springNoon = new Date(2026, 2, 8, 12, 0, 0).getTime();
  assert.equal(formatDateHeader(new Date(2026, 2, 8, 9, 0, 0).getTime(), springNoon), 'Today');
  assert.equal(formatDateHeader(new Date(2026, 2, 7, 9, 0, 0).getTime(), springNoon), 'Yesterday');
  assert.match(formatDateHeader(new Date(2026, 2, 6, 9, 0, 0).getTime(), springNoon), /March/);

  const fallNoon = new Date(2026, 10, 1, 12, 0, 0).getTime();
  assert.equal(formatDateHeader(new Date(2026, 10, 1, 0, 30, 0).getTime(), fallNoon), 'Today');
  assert.equal(formatDateHeader(new Date(2026, 9, 31, 23, 30, 0).getTime(), fallNoon), 'Yesterday');
});

test('date keys stay local and distinct across the fall-back boundary', () => {
  assert.equal(dateKey(new Date(2026, 10, 1, 0, 0, 0).getTime()), '2026-11-01');
  assert.equal(dateKey(new Date(2026, 10, 1, 23, 59, 0).getTime()), '2026-11-01');
  assert.equal(dateKey(new Date(2026, 10, 2, 0, 0, 0).getTime()), '2026-11-02');
});
