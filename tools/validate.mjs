#!/usr/bin/env node
/**
 * Dependency-free validation for the unpacked Chrome extension.
 *
 *   node tools/validate.mjs
 *
 * Checks the manifest basics, icon/service-worker files, local HTML script and
 * stylesheet references, and (when present) the _locales message catalogs.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const checks = [];

const error = (message) => errors.push(message);
const rel = (target) => path.relative(ROOT, target).split(path.sep).join('/') || '.';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MESSAGE_REFERENCE = /__MSG_([A-Za-z0-9_@]+)__/g;

async function statOrNull(target) {
  try {
    return await stat(target);
  } catch {
    return null;
  }
}

async function isFile(target) {
  const info = await statOrNull(target);
  return Boolean(info?.isFile());
}

function isExternalReference(reference) {
  const value = reference.trim();
  return (
    value === '' ||
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

function localTarget(reference) {
  let value = reference.trim().split('#')[0].split('?')[0];
  if (value.startsWith('/')) value = value.slice(1);
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep malformed escapes as-is; the existence check will report them.
  }
  return path.resolve(ROOT, value);
}

function isInsideRoot(target) {
  const relative = path.relative(ROOT, target);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

async function checkManifestFile(reference, description) {
  if (typeof reference !== 'string' || reference.trim() === '') {
    error(description + ' must be a non-empty local path');
    return false;
  }
  if (isExternalReference(reference)) {
    error(description + ' must be a local path, got "' + reference + '"');
    return false;
  }

  const target = localTarget(reference);
  if (!isInsideRoot(target)) {
    error(description + ' escapes the extension directory: "' + reference + '"');
    return false;
  }
  if (!(await isFile(target))) {
    error(description + ' not found: ' + rel(target) + ' (from "' + reference + '")');
    return false;
  }
  return true;
}

async function checkHtmlFileReference(reference, htmlFile, line, description) {
  if (isExternalReference(reference)) return false;

  const target = localTarget(reference);
  if (!isInsideRoot(target)) {
    error(htmlFile + ':' + line + ': ' + description + ' escapes the extension directory: "' + reference + '"');
    return false;
  }
  if (!(await isFile(target))) {
    error(htmlFile + ':' + line + ': ' + description + ' not found: ' + rel(target) + ' (from "' + reference + '")');
    return false;
  }
  return true;
}

function getAttribute(attributes, name) {
  const pattern = new RegExp(
    '(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|' + "'([^']*)'" + '|([^\\s"' + "=<>" + ']+))',
    'i'
  );
  const match = attributes.match(pattern);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? '';
}

function stripHtmlComments(html) {
  // Preserve newlines so reported line numbers still match the source file.
  return html.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function collectMessageReferences(value, output = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(MESSAGE_REFERENCE)) {
      // @@ui_locale / @@extension_id are Chrome predefined messages and do not
      // need catalog entries.
      if (!match[1].startsWith('@@')) output.add(match[1]);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectMessageReferences(item, output);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectMessageReferences(item, output);
  }
  return output;
}

async function readMessages(file, label) {
  if (!(await isFile(file))) {
    error(label + ': missing ' + rel(file));
    return null;
  }

  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (readError) {
    error(label + ': cannot read ' + rel(file) + ': ' + readError.message);
    return null;
  }

  let messages;
  try {
    messages = JSON.parse(raw);
  } catch (parseError) {
    error(label + ': ' + rel(file) + ' is not valid JSON: ' + parseError.message);
    return null;
  }

  if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
    error(label + ': ' + rel(file) + ' must contain a JSON object');
    return null;
  }

  return messages;
}

function checkMessageReferences(messages, references, label) {
  const lowerCaseKeys = new Map(
    Object.keys(messages).map((key) => [key.toLowerCase(), key])
  );

  for (const name of references) {
    const key = Object.prototype.hasOwnProperty.call(messages, name)
      ? name
      : lowerCaseKeys.get(name.toLowerCase());

    if (!key) {
      error(label + ': missing message "' + name + '" referenced by manifest.json');
      continue;
    }

    const entry = messages[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.message !== 'string') {
      error(label + ': message "' + key + '" must be an object with a string "message" field');
    }
  }
}

async function validateHtmlReferences(htmlFiles) {
  let localReferences = 0;

  for (const htmlFile of htmlFiles) {
    const html = stripHtmlComments(await readFile(path.join(ROOT, htmlFile), 'utf8'));

    for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
      const src = getAttribute(match[1], 'src');
      if (src === null) continue; // inline script: no local file to resolve

      const line = html.slice(0, match.index).split('\n').length;
      if (src.trim() === '') {
        error(htmlFile + ':' + line + ': <script src> must not be empty');
        continue;
      }
      if (await checkHtmlFileReference(src, htmlFile, line, 'script src')) {
        localReferences += 1;
      }
    }

    for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
      const attributes = match[1];
      const relValue = getAttribute(attributes, 'rel') ?? '';
      if (!/(?:^|\s)stylesheet(?:\s|$)/i.test(relValue)) continue;

      const href = getAttribute(attributes, 'href');
      const line = html.slice(0, match.index).split('\n').length;
      if (href === null || href.trim() === '') {
        error(htmlFile + ':' + line + ': stylesheet <link> is missing a non-empty href');
        continue;
      }
      if (await checkHtmlFileReference(href, htmlFile, line, 'stylesheet href')) {
        localReferences += 1;
      }
    }
  }

  if (localReferences > 0) {
    checks.push(localReferences + ' local HTML script/stylesheet reference(s) in ' + htmlFiles.length + ' file(s)');
  }
}

async function validateIcons(icons, label) {
  if (icons === undefined) {
    error(label + ' is missing');
    return 0;
  }

  if (typeof icons === 'string') {
    return (await checkManifestFile(icons, label)) ? 1 : 0;
  }

  if (!icons || typeof icons !== 'object' || Array.isArray(icons) || Object.keys(icons).length === 0) {
    error(label + ' must be a non-empty object mapping icon sizes to paths');
    return 0;
  }

  let verified = 0;
  for (const [size, iconPath] of Object.entries(icons)) {
    if (!/^\d+$/.test(size)) {
      error(label + '.' + size + ' key must be a numeric icon size');
    }
    if (await checkManifestFile(iconPath, label + '.' + size)) {
      verified += 1;
    }
  }
  return verified;
}

async function main() {
  let rawManifest;
  try {
    rawManifest = await readFile(path.join(ROOT, 'manifest.json'), 'utf8');
  } catch (manifestError) {
    console.error('ERROR: cannot read manifest.json: ' + manifestError.message);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (parseError) {
    console.error('ERROR: manifest.json is not valid JSON: ' + parseError.message);
    process.exit(1);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    console.error('ERROR: manifest.json must contain a JSON object.');
    process.exit(1);
  }

  if (manifest.manifest_version !== 3) {
    error('manifest.manifest_version must be 3 (found ' + JSON.stringify(manifest.manifest_version) + ')');
  } else {
    checks.push('manifest_version 3');
  }

  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    error('manifest.name must be a non-empty string');
  }

  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
    error('manifest.version must be a three-part semver string such as "1.2.0" (found ' + JSON.stringify(manifest.version) + ')');
  } else {
    checks.push('version ' + manifest.version);
  }

  const iconCount = await validateIcons(manifest.icons, 'manifest.icons');
  if (iconCount > 0) checks.push(iconCount + ' manifest icon path(s)');

  if (manifest.action !== undefined) {
    if (!manifest.action || typeof manifest.action !== 'object' || Array.isArray(manifest.action)) {
      error('manifest.action must be an object');
    } else {
      if (manifest.action.default_icon !== undefined) {
        await validateIcons(manifest.action.default_icon, 'manifest.action.default_icon');
      }
      if (manifest.action.default_popup !== undefined) {
        await checkManifestFile(manifest.action.default_popup, 'manifest.action.default_popup');
      }
    }
  }

  const serviceWorker = manifest.background?.service_worker;
  if (typeof serviceWorker !== 'string' || serviceWorker.trim() === '') {
    error('manifest.background.service_worker is required for a Manifest V3 extension');
  } else if (await checkManifestFile(serviceWorker, 'manifest.background.service_worker')) {
    checks.push('service worker ' + serviceWorker);
  }

  const rootEntries = await readdir(ROOT, { withFileTypes: true });
  const htmlFiles = rootEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => entry.name)
    .sort();
  await validateHtmlReferences(htmlFiles);

  const localesDir = path.join(ROOT, '_locales');
  const localesInfo = await statOrNull(localesDir);
  const hasLocalesDir = Boolean(localesInfo?.isDirectory());
  if (localesInfo && !hasLocalesDir) {
    error('_locales must be a directory, not a file');
  }
  const defaultLocale = typeof manifest.default_locale === 'string'
    ? manifest.default_locale.trim()
    : '';
  const messageReferences = [...collectMessageReferences(manifest)].sort();

  if (hasLocalesDir && defaultLocale === '') {
    error('_locales/ exists but manifest.default_locale is not set');
  }

  const validDefaultLocale = defaultLocale !== '' &&
    /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/.test(defaultLocale);
  if (defaultLocale !== '' && !validDefaultLocale) {
    error('manifest.default_locale "' + defaultLocale + '" is not a valid locale name');
  }

  if (messageReferences.length > 0 && !hasLocalesDir && defaultLocale === '') {
    error('manifest.json references ' + messageReferences.length + ' __MSG_... message(s) but has no default_locale/_locales');
  }

  if (hasLocalesDir || validDefaultLocale) {
    let localesVerified = 0;

    if (validDefaultLocale) {
      const defaultFile = path.join(localesDir, defaultLocale, 'messages.json');
      const defaultMessages = await readMessages(defaultFile, 'default locale "' + defaultLocale + '"');
      if (defaultMessages) {
        checkMessageReferences(defaultMessages, messageReferences, 'default locale "' + defaultLocale + '"');
        localesVerified += 1;
      }
    }

    for (const locale of ['zh_CN', 'en']) {
      // The default locale was already read and checked above.
      if (locale === defaultLocale) continue;

      const localeDir = path.join(localesDir, locale);
      const info = await statOrNull(localeDir);
      if (!info) continue;
      if (!info.isDirectory()) {
        error('_locales/' + locale + ' must be a directory');
        continue;
      }

      const messagesFile = path.join(localeDir, 'messages.json');
      const messages = await readMessages(messagesFile, 'locale "' + locale + '"');
      if (messages) {
        checkMessageReferences(messages, messageReferences, 'locale "' + locale + '"');
        localesVerified += 1;
      }
    }

    if (localesVerified > 0) {
      checks.push(localesVerified + ' locale message catalog(s)');
    }
  } else {
    checks.push('locales skipped (no _locales/ and no default_locale)');
  }

  if (errors.length > 0) {
    console.error('Extension validation failed with ' + errors.length + ' error(s):');
    for (const message of errors) console.error('  - ' + message);
    process.exit(1);
  }

  console.log('Extension validation passed.');
  for (const check of checks) console.log('  - ' + check);
}

try {
  await main();
} catch (unexpected) {
  console.error('ERROR: validation crashed: ' + unexpected.message);
  process.exit(1);
}
