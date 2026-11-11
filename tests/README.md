# CDP regression harness

Dependency-free Chrome DevTools Protocol tests for the Edge History extension.
Everything uses Node 22 built-ins (including the global `WebSocket`) plus a
Chrome for Testing binary; there are no npm packages or test frameworks.

## Requirements

- Node **22+** (global `WebSocket`, `node:http`, `node:assert/strict`).
- Linux x64 was used for validation.
- Chrome for Testing 156 by default:
  `/home/tiandc/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.
  Override with `CHROME_BIN=/path/to/chrome`.
- **Use Chrome for Testing.** Branded/stable Chrome 157 ignores
  `--load-extension`, so extension tests cannot run there.

Each Chrome launch gets a fresh temporary `HOME` and `--user-data-dir` under
`/tmp/edge-history-cdp-*`. The real Chrome profile is never touched. Chrome runs
headless with `--no-sandbox`, `--disable-gpu`, an ephemeral debugging port
(`--remote-debugging-port=0`), and `TZ=UTC`. Temp directories are removed and
the whole Chrome process group is killed on normal exit, test failure, and
SIGINT/SIGTERM.

## Run

From the repository root:

```bash
NODE_USE_ENV_PROXY=0 node tests/run.mjs
node --test tests/unit/*.test.mjs
```

The CDP runner exits `0` only when every test passes. The full suite currently
has **19** tests and takes about 60 seconds on the development machine
(5,000-row pagination is the slowest at about 8 seconds, and the delayed
delete test waits out its 30-second undo window).

Example summary:

```text
Edge History CDP regression suite
[1] demo history: 18 date groups / 36 rows, no page errors
    PASS (0.37s)
...
[19] real action popup: 378px, no outer scroll, English and Chinese
    PASS (1.26s)

19 passed, 0 failed, 19 total (62.28s)
```

If the environment sets `NODE_USE_ENV_PROXY=1` (the DSH environment does), Node
prints a harmless `UNDICI-EHPA` experimental warning on stderr. Silence it with:

```bash
NODE_USE_ENV_PROXY=0 node tests/run.mjs
```

## Coverage

### Baseline / layout

| Test | What it checks |
| --- | --- |
| demo history | `history.html?demo=1` loads **18 date groups / 36 rows** with no uncaught exceptions or `console.error` calls. The list is virtualized, so the totals are read from the result counter and the groups are collected by scrolling. |
| demo popup | `popup.html?demo=1` at 378x500 has a 378px content width and no whole-window outer scrollbar. |
| real extension | The unpacked extension loads via `--load-extension`, the path-derived ID matches `chrome.runtime.id`, and `chrome.history` exists. |
| real action popup | `chrome.action.openPopup()` opens a real `popup.html` target at **378x500** with no outer scroll. |

### Feature regressions

| Test | What it checks |
| --- | --- |
| demo i18n | English shell labels, date headers, count formatting, settings dialog, and immediate English -> Chinese -> English switching without reload. |
| demo popup i18n/layout | English and Chinese labels, 37-row list, 378x500 and **378x470** viewports with no outer scroll, and an internally scrolling list. |
| demo empty states | English history, recently closed and devices empty states contain no Chinese UI text. |
| 300 tied timestamps | 300 rows split across Today/Yesterday with tied timestamps at midnight all load (100 + widened pagination), 150 rows per group. The list is virtualized, so totals are read from the result counter and the groups are checked at the top and bottom of the list. |
| 5,000 rows | The full page scrolls/loads all 5,000 rows with no page errors. Only the visible window (about 100 rows) is in the DOM; scrolling to the bottom reaches the last row, collapsing the first group hides its rows, and the undo toast restores a deleted row. |
| duplicate merge | 8 URL variants merge into 3 rows with visit counts 10/2/3; turning merge off gives 8 rows; turning it back on gives 3. |
| popup 300 tied | The popup's 60-row pagination also widens across a tied boundary and loads all 300 rows. |
| delayed delete | Deleting a row hides it and shows a 30-second undo toast; undo restores the row and leaves demo history untouched, while letting the window expire really deletes the URL. |
| update reminder | `?update=1` seeds a fake 9.9.9 release: the banner shows the version and the release link, dismissing records the version in storage, and a plain demo load shows no banner. |
| export | CSV has BOM, CRLF, English headers and 36 data rows; JSON has count 36, 36 items and scope `All history`. |
| extension i18n | Real extension empty/settings/clear/export/recently-closed/devices views in English contain no CJK; switching to Chinese updates the page immediately. |
| storage | 1.2.0-style local settings migrate to `chrome.storage.sync`; a popup page follows language/theme changes live. |
| context menu / omnibox | `contextMenus` permission and menu item exist; manifest omnibox keyword is `hist`; localized strings work; a runtime search message updates the open full page to `?q=alpha`. |
| recently closed refresh | Leaving and re-entering Recently closed after closing another tab refreshes the session list (count grows). |
| action popup i18n | Real action popup is 378px wide, has no outer scroll and follows English/Chinese from sync settings. |

### Unit tests

- `settings.test.mjs`: sync write/read, local fallback, migration marker,
  overwrite protection, save fallback and `onChanged`.
- `i18n.test.mjs`: language resolution, plurals/interpolation, Intl date and
  number formatting, dictionary parity, no CJK in English, data-i18n coverage.
- `pagination.test.mjs`: normal cursor pages, short pages, tied timestamps,
  widened requests, range boundary and the 5,000-row cap.
- `search.test.mjs`: query normalization, host extraction, XML escaping and
  title + domain omnibox suggestions.
- `dates.test.mjs`: America/New_York DST spring-forward/fall-back day lengths,
  local midnight, yesterday/7-day bounds and date headers.
- `pending-delete.test.mjs`: pending-delete snapshots, 30-second expiry,
  malformed-entry filtering, restore without duplication, and the
  chrome.storage.local round-trip.
- `virtual-list.test.mjs`: flattening date groups into fixed-height blocks,
  collapsed groups, window cuts with overscan, binary-search boundaries and
  row block lookup.
- `update-check.test.mjs`: version parsing and comparison, latest-release
  payload parsing, the once-a-day gate, dismissal, failure paths and the
  chrome.storage.local round-trip.

## Demo fixtures

The default `?demo=1` data remains the 36-row screenshot fixture. Query
parameters add deterministic test data:

| Parameter | Fixture |
| --- | --- |
| `empty=1` | No history, recently closed or device tabs. |
| `duplicates=1` | 8 URL variants that merge into 3 rows (10/2/3 visits). |
| `count=N` | N synthetic pages spread across recent days. |
| `count=N&tie=1` | N pages split across the midnight boundary with tied `lastVisitTime` values. |
| `update=1` | Seeds a fake 9.9.9 release so the update banner shows (demo only, no network). |

The harness launches Chrome with `TZ=UTC` and `pinClock()` replaces
`Date.now()` in demo pages with **2026-11-08T15:00:00Z** before any page script
runs. That makes the 18-group baseline deterministic. Real extension tests are
not clock-pinned.

## Harness API (`tests/lib/cdp.mjs`)

- `launchChrome({ extensionPath, chromeBin, windowSize, timezone, extraArgs })`
  -> isolated Chrome instance with `targets()`, `newPage()`,
  `waitForTarget()`, `connectToTarget()`, `windowForTarget()`,
  `setWindowBounds()`, `closeTarget()`, and `close()`.
- `createStaticServer({ root })` -> local HTTP server on port 0 with correct
  MIME types and `close()`.
- `loadExtension(chrome, extensionDir)` -> opens the history page, verifies the
  path-derived extension ID, and returns
  `{ extensionId, extensionUrl, page, runtime }`.
- `openActionPopup(chrome, extensionPage)` -> calls
  `chrome.action.openPopup()` and returns the attached `popup.html` session.
- `PageSession`: `evaluate()`, `waitForFunction()`, `navigate()`,
  `setViewport()`, `addInitScript()`, `screenshot(path)`, `close()`.
- `capturePageErrors(page)` -> `{ errors, stop() }` for uncaught exceptions and
  `console.error`.
- `pinClock(page, timestamp)` -> deterministic `Date.now()` for demo pages.
- `computeUnpackedExtensionId(path)` -> SHA-256 of the absolute path, first 16
  bytes as hex mapped `0..f -> a..p`.

## Known limitations

- **Real action-popup resize is not testable in this headless Chrome.** The
  popup itself opens correctly at 378x500 and passes layout checks, but
  `Browser.getWindowForTarget(popup.targetId)` fails with
  `Browser window not found`; `Emulation.setDeviceMetricsOverride` also fails
  with `Target does not support metrics override`. The real popup stays at
  378x500 even when the browser window is launched at 470px high. The 470px
  branch is covered by the popup page viewport test; verify a real action
  popup at ~470px manually if needed.
- The extension automatically opens `history.html?welcome=1` on a fresh install.
  The harness leaves that page alone and opens its own history page for testing.
- The static server and DevTools attach are local-only; no network access or
  external fixture service is needed.
- The extension ID derivation assumes Chrome's POSIX path hashing. It is verified
  at runtime; a mismatch fails loudly and lists visible extension targets.

## CI

`.github/workflows/ci.yml` runs syntax checks, manifest/locale validation, unit
tests and packaging on every push/PR. The CDP suite does not download a browser
in CI; it runs only when `RUN_CDP_TESTS=1` and `CHROME_BIN` point to a Chrome
for Testing binary. Stable Chrome is not used because it ignores
`--load-extension`.

## Files

- `tests/lib/cdp.mjs` — launch/CDP/static-server/extension/popup helpers.
- `tests/baseline.mjs` — layout and real action popup baseline.
- `tests/demo-features.mjs` — i18n, empty states, pagination, merge, export.
- `tests/extension-features.mjs` — real API, storage, menu/omnibox, sessions.
- `tests/unit/` — Node `node:test` unit suites.
- `tests/run.mjs` — tiny runner, pass/fail output, nonzero exit on failure.
