#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BACKEND_SETTINGS = path.resolve(ROOT, '..', 'phs-grades-backend-main', 'data', 'site-settings.json');
const sourceFile = path.resolve(process.argv[2] || process.env.BACKEND_SETTINGS_FILE || DEFAULT_BACKEND_SETTINGS);

const PUBLIC_KEYS = [
  'version',
  'branding',
  'nav',
  'hero',
  'countdown',
  'footer',
  'grades',
  'theme',
  'appearance',
  'announcements',
  'privacy',
  'themePresets',
  'bellSchedules',
  'scheduleRules',
  'gradeMelon',
  'siteStatus',
  'scheduleOverride',
  'updatedAt'
];

const PRIVATE_KEYS = new Set([
  'actor',
  'audit',
  'auditlog',
  'authorization',
  'cookie',
  'cookies',
  'email',
  'ip',
  'ips',
  'login',
  'password',
  'passwordHash',
  'passwordhash',
  'secret',
  'secrets',
  'session',
  'sessions',
  'token',
  'tokens'
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertNoPrivateKeys(value, trail = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateKeys(item, trail.concat(String(index))));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const isThemePresetTokenBundle = trail[0] === 'themePresets' && trail.length === 2 && key === 'tokens';
    if (!isThemePresetTokenBundle && PRIVATE_KEYS.has(String(key).toLowerCase())) {
      throw new Error(`Refusing to publish private settings key: ${trail.concat(key).join('.')}`);
    }
    assertNoPrivateKeys(child, trail.concat(key));
  }
}

function publicSnapshot(settings) {
  assertNoPrivateKeys(settings);
  const out = {};
  for (const key of PUBLIC_KEYS) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

const snapshot = publicSnapshot(readJson(sourceFile));
writeJson(path.join(ROOT, 'site-settings.json'), snapshot);
writeJson(path.join(ROOT, 'public', 'site-settings.json'), snapshot);
console.log(`Synced public settings from ${sourceFile}`);
