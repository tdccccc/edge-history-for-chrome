import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MESSAGES, resolveLocale, setLanguage, t } from '../../shared/i18n.js';
import {
  formatCount,
  formatDateHeader,
  formatFullDate,
  formatRangeLabel,
  relativeTime,
  transitionLabel
} from '../../shared/utils.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

function collectKeys() {
  const keys = new Set();
  for (const file of ['history.js', 'popup.js', 'shared/utils.js', 'background.js']) {
    const text = readFileSync(root + file, 'utf8');
    for (const match of text.matchAll(/\bt\(\s*'([^']+)'/g)) keys.add(match[1]);
    for (const match of text.matchAll(/\bt\(\s*`([^`$]+)`/g)) keys.add(match[1]);
  }
  for (const file of ['history.html', 'popup.html']) {
    const text = readFileSync(root + file, 'utf8');
    for (const match of text.matchAll(/data-i18n(?:-html|-placeholder|-title|-aria-label)?="([^"]+)"/g)) {
      keys.add(match[1]);
    }
  }
  return keys;
}

test('system language detection maps zh-* to Chinese and everything else to English', () => {
  assert.equal(resolveLocale('system', 'zh-CN'), 'zh-CN');
  assert.equal(resolveLocale('system', 'zh-TW'), 'zh-CN');
  assert.equal(resolveLocale('system', 'en-GB'), 'en');
  assert.equal(resolveLocale('system', 'fr-FR'), 'en');
  assert.equal(resolveLocale('en', 'zh-CN'), 'en');
  assert.equal(resolveLocale('zh-CN', 'en-US'), 'zh-CN');
});

test('interpolation and plural forms are localized', () => {
  setLanguage('en');
  assert.equal(t('count.total', { count: 1 }), '1 item');
  assert.equal(t('count.total', { count: 5000 }), '5,000 items');
  assert.equal(t('count.visits', { count: 1 }), '1 visit');
  assert.equal(t('count.visits', { count: 3 }), '3 visits');
  assert.equal(t('history.allLoaded', { count: 36 }), 'Showing all 36 items');
  assert.equal(t('history.deleteSiteSuccess', { count: 2, label: 'example.com' }), 'Deleted 2 items for example.com');

  setLanguage('zh-CN');
  assert.equal(t('count.total', { count: 5000 }), '共 5,000 条');
  assert.equal(t('history.allLoaded', { count: 36 }), '已显示全部 36 条记录');
  assert.equal(
    t('history.visits.summary', { visits: t('count.visits', { count: 3 }), truncated: '' }),
    '该网址共有 3 次访问。'
  );
});

test('dates, numbers, ranges and transitions use Intl', () => {
  const now = new Date(2026, 10, 8, 21, 30).getTime();

  setLanguage('en');
  assert.equal(formatCount(5000), '5,000');
  assert.equal(formatDateHeader(now, now), 'Today');
  assert.equal(formatDateHeader(now - 24 * 60 * 60 * 1000, now), 'Yesterday');
  assert.match(formatDateHeader(new Date(2026, 10, 6, 12).getTime(), now), /November/);
  assert.match(formatFullDate(now), /2026/);
  assert.equal(formatRangeLabel('7d'), 'Last 7 days');
  assert.equal(transitionLabel('link'), 'Link');
  assert.equal(relativeTime(now - 5 * 60 * 1000, now), '5 minutes ago');

  setLanguage('zh-CN');
  assert.equal(formatCount(5000), '5,000');
  assert.equal(formatDateHeader(now, now), '今天');
  assert.equal(formatDateHeader(now - 24 * 60 * 60 * 1000, now), '昨天');
  assert.equal(formatRangeLabel('hour'), '最近 1 小时');
  assert.equal(transitionLabel('link'), '点击链接');
  assert.equal(relativeTime(now - 5 * 60 * 1000, now), '5分钟前');
});

test('every source and data-i18n key exists in both dictionaries', () => {
  const keys = collectKeys();
  for (const key of keys) {
    for (const locale of ['zh-CN', 'en']) {
      const dict = MESSAGES[locale];
      assert.ok(
        Object.hasOwn(dict, key) || Object.hasOwn(dict, `${key}_other`),
        `${locale} is missing ${key}`
      );
    }
  }
});

test('English dictionary has no Chinese characters', () => {
  const offending = Object.entries(MESSAGES.en)
    .filter(([, value]) => /[\u3400-\u9fff]/.test(value))
    .map(([key]) => key);
  assert.deepEqual(offending, []);
});

test('static Chinese markup is always hooked to data-i18n', () => {
  for (const file of ['history.html', 'popup.html']) {
    const text = readFileSync(root + file, 'utf8');
    const unwrapped = text.split('\n').filter((line) => (
      /[\u3400-\u9fff]/.test(line) && !/data-i18n/.test(line)
    ));
    assert.deepEqual(unwrapped, [], file + ' has untranslated markup');
  }
});
