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

test('the shared theme uses the original bundled project fonts', () => {
  for (const file of ['main.css', 'public/main.css']) {
    const css = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(css, /font-family: 'Figtree'/, file);
    assert.match(css, /figtree-latin\.woff2/, file);
    assert.match(css, /figtree-italic-latin\.woff2/, file);
    assert.match(css, /font-family: 'Instrument Serif'/, file);
    assert.match(css, /instrument-serif-latin\.woff2/, file);
    assert.match(css, /instrument-serif-italic-latin\.woff2/, file);
    assert.match(css, /--font-ui: 'Figtree'/, file);
    assert.match(css, /--font-sans: 'Figtree'/, file);
    assert.match(css, /--font-serif: 'Instrument Serif'/, file);
  }

  for (const font of [
    'figtree-latin.woff2',
    'figtree-italic-latin.woff2',
    'instrument-serif-latin.woff2',
    'instrument-serif-italic-latin.woff2'
  ]) {
    const source = fs.readFileSync(path.join(root, 'fonts', font));
    const deployed = fs.readFileSync(path.join(root, 'public', 'fonts', font));
    assert.equal(source.subarray(0, 4).toString('ascii'), 'wOF2', font);
    assert.deepEqual(deployed, source, `${font} must stay mirrored into public`);
  }

  for (const base of [root, path.join(root, 'public')]) {
    for (const page of [...pages, 'student-widget.html']) {
      const html = fs.readFileSync(path.join(base, page), 'utf8');
      assert.match(html, /main\.css\?v=20260907-glow2/, `${base}: ${page}`);
    }
  }
});
