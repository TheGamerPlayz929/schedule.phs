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
  const LOCAL_BACKEND = location.protocol === 'file:' ? 'http://localhost:3000' : `http://${location.hostname}:3000`;
  const BACKEND = isBackendHostedAdmin ? location.origin : (isLocal ? (location.port === '3000' ? location.origin : LOCAL_BACKEND) : `https://${BACKEND_HOST}`);
  const TOKEN_KEY = 'phs:admin-token:v1';
  const IMPORT_STATE_KEY = 'phs:admin-import-assistant:v1';
  const SIDEBAR_COLLAPSED_KEY = 'phs:admin-sidebar-collapsed:v1';
  const ACTIVE_TAB_KEY = 'phs:admin-active-tab:v2';
  const THEME_KEY = 'phs:admin-theme:v1';
  const PREVIEW_PAGE_KEY = 'phs:admin-preview-page:v2';
  const PREVIEW_SIZE_KEY = 'phs:admin-preview-size:v2';
  const SECURITY_TEMPLATES = [
    {
      id: 'security-review',
      label: 'Security review',
      title: 'Site paused for security review',
      message: 'Poolesville Schedule is temporarily unavailable while we verify site integrity. Please check back soon.'
    },
    {
      id: 'sync-repair',
      label: 'Sync repair',
      title: 'Site paused while updates sync',
      message: 'Poolesville Schedule is temporarily unavailable while we repair the public update path. Please check back soon.'
    },
    {
      id: 'content-freeze',
      label: 'Content freeze',
      title: 'Site paused for content review',
      message: 'Poolesville Schedule is temporarily unavailable while we review posted content. Please check back soon.'
    }
  ];
  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    token: null,
    authConfig: null,
    settings: null,    // current saved settings (server)
    defaults: null,
    draft: null,       // working copy with unsaved edits
    identity: null,
    adminHealth: null,
    opsSummary: null,
    opsSummaryLoading: null,
    devControlsEnabled: false,
    lastPublishResult: null,
    lastPublishAt: null,
    securitySnapshot: null,
    securitySnapshotLoading: null,
    securityComposerOpen: false,
    theme: loadThemePreference(),
    activeTab: 'overview',
    search: '',
    previewMode: 'draft', // 'draft' | 'live'
    previewPage: loadPreviewPagePreference(),
    previewSize: loadPreviewSizePreference(),
    importAssistant: null,
    jarvis: {
      messages: [
        { role: 'assistant', text: 'Tell me the admin change. I will draft it as a preview first; nothing publishes until you approve it.' }
      ],
      pending: null,
      attachments: [],
      busy: false
    }
  };
  let securityAutoRefreshTimer = null;
  let workspaceMasonryFrame = 0;

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
    sun:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
    moon:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 019.5 3.5a8.5 8.5 0 1011 11z"/></svg>`,
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
    { id: 'overview', label: 'Overview', title: 'Control room', icon: 'analytics', section: 'Control',
      sub: 'Draft state, public status, sync health, rollback proof, and preview in one place.',
      groups: [{ title: '', custom: 'overviewDashboard' }]
    },
    { id: 'jarvis', label: 'Jarvis', title: 'Jarvis', icon: 'jarvis', section: 'Control',
      sub: 'AI drafting for safe admin changes. Review the draft before anything publishes.',
      groups: [{ title: '', custom: 'jarvisAssistant' }]
    },
    { id: 'security', label: 'Security', title: 'Security', icon: 'privacy', section: 'Control',
      sub: 'Public site mode, private admin data, rollback points, and publish risk.',
      groups: [{ title: '', custom: 'siteSecurityCenter' }]
    },
    { id: 'bellSchedules',label: 'Schedule', title: 'Schedule', icon: 'bell', section: 'Workflows',
      sub: 'Use a custom schedule for today, choose the active schedule, and edit reusable schedule types.',
      groups: [
        { title: '', custom: 'scheduleQualityPanel' },
        { title: 'Active override', custom: 'scheduleOverrideEditor' },
        { title: 'Reusable schedules', custom: 'bellEditor' },
        { title: 'Custom schedule from image', custom: 'scheduleImageImport' }
      ]
    },
    { id: 'announcements',label: 'Announcements', icon: 'announce', section: 'Workflows',
      sub: 'Cards shown on the announcements page.',
      groups: [
        { title: '', custom: 'announcementsQualityPanel' },
        { title: 'Cards', custom: 'announcementsEditor' }
      ]
    },
    { id: 'appearance', label: 'Site', title: 'Site controls', icon: 'theme', section: 'Workflows',
      sub: 'Branding, navigation, page copy, public identity, and footer content.',
      groups: [{
        title: '', custom: 'siteLaunchPanel'
      },{
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
        ]},{
        title: 'Navigation', custom: 'navEditor'
      },{
        title: 'Schedule page', fields: [
          { path: 'hero.schedulePageEyebrow',        label: 'Eyebrow above period name', kind: 'text', max: 80 },
          { path: 'hero.schedulePageStatusFallback', label: 'Status pill loading text', kind: 'text', max: 60 },
        ]},{
        title: 'Other pages', fields: [
          { path: 'hero.announcementsPageTitle', label: 'Announcements title', kind: 'text', max: 80 },
          { path: 'hero.gradesPageTitle',        label: 'Grades title',        kind: 'text', max: 80 },
        ]}]
    },
    { id: 'safety', label: 'Privacy', title: 'Privacy and analytics', icon: 'privacy', section: 'Workflows',
      sub: 'Privacy text, GradeViewer copy, analytics visibility, and policy-sensitive settings.',
      groups: [{
        title: '', custom: 'privacyRiskPanel'
      },{
        title: 'Privacy / Safety FAQ', fields: [
          { path: 'gradeMelon.privacyButtonLabel', label: 'Link button label', kind: 'text' },
          { path: 'gradeMelon.privacyTitle',       label: 'Modal title',       kind: 'text' },
          { path: 'gradeMelon.privacyDoneLabel',   label: 'Close-button label',kind: 'text' },
        ]},{
        title: 'Modal paragraphs', custom: 'privacyParagraphsEditor'
      },{
        title: 'Usage overview', custom: 'analyticsDashboard'
      }]
    },
    { id: 'history', label: 'History', title: 'History and rollback', icon: 'backup', section: 'System',
      sub: 'Recent admin actions and published backups.',
      groups: [{
        title: '', custom: 'historyEvidencePanel'
      },{
        title: 'Recent events', custom: 'auditLog'
      },{
        title: 'Published versions', custom: 'backupManager'
      }]
    },
    { id: 'advanced', label: 'Advanced', title: 'Advanced settings', icon: 'grades', section: 'System',
      sub: 'Low-frequency controls. Change these only when the public app contract changes.',
      groups: [{
        title: '', custom: 'advancedIntegrityPanel'
      },{
        title: 'GradeViewer iframe', fields: [
          { path: 'grades.iframeUrlLocal', label: 'Local-development URL', kind: 'url', help: 'Used when site runs on localhost.' },
          { path: 'grades.iframeUrlProd',  label: 'Production URL',         kind: 'url' },
          { path: 'grades.pageTitle',      label: 'Browser-tab title',      kind: 'text' },
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
        ]},{
        title: 'Footer', fields: [
          { path: 'footer.copyright',     label: 'Copyright line',  kind: 'text' },
          { path: 'footer.feedbackUrl',   label: 'Feedback URL',    kind: 'url' },
          { path: 'footer.feedbackLabel', label: 'Feedback label',  kind: 'text' },
          { path: 'footer.supportEmail',  label: 'Support contact (any text or email)', kind: 'text', help: 'Email addresses become a clickable mailto: link automatically. Any other text is rendered as plain text.' },
        ]}]
    }
  ];

  const VALID_TAB_IDS = new Set(SCHEMA.map(tab => tab.id));
  state.activeTab = loadActiveTabPreference();

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
  function loadThemePreference() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    try {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function syncThemePreference() {
    const dark = state.theme === 'dark';
    document.body?.classList.toggle('admin-theme-dark', dark);
    document.documentElement?.style.setProperty('color-scheme', dark ? 'dark' : 'light');
    const btn = $('#theme-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.innerHTML = `${dark ? ICON.sun : ICON.moon}<span>${dark ? 'Light' : 'Dark'}</span>`;
    }
  }

  function toggleThemePreference() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, state.theme); } catch {}
    syncThemePreference();
  }

  function loadActiveTabPreference() {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_KEY);
      return VALID_TAB_IDS.has(saved) ? saved : 'overview';
    } catch {
      return 'overview';
    }
  }

  function saveActiveTabPreference(tabId) {
    if (!VALID_TAB_IDS.has(tabId)) return;
    try { localStorage.setItem(ACTIVE_TAB_KEY, tabId); } catch {}
  }

  function loadPreviewPagePreference() {
    try {
      const saved = localStorage.getItem(PREVIEW_PAGE_KEY);
      return ['schedule', 'announcements', 'grades', 'privacy'].includes(saved) ? saved : 'schedule';
    } catch {
      return 'schedule';
    }
  }

  function loadPreviewSizePreference() {
    try {
      return localStorage.getItem(PREVIEW_SIZE_KEY) === 'mobile' ? 'mobile' : 'desktop';
    } catch {
      return 'desktop';
    }
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
    if (kind === 'error') el.setAttribute('role', 'alert');
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

  function restoreBearerSession() {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) state.token = token;
    } catch {}
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
      state.devControlsEnabled = Boolean(who.devControlsEnabled);
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
      syncSecurityAutoRefresh();
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
    loadOpsSummary(true)
      .then(j => {
        const el = $('#conn-status');
        el.classList.remove('offline');
        el.textContent = 'Ops online · ' + (j?.storage?.settings?.type || 'settings ready');
        if (['overview', 'security', 'history', 'safety'].includes(state.activeTab)) renderActiveTab();
      })
      .catch(() => {
        state.adminHealth = null;
        state.opsSummary = null;
        const el = $('#conn-status');
        el.classList.add('offline');
        el.textContent = 'Admin health offline';
        if (['overview', 'security'].includes(state.activeTab)) renderActiveTab();
      });
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

  function sectionLabelForKey(key) {
    return ({
      branding: 'Site',
      nav: 'Site',
      hero: 'Site',
      theme: 'Site',
      appearance: 'Site',
      footer: 'Site',
      countdown: 'Advanced',
      announcements: 'Announcements',
      bellSchedules: 'Schedule',
      scheduleOverride: 'Schedule',
      privacy: 'Privacy',
      gradeMelon: 'Privacy',
      siteStatus: 'Security',
      grades: 'Advanced'
    })[key] || key;
  }

  function changedSections() {
    if (!state.settings || !state.draft) return [];
    const keys = new Set([...Object.keys(state.settings), ...Object.keys(state.draft)]);
    return [...keys]
      .filter(k => k !== 'updatedAt' && !eq(state.settings[k], state.draft[k]))
      .map(sectionLabelForKey)
      .filter((label, idx, arr) => arr.indexOf(label) === idx);
  }

  function buildSettingsPatch(allowedKeys = null) {
    const patch = {};
    const allow = allowedKeys ? new Set(allowedKeys) : null;
    const keys = new Set([...Object.keys(state.settings || {}), ...Object.keys(state.draft || {})]);
    for (const k of keys) {
      if (k === 'updatedAt') continue;
      if (allow && !allow.has(k)) continue;
      if (!eq(state.settings?.[k], state.draft?.[k])) patch[k] = state.draft[k];
    }
    return patch;
  }

  function fieldElementId(path) {
    return fieldId(path);
  }

  function backupTimestamp(backup) {
    return backup?.ts || backup?.createdAt || backup?.timestamp || backup?.time || null;
  }

  function goTab(tabId) {
    state.activeTab = tabId;
    saveActiveTabPreference(tabId);
    closeMobileSidebar();
    renderSidebar();
    renderActiveTab();
    resetMainScroll();
    syncSecurityAutoRefresh();
    if (tabId === 'security') loadSecuritySnapshot(true).catch(e => toast(e.message, 'error', 5000));
  }

  function resetMainScroll() {
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  function scheduleWorkspaceMasonry(container = document.querySelector('.admin-workspace-main')) {
    if (!container || !container.classList.contains('admin-workspace-main')) return;
    cancelAnimationFrame(workspaceMasonryFrame);
    workspaceMasonryFrame = requestAnimationFrame(() => {
      const cards = [...container.children].filter(el => el.classList.contains('admin-card') || el.classList.contains('admin-workspace-banner'));
      if (!cards.length) return;
      cards.forEach(card => { card.style.gridRowEnd = 'auto'; });
      const styles = getComputedStyle(container);
      const rowHeight = Number.parseFloat(styles.gridAutoRows) || 8;
      const rowGap = Number.parseFloat(styles.rowGap) || 12;
      const spans = cards.map(card => {
        const height = card.getBoundingClientRect().height;
        return Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)));
      });
      cards.forEach((card, index) => {
        card.style.gridRowEnd = `span ${spans[index]}`;
      });
    });
  }

  function refreshWorkspaceLayoutSoon() {
    scheduleWorkspaceMasonry();
    requestAnimationFrame(() => scheduleWorkspaceMasonry());
    setTimeout(() => scheduleWorkspaceMasonry(), 160);
  }

  function syncSecurityAutoRefresh() {
    if (state.activeTab !== 'security') {
      if (securityAutoRefreshTimer) {
        clearInterval(securityAutoRefreshTimer);
        securityAutoRefreshTimer = null;
      }
      return;
    }
    if (securityAutoRefreshTimer) return;
    securityAutoRefreshTimer = setInterval(() => {
      if (state.activeTab !== 'security') {
        syncSecurityAutoRefresh();
        return;
      }
      if (!state.securitySnapshotLoading) {
        loadSecuritySnapshot(true).catch(e => toast(e.message, 'error', 5000));
      }
    }, 45_000);
  }

  function storageCopy(storage) {
    if (!storage) return 'Unknown';
    const type = storage.type || 'unknown';
    return storage.durable ? `${type} durable` : `${type} only`;
  }

  function securityStatusClass(status) {
    return ['ok', 'attention', 'danger', 'muted'].includes(status) ? status : 'muted';
  }

  function formatPxValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}px` : '?';
  }

  function classSlug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  }

  const CUSTOM_SEARCH_TERMS = {
    overviewDashboard: 'overview control room status publish preview backend sync rollback evidence readiness v2 command center',
    siteSecurityCenter: 'security maintenance shutdown pause live restore publish sync privacy audit rollback backup checklist evidence storage authentication',
    scheduleQualityPanel: 'schedule quality coverage override bell warning diagnostics today no school advisory early release',
    announcementsQualityPanel: 'announcements cards bullets links quality diagnostics content',
    siteLaunchPanel: 'site launch branding nav logo favicon footer links gradeviewer',
    privacyRiskPanel: 'privacy analytics telemetry gradeviewer support policy faq',
    historyEvidencePanel: 'history audit rollback backup evidence accountability csv',
    advancedIntegrityPanel: 'advanced gradeviewer iframe hero countdown footer period size display integration',
    navEditor: 'navigation nav links menu',
    announcementsEditor: 'announcement cards bullets',
    scheduleOverrideEditor: 'active override schedule type today no school advisory early release',
    bellEditor: 'bell schedule periods times reusable',
    scheduleImageImport: 'image import extract schedule photo ocr',
    privacyParagraphsEditor: 'privacy modal paragraphs faq copy',
    analyticsDashboard: 'analytics visits pages usage traffic',
    auditLog: 'audit log history events filter csv',
    backupManager: 'backups rollback restore versions',
    jarvisAssistant: 'jarvis assistant ai draft preview'
  };

  function groupSearchText(tab, group) {
    const fieldText = (group.fields || [])
      .flatMap(f => [f.label, f.path, f.help, f.kind])
      .filter(Boolean)
      .join(' ');
    return [
      tab.label,
      tab.title,
      tab.sub,
      group.title,
      group.custom,
      CUSTOM_SEARCH_TERMS[group.custom],
      fieldText
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function groupMatchesSearch(tab, group, query) {
    const q = String(query || '').trim().toLowerCase();
    return !q || groupSearchText(tab, group).includes(q);
  }

  function tabDirtyCount(tab) {
    const changed = changedSections();
    if (!changed.length || tab.readOnly) return 0;
    const byTab = {
      overview: changed,
      security: ['Security'],
      bellSchedules: ['Schedule'],
      announcements: ['Announcements'],
      appearance: ['Site'],
      safety: ['Privacy'],
      advanced: ['Advanced']
    };
    const labels = byTab[tab.id] || [];
    return changed.filter(label => labels.includes(label)).length;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function countWords(value) {
    const matches = String(value || '').trim().match(/\S+/g);
    return matches ? matches.length : 0;
  }

  function hostFromUrl(value) {
    try {
      const url = new URL(String(value || ''), location.origin);
      return url.host || 'Relative URL';
    } catch {
      return 'Invalid URL';
    }
  }

  function isHttpsUrl(value) {
    try {
      return new URL(String(value || ''), location.origin).protocol === 'https:';
    } catch {
      return false;
    }
  }

  function statusPill(status) {
    const normalized = securityStatusClass(status);
    return normalized === 'ok' ? 'Pass' : normalized === 'danger' ? 'Block' : normalized === 'attention' ? 'Watch' : 'Check';
  }

  function insightCard(status, label, value, detail) {
    return `
      <section class="admin-insight-card ${securityStatusClass(status)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(detail)}</small>
      </section>`;
  }

  function insightRow(status, label, detail) {
    return `
      <div class="admin-insight-row ${securityStatusClass(status)}">
        <span>${escapeHtml(statusPill(status))}</span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>`;
  }

  function settingsPathStatus(path, label) {
    const value = get(state.draft || {}, path);
    const ok = String(value || '').trim().length > 0;
    return insightRow(ok ? 'ok' : 'attention', label, ok ? String(value).slice(0, 120) : 'Missing or empty.');
  }

  function renderInsightPanel({ kicker, title, detail, cards = [], rows = [], actions = '' }) {
    const host = document.createElement('div');
    host.className = 'admin-insight-panel';
    host.innerHTML = `
      <div class="admin-panel-heading admin-insight-heading">
        <div>
          ${kicker ? `<span class="admin-insight-kicker">${escapeHtml(kicker)}</span>` : ''}
          <h2>${escapeHtml(title)}</h2>
          ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
        </div>
        ${actions ? `<div class="admin-insight-actions">${actions}</div>` : ''}
      </div>
      ${cards.length ? `<div class="admin-insight-grid">${cards.join('')}</div>` : ''}
      ${rows.length ? `<div class="admin-insight-list">${rows.join('')}</div>` : ''}
    `;
    return host;
  }

  function formatSecurityDate(value) {
    if (!value) return 'No timestamp';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function securityProtectionModel(input) {
    const checks = [];
    const add = (status, label, detail) => checks.push({ status: securityStatusClass(status), label, detail });
    const rateLimitControls = asArray(input.rateLimits?.controls);
    const trafficDetail = input.rateLimits?.active
      ? `${rateLimitControls.length || 5} app flood limits are live. Edge DDoS/WAF status is outside this backend.`
      : 'Traffic flood limits were not returned by the backend.';

    add(input.rateLimits?.active ? 'ok' : 'attention', 'Traffic shield', trafficDetail);
    add(input.authOk ? 'ok' : 'attention', 'Admin access', input.authDetail || 'Admin session is being checked.');
    add(
      input.syncError ? 'danger' : input.syncDisabled ? 'attention' : 'ok',
      'Public sync',
      input.syncError || (input.syncDisabled ? 'Public GitHub sync needs setup before external visitors see published settings.' : 'Public-safe settings can publish.')
    );
    add(
      input.maintenance ? 'attention' : 'ok',
      'Availability',
      input.maintenance ? 'Visitors will see the maintenance page after publish.' : 'Public site is staged for normal visitor mode.'
    );
    add(
      input.settingsStorage && input.auditStorage
        ? (input.settingsStorage.durable && input.auditStorage.durable ? 'ok' : 'attention')
        : 'muted',
      'Admin data',
      input.settingsStorage ? `Settings ${storageCopy(input.settingsStorage)}; audit ${storageCopy(input.auditStorage)}.` : 'Storage status is loading.'
    );
    add(
      input.backupCount === null ? 'muted' : input.backupCount > 0 ? 'ok' : 'attention',
      'Rollback',
      input.backupCount === null ? 'Backup history is loading.' : input.backupCount > 0 ? `${input.backupCount} rollback point${input.backupCount === 1 ? '' : 's'} available.` : 'No recent rollback backup was returned.'
    );
    add(
      input.privacyOk === true ? 'ok' : input.privacyOk === false ? 'danger' : 'muted',
      'Privacy',
      input.privacyDetail || (input.privacyOk === true ? 'Aggregate analytics only.' : input.privacyOk === false ? 'Analytics privacy needs review.' : 'Privacy summary is loading.')
    );
    add(
      input.uploadOk ? 'ok' : 'muted',
      'Upload filter',
      input.uploadOk ? 'Uploads are restricted to verified image files.' : 'Upload policy is loading.'
    );
    if (input.checking) add('muted', 'Auto check', 'Live status is refreshing now.');
    if (input.errorText) add('danger', 'Backend check', input.errorText);
    const known = checks.filter(check => check.status !== 'muted');
    const open = checks.filter(check => check.status === 'danger' || check.status === 'attention');
    const ready = known.filter(check => check.status === 'ok').length;
    const status = checks.some(check => check.status === 'danger') ? 'danger' : open.length ? 'attention' : 'ok';
    return {
      status,
      label: status === 'ok' ? 'Protected' : status === 'attention' ? 'Needs review' : 'Action needed',
      ready,
      known: known.length,
      checks,
      findings: open.length ? open.map(check => `${check.label}: ${check.detail}`) : ['Automatic live checks are stable.']
    };
  }

  function securityTimelineItem(item, fallback) {
    if (!item) {
      return `<div class="admin-security-timeline-empty">${escapeHtml(fallback)}</div>`;
    }
    const actor = item.actor?.email || item.actor?.name || item.email || 'admin';
    const detail = [item.sections?.join(', '), item.patchKeys?.join(', '), item.section, item.file, item.type, item.message]
      .filter(Boolean)
      .join(' · ');
    return `
      <div class="admin-security-timeline-item">
        <time>${escapeHtml(formatSecurityDate(item.timestamp || item.createdAt || item.time))}</time>
        <strong>${escapeHtml(item.action || item.source || 'admin_event')}</strong>
        <span>${escapeHtml(actor)}</span>
        <small>${escapeHtml(detail || 'No extra detail recorded.')}</small>
      </div>`;
  }

  function securitySummaryText(model, data) {
    const notes = String(data.notes || '').trim();
    return [
      `PHS admin security summary (${new Date().toLocaleString()})`,
      `Protection: ${model.ready}/${model.known || 1} automatic checks passing (${model.label})`,
      `Public mode: ${data.mode}`,
      `Public sync: ${data.syncText}`,
      `Admin: ${data.authText} (${data.sessionDetail})`,
      `Storage: ${data.storageDetail}`,
      `Latest audit: ${data.latestAudit || 'No recent audit event returned.'}`,
      notes ? `Notes: ${notes}` : null
    ].filter(Boolean).join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      return Promise.resolve();
    } finally {
      area.remove();
    }
  }

  function formatSecurityCheckedAt() {
    const ts = state.securitySnapshot?.checkedAt;
    if (!ts) return 'Not checked yet';
    const time = new Date(ts);
    if (Number.isNaN(time.getTime())) return 'Check time unavailable';
    return `Checked ${time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  function securitySnapshotFromOps(summary) {
    if (!summary) return null;
    return {
      checkedAt: summary.checkedAt || new Date().toISOString(),
      storage: {
        settings: summary.storage?.settings || null,
        audit: summary.storage?.audit || null
      },
      analytics: summary.analytics || null,
      backups: {
        backups: asArray(summary.backups?.entries),
        storage: summary.storage?.backups || null
      },
      auditLog: {
        entries: asArray(summary.audit?.entries),
        storage: summary.storage?.audit || null
      },
      whoami: {
        method: summary.security?.adminAuth || 'admin',
        identity: summary.actor || state.identity || null
      },
      security: summary.security || null,
      publicSync: summary.publicSync || null,
      environment: summary.environment || null,
      errors: asArray(summary.failures)
    };
  }

  function loadOpsSummary(force = false) {
    if (state.opsSummaryLoading) return state.opsSummaryLoading;
    const checkedAtMs = state.opsSummary?.checkedAt ? new Date(state.opsSummary.checkedAt).getTime() : 0;
    const recent = checkedAtMs && Date.now() - checkedAtMs < 45_000;
    if (!force && recent) return Promise.resolve(state.opsSummary);

    state.opsSummaryLoading = api('/admin/ops-summary', { silentAuth: true })
      .then(summary => {
        state.opsSummary = summary;
        state.adminHealth = {
          settings: summary.storage?.settings || null,
          audit: summary.storage?.audit || null,
          backups: summary.storage?.backups || null,
          publicSync: summary.publicSync || null
        };
        const snapshot = securitySnapshotFromOps(summary);
        if (snapshot) state.securitySnapshot = snapshot;
        return summary;
      })
      .finally(() => {
        state.opsSummaryLoading = null;
      });
    return state.opsSummaryLoading;
  }

  function loadSecuritySnapshot(force = false) {
    if (state.securitySnapshotLoading) return state.securitySnapshotLoading;
    const checkedAtMs = state.securitySnapshot?.checkedAt ? new Date(state.securitySnapshot.checkedAt).getTime() : 0;
    const recent = checkedAtMs && Date.now() - checkedAtMs < 45_000;
    if (!force && recent) return Promise.resolve(state.securitySnapshot);

    state.securitySnapshotLoading = loadOpsSummary(force).then(summary => {
      state.securitySnapshot = securitySnapshotFromOps(summary) || {
        checkedAt: new Date().toISOString(),
        errors: ['Ops summary did not return a security snapshot.']
      };
      return state.securitySnapshot;
    }).finally(() => {
      state.securitySnapshotLoading = null;
      if (['security', 'overview', 'safety', 'history'].includes(state.activeTab)) renderActiveTab();
    });
    return state.securitySnapshotLoading;
  }

  function renderOverviewDashboard() {
    const host = document.createElement('div');
    host.className = 'admin-ops-v3';
    const changed = changedSections();
    const dirty = changed.length > 0;
    const summary = state.opsSummary || {};
    if (!summary.checkedAt && !state.opsSummaryLoading) {
      loadOpsSummary().then(() => {
        if (state.activeTab === 'overview') renderActiveTab();
      }).catch(() => {});
    }
    const override = state.draft?.scheduleOverride?.type || 'Auto / data.json';
    const announcementCount = state.draft?.announcements?.items?.length || 0;
    const health = state.adminHealth || {};
    const settingsStorage = summary.storage?.settings || health.settings;
    const auditStorage = summary.storage?.audit || health.audit;
    const backupStorage = summary.storage?.backups || health.backups;
    const publish = state.lastPublishResult;
    const syncError = publish?.publicFrontend?.error;
    const syncConfigured = summary.publicSync?.configured === true;
    const syncDisabled = publish?.publicFrontend?.enabled === false || !syncConfigured;
    const syncState = syncError
        ? 'GitHub sync failed'
        : syncDisabled
          ? 'Needs setup'
          : publish
            ? 'Synced'
            : 'Ready';
    const siteStatus = normalizedSiteStatus();
    const maintenance = siteStatus.mode === 'maintenance';
    const snapshot = state.securitySnapshot || {};
    const backupCount = Number.isFinite(summary.backups?.count) ? summary.backups.count : (Array.isArray(snapshot.backups?.backups) ? snapshot.backups.backups.length : null);
    const latestAudit = summary.audit?.latest || snapshot.auditLog?.entries?.[0] || null;
    const latestBackup = summary.backups?.latest || snapshot.backups?.backups?.[0] || null;
    const privacy = summary.analytics?.privacy || snapshot.analytics?.privacy;
    const privacyOk = privacy
      ? !privacy.storesPersonalData && !privacy.storesIpAddresses && !privacy.storesUserAgents && !privacy.usesCookies
      : null;
    const overviewProtection = securityProtectionModel({
      checking: Boolean(state.securitySnapshotLoading),
      maintenance,
      syncError,
      syncDisabled,
      rateLimits: snapshot.security?.rateLimits || summary.security?.rateLimits,
      authOk: Boolean(state.identity || isLocal),
      authDetail: state.identity?.email || state.identity?.name || (isLocal ? 'Local development admin session.' : 'Admin session active.'),
      settingsStorage,
      auditStorage,
      backupStorage: snapshot.backups?.storage,
      backupCount,
      privacyOk,
      privacyDetail: privacy?.note || '',
      uploadOk: Boolean(snapshot.security?.upload || summary.security?.upload),
      errorText: snapshot.errors?.join(' | ') || summary.failures?.join(' | ') || ''
    });
    const commandSummary = dirty
      ? `${changed.length} unpublished ${changed.length === 1 ? 'section' : 'sections'}`
      : maintenance
        ? 'Maintenance mode is staged'
        : syncError
          ? 'Public sync needs attention'
          : 'Ready to operate';
    const publishIssues = collectPublishIssues();
    const gateValues = [
      publishIssues.blocking.length === 0,
      !maintenance,
      !syncError && !syncDisabled,
      settingsStorage ? Boolean(settingsStorage.durable) : null,
      auditStorage ? Boolean(auditStorage.durable) : null,
      backupCount === null ? null : backupCount > 0,
      privacyOk
    ];
    const knownGates = gateValues.filter(value => value !== null);
    const passedGates = knownGates.filter(Boolean).length;
    const readinessPercent = knownGates.length ? Math.round((passedGates / knownGates.length) * 100) : 0;
    const readinessStatus = readinessPercent >= 86 ? 'ok' : readinessPercent >= 66 ? 'attention' : 'danger';
    const attentionItems = [
      dirty ? `${changed.join(', ')} waiting to publish.` : '',
      maintenance ? 'Visitors will see the maintenance page after publish.' : '',
      syncError ? `Public sync failed: ${syncError}` : '',
      syncDisabled ? 'Public sync is not configured for this environment.' : '',
      backupCount === 0 ? 'No rollback backup was returned by the latest check.' : '',
      privacyOk === false ? 'Analytics privacy report needs review.' : ''
    ].filter(Boolean);
    const validationState = publishIssues.blocking.length ? 'danger' : publishIssues.warnings.length ? 'attention' : 'ok';
    const validationItems = [
      ...publishIssues.blocking.map(issue => `Block: ${issue}`),
      ...publishIssues.warnings.map(issue => `Watch: ${issue}`)
    ].slice(0, 5);
    const lanes = [
      {
        status: dirty ? 'attention' : 'ok',
        label: 'Draft',
        value: dirty ? `${changed.length} staged` : 'Clean',
        detail: dirty ? changed.join(', ') : 'No unpublished edits.'
      },
      {
        status: maintenance ? 'attention' : 'ok',
        label: 'Availability',
        value: maintenance ? 'Maintenance' : 'Live',
        detail: maintenance ? siteStatus.title : 'Normal public site mode.'
      },
      {
        status: syncError ? 'danger' : syncDisabled ? 'attention' : 'ok',
        label: 'Public sync',
        value: syncState,
        detail: syncError || (syncDisabled ? summary.publicSync?.reason || 'Sync credentials are missing.' : `${summary.publicSync?.paths?.length || 2} public file targets.`)
      },
      {
        status: backupCount === null ? 'muted' : backupCount > 0 ? 'ok' : 'attention',
        label: 'Rollback',
        value: backupCount === null ? 'Checking' : backupCount > 0 ? `${backupCount} points` : 'None',
        detail: latestBackup ? `Latest ${formatSecurityDate(backupTimestamp(latestBackup))}` : 'Publish creates the next restore point.'
      },
      {
        status: privacyOk === true ? 'ok' : privacyOk === false ? 'danger' : 'muted',
        label: 'Privacy',
        value: privacyOk === true ? 'Aggregate' : privacyOk === false ? 'Review' : 'Checking',
        detail: privacy?.note || 'First-party privacy summary loads from backend.'
      },
      {
        status: settingsStorage?.durable && auditStorage?.durable && (backupStorage?.durable || backupCount === null) ? 'ok' : 'attention',
        label: 'Admin data',
        value: settingsStorage?.durable ? 'Durable' : settingsStorage ? 'Local' : 'Unknown',
        detail: `Settings ${storageCopy(settingsStorage)}; audit ${storageCopy(auditStorage)}.`
      }
    ];

    host.innerHTML = `
      <section class="admin-command-center ${readinessStatus}">
        <div class="admin-command-center-main">
          <div class="admin-command-eyebrow">
            <span>Admin desk</span>
            <b>${escapeHtml(formatSecurityCheckedAt())}</b>
          </div>
          <h2>${escapeHtml(commandSummary)}</h2>
          <p>${escapeHtml(attentionItems[0] || 'Use this desk to decide what needs action now: schedule, content, release safety, rollback, and the public preview all stay in one frame.')}</p>
          <div class="admin-command-actions">
            <button type="button" class="admin-btn admin-btn-primary" data-go-tab="bellSchedules">${ICON.bell}<span>Schedule desk</span></button>
            <button type="button" class="admin-btn" data-go-tab="announcements">${ICON.announce}<span>Content desk</span></button>
            <button type="button" class="admin-btn" id="overview-preview">${ICON.eye}<span>Preview</span></button>
            ${syncError || syncDisabled ? `<button type="button" class="admin-btn admin-btn-danger" id="overview-public-sync-retry">${ICON.refresh}<span>Repair sync</span></button>` : ''}
          </div>
        </div>
        <div class="admin-command-meter">
          <div class="admin-command-meter-card">
            <span>Launch gates</span>
            <strong>${passedGates} passing</strong>
            <small>${knownGates.length || 1} automatic checks</small>
          </div>
        </div>
      </section>

      <div class="admin-signal-strip" aria-label="Current operating state">
        ${lanes.map(lane => `
          <section class="admin-signal ${lane.status}">
            <span>${escapeHtml(lane.label)}</span>
            <strong>${escapeHtml(lane.value)}</strong>
            <small>${escapeHtml(lane.detail)}</small>
          </section>`).join('')}
      </div>

      <div class="admin-command-layout">
        <section class="admin-command-board ${validationState}">
          <div class="admin-panel-heading">
            <h2>Publish check</h2>
            <span>${publishIssues.blocking.length ? `${publishIssues.blocking.length} blockers` : publishIssues.warnings.length ? `${publishIssues.warnings.length} warnings` : 'Clear'}</span>
          </div>
          <div class="admin-release-list">
            ${validationItems.length ? validationItems.map(item => `<div>${escapeHtml(item)}</div>`).join('') : '<div>No validation blockers. Preview the draft, then publish.</div>'}
          </div>
        </section>
        <section class="admin-command-board admin-command-board--workflow">
          <div class="admin-panel-heading">
            <h2>Work queue</h2>
            <span>${escapeHtml(override)}</span>
          </div>
          <div class="admin-work-queue">
            <button type="button" data-go-tab="bellSchedules">${ICON.bell}<strong>Schedule</strong><span>Override today, import from image, edit reusable bells.</span></button>
            <button type="button" data-go-tab="announcements">${ICON.announce}<strong>Announcements</strong><span>${announcementCount} card${announcementCount === 1 ? '' : 's'} in draft content.</span></button>
            <button type="button" data-go-tab="security">${ICON.privacy}<strong>Security</strong><span>${overviewProtection.findings[0] || 'Traffic shield, sync, and privacy checks are current.'}</span></button>
            <button type="button" data-go-tab="history">${ICON.backup}<strong>Evidence</strong><span>${latestAudit ? `${latestAudit.action || 'event'} by ${latestAudit.actor?.email || latestAudit.actor?.name || latestAudit.email || 'admin'}` : 'Open audit and rollback history.'}</span></button>
          </div>
        </section>
      </div>`;

    host.querySelectorAll('[data-go-tab]').forEach(btn => btn.addEventListener('click', () => goTab(btn.dataset.goTab)));
    host.querySelector('#overview-preview')?.addEventListener('click', () => openDraftPreview(null, { fromActiveTab: true }));
    host.querySelector('#overview-public-sync-retry')?.addEventListener('click', retryPublicSync);
    return host;
  }

  // ── Sidebar / tabs ─────────────────────────────────────────────────────
  function renderSidebar() {
    const nav = $('#tabs');
    nav.innerHTML = '';
    let lastSection = '';
    for (const tab of SCHEMA) {
      const section = tab.section || 'Site';
      if (section !== lastSection) {
        const label = document.createElement('div');
        label.className = 'admin-sidebar-section-label admin-sidebar-section-label--inline';
        label.textContent = section;
        nav.appendChild(label);
        lastSection = section;
      }
      const b = document.createElement('button');
      b.className = 'admin-tab-btn' + (tab.id === state.activeTab ? ' active' : '');
      b.dataset.tab = tab.id;
      b.title = tab.label;
      const dirtyCount = tabDirtyCount(tab);
      b.innerHTML = `<span class="admin-tab-icon">${ICON[tab.icon] || ICON.audit}</span><span class="admin-tab-label">${escapeHtml(tab.label)}</span>${dirtyCount ? `<span class="admin-tab-dirty" aria-label="${dirtyCount} changed ${dirtyCount === 1 ? 'section' : 'sections'}">${dirtyCount}</span>` : ''}`;
      b.addEventListener('click', () => {
        state.activeTab = tab.id;
        saveActiveTabPreference(tab.id);
        closeMobileSidebar();
        renderSidebar();
        renderActiveTab();
        resetMainScroll();
        if (tab.id === 'security') loadSecuritySnapshot(true).catch(e => toast(e.message, 'error', 5000));
      });
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
    syncSecurityAutoRefresh();
  }

  function renderImageField(field, value) {
    const host = document.createElement('div');
    const preview = document.createElement('div');
    preview.className = 'admin-image-preview';
    function previewSrc(rawValue) {
      const raw = String(rawValue || '').trim();
      if (!raw) return '';
      if (/^(https?:|data:image\/|blob:|\/)/i.test(raw)) return raw;
      return '';
    }
    function paint() {
      const v = get(state.draft, field.path) || '';
      const src = previewSrc(v);
      preview.innerHTML = `
        <div class="admin-image-preview-media">
          ${src ? `<img src="${escapeHtml(src)}" alt="">` : `<span class="admin-image-fallback">${ICON.upload}</span>`}
        </div>
        <div class="info">
          <div class="name">${escapeHtml(v) || '— no image set —'}</div>
          <div class="meta">${v ? (src ? 'Previewing the saved URL/path.' : 'Preview needs a served URL/path, such as /uploads/file.png.') : 'Choose a file to upload, or paste a URL/path.'}</div>
        </div>
      `;
      preview.querySelector('img')?.addEventListener('error', () => {
        const media = preview.querySelector('.admin-image-preview-media');
        const meta = preview.querySelector('.meta');
        if (media) media.innerHTML = `<span class="admin-image-fallback">${ICON.upload}</span>`;
        if (meta) meta.textContent = 'Preview unavailable. Upload the file or use a served URL/path.';
      });
    }
    paint();
    const text = document.createElement('input');
    text.className = 'admin-input mono';
    text.id = fieldId(field.path);
    text.style.marginTop = '10px';
    text.value = value || '';
    text.placeholder = 'phs-logo.png · /uploads/123-logo.png · https://…';
    text.addEventListener('input', () => { onFieldChange(field.path, text.value); paint(); });

    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.png,.jpg,.jpeg,.webp,.gif,.ico,image/png,image/jpeg,image/webp,image/gif,image/x-icon'; file.style.display = 'none';
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

  function normalizedSiteStatus() {
    const status = state.draft?.siteStatus || {};
    const title = typeof status.title === 'string' && status.title.trim()
      ? status.title
      : 'Site paused for maintenance';
    const message = typeof status.message === 'string' && status.message.trim()
      ? status.message
      : 'Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon.';
    return {
      mode: status.mode === 'maintenance' ? 'maintenance' : 'live',
      title,
      message
    };
  }

  function updateSiteStatusDraft(patch, rerender = false) {
    state.draft.siteStatus = Object.assign({}, normalizedSiteStatus(), patch);
    markDirty();
    pushPreview();
    if (rerender) renderActiveTab();
  }

  function renderScheduleQualityPanel() {
    const schedules = state.draft?.bellSchedules && typeof state.draft.bellSchedules === 'object' ? state.draft.bellSchedules : {};
    const scheduleEntries = Object.entries(schedules);
    const periodCount = scheduleEntries.reduce((sum, [, periods]) => sum + asArray(periods).length, 0);
    const emptyTemplates = scheduleEntries.filter(([, periods]) => asArray(periods).length === 0).length;
    const override = state.draft?.scheduleOverride;
    const overrideMode = override?.enabled || override?.active || override?.date || override?.periods ? (override.type || override.label || 'Custom') : 'None';
    const importState = state.importAssistant;
    return renderInsightPanel({
      kicker: 'Schedule QA',
      title: 'Publishing checks for bell schedules',
      detail: 'Fast validation for today overrides, reusable templates, imported schedules, and publish impact.',
      cards: [
        insightCard(overrideMode === 'None' ? 'ok' : 'attention', 'Active override', overrideMode, overrideMode === 'None' ? 'Normal reusable schedule is active.' : 'Preview today before publishing.'),
        insightCard(scheduleEntries.length ? 'ok' : 'attention', 'Templates', String(scheduleEntries.length), scheduleEntries.length ? `${periodCount} total period rows.` : 'No reusable bell schedules are configured.'),
        insightCard(emptyTemplates ? 'attention' : 'ok', 'Empty templates', String(emptyTemplates), emptyTemplates ? 'Remove or complete empty templates.' : 'Every template with a key has rows.'),
        insightCard(importState?.fileName ? 'muted' : 'ok', 'Image import', importState?.fileName || 'Idle', importState?.fileName ? 'Review parsed rows before saving.' : 'No pending imported image.')
      ],
      rows: [
        insightRow(changedSections().includes('Schedule') ? 'attention' : 'ok', 'Draft impact', changedSections().includes('Schedule') ? 'Schedule has unpublished changes.' : 'No schedule changes are staged.'),
        insightRow(periodCount >= 6 || !scheduleEntries.length ? 'ok' : 'attention', 'Period coverage', periodCount ? `${periodCount} period rows across templates.` : 'No schedule rows were found in saved templates.'),
        insightRow(override?.message || override?.title || overrideMode === 'None' ? 'ok' : 'attention', 'Visitor clarity', overrideMode === 'None' ? 'No override banner needed.' : 'Add clear copy for students if the override changes the day.')
      ]
    });
  }

  function renderAnnouncementsQualityPanel() {
    const items = asArray(state.draft?.announcements?.items);
    const bulletCount = items.reduce((sum, item) => sum + asArray(item.bullets).length, 0);
    const missingTitles = items.filter(item => !String(item.title || '').trim()).length;
    const emptyBullets = items.reduce((sum, item) => sum + asArray(item.bullets).filter(b => !String(b || '').trim()).length, 0);
    const urlCount = items.reduce((sum, item) => sum + asArray(item.bullets).filter(b => /https?:\/\//i.test(String(b))).length, 0);
    const longestWords = Math.max(0, ...items.flatMap(item => [countWords(item.title), ...asArray(item.bullets).map(countWords)]));
    return renderInsightPanel({
      kicker: 'Announcement QA',
      title: 'Content checks before publish',
      detail: 'Scans cards for missing titles, empty bullets, links, and overly long copy.',
      cards: [
        insightCard(items.length ? 'ok' : 'attention', 'Cards', String(items.length), items.length ? `${bulletCount} total bullet lines.` : 'Announcements page would be empty.'),
        insightCard(missingTitles ? 'attention' : 'ok', 'Missing titles', String(missingTitles), missingTitles ? 'Every card should have a visible title.' : 'All cards are titled.'),
        insightCard(emptyBullets ? 'attention' : 'ok', 'Empty bullets', String(emptyBullets), emptyBullets ? 'Delete empty rows before publishing.' : 'No empty bullet rows.'),
        insightCard(longestWords > 34 ? 'attention' : 'ok', 'Longest line', `${longestWords} words`, longestWords > 34 ? 'Consider splitting the longest line.' : `${urlCount} public link${urlCount === 1 ? '' : 's'} detected.`)
      ],
      rows: [
        insightRow(changedSections().includes('Announcements') ? 'attention' : 'ok', 'Draft impact', changedSections().includes('Announcements') ? 'Announcements have unpublished changes.' : 'No announcement changes are staged.'),
        insightRow(urlCount ? 'muted' : 'ok', 'External links', urlCount ? 'Check links in preview after publishing copy changes.' : 'No full external URLs detected in bullets.')
      ]
    });
  }

  function renderSiteLaunchPanel() {
    const navItems = asArray(state.draft?.nav?.items);
    const logo = String(state.draft?.branding?.logoSrc || '').trim();
    const favicon = String(state.draft?.branding?.favicon || '').trim();
    const feedbackUrl = String(state.draft?.footer?.feedbackUrl || '').trim();
    const gradeUrl = String(state.draft?.grades?.iframeUrlProd || '').trim();
    const siteTitle = String(state.draft?.branding?.siteTitle || '').trim();
    return renderInsightPanel({
      kicker: 'Site launch checks',
      title: 'Brand, nav, and public links are launch-ready',
      detail: 'A compact readiness board for the settings students actually touch.',
      cards: [
        insightCard(siteTitle ? 'ok' : 'attention', 'Identity', siteTitle || 'Missing', siteTitle ? 'Browser title and page identity are configured.' : 'Set the public site title before publishing.'),
        insightCard(isHttpsUrl(gradeUrl) ? 'ok' : gradeUrl ? 'attention' : 'danger', 'GradeViewer', gradeUrl ? hostFromUrl(gradeUrl) : 'Missing', isHttpsUrl(gradeUrl) ? 'Production embed uses HTTPS.' : 'Production GradeViewer link needs review.'),
        insightCard(favicon ? 'ok' : 'attention', 'Favicon', favicon || 'Missing', favicon ? 'Browser tab icon is configured.' : 'Browser tab icon is blank.'),
        insightCard(logo ? 'ok' : 'attention', 'Logo', logo || 'Missing', logo ? 'Logo is configured for public pages.' : 'Add a logo before a polished publish.')
      ],
      rows: [
        insightRow(navItems.length >= 3 ? 'ok' : 'attention', 'Navigation', navItems.length >= 3 ? `${navItems.length} public links are configured.` : 'Students may lose access to a core page.'),
        insightRow(isHttpsUrl(feedbackUrl) ? 'ok' : feedbackUrl ? 'attention' : 'muted', 'Feedback', feedbackUrl ? `Feedback target: ${hostFromUrl(feedbackUrl)}.` : 'No public feedback target configured.'),
        settingsPathStatus('branding.siteDescription', 'Meta description'),
        insightRow(changedSections().includes('Site') ? 'attention' : 'ok', 'Draft impact', changedSections().includes('Site') ? 'Site appearance/navigation has unpublished changes.' : 'No site control changes are staged.')
      ]
    });
  }

  function renderPrivacyRiskPanel() {
    const snapshot = state.securitySnapshot || {};
    if (!snapshot.checkedAt && !state.securitySnapshotLoading) loadSecuritySnapshot().catch(() => {});
    const paragraphs = asArray(state.draft?.gradeMelon?.privacyParagraphs);
    const prodUrl = String(state.draft?.grades?.iframeUrlProd || '').trim();
    const support = String(state.draft?.footer?.supportEmail || '').trim();
    const privacy = snapshot.analytics?.privacy;
    const privacyOk = privacy
      ? !privacy.storesPersonalData && !privacy.storesIpAddresses && !privacy.storesUserAgents && !privacy.usesCookies
      : null;
    return renderInsightPanel({
      kicker: 'Privacy risk',
      title: 'Student-facing disclosure is complete',
      detail: 'Checks privacy copy, GradeViewer embedding, support contact, and aggregate usage reporting.',
      cards: [
        insightCard(paragraphs.length ? 'ok' : 'attention', 'FAQ paragraphs', String(paragraphs.length), paragraphs.length ? `${paragraphs.reduce((sum, p) => sum + countWords(p), 0)} words total.` : 'Privacy modal has no explanatory paragraphs.'),
        insightCard(isHttpsUrl(prodUrl) ? 'ok' : 'danger', 'GradeViewer prod', prodUrl ? hostFromUrl(prodUrl) : 'Missing', isHttpsUrl(prodUrl) ? 'Production iframe uses HTTPS.' : 'Production iframe must be HTTPS.'),
        insightCard(support.includes('@') ? 'ok' : support ? 'attention' : 'danger', 'Support contact', support ? 'Configured' : 'Missing', support.includes('@') ? 'At least one email-like contact is present.' : 'Use a reachable support/removal contact.'),
        insightCard(privacyOk === true ? 'ok' : privacyOk === false ? 'danger' : 'muted', 'Analytics', privacyOk === true ? 'Aggregate' : privacyOk === false ? 'Review' : 'Checking', privacy?.note || 'Loading analytics privacy report.')
      ],
      rows: [
        settingsPathStatus('gradeMelon.privacyTitle', 'Modal title'),
        settingsPathStatus('gradeMelon.privacyButtonLabel', 'Privacy button'),
        settingsPathStatus('gradeMelon.privacyDoneLabel', 'Close button'),
        insightRow(changedSections().includes('Privacy') ? 'attention' : 'ok', 'Draft impact', changedSections().includes('Privacy') ? 'Privacy/GradeViewer copy has unpublished changes.' : 'No privacy changes are staged.')
      ]
    });
  }

  function renderHistoryEvidencePanel() {
    const snapshot = state.securitySnapshot || {};
    if (!snapshot.checkedAt && !state.securitySnapshotLoading) loadSecuritySnapshot().catch(() => {});
    const auditEntries = asArray(snapshot.auditLog?.entries);
    const backups = asArray(snapshot.backups?.backups);
    const latestAudit = auditEntries[0];
    const latestBackup = backups[0];
    const changed = changedSections();
    return renderInsightPanel({
      kicker: 'Evidence',
      title: 'Rollback and accountability status',
      detail: 'A compact view of whether a publish can be explained, traced, and rolled back.',
      cards: [
        insightCard(auditEntries.length ? 'ok' : 'muted', 'Audit events', String(auditEntries.length), latestAudit ? `${latestAudit.action || 'admin_event'} at ${formatSecurityDate(latestAudit.timestamp || latestAudit.createdAt)}` : 'No recent audit event loaded.'),
        insightCard(backups.length ? 'ok' : 'attention', 'Backups', String(backups.length), latestBackup ? `Latest ${formatSecurityDate(latestBackup.createdAt || latestBackup.timestamp)}` : 'No rollback backup loaded.'),
        insightCard(state.lastPublishAt ? 'ok' : 'muted', 'Last publish', state.lastPublishAt ? formatSecurityDate(state.lastPublishAt) : 'None this session', state.lastPublishResult ? 'Publish result is available in this browser.' : 'No publish result in this session.'),
        insightCard(changed.length ? 'attention' : 'ok', 'Draft changes', changed.length ? String(changed.length) : '0', changed.length ? changed.join(', ') : 'Nothing staged.')
      ],
      rows: [
        insightRow(backups.length ? 'ok' : 'attention', 'Rollback proof', backups.length ? 'A backup is visible before the next risky publish.' : 'Run a publish/backup check before changing public availability.'),
        insightRow(auditEntries.length ? 'ok' : 'muted', 'Audit proof', latestAudit ? `Latest actor: ${latestAudit.actor?.email || latestAudit.actor?.name || latestAudit.email || 'admin'}` : 'No actor loaded yet.')
      ]
    });
  }

  function renderAdvancedIntegrityPanel() {
    const localUrl = String(state.draft?.grades?.iframeUrlLocal || '').trim();
    const prodUrl = String(state.draft?.grades?.iframeUrlProd || '').trim();
    const heroTitleSize = Number(state.draft?.appearance?.heroTitleSize);
    const periodRadius = Number(state.draft?.appearance?.periodCardRadius);
    const footerSize = Number(state.draft?.appearance?.footerSize);
    return renderInsightPanel({
      kicker: 'Advanced integrity',
      title: 'Integration and display safeguards',
      detail: 'Checks the low-frequency settings most likely to break the public app contract.',
      cards: [
        insightCard(localUrl ? 'ok' : 'attention', 'Local iframe', localUrl ? hostFromUrl(localUrl) : 'Missing', localUrl ? 'Local GradeViewer route configured.' : 'Local preview may fail.'),
        insightCard(isHttpsUrl(prodUrl) ? 'ok' : 'danger', 'Production iframe', prodUrl ? hostFromUrl(prodUrl) : 'Missing', isHttpsUrl(prodUrl) ? 'Production embed is HTTPS.' : 'Production embed must be HTTPS.'),
        insightCard(heroTitleSize >= 42 && heroTitleSize <= 160 ? 'ok' : 'attention', 'Hero size', Number.isFinite(heroTitleSize) ? `${heroTitleSize}px` : 'Invalid', 'Keep hero text inside configured range.'),
        insightCard(footerSize >= 9 && footerSize <= 24 && periodRadius >= 0 && periodRadius <= 28 ? 'ok' : 'attention', 'Display bounds', `${formatPxValue(footerSize)} / ${formatPxValue(periodRadius)}`, 'Footer size and period radius stay within UI bounds.')
      ],
      rows: [
        settingsPathStatus('grades.pageTitle', 'Grades browser title'),
        insightRow(changedSections().includes('Advanced') ? 'attention' : 'ok', 'Draft impact', changedSections().includes('Advanced') ? 'Advanced settings have unpublished changes.' : 'No advanced changes are staged.')
      ]
    });
  }

  function renderSiteSecurityCenter() {
    const host = document.createElement('div');
    const status = normalizedSiteStatus();
    const maintenance = status.mode === 'maintenance';
    const snapshot = state.securitySnapshot || {};
    const needsSnapshot = !snapshot.checkedAt && !state.securitySnapshotLoading;
    if (needsSnapshot) loadSecuritySnapshot().catch(() => {});
    const checking = Boolean(state.securitySnapshotLoading);
    const publish = state.lastPublishResult;
    const syncError = publish?.publicFrontend?.error;
    const publicSync = snapshot.publicSync || state.opsSummary?.publicSync || {};
    const syncConfigured = publicSync.configured === true;
    const syncDisabled = publish?.publicFrontend?.enabled === false || !syncConfigured;
    const syncSetupReason = publicSync.reason || 'Public sync credentials are missing.';
    const syncText = syncError
      ? 'Sync failed'
      : syncDisabled
        ? 'Sync needs setup'
        : publish
          ? 'Synced'
          : 'Ready';
    const who = snapshot.whoami || {};
    const identity = who.identity || state.identity || {};
    const authMethod = who.method || identity.method || 'admin';
    const authText = authMethod === 'google'
      ? 'Google admin'
      : authMethod === 'local-dev'
        ? 'Local admin'
        : 'Admin session';
    const storage = snapshot.storage || state.adminHealth || {};
    const settingsStorage = storage.settings;
    const auditStorage = snapshot.auditLog?.storage || storage.audit;
    const backupStorage = snapshot.backups?.storage;
    const backupCount = Array.isArray(snapshot.backups?.backups) ? snapshot.backups.backups.length : null;
    const privacy = snapshot.analytics?.privacy;
    const errorText = snapshot.errors?.length ? snapshot.errors.join(' | ') : '';
    const dataDurable = Boolean(settingsStorage?.durable && auditStorage?.durable && (backupStorage ? backupStorage.durable : true));
    const privacyOk = privacy
      ? !privacy.storesPersonalData && !privacy.storesIpAddresses && !privacy.storesUserAgents && !privacy.usesCookies
      : null;
    const draftSections = changedSections();
    const siteStatusChanged = draftSections.includes('Security');
    const publishScope = draftSections.length ? draftSections.join(', ') : 'No staged changes';
    const sessionDetail = identity.email || identity.name || 'Current admin session';
    const storageDetail = settingsStorage
      ? `Settings ${storageCopy(settingsStorage)}; audit ${storageCopy(auditStorage)}; backups ${storageCopy(backupStorage)}.`
      : 'Waiting for storage status.';
    const backupDetail = backupCount === null
      ? 'Checking backup history.'
      : backupCount > 0
        ? 'At least one settings backup is available for rollback.'
        : 'No recent backup returned by this check yet.';
    const auditEntries = Array.isArray(snapshot.auditLog?.entries) ? snapshot.auditLog.entries : [];
    const recentBackups = Array.isArray(snapshot.backups?.backups) ? snapshot.backups.backups : [];
    const latestAudit = auditEntries[0];
    const latestBackup = recentBackups[0];
    const composerOpen = state.securityComposerOpen || maintenance;
    const composerDisabled = composerOpen ? '' : ' disabled tabindex="-1"';
    const rateLimits = snapshot.security?.rateLimits || state.opsSummary?.security?.rateLimits || null;
    const rateLimitControls = asArray(rateLimits?.controls);
    const trafficDetail = rateLimits?.active
      ? `${rateLimitControls.length || 0} backend flood limits live.`
      : 'Rate-limit status was not returned.';
    const model = securityProtectionModel({
      checking,
      maintenance,
      syncError,
      syncDisabled,
      rateLimits,
      authOk: authMethod === 'google' || authMethod === 'local-dev',
      authDetail: `${authText}: ${sessionDetail}`,
      settingsStorage,
      auditStorage,
      backupStorage,
      backupCount,
      privacyOk,
      privacyDetail: privacy?.note || '',
      uploadOk: Boolean(snapshot.security?.upload),
      errorText
    });
    const summaryText = securitySummaryText(model, {
      mode: maintenance ? 'maintenance' : 'live',
      syncText,
      authText,
      sessionDetail,
      storageDetail,
      latestAudit: latestAudit ? `${latestAudit.action || 'admin_event'} by ${latestAudit.actor?.email || latestAudit.actor?.name || latestAudit.email || 'admin'}` : '',
      notes: ''
    });
    const protectionFindings = model.findings.slice(0, 4).map(issue => `<li>${escapeHtml(issue)}</li>`).join('');
    const templateButtons = SECURITY_TEMPLATES.map(t => `
      <button type="button" class="admin-security-template" data-security-template="${escapeHtml(t.id)}"${composerDisabled}>
        <strong>${escapeHtml(t.label)}</strong>
        <span>${escapeHtml(t.title)}</span>
      </button>`).join('');
    const autoCheckLabel = model.status === 'ok' ? 'Stable' : model.status === 'danger' ? 'Action needed' : 'Watch';
    const timelineItems = [
      securityTimelineItem(latestAudit, 'No recent audit event returned.'),
      securityTimelineItem(latestBackup, 'No recent backup returned.')
    ].join('');
    const boundaryCards = [
      {
        status: rateLimits?.active ? 'ok' : 'muted',
        label: 'Traffic shield',
        value: rateLimits?.active ? 'Active' : 'Checking',
        detail: rateLimits?.note || 'Backend rate-limit status loads automatically.'
      },
      {
        status: 'ok',
        label: 'Public snapshot',
        value: `${asArray(snapshot.security?.publicSnapshotKeys).length || asArray(state.opsSummary?.security?.publicSnapshotKeys).length || 15} keys`,
        detail: 'Only approved public settings keys are mirrored to the public site.'
      },
      {
        status: 'ok',
        label: 'Private key guard',
        value: `${asArray(snapshot.security?.privateKeyGuard).length || asArray(state.opsSummary?.security?.privateKeyGuard).length || 'Active'} blocked`,
        detail: 'Tokens, sessions, IPs, actor data, and audit data are blocked from public snapshots.'
      },
      {
        status: isHttpsUrl(state.draft?.grades?.iframeUrlProd) ? 'ok' : 'danger',
        label: 'GradeViewer',
        value: state.draft?.grades?.iframeUrlProd ? hostFromUrl(state.draft.grades.iframeUrlProd) : 'Missing',
        detail: 'Production embed must stay on HTTPS.'
      },
      {
        status: 'ok',
        label: 'Upload filter',
        value: 'Images only',
        detail: 'Backend verifies file bytes after MIME filtering before storing assets.'
      },
      {
        status: syncError ? 'danger' : syncDisabled ? 'attention' : 'ok',
        label: 'Sync channel',
        value: syncText,
        detail: syncError || (syncDisabled ? syncSetupReason : 'Public-safe JSON publish path is available.')
      },
      {
        status: dataDurable ? 'ok' : 'attention',
        label: 'Admin custody',
        value: dataDurable ? 'Durable' : 'Local',
        detail: storageDetail
      }
    ];

    host.className = 'admin-release-room';
    host.innerHTML = `
      <section class="admin-release-hero ${model.status}">
        <div class="admin-release-hero-copy">
          <div class="admin-command-eyebrow">
            <span>Security desk</span>
            <b>Auto-checks every 45s</b>
          </div>
          <h2>${maintenance ? 'Maintenance page is staged' : 'Live protection checks are running'}</h2>
          <p>${escapeHtml(errorText || 'This panel watches traffic limits, public sync, admin access, rollback points, private data boundaries, upload policy, and visitor availability. It stays read-only until you stage or publish site status.')}</p>
          <div class="admin-security-hero-actions">
            <button type="button" class="admin-btn admin-btn-primary" id="security-open-maintenance">${ICON.close}<span>Stage maintenance</span></button>
            <button type="button" class="admin-btn" id="security-preview">${ICON.eye}<span>Preview public page</span></button>
            <button type="button" class="admin-btn" id="security-copy-summary">${ICON.audit}<span>Copy packet</span></button>
            <button type="button" class="admin-btn" data-security-go-tab="history">${ICON.backup}<span>Open evidence</span></button>
          </div>
        </div>
        <div class="admin-release-meter admin-auto-check-panel">
          <div class="admin-auto-check-card ${model.status}">
            <span>Auto checks</span>
            <strong>${escapeHtml(autoCheckLabel)}</strong>
            <small>${escapeHtml(formatSecurityCheckedAt())}</small>
          </div>
          <button type="button" class="admin-btn admin-btn-sm" id="security-refresh">${ICON.refresh}<span>${checking ? 'Checking...' : 'Refresh now'}</span></button>
        </div>
      </section>

      <div class="admin-release-grid">
        <section class="admin-security-panel admin-release-panel admin-release-panel--availability">
          <div class="admin-panel-heading">
            <h2>Availability control</h2>
            <span>${maintenance ? 'Maintenance staged' : 'Live staged'}</span>
          </div>
          <div class="admin-security-mode-row">
            <button type="button" class="admin-btn ${maintenance ? '' : 'admin-btn-primary'}" data-site-mode="live">${ICON.eye}<span>Restore live</span></button>
            <button type="button" class="admin-btn ${maintenance ? 'admin-btn-primary' : 'admin-btn-danger'}" id="security-open-maintenance-inline">${ICON.close}<span>Maintenance draft</span></button>
          </div>
          <div class="admin-security-composer ${composerOpen ? 'is-open' : ''}" aria-hidden="${composerOpen ? 'false' : 'true'}">
            <div class="admin-security-composer-body">
              <div class="admin-security-composer-head">
                <div>
                  <strong>Public maintenance page</strong>
                  <span>Review the exact visitor-facing title and message before publishing.</span>
                </div>
                <em>${maintenance ? 'Maintenance mode staged' : 'Draft not staged yet'}</em>
              </div>
              <div class="admin-field">
                <label for="site-status-title">Maintenance title</label>
                <input class="admin-input" id="site-status-title" type="text" maxlength="120" value="${escapeHtml(status.title)}"${composerDisabled}>
              </div>
              <div class="admin-field">
                <label for="site-status-message">Maintenance message</label>
                <textarea class="admin-textarea" id="site-status-message" maxlength="500"${composerDisabled}>${escapeHtml(status.message)}</textarea>
              </div>
              <div class="admin-security-template-grid" aria-label="Incident templates">
                ${templateButtons}
              </div>
              <div class="admin-security-note">Public mode is a site setting. Backend auth, audit logs, analytics, and student sessions stay private.</div>
              <div class="admin-readiness-actions admin-security-actions">
                <button type="button" class="admin-btn admin-btn-danger" id="security-stage-maintenance"${composerDisabled}>${ICON.close}<span>${maintenance ? 'Update maintenance' : 'Stage maintenance'}</span></button>
                <button type="button" class="admin-btn admin-btn-primary" id="security-publish"${composerDisabled}>${ICON.upload}<span>Publish staged site status</span></button>
                ${(syncError || syncDisabled) ? `<button type="button" class="admin-btn admin-btn-danger" id="security-sync"${composerDisabled}>${ICON.refresh}<span>Retry public sync</span></button>` : ''}
              </div>
            </div>
          </div>
        </section>

        <section class="admin-security-panel admin-release-panel admin-release-panel--impact">
          <div class="admin-panel-heading">
            <h2>Protection checks</h2>
            <span>${escapeHtml(formatSecurityCheckedAt())}</span>
          </div>
          <div class="admin-security-impact-grid">
            <div class="admin-security-risk-issues">
              <strong>${model.status === 'ok' ? 'Stable right now' : 'Needs attention'}</strong>
              <ul>${protectionFindings}</ul>
            </div>
          </div>
        </section>
      </div>

      <section class="admin-security-panel admin-release-panel admin-release-panel--boundary">
        <div class="admin-panel-heading">
          <h2>Protection map</h2>
          <span>Public-safe boundary checks</span>
        </div>
        <div class="admin-attack-map">
          ${boundaryCards.map(card => `
            <div class="admin-attack-node ${card.status}">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(card.value)}</strong>
              <small>${escapeHtml(card.detail)}</small>
            </div>`).join('')}
        </div>
      </section>

      <div class="admin-release-grid admin-release-grid--bottom">
        <section class="admin-security-panel admin-release-panel admin-release-panel--timeline">
          <div class="admin-panel-heading">
            <h2>Evidence timeline</h2>
            <span>Latest audit and rollback</span>
          </div>
          <div class="admin-security-timeline">${timelineItems}</div>
        </section>
      </div>
    `;

    host.querySelector('[data-site-mode="live"]')?.addEventListener('click', () => {
      state.securityComposerOpen = false;
      updateSiteStatusDraft({ mode: 'live' }, true);
      toast('Live mode staged. Publish to restore the public site.', 'success', 3500);
    });
    host.querySelector('#security-open-maintenance')?.addEventListener('click', () => {
      state.securityComposerOpen = true;
      renderActiveTab();
      requestAnimationFrame(() => document.getElementById('site-status-title')?.focus());
    });
    host.querySelector('#security-open-maintenance-inline')?.addEventListener('click', () => {
      state.securityComposerOpen = true;
      renderActiveTab();
      requestAnimationFrame(() => document.getElementById('site-status-title')?.focus());
    });
    host.querySelector('#security-stage-maintenance')?.addEventListener('click', () => {
      if (!maintenance && !confirm('Show the maintenance page on the main site after publishing?')) return;
      state.securityComposerOpen = true;
      updateSiteStatusDraft({ mode: 'maintenance' }, true);
      toast('Maintenance mode staged. Publish to pause the public site.', 'success', 3500);
    });
    host.querySelector('#site-status-title')?.addEventListener('input', e => updateSiteStatusDraft({ title: e.target.value }));
    host.querySelector('#site-status-message')?.addEventListener('input', e => updateSiteStatusDraft({ message: e.target.value }));
    host.querySelector('#security-publish')?.addEventListener('click', () => publishDraft('security', { onlyKeys: ['siteStatus'] }).catch(() => {}));
    host.querySelector('#security-preview')?.addEventListener('click', () => openDraftPreview('schedule'));
    host.querySelector('#security-sync')?.addEventListener('click', retryPublicSync);
    host.querySelector('#security-refresh')?.addEventListener('click', () => loadSecuritySnapshot(true).catch(e => toast(e.message, 'error', 5000)));
    host.querySelectorAll('[data-security-go-tab]').forEach(btn => btn.addEventListener('click', () => goTab(btn.dataset.securityGoTab)));
    host.querySelectorAll('[data-security-template]').forEach(btn => btn.addEventListener('click', () => {
      const template = SECURITY_TEMPLATES.find(t => t.id === btn.dataset.securityTemplate);
      if (!template) return;
      state.securityComposerOpen = true;
      updateSiteStatusDraft({ mode: 'maintenance', title: template.title, message: template.message }, true);
      toast(`${template.label} template staged. Preview before publishing.`, 'success', 3500);
    }));
    host.querySelector('#security-copy-summary')?.addEventListener('click', () => {
      copyText(summaryText)
        .then(() => toast('Audit packet copied.', 'success', 2200))
        .catch(e => toast('Copy failed: ' + e.message, 'error', 5000));
    });
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
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Move up" aria-label="Move nav item ${i + 1} up" data-act="up" ${i===0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Move down" aria-label="Move nav item ${i + 1} down" data-act="down" ${i===items.length-1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" title="Remove" aria-label="Remove nav item ${i + 1}" data-act="del">${ICON.trash}</button>
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
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Move up" aria-label="Move announcement card ${i + 1} up" data-act="up" ${i===0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Move down" aria-label="Move announcement card ${i + 1} down" data-act="down" ${i===items.length-1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" title="Remove" aria-label="Remove announcement card ${i + 1}" data-act="del">${ICON.trash}</button>
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
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" type="button" title="Move bullet up" aria-label="Move bullet ${j + 1} up">${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" type="button" title="Move bullet down" aria-label="Move bullet ${j + 1} down">${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" type="button" title="Remove bullet" aria-label="Remove bullet ${j + 1}">${ICON.trash}</button>`;
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
      const override = state.draft.scheduleOverride || null;
      const overrideDate = override?.date || todayISODate();
      host.innerHTML = `
        <div class="admin-field">
          <div class="admin-field-row"><label>Active override</label></div>
          <select class="admin-select" id="sched-override-select">
            ${types.map(t => `<option value="${escapeHtml(t)}" ${t===cur?'selected':''}>${t==='none'?'— No override (use data.json) —':escapeHtml(t)}</option>`).join('')}
          </select>
          <div class="admin-field-help">This changes the draft. Click Publish when you are ready for visitors to see it.</div>
        </div>
        <div class="admin-grid-2 admin-schedule-override-grid">
          <div class="admin-field">
            <div class="admin-field-row"><label for="sched-override-date">Applies on</label></div>
            <input class="admin-input" id="sched-override-date" type="date" value="${escapeHtml(overrideDate)}" ${override ? '' : 'disabled'}>
          </div>
          <div class="admin-field">
            <div class="admin-field-row"><label>Override status</label></div>
            <div class="admin-schedule-override-status ${override ? 'active' : ''}">
              <strong>${override ? escapeHtml(override.type) : 'Automatic schedule'}</strong>
              <span>${override ? `Applies ${escapeHtml(overrideDate)}. Set ${new Date(override.timestamp || Date.now()).toLocaleString()}.` : 'Uses data.json and the normal schedule resolver.'}</span>
            </div>
          </div>
        </div>`;
      host.querySelector('#sched-override-select').addEventListener('change', (e) => {
        const v = e.target.value;
        state.draft.scheduleOverride = (v === 'none') ? null : { type: v, date: overrideDate, timestamp: Date.now() };
        markDirty(); paint(); pushPreview();
      });
      host.querySelector('#sched-override-date')?.addEventListener('change', (e) => {
        if (!state.draft.scheduleOverride) return;
        state.draft.scheduleOverride = { ...state.draft.scheduleOverride, date: e.target.value || todayISODate(), timestamp: Date.now() };
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
    host.className = 'admin-privacy-paragraphs';
    state.draft.gradeMelon = state.draft.gradeMelon || {};
    state.draft.gradeMelon.privacyParagraphs = state.draft.gradeMelon.privacyParagraphs || [];
    const arr = state.draft.gradeMelon.privacyParagraphs;
    function paint() {
      host.innerHTML = '';
      if (!arr.length) {
        const empty = document.createElement('div');
        empty.className = 'admin-compact-empty-state';
        empty.innerHTML = `
          <div>
            <strong>No modal paragraphs yet</strong>
            <span>Add concise student-facing copy explaining what GradeViewer links to and how to request support.</span>
          </div>`;
        host.appendChild(empty);
      }
      arr.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'admin-list-item admin-list-item--compact';
        row.innerHTML = `
          <div class="admin-list-item-head">
            <span class="handle">Paragraph ${i+1}</span>
            <div class="admin-list-item-actions">
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Move up" aria-label="Move paragraph ${i + 1} up" data-act="up" ${i===0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Move down" aria-label="Move paragraph ${i + 1} down" data-act="down" ${i===arr.length-1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" title="Remove" aria-label="Remove paragraph ${i + 1}" data-act="del">${ICON.trash}</button>
            </div>
          </div>
          <textarea class="admin-textarea admin-textarea--privacy" maxlength="4000" placeholder="Write one clear paragraph for the privacy modal.">${escapeHtml(p)}</textarea>`;
        row.querySelector('textarea').addEventListener('input', e => { arr[i] = e.target.value; markDirty(); pushPreview(); });
        row.querySelector('[data-act=up]').addEventListener('click', () => { arr.splice(i-1,0,arr.splice(i,1)[0]); markDirty(); paint(); pushPreview(); });
        row.querySelector('[data-act=down]').addEventListener('click', () => { arr.splice(i+1,0,arr.splice(i,1)[0]); markDirty(); paint(); pushPreview(); });
        row.querySelector('[data-act=del]').addEventListener('click', () => { arr.splice(i,1); markDirty(); paint(); pushPreview(); });
        host.appendChild(row);
      });
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'admin-btn admin-btn-sm';
      addBtn.innerHTML = ICON.plus + '<span>Add paragraph</span>';
      addBtn.addEventListener('click', () => { arr.push(''); markDirty(); paint(); pushPreview(); host.querySelector('textarea:last-of-type')?.focus(); });
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
          <button class="admin-btn admin-btn-sm admin-btn-ghost" data-act="rm" title="Remove image" aria-label="Remove ${escapeHtml(img.name)}">×</button>
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
            <td data-label="Period"><input class="admin-input admin-input-sm" data-f="name" value="${escapeHtml(r.name)}" maxlength="60"></td>
            <td data-label="Start"><input class="admin-input admin-input-sm" data-f="start" value="${escapeHtml(r.start)}" placeholder="HH:MM" maxlength="5"></td>
            <td data-label="End"><input class="admin-input admin-input-sm" data-f="end" value="${escapeHtml(r.end)}" placeholder="HH:MM" maxlength="5"></td>
            <td data-label="Duration" class="muted">${dur > 0 ? Math.round(dur / 60) + ' min' : '—'}</td>
            <td data-label="Action"><button type="button" class="admin-btn admin-btn-sm admin-btn-danger" data-act="del">Delete</button></td>
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

    function paint() {
      const busy = !!state.jarvis.busy;
      const hasConversation = state.jarvis.messages.length > 1;
      const changed = changedSections();
      const publishIssues = collectPublishIssues();
      const siteStatus = normalizedSiteStatus();
      const snapshot = state.securitySnapshot || {};
      const summary = state.opsSummary || {};
      const publicSync = snapshot.publicSync || summary.publicSync || {};
      const latestAudit = asArray(snapshot.auditLog?.entries || summary.audit?.events || summary.auditLog?.entries)[0] || null;
      const promptOptions = [
        ['Schedule fix', 'Make the schedule normal for today and explain what will change before publishing.'],
        ['Announcement copy', 'Rewrite the public announcement copy so it is concise and student-friendly.'],
        ['Privacy text', 'Draft a short privacy FAQ paragraph for GradeViewer and support requests.'],
        ['Check draft', 'Review my current draft and tell me the safest next action.']
      ];
      host.innerHTML = `
        <div class="admin-jarvis-shell ${busy ? 'is-busy' : ''}">
          <section class="admin-jarvis-card admin-jarvis-card--compose">
            <div class="admin-panel-heading">
              <div>
                <h2>${busy ? 'Working on your draft' : 'Ask Jarvis'}</h2>
                <span>Draft changes stay staged until you publish.</span>
              </div>
              <b>${changed.length ? `${changed.length} staged` : 'clean draft'}</b>
            </div>
            ${pendingCard()}
            <div class="admin-jarvis-suggestions" aria-label="Jarvis shortcuts">
              ${promptOptions.map(([label, prompt]) => `<button type="button" data-jarvis-prompt="${escapeHtml(prompt)}"><span>${escapeHtml(label)}</span><small>${escapeHtml(prompt)}</small></button>`).join('')}
            </div>
            <form class="admin-jarvis-compose" id="jarvis-form">
              <input type="file" id="jarvis-file-input" class="hidden" accept="image/*" multiple>
              ${renderAttachmentChips(state.jarvis.attachments, true)}
              <textarea id="jarvis-input" maxlength="3000" rows="3" placeholder="Tell Jarvis what to change, or attach a screenshot and describe what is wrong." ${busy ? 'disabled' : ''}></textarea>
              <div class="admin-jarvis-compose-actions">
                <button type="button" class="admin-btn" id="jarvis-add-file">${ICON.plus}<span>Attach image</span></button>
                <button type="submit" class="admin-btn admin-btn-primary" id="jarvis-send" ${busy ? 'disabled' : ''}>${busy ? 'Working...' : 'Ask Jarvis'}</button>
              </div>
            </form>
          </section>

          <section class="admin-jarvis-card admin-jarvis-card--context">
            <div class="admin-panel-heading">
              <h2>Live context</h2>
              <span>${escapeHtml(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span>
            </div>
            <div class="admin-jarvis-context-grid">
              <div><span>Public site</span><strong>${siteStatus.mode === 'maintenance' ? 'Maintenance' : 'Live'}</strong><small>${siteStatus.mode === 'maintenance' ? escapeHtml(siteStatus.title) : 'Normal visitor mode.'}</small></div>
              <div><span>Public sync</span><strong>${publicSync.configured === false ? 'Needs setup' : publicSync.ready === false ? 'Check sync' : 'Ready'}</strong><small>${escapeHtml(publicSync.message || publicSync.reason || 'Public settings status is available to Jarvis.')}</small></div>
              <div><span>Publish gate</span><strong>${publishIssues.blocking.length ? `${publishIssues.blocking.length} blockers` : publishIssues.warnings.length ? `${publishIssues.warnings.length} warnings` : 'Clear'}</strong><small>${escapeHtml(publishIssues.blocking[0] || publishIssues.warnings[0] || 'No publish issues found.')}</small></div>
              <div><span>Last evidence</span><strong>${escapeHtml(latestAudit?.action || 'No event')}</strong><small>${escapeHtml(latestAudit?.actor?.email || latestAudit?.actor?.name || latestAudit?.email || 'Audit history appears here.')}</small></div>
            </div>
          </section>

          <section class="admin-jarvis-card admin-jarvis-card--thread">
            <div class="admin-panel-heading">
              <h2>Conversation</h2>
              <span>${hasConversation ? `${state.jarvis.messages.length} messages` : 'ready'}</span>
            </div>
            <div class="admin-jarvis-messages ${hasConversation ? 'has-conversation' : ''}" id="jarvis-messages">
              ${state.jarvis.messages.map(m => `
                <div class="admin-jarvis-message ${m.role === 'user' ? 'user' : 'assistant'}">
                  <div class="admin-jarvis-role">${m.role === 'user' ? 'You' : 'Jarvis'}</div>
                  <div class="admin-jarvis-bubble">${escapeHtml(m.text)}</div>
                  ${renderAttachmentChips(m.attachments, false)}
                </div>`).join('')}
            </div>
          </section>
        </div>`;

      const messages = host.querySelector('#jarvis-messages');
      messages.scrollTop = messages.scrollHeight;
      host.querySelector('#jarvis-form').addEventListener('submit', onSubmit);
      host.querySelector('#jarvis-add-file').addEventListener('click', () => host.querySelector('#jarvis-file-input').click());
      host.querySelector('#jarvis-file-input').addEventListener('change', onFilesSelected);
      host.querySelectorAll('[data-jarvis-prompt]').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = host.querySelector('#jarvis-input');
          if (!input || busy) return;
          input.value = btn.dataset.jarvisPrompt || '';
          input.focus();
          input.dispatchEvent(new Event('input'));
        });
      });
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
        input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
      });
      host.querySelector('[data-jarvis-act="preview"]')?.addEventListener('click', () => openDraftPreview(null, { fromActiveTab: true }));
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
      state.jarvis.messages.push({ role: 'assistant', text: 'Drafting a safe preview...' });
      paint();

      const beforeDraft = deepClone(state.draft);
      try {
        const history = state.jarvis.messages
          .filter(m => !(m.role === 'assistant' && m.text === 'Drafting a safe preview...'))
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
        refreshWorkspaceLayoutSoon();
        return;
      }
      host.innerHTML = `
        ${storageNote}
        <div class="admin-table-scroll">
          <table class="admin-audit-table">
            <thead><tr><th>When</th><th>Source</th><th>Actor</th><th>Changed</th><th></th></tr></thead>
            <tbody>
              ${j.backups.map(b => `
                <tr data-backup-id="${escapeHtml(b.id)}">
                  <td class="muted">${backupTimestamp(b) ? new Date(backupTimestamp(b)).toLocaleString() : 'No timestamp'}</td>
                  <td class="action">${escapeHtml(b.source || b.action || 'manual')}</td>
                  <td class="muted admin-audit-actor">${escapeHtml(b.actor?.email || b.actor?.name || '—')}</td>
                  <td class="muted admin-audit-detail">${escapeHtml((b.sections || b.patchKeys || []).join(', ') || b.message || '—')}</td>
                  <td><button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-act="restore">Restore</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
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
      refreshWorkspaceLayoutSoon();
    }).catch(e => {
      host.innerHTML = `<div class="admin-field-help" style="color:var(--danger)">${escapeHtml(e.message)}</div>`;
      refreshWorkspaceLayoutSoon();
    });
    return host;
  }

  function renderAuditLog() {
    const host = document.createElement('div');
    host.innerHTML = '<div class="admin-field-help">Loading…</div>';
    api('/admin/audit-log?limit=80').then(j => {
      const storage = j.storage;
      const storageNote = storage ? `<div class="admin-privacy-note" style="margin-bottom:14px">Audit storage: ${escapeHtml(storage.type)}${storage.durable ? ` · ${escapeHtml(storage.repo || '')}/${escapeHtml(storage.path || '')}` : ' · local development only'}</div>` : '';
      const entries = Array.isArray(j.entries) ? j.entries : [];
      const visibleLimit = 60;
      if (!entries.length) {
        host.innerHTML = storageNote + '<div class="admin-field-help">No events yet.</div>';
        refreshWorkspaceLayoutSoon();
        return;
      }
      const detailFor = (entry) => [entry.sections?.join(','), entry.patchKeys?.join(','), entry.section, entry.file, entry.type, entry.rowCount && `${entry.rowCount} rows`, entry.imageCount && `${entry.imageCount} images`, entry.message].filter(Boolean).join(' · ') || '—';
      const actorFor = (entry) => entry.actor?.email || entry.email || entry.actor?.name || '—';
      const actions = [...new Set(entries.map(entry => entry.action).filter(Boolean))].sort();
      host.innerHTML = `
        ${storageNote}
        <div class="admin-history-toolbar">
          <label class="admin-history-search">
            ${ICON.search}
            <input class="admin-input" id="audit-search" type="search" placeholder="Search actor, action, IP, section, or detail">
          </label>
          <select class="admin-select" id="audit-action-filter" aria-label="Filter audit action">
            <option value="">All actions</option>
            ${actions.map(action => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`).join('')}
          </select>
          <button type="button" class="admin-btn admin-btn-sm" id="audit-copy-csv">${ICON.audit}<span>Copy CSV</span></button>
        </div>
        <div id="audit-result-count" class="admin-field-help"></div>
        <div id="audit-table-host"></div>`;
      const tableHost = host.querySelector('#audit-table-host');
      const resultCount = host.querySelector('#audit-result-count');
      const search = host.querySelector('#audit-search');
      const filter = host.querySelector('#audit-action-filter');
      function filteredEntries() {
        const q = search.value.trim().toLowerCase();
        const action = filter.value;
        return entries.filter(entry => {
          if (action && entry.action !== action) return false;
          if (!q) return true;
          const haystack = [
            new Date(entry.ts || entry.timestamp || entry.time || Date.now()).toLocaleString(),
            actorFor(entry),
            entry.ip || '',
            entry.action || '',
            detailFor(entry)
          ].join(' ').toLowerCase();
          return haystack.includes(q);
        });
      }
      function paintAuditTable() {
        const rows = filteredEntries();
        const visibleRows = rows.slice(0, visibleLimit);
        const clipped = rows.length > visibleRows.length ? ` · showing first ${visibleRows.length}` : '';
        resultCount.textContent = `${rows.length} matching ${entries.length} loaded${clipped}`;
        tableHost.innerHTML = `
          <div class="admin-table-scroll">
            <table class="admin-audit-table admin-audit-table--events">
              <thead><tr><th>When</th><th>Actor</th><th>IP</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                ${visibleRows.map(entry => `
                  <tr>
                    <td class="muted">${new Date(entry.ts || entry.timestamp || entry.time || Date.now()).toLocaleString()}</td>
                    <td class="muted admin-audit-actor">${escapeHtml(actorFor(entry))}</td>
                    <td class="muted">${escapeHtml(entry.ip || '—')}</td>
                    <td class="action">${escapeHtml(entry.action || 'event')}</td>
                    <td class="muted admin-audit-detail">${escapeHtml(detailFor(entry))}</td>
                  </tr>`).join('') || '<tr><td colspan="5" class="muted">No matching audit events.</td></tr>'}
              </tbody>
            </table>
          </div>`;
        refreshWorkspaceLayoutSoon();
      }
      function csvCell(value) {
        return `"${String(value ?? '').replace(/"/g, '""')}"`;
      }
      search.addEventListener('input', paintAuditTable);
      filter.addEventListener('change', paintAuditTable);
      host.querySelector('#audit-copy-csv')?.addEventListener('click', () => {
        const csv = [
          ['When', 'Actor', 'IP', 'Action', 'Detail'].map(csvCell).join(','),
          ...filteredEntries().map(entry => [
            new Date(entry.ts || entry.timestamp || entry.time || Date.now()).toISOString(),
            actorFor(entry),
            entry.ip || '',
            entry.action || 'event',
            detailFor(entry)
          ].map(csvCell).join(','))
        ].join('\n');
        copyText(csv)
          .then(() => toast('Audit CSV copied.', 'success', 2200))
          .catch(e => toast('Copy failed: ' + e.message, 'error', 5000));
      });
      paintAuditTable();
    }).catch(e => {
      host.innerHTML = `<div class="admin-field-help" style="color:var(--danger)">${escapeHtml(e.message)}</div>`;
      refreshWorkspaceLayoutSoon();
    });
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
        acc.durationSeconds += t.durationSeconds || 0;
        return acc;
      }, { pageviews: 0, durationSeconds: 0 });

      const pages = {};
      for (const key of last7) {
        for (const [page, metrics] of Object.entries(days[key]?.pages || {})) {
          pages[page] ||= { pageviews: 0, durationSeconds: 0 };
          pages[page].pageviews += metrics.pageviews || 0;
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
            <span>${formatDuration(m.durationSeconds)} total time</span>
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
        </tr>`;
      }).join('');
      const gaRows = (ga.pages || []).map(p => `<tr>
        <td class="action">${escapeHtml(p.path)}</td>
        <td>${formatNumber(p.pageviews)}</td>
        <td>${formatNumber(p.activeUsers)}</td>
        <td>${formatDuration(p.averageSessionDuration)}</td>
      </tr>`).join('');
      const gaTable = ga.configured && !ga.error ? `
        <h2>Google Analytics pages</h2>
        <table class="admin-audit-table">
          <thead><tr><th>Path</th><th>Views</th><th>Users</th><th>Avg session</th></tr></thead>
          <tbody>${gaRows || '<tr><td colspan="4" class="muted">No GA page data yet.</td></tr>'}</tbody>
        </table>` : ga.error ? `<div class="admin-field-help" style="color:var(--danger)">${escapeHtml(ga.error)}</div>` : '';

      host.innerHTML = `
        <div class="admin-stat-grid">
          <div class="admin-stat"><span>GA active users</span><strong>${ga.configured && !ga.error ? formatNumber(ga.totals?.activeUsers || 0) : 'Not set'}</strong><small>Google Analytics</small></div>
          <div class="admin-stat"><span>GA 7-day views</span><strong>${ga.configured && !ga.error ? formatNumber(ga.totals?.pageviews || 0) : '-'}</strong><small>${ga.configured && !ga.error ? `${formatNumber(ga.totals?.sessions || 0)} sessions` : 'Waiting for setup'}</small></div>
          <div class="admin-stat"><span>Time tracked</span><strong>${formatDuration(totals.durationSeconds)}</strong><small>First-party aggregate</small></div>
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
        <details class="admin-analytics-details">
          <summary>Raw analytics tables</summary>
          <div class="admin-analytics-details-body">
            ${gaTable}
            <h2>First-party pages</h2>
            <table class="admin-audit-table">
              <thead><tr><th>Page</th><th>Views</th><th>Total time</th></tr></thead>
              <tbody>${pageRows || '<tr><td colspan="3" class="muted">No page data yet.</td></tr>'}</tbody>
            </table>
            <h2>Recent days</h2>
            <table class="admin-audit-table">
              <thead><tr><th>Date</th><th>Views</th><th>Total time</th></tr></thead>
              <tbody>${dayRows || '<tr><td colspan="3" class="muted">No daily data yet.</td></tr>'}</tbody>
            </table>
          </div>
        </details>`;
      refreshWorkspaceLayoutSoon();
    }).catch(e => {
      host.innerHTML = `<div class="admin-field-help" style="color:var(--danger)">${escapeHtml(e.message)}</div>`;
      refreshWorkspaceLayoutSoon();
    });
    return host;
  }

  function workspacePreviewPage(tabId) {
    if (tabId === 'jarvis' || tabId === 'history') return null;
    if (tabId === 'announcements') return 'announcements';
    if (tabId === 'advanced') return 'grades';
    if (tabId === 'safety') return 'privacy';
    return 'schedule';
  }

  function tabWorkspaceSummary(tab) {
    const fieldCount = tab.groups.reduce((count, group) => count + (group.fields?.length || 0), 0);
    const toolCount = tab.groups.filter(group => group.custom).length;
    const dirtyCount = tabDirtyCount(tab);
    const actionMap = {
      bellSchedules: ['Schedule control', 'Change today, import a screenshot, or edit reusable bell templates.'],
      announcements: ['Content pipeline', 'Edit public cards with preview and publish checks nearby.'],
      appearance: ['Public shell', 'Tune the front page, navigation, imagery, and footer without hunting through raw JSON.'],
      safety: ['Privacy desk', 'Manage public privacy copy, analytics visibility, and student-facing disclosure.'],
      history: ['Evidence vault', 'Read audit events, backup points, and rollback context in one surface.'],
      advanced: ['Integration bay', 'Control iframe URLs, display sizing, footer routing, and low-frequency app settings.'],
      jarvis: ['Assistant desk', 'Draft admin changes here; public preview appears only after a schedule, site, privacy, or announcement change is staged.'],
      site: ['Site controls', 'Review public links, launch state, and shared site behavior.']
    };
    const fallback = [tab.title || tab.label, tab.sub || 'Edit this section with live publish context.'];
    const [title, detail] = actionMap[tab.id] || fallback;
    return { title, detail, fieldCount, toolCount, dirtyCount };
  }

  function renderWorkspaceBanner(tab) {
    const model = tabWorkspaceSummary(tab);
    const changed = changedSections();
    const previewPage = workspacePreviewPage(tab.id);
    const host = document.createElement('section');
    host.className = 'admin-workspace-banner';
    host.innerHTML = `
      <div class="admin-workspace-banner-copy">
        <div class="admin-command-eyebrow">
          <span>${escapeHtml(model.title)}</span>
          <b>${model.dirtyCount ? `${model.dirtyCount} changed` : 'No draft changes'}</b>
        </div>
        <h2>${escapeHtml(tab.title || tab.label)}</h2>
        <p>${escapeHtml(model.detail)}</p>
      </div>
      <div class="admin-workspace-banner-stats" aria-label="${escapeHtml(tab.label)} workspace summary">
        <div><strong>${model.fieldCount}</strong><span>fields</span></div>
        <div><strong>${model.toolCount}</strong><span>tools</span></div>
        <div><strong>${changed.length}</strong><span>staged</span></div>
      </div>
      <div class="admin-workspace-banner-actions">
        ${previewPage ? `<button type="button" class="admin-btn admin-btn-primary" data-workspace-preview>${ICON.eye}<span>Preview</span></button>` : ''}
        <button type="button" class="admin-btn" data-workspace-command>${ICON.search}<span>Command</span></button>
        <button type="button" class="admin-btn" data-workspace-refresh>${ICON.refresh}<span>Refresh</span></button>
      </div>`;
    host.querySelector('[data-workspace-preview]')?.addEventListener('click', () => openDraftPreview(previewPage));
    host.querySelector('[data-workspace-command]')?.addEventListener('click', () => openCommandPalette());
    host.querySelector('[data-workspace-refresh]')?.addEventListener('click', () => {
      loadOpsSummary(true)
        .then(() => {
          toast('Workspace refreshed.', 'success', 1800);
          renderActiveTab();
        })
        .catch(e => toast(e.message, 'error', 5000));
    });
    return host;
  }

  // ── Tab body render ────────────────────────────────────────────────────
  function renderActiveTab() {
    const tab = SCHEMA.find(t => t.id === state.activeTab) || SCHEMA[0];
    const shell = $('#app-shell');
    [...shell.classList].filter(cls => cls.startsWith('admin-shell--tab-')).forEach(cls => shell.classList.remove(cls));
    shell.classList.toggle('admin-shell--jarvis', tab.id === 'jarvis');
    shell.classList.add(`admin-shell--tab-${tab.id}`);
    $('#tab-title').textContent = tab.title || tab.label;
    $('#tab-sub').textContent   = tab.sub;
    const panels = $('#panels');
    panels.innerHTML = '';
    const wideTabs = new Set(['overview', 'security', 'jarvis', 'bellSchedules', 'announcements', 'appearance', 'safety', 'history', 'advanced']);
    panels.className = [
      'admin-panels',
      `admin-panels--${tab.id}`,
      wideTabs.has(tab.id) ? 'admin-panels--wide' : '',
      tab.id === 'appearance' ? 'admin-panels--appearance' : ''
    ].filter(Boolean).join(' ');
    const workspace = document.createElement('div');
    workspace.className = [
      'admin-workspace',
      `admin-workspace--${tab.id}`,
      'admin-workspace--no-rail',
      wideTabs.has(tab.id) ? 'admin-workspace--wide' : ''
    ].filter(Boolean).join(' ');
    const workspaceMain = document.createElement('div');
    workspaceMain.className = 'admin-workspace-main';
    workspace.appendChild(workspaceMain);
    panels.appendChild(workspace);

    if (!['overview', 'security'].includes(tab.id)) {
      workspaceMain.appendChild(renderWorkspaceBanner(tab));
    }

    const q = state.search.trim().toLowerCase();
    const matches = (label) => !q || (label || '').toLowerCase().includes(q);

    let anyVisible = false;
    for (const group of tab.groups) {
      if (group.custom && q && !groupMatchesSearch(tab, group, q)) continue;
      const card = document.createElement('section');
      card.className = 'admin-card';
      if (group.custom === 'jarvisAssistant') card.classList.add('admin-card--jarvis');
      if (group.custom) card.classList.add(`admin-card--${group.custom}`);
      if (group.title) card.classList.add(`admin-card--group-${classSlug(group.title)}`);
      if (tab.id === 'appearance' && group.title) card.classList.add(`admin-appearance-card-${classSlug(group.title)}`);
      card.innerHTML = group.title ? `<h2>${escapeHtml(group.title)}</h2>` : '';

      if (group.custom === 'overviewDashboard')         { card.classList.add('admin-card--flush'); card.appendChild(renderOverviewDashboard()); anyVisible = true; }
      else if (group.custom === 'scheduleQualityPanel') { card.appendChild(renderScheduleQualityPanel()); anyVisible = true; }
      else if (group.custom === 'announcementsQualityPanel') { card.appendChild(renderAnnouncementsQualityPanel()); anyVisible = true; }
      else if (group.custom === 'siteLaunchPanel')      { card.appendChild(renderSiteLaunchPanel()); anyVisible = true; }
      else if (group.custom === 'privacyRiskPanel')     { card.appendChild(renderPrivacyRiskPanel()); anyVisible = true; }
      else if (group.custom === 'historyEvidencePanel') { card.appendChild(renderHistoryEvidencePanel()); anyVisible = true; }
      else if (group.custom === 'advancedIntegrityPanel') { card.appendChild(renderAdvancedIntegrityPanel()); anyVisible = true; }
      else if (group.custom === 'navEditor')            { card.appendChild(renderNavEditor()); anyVisible = true; }
      else if (group.custom === 'jarvisAssistant')      { card.appendChild(renderJarvisAssistant()); anyVisible = true; }
      else if (group.custom === 'siteSecurityCenter')   { card.classList.add('admin-card--flush'); card.appendChild(renderSiteSecurityCenter()); anyVisible = true; }
      else if (group.custom === 'announcementsEditor')  { card.appendChild(renderAnnouncementsEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleOverrideEditor'){ card.appendChild(renderScheduleOverrideEditor()); anyVisible = true; }
      else if (group.custom === 'bellEditor')           { card.appendChild(renderBellEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleImageImport') { card.appendChild(renderScheduleImageImport()); anyVisible = true; }
      else if (group.custom === 'privacyParagraphsEditor'){ card.appendChild(renderPrivacyParagraphsEditor()); anyVisible = true; }
      else if (group.custom === 'analyticsDashboard')   { card.appendChild(renderAnalyticsDashboard()); anyVisible = true; }
      else if (group.custom === 'auditLog')             { card.appendChild(renderAuditLog()); anyVisible = true; }
      else if (group.custom === 'backupManager')        { card.appendChild(renderBackupManager()); anyVisible = true; }
      else if (group.fields) {
        if (q && !groupMatchesSearch(tab, group, q)) continue;
        const visible = group.fields.filter(f => matches(f.label) || matches(f.path) || matches(f.help) || matches(f.kind));
        if (!visible.length) continue;
        anyVisible = true;
        for (const f of visible) card.appendChild(renderField(f));
      }
      workspaceMain.appendChild(card);
    }
    if (!anyVisible && q) {
      workspaceMain.innerHTML = `<div class="admin-card"><div class="admin-field-help">No fields match "${escapeHtml(q)}" on this tab. Other tabs may have matches.</div></div>`;
    }

    refreshDirtyMarkers();
    pushPreview();
    scheduleWorkspaceMasonry(workspaceMain);
  }

  // ── Dirty / publish ────────────────────────────────────────────────────
  function refreshDirtyMarkers() {
    const dirty = !eq(state.settings, state.draft);
    const changed = changedSections();
    const tab = SCHEMA.find(t => t.id === state.activeTab) || SCHEMA[0];
    const readOnly = Boolean(tab.readOnly);
    $('#app-shell')?.classList.toggle('admin-shell--has-unsaved', dirty && !readOnly);
    document.body?.classList.toggle('admin-body--has-unsaved', dirty && !readOnly);
    $('#discard-btn').classList.toggle('hidden', readOnly);
    $('#publish-btn').classList.toggle('hidden', readOnly);
    $('#dirty-pill').classList.toggle('hidden', readOnly);
    $('#dirty-pill').classList.toggle('visible', dirty);
    $('#dirty-pill').textContent = dirty ? `${changed.length || 1} changed ${changed.length === 1 ? 'section' : 'sections'}` : '';
    $('#publish-btn').textContent = dirty ? `Publish ${changed.length || 1}` : 'Publish';
    $('#publish-btn').disabled = readOnly || !dirty;
    $('#discard-btn').disabled = readOnly || !dirty;
    $$('.admin-field').forEach(f => {
      const path = f.dataset.path;
      if (path) f.classList.toggle('is-modified', isModified(path));
    });
  }
  function markDirty() { refreshDirtyMarkers(); }

  function isAcceptableUrl(value, allowRelative = true) {
    const raw = String(value || '').trim();
    if (!raw) return true;
    try {
      const url = new URL(raw, location.origin);
      if (!allowRelative && !/^https?:\/\//i.test(raw)) return false;
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  function collectPublishIssues() {
    const blocking = [];
    const warnings = [];
    const navItems = asArray(state.draft?.nav?.items);
    navItems.forEach((item, index) => {
      const label = String(item?.label || '').trim();
      const href = String(item?.href || '').trim();
      if (!label) blocking.push(`Navigation link ${index + 1} needs a label.`);
      if (!href || href === '#') blocking.push(`Navigation link ${index + 1} needs a real URL or page path.`);
      else if (!isAcceptableUrl(href, true)) blocking.push(`Navigation link ${index + 1} has an invalid URL.`);
    });

    const feedbackUrl = state.draft?.footer?.feedbackUrl;
    if (feedbackUrl && !isAcceptableUrl(feedbackUrl, false)) blocking.push('Feedback URL must be a full http or https URL.');
    const logoLink = state.draft?.branding?.logoLink;
    if (logoLink && !isAcceptableUrl(logoLink, true)) blocking.push('Logo click-through URL is invalid.');
    const prodIframe = String(state.draft?.grades?.iframeUrlProd || '').trim();
    if (prodIframe && !isHttpsUrl(prodIframe)) blocking.push('GradeViewer production URL must use HTTPS.');

    const override = state.draft?.scheduleOverride;
    if (override && !override.date) blocking.push('Active schedule override needs an applies-on date.');
    const schedules = state.draft?.bellSchedules && typeof state.draft.bellSchedules === 'object' ? state.draft.bellSchedules : {};
    for (const [name, map] of Object.entries(schedules)) {
      const rows = Object.entries(map || {}).map(([start, value]) => ({
        start: Number(start),
        end: Number(asArray(value)[0]),
        name: String(asArray(value)[1] || '')
      })).sort((a, b) => a.start - b.start);
      rows.forEach((row, index) => {
        if (!Number.isFinite(row.start) || !Number.isFinite(row.end)) blocking.push(`${name} row ${index + 1} has an invalid time.`);
        if (row.end <= row.start) blocking.push(`${name} row ${index + 1} ends before it starts.`);
        if (!row.name.trim()) warnings.push(`${name} row ${index + 1} has no period name.`);
        const previous = rows[index - 1];
        if (previous && row.start < previous.end) blocking.push(`${name} row ${index + 1} overlaps the previous period.`);
      });
    }

    const paragraphs = asArray(state.draft?.gradeMelon?.privacyParagraphs).map(p => String(p || '').trim()).filter(Boolean);
    if (!paragraphs.length) warnings.push('Privacy modal has no explanatory paragraph.');
    if (normalizedSiteStatus().mode === 'maintenance') warnings.push('Publishing now will show the maintenance page to public visitors.');
    return { blocking, warnings };
  }

  function confirmPublishReview() {
    const issues = collectPublishIssues();
    if (issues.blocking.length) {
      alert(`Fix before publishing:\n\n${issues.blocking.slice(0, 8).join('\n')}`);
      toast('Publish blocked by validation.', 'error', 4200);
      return false;
    }
    if (issues.warnings.length) {
      return confirm(`Publish with these warnings?\n\n${issues.warnings.slice(0, 8).join('\n')}`);
    }
    return true;
  }

  $('#discard-btn').addEventListener('click', () => {
    state.draft = deepClone(state.settings);
    renderActiveTab();
    toast('Discarded local changes', 'success', 1800);
  });

  async function publishDraft(source = 'manual', opts = {}) {
    const btn = $('#publish-btn');
    btn.disabled = true; btn.textContent = 'Publishing...';
    try {
      const patch = buildSettingsPatch(opts.onlyKeys || null);
      if (!Object.keys(patch).length) { toast('Nothing to publish'); return; }
      if (!confirmPublishReview()) return;
      const json = await api('/site-settings', { method: 'PUT', body: JSON.stringify({ patch, source }) });
      state.settings = json.settings;
      state.draft = deepClone(json.settings);
      state.lastPublishResult = json;
      state.lastPublishAt = new Date().toISOString();
      if (json.publicFrontend?.error) {
        toast('Backend saved, but GitHub frontend sync failed: ' + json.publicFrontend.error, 'error', 7000);
      } else if (json.publicFrontend?.enabled === false) {
        toast('Saved in admin. Public site sync needs setup before live changes update automatically.', 'error', 7000);
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
      btn.disabled = false;
      refreshDirtyMarkers();
    }
  }

  $('#publish-btn').addEventListener('click', () => {
    publishDraft('manual').catch(() => {});
  });

  async function retryPublicSync() {
    const btn = $('#overview-public-sync-retry');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Retrying...';
    }
    try {
      const json = await api('/admin/publish-public-settings', { method: 'POST' });
      state.lastPublishResult = json;
      state.lastPublishAt = new Date().toISOString();
      if (json.publicFrontend?.error) {
        toast('GitHub frontend sync failed: ' + json.publicFrontend.error, 'error', 7000);
      } else if (json.publicFrontend?.enabled === false) {
        toast('Public site sync needs setup before live changes update automatically.', 'error', 7000);
      } else {
        toast('Public site settings synced.', 'success', 3500);
      }
      renderActiveTab();
    } catch (e) {
      toast('Public sync retry failed: ' + e.message, 'error', 6000);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Retry public sync';
      }
    }
  }

  function commandEntries() {
    const entries = [];
    for (const tab of SCHEMA) {
      entries.push({ tab: tab.id, type: 'Tab', title: tab.label, detail: tab.sub || tab.title || tab.label, query: '' });
      for (const group of tab.groups || []) {
        const title = group.title || (group.custom ? group.custom.replace(/([A-Z])/g, ' $1').trim() : '');
        if (title) entries.push({ tab: tab.id, type: 'Panel', title, detail: `${tab.label} panel`, query: title, targetClass: group.custom ? `admin-card--${group.custom}` : `admin-card--group-${classSlug(group.title)}` });
        for (const field of group.fields || []) {
          entries.push({ tab: tab.id, type: 'Field', title: field.label, detail: `${tab.label} · ${field.path}`, query: field.label, fieldPath: field.path });
        }
      }
    }
    return entries;
  }

  function ensureCommandPalette() {
    let palette = $('#admin-command-palette');
    if (palette) return palette;
    palette = document.createElement('div');
    palette.id = 'admin-command-palette';
    palette.className = 'admin-command-palette';
    palette.setAttribute('aria-hidden', 'true');
    palette.innerHTML = `
      <div class="admin-command-dialog" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="admin-command-search">
          ${ICON.search}
          <input id="admin-command-input" type="search" autocomplete="off" placeholder="Jump to a tab, panel, or field">
        </div>
        <div id="admin-command-results" class="admin-command-results"></div>
      </div>`;
    palette.addEventListener('click', event => {
      if (event.target === palette) closeCommandPalette();
    });
    document.body.appendChild(palette);
    return palette;
  }

  function closeCommandPalette() {
    const palette = $('#admin-command-palette');
    if (!palette) return;
    palette.classList.remove('open');
    palette.setAttribute('aria-hidden', 'true');
  }

  function openCommandPalette(query = '') {
    const palette = ensureCommandPalette();
    const input = $('#admin-command-input', palette);
    palette.classList.add('open');
    palette.setAttribute('aria-hidden', 'false');
    input.value = query;
    paintCommandPalette();
    requestAnimationFrame(() => input.focus());
  }

  function runCommandEntry(index) {
    const palette = ensureCommandPalette();
    const row = $$('[data-command-index]', palette)[index] || $('[data-command-index]', palette);
    if (!row) return;
    const entry = commandEntries()[Number(row.dataset.commandIndex)];
    if (!entry) return;
    state.search = '';
    const searchInput = $('#search-input');
    if (searchInput) searchInput.value = '';
    goTab(entry.tab);
    closeCommandPalette();
    requestAnimationFrame(() => {
      const target = entry.fieldPath
        ? document.getElementById(fieldElementId(entry.fieldPath))?.closest('.admin-field')
        : entry.targetClass
          ? document.querySelector(`.${entry.targetClass}`)
          : null;
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (entry.fieldPath) document.getElementById(fieldElementId(entry.fieldPath))?.focus({ preventScroll: true });
    });
  }

  function paintCommandPalette() {
    const palette = ensureCommandPalette();
    const input = $('#admin-command-input', palette);
    const results = $('#admin-command-results', palette);
    const query = String(input.value || '').trim().toLowerCase();
    const entries = commandEntries();
    const scored = entries
      .map((entry, index) => ({ entry, index, text: `${entry.type} ${entry.title} ${entry.detail}`.toLowerCase() }))
      .filter(row => !query || row.text.includes(query))
      .slice(0, 12);
    results.innerHTML = scored.map((row, position) => `
      <button type="button" class="admin-command-row ${position === 0 ? 'active' : ''}" data-command-index="${row.index}">
        <span>${escapeHtml(row.entry.type)}</span>
        <strong>${escapeHtml(row.entry.title)}</strong>
        <small>${escapeHtml(row.entry.detail)}</small>
      </button>`).join('') || '<div class="admin-command-empty">No matching admin command.</div>';
    $$('[data-command-index]', results).forEach((btn, position) => {
      btn.addEventListener('click', () => runCommandEntry(position));
    });
  }

  $('#sidebar-collapse-btn')?.addEventListener('click', toggleDesktopSidebar);
  $('#theme-toggle-btn')?.addEventListener('click', toggleThemePreference);
  $('#mobile-sidebar-toggle')?.addEventListener('click', toggleMobileSidebar);
  $('#sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);
  window.addEventListener('resize', () => {
    if (!isMobileSidebarMode()) closeMobileSidebar();
    syncSidebarState();
    scheduleWorkspaceMasonry();
  });
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if (e.key === 'Escape') {
      closeCommandPalette();
      closeMobileSidebar();
    }
    const palette = $('#admin-command-palette');
    if (palette?.classList.contains('open') && e.key === 'Enter') {
      e.preventDefault();
      runCommandEntry(0);
    }
  });
  document.addEventListener('input', e => {
    if (e.target?.id === 'admin-command-input') paintCommandPalette();
  });

  // ── Search ─────────────────────────────────────────────────────────────
  $('#search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    if (state.search) {
      const q = state.search.toLowerCase();
      for (const tab of SCHEMA) {
        const hits = tab.groups.some(g => groupMatchesSearch(tab, g, q));
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
  const TRUSTED_PUBLIC_PREVIEW_HOSTS = new Set(['poolesville.web.app']);
  function isLoopbackHostname(hostname) {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  }
  function isAllowedPublicPreviewUrl(url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return TRUSTED_PUBLIC_PREVIEW_HOSTS.has(url.hostname) || (isLocal && isLoopbackHostname(url.hostname));
  }
  function publicPreviewBase() {
    const candidates = [state.authConfig?.publicSiteUrl, isLocal ? location.origin : '', 'https://poolesville.web.app'];
    for (const candidate of candidates) {
      try {
        const url = new URL(candidate);
        if (!isAllowedPublicPreviewUrl(url)) continue;
        url.pathname = url.pathname.replace(/\/?$/, '/');
        url.search = '';
        url.hash = '';
        return url;
      } catch {}
    }
    return new URL('https://poolesville.web.app/');
  }
  function previewPagePath() {
    return ({
      schedule: 'index.html',
      announcements: 'announcements.html',
      grades: 'gradeviewer.html',
      privacy: 'privacy.html'
    })[state.previewPage] || 'index.html';
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
    $('#preview-host')?.classList.toggle('preview-mobile', state.previewSize === 'mobile');
    $('#preview-frame').src = buildPreviewUrl();
    paintPreviewBar();
  }
  function pushPreview(options = {}) {
    if (!$('#preview-host').classList.contains('open')) return;
    if (state.previewMode !== 'draft') return;
    if (options.requireReady !== false && !_previewReady) return;
    const targetOrigin = previewOrigin();
    if (!targetOrigin) return;
    try {
      $('#preview-frame').contentWindow.postMessage({ type: 'phs:preview-settings', settings: state.draft }, targetOrigin);
    } catch {}
  }
  function previewOrigin() {
    try {
      const url = new URL($('#preview-frame').src, location.href);
      return isAllowedPublicPreviewUrl(url) ? url.origin : null;
    } catch {
      return null;
    }
  }
  function paintPreviewBar() {
    $('#preview-mode-pill').className = 'mode-pill' + (state.previewMode === 'draft' ? ' draft' : '');
    $('#preview-mode-pill').textContent = state.previewMode === 'draft' ? 'Showing draft (un-published)' : 'Showing published version';
    $$('#preview-mode-seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.previewMode));
    $$('#preview-page-seg button').forEach(b => b.classList.toggle('active', b.dataset.previewPage === state.previewPage));
    $$('#preview-size-seg button').forEach(b => b.classList.toggle('active', b.dataset.previewSize === state.previewSize));
  }
  function previewPageForActiveTab() {
    if (state.activeTab === 'announcements') return 'announcements';
    if (state.activeTab === 'advanced') return 'grades';
    if (state.activeTab === 'safety') return 'privacy';
    return 'schedule';
  }
  function openDraftPreview(page, opts = {}) {
    $('#preview-host').classList.add('open');
    state.previewMode = 'draft';
    if (page) state.previewPage = page;
    else if (opts.fromActiveTab) state.previewPage = previewPageForActiveTab();
    try { localStorage.setItem(PREVIEW_PAGE_KEY, state.previewPage); } catch {}
    refreshPreview();
  }
  $('#open-preview-btn').addEventListener('click', () => openDraftPreview());
  $('#preview-close-btn').addEventListener('click', () => { $('#preview-host').classList.remove('open'); });
  $('#preview-refresh-btn').addEventListener('click', refreshPreview);
  $$('#preview-mode-seg button').forEach(b => b.addEventListener('click', () => { state.previewMode = b.dataset.mode; refreshPreview(); }));
  $$('#preview-page-seg button').forEach(b => b.addEventListener('click', () => {
    state.previewPage = b.dataset.previewPage || 'schedule';
    try { localStorage.setItem(PREVIEW_PAGE_KEY, state.previewPage); } catch {}
    refreshPreview();
  }));
  $$('#preview-size-seg button').forEach(b => b.addEventListener('click', () => {
    state.previewSize = b.dataset.previewSize === 'mobile' ? 'mobile' : 'desktop';
    try { localStorage.setItem(PREVIEW_SIZE_KEY, state.previewSize); } catch {}
    refreshPreview();
  }));

  // Iframe signals readiness; we then immediately push the draft.
  window.addEventListener('message', (e) => {
    const targetOrigin = previewOrigin();
    if (!targetOrigin) return;
    if (e.source !== $('#preview-frame')?.contentWindow) return;
    if (e.origin !== targetOrigin) return;
    if (e.data?.type === 'phs:preview-ready') {
      _previewReady = true;
      pushPreview();
    }
  });
  $('#preview-frame')?.addEventListener('load', () => {
    if (state.previewMode === 'draft') setTimeout(() => pushPreview({ requireReady: false }), 100);
  });

  // ── Init ───────────────────────────────────────────────────────────────
  syncThemePreference();
  restoreBearerSession();
  if (isLocal || isBackendHostedAdmin || state.token) bootApp(); else showLogin();
  if (!isLocal) loadAuthConfig();
})();
