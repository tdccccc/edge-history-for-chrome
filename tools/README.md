# tools/

Build and validation helpers. They use only Node.js built-ins (Node 22) and the
system `zip` command, so no `npm install` is required.

## Validate

```bash
node tools/validate.mjs
```

Checks the Manifest V3 fields, icon/service-worker files, local HTML script and
stylesheet references, and (when `_locales/` is present) `messages.json`
catalogs and every `__MSG_...__` lookup in `manifest.json`.

## Package

```bash
node tools/build.mjs
```

Reads the version from `manifest.json` and writes:

- `dist/edge-history-for-chrome-<version>/` (unpacked, runtime files only)
- `dist/edge-history-for-chrome-<version>.zip` (versioned folder at the root)

`dist/` is gitignored. Builds are normalized (sorted entries, fixed
timestamps, `zip -X`) so repeated runs produce the same archive; set
`SOURCE_DATE_EPOCH` to override the timestamp.
