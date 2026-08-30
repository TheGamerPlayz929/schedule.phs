const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const adminUrl = 'https://phs-grades-backend.onrender.com/admin';

test('Firebase admin routes redirect to the first-party backend login', () => {
  const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const redirects = firebase.hosting.redirects || [];

  for (const source of ['/admin', '/admin/', '/admin.html']) {
    assert.deepEqual(
      redirects.find(redirect => redirect.source === source),
      { source, destination: adminUrl, type: 302 }
    );
  }
});

test('static admin entry files retain a backend redirect fallback', () => {
  for (const file of ['admin.html', 'admin/index.html', 'public/admin.html', 'public/admin/index.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /http-equiv="refresh" content="0;url=https:\/\/phs-grades-backend\.onrender\.com\/admin"/i);
    assert.match(html, /href="https:\/\/phs-grades-backend\.onrender\.com\/admin"/i);
    assert.doesNotMatch(html, /accounts\.google\.com\/gsi\/client/);
  }
});

test('Firebase Google login uses a top-level form handoff to establish a first-party backend cookie', () => {
  for (const file of ['admin-login.html', 'public/admin-login.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /accounts\.google\.com\/gsi\/client/);
    assert.match(html, /admin-login\.js/);
    assert.match(html, /rel="icon" href="phs-logo-96\.png"/);
    assert.match(html, /name="referrer" content="strict-origin"/);
    assert.doesNotMatch(html, /name="referrer" content="no-referrer"/);
  }

  for (const file of ['admin-login.js', 'public/admin-login.js']) {
    const js = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(js, /form\.method = 'POST'/);
    assert.match(js, /form\.action = BACKEND \+ '\/admin\/google-login'/);
    assert.match(js, /input\.name = 'credential'/);
    assert.match(js, /form\.requestSubmit\(\)/);
    assert.match(js, /session: 'Google sign-in succeeded/);
    assert.match(js, /if \(!errors\[errorCode\]\) setStatus\('Admin backend is waking up/);
    assert.match(js, /const buttonWidth = Math\.min\(320, Math\.max\(200, window\.innerWidth - 106\)\);/);
    assert.match(js, /width: buttonWidth/);
    assert.doesNotMatch(js, /fetch\(BACKEND \+ '\/admin\/google-login'/);
    assert.doesNotMatch(js, /localStorage|sessionStorage/);
  }
});
