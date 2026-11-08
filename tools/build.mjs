#!/usr/bin/env node
/**
 * Build a distributable Chrome extension package without npm dependencies.
 *
 *   node tools/build.mjs
 *
 * The version is read from manifest.json. Runtime files are staged under
 * dist/edge-history-for-chrome-<version>/ and the system zip command creates
 * dist/edge-history-for-chrome-<version>.zip with that folder at its root.
 *
 * The archive is reproducible on the same zip implementation: entries are
 * added in sorted order, timestamps and permissions are normalized, and zip
 * runs with -X (no extra uid/gid fields). SOURCE_DATE_EPOCH can override the
 * fixed timestamp.
 */

import { spawnSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');

// Explicit allowlist: never ship tests, tooling, screenshots, CI metadata, or
// other repository files by accident.
const RUNTIME_FILES = [
  'manifest.json',
  'background.js',
  'history.html',
  'history.css',
  'history.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'theme-boot.js',
  'LICENSE',
];
const RUNTIME_DIRS = ['shared', 'icons'];
const OPTIONAL_RUNTIME_DIRS = ['_locales'];

// OS/editor droppings that should never enter a release artifact.
const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

function sourceDateEpoch() {
  const raw = process.env.SOURCE_DATE_EPOCH;
  if (raw === undefined || raw.trim() === '') return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (Number.isNaN(new Date(seconds * 1000).getTime())) return null;
  return seconds;
}

// 2000-01-01T00:00:00Z is safely inside the DOS timestamp range. Using a fixed
// date makes repeated builds byte-for-byte identical.
const BUILD_DATE = new Date((sourceDateEpoch() ?? 946684800) * 1000);

async function statOrNull(target) {
  try {
    return await stat(target);
  } catch {
    return null;
  }
}

function fail(message) {
  throw new Error(message);
}

async function readVersion() {
  let raw;
  try {
    raw = await readFile(path.join(ROOT, 'manifest.json'), 'utf8');
  } catch (error) {
    fail('cannot read manifest.json: ' + error.message);
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    fail('manifest.json is not valid JSON: ' + error.message);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('manifest.json must contain a JSON object');
  }

  const version = manifest.version;
  if (typeof version !== 'string' || version.trim() === '') {
    fail('manifest.json is missing a non-empty "version" string');
  }

  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    fail('manifest.version "' + version + '" is not a three-part semver version');
  }

  return version;
}

function ensureZipCommand() {
  const probe = spawnSync('zip', ['-v'], { encoding: 'utf8' });
  if (probe.error) {
    if (probe.error.code === 'ENOENT') {
      fail('the system "zip" command is required but was not found on PATH');
    }
    fail('could not run the system "zip" command: ' + probe.error.message);
  }
  if (probe.status !== 0) {
    fail('the system "zip" command failed its self-check (exit ' + probe.status + ')');
  }
}

async function assertRuntimePaths() {
  const missing = [];
  for (const name of RUNTIME_FILES) {
    const info = await statOrNull(path.join(ROOT, name));
    if (!info || !info.isFile()) missing.push(name);
  }
  for (const name of RUNTIME_DIRS) {
    const info = await statOrNull(path.join(ROOT, name));
    if (!info || !info.isDirectory()) missing.push(name + '/');
  }
  if (missing.length > 0) {
    fail('missing required runtime path(s): ' + missing.join(', '));
  }

  const localesInfo = await statOrNull(path.join(ROOT, '_locales'));
  if (localesInfo && !localesInfo.isDirectory()) {
    fail('_locales exists but is not a directory');
  }
}

async function copyStable(source, destination) {
  await copyFile(source, destination);
  await chmod(destination, 0o644);
  await utimes(destination, BUILD_DATE, BUILD_DATE);
}

async function copyRuntimeDir(source, destination) {
  const entries = (await readdir(source, { withFileTypes: true })).sort(byName);
  await mkdir(destination, { recursive: true });
  await chmod(destination, 0o755);
  await utimes(destination, BUILD_DATE, BUILD_DATE);

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_NAMES.has(entry.name)) continue;

    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyRuntimeDir(from, to);
    } else if (entry.isFile()) {
      await copyStable(from, to);
    } else {
      fail('unsupported path in runtime directory: ' + path.relative(ROOT, from));
    }
  }
}

async function collectFiles(directory) {
  const files = [];
  const entries = (await readdir(directory, { withFileTypes: true })).sort(byName);
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    } else {
      fail('unsupported path in staging directory: ' + path.relative(ROOT, full));
    }
  }
  return files;
}

async function build() {
  const version = await readVersion();
  ensureZipCommand();
  await assertRuntimePaths();

  const folderName = 'edge-history-for-chrome-' + version;
  const stagingDir = path.join(DIST_DIR, folderName);
  const zipName = folderName + '.zip';
  const zipPath = path.join(DIST_DIR, zipName);

  // Rebuild from scratch so stale files (including old-root utils.js or an old
  // version directory) can never leak into this artifact.
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  await chmod(stagingDir, 0o755);
  await utimes(stagingDir, BUILD_DATE, BUILD_DATE);

  for (const name of RUNTIME_FILES) {
    await copyStable(path.join(ROOT, name), path.join(stagingDir, name));
  }
  for (const name of RUNTIME_DIRS) {
    await copyRuntimeDir(path.join(ROOT, name), path.join(stagingDir, name));
  }
  for (const name of OPTIONAL_RUNTIME_DIRS) {
    const info = await statOrNull(path.join(ROOT, name));
    if (info?.isDirectory()) {
      await copyRuntimeDir(path.join(ROOT, name), path.join(stagingDir, name));
    }
  }

  const stagedFiles = await collectFiles(stagingDir);
  const relativeFiles = stagedFiles.map((file) =>
    path.relative(stagingDir, file).split(path.sep).join('/')
  );
  if (!relativeFiles.includes('LICENSE')) {
    fail('internal error: LICENSE was not staged');
  }

  // Paths include the versioned folder, so the zip has it at its root. Sorting
  // (and the fixed metadata above) keeps repeated archives deterministic.
  const zipEntries = stagedFiles
    .map((file) => path.relative(DIST_DIR, file).split(path.sep).join('/'))
    .sort();

  const result = spawnSync('zip', ['-q', '-X', zipName, ...zipEntries], {
    cwd: DIST_DIR,
    encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC' },
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      fail('the system "zip" command is required but was not found on PATH');
    }
    fail('could not run the system "zip" command: ' + result.error.message);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || '').trim();
    fail('zip failed with exit code ' + result.status + (detail ? ': ' + detail : ''));
  }

  const archive = await statOrNull(zipPath);
  if (!archive || !archive.isFile() || archive.size === 0) {
    fail('zip did not produce a non-empty archive at ' + zipPath);
  }

  console.log('Extension package built successfully.');
  console.log('  Version:           ' + version);
  console.log('  Staging directory: ' + stagingDir);
  console.log('  Zip archive:       ' + zipPath);
  console.log('  Archive root:      ' + folderName + '/');
  console.log('  Files packaged:    ' + stagedFiles.length);
  console.log('  LICENSE:           included');
}

try {
  await build();
} catch (error) {
  console.error('Build failed: ' + error.message);
  process.exitCode = 1;
}
