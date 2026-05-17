/* Site-wide settings loader.
 * Fetches admin-controlled site settings from the backend and applies them to
 * the DOM via [data-bind="section.field"] attributes.
 *
 * Preview mode: when this page is loaded inside the admin preview iframe, the
 * parent window posts the *draft* settings to us (without us calling /site-settings).
 * That lets admins see un-published changes before clicking Publish.
 */
(function () {
  const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(location.hostname);
  const BACKEND = isLocal ? location.origin : 'https://phs-grades-backend.onrender.com';
  const CACHE_KEY = 'phs:site-settings:v2';
  const LAST_GOOD_KEY = 'phs:site-settings:last-good:v2';
  const CACHE_TTL_MS = 5 * 1000;
  const isPreviewIframe = (() => {
    try { return new URLSearchParams(location.search).has('_preview'); }
    catch { return false; }
  })();

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(LAST_GOOD_KEY);
      if (!raw) return { settings: null, stale: false };
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.settings) return { settings: null, stale: false };
      return { settings: parsed.settings, stale: Date.now() - parsed.ts > CACHE_TTL_MS };
    } catch { return { settings: null, stale: false }; }
  }
  function writeCache(s) {
    const payload = JSON.stringify({ ts: Date.now(), settings: s });
    try { sessionStorage.setItem(CACHE_KEY, payload); } catch {}
    try { localStorage.setItem(LAST_GOOD_KEY, payload); } catch {}
  }
  function withoutCachedScheduleOverride(settings) {
    if (!settings || typeof settings !== 'object' || !settings.scheduleOverride) return settings;
    return { ...settings, scheduleOverride: null };
  }
  function pickPath(obj, dotted) {
    return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function safeUrl(value, options = {}) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      const url = new URL(raw, location.href);
      const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
      const isMail = options.allowMailto && url.protocol === 'mailto:';
      if (!isHttp && !isMail) return null;
      return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) || raw.startsWith('//') ? url.href : raw;
    } catch {
      return null;
    }
  }
  function safeHex(value) {
    const raw = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : null;
  }

  function applyBindings(settings) {
    if (!settings || typeof settings !== 'object') return;
    window.__SITE_SETTINGS__ = settings;
    document.querySelectorAll('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind');
      const val = pickPath(settings, key);
      if (val == null) return;
      const mode = el.getAttribute('data-bind-attr');
      if (mode === 'href')   { const safe = safeUrl(val, { allowMailto: true }); if (safe) el.setAttribute('href', safe); return; }
      if (mode === 'src')    { const safe = safeUrl(val); if (safe) el.setAttribute('src', safe); return; }
      if (mode === 'alt')    { el.setAttribute('alt',  String(val)); return; }
      if (mode === 'title')  { el.setAttribute('title',String(val)); return; }
      if (mode === 'mailto') {
        const v = String(val);
        const emails = v.match(/[^\s,@]+@[^\s,@]+\.[^\s,@]+/g) || [];
        el.setAttribute('href', emails.length ? 'mailto:' + emails.join(',') : '#');
        return;
      }
      if (mode === 'content'){ el.setAttribute('content', String(val)); return; }
      if (el.tagName === 'TITLE') { el.textContent = String(val); return; }
      el.textContent = String(val);
    });

    // Theme: write CSS custom properties so existing styles can react.
    const theme = settings.theme || {};
    const root = document.documentElement;
    const accent = safeHex(theme.accent);
    const accent2 = safeHex(theme.accent2);
    const bg1 = safeHex(theme.bg1);
    const bg2 = safeHex(theme.bg2);
    const fg1 = safeHex(theme.fg1);
    const fg2 = safeHex(theme.fg2);
    if (accent)  root.style.setProperty('--accent', accent);
    if (accent2) root.style.setProperty('--accent-2', accent2);
    if (bg1) {
      root.style.setProperty('--bg-1', bg1);
      root.style.setProperty('--bg-base', bg1);
      root.style.setProperty('--user-bg-base', bg1);
    }
    if (bg2) root.style.setProperty('--bg-2', bg2);
    if (fg1) root.style.setProperty('--fg-1', fg1);
    if (fg2) root.style.setProperty('--fg-2', fg2);

    const appearance = settings.appearance || {};
    const pxVars = {
      heroEyebrowSize: '--hero-eyebrow-size',
      heroTitleSize: '--hero-title-size',
      countdownSize: '--countdown-size',
      scheduleTitleSize: '--schedule-title-size',
      periodTimeSize: '--period-time-size',
      periodNameSize: '--period-name-size',
      periodDurationSize: '--period-duration-size',
      periodCardPadding: '--period-card-padding',
      periodCardRadius: '--period-card-radius',
      footerSize: '--footer-size'
    };
    for (const [key, cssVar] of Object.entries(pxVars)) {
      const n = Number(appearance[key]);
      if (Number.isFinite(n)) root.style.setProperty(cssVar, `${n}px`);
    }
    const footerColor = safeHex(appearance.footerColor);
    if (footerColor) root.style.setProperty('--footer-color', footerColor);

    const fav = document.querySelector('link[rel="icon"]');
    if (fav && settings.branding?.favicon) {
      const safe = safeUrl(settings.branding.favicon);
      if (safe) fav.setAttribute('href', safe);
    }

    document.dispatchEvent(new CustomEvent('site-settings:applied', { detail: settings }));
    document.documentElement.classList.remove('settings-loading');
  }

  function fetchAndApply() {
    if (isPreviewIframe) return Promise.resolve(); // preview mode waits for parent postMessage instead
    return fetch(BACKEND + '/site-settings', { credentials: 'omit', cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(s => { writeCache(s); applyBindings(s); return s; })
      .catch(err => {
        console.warn('[settings] fetch failed:', err);
        if (!window.__SITE_SETTINGS__) {
          document.documentElement.classList.remove('settings-loading');
          document.dispatchEvent(new CustomEvent('site-settings:unavailable'));
        }
      });
  }

  // Apply cached copy/theme settings immediately, but never replay a cached schedule override.
  const cached = readCache();
  if (cached.settings && !isPreviewIframe) applyBindings(withoutCachedScheduleOverride(cached.settings));

  fetchAndApply();

  // Auto-refresh while visible so admin changes propagate without burning work in background tabs.
  if (!isPreviewIframe) {
    setInterval(() => {
      if (document.visibilityState === 'visible') fetchAndApply();
    }, CACHE_TTL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchAndApply();
    });
  }

  // Preview: parent admin tab posts draft settings.
  // Message shape: { type: 'phs:preview-settings', settings: {...} }
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'phs:preview-settings') return;
    if (!isPreviewIframe) return; // never accept overrides on the live site
    const s = e.data.settings;
    if (s && typeof s === 'object') {
      window.__SITE_SETTINGS__ = s;
      applyBindings(s);
    }
  });

  // Tell parent we're ready to receive (admin side waits for this signal).
  if (isPreviewIframe && window.parent !== window) {
    window.parent.postMessage({ type: 'phs:preview-ready' }, '*');
  }

  // Admin shortcut: Ctrl+Shift+A on any public page opens the admin tab.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      window.open('https://phs-grades-backend.onrender.com/admin', '_blank', 'noopener');
    }
  });

  window.PhsSettings = {
    refresh: fetchAndApply,
    apply: applyBindings,
    backend: BACKEND,
    isPreview: isPreviewIframe
  };
})();
