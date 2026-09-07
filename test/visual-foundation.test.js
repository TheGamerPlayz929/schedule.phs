const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const pages = ['index.html', 'announcements.html', 'gradeviewer.html', 'privacy.html'];

test('public pages no longer load the dotted glyph canvas', () => {
  for (const base of [root, path.join(root, 'public')]) {
    for (const page of pages) {
      const html = fs.readFileSync(path.join(base, page), 'utf8');
      assert.doesNotMatch(html, /site-bg-canvas|phs-background\.js/, `${base}: ${page}`);
    }
  }
});

test('the shared theme uses the bundled project fonts', () => {
  for (const file of ['main.css', 'public/main.css']) {
    const css = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(css, /font-family: 'PHS Geist'/, file);
    assert.match(css, /fonts\/geist-latin\.woff2/, file);
    assert.match(css, /font-family: 'PHS Cormorant'/, file);
    assert.match(css, /CormorantGaramond-MediumItalic-latin\.woff2/, file);
    assert.match(css, /--font-sans: 'PHS Geist'/, file);
    assert.match(css, /--font-serif: 'PHS Cormorant'/, file);
  }
});
