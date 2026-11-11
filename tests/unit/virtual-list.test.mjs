import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIRTUAL_HEADER_HEIGHT,
  VIRTUAL_ROW_HEIGHT,
  buildVirtualBlocks,
  computeVirtualWindow,
  findRowBlockIndex,
  firstBlockEndingAfter,
  firstBlockStartingAtOrAfter
} from '../../shared/virtual-list.js';

const group = (key, count) => ({
  key,
  label: key,
  items: Array.from({ length: count }, (_, index) => ({ _id: `${key}-${index}`, url: `https://example.com/${key}/${index}` }))
});

test('flattening emits a header block plus one row block per item', () => {
  const built = buildVirtualBlocks([group('a', 2), group('b', 1)], new Set());
  assert.deepEqual(
    built.blocks.map((block) => block.kind),
    ['header', 'row', 'row', 'header', 'row']
  );
  assert.deepEqual(built.offsets, [0, 43, 99, 155, 198]);
  assert.equal(built.totalHeight, 43 + 2 * 56 + 43 + 56);
});

test('a collapsed group contributes only its header block', () => {
  const built = buildVirtualBlocks([group('a', 3), group('b', 2)], new Set(['a']));
  assert.deepEqual(
    built.blocks.map((block) => block.kind),
    ['header', 'header', 'row', 'row']
  );
  assert.equal(built.totalHeight, 43 + 43 + 2 * 56);
  assert.equal(built.blocks[1].group.key, 'b');
});

test('window at the top covers the viewport plus overscan', () => {
  const built = buildVirtualBlocks([group('a', 100)], new Set());
  // Viewport 800px shows ~14 rows; 30 overscan adds 30 more below.
  const window = computeVirtualWindow(built, 0, 800, 30);
  assert.equal(window.start, 0);
  assert.equal(window.end, 45);
  assert.equal(window.topHeight, 0);
  assert.equal(window.bottomHeight, built.totalHeight - (43 + 44 * 56));
});

test('window in the middle keeps overscan on both sides', () => {
  const built = buildVirtualBlocks([group('a', 200)], new Set());
  // scrollTop 2800px lands inside row ~49 (header 43 + 49*56 = 2787).
  const window = computeVirtualWindow(built, 2800, 800, 30);
  assert.equal(window.start, 20);
  assert.equal(window.end, 95);
  assert.equal(window.topHeight, 43 + 19 * 56);
  assert.equal(window.bottomHeight, built.totalHeight - (43 + 94 * 56));
});

test('window at the bottom clamps to the last block', () => {
  const built = buildVirtualBlocks([group('a', 100)], new Set());
  const window = computeVirtualWindow(built, built.totalHeight - 800, 800, 30);
  assert.equal(window.end, built.blocks.length);
  assert.equal(window.bottomHeight, 0);
});

test('empty list renders no window', () => {
  const built = buildVirtualBlocks([], new Set());
  assert.deepEqual(computeVirtualWindow(built, 0, 800, 30), {
    start: 0,
    end: 0,
    topHeight: 0,
    bottomHeight: 0
  });
});

test('binary searches find block boundaries', () => {
  const built = buildVirtualBlocks([group('a', 3)], new Set());
  // Offsets: header 0..43, rows 43..99, 99..155, 155..211.
  assert.equal(firstBlockEndingAfter(built.offsets, built.blocks, 0), 0);
  assert.equal(firstBlockEndingAfter(built.offsets, built.blocks, 43), 1);
  assert.equal(firstBlockEndingAfter(built.offsets, built.blocks, 211), 4);
  assert.equal(firstBlockStartingAtOrAfter(built.offsets, 0), 0);
  assert.equal(firstBlockStartingAtOrAfter(built.offsets, 44), 2);
  assert.equal(firstBlockStartingAtOrAfter(built.offsets, 211), 4);
});

test('row block lookup finds items and misses unknown ids', () => {
  const built = buildVirtualBlocks([group('a', 2), group('b', 1)], new Set());
  assert.equal(findRowBlockIndex(built.blocks, 'b-0'), 4);
  assert.equal(findRowBlockIndex(built.blocks, 'missing'), -1);
  assert.equal(findRowBlockIndex(built.blocks, 'a-1'), 2);
});

test('custom heights flow into offsets and total height', () => {
  const built = buildVirtualBlocks([group('a', 2)], new Set(), { rowHeight: 60, headerHeight: 40 });
  assert.deepEqual(built.offsets, [0, 40, 100]);
  assert.equal(built.totalHeight, 160);
  assert.equal(VIRTUAL_ROW_HEIGHT, 56);
  assert.equal(VIRTUAL_HEADER_HEIGHT, 43);
});
