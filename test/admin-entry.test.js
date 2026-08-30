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
