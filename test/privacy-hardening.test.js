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

test('anonymous analytics run on every visit without a consent gate', () => {
  const source = fs.readFileSync(path.join(root, 'privacy-analytics.js'), 'utf8');
  assert.match(source, /credentials: 'omit'/);
  assert.match(source, /LEGACY_CONSENT_KEYS\.forEach\(key => localStorage\.removeItem\(key\)\)/);
  assert.doesNotMatch(source, /consentGranted\(\)/);
  assert.doesNotMatch(source, /aggregate-analytics-toggle/);
  assert.doesNotMatch(source, /navigator\.globalPrivacyControl === true \|\|/);
  assert.doesNotMatch(source, /if \(isLocal \|\| privacySignal/);
});

test('anonymous analytics events stay free of identifiers', () => {
  const source = fs.readFileSync(path.join(root, 'privacy-analytics.js'), 'utf8');
  const start = source.indexOf('function post(');
  const end = source.indexOf('function sendDuration(', start);
  const payloadSource = source.slice(start, end);
  assert.match(payloadSource, /JSON\.stringify\(\{ page, device, \.\.\.payload \}\)/);
  assert.doesNotMatch(source, /email|username|userAgent|googletagmanager|document\.cookie/i);
});

test('privacy notice discloses always-on analytics, retention, providers, and rights', () => {
  const html = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  for (const phrase of [
    'Last updated September 5, 2026',
    'Analytics are always on',
    'There is no opt-in or opt-out control',
    'We do not currently respond to DNT or GPC browser signals',
    'held in server memory for up to eight hours',
    'limited to 90 days',
    'We do not sell personal data',
    'not a school or district service',
    'request correction or deletion',
    'appeal a denied request'
  ]) assert.match(html, new RegExp(phrase, 'i'), phrase);
});

test('privacy notice keeps every table-of-contents anchor resolvable', () => {
  const html = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  const anchors = [...html.matchAll(/href="#(s\d+)"/g)].map(match => match[1]);
  assert.equal(anchors.length, 7);
  for (const anchor of anchors) assert.match(html, new RegExp(`<section id="${anchor}">`), anchor);
});

test('the removed analytics consent toggle is gone from the privacy page', () => {
  const html = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  assert.doesNotMatch(html, /aggregate-analytics-toggle|privacy-choice|Allow anonymous aggregate analytics/);
});

test('privacy-sensitive source files match their deployed public copies', () => {
  for (const file of ['privacy.html', 'privacy.css', 'privacy-analytics.js', 'main.css', 'main.js', 'site-settings.json']) {
    assert.equal(
      fs.readFileSync(path.join(root, file), 'utf8'),
      fs.readFileSync(path.join(root, 'public', file), 'utf8'),
      file
    );
  }
});

test('public policy distinguishes the schedule from embedded GradeViewer', () => {
  const html = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  assert.match(html, /schedule and announcements pages have no registration or sign-in/i);
  assert.match(html, /Grades tab embeds GradeViewer/);
  assert.doesNotMatch(html, /Administrator access|Administrator sessions|configured AI provider|Younger users|Google Identity Services/);
});
