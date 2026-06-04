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
  const PUBLIC_SETTINGS_URL = 'site-settings.json';
  const CACHE_KEY = 'phs:site-settings:v8';
  const LAST_GOOD_KEY = 'phs:site-settings:last-good:v8';
  const OLD_CACHE_KEYS = [
    'phs:site-settings:v7',
    'phs:site-settings:last-good:v7',
    'phs:site-settings:v6',
    'phs:site-settings:last-good:v6',
    'phs:site-settings:v5',
    'phs:site-settings:last-good:v5',
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
  const isStudioPreview = (() => {
    try { return isPreviewIframe && new URLSearchParams(location.search).has('_studio'); }
    catch { return false; }
  })();
  const TEXT_STYLE_PROPS = new Set([
    'color',
    'backgroundColor',
    'fontWeight',
    'fontStyle',
    'textDecoration',
    'letterSpacing',
    'textTransform',
    'textShadow'
  ]);
  const TEXT_STYLE_TARGETS = new Set([
    'navLink',
    'navLinkActive',
    'heroEyebrow',
    'heroTitle',
    'statusLabel',
    'scheduleTitle',
    'scheduleDate',
    'periodTime',
    'periodName',
    'periodMeta',
    'announcementTitle',
    'announcementBullet',
    'gradesTitle',
    'footerContact',
    'footerLink',
    'maintenanceTitle',
    'maintenanceMessage'
  ]);
  let activeStudioKey = '';

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
    const cacheRecord = JSON.stringify({ ts: Date.now(), settings: s });
    try { sessionStorage.setItem(CACHE_KEY, cacheRecord); } catch {}
    try { localStorage.setItem(LAST_GOOD_KEY, cacheRecord); } catch {}
  }
  function clearOldCaches() {
    for (const key of OLD_CACHE_KEYS) {
      try { sessionStorage.removeItem(key); } catch {}
      try { localStorage.removeItem(key); } catch {}
    }
  }
  function pickPath(obj, dotted) {
    return dotted.split('.').reduce((o, k) => (o === null || o === undefined ? o : o[k]), obj);
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
  function normalizeStyleTarget(target) {
    const key = String(target || '').trim();
    return TEXT_STYLE_TARGETS.has(key) ? key : '';
  }
  function safeCssLength(value, fallback = '') {
    const raw = String(value || '').trim();
    return /^-?\d+(\.\d+)?(px|em|rem|%)$/i.test(raw) ? raw : fallback;
  }
  function freshUrl(url) {
    const next = new URL(url, location.href);
    next.searchParams.set('_fresh', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    return next.href;
  }
  function safeTextStyle(input = {}) {
    const style = {};
    if (!input || typeof input !== 'object') return style;
    const color = safeHex(input.color);
    const backgroundColor = safeHex(input.backgroundColor);
    if (color) style.color = color;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    const weight = Number(input.fontWeight);
    if (Number.isFinite(weight)) style.fontWeight = String(Math.min(900, Math.max(100, Math.round(weight / 100) * 100)));
    if (input.fontStyle === 'italic' || input.fontStyle === 'normal') style.fontStyle = input.fontStyle;
    if (['none', 'underline', 'line-through'].includes(input.textDecoration)) style.textDecoration = input.textDecoration;
    const letterSpacing = safeCssLength(input.letterSpacing);
    if (letterSpacing) style.letterSpacing = letterSpacing;
    if (['none', 'uppercase', 'lowercase', 'capitalize'].includes(input.textTransform)) style.textTransform = input.textTransform;
    if (typeof input.textShadow === 'string' && input.textShadow.length < 120) style.textShadow = input.textShadow;
    return style;
  }
  function textStyleFor(target) {
    const key = normalizeStyleTarget(target);
    if (!key) return { base: {}, letters: [] };
    const targetStyle = window.__SITE_SETTINGS__?.appearance?.textStyles?.targets?.[key] || {};
    const base = safeTextStyle(targetStyle.base || {});
    const letters = Array.isArray(targetStyle.letters)
      ? targetStyle.letters
        .map(run => ({
          start: Math.max(0, Math.floor(Number(run.start) || 0)),
          end: Math.max(0, Math.floor(Number(run.end) || 0)),
          style: safeTextStyle(run.style || {})
        }))
        .filter(run => run.end > run.start && Object.keys(run.style).some(prop => TEXT_STYLE_PROPS.has(prop)))
      : [];
    return { base, letters };
  }
  function applyInlineTextStyle(el, style) {
    if (!el || !style) return;
    for (const prop of TEXT_STYLE_PROPS) {
      if (Object.prototype.hasOwnProperty.call(style, prop)) el.style[prop] = style[prop];
    }
  }
  function renderStyledText(el, target, text) {
    if (!el) return;
    const key = normalizeStyleTarget(target || el.getAttribute('data-text-style'));
    const value = String(text ?? '');
    if (!key) {
      el.textContent = value;
      return;
    }
    const { base, letters } = textStyleFor(key);
    applyInlineTextStyle(el, base);
    if (!letters.length || !value) {
      el.textContent = value;
      return;
    }
    const chars = Array.from(value);
    const nodes = chars.map((char, index) => {
      const span = document.createElement('span');
      span.textContent = char;
      const run = letters.slice().reverse().find(item => index >= item.start && index < item.end);
      if (run) applyInlineTextStyle(span, run.style);
      return span;
    });
    el.replaceChildren(...nodes);
  }
  function applyTextStyles(settings, root = document) {
    if (!settings || typeof settings !== 'object') return;
    root.querySelectorAll('[data-text-style]').forEach(el => {
      renderStyledText(el, el.getAttribute('data-text-style'), el.textContent || '');
    });
  }
  function studioSelectableFor(node) {
    if (!node || node.nodeType !== 1) return null;
    return node.closest('[data-studio-key], [data-text-style]');
  }
  function describeStudioSelection(el) {
    const key = el.getAttribute('data-studio-key') || el.getAttribute('data-text-style') || '';
    const styleTarget = el.getAttribute('data-text-style') || '';
    const label = el.getAttribute('data-studio-label') || el.getAttribute('aria-label') || el.textContent || key;
    const textPath = el.getAttribute('data-studio-text-path') || el.getAttribute('data-bind') || '';
    const paths = String(el.getAttribute('data-studio-paths') || '')
      .split(',')
      .map(path => path.trim())
      .filter(Boolean);
    const rect = el.getBoundingClientRect();
    return {
      type: 'phs:studio-select',
      key,
      styleTarget,
      label: cleanStatusText(label, key || 'Selection', 80),
      text: cleanStatusText(el.textContent || '', '', 240),
      textPath,
      paths,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
  }
  function setStudioSelection(el, options = {}) {
    const target = studioSelectableFor(el);
    if (!target) return;
    document.querySelectorAll('.phs-studio-selected').forEach(node => node.classList.remove('phs-studio-selected'));
    target.classList.add('phs-studio-selected');
    activeStudioKey = target.getAttribute('data-studio-key') || target.getAttribute('data-text-style') || '';
    // Only scroll when the element is actually off-screen — 'nearest' won't yank
    // elements that are already visible (fixes the "jumps up when I select the nav" bug).
    if (options.scroll === true) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    if (options.notify === false) return;
    const parentOrigin = previewParentOrigin();
    if (parentOrigin) window.parent.postMessage(describeStudioSelection(target), parentOrigin);
  }
  function installStudioPreview() {
    if (!isStudioPreview) return;
    document.documentElement.classList.add('phs-studio-preview');
    const style = document.createElement('style');
    style.textContent = `
      .phs-studio-preview [data-studio-key],
      .phs-studio-preview [data-text-style]{cursor:crosshair}
      .phs-studio-preview .phs-studio-selected{outline:2px solid rgba(236,236,232,.88);outline-offset:4px;box-shadow:0 0 0 7px rgba(168,170,168,.16)}
      .phs-studio-preview .phs-studio-selected *{pointer-events:none}
      .phs-studio-preview .phs-studio-flash{animation:phsStudioFlash 1s cubic-bezier(.16,1,.3,1)}
      @keyframes phsStudioFlash{0%{box-shadow:0 0 0 0 rgba(168,170,168,.55),0 0 0 0 rgba(168,170,168,.35)}60%{box-shadow:0 0 0 10px rgba(168,170,168,.18),0 0 28px 6px rgba(168,170,168,.28)}100%{box-shadow:0 0 0 7px rgba(168,170,168,.16)}}
    `;
    document.head.appendChild(style);
    document.addEventListener('click', event => {
      const target = studioSelectableFor(event.target);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      setStudioSelection(target);
    }, true);
    window.addEventListener('message', event => {
      if (event.source !== window.parent || !isAllowedPreviewParentOrigin(event.origin)) return;
      if (event.data?.type === 'phs:studio-select-key') {
        const key = String(event.data.key || '');
        const target = document.querySelector(`[data-studio-key="${CSS.escape(key)}"], [data-text-style="${CSS.escape(key)}"]`);
        if (target) setStudioSelection(target, { notify: false });
      }
      if (event.data?.type === 'phs:studio-reveal') {
        const key = String(event.data.key || '');
        const target = document.querySelector(`[data-studio-key="${CSS.escape(key)}"], [data-text-style="${CSS.escape(key)}"]`);
        if (target) {
          setStudioSelection(target, { notify: false, scroll: true });
          target.classList.remove('phs-studio-flash');
          void target.offsetWidth; // restart animation
          target.classList.add('phs-studio-flash');
          setTimeout(() => target.classList.remove('phs-studio-flash'), 1000);
        }
      }
    });
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
    title.setAttribute('data-studio-key', 'maintenanceTitle');
    title.setAttribute('data-text-style', 'maintenanceTitle');
    title.setAttribute('data-studio-paths', 'siteStatus.title,appearance.textStyles.targets.maintenanceTitle');

    const message = document.createElement('p');
    message.id = 'site-maintenance-message';
    message.setAttribute('data-studio-key', 'maintenanceMessage');
    message.setAttribute('data-text-style', 'maintenanceMessage');
    message.setAttribute('data-studio-paths', 'siteStatus.message,appearance.textStyles.targets.maintenanceMessage');

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
    renderStyledText(document.getElementById('site-maintenance-title'), 'maintenanceTitle', cleanStatusText(status.title, 'Site paused for maintenance', 120));
    renderStyledText(document.getElementById('site-maintenance-message'), 'maintenanceMessage', cleanStatusText(status.message, 'Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon.', 500));
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
      if (val === null || val === undefined) return;
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

    applyTextStyles(settings);
    document.dispatchEvent(new CustomEvent('site-settings:applied', { detail: settings }));
    if (activeStudioKey) {
      const selected = document.querySelector(`[data-studio-key="${CSS.escape(activeStudioKey)}"], [data-text-style="${CSS.escape(activeStudioKey)}"]`);
      if (selected) setStudioSelection(selected, { notify: false, scroll: false });
    }
    document.documentElement.classList.remove('settings-loading');
  }

  function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SETTINGS_FETCH_TIMEOUT_MS);
    const requestUrl = options.noStore ? freshUrl(url) : url;
    return fetch(requestUrl, {
      credentials: 'omit',
      cache: options.noStore ? 'no-store' : 'default',
      signal: controller.signal
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .finally(() => clearTimeout(timeout));
  }

  function isAbortError(error) {
    return error && (error.name === 'AbortError' || /aborted/i.test(String(error.message || error)));
  }

  function settingsFreshness(settings) {
    const updatedAt = Number(settings?.updatedAt || 0);
    const overrideAt = Number(settings?.scheduleOverride?.timestamp || 0);
    return Math.max(
      Number.isFinite(updatedAt) ? updatedAt : 0,
      Number.isFinite(overrideAt) ? overrideAt : 0
    );
  }

  function chooseFreshSettings(publicSettings, backendSettings) {
    const hasPublic = publicSettings && typeof publicSettings === 'object';
    const hasBackend = backendSettings && typeof backendSettings === 'object';
    if (!hasPublic) return hasBackend ? backendSettings : null;
    if (!hasBackend) return publicSettings;

    const publicFreshness = settingsFreshness(publicSettings);
    const backendFreshness = settingsFreshness(backendSettings);
    if (publicFreshness && backendFreshness && publicFreshness > backendFreshness) return publicSettings;
    return backendSettings;
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
    let publicSettings = null;
    let backendSettings = null;
    try {
      publicSettings = await fetchJson(PUBLIC_SETTINGS_URL, { noStore: true });
    } catch (err) {
      if (!isAbortError(err)) console.warn('[settings] public fetch failed:', err);
    }

    if (publicSettings) {
      writeCache(publicSettings);
      applyBindings(publicSettings);
      return window.__SITE_SETTINGS__;
    }

    if (!isLocal && Date.now() >= backendRetryAt) {
      try {
        backendSettings = await fetchJson(BACKEND + '/site-settings', { noStore: true });
        noteBackendSuccess();
      } catch (err) {
        noteBackendFailure();
        if (!isAbortError(err)) console.warn('[settings] backend fetch failed:', err);
      }
    }

    const nextSettings = chooseFreshSettings(publicSettings, backendSettings);
    if (nextSettings) {
      writeCache(nextSettings);
      applyBindings(nextSettings);
    }

    if (!window.__SITE_SETTINGS__) {
      document.documentElement.classList.remove('settings-loading');
      document.dispatchEvent(new CustomEvent('site-settings:unavailable'));
    }
    return window.__SITE_SETTINGS__;
  }

  clearOldCaches();

  // Do not paint cached settings first: schedule overrides are date-sensitive,
  // so stale cache can visibly flip "No School" to the real planned day later.
  const cached = readCache();

  window.PhsSettingsReady = fetchAndApply().then(settings => {
    if (!settings && cached.settings && !cached.stale && !isPreviewIframe) {
      applyBindings(cached.settings);
      return cached.settings;
    }
    return settings;
  });

  // Auto-refresh while visible so admin changes propagate without burning work in background tabs.
  if (!isPreviewIframe) {
    const refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAndApply();
    }, CACHE_TTL_MS);
    window.addEventListener('pagehide', () => clearInterval(refreshTimer), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchAndApply();
    });
  }

  // Preview: parent admin tab posts draft settings.
  // Message shape: { type: 'phs:preview-settings', settings: {...}, previewDate?: 'YYYY-MM-DD' }
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'phs:preview-settings') return;
    if (!isPreviewIframe) return; // never accept overrides on the live site
    if (e.source !== window.parent) return;
    if (!isAllowedPreviewParentOrigin(e.origin)) return;
    const s = e.data.settings;
    window.__PHS_PREVIEW_DATE__ = /^\d{4}-\d{2}-\d{2}$/.test(String(e.data.previewDate || '')) ? String(e.data.previewDate) : '';
    if (s && typeof s === 'object') {
      window.__SITE_SETTINGS__ = s;
      applyBindings(s);
    }
  });

  installStudioPreview();

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
  window.PhsTextStyle = {
    applyAll: (root = document) => applyTextStyles(window.__SITE_SETTINGS__, root),
    setText: renderStyledText,
    hasLetterStyles: target => textStyleFor(target).letters.length > 0
  };
})();
