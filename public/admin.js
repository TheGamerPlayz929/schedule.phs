/* PHS Schedule — Admin dashboard
 * Schema-driven settings editor talking to /admin/* and /site-settings.
 * Preview overlay pipes the *draft* into the iframe via postMessage so admins
 * can verify changes before publishing.
 */
(() => {
  'use strict';

  const isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const BACKEND = isLocal ? 'http://localhost:3000' : 'https://phs-grades-backend.onrender.com';
  const TOKEN_KEY = 'phs:admin-token:v1';
  const IMPORT_STATE_KEY = 'phs:admin-import-assistant:v1';

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    authConfig: null,
    settings: null,    // current saved settings (server)
    defaults: null,
    draft: null,       // working copy with unsaved edits
    identity: null,
    activeTab: 'branding',
    search: '',
    previewMode: 'draft', // 'draft' | 'live'
    importAssistant: null
  };

  // ── SVG icons (Lucide-style stroke icons, no emoji) ────────────────────
  const ICON = {
    branding:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>`,
    nav:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`,
    hero:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v12H4z"/><path d="M4 10h16"/></svg>`,
    announce:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l13-7v16L3 13zM3 11v2"/><path d="M16 8a4 4 0 010 8"/></svg>`,
    schedule:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>`,
    bell:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9z"/><path d="M10 21a2 2 0 004 0"/></svg>`,
    grades:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></svg>`,
    grademelon:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18"/></svg>`,
    theme:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a4 4 0 010 8 4 4 0 010 8"/></svg>`,
    footer:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16v10H4z"/><path d="M4 13h16"/></svg>`,
    countdown:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 3h6"/></svg>`,
    privacy:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4v5c0 5-4 8-8 9-4-1-8-4-8-9V7z"/></svg>`,
    analytics:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5"/><rect x="12" y="7" width="3" height="9"/><rect x="17" y="13" width="3" height="3"/></svg>`,
    import:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>`,
    audit:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M9 11h7M9 15h7M9 7h4"/></svg>`,
    search:      `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/></svg>`,
    eye:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    logout:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>`,
    refresh:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"/></svg>`,
    close:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M6 18 18 6"/></svg>`,
    plus:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
    up:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
    down:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    trash:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>`,
    upload:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>`,
  };

  // ── Schema (drives the entire UI) ──────────────────────────────────────
  const SCHEMA = [
    { id: 'branding',    label: 'Branding',         icon: 'branding',
      sub: 'Site title, logo, favicon — visible on every page.',
      groups: [{
        title: 'Identity', fields: [
          { path: 'branding.siteTitle',       label: 'Site title (browser tab)', kind: 'text', max: 200 },
          { path: 'branding.siteDescription', label: 'Meta description',         kind: 'text', max: 300 },
        ]},{
        title: 'Logo', fields: [
          { path: 'branding.logoSrc',  label: 'Logo image', kind: 'image', help: 'PNG / JPG / WebP / GIF / ICO, ≤ 4 MB' },
          { path: 'branding.logoAlt',  label: 'Logo alt text', kind: 'text', max: 120 },
          { path: 'branding.logoLink', label: 'Logo click-through URL', kind: 'url' },
        ]},{
        title: 'Favicon', fields: [
          { path: 'branding.favicon', label: 'Favicon (ico / png)', kind: 'image' }
        ]}]
    },
    { id: 'nav',          label: 'Navigation',       icon: 'nav',
      sub: 'Links shown in the top navigation bar of every page.',
      groups: [{ title: 'Nav items', custom: 'navEditor' }]
    },
    { id: 'hero',         label: 'Page Headers',     icon: 'hero',
      sub: 'Hero text on each page.',
      groups: [{
        title: 'Schedule page', fields: [
          { path: 'hero.schedulePageEyebrow',        label: 'Eyebrow above period name', kind: 'text', max: 80 },
          { path: 'hero.schedulePageStatusFallback', label: 'Status pill loading text', kind: 'text', max: 60 },
        ]},{
        title: 'Other pages', fields: [
          { path: 'hero.announcementsPageTitle', label: 'Announcements title', kind: 'text', max: 80 },
          { path: 'hero.gradesPageTitle',        label: 'Grades title',        kind: 'text', max: 80 },
        ]}]
    },
    { id: 'announcements',label: 'Announcements',    icon: 'announce',
      sub: 'Cards shown on the announcements page.',
      groups: [{ title: 'Cards', custom: 'announcementsEditor' }]
    },
    { id: 'bellSchedules',label: 'Bell Schedule',    icon: 'bell',
      sub: 'Use a custom schedule for today, choose the active schedule, and edit reusable schedule types.',
      groups: [
        { title: 'Custom schedule from image', custom: 'scheduleImageImport' },
        { title: 'Active override', custom: 'scheduleOverrideEditor' },
        { title: 'Reusable schedules', custom: 'bellEditor' }
      ]
    },
    { id: 'grades',       label: 'Grades Iframe',    icon: 'grades',
      sub: 'Where the embedded GradeMelon iframe loads from.',
      groups: [{
        title: 'Iframe URLs', fields: [
          { path: 'grades.iframeUrlLocal', label: 'Local-development URL', kind: 'url', help: 'Used when site runs on localhost.' },
          { path: 'grades.iframeUrlProd',  label: 'Production URL',         kind: 'url' },
          { path: 'grades.pageTitle',      label: 'Browser-tab title',      kind: 'text' },
        ]}]
    },
    { id: 'gradeMelon',   label: 'GradeViewer', title: 'FAQ/Privacy',  icon: 'grademelon',
      sub: 'Privacy FAQ and button text shown in the GradeViewer page.',
      groups: [{
        title: 'Privacy / Safety FAQ', fields: [
          { path: 'gradeMelon.privacyButtonLabel', label: 'Link button label', kind: 'text' },
          { path: 'gradeMelon.privacyTitle',       label: 'Modal title',       kind: 'text' },
          { path: 'gradeMelon.privacyDoneLabel',   label: 'Close-button label',kind: 'text' },
        ]},{
        title: 'Modal paragraphs', custom: 'privacyParagraphsEditor'
      }]
    },
    { id: 'appearance',   label: 'Appearance',       icon: 'theme',
      sub: 'Staff defaults for colors, sizing, and spacing on the public pages.',
      groups: [{
        title: 'Theme colors', fields: [
          { path: 'theme.accent',  label: 'Accent',           kind: 'color' },
          { path: 'theme.accent2', label: 'Accent (deep)',    kind: 'color' },
          { path: 'theme.bg1',     label: 'Background outer', kind: 'color' },
          { path: 'theme.bg2',     label: 'Background inner', kind: 'color' },
          { path: 'theme.fg1',     label: 'Foreground',       kind: 'color' },
          { path: 'theme.fg2',     label: 'Muted foreground', kind: 'color' },
        ]},{
        title: 'Hero and countdown', fields: [
          { path: 'appearance.heroEyebrowSize', label: 'Hero eyebrow size', kind: 'number', min: 28, max: 110, step: 1, unit: 'px' },
          { path: 'appearance.heroTitleSize',   label: 'Hero title size',   kind: 'number', min: 42, max: 160, step: 1, unit: 'px' },
          { path: 'appearance.countdownSize',   label: 'Countdown number size', kind: 'number', min: 32, max: 100, step: 1, unit: 'px' },
        ]},{
        title: 'Schedule list', fields: [
          { path: 'appearance.scheduleTitleSize', label: 'Schedule heading size', kind: 'number', min: 14, max: 44, step: 1, unit: 'px' },
          { path: 'appearance.periodTimeSize',    label: 'Time text size',        kind: 'number', min: 10, max: 24, step: 1, unit: 'px' },
          { path: 'appearance.periodNameSize',    label: 'Period name size',      kind: 'number', min: 11, max: 28, step: 1, unit: 'px' },
          { path: 'appearance.periodDurationSize', label: 'Duration text size',    kind: 'number', min: 10, max: 24, step: 1, unit: 'px' },
          { path: 'appearance.periodCardPadding', label: 'Period card padding',   kind: 'number', min: 8, max: 34, step: 1, unit: 'px' },
          { path: 'appearance.periodCardRadius',  label: 'Period card radius',    kind: 'number', min: 0, max: 28, step: 1, unit: 'px' },
        ]},{
        title: 'Footer display', fields: [
          { path: 'appearance.footerSize',  label: 'Footer text size', kind: 'number', min: 9, max: 24, step: 1, unit: 'px' },
          { path: 'appearance.footerColor', label: 'Footer text color', kind: 'color' },
        ]}]
    },
    { id: 'footer',       label: 'Footer',           icon: 'footer',
      sub: 'Footer copy, feedback link, support contact.',
      groups: [{
        title: 'Footer', fields: [
          { path: 'footer.copyright',     label: 'Copyright line',  kind: 'text' },
          { path: 'footer.feedbackUrl',   label: 'Feedback URL',    kind: 'url' },
          { path: 'footer.feedbackLabel', label: 'Feedback label',  kind: 'text' },
          { path: 'footer.supportEmail',  label: 'Support contact (any text or email)', kind: 'text', help: 'Email addresses become a clickable mailto: link automatically. Any other text is rendered as plain text.' },
        ]}]
    },
    { id: 'countdown',    label: 'Countdown',        icon: 'countdown',
      sub: 'Labels around the countdown ring.',
      groups: [{
        title: 'Labels', fields: [
          { path: 'countdown.minSuffix', label: 'Minute suffix (e.g. "m")', kind: 'text', max: 6 }
        ]}]
    },
    { id: 'analytics',    label: 'Statistics',       icon: 'analytics',
      sub: 'Privacy-safe aggregate usage data. No personal data is collected.',
      readOnly: true,
      groups: [{ title: 'Usage overview', custom: 'analyticsDashboard' }]
    },
    { id: 'audit',        label: 'Audit Log',        icon: 'audit',
      sub: 'Recent admin changes — read only.',
      readOnly: true,
      groups: [{ title: 'Recent events', custom: 'auditLog' }]
    }
  ];

  // ── Helpers ────────────────────────────────────────────────────────────
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const deepClone = (o) => JSON.parse(JSON.stringify(o));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function get(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function set(obj, path, val) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = cur[parts[i]] ?? {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = val;
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function loadImportAssistantState() {
    try {
      const saved = JSON.parse(localStorage.getItem(IMPORT_STATE_KEY) || 'null');
      if (saved && typeof saved === 'object') return saved;
    } catch {}
    return { sourceText: '', days: [], updatedAt: null };
  }
  function saveImportAssistantState() {
    localStorage.setItem(IMPORT_STATE_KEY, JSON.stringify(state.importAssistant));
  }
  // Sidebar badge count: extracted-but-not-yet-applied rows in the Bell Schedule tab.
  function importAttentionCount() {
    return 0;
  }
  function scheduleAttentionCount() { return importAttentionCount(); }
  // seconds-from-midnight ⇄ "HH:MM"
  function secsToHHMM(s) {
    s = Math.max(0, Math.min(86399, parseInt(s, 10) || 0));
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  function hhmmToSecs(t) {
    const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = +m[1], mm = +m[2];
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return h * 3600 + mm * 60;
  }

  async function api(path, opts = {}) {
    const init = Object.assign({}, opts);
    init.headers = Object.assign({},
      opts.headers || {},
      opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {});
    if (state.token) init.headers['Authorization'] = 'Bearer ' + state.token;
    let res;
    try {
      res = await fetch(BACKEND + path, init);
    } catch (e) {
      const target = new URL(BACKEND).host;
      if (path.includes('/admin/ai/')) {
        throw new Error(`Could not reach the backend at ${target}. Make sure the backend is running and GEMINI_API_KEY is set there.`);
      }
      throw new Error(`Could not reach the backend at ${target}.`);
    }
    if (res.status === 401) {
      state.token = null;
      localStorage.removeItem(TOKEN_KEY);
      showLogin('Session expired — sign in again.');
      throw new Error('Unauthorized');
    }
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text }; }
    if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
    return json;
  }

  // ── Toast ──────────────────────────────────────────────────────────────
  function toast(msg, kind = 'success', ms = 3000) {
    const host = $('#toast-host');
    const el = document.createElement('div');
    el.className = 'admin-toast ' + kind;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; }, ms - 250);
    setTimeout(() => el.remove(), ms);
  }

  // ── Login / boot ───────────────────────────────────────────────────────
  function showLogin(errorMsg) {
    state.token = null;
    localStorage.removeItem(TOKEN_KEY);
    $('#app-shell').classList.add('hidden');
    $('#login-shell').classList.remove('hidden');
    if (errorMsg) $('#login-error').textContent = errorMsg;
  }
  function showApp() {
    $('#login-shell').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
  }

  async function loadAuthConfig() {
    try {
      const res = await fetch(BACKEND + '/admin/auth-config', { credentials: 'omit' });
      state.authConfig = res.ok ? await res.json() : {};
    } catch {
      state.authConfig = {};
    }
    configureGoogleLogin();
  }

  function configureGoogleLogin() {
    const clientId = state.authConfig?.googleClientId;
    if (!clientId) {
      $('#google-login-loading').textContent = 'Google sign-in is not configured yet.';
      return;
    }

    $('#google-login-wrap')?.classList.remove('hidden');

    const render = () => {
      if (!window.google?.accounts?.id || !$('#google-login-btn')) return false;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential
      });
      window.google.accounts.id.renderButton($('#google-login-btn'), {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        text: 'signin_with',
        shape: 'rectangular',
        width: 320
      });
      $('#google-login-loading')?.classList.add('hidden');
      return true;
    };

    if (!render()) {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (render() || tries > 50) clearInterval(timer);
      }, 100);
    }
  }

  async function handleGoogleCredential(response) {
    const err = $('#login-error');
    err.textContent = '';
    try {
      const res = await fetch(BACKEND + '/admin/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Google sign-in failed');
      state.token = json.token;
      localStorage.setItem(TOKEN_KEY, json.token);
      await bootApp();
    } catch (ex) {
      showLogin(ex.message || 'This Google account is not authorized.');
      if (window.google?.accounts?.id) {
        try { window.google.accounts.id.disableAutoSelect(); } catch {}
      }
    }
  }

  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/admin/logout', { method: 'POST' }); } catch {}
    state.token = null;
    localStorage.removeItem(TOKEN_KEY);
    showLogin('Signed out.');
  });

  async function bootApp() {
    try {
      const who = await api('/admin/whoami');
      state.identity = who.identity || null;
      const [settings, defaults] = await Promise.all([
        fetch(BACKEND + '/site-settings').then(r => r.json()),
        fetch(BACKEND + '/site-settings/defaults').then(r => r.json())
      ]);
      state.settings = settings;
      state.defaults = defaults;
      state.draft = deepClone(settings);
      state.importAssistant = loadImportAssistantState();
      showApp();
      renderSidebar();
      renderActiveTab();
      renderAdminIdentity();
      pingConnection();
    } catch (e) {
      console.warn('boot error', e);
      showLogin(state.token ? 'Session expired. Sign in with Google again.' : '');
    }
  }
  function pingConnection() {
    fetch(BACKEND + '/health')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const el = $('#conn-status');
        if (j?.ok) { el.classList.remove('offline'); el.textContent = 'Backend online · ' + new URL(BACKEND).host; }
        else { el.classList.add('offline'); el.textContent = 'Backend reachable but not OK'; }
      })
      .catch(() => { const el = $('#conn-status'); el.classList.add('offline'); el.textContent = 'Backend offline'; });
  }

  function renderAdminIdentity() {
    const chip = $('#admin-user-chip');
    if (!chip) return;
    const ident = state.identity || {};
    const label = ident.name || ident.email || 'Local development';
    chip.title = label;
    if (ident.picture) {
      chip.innerHTML = `<img src="${escapeHtml(ident.picture)}" alt="">`;
      return;
    }
    const initials = (ident.name || ident.email || 'LD')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0]?.toUpperCase())
      .join('') || 'LD';
    chip.textContent = initials;
  }

  // ── Sidebar / tabs ─────────────────────────────────────────────────────
  function renderSidebar() {
    const nav = $('#tabs');
    nav.innerHTML = '';
    for (const tab of SCHEMA) {
      const b = document.createElement('button');
      b.className = 'admin-tab-btn' + (tab.id === state.activeTab ? ' active' : '');
      b.dataset.tab = tab.id;
      b.innerHTML = `<span class="admin-tab-icon">${ICON[tab.icon] || ICON.audit}</span><span class="admin-tab-label">${escapeHtml(tab.label)}</span>`;
      b.addEventListener('click', () => { state.activeTab = tab.id; renderSidebar(); renderActiveTab(); });
      nav.appendChild(b);
    }
  }

  // ── Field rendering ────────────────────────────────────────────────────
  function fieldId(path) { return 'fld_' + path.replace(/\./g, '_'); }
  function isModified(path) { return !eq(get(state.settings, path), get(state.draft, path)); }
  function isDefault(path) { return eq(get(state.draft, path), get(state.defaults, path)); }

  function renderField(field) {
    const wrap = document.createElement('div');
    wrap.className = 'admin-field';
    wrap.dataset.path = field.path;
    if (isModified(field.path)) wrap.classList.add('is-modified');

    const head = document.createElement('div');
    head.className = 'admin-field-row';
    head.innerHTML = `<label for="${fieldId(field.path)}">${escapeHtml(field.label)}</label>`;
    const reset = document.createElement('button');
    reset.className = 'admin-field-reset'; reset.type = 'button';
    reset.textContent = isDefault(field.path) ? 'default' : 'reset to default';
    reset.disabled = isDefault(field.path);
    reset.addEventListener('click', () => {
      set(state.draft, field.path, deepClone(get(state.defaults, field.path)));
      markDirty(); renderActiveTab();
    });
    head.appendChild(reset);
    wrap.appendChild(head);

    const value = get(state.draft, field.path);

    if (field.kind === 'textarea') {
      const ta = document.createElement('textarea');
      ta.className = 'admin-textarea'; ta.id = fieldId(field.path);
      ta.value = value ?? '';
      ta.addEventListener('input', () => onFieldChange(field.path, ta.value));
      wrap.appendChild(ta);
    } else if (field.kind === 'color') {
      const row = document.createElement('div');
      row.className = 'admin-color-row';
      const hex = document.createElement('input');
      hex.type = 'color'; hex.value = (value || '#000000').slice(0, 7);
      const text = document.createElement('input');
      text.className = 'admin-input mono'; text.id = fieldId(field.path); text.value = value || '';
      hex.addEventListener('input', () => { text.value = hex.value; onFieldChange(field.path, hex.value); });
      text.addEventListener('input', () => { if (/^#[0-9a-fA-F]{3,8}$/.test(text.value)) hex.value = text.value.slice(0,7); onFieldChange(field.path, text.value); });
      row.append(hex, text);
      wrap.appendChild(row);
    } else if (field.kind === 'number') {
      const row = document.createElement('div');
      row.className = 'admin-number-row';
      const input = document.createElement('input');
      input.className = 'admin-input mono';
      input.id = fieldId(field.path);
      input.type = 'number';
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      input.value = value ?? '';
      input.addEventListener('input', () => onFieldChange(field.path, Number(input.value)));
      row.appendChild(input);
      if (field.unit) {
        const unit = document.createElement('span');
        unit.className = 'admin-number-unit';
        unit.textContent = field.unit;
        row.appendChild(unit);
      }
      wrap.appendChild(row);
    } else if (field.kind === 'image') {
      wrap.appendChild(renderImageField(field, value));
    } else {
      const input = document.createElement('input');
      input.className = 'admin-input' + (field.kind === 'url' ? ' mono' : '');
      input.id = fieldId(field.path);
      input.type = 'text';
      if (field.max) input.maxLength = field.max;
      input.value = value ?? '';
      input.addEventListener('input', () => onFieldChange(field.path, input.value));
      wrap.appendChild(input);
    }
    if (field.help) {
      const h = document.createElement('div');
      h.className = 'admin-field-help';
      h.textContent = field.help;
      wrap.appendChild(h);
    }
    return wrap;
  }
  function onFieldChange(path, value) {
    set(state.draft, path, value);
    markDirty();
    refreshDirtyMarkers();
    pushPreview();
  }

  function renderImageField(field, value) {
    const host = document.createElement('div');
    const preview = document.createElement('div');
    preview.className = 'admin-image-preview';
    function paint() {
      const v = get(state.draft, field.path) || '';
      preview.innerHTML = `
        <img src="${escapeHtml(v)}" alt="" onerror="this.style.opacity=.2">
        <div class="info">
          <div class="name">${escapeHtml(v) || '— no image set —'}</div>
          <div class="meta">Choose a file to upload, or paste a URL/path.</div>
        </div>
      `;
    }
    paint();
    const text = document.createElement('input');
    text.className = 'admin-input mono';
    text.style.marginTop = '10px';
    text.value = value || '';
    text.placeholder = 'phs-logo.png · /uploads/123-logo.svg · https://…';
    text.addEventListener('input', () => { onFieldChange(field.path, text.value); paint(); });

    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
    file.addEventListener('change', async () => {
      if (!file.files?.length) return;
      const fd = new FormData();
      fd.append('file', file.files[0]);
      try {
        const res = await fetch(BACKEND + '/admin/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + state.token }, body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Upload failed');
        text.value = BACKEND + json.url;
        onFieldChange(field.path, text.value); paint();
        toast('Uploaded ' + json.filename);
      } catch (e) { toast(e.message, 'error'); }
      file.value = '';
    });
    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '8px';
    btnRow.style.display = 'flex'; btnRow.style.gap = '8px';
    const upBtn = document.createElement('button');
    upBtn.type = 'button'; upBtn.className = 'admin-btn admin-btn-sm';
    upBtn.innerHTML = ICON.upload + '<span>Choose file…</span>';
    upBtn.addEventListener('click', () => file.click());
    const clrBtn = document.createElement('button');
    clrBtn.type = 'button'; clrBtn.className = 'admin-btn admin-btn-sm admin-btn-ghost';
    clrBtn.textContent = 'Clear';
    clrBtn.addEventListener('click', () => { text.value = ''; onFieldChange(field.path, ''); paint(); });
    btnRow.append(upBtn, clrBtn, file);

    host.append(preview, text, btnRow);
    return host;
  }

  // ── Custom editors ─────────────────────────────────────────────────────
  function renderNavEditor() {
    const host = document.createElement('div');
    state.draft.nav = state.draft.nav || { items: [] };
    const items = state.draft.nav.items;
    function paint() {
      host.innerHTML = '';
      items.forEach((it, i) => {
        const card = document.createElement('div');
        card.className = 'admin-list-item';
        card.innerHTML = `
          <div class="admin-list-item-head">
            <span class="handle">Item ${i + 1}</span>
            <div class="admin-list-item-actions">
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Up" data-act="up"   ${i===0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Down" data-act="down" ${i===items.length-1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" title="Remove" data-act="del">${ICON.trash}</button>
            </div>
          </div>
          <div class="admin-grid-2">
            <div class="admin-field" style="margin-bottom:0">
              <div class="admin-field-row"><label>Label</label></div>
              <input class="admin-input" data-field="label" value="${escapeHtml(it.label || '')}" maxlength="60">
            </div>
            <div class="admin-field" style="margin-bottom:0">
              <div class="admin-field-row"><label>Href</label></div>
              <input class="admin-input mono" data-field="href" value="${escapeHtml(it.href || '')}" maxlength="500">
            </div>
          </div>`;
        card.querySelectorAll('[data-field]').forEach(inp => inp.addEventListener('input', () => { it[inp.dataset.field] = inp.value; markDirty(); pushPreview(); }));
        card.querySelector('[data-act=up]').addEventListener('click', () => { items.splice(i-1,0,items.splice(i,1)[0]); markDirty(); paint(); pushPreview(); });
        card.querySelector('[data-act=down]').addEventListener('click', () => { items.splice(i+1,0,items.splice(i,1)[0]); markDirty(); paint(); pushPreview(); });
        card.querySelector('[data-act=del]').addEventListener('click', () => { items.splice(i,1); markDirty(); paint(); pushPreview(); });
        host.appendChild(card);
      });
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'admin-btn admin-btn-sm';
      addBtn.innerHTML = ICON.plus + '<span>Add nav item</span>';
      addBtn.addEventListener('click', () => { items.push({ label: 'New', href: '#' }); markDirty(); paint(); pushPreview(); });
      host.appendChild(addBtn);
    }
    paint();
    return host;
  }

  function renderAnnouncementsEditor() {
    const host = document.createElement('div');
    state.draft.announcements = state.draft.announcements || { items: [] };
    const items = state.draft.announcements.items;
    function paint() {
      host.innerHTML = '';
      items.forEach((card, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'admin-list-item';
        wrap.innerHTML = `
          <div class="admin-list-item-head">
            <span class="handle">Card ${i + 1}</span>
            <div class="admin-list-item-actions">
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" data-act="up"   ${i===0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" data-act="down" ${i===items.length-1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" data-act="del">${ICON.trash}</button>
            </div>
          </div>
          <div class="admin-field">
            <div class="admin-field-row"><label>Title</label></div>
            <input class="admin-input" data-card-field="title" value="${escapeHtml(card.title || '')}" maxlength="200">
          </div>
          <div class="admin-field" style="margin-bottom:8px">
            <div class="admin-field-row"><label>Bullets</label></div>
            <div data-bullets></div>
          </div>
          <button class="admin-btn admin-btn-sm" data-act="add-bullet">${ICON.plus}<span>Add bullet</span></button>`;
        wrap.querySelector('[data-card-field=title]').addEventListener('input', e => { card.title = e.target.value; markDirty(); pushPreview(); });
        const bulletsHost = wrap.querySelector('[data-bullets]');
        function paintBullets() {
          bulletsHost.innerHTML = '';
          (card.bullets || []).forEach((b, j) => {
            const row = document.createElement('div');
            row.className = 'admin-bullet-row';
            row.innerHTML = `
              <input class="admin-input" value="${escapeHtml(b)}" maxlength="2000">
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" type="button">${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" type="button">${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" type="button">${ICON.trash}</button>`;
            const [inp, up, dn, del] = row.children;
            inp.addEventListener('input', () => { card.bullets[j] = inp.value; markDirty(); pushPreview(); });
            up.addEventListener('click', () => { if (j>0) { card.bullets.splice(j-1,0,card.bullets.splice(j,1)[0]); markDirty(); paintBullets(); pushPreview(); } });
            dn.addEventListener('click', () => { if (j<card.bullets.length-1) { card.bullets.splice(j+1,0,card.bullets.splice(j,1)[0]); markDirty(); paintBullets(); pushPreview(); } });
            del.addEventListener('click', () => { card.bullets.splice(j,1); markDirty(); paintBullets(); pushPreview(); });
            bulletsHost.appendChild(row);
          });
        }
        paintBullets();
        wrap.querySelector('[data-act=up]').addEventListener('click', () => { items.splice(i-1,0,items.splice(i,1)[0]); markDirty(); paint(); pushPreview(); });
        wrap.querySelector('[data-act=down]').addEventListener('click', () => { items.splice(i+1,0,items.splice(i,1)[0]); markDirty(); paint(); pushPreview(); });
        wrap.querySelector('[data-act=del]').addEventListener('click', () => { items.splice(i,1); markDirty(); paint(); pushPreview(); });
        wrap.querySelector('[data-act=add-bullet]').addEventListener('click', () => { card.bullets = card.bullets || []; card.bullets.push(''); markDirty(); paintBullets(); pushPreview(); });
        host.appendChild(wrap);
      });
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'admin-btn admin-btn-sm';
      addBtn.innerHTML = ICON.plus + '<span>Add announcement card</span>';
      addBtn.addEventListener('click', () => { items.push({ title: 'New announcement', bullets: ['…'] }); markDirty(); paint(); pushPreview(); });
      host.appendChild(addBtn);
    }
    paint();
    return host;
  }

  function renderScheduleOverrideEditor() {
    const host = document.createElement('div');
    const baseTypes = ['none', 'Normal Schedule', 'Advisory', 'Early Release', 'No School'];
    const extraTypes = Object.keys(state.draft.bellSchedules || {})
      .filter(t => t && !baseTypes.includes(t) && Object.keys(state.draft.bellSchedules[t] || {}).length);
    const types = [...baseTypes, ...extraTypes];
    function curType() { return state.draft.scheduleOverride?.type || 'none'; }
    function paint() {
      const cur = curType();
      host.innerHTML = `
        <div class="admin-field">
          <div class="admin-field-row"><label>Active override</label></div>
          <select class="admin-select" id="sched-override-select">
            ${types.map(t => `<option value="${escapeHtml(t)}" ${t===cur?'selected':''}>${t==='none'?'— No override (use data.json) —':escapeHtml(t)}</option>`).join('')}
          </select>
          <div class="admin-field-help">This changes the draft. Click Publish when you are ready for visitors to see it.</div>
        </div>
        ${state.draft.scheduleOverride ? `<div class="admin-field-help">Set at ${new Date(state.draft.scheduleOverride.timestamp).toLocaleString()}.</div>` : ''}`;
      host.querySelector('#sched-override-select').addEventListener('change', (e) => {
        const v = e.target.value;
        state.draft.scheduleOverride = (v === 'none') ? null : { type: v, timestamp: Date.now() };
        markDirty(); paint(); pushPreview();
      });
    }
    paint();
    return host;
  }

  function renderBellEditor() {
    const host = document.createElement('div');
    state.draft.bellSchedules = state.draft.bellSchedules || {};
    const baseTypes = ['Normal Schedule', 'Advisory', 'Early Release'];
    const extraTypes = Object.keys(state.draft.bellSchedules || {}).filter(t => t && !baseTypes.includes(t));
    const types = [...baseTypes, ...extraTypes];
    let activeType = types[0];

    const tabs = document.createElement('div');
    tabs.className = 'admin-preview-bar';
    tabs.style.cssText = 'background:transparent;border:none;padding:0 0 12px 0;justify-content:flex-start';
    function paintTabs() {
      tabs.innerHTML = `<div class="seg" id="bell-seg">
        ${types.map(t => `<button data-type="${escapeHtml(t)}" class="${t===activeType?'active':''}">${escapeHtml(t)}</button>`).join('')}
      </div>`;
      tabs.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => { activeType = btn.dataset.type; paintTabs(); paintBody(); }));
    }
    paintTabs();
    host.appendChild(tabs);

    const body = document.createElement('div');
    host.appendChild(body);

    function getRows() {
      const map = state.draft.bellSchedules[activeType] || {};
      return Object.keys(map).map(k => ({ start: +k, end: +map[k][0], name: map[k][1] }))
        .sort((a, b) => a.start - b.start);
    }
    function commit(rows) {
      const dedup = {};
      for (const r of rows) {
        if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end < 0) continue;
        dedup[String(r.start)] = [r.end, String(r.name || '')];
      }
      state.draft.bellSchedules[activeType] = dedup;
      markDirty(); pushPreview();
    }
    function paintBody() {
      const rows = getRows();
      body.innerHTML = `
        <div class="admin-bell-row" style="font-size:11px;color:var(--fg-3);padding-bottom:4px">
          <span>Order</span><span>Period name</span><span>Start (HH:MM)</span><span>End (HH:MM)</span><span></span>
        </div>
      `;
      rows.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'admin-bell-row';
        const dur = Math.max(0, Math.round((r.end - r.start) / 60));
        row.innerHTML = `
          <span class="role">${i+1}</span>
          <input class="admin-input" data-f="name" value="${escapeHtml(r.name)}" maxlength="60">
          <input class="admin-input mono" data-f="start" type="time" value="${secsToHHMM(r.start)}">
          <input class="admin-input mono" data-f="end" type="time" value="${secsToHHMM(r.end)}">
          <div class="row-gap-8">
            <span class="role">${dur}m</span>
            <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" data-f="del" title="Remove">${ICON.trash}</button>
          </div>`;
        row.querySelector('[data-f=name]').addEventListener('input', e => { rows[i].name = e.target.value; commit(rows); paintBody(); });
        row.querySelector('[data-f=start]').addEventListener('change', e => { const s = hhmmToSecs(e.target.value); if (s != null) { rows[i].start = s; commit(rows); paintBody(); } });
        row.querySelector('[data-f=end]').addEventListener('change',   e => { const s = hhmmToSecs(e.target.value); if (s != null) { rows[i].end   = s; commit(rows); paintBody(); } });
        row.querySelector('[data-f=del]').addEventListener('click', () => { rows.splice(i, 1); commit(rows); paintBody(); });
        body.appendChild(row);
      });

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap';
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'admin-btn admin-btn-sm';
      addBtn.innerHTML = ICON.plus + '<span>Add period</span>';
      addBtn.addEventListener('click', () => {
        const last = rows[rows.length - 1];
        const start = last ? Math.min(86340, last.end + 300) : 27900;
        rows.push({ start, end: Math.min(86399, start + 2700), name: 'New Period' });
        commit(rows); paintBody();
      });
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button'; resetBtn.className = 'admin-btn admin-btn-sm admin-btn-ghost';
      resetBtn.textContent = 'Reset this template to default';
      resetBtn.addEventListener('click', () => {
        state.draft.bellSchedules[activeType] = deepClone(state.defaults.bellSchedules[activeType] || {});
        markDirty(); pushPreview(); paintBody();
      });
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button'; clearBtn.className = 'admin-btn admin-btn-sm admin-btn-ghost';
      clearBtn.textContent = 'Clear (defer to data.json)';
      clearBtn.addEventListener('click', () => {
        state.draft.bellSchedules[activeType] = {};
        markDirty(); pushPreview(); paintBody();
      });
      actions.append(addBtn, resetBtn, clearBtn);
      body.appendChild(actions);

      const help = document.createElement('div');
      help.className = 'admin-field-help';
      help.style.marginTop = '12px';
      help.textContent = 'Times are in 24-hour HH:MM. The schedule page will use this template whenever the active schedule type is "' + activeType + '". Clearing the template falls back to the per-date data.json.';
      body.appendChild(help);
    }
    paintBody();
    return host;
  }

  function renderPrivacyParagraphsEditor() {
    const host = document.createElement('div');
    state.draft.gradeMelon = state.draft.gradeMelon || {};
    state.draft.gradeMelon.privacyParagraphs = state.draft.gradeMelon.privacyParagraphs || [];
    const arr = state.draft.gradeMelon.privacyParagraphs;
    function paint() {
      host.innerHTML = '';
      arr.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'admin-list-item';
        row.innerHTML = `
          <div class="admin-list-item-head">
            <span class="handle">Paragraph ${i+1}</span>
            <div class="admin-list-item-actions">
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" data-act="up"   ${i===0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" data-act="down" ${i===arr.length-1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" data-act="del">${ICON.trash}</button>
            </div>
          </div>
          <textarea class="admin-textarea" maxlength="4000">${escapeHtml(p)}</textarea>`;
        row.querySelector('textarea').addEventListener('input', e => { arr[i] = e.target.value; markDirty(); pushPreview(); });
        row.querySelector('[data-act=up]').addEventListener('click', () => { arr.splice(i-1,0,arr.splice(i,1)[0]); markDirty(); paint(); pushPreview(); });
        row.querySelector('[data-act=down]').addEventListener('click', () => { arr.splice(i+1,0,arr.splice(i,1)[0]); markDirty(); paint(); pushPreview(); });
        row.querySelector('[data-act=del]').addEventListener('click', () => { arr.splice(i,1); markDirty(); paint(); pushPreview(); });
        host.appendChild(row);
      });
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'admin-btn admin-btn-sm';
      addBtn.innerHTML = ICON.plus + '<span>Add paragraph</span>';
      addBtn.addEventListener('click', () => { arr.push(''); markDirty(); paint(); pushPreview(); });
      host.appendChild(addBtn);
    }
    paint();
    return host;
  }

  function classifyScheduleLine(text) {
    const lower = text.toLowerCase();
    if (/(adjusted|special|assembly|testing|exam|pep rally|report card|homeroom|distribution)/.test(lower)) {
      return { template: 'Custom adjusted schedule', needsCustom: true };
    }
    if (/(falcon time|ft\/?advisory|advisory)/.test(lower)) {
      return { template: 'Advisory', needsCustom: false };
    }
    if (/early release/.test(lower)) {
      return { template: 'Early Release', needsCustom: false };
    }
    if (/(delayed opening|delay)/.test(lower)) {
      return { template: 'Delayed Opening', needsCustom: false };
    }
    if (/no school|closed|holiday/.test(lower)) {
      return { template: 'No School', needsCustom: false };
    }
    if (/(standard|normal|bell schedule)/.test(lower)) {
      return { template: 'Normal Schedule', needsCustom: false };
    }
    return { template: 'Needs review', needsCustom: true };
  }

  function parseWeeklySchedule(text) {
    const lines = String(text || '')
      .replace(/\u2013|\u2014/g, '-')
      .split(/\n|•/)
      .map(line => line.trim().replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, ''))
      .filter(Boolean);
    const dayRe = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*([^-\n]*)?\s*-\s*(.+)$/i;
    const days = [];
    for (const line of lines) {
      const m = line.match(dayRe);
      if (!m) continue;
      const day = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      const date = (m[2] || '').trim().replace(/,$/, '');
      const detail = (m[3] || '').trim();
      const classified = classifyScheduleLine(detail);
      const no8th = /no\s*(8th|eighth)\s*period/i.test(detail);
      const key = `${day}-${date || days.length}`;
      days.push({
        key,
        day,
        date,
        detail,
        template: classified.template,
        needsCustom: classified.needsCustom,
        modifier: no8th ? 'No 8th period' : '',
        note: /no homework weekend/i.test(detail) ? 'No Homework Weekend' : ''
      });
    }
    return days;
  }

  // ─── Schedule Image Import (AI image extraction) ──────────────────────
  // Nothing publishes automatically. "Use This Schedule" updates the local
  // draft; the existing Publish button is the only way to ship changes.

  const TIME_RANGE_RE = /(\d{1,2}):?(\d{2})?\s*[-–—]\s*(\d{1,2}):?(\d{2})?/;

  // 12-hour → 24-hour using lunch-aware heuristic
  // Sequence: rebuild row-by-row. Once we cross a "Lunch" or any time that goes
  // PM (e.g. 12:xx), every following 1-6 hour becomes PM (13-18).
  function normalizeRowTimes(rows) {
    let pmMode = false;
    return rows.map(r => {
      const startH24 = inferHour24(r.startH, r.startM, r.name, pmMode);
      pmMode = pmMode || (startH24 >= 12 && startH24 < 19);
      const endH24 = inferHour24(r.endH, r.endM, r.name, pmMode);
      pmMode = pmMode || (endH24 >= 12 && endH24 < 19);
      return {
        name: r.name,
        start: `${pad2(startH24)}:${pad2(r.startM)}`,
        end:   `${pad2(endH24)}:${pad2(r.endM)}`
      };
    });
  }
  function inferHour24(h, m, name, pmMode) {
    if (h === 12) return 12;          // 12:xx is always 12 (noon-ish)
    if (h >= 13)  return h;           // already 24h
    // Lunch is the canonical PM trigger for school schedules
    if (/lunch/i.test(name) && h >= 11) return h;   // 11:xx Lunch stays 11
    if (pmMode && h >= 1 && h <= 6)  return h + 12; // afternoon
    if (h >= 7 && h <= 11) return h;                // morning
    if (h >= 0 && h <= 6 && pmMode) return h + 12;
    return h;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  // Pull schedule rows out of pasted schedule text. One row per non-empty line.
  // Recognises: "Period 1 7:45 - 8:35", "1 7:45 – 8:35", "Lunch 11:15-12:00".
  function parseScheduleText(rawText) {
    if (!rawText) return [];
    const lines = String(rawText)
      .replace(/ /g, ' ')        // nbsp → space
      .split(/\r?\n/);
    const rows = [];
    for (const line of lines) {
      const m = TIME_RANGE_RE.exec(line);
      if (!m) continue;
      const startH = +m[1];
      const startM = +(m[2] ?? 0);
      const endH   = +m[3];
      const endM   = +(m[4] ?? 0);
      if (startH > 23 || endH > 23) continue;
      // "name" = everything before the time range, cleaned up
      let name = line.slice(0, m.index)
        .replace(/[•·*–—\-]+\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!name) continue;
      // Bare leading "1" / "2" → "Period 1" / "Period 2"
      if (/^\d{1,2}$/.test(name)) name = `Period ${name}`;
      // Drop trailing duration column ("50 min") that some lines repeat
      name = name.replace(/\s*\d+\s*min\s*$/i, '').trim();
      rows.push({ name, startH, startM, endH, endM });
    }
    return normalizeRowTimes(rows);
  }

  function rowsToBellSchedule(rows) {
    const out = {};
    for (const r of rows) {
      const start = hhmmToSecs(r.start);
      const end   = hhmmToSecs(r.end);
      if (start == null || end == null || end <= start) continue;
      out[String(start)] = [end, r.name];
    }
    return out;
  }

  function defaultImageImportState() {
    return {
      images: [],            // [{ id, name, dataUrl, status }]
      rows: [],              // [{ name, start, end }]  start/end = "HH:MM"
      targetDate: todayISODate(),
      customDraft: null,     // last applied custom-adjusted schedule (admin-only)
      appliedAt: null,
      updatedAt: null
    };
  }

  function todayISODate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function migrateImportState() {
    const data = state.importAssistant;
    if (!data || data.images === undefined) {
      state.importAssistant = defaultImageImportState();
      saveImportAssistantState();
    }
  }

  function renderScheduleImageImport() {
    migrateImportState();
    const host = document.createElement('div');
    const data = state.importAssistant;

    function persist() {
      data.updatedAt = Date.now();
      saveImportAssistantState();
    }

    function paint() {
      data.targetDate = data.targetDate || todayISODate();
      host.innerHTML = `
        <div class="admin-import-warn">
          <strong>Review before publishing.</strong> Upload a custom bell schedule image, check the rows, then choose the day it should be used. Nothing goes live until Publish.
        </div>

        <div class="admin-field">
          <div class="admin-field-row"><label>1 · Upload custom schedule image</label></div>
          <div class="admin-ai-dropbox" id="oi-drop">
            <input type="file" id="oi-files" accept="image/*" multiple hidden>
            <button type="button" class="admin-btn admin-btn-sm" id="oi-pick">${ICON.upload || ''}<span>Add images</span></button>
            <span class="admin-ai-placeholder">Drop or choose a bell schedule screenshot. The AI will turn it into editable rows below.</span>
            <div id="oi-thumbs" class="admin-image-import-thumbs"></div>
          </div>
          <div class="admin-field-help">Only upload schedule images. Do not upload screenshots with student names, grades, messages, or private info.</div>
        </div>

        <div class="row-gap-8" style="margin-bottom:14px">
          <button type="button" class="admin-btn admin-btn-primary" id="oi-extract" ${data.images.length ? '' : 'disabled'}>Extract Schedule</button>
          <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" id="oi-clear-images" ${data.images.length ? '' : 'disabled'}>Remove all images</button>
          <span class="admin-field-help" id="oi-status"></span>
        </div>

        <div class="admin-field">
          <div class="admin-field-row"><label>2 · Preview rows (editable)</label></div>
          <table class="admin-import-table" id="oi-table"></table>
          <button type="button" class="admin-btn admin-btn-sm" id="oi-add-row" style="margin-top:8px">+ Add row</button>
        </div>

        <hr class="admin-divider">

        <div class="admin-field">
          <div class="admin-field-row"><label>3 · Use this custom schedule</label></div>
          <input type="date" class="admin-input" id="oi-date" value="${escapeHtml(data.targetDate)}">
          <div class="admin-field-help" id="oi-target-note"></div>
        </div>
        <div class="row-gap-8">
          <button type="button" class="admin-btn admin-btn-primary" id="oi-apply" ${data.rows.length ? '' : 'disabled'}>Use This Schedule</button>
          <button type="button" class="admin-btn admin-btn-ghost" id="oi-clear-all">Clear everything</button>
        </div>
      `;

      paintThumbs();
      paintTable();
      paintTargetNote();

      host.querySelector('#oi-pick').addEventListener('click', () => host.querySelector('#oi-files').click());
      host.querySelector('#oi-files').addEventListener('change', onFiles);
      const drop = host.querySelector('#oi-drop');
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragging'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
      drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('dragging');
        onFiles({ target: { files: e.dataTransfer.files, value: '' } });
      });
      host.querySelector('#oi-clear-images').addEventListener('click', () => {
        data.images = [];
        persist(); paint();
      });
      host.querySelector('#oi-extract').addEventListener('click', extractScheduleFromImages);
      host.querySelector('#oi-add-row').addEventListener('click', () => {
        data.rows.push({ name: 'Period', start: '08:00', end: '08:45' });
        data.appliedAt = null;
        persist(); paintTable();
        host.querySelector('#oi-apply').disabled = !data.rows.length;
      });
      host.querySelector('#oi-date').addEventListener('change', e => { data.targetDate = e.target.value || todayISODate(); persist(); paintTargetNote(); });
      host.querySelector('#oi-apply').addEventListener('click', onApply);
      host.querySelector('#oi-clear-all').addEventListener('click', () => {
        if (!confirm('Clear images and drafted rows? Your active schedule is not affected.')) return;
        Object.assign(data, defaultImageImportState());
        persist();
        renderSidebar();
        paint();
      });
    }

    function paintThumbs() {
      const wrap = host.querySelector('#oi-thumbs');
      if (!data.images.length) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = data.images.map(img => `
        <figure class="admin-image-import-thumb" data-id="${escapeHtml(img.id)}">
          <img src="${img.dataUrl}" alt="">
          <figcaption>
            <div class="name">${escapeHtml(img.name)}</div>
            <div class="status">${img.status === 'done' ? 'Extracted' :
                                  img.status === 'running' ? 'Reading…' :
                                  img.status === 'error' ? `Error: ${escapeHtml(img.error || 'unknown')}` :
                                  'Ready'}</div>
          </figcaption>
          <button class="admin-btn admin-btn-sm admin-btn-ghost" data-act="rm">×</button>
        </figure>
      `).join('');
      wrap.querySelectorAll('[data-act=rm]').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.closest('[data-id]').dataset.id;
          data.images = data.images.filter(x => x.id !== id);
          persist(); paint();
        });
      });
    }

    function paintTable() {
      const tbl = host.querySelector('#oi-table');
      if (!data.rows.length) {
        tbl.innerHTML = `<tbody><tr><td colspan="5" class="admin-field-help" style="padding:14px">No rows yet. Upload schedule images, then click Extract Schedule.</td></tr></tbody>`;
        return;
      }
      tbl.innerHTML = `
        <thead><tr><th>Period</th><th>Start</th><th>End</th><th>Duration</th><th></th></tr></thead>
        <tbody>${data.rows.map((r, i) => {
          const dur = (hhmmToSecs(r.end) ?? 0) - (hhmmToSecs(r.start) ?? 0);
          return `<tr data-i="${i}">
            <td><input class="admin-input admin-input-sm" data-f="name" value="${escapeHtml(r.name)}" maxlength="60"></td>
            <td><input class="admin-input admin-input-sm" data-f="start" value="${escapeHtml(r.start)}" placeholder="HH:MM" maxlength="5"></td>
            <td><input class="admin-input admin-input-sm" data-f="end" value="${escapeHtml(r.end)}" placeholder="HH:MM" maxlength="5"></td>
            <td class="muted">${dur > 0 ? Math.round(dur / 60) + ' min' : '—'}</td>
            <td><button type="button" class="admin-btn admin-btn-sm admin-btn-danger" data-act="del">Delete</button></td>
          </tr>`;
        }).join('')}</tbody>
      `;
      tbl.querySelectorAll('input[data-f]').forEach(inp => {
        inp.addEventListener('input', () => {
          const tr = inp.closest('tr');
          const i = +tr.dataset.i;
          data.rows[i][inp.dataset.f] = inp.value;
          data.appliedAt = null;
          persist();
        });
        inp.addEventListener('blur', () => paintTable()); // re-render duration
      });
      tbl.querySelectorAll('[data-act=del]').forEach(b => {
        b.addEventListener('click', () => {
          const i = +b.closest('tr').dataset.i;
          data.rows.splice(i, 1);
          data.appliedAt = null;
          persist(); paintTable();
          host.querySelector('#oi-apply').disabled = !data.rows.length;
        });
      });
    }

    function paintTargetNote() {
      const note = host.querySelector('#oi-target-note');
      const d = data.targetDate || todayISODate();
      note.textContent = `This will set the active schedule to Custom Adjusted Schedule for ${d}. The Publish button is still required before visitors see it.`;
    }

    async function onFiles(e) {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        if (f.size > 8 * 1024 * 1024) { toast(`${f.name}: image too large (max 8 MB)`, 'error', 4000); continue; }
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        data.images.push({ id: 'i_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: f.name, dataUrl, status: 'ready' });
      }
      persist(); paint();
    }

    async function extractScheduleFromImages() {
      if (!data.images.length) {
        toast('Add at least one schedule image first.', 'error', 3000);
        return;
      }
      const status = host.querySelector('#oi-status');
      status.textContent = 'Reading schedule images…';
      data.images.forEach(img => { img.status = 'running'; img.error = ''; });
      persist();
      paintThumbs();
      try {
        const resp = await api('/admin/ai/extract-schedule-image', {
          method: 'POST',
          body: JSON.stringify({
            images: data.images.map(({ name, dataUrl }) => ({ name, dataUrl }))
          })
        });
        if (!Array.isArray(resp.rows)) throw new Error('Backend returned unexpected response');
        data.rows = resp.rows.map(r => ({
          name: String(r.name || '').slice(0, 60),
          start: String(r.start || '').slice(0, 5),
          end:   String(r.end   || '').slice(0, 5)
        })).filter(r => r.name && /^\d{1,2}:\d{2}$/.test(r.start) && /^\d{1,2}:\d{2}$/.test(r.end));
        data.appliedAt = null;
        data.images.forEach(img => { img.status = 'done'; });
        persist();
        paintThumbs();
        paintTable();
        renderSidebar();
        host.querySelector('#oi-apply').disabled = !data.rows.length;
        status.textContent = `Extracted ${data.rows.length} row${data.rows.length === 1 ? '' : 's'}.`;
        toast('Schedule rows extracted. Review every row before applying.', 'success', 3500);
      } catch (e) {
        for (const img of data.images) if (img.status === 'running') { img.status = 'error'; img.error = e.message; }
        persist();
        paintThumbs();
        status.textContent = 'Extraction failed: ' + e.message;
        toast(e.message, 'error', 5000);
      }
    }

    function onApply() {
      if (!data.rows.length) return;
      const target = 'Custom Adjusted Schedule';
      const bs = rowsToBellSchedule(data.rows);
      if (!Object.keys(bs).length) { toast('No valid rows — fix HH:MM values first.', 'error', 4000); return; }
      state.draft.bellSchedules = state.draft.bellSchedules || {};
      state.draft.bellSchedules[target] = bs;
      state.draft.scheduleOverride = { type: target, date: data.targetDate || todayISODate(), timestamp: Date.now() };
      data.customDraft = { rows: data.rows.slice(), date: data.targetDate || todayISODate(), savedAt: Date.now() };
      data.appliedAt = Date.now();
      persist();
      markDirty();
      renderSidebar();
      pushPreview();
      toast('Custom schedule is ready in your draft. Click Publish to make it live.', 'success', 4500);
    }

    paint();
    return host;
  }

  function renderAuditLog() {
    const host = document.createElement('div');
    host.innerHTML = '<div class="admin-field-help">Loading…</div>';
    api('/admin/audit-log?limit=200').then(j => {
      const storage = j.storage;
      const storageNote = storage ? `<div class="admin-privacy-note" style="margin-bottom:14px">Audit storage: ${escapeHtml(storage.type)}${storage.durable ? ` · ${escapeHtml(storage.repo || '')}/${escapeHtml(storage.path || '')}` : ' · local development only'}</div>` : '';
      if (!j.entries?.length) { host.innerHTML = storageNote + '<div class="admin-field-help">No events yet.</div>'; return; }
      host.innerHTML = `
        ${storageNote}
        <table class="admin-audit-table">
          <thead><tr><th>When</th><th>Actor</th><th>IP</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            ${j.entries.map(e => `
              <tr>
                <td class="muted">${new Date(e.ts).toLocaleString()}</td>
                <td class="muted">${escapeHtml(e.actor?.email || e.email || e.actor?.name || '—')}</td>
                <td class="muted">${escapeHtml(e.ip || '—')}</td>
                <td class="action">${escapeHtml(e.action)}</td>
                <td class="muted">${escapeHtml([e.sections?.join(','), e.patchKeys?.join(','), e.section, e.file, e.type, e.rowCount && `${e.rowCount} rows`, e.imageCount && `${e.imageCount} images`, e.message].filter(Boolean).join(' · ') || '—')}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }).catch(e => { host.innerHTML = `<div class="admin-field-help" style="color:var(--danger)">${escapeHtml(e.message)}</div>`; });
    return host;
  }

  function formatNumber(n) {
    return new Intl.NumberFormat().format(Math.round(Number(n) || 0));
  }

  function formatDuration(seconds) {
    seconds = Math.round(Number(seconds) || 0);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  }

  function pageLabel(page) {
    return ({ schedule: 'Schedule', announcements: 'Announcements', grades: 'GradeViewer' })[page] || page;
  }

  function renderAnalyticsDashboard() {
    const host = document.createElement('div');
    host.innerHTML = '<div class="admin-field-help">Loading statistics…</div>';
    api('/admin/analytics').then(j => {
      const ga = j.googleAnalytics || {};
      const days = j.days || {};
      const keys = Object.keys(days).sort();
      const last7 = keys.slice(-7);
      const totals = last7.reduce((acc, key) => {
        const t = days[key]?.totals || {};
        acc.pageviews += t.pageviews || 0;
        acc.heartbeats += t.heartbeats || 0;
        acc.durationSeconds += t.durationSeconds || 0;
        return acc;
      }, { pageviews: 0, heartbeats: 0, durationSeconds: 0 });

      const pages = {};
      for (const key of last7) {
        for (const [page, metrics] of Object.entries(days[key]?.pages || {})) {
          pages[page] ||= { pageviews: 0, heartbeats: 0, durationSeconds: 0 };
          pages[page].pageviews += metrics.pageviews || 0;
          pages[page].heartbeats += metrics.heartbeats || 0;
          pages[page].durationSeconds += metrics.durationSeconds || 0;
        }
      }

      const pageEntries = Object.entries(pages).sort((a, b) => b[1].pageviews - a[1].pageviews);
      const maxPageViews = Math.max(1, ...pageEntries.map(([, m]) => m.pageviews || 0));
      const trendDays = keys.slice(-7);
      const maxDayViews = Math.max(1, ...trendDays.map(key => days[key]?.totals?.pageviews || 0));

      const pageRows = pageEntries
        .map(([page, m]) => `
          <tr>
            <td class="action">
              <div class="admin-page-cell">
                <span>${escapeHtml(pageLabel(page))}</span>
                <span class="admin-page-bar"><i style="width:${Math.round(((m.pageviews || 0) / maxPageViews) * 100)}%"></i></span>
              </div>
            </td>
            <td>${formatNumber(m.pageviews)}</td>
            <td>${formatDuration(m.durationSeconds)}</td>
            <td>${formatNumber(j.active?.pages?.[page] || 0)}</td>
          </tr>`).join('');

      const trendBars = trendDays.map(key => {
        const t = days[key]?.totals || {};
        const label = key.slice(5).replace('-', '/');
        const height = Math.max(4, Math.round(((t.pageviews || 0) / maxDayViews) * 100));
        return `<div class="admin-trend-bar" title="${escapeHtml(key)} · ${formatNumber(t.pageviews)} views">
          <span style="height:${height}%"></span>
          <strong>${formatNumber(t.pageviews)}</strong>
          <em>${escapeHtml(label)}</em>
        </div>`;
      }).join('');

      const pageBars = pageEntries.map(([page, m]) => `
        <div class="admin-rank-row">
          <div>
            <strong>${escapeHtml(pageLabel(page))}</strong>
            <span>${formatDuration(m.durationSeconds)} total time · ${formatNumber(j.active?.pages?.[page] || 0)} active</span>
          </div>
          <div class="admin-rank-meter"><span style="width:${Math.round(((m.pageviews || 0) / maxPageViews) * 100)}%"></span></div>
          <b>${formatNumber(m.pageviews)}</b>
        </div>`).join('');

      const dayRows = [...last7].reverse().map(key => {
        const t = days[key]?.totals || {};
        return `<tr>
          <td class="action">${escapeHtml(key)}</td>
          <td>${formatNumber(t.pageviews)}</td>
          <td>${formatDuration(t.durationSeconds)}</td>
          <td>${formatNumber(t.heartbeats)}</td>
        </tr>`;
      }).join('');

      host.innerHTML = `
        <div class="admin-stat-grid">
          <div class="admin-stat"><span>GA active users</span><strong>${ga.configured && !ga.error ? formatNumber(ga.totals?.activeUsers || 0) : 'Not set'}</strong><small>Google Analytics</small></div>
          <div class="admin-stat"><span>GA 7-day views</span><strong>${ga.configured && !ga.error ? formatNumber(ga.totals?.pageviews || 0) : '-'}</strong><small>${ga.configured && !ga.error ? `${formatNumber(ga.totals?.sessions || 0)} sessions` : 'Waiting for setup'}</small></div>
          <div class="admin-stat"><span>Active now</span><strong>${formatNumber(j.active?.total || 0)}</strong><small>First-party live count</small></div>
          <div class="admin-stat"><span>First-party 7-day views</span><strong>${formatNumber(totals.pageviews)}</strong><small>${formatDuration(totals.durationSeconds)} total time</small></div>
        </div>
        <div class="${ga.configured && !ga.error ? 'admin-privacy-note' : 'admin-setup-note'}">
          ${ga.configured && !ga.error
            ? `Google Analytics connected to property ${escapeHtml(ga.propertyId || '')}. First-party privacy-safe stats remain below as fallback.`
            : `Google Analytics is not configured yet. Set GA4_PROPERTY_ID and OAuth analytics env vars on the backend to show GA data here.`}
        </div>
        <div class="admin-analytics-grid">
          <section class="admin-analytics-panel admin-analytics-panel--wide">
            <div class="admin-panel-heading">
              <h2>7-day traffic trend</h2>
              <span>First-party page views</span>
            </div>
            <div class="admin-trend-chart">${trendBars || '<div class="admin-field-help">No daily data yet.</div>'}</div>
          </section>
          <section class="admin-analytics-panel">
            <div class="admin-panel-heading">
              <h2>Top pages</h2>
              <span>Views by section</span>
            </div>
            <div class="admin-rank-list">${pageBars || '<div class="admin-field-help">No page data yet.</div>'}</div>
          </section>
        </div>
        ${ga.configured && !ga.error ? `<h2 style="margin-top:22px">Google Analytics pages</h2>
        <table class="admin-audit-table">
          <thead><tr><th>Path</th><th>Views</th><th>Users</th><th>Avg session</th></tr></thead>
          <tbody>${(ga.pages || []).map(p => `<tr>
            <td class="action">${escapeHtml(p.path)}</td>
            <td>${formatNumber(p.pageviews)}</td>
            <td>${formatNumber(p.activeUsers)}</td>
            <td>${formatDuration(p.averageSessionDuration)}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">No GA page data yet.</td></tr>'}</tbody>
        </table>` : ga.error ? `<div class="admin-field-help" style="color:var(--danger);margin-top:12px">${escapeHtml(ga.error)}</div>` : ''}
        <h2 style="margin-top:22px">First-party pages</h2>
        <table class="admin-audit-table">
          <thead><tr><th>Page</th><th>Views</th><th>Total time</th><th>Active now</th></tr></thead>
          <tbody>${pageRows || '<tr><td colspan="4" class="muted">No page data yet.</td></tr>'}</tbody>
        </table>
        <h2 style="margin-top:22px">Recent days</h2>
        <table class="admin-audit-table">
          <thead><tr><th>Date</th><th>Views</th><th>Total time</th><th>Heartbeats</th></tr></thead>
          <tbody>${dayRows || '<tr><td colspan="4" class="muted">No daily data yet.</td></tr>'}</tbody>
        </table>`;
    }).catch(e => { host.innerHTML = `<div class="admin-field-help" style="color:var(--danger)">${escapeHtml(e.message)}</div>`; });
    return host;
  }

  // ── Tab body render ────────────────────────────────────────────────────
  function renderActiveTab() {
    const tab = SCHEMA.find(t => t.id === state.activeTab) || SCHEMA[0];
    $('#tab-title').textContent = tab.title || tab.label;
    $('#tab-sub').textContent   = tab.sub;
    const panels = $('#panels');
    panels.innerHTML = '';
    panels.className = tab.id === 'appearance' ? 'admin-panels admin-panels--appearance' : 'admin-panels';

    const q = state.search.trim().toLowerCase();
    const matches = (label) => !q || (label || '').toLowerCase().includes(q);

    let anyVisible = false;
    for (const group of tab.groups) {
      const card = document.createElement('section');
      card.className = 'admin-card';
      if (tab.id === 'appearance') card.classList.add(`admin-appearance-card-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      card.innerHTML = `<h2>${escapeHtml(group.title)}</h2>`;

      if (group.custom === 'navEditor')                 { card.appendChild(renderNavEditor()); anyVisible = true; }
      else if (group.custom === 'announcementsEditor')  { card.appendChild(renderAnnouncementsEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleOverrideEditor'){ card.appendChild(renderScheduleOverrideEditor()); anyVisible = true; }
      else if (group.custom === 'bellEditor')           { card.appendChild(renderBellEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleImageImport') { card.appendChild(renderScheduleImageImport()); anyVisible = true; }
      else if (group.custom === 'privacyParagraphsEditor'){ card.appendChild(renderPrivacyParagraphsEditor()); anyVisible = true; }
      else if (group.custom === 'analyticsDashboard')   { card.appendChild(renderAnalyticsDashboard()); anyVisible = true; }
      else if (group.custom === 'auditLog')             { card.appendChild(renderAuditLog()); anyVisible = true; }
      else if (group.fields) {
        const visible = group.fields.filter(f => matches(f.label) || matches(f.path));
        if (!visible.length) continue;
        anyVisible = true;
        for (const f of visible) card.appendChild(renderField(f));
      }
      panels.appendChild(card);
    }
    if (!anyVisible && q) {
      panels.innerHTML = `<div class="admin-card"><div class="admin-field-help">No fields match "${escapeHtml(q)}" on this tab. Other tabs may have matches.</div></div>`;
    }

    refreshDirtyMarkers();
    pushPreview();
  }

  // ── Dirty / publish ────────────────────────────────────────────────────
  function refreshDirtyMarkers() {
    const dirty = !eq(state.settings, state.draft);
    const tab = SCHEMA.find(t => t.id === state.activeTab) || SCHEMA[0];
    const readOnly = Boolean(tab.readOnly);
    $('#discard-btn').classList.toggle('hidden', readOnly);
    $('#publish-btn').classList.toggle('hidden', readOnly);
    $('#dirty-pill').classList.toggle('hidden', readOnly);
    $('#dirty-pill').classList.toggle('visible', dirty);
    $('#dirty-pill').textContent = dirty ? 'Unsaved changes' : '';
    $('#publish-btn').disabled = readOnly || !dirty;
    $('#discard-btn').disabled = readOnly || !dirty;
    $$('.admin-field').forEach(f => {
      const path = f.dataset.path;
      if (path) f.classList.toggle('is-modified', isModified(path));
    });
  }
  function markDirty() { refreshDirtyMarkers(); }

  $('#discard-btn').addEventListener('click', () => {
    state.draft = deepClone(state.settings);
    renderActiveTab();
    toast('Discarded local changes', 'success', 1800);
  });

  $('#publish-btn').addEventListener('click', async () => {
    const btn = $('#publish-btn');
    btn.disabled = true; btn.textContent = 'Publishing…';
    try {
      const patch = {};
      const keys = new Set([...Object.keys(state.settings), ...Object.keys(state.draft)]);
      for (const k of keys) {
        if (k === 'updatedAt') continue;
        if (!eq(state.settings[k], state.draft[k])) patch[k] = state.draft[k];
      }
      if (!Object.keys(patch).length) { toast('Nothing to publish'); return; }
      const json = await api('/site-settings', { method: 'PUT', body: JSON.stringify({ patch }) });
      state.settings = json.settings;
      state.draft = deepClone(json.settings);
      toast('Changes published — public site will update within 30 s.', 'success', 4000);
      renderActiveTab();
      // If the preview is open in DRAFT mode, switch to LIVE-from-server-fresh
      if ($('#preview-host').classList.contains('open')) refreshPreview();
    } catch (e) {
      toast('Publish failed: ' + e.message, 'error', 6000);
    } finally {
      btn.disabled = false; btn.textContent = 'Publish';
    }
  });

  // ── Search ─────────────────────────────────────────────────────────────
  $('#search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    if (state.search) {
      for (const tab of SCHEMA) {
        const hits = tab.groups.some(g => (g.fields || []).some(f => (f.label || '').toLowerCase().includes(state.search.toLowerCase())));
        if (hits) { state.activeTab = tab.id; break; }
      }
      renderSidebar();
    }
    renderActiveTab();
  });

  // ── Preview overlay ────────────────────────────────────────────────────
  // Mode 'draft' → load page with ?_preview, then postMessage draft into it.
  // Mode 'live'  → load page without ?_preview so it fetches the published version.
  let previewPage = 'index.html';
  let _previewReady = false;
  function buildPreviewUrl() {
    const ts = Date.now();
    return state.previewMode === 'draft'
      ? `${previewPage}?_preview=1&_ts=${ts}`
      : `${previewPage}?_ts=${ts}`;
  }
  function refreshPreview() {
    _previewReady = false;
    $('#preview-frame').src = buildPreviewUrl();
    paintPreviewBar();
  }
  function pushPreview() {
    if (!$('#preview-host').classList.contains('open')) return;
    if (state.previewMode !== 'draft') return;
    if (!_previewReady) return;
    try {
      $('#preview-frame').contentWindow.postMessage({ type: 'phs:preview-settings', settings: state.draft }, location.origin);
    } catch {}
  }
  function paintPreviewBar() {
    $('#preview-mode-pill').className = 'mode-pill' + (state.previewMode === 'draft' ? ' draft' : '');
    $('#preview-mode-pill').textContent = state.previewMode === 'draft' ? 'Showing draft (un-published)' : 'Showing published version';
    $$('#preview-mode-seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.previewMode));
    $$('#preview-page-seg button').forEach(b => b.classList.toggle('active', b.dataset.previewPage === previewPage));
  }
  $('#open-preview-btn').addEventListener('click', () => {
    $('#preview-host').classList.add('open');
    state.previewMode = 'draft';
    refreshPreview();
  });
  $('#preview-close-btn').addEventListener('click', () => { $('#preview-host').classList.remove('open'); });
  $('#preview-refresh-btn').addEventListener('click', refreshPreview);
  $$('#preview-page-seg button').forEach(b => b.addEventListener('click', () => { previewPage = b.dataset.previewPage; refreshPreview(); }));
  $$('#preview-mode-seg button').forEach(b => b.addEventListener('click', () => { state.previewMode = b.dataset.mode; refreshPreview(); }));

  // Iframe signals readiness; we then immediately push the draft.
  window.addEventListener('message', (e) => {
    const previewFrame = $('#preview-frame');
    if (e.source !== previewFrame.contentWindow || e.origin !== location.origin) return;
    if (e.data?.type === 'phs:preview-ready') {
      _previewReady = true;
      pushPreview();
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────
  if (isLocal || state.token) bootApp(); else showLogin();
  if (!isLocal) loadAuthConfig();
})();
