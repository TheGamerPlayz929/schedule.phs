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
  const CACHE_TTL_MS = 30 * 1000;
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
  function pickPath(obj, dotted) {
    return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function applyBindings(settings) {
    if (!settings || typeof settings !== 'object') return;
    window.__SITE_SETTINGS__ = settings;
    document.querySelectorAll('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind');
      const val = pickPath(settings, key);
      if (val == null) return;
      const mode = el.getAttribute('data-bind-attr');
      if (mode === 'href')   { el.setAttribute('href', String(val)); return; }
      if (mode === 'src')    { el.setAttribute('src',  String(val)); return; }
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
    if (theme.accent)  root.style.setProperty('--accent', theme.accent);
    if (theme.accent2) root.style.setProperty('--accent-2', theme.accent2);
    if (theme.bg1) {
      root.style.setProperty('--bg-1', theme.bg1);
      root.style.setProperty('--bg-base', theme.bg1);
      root.style.setProperty('--user-bg-base', theme.bg1);
    }
    if (theme.bg2)     root.style.setProperty('--bg-2', theme.bg2);
    if (theme.fg1)     root.style.setProperty('--fg-1', theme.fg1);
    if (theme.fg2)     root.style.setProperty('--fg-2', theme.fg2);

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
    if (appearance.footerColor) root.style.setProperty('--footer-color', appearance.footerColor);

    const fav = document.querySelector('link[rel="icon"]');
    if (fav && settings.branding?.favicon) fav.setAttribute('href', settings.branding.favicon);

    document.dispatchEvent(new CustomEvent('site-settings:applied', { detail: settings }));
    document.documentElement.classList.remove('settings-loading');
  }

  function fetchAndApply() {
    if (isPreviewIframe) return Promise.resolve(); // preview mode waits for parent postMessage instead
    return fetch(BACKEND + '/site-settings', { credentials: 'omit' })
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

  // Apply the last known good settings immediately so backend wake-up never flashes stale hard-coded copy.
  const cached = readCache();
  if (cached.settings && !isPreviewIframe) applyBindings(cached.settings);

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
