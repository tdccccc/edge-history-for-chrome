import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOmniboxSuggestions, escapeOmniboxXml, hostOfUrl, MAX_QUERY_LENGTH, normalizeSearchQuery } from '../../shared/search.js';

test('normalizeSearchQuery trims, collapses and limits input', () => {
  assert.equal(normalizeSearchQuery('  chrome   history\n test  '), 'chrome history test');
  assert.equal(normalizeSearchQuery(null), '');
  assert.equal(normalizeSearchQuery('x'.repeat(300)).length, MAX_QUERY_LENGTH);
});

test('hostOfUrl strips www and handles non-http URLs', () => {
  assert.equal(hostOfUrl('https://www.example.com/a/b?q=1'), 'example.com');
  assert.equal(hostOfUrl('https://sub.example.com/'), 'sub.example.com');
  assert.equal(hostOfUrl('file:///tmp/a'), 'file');
  assert.equal(hostOfUrl('not a url'), '');
});

test('escapeOmniboxXml protects XML descriptions', () => {
  assert.equal(escapeOmniboxXml('a & b < c > d "e" \'f\''), 'a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
});

test('omnibox suggestions show title + host and cap at eight', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    title: `Page & ${index}`,
    url: `https://www.example.com/path/${index}?secret=1`
  }));
  const suggestions = buildOmniboxSuggestions(items);
  assert.equal(suggestions.length, 8);
  assert.equal(suggestions[0].content, 'Page & 0');
  assert.match(suggestions[0].description, /Page &amp; 0/);
  assert.match(suggestions[0].description, /<dim>example.com<\/dim>/);
  assert.doesNotMatch(suggestions[0].description, /path|secret/);
});

test('omnibox suggestions fall back to the host and deduplicate titles', () => {
  const suggestions = buildOmniboxSuggestions([
    { title: '', url: 'https://www.example.org/a' },
    { title: 'Example', url: 'https://example.org/a' },
    { title: 'Example', url: 'https://example.org/b' },
    { title: 'Other', url: 'https://other.test/' }
  ]);
  assert.deepEqual(suggestions.map((entry) => entry.content), ['example.org', 'Example', 'Other']);
});
