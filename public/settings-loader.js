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
  const PUBLIC_SETTINGS_URL = 'site-settings.json?v=20260521-publicsettings3';
  const CACHE_KEY = 'phs:site-settings:v5';
  const LAST_GOOD_KEY = 'phs:site-settings:last-good:v5';
  const OLD_CACHE_KEYS = [
    'phs:site-settings:v4',
    'phs:site-settings:last-good:v4',
    'phs:site-settings:v2',
    'phs:site-settings:last-good:v2',
    'phs:site-settings:schedule-only:v3',
    'phs:site-settings:schedule-only:last-good:v3'
  ];
  const CACHE_TTL_MS = 60 * 1000;
  const SETTINGS_FETCH_TIMEOUT_MS = 4500;
  const BACKEND_RETRY_MAX_MS = 60000;
  const TRUSTED_PREVIEW_PARENT_ORIGINS = new Set([
    'https://phs-grades-backend.onrender.com',
    'https://poolesville.web.app'
  ]);
  let backendRetryAt = 0;
  let backendBackoffMs = 0;
  const isPreviewIframe = (() => {
    try { return new URLSearchParams(location.search).has('_preview') && window.parent !== window; }
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
  function clearOldCaches() {
    for (const key of OLD_CACHE_KEYS) {
      try { sessionStorage.removeItem(key); } catch {}
      try { localStorage.removeItem(key); } catch {}
    }
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
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      return '#' + raw.slice(1).split('').map(ch => ch + ch).join('').toUpperCase();
    }
    return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(raw) ? raw.toUpperCase() : null;
  }
  function isLoopbackHostname(hostname) {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  }
  function isAllowedPreviewParentOrigin(origin) {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      if (url.origin === location.origin) return true;
      if (TRUSTED_PREVIEW_PARENT_ORIGINS.has(url.origin)) return true;
      return isLoopbackHostname(url.hostname);
    } catch {
      return false;
    }
  }
  function previewParentOrigin() {
    try {
      const ancestor = window.location.ancestorOrigins?.[0];
      if (ancestor && isAllowedPreviewParentOrigin(ancestor)) return ancestor;
    } catch {}
    try {
      if (document.referrer) {
        const origin = new URL(document.referrer).origin;
        if (isAllowedPreviewParentOrigin(origin)) return origin;
      }
    } catch {}
    return null;
  }
  function cleanStatusText(value, fallback, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return (text || fallback).slice(0, max);
  }
  function ensureMaintenancePanel() {
    let panel = document.getElementById('site-maintenance');
    if (panel) return panel;

    panel = document.createElement('main');
    panel.id = 'site-maintenance';
    panel.className = 'site-maintenance';
    panel.hidden = true;
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');

    const mark = document.createElement('a');
    mark.className = 'site-maintenance__mark';
    mark.href = 'index.html';
    mark.setAttribute('aria-label', 'Poolesville schedule home');
    const logo = document.createElement('img');
    logo.src = 'phs-logo-96.png';
    logo.alt = 'PHS Logo';
    logo.width = 48;
    logo.height = 40;
    logo.decoding = 'async';
    mark.appendChild(logo);

    const title = document.createElement('h1');
    title.id = 'site-maintenance-title';

    const message = document.createElement('p');
    message.id = 'site-maintenance-message';

    const note = document.createElement('span');
    note.className = 'site-maintenance__note';
    note.textContent = 'Poolesville Schedule';

    panel.append(mark, title, message, note);
    document.body.appendChild(panel);
    return panel;
  }
  function applySiteStatus(settings) {
    const status = settings?.siteStatus || {};
    const maintenance = status.mode === 'maintenance';
    const panel = ensureMaintenancePanel();
    document.body.classList.toggle('site-maintenance-active', maintenance);
    document.querySelectorAll('.app-shell').forEach(shell => {
      if (maintenance) shell.setAttribute('aria-hidden', 'true');
      else shell.removeAttribute('aria-hidden');
    });
    panel.hidden = !maintenance;
    if (!maintenance) return;
    const branding = settings?.branding || {};
    const mark = panel.querySelector('.site-maintenance__mark');
    const logo = mark?.querySelector('img');
    const logoSrc = safeUrl(branding.logoSrc || 'phs-logo-96.png');
    const logoLink = safeUrl(branding.logoLink || 'index.html');
    if (logo && logoSrc) logo.setAttribute('src', logoSrc);
    if (logo) logo.setAttribute('alt', cleanStatusText(branding.logoAlt, 'Poolesville Schedule logo', 120));
    if (mark && logoLink) mark.setAttribute('href', logoLink);
    document.getElementById('site-maintenance-title').textContent = cleanStatusText(status.title, 'Site paused for maintenance', 120);
    document.getElementById('site-maintenance-message').textContent = cleanStatusText(status.message, 'Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon.', 500);
    const note = panel.querySelector('.site-maintenance__note');
    if (note) note.textContent = cleanStatusText(settings?.branding?.siteTitle, 'Poolesville Schedule', 80);
  }

  function applyBindings(settings) {
    if (!settings || typeof settings !== 'object') return;
    window.__SITE_SETTINGS__ = settings;
    applySiteStatus(settings);
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

  function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SETTINGS_FETCH_TIMEOUT_MS);
    return fetch(url, {
      credentials: 'omit',
      cache: options.noStore ? 'no-store' : 'default',
      signal: controller.signal
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .finally(() => clearTimeout(timeout));
  }

  function chooseBackendSettings(backendSettings) {
    if (!backendSettings || typeof backendSettings !== 'object') return null;
    const current = window.__SITE_SETTINGS__;
    if (!current) return backendSettings;

    const currentUpdated = Number(current.updatedAt || 0);
    const backendUpdated = Number(backendSettings.updatedAt || 0);
    if (!currentUpdated || !backendUpdated || backendUpdated >= currentUpdated) return backendSettings;

    if (backendSettings.scheduleOverride) {
      return { ...current, scheduleOverride: backendSettings.scheduleOverride };
    }
    return null;
  }

  function noteBackendSuccess() {
    backendRetryAt = 0;
    backendBackoffMs = 0;
  }

  function noteBackendFailure() {
    backendBackoffMs = backendBackoffMs ? Math.min(BACKEND_RETRY_MAX_MS, backendBackoffMs * 2) : (isLocal ? BACKEND_RETRY_MAX_MS : CACHE_TTL_MS * 2);
    backendRetryAt = Date.now() + backendBackoffMs;
  }

  async function fetchAndApply() {
    if (isPreviewIframe) return Promise.resolve(); // preview mode waits for parent postMessage instead
    try {
      const publicSettings = await fetchJson(PUBLIC_SETTINGS_URL);
      writeCache(publicSettings);
      applyBindings(publicSettings);
    } catch (err) {
      console.warn('[settings] public fetch failed:', err);
    }

    if (!isLocal && Date.now() >= backendRetryAt) {
      try {
        const backendSettings = await fetchJson(BACKEND + '/site-settings', { noStore: true });
        noteBackendSuccess();
        const nextSettings = chooseBackendSettings(backendSettings);
        if (nextSettings) {
          writeCache(nextSettings);
          applyBindings(nextSettings);
        }
      } catch (err) {
        noteBackendFailure();
        console.warn('[settings] backend fetch failed:', err);
      }
    }

    if (!window.__SITE_SETTINGS__) {
      document.documentElement.classList.remove('settings-loading');
      document.dispatchEvent(new CustomEvent('site-settings:unavailable'));
    }
    return window.__SITE_SETTINGS__;
  }

  clearOldCaches();

  // Apply cached public settings immediately; stale v2/v3 caches are deliberately ignored.
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
    if (e.source !== window.parent) return;
    if (!isAllowedPreviewParentOrigin(e.origin)) return;
    const s = e.data.settings;
    if (s && typeof s === 'object') {
      window.__SITE_SETTINGS__ = s;
      applyBindings(s);
    }
  });

  // Tell parent we're ready to receive (admin side waits for this signal).
  if (isPreviewIframe && window.parent !== window) {
    const parentOrigin = previewParentOrigin();
    if (parentOrigin) window.parent.postMessage({ type: 'phs:preview-ready' }, parentOrigin);
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
