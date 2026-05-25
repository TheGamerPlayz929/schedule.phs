/* PHS Schedule — Admin dashboard
 * Schema-driven settings editor talking to /admin/* and /site-settings.
 * Preview overlay pipes the *draft* into the iframe via postMessage so admins
 * can verify changes before publishing.
 */
(() => {
  'use strict';

  const isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const BACKEND_HOST = 'phs-grades-backend.onrender.com';
  const isBackendHostedAdmin = location.hostname === BACKEND_HOST;
  const BACKEND = isBackendHostedAdmin ? location.origin : (isLocal ? 'http://localhost:3000' : `https://${BACKEND_HOST}`);
  const TOKEN_KEY = 'phs:admin-token:v1';
  const IMPORT_STATE_KEY = 'phs:admin-import-assistant:v1';
  const SIDEBAR_COLLAPSED_KEY = 'phs:admin-sidebar-collapsed:v1';

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    token: null,
    authConfig: null,
    settings: null,    // current saved settings (server)
    defaults: null,
    draft: null,       // working copy with unsaved edits
    identity: null,
    activeTab: 'branding',
    search: '',
    previewMode: 'draft', // 'draft' | 'live'
    importAssistant: null,
    jarvis: {
      messages: [
        { role: 'assistant', text: 'Ask anything. I will draft the change, then you can preview and publish it.' }
      ],
      pending: null,
      attachments: [],
      busy: false
    }
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
    paperclip:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7L9.7 17.7a2 2 0 1 1-2.8-2.8l8.8-8.8"/></svg>`,
    sparkle:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.2L19 9l-5.3 1.8L12 16l-1.7-5.2L5 9l5.3-1.8L12 2z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14zM5 15l.7 1.8L7.5 17.5l-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z"/></svg>`,
    jarvis:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a7 7 0 00-7 7v3a7 7 0 0014 0v-3a7 7 0 00-7-7z"/><path d="M9 10h.01M15 10h.01M9.5 15c1.5 1 3.5 1 5 0"/><path d="M12 20v2"/></svg>`,
    backup:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9"/><path d="M3 4v6h6"/><path d="M12 7v5l3 2"/></svg>`,
  };

  // ── Schema (drives the entire UI) ──────────────────────────────────────
  const SCHEMA = [
    { id: 'jarvis',       label: 'Jarvis', title: 'Jarvis V1.1', icon: 'jarvis',
      sub: 'Ask Anything. Let Jarvis cook, then preview before publishing.',
      groups: [{ title: '', custom: 'jarvisAssistant' }]
    },
    { id: 'branding',    label: 'Branding',         icon: 'branding',
      sub: 'Site title, logo, favicon — visible on every page.',
      groups: [{
        title: 'Identity', fields: [
          { path: 'branding.siteTitle',       label: 'Site title (browser tab)', kind: 'text', max: 200 },
          { path: 'branding.siteDescription', label: 'Meta description',         kind: 'text', max: 300 },
        ]},{
        title: 'Logo', fields: [
          { path: 'branding.logoSrc',  label: 'Logo image', kind: 'image', help: 'PNG / JPG / SVG, ≤ 4 MB' },
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
    },
    { id: 'backups',      label: 'Backups',          icon: 'backup',
      sub: 'Restore a previously published version if a change needs to be rolled back.',
      readOnly: true,
      groups: [{ title: 'Published versions', custom: 'backupManager' }]
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
  function applySettingsPatch(target, patch) {
    for (const [k, v] of Object.entries(patch || {})) {
      if (k === 'updatedAt') continue;
      if (v === null || Array.isArray(v) || typeof v !== 'object') {
        target[k] = deepClone(v);
        continue;
      }
      target[k] = Object.assign({}, target[k] || {}, v);
      for (const [nestedKey, nestedValue] of Object.entries(v)) {
        if (Array.isArray(nestedValue)) target[k][nestedKey] = deepClone(nestedValue);
      }
    }
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function safeDataImageSrc(src) {
    const raw = String(src || '').trim();
    return /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw) ? raw : '';
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
    const silentAuth = Boolean(opts.silentAuth);
    const init = Object.assign({}, opts);
    delete init.silentAuth;
    init.headers = Object.assign({},
      opts.headers || {},
      opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {});
    init.credentials = opts.credentials || 'include';
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
      if (!silentAuth) showLogin('Session expired — sign in again.');
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
    syncSidebarState();
  }
  function fetchWithTimeout(url, opts = {}, ms = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, Object.assign({}, opts, { signal: controller.signal }))
      .finally(() => clearTimeout(timer));
  }
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  function setLoginStatus(message, opts = {}) {
    const loading = $('#google-login-loading');
    const retry = $('#login-retry-btn');
    if (loading) {
      loading.textContent = message || '';
      loading.classList.toggle('hidden', !message);
    }
    if (retry) retry.classList.toggle('hidden', !opts.retry);
  }

  async function loadAuthConfig() {
    $('#login-error').textContent = '';
    setLoginStatus('Connecting to admin backend...', { retry: false });
    try {
      const res = await fetchWithTimeout(BACKEND + '/admin/auth-config', { credentials: 'omit' }, 15000);
      state.authConfig = res.ok ? await res.json() : {};
    } catch {
      state.authConfig = {};
      setLoginStatus('Admin backend is offline or still waking up. Try again in a few seconds.', { retry: true });
      return;
    }
    configureGoogleLogin();
  }

  function configureGoogleLogin() {
    const clientId = state.authConfig?.googleClientId;
    if (!clientId) {
      setLoginStatus(
        isLocal
          ? 'Local admin uses the backend bypass. Start the backend on http://localhost:3000, then retry.'
          : 'Google sign-in is not configured on the backend yet.',
        { retry: isLocal }
      );
      return;
    }

    $('#google-login-wrap')?.classList.remove('hidden');
    setLoginStatus('Loading Google sign-in...', { retry: false });

    const render = () => {
      if (!window.google?.accounts?.id || !$('#google-login-btn')) return false;
      try {
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
      } catch (e) {
        console.warn('Google sign-in render failed', e);
        setLoginStatus(`Google sign-in could not render for ${location.origin}. Check the OAuth authorized JavaScript origins, then retry.`, { retry: true });
        return true;
      }
    };

    if (!render()) {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (render()) {
          clearInterval(timer);
        } else if (tries > 50) {
          clearInterval(timer);
          setLoginStatus('Google sign-in script did not load. Check your network/ad blocker, then retry.', { retry: true });
        }
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
        credentials: 'include',
        body: JSON.stringify({ credential: response.credential })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Google sign-in failed');
      state.token = null;
      localStorage.removeItem(TOKEN_KEY);
      setLoginStatus('Opening admin session...', { retry: false });
      let who;
      try {
        who = await waitForAdminSession();
      } catch (cookieError) {
        if (!json.token) throw cookieError;
        state.token = json.token;
        localStorage.setItem(TOKEN_KEY, json.token);
        setLoginStatus('Opening admin session with browser fallback...', { retry: false });
        who = await waitForAdminSession();
      }
      await bootApp(who);
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
    loadAuthConfig();
  });

  $('#login-retry-btn')?.addEventListener('click', () => {
    if (isLocal) bootApp();
    else loadAuthConfig();
  });

  async function waitForAdminSession() {
    let lastError = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        return await api('/admin/whoami', { silentAuth: true });
      } catch (error) {
        lastError = error;
        await sleep(150);
      }
    }
    throw new Error(
      lastError?.message === 'Unauthorized'
        ? 'Google sign-in completed, but the admin session cookie was not accepted by this browser.'
        : (lastError?.message || 'Admin session could not be confirmed.')
    );
  }

  async function bootApp(existingWho) {
    try {
      const who = existingWho || await api('/admin/whoami');
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
      if (isLocal && !state.token) {
        showLogin('Local backend is not reachable at http://localhost:3000.');
        state.authConfig = { localBypassEnabled: true };
        configureGoogleLogin();
      } else {
        showLogin(state.token ? 'Session expired. Sign in with Google again.' : '');
        loadAuthConfig();
      }
    }
  }
  function pingConnection() {
    api('/health', { silentAuth: true })
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
      b.title = tab.label;
      b.innerHTML = `<span class="admin-tab-icon">${ICON[tab.icon] || ICON.audit}</span><span class="admin-tab-label">${escapeHtml(tab.label)}</span>`;
      b.addEventListener('click', () => { state.activeTab = tab.id; closeMobileSidebar(); renderSidebar(); renderActiveTab(); });
      nav.appendChild(b);
    }
  }

  function isMobileSidebarMode() {
    return window.matchMedia?.('(max-width: 860px)').matches || false;
  }

  function syncSidebarState() {
    const shell = $('#app-shell');
    if (!shell) return;
    const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    shell.classList.toggle('admin-shell--sidebar-collapsed', collapsed);
    const desktopBtn = $('#sidebar-collapse-btn');
    const mobileBtn = $('#mobile-sidebar-toggle');
    const mobile = isMobileSidebarMode();
    const expanded = !collapsed;
    desktopBtn?.setAttribute('aria-expanded', String(mobile || expanded));
    desktopBtn?.setAttribute('aria-label', mobile ? 'Close navigation' : (collapsed ? 'Expand navigation' : 'Collapse navigation'));
    mobileBtn?.setAttribute('aria-expanded', String(shell.classList.contains('admin-shell--sidebar-open')));
  }

  function toggleDesktopSidebar() {
    if (isMobileSidebarMode()) {
      toggleMobileSidebar();
      return;
    }
    const shell = $('#app-shell');
    const collapsed = !shell.classList.contains('admin-shell--sidebar-collapsed');
    shell.classList.toggle('admin-shell--sidebar-collapsed', collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    syncSidebarState();
  }

  function openMobileSidebar() {
    const shell = $('#app-shell');
    shell?.classList.add('admin-shell--sidebar-open');
    $('#mobile-sidebar-toggle')?.setAttribute('aria-expanded', 'true');
  }

  function closeMobileSidebar() {
    const shell = $('#app-shell');
    shell?.classList.remove('admin-shell--sidebar-open');
    $('#mobile-sidebar-toggle')?.setAttribute('aria-expanded', 'false');
  }

  function toggleMobileSidebar() {
    const shell = $('#app-shell');
    if (!shell) return;
    if (shell.classList.contains('admin-shell--sidebar-open')) closeMobileSidebar();
    else openMobileSidebar();
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
        <img src="${escapeHtml(v)}" alt="">
        <div class="info">
          <div class="name">${escapeHtml(v) || '— no image set —'}</div>
          <div class="meta">Choose a file to upload, or paste a URL/path.</div>
        </div>
      `;
      preview.querySelector('img')?.addEventListener('error', e => { e.currentTarget.style.opacity = '.2'; });
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
        const json = await api('/admin/upload', { method: 'POST', body: fd });
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
          <img src="${escapeHtml(safeDataImageSrc(img.dataUrl))}" alt="">
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

  function renderJarvisAssistant() {
    const host = document.createElement('div');
    const MAX_JARVIS_ATTACHMENTS = 4;
    const MAX_JARVIS_ATTACHMENT_BYTES = 5 * 1024 * 1024;

    function sectionsLabel(sections) {
      const list = Array.isArray(sections) ? sections : [];
      return list.length ? list.join(', ') : 'No settings changed';
    }

    function formatBytes(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    }

    function attachmentDataForMessage(attachments) {
      return attachments.map(a => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        src: a.src
      }));
    }

    function renderAttachmentChips(attachments, removable = false) {
      const list = Array.isArray(attachments) ? attachments : [];
      if (!list.length) return '';
      return `
        <div class="admin-jarvis-attachments ${removable ? 'editable' : ''}">
          ${list.map((a, i) => `
            <div class="admin-jarvis-attachment" data-jarvis-attachment="${i}">
              ${safeDataImageSrc(a.src) ? `<img src="${escapeHtml(safeDataImageSrc(a.src))}" alt="">` : `<span class="admin-jarvis-fileicon">${ICON.paperclip}</span>`}
              <span class="admin-jarvis-attachment-name">${escapeHtml(a.name || 'Image')}</span>
              <span class="admin-jarvis-attachment-size">${escapeHtml(formatBytes(a.size))}</span>
              ${removable ? `<button type="button" aria-label="Remove ${escapeHtml(a.name || 'attachment')}" data-remove-jarvis-attachment="${i}">${ICON.close}</button>` : ''}
            </div>`).join('')}
        </div>`;
    }

    function readJarvisAttachment(file) {
      return new Promise((resolve, reject) => {
        if (!file || !/^image\//.test(file.type || '')) {
          reject(new Error('Jarvis can use images right now. Upload a PNG, JPG, WEBP, or GIF.'));
          return;
        }
        if (file.size > MAX_JARVIS_ATTACHMENT_BYTES) {
          reject(new Error(`${file.name} is too large. Keep each image under 5 MB.`));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.onload = () => {
          const src = String(reader.result || '');
          const data = src.split(',')[1] || '';
          resolve({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: file.name || 'image',
            mimeType: file.type || 'image/png',
            size: file.size || 0,
            src,
            data
          });
        };
        reader.readAsDataURL(file);
      });
    }

    function pendingCard() {
      const pending = state.jarvis.pending;
      if (!pending) return '';
      return `
        <div class="admin-jarvis-pending">
          <div>
            <strong>${escapeHtml(pending.summary || 'Draft change ready')}</strong>
            <span>${escapeHtml(sectionsLabel(pending.sections))}</span>
          </div>
          <div class="row-gap-8">
            <button type="button" class="admin-btn admin-btn-sm" data-jarvis-act="preview">${ICON.eye}<span>Preview</span></button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-primary" data-jarvis-act="done">Publish</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-jarvis-act="undo">Revert</button>
          </div>
        </div>`;
    }

    let stopJarvisGlobe = null;

    function jarvisNoise(seed) {
      const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return n - Math.floor(n);
    }

    function normalizeJarvisPoint(x, y, z) {
      const len = Math.hypot(x, y, z) || 1;
      return { x: x / len, y: y / len, z: z / len };
    }

    function makeJarvisGlobePoints(count = 168) {
      const points = [];
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const cluster = i % 17 === 0 ? 0.22 : i % 11 === 0 ? -0.16 : 0;
        const zJitter = (jarvisNoise(i + 1.7) - 0.5) * 0.095 + cluster;
        const thetaJitter = (jarvisNoise(i + 9.4) - 0.5) * 0.72;
        const z = Math.max(-0.98, Math.min(0.98, 1 - (2 * (i + 0.5)) / count + zJitter));
        const radius = Math.sqrt(1 - z * z);
        const theta = i * goldenAngle + thetaJitter;
        const raw = normalizeJarvisPoint(
          Math.cos(theta) * radius + (jarvisNoise(i + 21.1) - 0.5) * 0.09,
          z + (jarvisNoise(i + 33.8) - 0.5) * 0.07,
          Math.sin(theta) * radius + (jarvisNoise(i + 47.6) - 0.5) * 0.09
        );
        points.push({
          x: raw.x,
          y: raw.y,
          z: raw.z,
          size: 0.62 + jarvisNoise(i + 61.2) * 1.24,
          phase: jarvisNoise(i + 74.5),
          drift: 0.35 + jarvisNoise(i + 88.9) * 0.65
        });
      }
      return points;
    }

    function makeJarvisGlobeLinks(points) {
      const links = [];
      const seen = new Set();
      points.forEach((point, i) => {
        const nearest = [];
        points.forEach((other, j) => {
          if (i === j) return;
          const dx = point.x - other.x;
          const dy = point.y - other.y;
          const dz = point.z - other.z;
          const dist = dx * dx + dy * dy + dz * dz;
          const cutoff = 0.13 + jarvisNoise(i * 17 + j * 3.1) * 0.15;
          if (dist < cutoff) nearest.push({ j, dist });
        });
        const linkCount = 1 + Math.floor(jarvisNoise(i + 122.3) * 3);
        nearest.sort((a, b) => a.dist - b.dist).slice(0, linkCount).forEach(({ j }) => {
          const key = i < j ? `${i}:${j}` : `${j}:${i}`;
          if (!seen.has(key)) {
            seen.add(key);
            links.push([i, j]);
          }
        });
      });
      return links;
    }

    function startJarvisGlobe(canvas) {
      const ctx = canvas?.getContext?.('2d');
      if (!ctx) return () => {};
      const points = makeJarvisGlobePoints();
      const links = makeJarvisGlobeLinks(points);
      const signalLinks = links.length ? links : [[0, 1]];
      const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const signals = Array.from({ length: 34 }, (_, i) => ({
        link: (i * 19) % signalLinks.length,
        offset: (i * 0.137) % 1,
        speed: 0.000055 + (i % 5) * 0.000012
      }));
      let frame = 0;
      let stopped = false;
      let startedAt = performance.now();

      function resize(rect) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function project(point, angle, tick, width, height, sphereRadius) {
        const cosY = Math.cos(angle);
        const sinY = Math.sin(angle);
        const xRot = point.x * cosY + point.z * sinY;
        const zRot = -point.x * sinY + point.z * cosY;
        const tilt = -0.24;
        const cosX = Math.cos(tilt);
        const sinX = Math.sin(tilt);
        const yRot = point.y * cosX - zRot * sinX;
        const zTilt = point.y * sinX + zRot * cosX;
        const perspective = 1.58 / (1.88 - zTilt * 0.48);
        const depth = Math.max(0, Math.min(1, (zTilt + 1) / 2));
        return {
          x: width / 2 + xRot * sphereRadius * perspective,
          y: height / 2 + yRot * sphereRadius * perspective,
          depth,
          size: (1.05 + depth * 3.25) * point.size * (0.88 + 0.18 * Math.sin(tick * 0.0018 * point.drift + point.phase * Math.PI * 2)),
          alpha: 0.12 + depth * 0.82
        };
      }

      function drawGlobe(now) {
        if (stopped || !canvas.isConnected) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
          frame = requestAnimationFrame(drawGlobe);
          return;
        }
        resize(rect);
        const width = rect.width;
        const height = rect.height;
        const tick = now - startedAt;
        const angle = prefersReduced ? -0.45 : tick * 0.00022;
        const sphereRadius = Math.min(width, height) * 0.38;
        const projected = points.map(point => project(point, angle, tick, width, height, sphereRadius));

        ctx.clearRect(0, 0, width, height);
        const glow = ctx.createRadialGradient(width / 2, height / 2, sphereRadius * 0.08, width / 2, height / 2, sphereRadius * 1.35);
        glow.addColorStop(0, 'rgba(255,255,255,0.16)');
        glow.addColorStop(0.42, 'rgba(255,255,255,0.045)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, sphereRadius * 1.42, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const offset = (i - 2) * sphereRadius * (0.29 + jarvisNoise(i + 201) * 0.05);
          ctx.globalAlpha = 0.08 - Math.abs(i - 2) * 0.01;
          ctx.beginPath();
          ctx.ellipse(
            width / 2 + (jarvisNoise(i + 211) - 0.5) * sphereRadius * 0.06,
            height / 2 + offset,
            sphereRadius * Math.sqrt(Math.max(0.08, 1 - Math.pow((i - 2) * 0.27, 2))),
            sphereRadius * (0.075 + jarvisNoise(i + 223) * 0.045),
            (jarvisNoise(i + 235) - 0.5) * 0.16,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
        for (let i = 0; i < 4; i++) {
          ctx.globalAlpha = 0.065;
          ctx.beginPath();
          ctx.ellipse(width / 2, height / 2, sphereRadius * (0.18 + jarvisNoise(i + 251) * 0.11), sphereRadius, (Math.PI / 4) * i + angle * 0.28 + (jarvisNoise(i + 267) - 0.5) * 0.42, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        links.forEach(([a, b]) => {
          const p1 = projected[a];
          const p2 = projected[b];
          const depth = Math.min(p1.depth, p2.depth);
          if (depth < 0.12) return;
          ctx.strokeStyle = `rgba(255,255,255,${0.018 + depth * 0.13})`;
          ctx.lineWidth = 0.7 + depth * 0.55;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        });

        signals.forEach(signal => {
          const link = signalLinks[signal.link];
          if (!link) return;
          const p1 = projected[link[0]];
          const p2 = projected[link[1]];
          const depth = Math.min(p1.depth, p2.depth);
          if (depth < 0.25) return;
          const t = prefersReduced ? signal.offset : (signal.offset + tick * signal.speed) % 1;
          const x = p1.x + (p2.x - p1.x) * t;
          const y = p1.y + (p2.y - p1.y) * t;
          const pulse = Math.sin(t * Math.PI);
          ctx.fillStyle = `rgba(255,255,255,${(0.2 + depth * 0.68) * pulse})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.5 + depth * 2.2, 0, Math.PI * 2);
          ctx.fill();
        });

        projected
          .map((point, i) => ({ ...point, i }))
          .sort((a, b) => a.depth - b.depth)
          .forEach(point => {
            ctx.fillStyle = `rgba(245,245,245,${point.alpha})`;
            ctx.shadowColor = `rgba(255,255,255,${0.05 + point.depth * 0.2})`;
            ctx.shadowBlur = 7 + point.depth * 12;
            ctx.beginPath();
            ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
            ctx.fill();
          });
        ctx.shadowBlur = 0;

        if (!prefersReduced) frame = requestAnimationFrame(drawGlobe);
      }

      frame = requestAnimationFrame(drawGlobe);
      return () => {
        stopped = true;
        if (frame) cancelAnimationFrame(frame);
      };
    }

    function paint() {
      stopJarvisGlobe?.();
      stopJarvisGlobe = null;
      const busy = !!state.jarvis.busy;
      const hasConversation = state.jarvis.messages.length > 1;
      host.innerHTML = `
        <div class="admin-jarvis-shell ${busy ? 'is-busy' : ''}">
          <div class="admin-jarvis-stage">
            <div class="admin-jarvis-neural" aria-hidden="true">
              <div class="admin-jarvis-neural-scene">
                <canvas class="admin-jarvis-globe" width="760" height="760"></canvas>
              </div>
            </div>
            <h2>${busy ? 'Let Jarvis cook...' : 'Jarvis V1.1'}</h2>
            <div class="admin-jarvis-messages ${hasConversation ? 'has-conversation' : ''}" id="jarvis-messages">
              ${state.jarvis.messages.map(m => `
                <div class="admin-jarvis-message ${m.role === 'user' ? 'user' : 'assistant'}">
                  <div class="admin-jarvis-role">${m.role === 'user' ? 'You' : 'Jarvis'}</div>
                  <div class="admin-jarvis-bubble">${escapeHtml(m.text)}</div>
                  ${renderAttachmentChips(m.attachments, false)}
                </div>`).join('')}
            </div>
          </div>
          <div class="admin-jarvis-dock">
            ${pendingCard()}
            <form class="admin-jarvis-compose" id="jarvis-form">
              <input type="file" id="jarvis-file-input" class="hidden" accept="image/*" multiple>
              ${renderAttachmentChips(state.jarvis.attachments, true)}
              <div class="admin-jarvis-composer-row">
                <button type="button" class="admin-jarvis-icon-btn" id="jarvis-add-file" title="Add images" aria-label="Add images">${ICON.plus}</button>
                <textarea id="jarvis-input" maxlength="3000" rows="1" placeholder="Let Jarvis cook..." ${busy ? 'disabled' : ''}></textarea>
                <button type="button" class="admin-jarvis-tools-btn" aria-label="Gemini tools"><span>${ICON.sparkle}</span><strong>G</strong></button>
                <button type="submit" class="admin-jarvis-send-btn" id="jarvis-send" aria-label="Send" ${busy ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m6 11 6-6 6 6"/></svg>
                </button>
              </div>
            </form>
          </div>
        </div>`;

      const messages = host.querySelector('#jarvis-messages');
      messages.scrollTop = messages.scrollHeight;
      host.querySelector('#jarvis-form').addEventListener('submit', onSubmit);
      host.querySelector('.admin-jarvis-tools-btn').addEventListener('click', () => host.querySelector('#jarvis-file-input').click());
      host.querySelector('#jarvis-add-file').addEventListener('click', () => host.querySelector('#jarvis-file-input').click());
      host.querySelector('#jarvis-file-input').addEventListener('change', onFilesSelected);
      stopJarvisGlobe = startJarvisGlobe(host.querySelector('.admin-jarvis-globe'));
      host.querySelectorAll('[data-remove-jarvis-attachment]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.jarvis.attachments.splice(Number(btn.dataset.removeJarvisAttachment), 1);
          paint();
        });
      });
      const input = host.querySelector('#jarvis-input');
      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          host.querySelector('#jarvis-form').requestSubmit();
        }
      });
      input?.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
      });
      host.querySelector('[data-jarvis-act="preview"]')?.addEventListener('click', openDraftPreview);
      host.querySelector('[data-jarvis-act="done"]')?.addEventListener('click', async () => {
        const btn = host.querySelector('[data-jarvis-act="done"]');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
          const json = await publishDraft('jarvis', { render: false });
          state.jarvis.pending = null;
          state.jarvis.messages.push({ role: 'assistant', text: json?.backup?.id ? `Published. Backup ${json.backup.id} was saved first.` : 'Published. A backup was saved first.' });
          renderSidebar();
          renderActiveTab();
        } catch (e) {
          state.jarvis.messages.push({ role: 'assistant', text: 'I could not publish it: ' + e.message });
          paint();
        }
      });
      host.querySelector('[data-jarvis-act="undo"]')?.addEventListener('click', () => {
        if (!state.jarvis.pending) return;
        state.draft = deepClone(state.jarvis.pending.beforeDraft);
        state.jarvis.pending = null;
        state.jarvis.messages.push({ role: 'assistant', text: 'Draft reverted. Nothing was published.' });
        markDirty();
        pushPreview();
        renderActiveTab();
      });
    }

    async function onFilesSelected(e) {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      const room = MAX_JARVIS_ATTACHMENTS - state.jarvis.attachments.length;
      if (room <= 0) {
        toast(`Jarvis can use up to ${MAX_JARVIS_ATTACHMENTS} images per request.`, 'error', 3500);
        return;
      }
      if (files.length > room) toast(`Only the first ${room} image${room === 1 ? '' : 's'} will be attached.`, 'error', 3500);
      try {
        const next = await Promise.all(files.slice(0, room).map(readJarvisAttachment));
        state.jarvis.attachments.push(...next);
        paint();
      } catch (err) {
        toast(err.message, 'error', 4500);
      }
    }

    async function onSubmit(e) {
      e.preventDefault();
      const input = host.querySelector('#jarvis-input');
      const message = input?.value.trim() || '';
      const attachments = state.jarvis.attachments.slice();
      if (state.jarvis.busy || (!message && !attachments.length)) return;
      const requestText = message || 'Use the attached image for the site update.';
      if (input) input.value = '';
      state.jarvis.attachments = [];
      state.jarvis.busy = true;
      state.jarvis.messages.push({
        role: 'user',
        text: requestText,
        attachments: attachmentDataForMessage(attachments)
      });
      state.jarvis.messages.push({ role: 'assistant', text: 'Let Jarvis cook...' });
      paint();

      const beforeDraft = deepClone(state.draft);
      try {
        const history = state.jarvis.messages
          .filter(m => !(m.role === 'assistant' && m.text === 'Let Jarvis cook...'))
          .slice(-12);
        const resp = await api('/admin/ai/jarvis', {
          method: 'POST',
          body: JSON.stringify({
            message: requestText,
            messages: history,
            draft: state.draft,
            attachments: attachments.map(a => ({
              name: a.name,
              mimeType: a.mimeType,
              size: a.size,
              data: a.data
            }))
          })
        });
        state.jarvis.messages.pop();
        const patch = resp.patch || {};
        const sections = resp.sections || Object.keys(patch);
        if (Object.keys(patch).length) {
          applySettingsPatch(state.draft, patch);
          state.jarvis.pending = {
            patch,
            sections,
            summary: resp.summary || 'Draft change ready',
            beforeDraft
          };
          markDirty();
          pushPreview();
        }
        state.jarvis.messages.push({ role: 'assistant', text: resp.reply || (sections.length ? 'Okay, I drafted that.' : 'I need more detail before changing anything.') });
      } catch (err) {
        state.jarvis.messages.pop();
        state.jarvis.attachments = attachments;
        state.jarvis.messages.push({ role: 'assistant', text: err.message });
      }
      state.jarvis.busy = false;
      paint();
    }

    paint();
    return host;
  }

  function renderBackupManager() {
    const host = document.createElement('div');
    host.innerHTML = '<div class="admin-field-help">Loading backups...</div>';
    api('/admin/backups?limit=50').then(j => {
      const storage = j.storage;
      const storageNote = storage ? `<div class="admin-privacy-note" style="margin-bottom:14px">Backup storage: ${escapeHtml(storage.type)}${storage.durable ? ` · ${escapeHtml(storage.repo || '')}/${escapeHtml(storage.path || '')}` : ' · local development only'}</div>` : '';
      if (!j.backups?.length) {
        host.innerHTML = storageNote + '<div class="admin-field-help">No backups yet. A backup is created automatically before each publish.</div>';
        return;
      }
      host.innerHTML = `
        ${storageNote}
        <table class="admin-audit-table">
          <thead><tr><th>When</th><th>Source</th><th>Actor</th><th>Changed</th><th></th></tr></thead>
          <tbody>
            ${j.backups.map(b => `
              <tr data-backup-id="${escapeHtml(b.id)}">
                <td class="muted">${new Date(b.ts).toLocaleString()}</td>
                <td class="action">${escapeHtml(b.source || b.action || 'manual')}</td>
                <td class="muted">${escapeHtml(b.actor?.email || b.actor?.name || '—')}</td>
                <td class="muted">${escapeHtml((b.sections || b.patchKeys || []).join(', ') || b.message || '—')}</td>
                <td><button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-act="restore">Restore</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      host.querySelectorAll('[data-act="restore"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('[data-backup-id]').dataset.backupId;
          if (!confirm('Restore this published backup? The current version will be backed up first.')) return;
          btn.disabled = true;
          btn.textContent = 'Restoring...';
          try {
            const json = await api('/admin/backups/' + encodeURIComponent(id) + '/restore', { method: 'POST' });
            state.settings = json.settings;
            state.draft = deepClone(json.settings);
            state.jarvis.pending = null;
            toast('Backup restored. Current version was backed up first.', 'success', 4500);
            renderActiveTab();
            if ($('#preview-host').classList.contains('open')) refreshPreview();
          } catch (e) {
            toast('Restore failed: ' + e.message, 'error', 6000);
            btn.disabled = false;
            btn.textContent = 'Restore';
          }
        });
      });
    }).catch(e => {
      host.innerHTML = `<div class="admin-field-help" style="color:var(--danger)">${escapeHtml(e.message)}</div>`;
    });
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
    $('#app-shell').classList.toggle('admin-shell--jarvis', tab.id === 'jarvis');
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
      if (group.custom === 'jarvisAssistant') card.classList.add('admin-card--jarvis');
      if (tab.id === 'appearance') card.classList.add(`admin-appearance-card-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      card.innerHTML = group.title ? `<h2>${escapeHtml(group.title)}</h2>` : '';

      if (group.custom === 'navEditor')                 { card.appendChild(renderNavEditor()); anyVisible = true; }
      else if (group.custom === 'jarvisAssistant')      { card.appendChild(renderJarvisAssistant()); anyVisible = true; }
      else if (group.custom === 'announcementsEditor')  { card.appendChild(renderAnnouncementsEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleOverrideEditor'){ card.appendChild(renderScheduleOverrideEditor()); anyVisible = true; }
      else if (group.custom === 'bellEditor')           { card.appendChild(renderBellEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleImageImport') { card.appendChild(renderScheduleImageImport()); anyVisible = true; }
      else if (group.custom === 'privacyParagraphsEditor'){ card.appendChild(renderPrivacyParagraphsEditor()); anyVisible = true; }
      else if (group.custom === 'analyticsDashboard')   { card.appendChild(renderAnalyticsDashboard()); anyVisible = true; }
      else if (group.custom === 'auditLog')             { card.appendChild(renderAuditLog()); anyVisible = true; }
      else if (group.custom === 'backupManager')        { card.appendChild(renderBackupManager()); anyVisible = true; }
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

  async function publishDraft(source = 'manual', opts = {}) {
    const btn = $('#publish-btn');
    const originalText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Publishing...';
    try {
      const patch = {};
      const keys = new Set([...Object.keys(state.settings), ...Object.keys(state.draft)]);
      for (const k of keys) {
        if (k === 'updatedAt') continue;
        if (!eq(state.settings[k], state.draft[k])) patch[k] = state.draft[k];
      }
      if (!Object.keys(patch).length) { toast('Nothing to publish'); return; }
      const json = await api('/site-settings', { method: 'PUT', body: JSON.stringify({ patch, source }) });
      state.settings = json.settings;
      state.draft = deepClone(json.settings);
      if (json.publicFrontend?.error) {
        toast('Backend saved, but GitHub frontend sync failed: ' + json.publicFrontend.error, 'error', 7000);
      } else if (json.publicFrontend?.enabled === false) {
        toast('Backend saved. GitHub frontend sync is not configured.', 'error', 7000);
      } else {
        toast(json.backup?.id ? 'Changes published. Backup saved first.' : 'Changes published — public site will update within 30 s.', 'success', 4000);
      }
      if (opts.render !== false) renderActiveTab();
      // If the preview is open in DRAFT mode, switch to LIVE-from-server-fresh
      if ($('#preview-host').classList.contains('open')) refreshPreview();
      return json;
    } catch (e) {
      toast('Publish failed: ' + e.message, 'error', 6000);
      throw e;
    } finally {
      btn.disabled = false; btn.textContent = originalText || 'Publish';
    }
  }

  $('#publish-btn').addEventListener('click', () => {
    publishDraft('manual').catch(() => {});
  });

  $('#sidebar-collapse-btn')?.addEventListener('click', toggleDesktopSidebar);
  $('#mobile-sidebar-toggle')?.addEventListener('click', toggleMobileSidebar);
  $('#sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);
  window.addEventListener('resize', () => {
    if (!isMobileSidebarMode()) closeMobileSidebar();
    syncSidebarState();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMobileSidebar();
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
  let _previewReady = false;
  function publicPreviewBase() {
    const configured = state.authConfig?.publicSiteUrl || 'https://poolesville.web.app';
    try {
      const url = new URL(configured);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
      url.pathname = url.pathname.replace(/\/?$/, '/');
      url.search = '';
      url.hash = '';
      return url;
    } catch {
      return new URL('https://poolesville.web.app/');
    }
  }
  function previewPagePath() {
    return 'index.html';
  }
  function buildPreviewUrl() {
    const ts = Date.now();
    const url = new URL(previewPagePath(), publicPreviewBase());
    if (state.previewMode === 'draft') url.searchParams.set('_preview', '1');
    url.searchParams.set('_ts', String(ts));
    return url.href;
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
      $('#preview-frame').contentWindow.postMessage({ type: 'phs:preview-settings', settings: state.draft }, previewOrigin());
    } catch {}
  }
  function previewOrigin() {
    try { return new URL($('#preview-frame').src, location.href).origin; }
    catch { return location.origin; }
  }
  function paintPreviewBar() {
    $('#preview-mode-pill').className = 'mode-pill' + (state.previewMode === 'draft' ? ' draft' : '');
    $('#preview-mode-pill').textContent = state.previewMode === 'draft' ? 'Showing draft (un-published)' : 'Showing published version';
    $$('#preview-mode-seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.previewMode));
  }
  function openDraftPreview() {
    $('#preview-host').classList.add('open');
    state.previewMode = 'draft';
    refreshPreview();
  }
  $('#open-preview-btn').addEventListener('click', openDraftPreview);
  $('#preview-close-btn').addEventListener('click', () => { $('#preview-host').classList.remove('open'); });
  $('#preview-refresh-btn').addEventListener('click', refreshPreview);
  $$('#preview-mode-seg button').forEach(b => b.addEventListener('click', () => { state.previewMode = b.dataset.mode; refreshPreview(); }));

  // Iframe signals readiness; we then immediately push the draft.
  window.addEventListener('message', (e) => {
    if (e.source !== $('#preview-frame')?.contentWindow) return;
    if (e.origin !== previewOrigin()) return;
    if (e.data?.type === 'phs:preview-ready') {
      _previewReady = true;
      pushPreview();
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  if (isLocal || isBackendHostedAdmin) bootApp(); else showLogin();
  if (!isLocal) loadAuthConfig();
})();
