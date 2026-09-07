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

test('homepage keeps readable schedule text with the saved handwritten headings', () => {
  for (const base of [root, path.join(root, 'public')]) {
    const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(base, 'main.js'), 'utf8');
    const css = fs.readFileSync(path.join(base, 'main.css'), 'utf8');
    const settings = JSON.parse(fs.readFileSync(path.join(base, 'site-settings.json'), 'utf8'));
    const setHeroLine = source.match(/function setHeroLine[\s\S]*?(?=\r?\nasync function signHeroText)/)?.[0] || '';

    assert.equal(settings.hero.schedulePageEyebrow, 'Currently in');
    assert.doesNotMatch(html, /id="hero-title"[^>]*>—/);
    assert.doesNotMatch(html, /id="hero-eyebrow"[^>]*data-bind="hero\.schedulePageEyebrow"/);
    assert.match(css, /\.hero-eyebrow\s*\{[\s\S]*?font-family:\s*'Alex Brush Local', var\(--font-serif\);/);
    assert.match(css, /\.hero-title\s*\{[\s\S]*?font-family:\s*'Alex Brush Local', var\(--font-serif\);/);
    assert.match(setHeroLine, /_setStyledText\(fallback, styleTarget, text\)/);
    assert.doesNotMatch(setHeroLine, /signHeroText\(/);
  }
});
