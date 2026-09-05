const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const pages = ['admin-login.html', 'public/admin-login.html'];

function readPage(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('sign-in page keeps only what the reference kept', () => {
  for (const file of pages) {
    const html = readPage(file);
    assert.match(html, /<h1>Welcome back<\/h1>/, file);
    assert.match(html, /This is where the magic happens\./, file);
    assert.match(html, /id="google-login-btn"/, file);
    assert.match(html, /id="login-status"/, file);
    assert.match(html, /id="login-canvas"/, file);
  }
});

test('sign-in page drops the navbar, email field, divider, and legal copy', () => {
  for (const file of pages) {
    const html = readPage(file);
    for (const gone of [
      /class="topbar/,
      /brand-dots/,
      /class="rule"/,
      /class="legal"/,
      /type="email"/,
      /Manifesto|Careers|Signup/,
      /approved accounts only/,
      /Privacy Notice/
    ]) assert.doesNotMatch(html, gone, `${file}: ${gone}`);
  }
});

test('sign-in page uses compact sign-in typography and the approved button', () => {
  for (const file of pages) {
    const html = readPage(file);
    assert.match(html, /max-width: 20rem/, file);
    assert.match(html, /font-size: 1\.75rem/, file);
    assert.match(html, /letter-spacing: -0\.025em/, file);
    assert.match(html, /font-size: 14px/, file);
    assert.match(html, /font-weight: 500/, file);
    assert.match(html, /border-radius: 10px/, file);
  }
});

test('sign-in page carries no vibecoded tells', () => {
  for (const file of pages) {
    const html = readPage(file);
    assert.doesNotMatch(html, /backdrop-filter/, file);
    assert.doesNotMatch(html, /\u2014/, file);
    assert.doesNotMatch(html, /Inter/, file);
    /* Three background vignettes and the owner's soft charcoal shimmer mask. */
    const gradients = html.match(/linear-gradient|radial-gradient/g) || [];
    assert.equal(gradients.length, 4, `${file} should have 3 vignettes and 1 brand shimmer mask`);
  }
});

test('sign-in page reserves the Google button box before it loads', () => {
  for (const file of pages) {
    assert.match(readPage(file), /id="google-login-placeholder"/, file);
  }
  for (const file of ['admin-login.js', 'public/admin-login.js']) {
    const js = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(js, /function hidePlaceholder\(\)/, file);
    /* Every path that ends without a Google button must clear the placeholder. */
    assert.equal((js.match(/hidePlaceholder\(\)/g) || []).length, 5, file);
  }
});

test('sign-in assets stay mirrored into public', () => {
  for (const file of ['admin-login.html', 'admin-login.js', 'admin-login-canvas.js']) {
    assert.equal(
      fs.readFileSync(path.join(root, file), 'utf8'),
      fs.readFileSync(path.join(root, 'public', file), 'utf8'),
      file
    );
  }
});
