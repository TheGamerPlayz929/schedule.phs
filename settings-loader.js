/* Site-wide settings loader.
 * Fetches admin-controlled site settings from the backend and applies them to
 * the DOM via [data-bind="section.field"] attributes. Public site reads only.
 */
(function () {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const BACKEND = isLocal ? 'http://localhost:3000' : 'https://phs-grades-backend.onrender.com';
  const CACHE_KEY = 'phs:site-settings:v1';
  const CACHE_TTL_MS = 30 * 1000; // 30 s — admin changes propagate within this window

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.ts > CACHE_TTL_MS) return null;
      return parsed.settings;
    } catch { return null; }
  }
  function writeCache(s) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), settings: s })); } catch {}
  }
  function pickPath(obj, dotted) {
    return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function applyBindings(settings) {
    document.querySelectorAll('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind');
      const val = pickPath(settings, key);
      if (val == null) return;
      const mode = el.getAttribute('data-bind-attr');
      if (mode === 'href')  { el.setAttribute('href', String(val)); return; }
      if (mode === 'src')   { el.setAttribute('src',  String(val)); return; }
      if (mode === 'alt')   { el.setAttribute('alt',  String(val)); return; }
      if (mode === 'title') { el.setAttribute('title',String(val)); return; }
      if (mode === 'mailto'){ el.setAttribute('href', 'mailto:' + String(val)); return; }
      if (el.tagName === 'TITLE') { el.textContent = String(val); return; }
      el.textContent = String(val);
    });

    // Theme: write CSS custom properties so existing styles can react via var(--accent) etc.
    const theme = settings.theme || {};
    const root = document.documentElement;
    if (theme.accent)  root.style.setProperty('--accent', theme.accent);
    if (theme.accent2) root.style.setProperty('--accent-2', theme.accent2);
    if (theme.bg1)     root.style.setProperty('--bg-1', theme.bg1);
    if (theme.bg2)     root.style.setProperty('--bg-2', theme.bg2);
    if (theme.fg1)     root.style.setProperty('--fg-1', theme.fg1);
    if (theme.fg2)     root.style.setProperty('--fg-2', theme.fg2);

    // Document-level
    if (settings.branding?.siteTitle && !document.documentElement.hasAttribute('data-title-locked')) {
      // pages that want their own title set data-title-locked on <html>
    }
    const fav = document.querySelector('link[rel="icon"]');
    if (fav && settings.branding?.favicon) fav.setAttribute('href', settings.branding.favicon);

    // Fire event for page-specific code (announcements list, nav rendering, etc.)
    document.dispatchEvent(new CustomEvent('site-settings:applied', { detail: settings }));
  }

  function fetchAndApply() {
    return fetch(BACKEND + '/site-settings', { credentials: 'omit' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(s => { writeCache(s); applyBindings(s); window.__SITE_SETTINGS__ = s; return s; })
      .catch(err => { console.warn('[settings] fetch failed:', err); });
  }

  // Apply cached immediately (fast paint), then refresh in background.
  const cached = readCache();
  if (cached) { applyBindings(cached); window.__SITE_SETTINGS__ = cached; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndApply);
  } else {
    fetchAndApply();
  }

  // ── Admin shortcut: Ctrl+Shift+A on any public page opens the admin tab ──
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      window.open('admin.html', '_blank', 'noopener');
    }
  });

  // Expose a refresher for the admin preview flow.
  window.PhsSettings = {
    refresh: fetchAndApply,
    apply: applyBindings,
    backend: BACKEND
  };
})();
