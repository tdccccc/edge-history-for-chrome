/**
 * Pure virtual-list helpers for the history page.
 *
 * The history page renders only a window of the loaded rows: the flat block
 * list below is the unit the window is cut from. Heights are estimates that
 * history.js calibrates against real rendered rows once (rows are
 * single-line, so their height is stable). Nothing here touches the DOM.
 */

// Measured defaults: .history-row is min-height 56px, .group-head is 43px.
export const VIRTUAL_ROW_HEIGHT = 56;
export const VIRTUAL_HEADER_HEIGHT = 43;
// Blocks of overscan rendered above and below the visible viewport.
export const VIRTUAL_OVERSCAN_BLOCKS = 30;

/**
 * Flatten date groups into a list of fixed-height blocks.
 *
 * `groups` is the output of groupItemsByDate(); `collapsed` is the set of
 * group keys whose rows are hidden. A collapsed group contributes only its
 * header block. Pending-delete rows never reach this function: they are
 * removed from state.items while they wait, so they take no space here.
 *
 * Returns { blocks, offsets, totalHeight } where offsets[i] is the pixel
 * offset of the top of blocks[i] and totalHeight is the full list height.
 */
export function buildVirtualBlocks(groups, collapsed, {
  rowHeight = VIRTUAL_ROW_HEIGHT,
  headerHeight = VIRTUAL_HEADER_HEIGHT
} = {}) {
  const blocks = [];
  const offsets = [];
  let top = 0;

  for (const group of groups) {
    offsets.push(top);
    blocks.push({ kind: 'header', group, height: headerHeight });
    top += headerHeight;
    if (collapsed?.has(group.key)) continue;
    for (const item of group.items) {
      offsets.push(top);
      blocks.push({ kind: 'row', group, item, height: rowHeight });
      top += rowHeight;
    }
  }

  return { blocks, offsets, totalHeight: top };
}

// Smallest index whose block bottom is strictly below y (blocks.length when
// every block ends at or above y).
export function firstBlockEndingAfter(offsets, blocks, y) {
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] + blocks[mid].height > y) high = mid;
    else low = mid + 1;
  }
  return low;
}

// Smallest index whose block top is at or after y (blocks.length when every
// block starts above y).
export function firstBlockStartingAtOrAfter(offsets, y) {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] >= y) high = mid;
    else low = mid + 1;
  }
  return low;
}

/**
 * Cut the render window out of a built block list.
 *
 * Returns { start, end, topHeight, bottomHeight }: render blocks
 * [start, end) and pad them with spacers of the given heights so the list
 * keeps its full scroll height. The window covers the viewport plus
 * `overscan` blocks on each side.
 */
export function computeVirtualWindow({ blocks, offsets, totalHeight }, scrollTop, viewportHeight, overscan = VIRTUAL_OVERSCAN_BLOCKS) {
  if (!blocks.length) {
    return { start: 0, end: 0, topHeight: 0, bottomHeight: 0 };
  }

  const clampedTop = Math.max(0, scrollTop);
  const firstVisible = firstBlockEndingAfter(offsets, blocks, clampedTop);
  const firstBelow = firstBlockStartingAtOrAfter(offsets, clampedTop + Math.max(0, viewportHeight));
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(blocks.length, firstBelow + overscan);
  const topHeight = offsets[start];
  const bottomHeight = end > 0
    ? totalHeight - (offsets[end - 1] + blocks[end - 1].height)
    : totalHeight;

  return { start, end, topHeight, bottomHeight };
}

/**
 * Find the block index for a row item, or -1 when it is not in the list.
 * Used to scroll a specific row into the render window.
 */
export function findRowBlockIndex(blocks, itemId) {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind === 'row' && block.item._id === itemId) return index;
  }
  return -1;
}
