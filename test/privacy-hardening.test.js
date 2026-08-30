const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('public pages do not load advertising analytics or remote Google fonts', () => {
  for (const file of ['index.html', 'announcements.html', 'gradeviewer.html', 'privacy.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(html, /google-analytics|googletagmanager|fonts\.googleapis|fonts\.gstatic/i, file);
  }
  assert.equal(fs.existsSync(path.join(root, 'google-analytics.js')), false);
});

test('anonymous analytics requires explicit browser consent and respects privacy signals', () => {
  const source = fs.readFileSync(path.join(root, 'privacy-analytics.js'), 'utf8');
  assert.match(source, /navigator\.globalPrivacyControl === true/);
  assert.match(source, /navigator\.doNotTrack === '1'/);
  assert.match(source, /phs:privacy:analytics-consent:v2/);
  assert.match(source, /=== 'granted'/);
  assert.match(source, /credentials: 'omit'/);
  assert.doesNotMatch(source, /analytics-optout:v1/);
  assert.doesNotMatch(source, /cookie|email|username|userAgent|googletagmanager/i);
});

test('privacy notice covers authenticated data, retention, providers, children, and rights', () => {
  const html = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  for (const phrase of [
    'Effective August 30, 2026',
    'Analytics stay off unless you enable them',
    'Totals are deleted after 90 days',
    'District session cookies are kept in server memory for up to eight hours',
    'keyed, one-way network identifier',
    'audit records and settings backups are limited to 90 days',
    'We do not sell personal data',
    'not directed to children under 13',
    'not a school or district service',
    'request correction or deletion',
    'appeal a denied request'
  ]) assert.match(html, new RegExp(phrase, 'i'));
});

test('privacy-sensitive source files match their deployed public copies', () => {
  for (const file of ['privacy.html', 'privacy-analytics.js', 'main.css', 'main.js', 'site-settings.json']) {
    assert.equal(
      fs.readFileSync(path.join(root, file), 'utf8'),
      fs.readFileSync(path.join(root, 'public', file), 'utf8'),
      file
    );
  }
});
