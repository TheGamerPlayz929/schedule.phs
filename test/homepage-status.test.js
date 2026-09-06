const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('homepage renders schedule state without a status pill', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'main.css'), 'utf8');

  assert.doesNotMatch(html, /id="status-(?:pill|label)"/);
  assert.doesNotMatch(source, /statusPill|statusLabel|status-pill|status-label/);
  assert.doesNotMatch(css, /\.status-(?:badge|dot)\b/);
  assert.match(source, /if \(domRefs\.heroTitle && domRefs\.heroEyebrow\)/);
});

test('deployed homepage also renders without a status pill', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'public', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'main.css'), 'utf8');

  assert.doesNotMatch(html, /id="status-(?:pill|label)"/);
  assert.doesNotMatch(source, /statusPill|statusLabel|status-pill|status-label/);
  assert.doesNotMatch(css, /\.status-(?:badge|dot)\b/);
});
