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
  const LOCAL_BACKEND = location.protocol === 'file:' ? 'http://localhost:8080' : location.origin;
  const BACKEND = isBackendHostedAdmin ? location.origin : (isLocal ? (location.port === '3000' ? location.origin : LOCAL_BACKEND) : `https://${BACKEND_HOST}`);
  const ADMIN_SESSION_STORAGE_KEY = 'phs:admin-session:v1';
  const IMPORT_STATE_KEY = 'phs:admin-import-assistant:v1';
  const SIDEBAR_COLLAPSED_KEY = 'phs:admin-sidebar-collapsed:v1';
  const ACTIVE_TAB_KEY = 'phs:admin-active-tab:v2';
  const THEME_KEY = 'phs:admin-theme:v1';
  const STYLE_KEY = 'phs:admin-style:v1';
  const PREVIEW_PAGE_KEY = 'phs:admin-preview-page:v2';
  const PREVIEW_SIZE_KEY = 'phs:admin-preview-size:v2';
  const TODAY_VARIANT_KEY = 'phs:admin-today-variant:v1';
  function publicSiteAssetUrl(fileName) {
    const name = String(fileName || '').replace(/^\/+/, '');
    const path = location.pathname || '/';
    if (/\/admin\/(?:index\.html)?$/i.test(path)) return new URL(`../${name}`, location.href).href;
    return new URL(name, location.href).href;
  }
  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    token: null,
    authConfig: null,
    settings: null,    // current saved settings (server)
    defaults: null,
    draft: null,       // working copy with unsaved edits
    lastSavedAt: null,
    lastSaveStatus: 'idle',
    lastSaveError: '',
    identity: null,
    adminHealth: null,
    opsSummary: null,
    opsSummaryLoading: null,
    analyticsSummary: null,
    analyticsSummaryLoading: null,
    analyticsSummaryCheckedAt: 0,
    analyticsRangeDays: 7,
    scheduledJobs: null,
    scheduledJobsLoading: null,
    automationApplyResult: null,
    lunchSummary: null,
    lunchSummaryLoading: null,
    lunchSummaryCheckedAt: 0,
    scheduleData: null,
    scheduleDataLoading: null,
    devControlsEnabled: false,
    lastPublishResult: null,
    lastPublishAt: null,
    securitySnapshot: null,
    securitySnapshotLoading: null,
    securityComposerOpen: false,
    schedulePlannerMonth: null,
    schedulePlannerSelectedDate: null,
    commandActiveIndex: 0,
    theme: loadThemePreference(),
    todayVariant: loadTodayVariantPreference(),
    activeTab: 'overview',
    search: '',
    previewMode: 'draft', // 'draft' | 'live'
    previewPage: loadPreviewPagePreference(),
    previewSize: loadPreviewSizePreference(),
    previewDate: '',
    importAssistant: null,
    jarvis: {
      messages: [
        { role: 'assistant', text: 'Tell me the admin change. I will draft it as a preview first; nothing publishes until you approve it.' }
      ],
      pending: null,
      attachments: [],
      undoStack: [],
      busy: false
    }
  };
  let securityAutoRefreshTimer = null;
  let todayDashboardTimer = null;
  let lastSavedTicker = null;
  let activeSaveRequest = 0;
  let workspaceMasonryFrame = 0;
  const fullscreenWorkbenchPortals = new WeakMap();
  let studioMessageCleanup = null;
  let automationKeyCleanup = null;

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
    automation:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h5l2 3h9"/><path d="M4 17h5l2-3h9"/><circle cx="5" cy="7" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="10" r="2"/><circle cx="19" cy="14" r="2"/></svg>`,
    fullscreen:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg>`,
    duplicate:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 012-2h10"/></svg>`,
    cursor:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l7.5 17 2.5-7 7-2.5L4 3z"/></svg>`,
    info:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`,
  };

  // ── Schema (drives the entire UI) ──────────────────────────────────────
  const SCHEMA = [
    { id: 'today', label: 'Today', title: 'Today', icon: 'analytics', section: 'Control',
      sub: 'Live schedule, next bell, draft count, and publish state in one place.',
      groups: [{ title: '', custom: 'todayDashboard' }]
    },
    { id: 'jarvis', label: 'Jarvis', title: 'Jarvis', icon: 'jarvis', section: 'Control',
      sub: 'AI drafting for safe admin changes. Review the draft before anything publishes.',
      groups: [{ title: '', custom: 'jarvisAssistant' }]
    },
    { id: 'availability', label: 'Availability', title: 'Availability', icon: 'privacy', section: 'Control',
      sub: 'Set the public site live or maintenance state.',
      groups: [{ title: 'Public site mode', custom: 'availabilityEditor' }]
    },
    { id: 'bellSchedules',label: 'Schedule', title: 'Schedule', icon: 'bell', section: 'Workflows',
      sub: 'Plan future dates, change today, and edit reusable bell templates.',
      groups: [
        { title: 'Recurring rules', custom: 'scheduleRulesEditor' },
        { title: 'Schedule planner', custom: 'schedulePlanner' },
        { title: 'Active override', custom: 'scheduleOverrideEditor' },
        { title: 'Schedule Studio', custom: 'scheduleStudio' },
        { title: 'Reusable schedules', custom: 'bellEditor' },
        { title: 'Custom schedule from image', custom: 'scheduleImageImport' }
      ]
    },
    { id: 'announcements',label: 'Announcements', icon: 'announce', section: 'Workflows',
      sub: 'Cards shown on the announcements page.',
      groups: [
        { title: 'Cards', custom: 'announcementsEditor' }
      ]
    },
    { id: 'appearance', label: 'Site', title: 'Site controls', icon: 'theme', section: 'Workflows',
      sub: 'Branding, navigation, page copy, public identity, and footer content.',
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
        ]},{
        title: 'Core metadata', fields: [
          { path: 'version', label: 'Settings version', kind: 'number', min: 1, max: 99, step: 1 },
        ]},{
        title: 'GradeViewer iframe', fields: [
          { path: 'grades.iframeUrlLocal', label: 'Local-development URL', kind: 'url', help: 'Used when site runs on localhost.' },
          { path: 'grades.iframeUrlProd',  label: 'Production URL',         kind: 'url' },
          { path: 'grades.pageTitle',      label: 'Browser-tab title',      kind: 'text' },
        ]},{
        title: 'Countdown labels', fields: [
          { path: 'countdown.minSuffix', label: 'Minute suffix', kind: 'text', max: 12 },
          { path: 'countdown.secondsAriaLabel', label: 'Seconds aria label', kind: 'text', max: 80 },
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
    },
    { id: 'safety', label: 'Privacy', title: 'Privacy', icon: 'privacy', section: 'Workflows',
      sub: 'Privacy text, GradeViewer copy, and policy-sensitive settings.',
      groups: [{
        title: 'Privacy / Safety FAQ', fields: [
          { path: 'gradeMelon.privacyButtonLabel', label: 'Link button label', kind: 'text' },
          { path: 'gradeMelon.privacyTitle',       label: 'Modal title',       kind: 'text' },
          { path: 'gradeMelon.privacyDoneLabel',   label: 'Close-button label',kind: 'text' },
        ]},{
        title: 'Modal paragraphs', custom: 'privacyParagraphsEditor'
      }]
    },
    { id: 'history', label: 'History', title: 'History and rollback', icon: 'backup', section: 'System',
      sub: 'Recent admin actions and published backups.',
      groups: [{
        title: 'Recent events', custom: 'auditLog'
      },{
        title: 'Published versions', custom: 'backupManager'
      }]
    },
    { id: 'automations', label: 'Automations', title: 'Automations', icon: 'automation', section: 'System',
      sub: 'Scheduled rules that stage or publish changes when the site is next opened.',
      groups: [{ title: 'Rules engine', custom: 'automationsEngine' }]
    },
    { id: 'advanced', label: 'Theme Studio', title: 'Theme Studio', icon: 'theme', section: 'System',
      sub: 'Click any element on the live page to restyle it — colors, size, type, and material.',
      groups: [{
        title: 'Theme Studio', custom: 'themeStudio'
      }]
    }
  ];

  const VALID_TAB_IDS = new Set(SCHEMA.map(tab => tab.id));
  state.activeTab = loadActiveTabPreference();

  const PUBLIC_SETTINGS_KEYS = [
    'version',
    'branding',
    'nav',
    'hero',
    'countdown',
    'footer',
    'grades',
    'theme',
    'appearance',
    'announcements',
    'privacy',
    'bellSchedules',
    'scheduleRules',
    'gradeMelon',
    'siteStatus',
    'scheduleOverride'
  ];
  const ADMIN_METADATA_SETTINGS_KEYS = ['themePresets', 'automations'];
  const BACKEND_SETTINGS_KEYS = [...PUBLIC_SETTINGS_KEYS, ...ADMIN_METADATA_SETTINGS_KEYS];
  const sanitizeSettingsKeys = (keys, allowedKeys = BACKEND_SETTINGS_KEYS) => {
    if (!keys) return allowedKeys.slice();
    const incoming = keys instanceof Set ? [...keys] : Array.from(keys || []);
    return incoming.filter(key => allowedKeys.includes(key));
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const deepClone = (o) => JSON.parse(JSON.stringify(o));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let uniqueIdCounter = 0;
  function settingsEq(a, b) {
    const clean = value => {
      const copy = deepClone(value || {});
      delete copy.updatedAt;
      return copy;
    };
    return eq(clean(a), clean(b));
  }
  const BLOCKED_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  function isNil(value) {
    return value === null || value === undefined;
  }
  function isPresent(value) {
    return value !== null && value !== undefined;
  }
  function get(obj, path) { return String(path || '').split('.').reduce((o, k) => (isNil(o) ? o : o[k]), obj); }
  function set(obj, path, val) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!obj || !parts.length || parts.some(part => BLOCKED_PATH_KEYS.has(part))) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (isNil(cur[part]) || typeof cur[part] !== 'object') cur[part] = {};
      cur = cur[part];
    }
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
  function renderLoadingState(label = 'Loading') {
    return `
      <div class="admin-skeleton-state" aria-live="polite" aria-busy="true">
        <span>${escapeHtml(label)}</span>
        <i></i><i></i><i></i>
      </div>`;
  }
  function cssEscape(s) {
    if (window.CSS?.escape) return window.CSS.escape(String(s ?? ''));
    return String(s ?? '').replace(/["\\]/g, '\\$&');
  }
  function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }
  function uniqueId(prefix = 'item') {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    try {
      const bytes = new Uint32Array(2);
      window.crypto?.getRandomValues?.(bytes);
      if (bytes[0] || bytes[1]) return `${prefix}-${bytes[0].toString(36)}${bytes[1].toString(36)}`;
    } catch {}
    uniqueIdCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${uniqueIdCounter.toString(36)}`;
  }
  function readStorageJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : deepClone(fallback);
    } catch {
      return deepClone(fallback);
    }
  }
  function writeStorageJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
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

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  }

  function syncThemePreference() {
    const dark = state.theme === 'dark';
    document.body?.classList.toggle('admin-theme-dark', dark);
    document.documentElement?.classList.toggle('admin-theme-dark', dark);
    document.documentElement?.style.setProperty('color-scheme', dark ? 'dark' : 'light');
    const btn = $('#theme-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.innerHTML = `${dark ? ICON.sun : ICON.moon}<span>${dark ? 'Light' : 'Dark'}</span>`;
    }
  }

  function persistThemePreference() {
    try { localStorage.setItem(THEME_KEY, state.theme); } catch {}
  }

  function persistStylePreference() {
    try { localStorage.setItem(STYLE_KEY, state.style); } catch {}
  }

  function toggleThemePreference() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    if (state.theme === 'light' && state.style === 'atelier') {
      state.style = 'classic';
      persistStylePreference();
    }
    persistThemePreference();
    syncThemePreference();
    syncStylePreference();
  }

  function loadStylePreference() {
    try {
      const saved = localStorage.getItem(STYLE_KEY);
      if (saved === 'atelier' || saved === 'classic') return saved;
    } catch {}
    return 'classic';
  }

  function syncStylePreference() {
    const atelier = state.style === 'atelier';
    document.body?.classList.toggle('admin-style-atelier', atelier);
    document.documentElement?.classList.toggle('admin-style-atelier', atelier);
    const btn = $('#style-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', String(atelier));
      btn.setAttribute('title', atelier ? 'Switch to Classic style' : 'Switch to Atelier style');
      btn.innerHTML = `<span class="admin-style-dot" aria-hidden="true"></span><span>${atelier ? 'Atelier' : 'Classic'}</span>`;
    }
  }

  function toggleStylePreference() {
    state.style = state.style === 'atelier' ? 'classic' : 'atelier';
    if (state.style === 'atelier' && state.theme !== 'dark') {
      state.theme = 'dark';
      persistThemePreference();
      syncThemePreference();
    }
    persistStylePreference();
    syncStylePreference();
  }

  function loadActiveTabPreference() {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_KEY);
      return VALID_TAB_IDS.has(saved) ? saved : 'today';
    } catch {
      return 'today';
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

  function loadTodayVariantPreference() {
    const allowed = new Set(['a', 'b']);
    try {
      const query = new URLSearchParams(location.search).get('todayVariant')?.toLowerCase();
      if (allowed.has(query)) {
        localStorage.setItem(TODAY_VARIANT_KEY, query);
        return query;
      }
      const saved = localStorage.getItem(TODAY_VARIANT_KEY)?.toLowerCase();
      return allowed.has(saved) ? saved : 'a';
    } catch {
      return 'a';
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
        throw new Error(`Could not reach the backend at ${target}. Make sure the backend AI service is configured.`);
      }
      throw new Error(`Could not reach the backend at ${target}.`);
    }
    if (res.status === 401) {
      state.token = null;
      clearBearerSession();
      if (!silentAuth) showLogin('Session expired — sign in again.');
      const error = new Error('Unauthorized');
      error.status = 401;
      error.path = path;
      throw error;
    }
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { error: apiTextErrorMessage(text, res, path) }; }
    if (!res.ok) {
      const error = new Error(json.error || ('HTTP ' + res.status));
      error.status = res.status;
      error.path = path;
      throw error;
    }
    return json;
  }

  function apiTextErrorMessage(text, res, path) {
    const body = String(text || '').trim();
    const status = res?.status ? `HTTP ${res.status}` : 'backend error';
    const htmlError = /^<!doctype html/i.test(body) || /^<html/i.test(body) || /<pre>Cannot\s/i.test(body);
    if (htmlError) {
      if (String(path || '').startsWith('/admin/scheduled-jobs')) {
        return 'Scheduled jobs are not available on this backend deployment yet.';
      }
      return `Backend returned an HTML error page for ${path || 'this request'} (${status}).`;
    }
    return body || status;
  }

  function adminNoCacheUrl(path) {
    const url = new URL(BACKEND + path);
    url.searchParams.set('_adminNoCache', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    return url.toString();
  }

  async function fetchAdminJson(path) {
    const headers = { Accept: 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    const res = await fetch(adminNoCacheUrl(path), {
      cache: 'no-store',
      credentials: 'include',
      headers
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { error: apiTextErrorMessage(text, res, path) }; }
    if (!res.ok) {
      const error = new Error(json.error || ('HTTP ' + res.status));
      error.status = res.status;
      error.path = path;
      throw error;
    }
    return json;
  }

  function normalizeSettingsPair(settings, defaults) {
    settings.scheduleRules = asArray(settings.scheduleRules);
    defaults.scheduleRules = asArray(defaults.scheduleRules);
    if (!Array.isArray(settings.themePresets)) settings.themePresets = asArray(settings.themePresets);
    defaults.themePresets = asArray(defaults.themePresets);
    settings.automations = asArray(settings.automations);
    defaults.automations = asArray(defaults.automations);
    return { settings, defaults };
  }

  async function loadSettingsPair() {
    const [settings, defaults] = await Promise.all([
      fetchAdminJson('/admin/site-settings'),
      fetchAdminJson('/site-settings/defaults')
    ]);
    return normalizeSettingsPair(settings, defaults);
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

  function undoToast(message, undo, ms = 6000) {
    const host = $('#toast-host');
    const el = document.createElement('div');
    el.className = 'admin-toast admin-toast--undo';
    el.style.setProperty('--undo-ms', `${ms}ms`);
    el.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button">Undo</button>
      <i aria-hidden="true"></i>`;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s';
      setTimeout(() => el.remove(), 260);
    };
    el.querySelector('button')?.addEventListener('click', () => {
      try { undo?.(); } finally { close(); }
    });
    host.appendChild(el);
    setTimeout(close, ms);
  }

  // ── Login / boot ───────────────────────────────────────────────────────
  function clearBearerSession() {
    try { sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
  }
  function saveBearerSession(token) {
    clearBearerSession();
    if (!token) return;
    try { sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, token); } catch {}
  }
  function showLogin(errorMsg) {
    state.token = null;
    clearBearerSession();
    $('#app-shell').classList.add('hidden');
    $('#login-shell').classList.remove('hidden');
    if (errorMsg) $('#login-error').textContent = errorMsg;
  }
  function showStartupError(errorMsg) {
    $('#app-shell').classList.add('hidden');
    $('#login-shell').classList.remove('hidden');
    $('#login-error').textContent = errorMsg || 'Admin startup failed after sign-in.';
    setLoginStatus('Your Google session is saved. Fix the startup error, then retry.', { retry: true });
  }
  function showApp() {
    $('#login-shell').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
    syncSidebarState();
  }

  function ensureAdminCanvas() {
    if ($('#admin-canvas')) return;
    const canvas = document.createElement('div');
    canvas.id = 'admin-canvas';
    canvas.className = 'admin-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.innerHTML = `
      <div class="admin-orb admin-orb--1"></div>
      <div class="admin-orb admin-orb--2"></div>
      <div class="admin-canvas-grid"></div>
      <div class="admin-canvas-glow"></div>
      <div class="admin-canvas-noise"></div>
    `;
    document.body.prepend(canvas);
  }

  function observeScrollReveals(root = document) {
    const nodes = [...(root.querySelectorAll?.('.ad-pagehead, .ad-card, .admin-card, .admin-today > *, .admin-backend-tile, .admin-usage-chart, .admin-usage-dim-card') || [])];
    if (!nodes.length) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      nodes.forEach(node => node.classList.add('admin-reveal-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('admin-reveal-visible');
        entry.target.dataset.revealed = '1';
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    nodes.forEach((node, index) => {
      if (node.dataset.revealed === '1') {
        node.classList.add('admin-reveal-visible');
        return;
      }
      node.classList.add('admin-reveal');
      node.style.setProperty('--reveal-i', String(Math.min(index, 10)));
      observer.observe(node);
    });
  }

  function restoreBearerSession() {
    try {
      const token = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
      if (token) state.token = token;
    } catch {}
    try { localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
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
          ? 'Local admin uses the backend bypass. Start the backend on http://127.0.0.1:8080, then retry.'
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(json.error ? `Google login failed: ${json.error}` : 'Google login failed.');
        error.status = res.status;
        throw error;
      }
      state.token = json.token || null;
      saveBearerSession(state.token);
      setLoginStatus('Opening admin session...', { retry: false });
      const who = await waitForAdminSession();
      await bootApp(who);
    } catch (ex) {
      showLogin(ex.message || 'This Google account is not authorized.');
      if (window.google?.accounts?.id) {
        try { window.google.accounts.id.disableAutoSelect(); } catch {}
      }
    }
  }

  $('#logout-btn').addEventListener('click', async () => {
    if (!confirmLeaveWithUnpublished('Sign out anyway?')) return;
    try { await api('/admin/logout', { method: 'POST' }); } catch {}
    state.token = null;
    clearBearerSession();
    showLogin('Signed out.');
    loadAuthConfig();
  });

  $('#login-retry-btn')?.addEventListener('click', () => {
    if (isLocal || state.token) bootApp();
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
        ? 'Google sign-in completed, but the admin session was not accepted by the backend.'
        : (lastError?.message || 'Admin session could not be confirmed.')
    );
  }

  async function bootApp(existingWho) {
    try {
      const who = existingWho || await api('/admin/whoami');
      state.identity = who.identity || null;
      state.devControlsEnabled = Boolean(who.devControlsEnabled);
      state.automationApplyResult = await api('/admin/scheduled-jobs/apply-due', { method: 'POST', silentAuth: true }).catch(() => null);
      const { settings, defaults } = await loadSettingsPair();
      state.settings = settings;
      state.defaults = defaults;
      state.draft = deepClone(settings);
      state.importAssistant = loadImportAssistantState();
      showApp();
      renderSidebar();
      renderActiveTab({ animate: true });
      renderAdminIdentity();
      if (state.automationApplyResult?.applied?.length) {
        toast(`${state.automationApplyResult.applied.length} automation${state.automationApplyResult.applied.length === 1 ? '' : 's'} applied on load.`, 'success', 4200);
      }
      pingConnection();
      syncSecurityAutoRefresh();
    } catch (e) {
      console.warn('boot error', e);
      const backendUnreachable = /Could not reach the backend/i.test(String(e?.message || ''));
      if (isLocal && !state.token && backendUnreachable) {
        showLogin('Local backend is not reachable at http://127.0.0.1:8080.');
        state.authConfig = { localBypassEnabled: true };
        configureGoogleLogin();
      } else if (e?.status === 401 || e?.message === 'Unauthorized') {
        showLogin('Session expired. Sign in with Google again.');
        loadAuthConfig();
      } else {
        showStartupError(`Admin session opened, but startup failed: ${e?.message || 'Unknown startup error.'}`);
      }
    }
  }
  function pingConnection() {
    loadOpsSummary(true)
      .then(j => {
        const el = $('#conn-status');
        el.classList.remove('offline');
        el.textContent = 'Ops online · ' + (j?.storage?.settings?.type || 'settings ready');
        if (['today', 'availability', 'history', 'safety'].includes(state.activeTab)) renderActiveTab();
      })
      .catch(() => {
        state.adminHealth = null;
        state.opsSummary = null;
        const el = $('#conn-status');
        el.classList.add('offline');
        el.textContent = 'Admin health offline';
        if (['today', 'availability'].includes(state.activeTab)) renderActiveTab();
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
      themePresets: 'Site',
      appearance: 'Site',
      footer: 'Site',
      countdown: 'Advanced',
      announcements: 'Announcements',
      bellSchedules: 'Schedule',
      scheduleRules: 'Schedule',
      scheduleOverride: 'Schedule',
      automations: 'Automations',
      privacy: 'Privacy',
      gradeMelon: 'Privacy',
      siteStatus: 'Availability',
      grades: 'Advanced'
    })[key] || key;
  }

  function hasClientDraftChanges() {
    return Boolean(state.settings && state.draft && !settingsEq(draftSettingsView(state.settings), draftSettingsView(state.draft)));
  }

  function hasUnpublishedDraftChanges() {
    return Boolean(state.defaults && state.draft && !settingsEq(publicSettingsView(state.defaults), publicSettingsView(state.draft)));
  }

  function publicSettingsView(settings) {
    return settingsView(settings, PUBLIC_SETTINGS_KEYS);
  }

  function draftSettingsView(settings) {
    return settingsView(settings, BACKEND_SETTINGS_KEYS);
  }

  function settingsView(settings, keys) {
    const out = {};
    for (const key of keys) {
      if (settings?.[key] !== undefined) out[key] = settings[key];
    }
    return out;
  }

  function changedSections(base = state.defaults, next = state.draft) {
    if (!base || !next) return [];
    return PUBLIC_SETTINGS_KEYS
      .filter(k => !eq(base[k], next[k]))
      .map(sectionLabelForKey)
      .filter((label, idx, arr) => arr.indexOf(label) === idx);
  }

  function changedTopLevelKeys(base = state.defaults, next = state.draft) {
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(next || {})]);
    return [...keys].filter(k => k !== 'updatedAt' && !eq(base?.[k], next?.[k]));
  }

  function buildDiscardDraftPatch() {
    const patch = {};
    for (const key of BACKEND_SETTINGS_KEYS) {
      const defaultValue = state.defaults?.[key] !== undefined
        ? state.defaults[key]
        : ADMIN_METADATA_SETTINGS_KEYS.includes(key) ? [] : undefined;
      if (defaultValue === undefined) continue;
      if (!eq(state.settings?.[key], defaultValue) || !eq(state.draft?.[key], defaultValue)) {
        patch[key] = deepClone(defaultValue);
      }
    }
    return patch;
  }

  function buildPatchFromBase(base, allowedKeys = null) {
    const patch = {};
    const allow = allowedKeys ? new Set(allowedKeys) : null;
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(state.draft || {})]);
    for (const k of keys) {
      if (k === 'updatedAt') continue;
      if (allow && !allow.has(k)) continue;
      if (!BACKEND_SETTINGS_KEYS.includes(k)) continue;
      if (state.draft?.[k] === undefined) continue;
      if (!eq(base?.[k], state.draft?.[k])) patch[k] = state.draft[k];
    }
    return patch;
  }

  function buildSettingsPatch(allowedKeys = null) {
    return buildPatchFromBase(state.settings, sanitizeSettingsKeys(allowedKeys));
  }

  function buildPublishPatch(allowedKeys = null) {
    return buildPatchFromBase(state.defaults, sanitizeSettingsKeys(allowedKeys, PUBLIC_SETTINGS_KEYS));
  }

  function fieldElementId(path) {
    return fieldId(path);
  }

  function backupTimestamp(backup) {
    return backup?.ts || backup?.createdAt || backup?.timestamp || backup?.time || null;
  }

  function goTab(tabId) {
    if (!VALID_TAB_IDS.has(tabId) || tabId === state.activeTab) return;
    dismissActiveTour(false);
    state.activeTab = tabId;
    saveActiveTabPreference(tabId);
    closeMobileSidebar();
    renderSidebar();
    renderActiveTab({ animate: true });  // animate=true → skip scroll preservation (this is a tab switch)
    resetMainScroll();
    syncSecurityAutoRefresh();
    if (tabId === 'availability') loadSecuritySnapshot(true).catch(e => toast(e.message, 'error', 5000));
  }

  function resetMainScroll() {
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  function preserveScrollWhile(update) {
    const scroller = document.scrollingElement || document.documentElement;
    const left = window.scrollX || scroller.scrollLeft || 0;
    const top = window.scrollY || scroller.scrollTop || 0;
    const restore = () => {
      scroller.scrollLeft = left;
      scroller.scrollTop = top;
      document.documentElement.scrollLeft = left;
      document.documentElement.scrollTop = top;
      document.body.scrollLeft = left;
      document.body.scrollTop = top;
    };
    update();
    restore();
    requestAnimationFrame(restore);
    requestAnimationFrame(() => requestAnimationFrame(restore));
    setTimeout(restore, 80);
    setTimeout(restore, 180);
    setTimeout(restore, 360);
    setTimeout(restore, 700);
  }

  function scheduleWorkspaceMasonry(container = document.querySelector('.admin-workspace-main')) {
    if (!container || !container.classList.contains('admin-workspace-main')) return;
    cancelAnimationFrame(workspaceMasonryFrame);
    workspaceMasonryFrame = requestAnimationFrame(() => {
      const cards = [...container.children].filter(el => el.classList.contains('admin-card') || el.classList.contains('ad-card'));
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

  function setWorkbenchFullscreen(host, enabled) {
    if (!host) return;
    const isEnabled = Boolean(enabled);
    let entry = fullscreenWorkbenchPortals.get(host);
    if (isEnabled && !entry) {
      const marker = document.createComment('admin-workbench-fullscreen');
      const card = host.closest('.admin-card, .ad-card');
      host.parentNode?.insertBefore(marker, host);
      fullscreenWorkbenchPortals.set(host, { marker, card });
      document.body.appendChild(host);
      entry = fullscreenWorkbenchPortals.get(host);
    }
    const card = entry?.card || host.closest('.admin-card, .ad-card');
    host.classList.toggle('is-fullscreen', isEnabled);
    card?.classList.toggle('admin-card--fullscreen-host', isEnabled);
    document.body.classList.toggle('admin-canvas-fullscreen', isEnabled);
    host.querySelectorAll('[data-theme-fullscreen], [data-automation-fullscreen]').forEach(button => {
      button.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
      const label = button.querySelector('span');
      if (label) label.textContent = isEnabled ? 'Exit fullscreen' : 'Fullscreen';
    });
    if (isEnabled && host.requestFullscreen && document.fullscreenElement !== host) {
      host.requestFullscreen({ navigationUI: 'hide' })
        .then(() => host.dataset.fullscreenMode = 'native')
        .catch(() => host.dataset.fullscreenMode = 'fixed');
    } else if (!isEnabled && document.fullscreenElement === host && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    if (!isEnabled && entry) {
      delete host.dataset.fullscreenMode;
      if (entry.marker?.parentNode) entry.marker.parentNode.insertBefore(host, entry.marker);
      entry.marker?.remove();
      entry.card?.classList.remove('admin-card--fullscreen-host');
      fullscreenWorkbenchPortals.delete(host);
    }
    refreshWorkspaceLayoutSoon();
  }

  function toggleWorkbenchFullscreen(host) {
    setWorkbenchFullscreen(host, !host?.classList.contains('is-fullscreen'));
  }

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    document.querySelectorAll('.admin-object-workbench-host.is-fullscreen').forEach(host => {
      setWorkbenchFullscreen(host, false);
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const fullscreenHosts = Array.from(document.querySelectorAll('.admin-object-workbench-host.is-fullscreen'));
    if (!fullscreenHosts.length) return;
    fullscreenHosts.forEach(host => setWorkbenchFullscreen(host, false));
  }, true);

  function syncSecurityAutoRefresh() {
    if (state.activeTab !== 'availability') {
      if (securityAutoRefreshTimer) {
        clearInterval(securityAutoRefreshTimer);
        securityAutoRefreshTimer = null;
      }
      return;
    }
    if (securityAutoRefreshTimer) return;
    securityAutoRefreshTimer = setInterval(() => {
      if (state.activeTab !== 'availability') {
        syncSecurityAutoRefresh();
        return;
      }
      if (!state.securitySnapshotLoading) {
        loadSecuritySnapshot(true).catch(e => toast(e.message, 'error', 5000));
      }
    }, 45_000);
  }

  function classSlug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  }

  const CUSTOM_SEARCH_TERMS = {
    todayDashboard: 'today live schedule next bell countdown unpublished changes publish preview last publish',
    availabilityEditor: 'availability maintenance live site status pause restore public mode',
    scheduleRulesEditor: 'schedule rules recurring weekday date range bulk advisory early release',
    schedulePlanner: 'schedule planner calendar future date early release assembly exam no school',
    scheduleStudio: 'schedule studio timeline bell periods drag boundary conflict gap template',
    themeStudio: 'theme studio presets colors typography spacing radius live preview appearance',
    navEditor: 'navigation nav links menu',
    announcementsEditor: 'announcement cards bullets show from expire on scheduled',
    scheduleOverrideEditor: 'active override schedule type today no school advisory early release',
    bellEditor: 'bell schedule periods times reusable',
    scheduleImageImport: 'image import extract schedule photo ocr',
    privacyParagraphsEditor: 'privacy modal paragraphs faq copy',
    analyticsDashboard: 'analytics studio visits pages devices hours traffic csv ga4',
    auditLog: 'audit log history events filter csv',
    backupManager: 'backups rollback restore versions snapshots visual diff compare',
    automationsEngine: 'automations scheduled jobs rules weekday date time publish maintenance announcement',
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
      today: changed,
      availability: ['Availability'],
      bellSchedules: ['Schedule'],
      announcements: ['Announcements'],
      appearance: ['Site'],
      safety: ['Privacy'],
      automations: ['Automations'],
      advanced: ['Advanced']
    };
    const labels = byTab[tab.id] || [];
    return changed.filter(label => labels.includes(label)).length;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isHttpsUrl(value) {
    try {
      return new URL(String(value || '')).protocol === 'https:';
    } catch {
      return false;
    }
  }

  function formatSecurityDate(value) {
    if (!value) return 'No timestamp';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

  function loadAnalyticsSummary(force = false) {
    if (state.analyticsSummaryLoading) return state.analyticsSummaryLoading;
    const recent = state.analyticsSummaryCheckedAt && Date.now() - state.analyticsSummaryCheckedAt < 60_000;
    if (!force && recent && state.analyticsSummary) return Promise.resolve(state.analyticsSummary);

    state.analyticsSummaryLoading = api('/admin/analytics', { silentAuth: true })
      .then(summary => {
        state.analyticsSummary = summary || {};
        state.analyticsSummaryCheckedAt = Date.now();
        return state.analyticsSummary;
      })
      .finally(() => {
        state.analyticsSummaryLoading = null;
      });
    return state.analyticsSummaryLoading;
  }

  function loadScheduledJobs(force = false) {
    if (state.scheduledJobsLoading) return state.scheduledJobsLoading;
    if (!force && state.scheduledJobs) return Promise.resolve(state.scheduledJobs);
    state.scheduledJobsLoading = api('/admin/scheduled-jobs', { silentAuth: true })
      .then(summary => {
        state.scheduledJobs = summary || { jobs: [], fallbackMode: true };
        return state.scheduledJobs;
      })
      .catch(error => {
        state.scheduledJobs = {
          ok: false,
          fallbackMode: true,
          unavailable: true,
          jobs: [],
          error: error.message || 'Scheduled jobs are not available on this backend deployment yet.'
        };
        return state.scheduledJobs;
      })
      .finally(() => {
        state.scheduledJobsLoading = null;
      });
    return state.scheduledJobsLoading;
  }

  function loadLunchSummary(force = false) {
    if (state.lunchSummaryLoading) return state.lunchSummaryLoading;
    const recent = state.lunchSummaryCheckedAt && Date.now() - state.lunchSummaryCheckedAt < 10 * 60_000;
    if (!force && recent && state.lunchSummary) return Promise.resolve(state.lunchSummary);

    state.lunchSummaryLoading = api('/weather/lunch', { silentAuth: true })
      .then(summary => {
        state.lunchSummary = summary || {};
        state.lunchSummaryCheckedAt = Date.now();
        return state.lunchSummary;
      })
      .catch(error => {
        state.lunchSummary = { ok: false, error: error.message || 'Lunch weather unavailable' };
        state.lunchSummaryCheckedAt = Date.now();
        return state.lunchSummary;
      })
      .finally(() => {
        state.lunchSummaryLoading = null;
      });
    return state.lunchSummaryLoading;
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
      if (['availability', 'today', 'safety', 'history'].includes(state.activeTab)) renderActiveTab();
    });
    return state.securitySnapshotLoading;
  }

  function loadScheduleData(force = false) {
    if (state.scheduleDataLoading) return state.scheduleDataLoading;
    if (state.scheduleData && !force) return Promise.resolve(state.scheduleData);
    const url = publicSiteAssetUrl('data.json');
    state.scheduleDataLoading = fetch(url, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`Schedule data HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        state.scheduleData = json;
        return json;
      })
      .finally(() => {
        state.scheduleDataLoading = null;
      });
    return state.scheduleDataLoading;
  }

  function isoToLocalDate(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function dateToISODate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function scheduleDateKey(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function isWeekendDate(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  function dateOverrideMap(settings = state.draft, create = false) {
    if (!settings) return {};
    if (!settings.bellSchedules || typeof settings.bellSchedules !== 'object' || Array.isArray(settings.bellSchedules)) {
      if (!create) return {};
      settings.bellSchedules = {};
    }
    const map = settings.bellSchedules._dateOverrides;
    if (map && typeof map === 'object' && !Array.isArray(map)) return map;
    if (!create) return {};
    settings.bellSchedules._dateOverrides = {};
    return settings.bellSchedules._dateOverrides;
  }

  function isNonInstructionalScheduleType(type) {
    return /\b(no school|holiday|closure|closed)\b/i.test(String(type || ''));
  }

  function baseScheduleEntryForDate(iso) {
    const date = isoToLocalDate(iso);
    const scheduleData = state.scheduleData;
    if (!date || !scheduleData) return null;
    const key = scheduleDateKey(date);
    if (scheduleData[key]) return scheduleData[key];
    return isWeekendDate(date) ? ['No School', {}] : scheduleData.base;
  }

  function nextInstructionalDateLabel(from = new Date()) {
    if (!state.scheduleData) return 'See you next school day';
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (let i = 1; i <= 21; i++) {
      const cursor = new Date(start);
      cursor.setDate(start.getDate() + i);
      const entry = baseScheduleEntryForDate(dateToISODate(cursor));
      if (!entry || isNonInstructionalScheduleType(entry[0])) continue;
      if (i === 1) return 'See you tomorrow';
      const weekday = cursor.toLocaleDateString([], { weekday: 'long' });
      return weekday ? `See you ${weekday}` : 'See you next school day';
    }
    return 'See you next school day';
  }

  function templateForScheduleType(type, settings = state.draft) {
    const templates = settings?.bellSchedules || {};
    const direct = templates[type];
    if (direct && typeof direct === 'object' && !Array.isArray(direct) && Object.keys(direct).length) return direct;
    return null;
  }

  function resolveScheduleForDate(iso, settings = state.draft) {
    const baseEntry = baseScheduleEntryForDate(iso);
    const resolved = window.PhsScheduleResolver?.resolveScheduleType
      ? window.PhsScheduleResolver.resolveScheduleType(iso, settings, baseEntry?.[0] || 'Unknown')
      : { type: dateOverrideMap(settings)[iso] || baseEntry?.[0] || 'Unknown', source: dateOverrideMap(settings)[iso] ? 'manual' : 'default', rule: null };
    const type = resolved.type || baseEntry?.[0] || 'Unknown';
    let periods = {};
    const template = templateForScheduleType(type, settings);
    if (template) periods = template;
    else if (isNonInstructionalScheduleType(type)) periods = {};
    else if (resolved.source !== 'default') {
      const matchingDataEntry = Object.values(state.scheduleData || {}).find(entry => Array.isArray(entry) && entry[0] === type);
      periods = matchingDataEntry?.[1] || baseEntry?.[1] || {};
    } else {
      periods = baseEntry?.[1] || {};
    }
    return {
      iso,
      type,
      periods,
      baseType: baseEntry?.[0] || 'Unknown',
      overrideType: resolved.source !== 'default' ? type : '',
      source: ({
        manual: 'Planned',
        active: 'Active override',
        'rule-date': 'Rule',
        'rule-range': 'Rule',
        'rule-weekday': 'Rule'
      })[resolved.source] || 'Default',
      rule: resolved.rule || null,
      ruleSource: resolved.source || 'default'
    };
  }

  function scheduleRows(periods) {
    return Object.entries(periods || {})
      .map(([start, value]) => ({
        start: Number(start),
        end: Number(asArray(value)[0]),
        name: String(asArray(value)[1] || '')
      }))
      .filter(row => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start)
      .sort((a, b) => a.start - b.start);
  }

  function isEmptyScheduleTemplate(periods) {
    return periods && typeof periods === 'object' && !Array.isArray(periods) && Object.keys(periods).length === 0;
  }

  function fallbackRowsForScheduleType(type) {
    const name = String(type || '').trim();
    if (!name || isNonInstructionalScheduleType(name)) return [];
    const defaultRows = scheduleRows(state.defaults?.bellSchedules?.[name] || {});
    if (defaultRows.length) return defaultRows;
    const dataEntry = Object.values(state.scheduleData || {}).find(entry => Array.isArray(entry) && entry[0] === name);
    return scheduleRows(dataEntry?.[1] || {});
  }

  function effectiveRowsForScheduleType(type, periods) {
    const directRows = scheduleRows(periods || {});
    return directRows.length ? directRows : fallbackRowsForScheduleType(type);
  }

  function secondsToClock(seconds) {
    const value = Math.max(0, Math.min(86399, Number(seconds) || 0));
    let hour = Math.floor(value / 3600);
    const minute = Math.floor((value % 3600) / 60);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
  }

  function formatCountdownSeconds(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  }

  function nextBellSummary(schedule) {
    const rows = scheduleRows(schedule.periods);
    if (isNonInstructionalScheduleType(schedule.type)) {
      return {
        label: 'No School',
        detail: 'Enjoy your day',
        countdown: 'No School',
        display: 'No School',
        eyebrow: 'PHS Schedule',
        terminal: true,
        terminalKind: 'no-school',
        status: 'terminal',
        pctRemaining: 0,
        active: false
      };
    }
    if (!rows.length) {
      return { label: 'Bell data unavailable', detail: 'No period rows are configured for this schedule.', countdown: '--', status: 'attention', pctRemaining: 0, active: false };
    }
    const now = new Date();
    const currentSecond = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const active = rows.find(row => currentSecond >= row.start && currentSecond < row.end);
    if (active) {
      const elapsed = currentSecond - active.start;
      const total = Math.max(1, active.end - active.start);
      return {
        label: `${active.name || 'Current period'} ends`,
        detail: secondsToClock(active.end),
        countdown: formatCountdownSeconds(active.end - currentSecond),
        status: 'ok',
        pctRemaining: Math.min(1, Math.max(0, 1 - elapsed / total)),
        active: true
      };
    }
    const next = rows.find(row => row.start > currentSecond);
    if (next) {
      const previous = rows.slice().reverse().find(row => row.end <= currentSecond);
      const start = previous ? previous.end : 0;
      const span = Math.max(1, next.start - start);
      return {
        label: `${next.name || 'Next period'} starts`,
        detail: secondsToClock(next.start),
        countdown: formatCountdownSeconds(next.start - currentSecond),
        status: 'ok',
        pctRemaining: Math.min(1, Math.max(0, 1 - (currentSecond - start) / span)),
        active: true
      };
    }
    return {
      label: 'School day complete',
      detail: nextInstructionalDateLabel(now),
      countdown: 'School Day Ended',
      display: 'School Day Ended',
      eyebrow: 'PHS Schedule',
      terminal: true,
      terminalKind: 'day-ended',
      status: 'terminal',
      pctRemaining: 0,
      active: false
    };
  }

  function ringDashArray(pctRemaining) {
    const arcLen = Math.max(0, Math.min(100, (Number(pctRemaining) || 0) * 100));
    return `${arcLen.toFixed(2)} 100`;
  }

  function tickerCharHtml(char) {
    if (/\d/.test(char)) {
      return `<span class="ad-odometer-digit" data-ticker-char="${escapeHtml(char)}" style="--digit:${Number(char)}" aria-hidden="true"><span class="ad-odometer-track">${Array.from({ length: 10 }, (_, index) => `<b>${index}</b>`).join('')}</span></span>`;
    }
    if (char === ' ') return `<span class="ad-odometer-static ad-odometer-space" data-ticker-char=" " aria-hidden="true">&nbsp;</span>`;
    return `<span class="ad-odometer-static" data-ticker-char="${escapeHtml(char)}" aria-hidden="true">${escapeHtml(char)}</span>`;
  }

  function tickerTextHtml(value, className = 'ad-ticker') {
    const text = String(value ?? '').trim() || '--';
    return `<span class="${escapeHtml(className)}" data-ticker-text="${escapeHtml(text)}" role="text" aria-label="${escapeHtml(text)}">${Array.from(text).map(tickerCharHtml).join('')}</span>`;
  }

  function gaugeCountdownHtml(value) {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 2 && /\d/.test(parts.join(''))) {
      return parts.map(part => tickerTextHtml(part, 'ad-gauge-ticker')).join('');
    }
    return tickerTextHtml(value, 'ad-gauge-ticker ad-gauge-ticker--single');
  }

  function gaugeTerminalHtml(bell) {
    const kind = classSlug(bell.terminalKind || 'terminal');
    return `<span class="admin-terminal-mark__title admin-terminal-mark__title--${escapeHtml(kind)}" data-terminal-title>${escapeHtml(bell.display || bell.countdown || 'School Day Ended')}</span>`;
  }

  function updateTickerText(host, value) {
    if (!host) return;
    const text = String(value ?? '').trim() || '--';
    const wrapper = host.matches('[data-ticker-text]') ? host : host.querySelector('[data-ticker-text]');
    if (!wrapper || wrapper.dataset.tickerText !== text || Array.from(text).length !== wrapper.querySelectorAll('[data-ticker-char]').length) {
      host.innerHTML = gaugeCountdownHtml(text);
      return;
    }
    const chars = Array.from(text);
    const nodes = [...wrapper.querySelectorAll('[data-ticker-char]')];
    nodes.forEach((node, index) => {
      const char = chars[index] || '';
      if (node.dataset.tickerChar === char) return;
      const nextIsDigit = /\d/.test(char);
      const currentIsDigit = node.classList.contains('ad-odometer-digit');
      if (nextIsDigit && currentIsDigit) {
        node.dataset.tickerChar = char;
        node.style.setProperty('--digit', String(Number(char)));
      } else {
        const template = document.createElement('template');
        template.innerHTML = tickerCharHtml(char);
        node.replaceWith(template.content.firstElementChild);
      }
    });
    wrapper.dataset.tickerText = text;
  }

  function schoolDayProgress(schedule) {
    const rows = scheduleRows(schedule.periods);
    if (isNonInstructionalScheduleType(schedule.type) || !rows.length) return null;
    const first = rows[0].start;
    const last = rows[rows.length - 1].end;
    const now = new Date();
    const current = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const pct = Math.min(1, Math.max(0, (current - first) / Math.max(1, last - first)));
    const label = current < first
      ? `School day starts ${secondsToClock(first)}`
      : current >= last
        ? 'School day complete'
        : `${Math.round(pct * 100)}% of the school day complete`;
    return { pct, label };
  }

  function renderSchoolDayProgress(progress) {
    if (!progress) return '';
    return `
      <div class="admin-day-progress" data-day-progress aria-label="${escapeHtml(progress.label)}">
        <div><span>Day progress</span><strong data-day-progress-label>${escapeHtml(progress.label)}</strong></div>
        <i><b data-day-progress-bar style="width:${Math.round(progress.pct * 100)}%"></b></i>
      </div>`;
  }

  function liveDayTimelineModel(schedule) {
    const rows = scheduleRows(schedule.periods);
    if (isNonInstructionalScheduleType(schedule.type) || !rows.length) return null;
    const first = rows[0].start;
    const last = rows[rows.length - 1].end;
    const span = Math.max(1, last - first);
    const now = new Date();
    const current = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const marker = Math.min(1, Math.max(0, (current - first) / span));
    return { rows, first, span, marker, current };
  }

  function renderLiveDayTimeline(schedule) {
    const model = liveDayTimelineModel(schedule);
    if (!model) return '';
    return `
      <section class="admin-day-timeline" data-day-timeline aria-label="Live school day timeline">
        <div class="admin-panel-heading"><h2>Day timeline</h2><span data-day-timeline-now>${escapeHtml(secondsToClock(model.current))}</span></div>
        <div class="admin-day-timeline__rail">
          <i class="admin-day-timeline__now" data-day-timeline-marker style="left:${Math.round(model.marker * 1000) / 10}%"></i>
          ${model.rows.map(row => {
            const left = ((row.start - model.first) / model.span) * 100;
            const width = Math.max(2, ((row.end - row.start) / model.span) * 100);
            const active = model.current >= row.start && model.current < row.end;
            return `<span class="${active ? 'is-active' : ''}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%" title="${escapeHtml(`${row.name}: ${secondsToClock(row.start)} - ${secondsToClock(row.end)}`)}"><b>${escapeHtml(row.name)}</b></span>`;
          }).join('')}
        </div>
      </section>`;
  }

  function paintLiveDayTimeline(root, schedule) {
    const host = root.querySelector?.('[data-day-timeline]');
    if (!host) return;
    const model = liveDayTimelineModel(schedule);
    if (!model) {
      host.remove();
      return;
    }
    const marker = host.querySelector('[data-day-timeline-marker]');
    if (marker) marker.style.left = `${Math.round(model.marker * 1000) / 10}%`;
    const now = host.querySelector('[data-day-timeline-now]');
    if (now) now.textContent = secondsToClock(model.current);
    const spans = [...host.querySelectorAll('.admin-day-timeline__rail span')];
    spans.forEach((span, index) => {
      const row = model.rows[index];
      span?.classList.toggle('is-active', Boolean(row && model.current >= row.start && model.current < row.end));
    });
  }

  function lunchWeatherLabel(code) {
    const value = Number(code);
    if ([0].includes(value)) return 'Clear';
    if ([1, 2, 3].includes(value)) return 'Clouds';
    if ([45, 48].includes(value)) return 'Fog';
    if ([51, 53, 55, 56, 57].includes(value)) return 'Drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'Rain';
    if ([71, 73, 75, 77, 85, 86].includes(value)) return 'Snow';
    if ([95, 96, 99].includes(value)) return 'Storms';
    return 'Forecast';
  }

  function lunchViewModel(forecast) {
    if (!forecast || forecast.ok === false) {
      return {
        status: 'muted',
        title: 'Lunch forecast',
        value: 'Unavailable',
        detail: forecast?.error || 'Lunch weather is not available in this environment.',
        meta: ''
      };
    }
    const hourly = forecast.api?.hourly || forecast.hourly || {};
    const time = asArray(hourly.time);
    const lunchIndex = time.findIndex(value => /T12:00/.test(String(value)));
    const index = lunchIndex >= 0 ? lunchIndex : Math.max(0, Math.floor(time.length / 2));
    const temp = Number(asArray(hourly.temperature_2m)[index]);
    const feels = Number(asArray(hourly.apparent_temperature)[index]);
    const precip = Number(asArray(hourly.precipitation_probability)[index]);
    const code = Number(asArray(hourly.weather_code)[index]);
    const wind = Number(asArray(hourly.wind_speed_10m)[index]);
    const tempText = Number.isFinite(temp) ? `${Math.round(temp)}°` : 'Forecast';
    const detail = [
      Number.isFinite(feels) ? `Feels ${Math.round(feels)}°` : '',
      Number.isFinite(precip) ? `${Math.round(precip)}% rain` : '',
      Number.isFinite(wind) ? `${Math.round(wind)} mph wind` : ''
    ].filter(Boolean).join(' · ') || 'No lunch detail returned.';
    return {
      status: Number.isFinite(precip) && precip >= 45 ? 'attention' : 'ok',
      title: 'Lunch forecast',
      value: `${tempText} ${lunchWeatherLabel(code)}`,
      detail,
      meta: forecast.cached ? 'Cached' : 'Live'
    };
  }

  function renderLunchCard() {
    const model = lunchViewModel(state.lunchSummary);
    return `
      <section class="admin-lunch-card ${model.status}" data-lunch-card>
        <span>${escapeHtml(model.title)}</span>
        <strong>${escapeHtml(model.value)}</strong>
        <small>${escapeHtml(model.detail)}</small>
        ${model.meta ? `<em>${escapeHtml(model.meta)}</em>` : ''}
      </section>`;
  }

  function paintLunchCard(host) {
    const target = host.querySelector('[data-lunch-card]');
    if (!target) return;
    const wrapper = document.createElement('template');
    wrapper.innerHTML = renderLunchCard().trim();
    target.replaceWith(wrapper.content.firstElementChild);
    refreshWorkspaceLayoutSoon();
  }

  function renderPublishChecksLine(issues) {
    const blockCount = issues.blocking.length;
    const warnCount = issues.warnings.length;
    const text = blockCount
      ? `${blockCount} publish ${blockCount === 1 ? 'block' : 'blocks'}`
      : warnCount
        ? `${warnCount} ${warnCount === 1 ? 'warning' : 'warnings'}`
        : 'Publish checks clear';
    const detail = blockCount
      ? issues.blocking[0]
      : warnCount
        ? issues.warnings[0]
        : 'Draft schedule and content are publish-ready.';
    const kind = blockCount ? 'danger' : warnCount ? 'attention' : 'ok';
    return `
      <div class="admin-today-checks ${kind}">
        <strong>${escapeHtml(text)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>`;
  }

  function renderBellGauge(bell, schedule) {
    const dash = ringDashArray(bell.pctRemaining);
    const progress = schoolDayProgress(schedule || {});
    const terminal = Boolean(bell.terminal);
    const gaugeLabel = terminal
      ? [bell.display || bell.countdown, bell.detail].filter(Boolean).join(', ')
      : [`Next bell in ${bell.countdown}`, bell.label && bell.detail ? `${bell.label} at ${bell.detail}` : '']
        .filter(Boolean)
        .join(', ');
    if (terminal) {
      return `
        <div class="admin-next-bell ${bell.status} terminal" data-gauge-terminal="1" data-gauge-kind="${escapeHtml(classSlug(bell.terminalKind || 'terminal'))}" aria-live="polite">
          <div class="admin-terminal-mark" role="img" aria-label="${escapeHtml(gaugeLabel)}">
            ${gaugeTerminalHtml(bell)}
            ${bell.detail ? `<small class="admin-terminal-mark__note" data-terminal-note>${escapeHtml(bell.detail)}</small>` : ''}
          </div>
        </div>`;
    }
    return `
      <div class="admin-next-bell ${bell.status}" data-gauge-terminal="0" aria-live="polite">
        <div class="ad-gauge" role="img" aria-label="${escapeHtml(gaugeLabel)}">
          <svg class="ad-gauge__ring" viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="adminRingGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="var(--ring-start)"/>
                <stop offset="1" stop-color="var(--ring-end)"/>
              </linearGradient>
            </defs>
            <circle class="ad-gauge__track" cx="60" cy="60" r="54" pathLength="100"></circle>
            <circle class="ad-gauge__fill" cx="60" cy="60" r="54" pathLength="100" transform="rotate(-90 60 60)" style="stroke-dasharray:${dash};stroke-dashoffset:0"></circle>
          </svg>
          <div class="ad-gauge__disc">
            <span data-gauge-eyebrow>Next bell</span>
            <strong data-gauge-value aria-label="${escapeHtml(bell.countdown)}">${gaugeCountdownHtml(bell.countdown)}</strong>
          </div>
        </div>
        ${renderSchoolDayProgress(progress)}
      </div>`;
  }

  function renderTodayVariantBand() {
    return `
      <section class="admin-today-band" aria-label="Admin workspace">
        <div>
          <span>Poolesville admin</span>
          <p>Draft, preview, and publish public schedule changes.</p>
        </div>
      </section>`;
  }

  function renderTodayBackendOverview() {
    const summary = state.opsSummary || {};
    const storage = summary.storage || {};
    const publicSync = summary.publicSync || {};
    const backupCount = Number(summary.backups?.count ?? asArray(summary.backups?.entries).length) || 0;
    const latestBackup = summary.backups?.latest ? formatSecurityDate(backupTimestamp(summary.backups.latest)) : 'No restore point yet';
    const actor = summary.actor || state.identity || {};
    const syncPaths = asArray(publicSync.paths).join(' + ');
    const checked = summary.checkedAt ? formatSecurityDate(summary.checkedAt) : 'Checking now';
    const settingsStore = storage.settings?.type || 'settings pending';
    const auditStore = storage.audit?.type || 'audit pending';
    const backupStore = storage.backups?.type || 'backup pending';
    return `
      <section class="admin-backend-overview" aria-label="Backend overview">
        <div class="admin-panel-heading">
          <h2>Backend overview</h2>
          <span>${escapeHtml(checked)}</span>
        </div>
        <div class="admin-backend-grid">
          <article class="admin-backend-tile">
            <span>Storage</span>
            <strong>${escapeHtml(settingsStore)}</strong>
            <small>${escapeHtml(`Audit ${auditStore}; backups ${backupStore}.`)}</small>
          </article>
          <article class="admin-backend-tile">
            <span>Publish target</span>
            <strong>${publicSync.configured === false ? 'Needs setup' : 'Ready'}</strong>
            <small>${escapeHtml(syncPaths || publicSync.message || publicSync.reason || 'Public settings publish path is available.')}</small>
          </article>
          <article class="admin-backend-tile">
            <span>Rollback</span>
            <strong>${escapeHtml(`${backupCount} ${backupCount === 1 ? 'backup' : 'backups'}`)}</strong>
            <small>${escapeHtml(latestBackup)}</small>
          </article>
          <article class="admin-backend-tile">
            <span>Session</span>
            <strong>${escapeHtml(actor.name || 'Local Admin')}</strong>
            <small>${escapeHtml(actor.email || 'Local development session')}</small>
          </article>
        </div>
	      </section>`;
  }

  function analyticsViewModel(raw) {
    const data = raw || {};
    const ga = data.googleAnalytics || {};
    const days = data.days || {};
    const dayKeys = Object.keys(days).sort();
    const last7 = dayKeys.slice(-7);
    const localTotals = last7.reduce((acc, key) => {
      const totals = days[key]?.totals || {};
      acc.pageviews += Number(totals.pageviews) || 0;
      acc.durationSeconds += Number(totals.durationSeconds) || 0;
      return acc;
    }, { pageviews: 0, durationSeconds: 0 });

    const localPages = {};
    for (const key of last7) {
      for (const [page, metrics] of Object.entries(days[key]?.pages || {})) {
        localPages[page] ||= { pageviews: 0, durationSeconds: 0 };
        localPages[page].pageviews += Number(metrics.pageviews) || 0;
        localPages[page].durationSeconds += Number(metrics.durationSeconds) || 0;
      }
    }
    const localPageEntries = Object.entries(localPages)
      .map(([page, metrics]) => ({
        label: pageLabel(page),
        detail: `${formatDuration(metrics.durationSeconds)} total time`,
        views: metrics.pageviews || 0
      }))
      .sort((a, b) => b.views - a.views);

    const gaConfigured = Boolean(ga.configured && !ga.error);
    const gaPages = asArray(ga.pages).map(page => ({
      label: page.path || page.pagePath || page.title || 'Page',
      detail: [
        isPresent(page.activeUsers) ? `${formatNumber(page.activeUsers)} users` : '',
        isPresent(page.averageSessionDuration) ? `${formatDuration(page.averageSessionDuration)} avg` : ''
      ].filter(Boolean).join(' · ') || 'Google Analytics',
      views: Number(page.pageviews ?? page.screenPageViews ?? page.views) || 0
    })).sort((a, b) => b.views - a.views);

    const trend = last7.map(key => {
      const totals = days[key]?.totals || {};
      return {
        key,
        label: key.slice(5).replace('-', '/'),
        views: Number(totals.pageviews) || 0
      };
    });
    const gaPageviews = ga.totals?.pageviews ?? ga.totals?.screenPageViews ?? gaPages.reduce((sum, page) => sum + page.views, 0);
    const firstPartyViews = data.totals?.pageviews ?? localTotals.pageviews;
    const views = gaConfigured ? Number(gaPageviews) || 0 : Number(firstPartyViews) || 0;
    const topPages = gaConfigured && gaPages.length ? gaPages : localPageEntries;
    const activeUsers = gaConfigured ? Number(ga.totals?.activeUsers) || 0 : null;
    const sessions = gaConfigured ? Number(ga.totals?.sessions) || 0 : null;
    const avgSession = gaConfigured ? Number(ga.totals?.averageSessionDuration ?? ga.totals?.avgSessionDuration) || 0 : localTotals.durationSeconds;
    const source = gaConfigured ? 'Google Analytics' : data.local ? 'Local preview' : 'First-party aggregate';
    const note = gaConfigured
      ? `GA4 connected${ga.propertyId ? ` · ${ga.propertyId}` : ''}`
      : ga.error
        ? ga.error
        : data.local
          ? 'Local preview is not connected to GA4.'
          : 'Connect GA4 to show users, sessions, and page detail.';
    const dimensions = [
      analyticsDimensionGroup('Traffic sources', ga.sources || ga.trafficSources || ga.channels || ga.referrers),
      analyticsDimensionGroup('Devices', ga.devices || ga.deviceCategories || ga.platforms),
      analyticsDimensionGroup('Regions', ga.countries || ga.regions || ga.locations || ga.cities)
    ].filter(group => group.items.length);

    return {
      source,
      note,
      configured: gaConfigured,
      views,
      activeUsers,
      sessions,
      avgSession,
      viewsPerUser: activeUsers ? views / activeUsers : null,
      viewsPerSession: sessions ? views / sessions : null,
      localTotals,
      trend,
      topPages,
      dimensions
    };
  }

  function analyticsDimensionGroup(title, rawItems) {
    const items = asArray(rawItems)
      .map(item => {
        const label = item.label || item.name || item.source || item.medium || item.channel || item.device || item.deviceCategory || item.country || item.region || item.city || item.path || '';
        const value = Number(item.pageviews ?? item.views ?? item.sessions ?? item.activeUsers ?? item.users ?? item.eventCount) || 0;
        const detail = [
          isPresent(item.sessions) ? `${formatNumber(item.sessions)} sessions` : '',
          isPresent(item.activeUsers) ? `${formatNumber(item.activeUsers)} users` : '',
          isPresent(item.averageSessionDuration) ? `${formatDuration(item.averageSessionDuration)} avg` : ''
        ].filter(Boolean).join(' · ');
        return { label: String(label || 'Unknown'), value, detail };
      })
      .filter(item => item.label || item.value)
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
    return { title, items };
  }

  function usageTrendBars(model) {
    const trend = model.trend.length ? model.trend : Array.from({ length: 7 }, (_, index) => ({ label: `D${index + 1}`, views: 0 }));
    const maxViews = Math.max(1, ...trend.map(day => day.views || 0));
    return trend.map(day => {
      const height = Math.max(6, Math.round(((day.views || 0) / maxViews) * 100));
      return `
        <div class="admin-usage-bar" title="${escapeHtml(`${day.key || day.label} · ${formatNumber(day.views)} views`)}">
          <i style="--bar:${height}%"></i>
          <strong>${formatNumber(day.views)}</strong>
          <span>${escapeHtml(day.label)}</span>
        </div>`;
    }).join('');
  }

  function usagePageRows(model) {
    const pages = model.topPages.slice(0, 5);
    const maxViews = Math.max(1, ...pages.map(page => page.views || 0));
    if (!pages.length) {
      return '<div class="admin-usage-empty">No page detail yet.</div>';
    }
    return pages.map(page => `
      <div class="admin-usage-page">
        <div>
          <strong>${escapeHtml(page.label)}</strong>
          <span>${escapeHtml(page.detail || model.source)}</span>
        </div>
        <i><b style="--w:${Math.round(((page.views || 0) / maxViews) * 100)}%"></b></i>
        <em>${formatNumber(page.views)}</em>
      </div>`).join('');
  }

  function usageQualityMetrics(model) {
    const metrics = [
      { label: 'Views / user', value: isNil(model.viewsPerUser) ? '-' : model.viewsPerUser.toFixed(1), detail: model.configured ? 'Engagement depth' : 'Needs GA users' },
      { label: 'Views / session', value: isNil(model.viewsPerSession) ? '-' : model.viewsPerSession.toFixed(1), detail: model.configured ? 'Session depth' : 'Needs GA sessions' },
      { label: 'First-party views', value: formatNumber(model.localTotals.pageviews), detail: 'Privacy-safe fallback' },
      { label: 'Tracked time', value: formatDuration(model.localTotals.durationSeconds), detail: 'Aggregate only' }
    ];
    return metrics.map(metric => `
      <section>
        <span>${escapeHtml(metric.label)}</span>
        <strong>${escapeHtml(metric.value)}</strong>
        <small>${escapeHtml(metric.detail)}</small>
      </section>`).join('');
  }

  function usageDimensionPanels(model) {
    if (!model.dimensions.length) {
      return `
        <section class="admin-usage-dim-card admin-usage-dim-card--empty">
          <span>GA detail</span>
          <strong>Sources, devices, and regions unlock when GA4 detail is available.</strong>
          <small>No personal data is shown here.</small>
        </section>`;
    }
    return model.dimensions.map(group => {
      const max = Math.max(1, ...group.items.map(item => item.value || 0));
      return `
        <section class="admin-usage-dim-card">
          <span>${escapeHtml(group.title)}</span>
          ${group.items.map(item => `
            <div class="admin-usage-dim-row">
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}
              </div>
              <i><b style="--w:${Math.round(((item.value || 0) / max) * 100)}%"></b></i>
              <em>${formatNumber(item.value)}</em>
            </div>`).join('')}
        </section>`;
    }).join('');
  }

  function renderTodayUsageOverview() {
    return `
      <section class="admin-today-usage" data-today-usage aria-label="Usage overview">
        ${state.analyticsSummary ? todayUsageOverviewHtml(state.analyticsSummary) : renderLoadingState('Loading usage overview')}
      </section>`;
  }

  function todayUsageOverviewHtml(summary) {
    if (!summary) {
      return `<div class="admin-field-help admin-field-help--danger">Analytics could not be loaded.</div>`;
    }
    const model = analyticsViewModel(summary);
    return `
      <div class="admin-usage-head">
        <div>
          <span>Usage overview</span>
          <h2>${escapeHtml(model.source)}</h2>
        </div>
        <div class="admin-usage-actions">
          <p>${escapeHtml(model.note)}</p>
        </div>
      </div>
      <div class="admin-usage-stats" aria-label="Traffic summary">
        <section><span>Views</span><strong>${formatNumber(model.views)}</strong><small>Last 7 days</small></section>
        <section><span>Users</span><strong>${isNil(model.activeUsers) ? '-' : formatNumber(model.activeUsers)}</strong><small>${model.configured ? 'GA active users' : 'GA not connected'}</small></section>
        <section><span>Sessions</span><strong>${isNil(model.sessions) ? '-' : formatNumber(model.sessions)}</strong><small>${model.configured ? 'GA sessions' : 'Waiting for GA4'}</small></section>
        <section><span>Time</span><strong>${formatDuration(model.avgSession)}</strong><small>${model.configured ? 'Avg session' : 'Tracked total'}</small></section>
      </div>
      <div class="admin-usage-grid">
        <section class="admin-usage-chart">
          <div class="admin-panel-heading">
            <h2>Daily views</h2>
            <span>${escapeHtml(model.configured ? 'Fallback trend' : 'First-party trend')}</span>
          </div>
          <div class="admin-usage-bars">${usageTrendBars(model)}</div>
        </section>
        <section class="admin-usage-chart">
          <div class="admin-panel-heading">
            <h2>Top pages</h2>
            <span>${escapeHtml(model.configured ? 'GA page detail' : 'Local aggregate')}</span>
          </div>
          <div class="admin-usage-pages">${usagePageRows(model)}</div>
        </section>
      </div>
      <div class="admin-usage-quality" aria-label="Engagement quality">
        ${usageQualityMetrics(model)}
      </div>
      <div class="admin-usage-dimensions">
        ${usageDimensionPanels(model)}
      </div>`;
  }

  function paintTodayUsageOverview(host, summary) {
    host.innerHTML = todayUsageOverviewHtml(summary);
    host.querySelectorAll('[data-go-tab]').forEach(btn => btn.addEventListener('click', () => goTab(btn.dataset.goTab)));
    refreshWorkspaceLayoutSoon();
  }

  function schedulePlannerTypes() {
    const base = ['Normal Schedule', 'Advisory', 'Early Release', 'Assembly', 'Exam Day', 'No School'];
    const extra = Object.keys(state.draft?.bellSchedules || {})
      .filter(type => type && type !== '_dateOverrides' && !base.includes(type));
    return [...base, ...extra];
  }

  function ensureScheduleTemplate(type) {
    if (!type || isNonInstructionalScheduleType(type)) return;
    state.draft.bellSchedules = state.draft.bellSchedules || {};
    if (state.draft.bellSchedules[type] && typeof state.draft.bellSchedules[type] === 'object') return;
    const typeDefault = state.defaults?.bellSchedules?.[type] || {};
    if (scheduleRows(typeDefault).length) {
      state.draft.bellSchedules[type] = deepClone(typeDefault);
      return;
    }
    const normal = state.draft.bellSchedules['Normal Schedule'] || state.defaults?.bellSchedules?.['Normal Schedule'] || {};
    if (scheduleRows(normal).length) state.draft.bellSchedules[type] = deepClone(normal);
  }

  function setPlannedScheduleDate(iso, type) {
    const map = dateOverrideMap(state.draft, true);
    if (type) {
      map[iso] = type;
      ensureScheduleTemplate(type);
    } else {
      delete map[iso];
    }
    state.schedulePlannerSelectedDate = iso;
    markDirty();
    pushPreview();
  }

  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function scheduleRules(settings = state.draft) {
    settings.scheduleRules = asArray(settings.scheduleRules);
    return settings.scheduleRules;
  }

  function scheduleRuleSummary(rule) {
    if (!rule) return 'Rule unavailable';
    if (rule.kind === 'weekday') {
      const days = asArray(rule.weekdays).map(day => WEEKDAY_LABELS[Number(day)]).filter(Boolean).join(', ');
      return `Every ${days || 'selected weekday'} -> ${rule.scheduleType}`;
    }
    if (rule.kind === 'dateRange') {
      return `${rule.from || 'Start'} to ${rule.to || 'end'} -> ${rule.scheduleType}`;
    }
    if (rule.kind === 'date') {
      return `${rule.date || 'Date'} -> ${rule.scheduleType}`;
    }
    return `${rule.kind || 'Rule'} -> ${rule.scheduleType || 'schedule'}`;
  }

  function renderScheduleRulesEditor() {
    const host = document.createElement('div');
    host.className = 'admin-schedule-rules';
    const defaultDate = todayISODate();
    const builder = {
      kind: 'weekday',
      weekdays: [3],
      date: defaultDate,
      from: defaultDate,
      to: dateToISODate(addDays(new Date(), 6)),
      scheduleType: 'Advisory'
    };
    const typeOptions = () => schedulePlannerTypes().map(type => `<option value="${escapeHtml(type)}" ${builder.scheduleType === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('');
    const paintRules = () => {
      const rules = scheduleRules();
      const list = host.querySelector('[data-rule-list]');
      if (!list) return;
      list.innerHTML = rules.length ? rules.map((rule, index) => `
        <article class="admin-rule-row ${rule.enabled === false ? 'is-off' : ''}">
          <div>
            <strong>${escapeHtml(scheduleRuleSummary(rule))}</strong>
            <span>${rule.enabled === false ? 'Paused' : 'Active'} · ${escapeHtml(rule.id || `rule-${index + 1}`)}</span>
          </div>
          <div class="admin-rule-row__actions">
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-rule-toggle="${index}">${rule.enabled === false ? 'Enable' : 'Pause'}</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-danger" data-rule-delete="${index}">${ICON.trash}<span>Delete</span></button>
          </div>
        </article>`).join('') : '<div class="admin-rule-empty">No recurring schedule rules yet.</div>';
      list.querySelectorAll('[data-rule-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const rule = rules[Number(btn.dataset.ruleToggle)];
          if (!rule) return;
          rule.enabled = rule.enabled === false;
          markDirty();
          paintRules();
          refreshPlannerIfVisible(host);
          pushPreview();
        });
      });
      list.querySelectorAll('[data-rule-delete]').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = Number(btn.dataset.ruleDelete);
          const [removed] = rules.splice(index, 1);
          markDirty();
          paintRules();
          refreshPlannerIfVisible(host);
          pushPreview();
          if (removed) {
            undoToast('Schedule rule deleted.', () => {
              rules.splice(index, 0, removed);
              markDirty();
              paintRules();
              refreshPlannerIfVisible(host);
              pushPreview();
            });
          }
        });
      });
      refreshWorkspaceLayoutSoon();
    };
    const paintBuilderFields = () => {
      const target = host.querySelector('[data-rule-fields]');
      if (!target) return;
      const dateFields = builder.kind === 'date'
        ? `<div class="admin-field"><div class="admin-field-row"><label for="rule-date">Date</label></div><input class="admin-input" id="rule-date" type="date" value="${escapeHtml(builder.date)}" data-rule-date></div>`
        : builder.kind === 'dateRange'
          ? `<div class="admin-grid-2">
              <div class="admin-field"><div class="admin-field-row"><label for="rule-from">From</label></div><input class="admin-input" id="rule-from" type="date" value="${escapeHtml(builder.from)}" data-rule-from></div>
              <div class="admin-field"><div class="admin-field-row"><label for="rule-to">To</label></div><input class="admin-input" id="rule-to" type="date" value="${escapeHtml(builder.to)}" data-rule-to></div>
            </div>`
          : `<div class="admin-weekday-pills" role="group" aria-label="Weekdays">
              ${WEEKDAY_LABELS.map((day, index) => `<button type="button" class="${builder.weekdays.includes(index) ? 'active' : ''}" data-rule-weekday="${index}" aria-pressed="${builder.weekdays.includes(index) ? 'true' : 'false'}">${day}</button>`).join('')}
            </div>`;
      target.innerHTML = `
        ${dateFields}
        <div class="admin-field">
          <div class="admin-field-row"><label for="rule-schedule-type">Schedule type</label></div>
          <select class="admin-select" id="rule-schedule-type" data-rule-schedule-type>${typeOptions()}</select>
        </div>`;
      target.querySelectorAll('[data-rule-weekday]').forEach(btn => {
        btn.addEventListener('click', () => {
          const day = Number(btn.dataset.ruleWeekday);
          builder.weekdays = builder.weekdays.includes(day)
            ? builder.weekdays.filter(value => value !== day)
            : [...builder.weekdays, day].sort((a, b) => a - b);
          paintBuilderFields();
        });
      });
      target.querySelector('[data-rule-date]')?.addEventListener('input', e => { builder.date = e.target.value; });
      target.querySelector('[data-rule-from]')?.addEventListener('input', e => { builder.from = e.target.value; });
      target.querySelector('[data-rule-to]')?.addEventListener('input', e => { builder.to = e.target.value; });
      target.querySelector('[data-rule-schedule-type]')?.addEventListener('change', e => { builder.scheduleType = e.target.value; });
    };
    const addRule = () => {
      const rules = scheduleRules();
      const rule = {
        id: uniqueId('rule'),
        kind: builder.kind,
        scheduleType: builder.scheduleType,
        enabled: true
      };
      if (builder.kind === 'weekday') rule.weekdays = builder.weekdays.slice();
      if (builder.kind === 'date') rule.date = builder.date || defaultDate;
      if (builder.kind === 'dateRange') {
        rule.from = builder.from || defaultDate;
        rule.to = builder.to || rule.from;
      }
      rules.push(rule);
      ensureScheduleTemplate(rule.scheduleType);
      markDirty();
      paintRules();
      refreshPlannerIfVisible(host);
      pushPreview();
    };
    host.innerHTML = `
      <div class="admin-rule-builder">
        <div class="admin-grid-2">
          <div class="admin-field">
            <div class="admin-field-row"><label for="rule-kind">Rule type</label></div>
            <select class="admin-select" id="rule-kind" data-rule-kind>
              <option value="weekday">Every weekday</option>
              <option value="dateRange">Date range</option>
              <option value="date">Single date</option>
            </select>
          </div>
          <div class="admin-field">
            <div class="admin-field-row"><label>Rule preview</label></div>
            <div class="admin-rule-preview" data-rule-preview>${escapeHtml(scheduleRuleSummary(builder))}</div>
          </div>
        </div>
        <div data-rule-fields></div>
        <button type="button" class="ad-btn ad-btn--primary" data-rule-add>${ICON.plus}<span>Add rule</span></button>
      </div>
      <div class="admin-rule-list" data-rule-list></div>`;
    const syncPreview = () => {
      const preview = host.querySelector('[data-rule-preview]');
      if (preview) preview.textContent = scheduleRuleSummary(builder);
    };
    host.querySelector('[data-rule-kind]')?.addEventListener('change', e => {
      builder.kind = e.target.value;
      paintBuilderFields();
      syncPreview();
    });
    host.addEventListener('input', syncPreview);
    host.addEventListener('change', syncPreview);
    host.querySelector('[data-rule-add]')?.addEventListener('click', addRule);
    paintBuilderFields();
    paintRules();
    return host;
  }

  function refreshPlannerIfVisible(origin) {
    const plannerCard = origin?.closest('.admin-workspace-main')?.querySelector('.admin-card--schedulePlanner');
    if (!plannerCard) return;
    const nextPlanner = renderSchedulePlanner();
    plannerCard.querySelector('.admin-schedule-planner')?.replaceWith(nextPlanner);
  }

  function renderTodayDashboard() {
    const host = document.createElement('div');
    const variant = state.todayVariant === 'b' ? 'b' : 'a';
    host.className = `admin-today admin-today--variant-${variant}`;
    if (!state.scheduleData && !state.scheduleDataLoading) {
      loadScheduleData().then(() => {
        if (state.activeTab === 'today') renderActiveTab();
      }).catch(() => {
        if (state.activeTab === 'today') renderActiveTab();
      });
    }
    if (!state.opsSummary && !state.opsSummaryLoading) {
      loadOpsSummary().then(() => {
        if (state.activeTab === 'today') renderActiveTab();
      }).catch(() => {});
    }
    if (!state.analyticsSummary && !state.analyticsSummaryLoading) {
      loadAnalyticsSummary().then(() => {
        if (state.activeTab === 'today') {
          const usageHost = host.querySelector('[data-today-usage]');
          if (usageHost) paintTodayUsageOverview(usageHost, state.analyticsSummary);
        }
      }).catch(() => {
        const usageHost = host.querySelector('[data-today-usage]');
        if (usageHost) paintTodayUsageOverview(usageHost, null);
      });
    }
    if (!state.lunchSummary && !state.lunchSummaryLoading) {
      loadLunchSummary().then(() => {
        if (state.activeTab === 'today') paintLunchCard(host);
      }).catch(() => paintLunchCard(host));
    }
    const today = todayISODate();
    const schedule = resolveScheduleForDate(today);
    const bell = nextBellSummary(schedule);
    const changed = changedSections();
    const dirty = changed.length > 0;
    const issues = collectPublishIssues();
    const status = normalizedSiteStatus();
    const overrideText = schedule.overrideType
      ? `${schedule.source}: ${schedule.overrideType}`
      : status.mode === 'maintenance'
        ? 'Maintenance page staged'
        : 'No schedule override active';
    const lastPublish = state.lastPublishAt || state.settings?.updatedAt || state.opsSummary?.lastPublishAt || '';
    const diff = publishDiffDetails(buildPublishPatch());
    const dayTitle = `${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} · ${schedule.type}`;
    host.innerHTML = `
      ${variant === 'b' ? renderTodayVariantBand() : ''}
      <section class="admin-today-hero ${bell.terminal ? 'admin-today-hero--terminal' : ''}">
        <div class="admin-today-copy">
          <div class="admin-kicker">
            <span>${escapeHtml(new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
            <b>${state.scheduleDataLoading ? 'Loading schedule data' : schedule.source}</b>
          </div>
          <h2>${escapeHtml(dayTitle)}</h2>
          <p>${escapeHtml(overrideText)}</p>
          <div class="admin-today-actions">
            <button type="button" class="ad-btn ad-btn--primary" id="today-preview-publish" ${dirty ? '' : 'disabled'}>${ICON.eye}<span>Preview then publish</span></button>
            <button type="button" class="ad-btn ad-btn--ghost" data-go-tab="bellSchedules">${ICON.schedule}<span>Plan schedule</span></button>
            <button type="button" class="ad-btn ad-btn--ghost" data-go-tab="announcements">${ICON.announce}<span>Edit announcements</span></button>
          </div>
        </div>
        ${renderBellGauge(bell, schedule)}
      </section>
      ${renderPublishChecksLine(issues)}
      ${renderLiveDayTimeline(schedule)}
      <div class="admin-today-strip" aria-label="Today status">
        <section><span>Live today</span><strong>${escapeHtml(schedule.type)}</strong><small>${escapeHtml(schedule.baseType === schedule.type ? 'Matches default schedule' : `Default is ${schedule.baseType}`)}</small></section>
        <section><span>Override</span><strong>${schedule.overrideType ? 'Active' : 'None'}</strong><small>${escapeHtml(overrideText)}</small></section>
        <section><span>Unpublished</span><strong>${tickerTextHtml(changed.length, 'ad-stat-ticker')}</strong><small>${changed.length ? escapeHtml(changed.join(', ')) : 'No draft sections changed'}</small></section>
        <section><span>Last publish</span><strong>${escapeHtml(formatSecurityDate(lastPublish))}</strong><small>${state.lastPublishAt ? 'This browser session' : 'From saved settings'}</small></section>
      </div>
      ${renderLunchCard()}
      ${renderTodayUsageOverview()}
      ${renderTodayBackendOverview()}
      ${dirty ? `
        <section class="admin-today-diff">
          <div class="admin-panel-heading">
            <h2>Publish diff</h2>
            <span>${changed.length} ${changed.length === 1 ? 'section' : 'sections'}</span>
          </div>
          <div class="admin-diff-list">
            ${diff.map(section => `
              <div class="admin-diff-row">
                <strong>${escapeHtml(section.label)}</strong>
                <span>${escapeHtml(section.items.join('; '))}</span>
              </div>`).join('')}
          </div>
        </section>` : ''}
    `;
    const usageHost = host.querySelector('[data-today-usage]');
    if (usageHost && state.analyticsSummary) paintTodayUsageOverview(usageHost, state.analyticsSummary);
    host.querySelectorAll('[data-go-tab]').forEach(btn => btn.addEventListener('click', () => goTab(btn.dataset.goTab)));
    host.querySelector('#today-preview-publish')?.addEventListener('click', () => {
      openDraftPreview(null, { fromActiveTab: true });
      publishDraft('today').catch(() => {});
    });
    const tickTodayGauge = () => {
      if (state.activeTab !== 'today' || !document.body.contains(host)) {
        clearTimeout(todayDashboardTimer);
        todayDashboardTimer = null;
        return;
      }
      const currentSchedule = resolveScheduleForDate(todayISODate());
      const next = nextBellSummary(currentSchedule);
      const bellHost = host.querySelector('.admin-next-bell');
      if (!bellHost) return;
      const terminal = Boolean(next.terminal);
      if (bellHost.dataset.gaugeTerminal !== (terminal ? '1' : '0')) {
        const template = document.createElement('template');
        template.innerHTML = renderBellGauge(next, currentSchedule).trim();
        bellHost.replaceWith(template.content.firstElementChild);
        paintLiveDayTimeline(host, currentSchedule);
        todayDashboardTimer = setTimeout(tickTodayGauge, next.active ? 1000 : 60000);
        return;
      }
      bellHost.className = `admin-next-bell ${next.status}`;
      if (terminal) bellHost.classList.add('terminal');
      if (terminal) {
        bellHost.dataset.gaugeKind = classSlug(next.terminalKind || 'terminal');
        const terminalMark = bellHost.querySelector('.admin-terminal-mark');
        if (terminalMark) {
          terminalMark.setAttribute('aria-label', [next.display || next.countdown, next.detail].filter(Boolean).join(', '));
        }
        const title = bellHost.querySelector('[data-terminal-title]');
        if (title) {
          title.className = `admin-terminal-mark__title admin-terminal-mark__title--${classSlug(next.terminalKind || 'terminal')}`;
          title.textContent = next.display || next.countdown || 'School Day Ended';
        }
        const note = bellHost.querySelector('[data-terminal-note]');
        if (note) note.textContent = next.detail || '';
      }
      const fill = bellHost.querySelector('.ad-gauge__fill');
      if (fill) {
        fill.style.strokeDasharray = ringDashArray(next.pctRemaining);
        fill.style.strokeDashoffset = '0';
      }
      const valueHost = bellHost.querySelector('[data-gauge-value]');
      if (valueHost) {
        if (terminal) valueHost.innerHTML = gaugeTerminalHtml(next);
        else updateTickerText(valueHost, next.countdown);
        valueHost.setAttribute('aria-label', next.countdown);
      }
      const gauge = bellHost.querySelector('.ad-gauge');
      if (gauge) {
        const gaugeLabel = [`Next bell in ${next.countdown}`, next.label && next.detail ? `${next.label} at ${next.detail}` : '']
          .filter(Boolean)
          .join(', ');
        gauge.setAttribute('aria-label', gaugeLabel);
      }
      const eyebrow = bellHost.querySelector('[data-gauge-eyebrow]');
      if (eyebrow) eyebrow.textContent = 'Next bell';
      const progress = schoolDayProgress(currentSchedule);
      const progressHost = bellHost.querySelector('[data-day-progress]');
      if (progressHost && progress) {
        const labelHost = progressHost.querySelector('[data-day-progress-label]');
        const bar = progressHost.querySelector('[data-day-progress-bar]');
        if (labelHost) labelHost.textContent = progress.label;
        if (bar) bar.style.width = `${Math.round(progress.pct * 100)}%`;
        progressHost.setAttribute('aria-label', progress.label);
      }
      paintLiveDayTimeline(host, currentSchedule);
      todayDashboardTimer = setTimeout(tickTodayGauge, next.active ? 1000 : 60000);
    };
    clearTimeout(todayDashboardTimer);
    todayDashboardTimer = setTimeout(tickTodayGauge, bell.active ? 1000 : 60000);
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
      b.addEventListener('click', () => goTab(tab.id));
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
    wrap.className = 'admin-field ad-field';
    wrap.dataset.path = field.path;
    if (isModified(field.path)) wrap.classList.add('is-modified');

    const head = document.createElement('div');
    head.className = 'admin-field-row';
    head.innerHTML = `<label class="ad-field__label" for="${fieldId(field.path)}">${escapeHtml(field.label)}</label>`;
    const reset = document.createElement('button');
    reset.className = 'admin-field-reset'; reset.type = 'button';
    reset.textContent = isDefault(field.path) ? 'default' : 'reset to default';
    reset.disabled = isDefault(field.path);
    reset.addEventListener('click', () => {
      set(state.draft, field.path, deepClone(get(state.defaults, field.path)));
      markDirty();
      pushPreview();
      wrap.replaceWith(renderField(field));
      refreshWorkspaceLayoutSoon();
    });
    head.appendChild(reset);
    wrap.appendChild(head);

    const value = get(state.draft, field.path);

    if (field.kind === 'textarea') {
      const ta = document.createElement('textarea');
      ta.className = 'admin-textarea ad-textarea'; ta.id = fieldId(field.path);
      ta.value = value ?? '';
      ta.addEventListener('input', () => onFieldChange(field.path, ta.value));
      wrap.appendChild(ta);
    } else if (field.kind === 'color') {
      const row = document.createElement('div');
      row.className = 'admin-color-row';
      const hex = document.createElement('input');
      hex.type = 'color'; hex.value = (value || '#000000').slice(0, 7);
      const text = document.createElement('input');
      text.className = 'admin-input ad-input mono'; text.id = fieldId(field.path); text.value = value || '';
      hex.addEventListener('input', () => { text.value = hex.value; onFieldChange(field.path, hex.value); });
      text.addEventListener('input', () => { if (/^#[0-9a-fA-F]{3,8}$/.test(text.value)) hex.value = text.value.slice(0,7); onFieldChange(field.path, text.value); });
      row.append(hex, text);
      wrap.appendChild(row);
    } else if (field.kind === 'number') {
      const row = document.createElement('div');
      row.className = 'admin-number-row';
      const input = document.createElement('input');
      input.className = 'admin-input ad-input mono';
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
      input.className = 'admin-input ad-input' + (field.kind === 'url' ? ' mono' : '');
      input.id = fieldId(field.path);
      input.type = 'text';
      if (field.max) input.maxLength = field.max;
      input.value = value ?? '';
      input.addEventListener('input', () => onFieldChange(field.path, input.value));
      wrap.appendChild(input);
    }
    if (field.help) {
      const h = document.createElement('div');
      h.className = 'admin-field-help ad-field__help';
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
    text.classList.add('admin-input--below-preview');
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
    btnRow.className = 'admin-image-field-actions';
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

  const MAINTENANCE_PRESETS = [
    {
      label: 'Maintenance',
      title: 'Site paused for maintenance',
      message: 'Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon.'
    },
    {
      label: 'Security review',
      title: 'Security review in progress',
      message: 'Poolesville Schedule is paused while we complete a security review. Please check back soon.'
    },
    {
      label: 'Design update',
      title: 'Design update in progress',
      message: 'We are polishing the schedule experience right now. Please check back soon.'
    },
    {
      label: 'Bug fix',
      title: 'Fix in progress',
      message: 'Poolesville Schedule is paused while we fix an issue. Please check back soon.'
    },
    {
      label: 'Temporary outage',
      title: 'Temporary outage',
      message: 'Poolesville Schedule is temporarily unavailable. We are working to restore access as quickly as possible.'
    }
  ];

  function updateSiteStatusDraft(patch, rerender = false) {
    state.draft.siteStatus = Object.assign({}, normalizedSiteStatus(), patch);
    markDirty();
    pushPreview();
    if (rerender) renderActiveTab();
  }

  function renderAvailabilityEditor() {
    const host = document.createElement('div');
    host.className = 'admin-availability-editor';
    const status = normalizedSiteStatus();
    const maintenance = status.mode === 'maintenance';
    host.innerHTML = `
      <div class="admin-mode-row" role="group" aria-label="Public site mode">
        <button type="button" class="admin-mode-option ${maintenance ? '' : 'active'}" data-site-mode="live" aria-pressed="${maintenance ? 'false' : 'true'}" aria-controls="admin-maintenance-fields" aria-expanded="false">
          ${ICON.eye}
          <strong>Live</strong>
          <span>Visitors see the public site.</span>
        </button>
        <button type="button" class="admin-mode-option ${maintenance ? 'active' : ''}" data-site-mode="maintenance" aria-pressed="${maintenance ? 'true' : 'false'}" aria-controls="admin-maintenance-fields" aria-expanded="${maintenance ? 'true' : 'false'}">
          ${ICON.close}
          <strong>Maintenance</strong>
          <span>Visitors see the maintenance page after publish.</span>
        </button>
      </div>
      <div class="admin-maintenance-fields admin-morph-panel" id="admin-maintenance-fields" data-maintenance-fields data-open="${maintenance ? 'true' : 'false'}" aria-hidden="${maintenance ? 'false' : 'true'}">
        <div class="admin-maintenance-fields__inner">
          <div class="admin-preset-row" aria-label="Maintenance presets">
            ${MAINTENANCE_PRESETS.map((preset, index) => `<button type="button" class="admin-preset-chip" data-maintenance-preset="${index}" aria-pressed="false" ${maintenance ? '' : 'tabindex="-1"'}>${escapeHtml(preset.label)}</button>`).join('')}
          </div>
          <div class="admin-grid-2">
            <div class="admin-field">
              <div class="admin-field-row"><label for="site-status-title">Maintenance title</label></div>
              <input class="admin-input" id="site-status-title" type="text" maxlength="120" autocomplete="off" spellcheck="true" value="${escapeHtml(status.title)}" ${maintenance ? '' : 'tabindex="-1"'}>
            </div>
            <div class="admin-field">
              <div class="admin-field-row"><label for="site-status-message">Maintenance message</label></div>
              <textarea class="admin-textarea" id="site-status-message" maxlength="500" rows="3" spellcheck="true" ${maintenance ? '' : 'tabindex="-1"'}>${escapeHtml(status.message)}</textarea>
            </div>
          </div>
        </div>
      </div>
      <div class="admin-inline-note" data-availability-note>
        <strong>${maintenance ? 'Maintenance is staged.' : 'Live mode is staged.'}</strong>
        <span>Use the publish button to push this public availability state.</span>
      </div>
    `;
    const fields = host.querySelector('[data-maintenance-fields]');
    const titleInput = host.querySelector('#site-status-title');
    const messageInput = host.querySelector('#site-status-message');
    const resizeMessageInput = () => {
      if (!messageInput) return;
      const styles = getComputedStyle(messageInput);
      const min = parseFloat(styles.minHeight) || 116;
      const max = parseFloat(styles.maxHeight) || 180;
      messageInput.style.height = 'auto';
      messageInput.style.height = `${Math.min(Math.max(messageInput.scrollHeight, min), max)}px`;
    };
    const setActivePreset = (activeButton = null) => {
      host.querySelectorAll('[data-maintenance-preset]').forEach(btn => {
        const active = btn === activeButton;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };
    const setMaintenanceOpen = (isOpen) => {
      fields.dataset.open = isOpen ? 'true' : 'false';
      fields.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      [titleInput, messageInput, ...host.querySelectorAll('[data-maintenance-preset]')].forEach(el => {
        if (el) el.tabIndex = isOpen ? 0 : -1;
      });
      host.querySelectorAll('[data-site-mode]').forEach(btn => {
        const active = btn.dataset.siteMode === (isOpen ? 'maintenance' : 'live');
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.setAttribute('aria-expanded', btn.dataset.siteMode === 'maintenance' && isOpen ? 'true' : 'false');
      });
      const note = host.querySelector('[data-availability-note]');
      if (note) {
        note.querySelector('strong').textContent = isOpen ? 'Maintenance is staged.' : 'Live mode is staged.';
      }
      if (isOpen) requestAnimationFrame(resizeMessageInput);
      refreshWorkspaceLayoutSoon();
    };
    host.querySelectorAll('[data-site-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextMode = btn.dataset.siteMode;
        if (normalizedSiteStatus().mode === nextMode) return;
        updateSiteStatusDraft({ mode: nextMode }, false);
        setMaintenanceOpen(nextMode === 'maintenance');
      });
    });
    host.querySelectorAll('[data-maintenance-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = MAINTENANCE_PRESETS[Number(btn.dataset.maintenancePreset)];
        if (!preset) return;
        titleInput.value = preset.title;
        messageInput.value = preset.message;
        updateSiteStatusDraft({ title: preset.title, message: preset.message }, false);
        setActivePreset(btn);
        resizeMessageInput();
      });
    });
    titleInput?.addEventListener('input', e => {
      updateSiteStatusDraft({ title: e.target.value });
      setActivePreset();
    });
    messageInput?.addEventListener('input', e => {
      resizeMessageInput();
      updateSiteStatusDraft({ message: e.target.value });
      setActivePreset();
    });
    resizeMessageInput();
    refreshWorkspaceLayoutSoon();
    return host;
  }

  function renderSchedulePlanner() {
    const host = document.createElement('div');
    host.className = 'admin-schedule-planner';
    const dayButtonHtml = (date, selectedIso, today, month) => {
      const iso = dateToISODate(date);
      const model = resolveScheduleForDate(iso);
      const outside = date.getMonth() !== month.getMonth();
      const planned = Boolean(model.overrideType);
      const ruleDriven = String(model.ruleSource || '').startsWith('rule');
      const differs = planned && model.type !== model.baseType;
      return `
        <button type="button" class="admin-calendar-day ${outside ? 'outside' : ''} ${iso === selectedIso ? 'selected' : ''} ${iso === today ? 'today' : ''} ${ruleDriven ? 'rule-driven' : ''} ${differs ? 'differs' : planned ? 'planned' : ''}" data-planner-date="${iso}" aria-label="${escapeHtml(`${iso}, ${model.type}`)}" aria-selected="${iso === selectedIso ? 'true' : 'false'}">
          <span>${date.getDate()}</span>
          <strong>${escapeHtml(model.type)}</strong>
        </button>`;
    };
    const detailHtml = () => {
      const selectedIso = state.schedulePlannerSelectedDate || todayISODate();
      const selected = resolveScheduleForDate(selectedIso);
      const types = schedulePlannerTypes();
      return `
        <aside class="admin-planner-detail admin-morph-panel" aria-live="polite" data-planner-detail>
          <div>
            <span>Selected date</span>
            <strong>${escapeHtml((isoToLocalDate(selectedIso) || new Date()).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }))}</strong>
            <small>${escapeHtml(selected.source)}${selected.rule ? ` · ${escapeHtml(scheduleRuleSummary(selected.rule))}` : ''} · default is ${escapeHtml(selected.baseType)}</small>
          </div>
          <div class="admin-planner-type-grid">
            ${types.map(type => `<button type="button" class="${selected.type === type ? 'active' : ''}" data-planner-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join('')}
          </div>
          <div class="admin-planner-actions">
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-planner-clear ${selected.overrideType ? '' : 'disabled'}>Clear date override</button>
            ${state.scheduleDataLoading ? '<span class="admin-field-help">Loading data.json...</span>' : ''}
          </div>
        </aside>`;
    };
    const bindDateButton = (btn) => {
      btn.addEventListener('click', () => {
        preserveScrollWhile(() => {
          const previous = state.schedulePlannerSelectedDate;
          state.schedulePlannerSelectedDate = btn.dataset.plannerDate;
          host.querySelector(`[data-planner-date="${cssEscape(previous)}"]`)?.classList.remove('selected');
          host.querySelector(`[data-planner-date="${cssEscape(previous)}"]`)?.setAttribute('aria-selected', 'false');
          btn.classList.add('selected');
          btn.setAttribute('aria-selected', 'true');
          refreshPlannerDetail();
        });
      });
    };
    const refreshPlannerCount = () => {
      const count = host.querySelector('[data-planner-count]');
      if (count) count.textContent = `${Object.keys(dateOverrideMap(state.draft)).length} planned`;
    };
    const refreshPlannerDateCell = (iso) => {
      const btn = host.querySelector(`[data-planner-date="${cssEscape(iso)}"]`);
      const date = isoToLocalDate(iso);
      if (!btn || !date || !state.schedulePlannerMonth) return;
      const wrapper = document.createElement('template');
      wrapper.innerHTML = dayButtonHtml(date, state.schedulePlannerSelectedDate, todayISODate(), state.schedulePlannerMonth).trim();
      const next = wrapper.content.firstElementChild;
      btn.replaceWith(next);
      bindDateButton(next);
    };
    const bindPlannerDetail = () => {
      host.querySelectorAll('[data-planner-type]').forEach(btn => {
        btn.addEventListener('click', () => {
          preserveScrollWhile(() => {
            const selectedIso = state.schedulePlannerSelectedDate || todayISODate();
            setPlannedScheduleDate(selectedIso, btn.dataset.plannerType);
            refreshPlannerDateCell(selectedIso);
            refreshPlannerCount();
            refreshPlannerDetail();
            refreshWorkspaceLayoutSoon();
          });
        });
      });
      host.querySelector('[data-planner-clear]')?.addEventListener('click', () => {
        preserveScrollWhile(() => {
          const selectedIso = state.schedulePlannerSelectedDate || todayISODate();
          const previousType = dateOverrideMap(state.draft)[selectedIso] || '';
          setPlannedScheduleDate(selectedIso, '');
          refreshPlannerDateCell(selectedIso);
          refreshPlannerCount();
          refreshPlannerDetail();
          refreshWorkspaceLayoutSoon();
          if (previousType) {
            undoToast(`Cleared ${selectedIso}.`, () => {
              preserveScrollWhile(() => {
                setPlannedScheduleDate(selectedIso, previousType);
                refreshPlannerDateCell(selectedIso);
                refreshPlannerCount();
                refreshPlannerDetail();
                refreshWorkspaceLayoutSoon();
              });
            });
          }
        });
      });
    };
    const refreshPlannerDetail = () => {
      const detail = host.querySelector('[data-planner-detail]');
      if (!detail) return;
      const wrapper = document.createElement('template');
      wrapper.innerHTML = detailHtml().trim();
      const next = wrapper.content.firstElementChild;
      next.classList.add('is-morphing');
      detail.replaceWith(next);
      bindPlannerDetail();
    };
    const paint = () => {
      const today = todayISODate();
      if (!state.schedulePlannerSelectedDate) state.schedulePlannerSelectedDate = today;
      if (!state.schedulePlannerMonth) {
        const d = isoToLocalDate(state.schedulePlannerSelectedDate) || new Date();
        state.schedulePlannerMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      const month = state.schedulePlannerMonth;
      const selectedIso = state.schedulePlannerSelectedDate;
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
      const gridStart = addDays(monthStart, -monthStart.getDay());
      const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
      const overrideCount = Object.keys(dateOverrideMap(state.draft)).length;
      host.innerHTML = `
        <div class="admin-planner-head">
          <div>
            <div class="admin-kicker"><span>Month planner</span><b data-planner-count>${overrideCount} planned</b></div>
            <h2>${escapeHtml(month.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</h2>
          </div>
          <div class="admin-planner-nav">
            <button type="button" class="admin-btn admin-btn-sm admin-btn-icon" aria-label="Previous month" data-planner-nav="-1">${ICON.up}</button>
            <button type="button" class="admin-btn admin-btn-sm" data-planner-today>Today</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-icon" aria-label="Next month" data-planner-nav="1">${ICON.down}</button>
          </div>
        </div>
        <div class="admin-calendar" role="grid" aria-label="Schedule planner calendar">
          ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<div class="admin-calendar-weekday">${day}</div>`).join('')}
          ${cells.map(date => dayButtonHtml(date, selectedIso, today, month)).join('')}
        </div>
        ${detailHtml()}
      `;
      host.querySelectorAll('[data-planner-date]').forEach(bindDateButton);
      bindPlannerDetail();
      host.querySelectorAll('[data-planner-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
          preserveScrollWhile(() => {
            state.schedulePlannerMonth = new Date(month.getFullYear(), month.getMonth() + Number(btn.dataset.plannerNav), 1);
            paint();
          });
        });
      });
      host.querySelector('[data-planner-today]')?.addEventListener('click', () => {
        preserveScrollWhile(() => {
          state.schedulePlannerSelectedDate = today;
          const date = isoToLocalDate(today) || new Date();
          state.schedulePlannerMonth = new Date(date.getFullYear(), date.getMonth(), 1);
          paint();
        });
      });
      refreshWorkspaceLayoutSoon();
    };
    if (!state.scheduleData && !state.scheduleDataLoading) {
      loadScheduleData().then(() => {
        if (state.activeTab === 'bellSchedules' && document.body.contains(host)) paint();
      }).catch(() => {
        if (state.activeTab === 'bellSchedules' && document.body.contains(host)) paint();
      });
    }
    paint();
    return host;
  }

  // ── Custom editors ─────────────────────────────────────────────────────
  function safeHexColor(value, fallback = '#000000') {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) return '#' + raw.slice(1).split('').map(ch => ch + ch).join('').toLowerCase();
    return fallback;
  }

  function hexToRgb(value) {
    const hex = safeHexColor(value).slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function rgbToHex({ r, g, b }) {
    return '#' + [r, g, b]
      .map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('');
  }

  function mixHex(a, b, weight) {
    const left = hexToRgb(a);
    const right = hexToRgb(b);
    const t = Math.max(0, Math.min(1, Number(weight) || 0));
    return rgbToHex({
      r: left.r + (right.r - left.r) * t,
      g: left.g + (right.g - left.g) * t,
      b: left.b + (right.b - left.b) * t
    });
  }

  function themePresets(settings = state.draft) {
    if (!settings || typeof settings !== 'object') return [];
    if (!Array.isArray(settings.themePresets)) settings.themePresets = asArray(settings.themePresets);
    return settings.themePresets;
  }

  function currentThemeTokens() {
    return {
      theme: deepClone(state.draft.theme || {}),
      appearance: deepClone(state.draft.appearance || {})
    };
  }

  function applyThemeTokens(tokens) {
    if (tokens?.theme) state.draft.theme = Object.assign({}, state.draft.theme || {}, deepClone(tokens.theme));
    if (tokens?.appearance) state.draft.appearance = Object.assign({}, state.draft.appearance || {}, deepClone(tokens.appearance));
    markDirty();
    pushPreview();
  }

  // Legacy simple token editor retained as a fallback; the default Site tab uses the live canvas studio.
  // DEAD CODE — superseded by renderThemeStudioLiveCanvas(); not reachable from any dispatch. Kept for reference only.
  function renderThemeStudio() {
    const host = document.createElement('div');
    host.className = 'admin-theme-studio';
    const colorFields = [
      ['theme.accent', 'Accent'],
      ['theme.accent2', 'Secondary'],
      ['theme.bg1', 'Background start'],
      ['theme.bg2', 'Background end'],
      ['theme.fg1', 'Primary text'],
      ['theme.fg2', 'Secondary text']
    ];
    const rangeFields = [
      ['appearance.heroTitleSize', 'Hero title', 42, 160, 'px'],
      ['appearance.countdownSize', 'Countdown', 32, 100, 'px'],
      ['appearance.scheduleTitleSize', 'Schedule heading', 14, 44, 'px'],
      ['appearance.periodCardPadding', 'Period padding', 8, 34, 'px'],
      ['appearance.periodCardRadius', 'Period radius', 0, 28, 'px'],
      ['appearance.footerSize', 'Footer text', 9, 24, 'px']
    ];
    let previewReady = false;
    const previewUrl = () => {
      const url = new URL('index.html', publicPreviewBase());
      url.searchParams.set('_preview', '1');
      url.searchParams.set('_ts', String(Date.now()));
      return url.href;
    };
    const postStudioPreview = () => {
      const frame = host.querySelector('[data-theme-preview]');
      if (!frame?.contentWindow) return;
      try {
        frame.contentWindow.postMessage({ type: 'phs:preview-settings', settings: state.draft, previewDate: state.previewDate || '' }, new URL(frame.src).origin);
      } catch {}
    };
    const schedulePreviewPost = (() => {
      let timer = 0;
      return () => {
        clearTimeout(timer);
        timer = setTimeout(postStudioPreview, 32);
      };
    })();
    const setDraftValue = (path, value) => {
      set(state.draft, path, value);
      markDirty();
      pushPreview();
      schedulePreviewPost();
    };
    const paintPresets = () => {
      const list = host.querySelector('[data-theme-presets]');
      if (!list) return;
      const presets = themePresets();
      list.innerHTML = presets.length ? presets.map((preset, index) => `
        <article class="admin-theme-preset">
          <div class="admin-theme-preset__swatches">
            ${['accent', 'bg1', 'fg1'].map(key => `<i style="background:${escapeHtml(safeHexColor(preset.tokens?.theme?.[key], '#a8aaa8'))}"></i>`).join('')}
          </div>
          <div>
            <strong>${escapeHtml(preset.name || 'Untitled preset')}</strong>
            <span>${escapeHtml(preset.id || `preset-${index + 1}`)}</span>
          </div>
          <div class="admin-theme-preset__actions">
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-preset-apply="${index}">Apply</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-preset-duplicate="${index}">Duplicate</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" aria-label="Delete preset" data-preset-delete="${index}">${ICON.trash}</button>
          </div>
        </article>`).join('') : `
        <div class="admin-rule-empty admin-rule-empty--action">
          <div>
            <strong>No saved presets yet</strong>
            <span>Save the current tokens as your first reusable theme.</span>
          </div>
          <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-preset-focus>Save first preset</button>
        </div>`;
      list.querySelector('[data-preset-focus]')?.addEventListener('click', () => {
        host.querySelector('[data-preset-name]')?.focus();
      });
      list.querySelectorAll('[data-preset-apply]').forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = presets[Number(btn.dataset.presetApply)];
          if (!preset) return;
          applyThemeTokens(preset.tokens);
          refreshControls();
          schedulePreviewPost();
          toast('Preset applied to draft.', 'success', 1800);
        });
      });
      list.querySelectorAll('[data-preset-duplicate]').forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = presets[Number(btn.dataset.presetDuplicate)];
          if (!preset) return;
          presets.push({
            id: `preset-${Date.now().toString(36)}`,
            name: `${preset.name || 'Preset'} copy`,
            tokens: deepClone(preset.tokens || currentThemeTokens()),
            light: deepClone(preset.light || preset.tokens || {}),
            dark: deepClone(preset.dark || preset.tokens || {})
          });
          markDirty();
          paintPresets();
        });
      });
      list.querySelectorAll('[data-preset-delete]').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = Number(btn.dataset.presetDelete);
          const [removed] = presets.splice(index, 1);
          markDirty();
          paintPresets();
          if (removed) {
            undoToast('Theme preset deleted.', () => {
              presets.splice(index, 0, removed);
              markDirty();
              paintPresets();
            });
          }
        });
      });
      refreshWorkspaceLayoutSoon();
    };
    const refreshControls = () => {
      colorFields.forEach(([path]) => {
        const value = safeHexColor(get(state.draft, path), '#000000');
        host.querySelectorAll(`[data-theme-path="${cssEscape(path)}"]`).forEach(input => { input.value = value; });
      });
      rangeFields.forEach(([path]) => {
        const value = Number(get(state.draft, path)) || 0;
        host.querySelectorAll(`[data-theme-path="${cssEscape(path)}"]`).forEach(input => { input.value = String(value); });
        const out = host.querySelector(`[data-theme-output="${cssEscape(path)}"]`);
        if (out) out.textContent = String(value);
      });
    };
    const savePreset = () => {
      const nameInput = host.querySelector('[data-preset-name]');
      const name = String(nameInput?.value || '').trim() || `Preset ${themePresets().length + 1}`;
      const tokens = currentThemeTokens();
      themePresets().push({
        id: `preset-${Date.now().toString(36)}`,
        name,
        tokens,
        light: deepClone(tokens),
        dark: deepClone(tokens)
      });
      if (nameInput) nameInput.value = '';
      markDirty();
      paintPresets();
      toast('Theme preset saved to draft.', 'success', 2000);
    };
    const generateRamp = () => {
      const base = safeHexColor(state.draft.theme?.accent, '#a8aaa8');
      state.draft.theme = Object.assign({}, state.draft.theme, {
        accent: base,
        accent2: mixHex(base, '#000000', 0.78),
        bg1: mixHex(base, '#000000', 0.94),
        bg2: mixHex(base, '#000000', 0.84),
        fg1: mixHex(base, '#ffffff', 0.92),
        fg2: mixHex(base, '#ffffff', 0.58)
      });
      markDirty();
      refreshControls();
      pushPreview();
      schedulePreviewPost();
    };
    const resetTheme = () => {
      state.draft.theme = deepClone(state.defaults?.theme || {});
      state.draft.appearance = deepClone(state.defaults?.appearance || {});
      markDirty();
      refreshControls();
      pushPreview();
      schedulePreviewPost();
      toast('Theme reset to published defaults.', 'success', 2000);
    };
    host.innerHTML = `
      <div class="admin-theme-studio__grid">
        <section class="admin-theme-panel">
          <div class="admin-panel-heading"><h2>Tokens</h2><span>Live draft preview</span></div>
          <div class="admin-theme-color-grid">
            ${colorFields.map(([path, label]) => {
              const value = safeHexColor(get(state.draft, path), '#000000');
              return `
                <label class="admin-theme-color">
                  <span>${escapeHtml(label)}</span>
                  <input type="color" value="${escapeHtml(value)}" data-theme-path="${escapeHtml(path)}">
                  <input class="admin-input mono" type="text" value="${escapeHtml(value)}" data-theme-path="${escapeHtml(path)}" spellcheck="false">
                </label>`;
            }).join('')}
          </div>
          <div class="admin-theme-actions">
            <button type="button" class="admin-btn admin-btn-sm" data-theme-generate>Generate ramp</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-theme-reset>Reset to default</button>
          </div>
          <div class="admin-theme-range-grid">
            ${rangeFields.map(([path, label, min, max, unit]) => {
              const value = Number(get(state.draft, path)) || min;
              return `
                <label class="admin-theme-range">
                  <span>${escapeHtml(label)} <b><output data-theme-output="${escapeHtml(path)}">${value}</output>${escapeHtml(unit)}</b></span>
                  <input type="range" min="${min}" max="${max}" step="1" value="${value}" data-theme-path="${escapeHtml(path)}">
                </label>`;
            }).join('')}
          </div>
        </section>
        <section class="admin-theme-preview-panel">
          <div class="admin-panel-heading"><h2>Preview</h2><span>Draft iframe</span></div>
          <iframe data-theme-preview title="Theme preview" src="${escapeHtml(previewUrl())}"></iframe>
        </section>
      </div>
      <div class="admin-theme-presets">
        <div class="admin-panel-heading"><h2>Presets</h2><span>${themePresets().length} saved</span></div>
        <div class="admin-theme-save-row">
          <input class="admin-input" type="text" placeholder="Preset name" data-preset-name>
          <button type="button" class="ad-btn ad-btn--primary" data-preset-save>${ICON.plus}<span>Save preset</span></button>
        </div>
        <div class="admin-theme-preset-list" data-theme-presets></div>
      </div>
      <details class="admin-advanced-renderer">
        <summary>Advanced visual editor</summary>
        <div>
          <p>Open the experimental canvas only when you need object-level page composition.</p>
          <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-theme-advanced-open>Open visual editor</button>
        </div>
      </details>`;
    host.querySelectorAll('[data-theme-path]').forEach(input => {
      input.addEventListener('input', () => {
        const path = input.dataset.themePath;
        if (input.type === 'range') {
          setDraftValue(path, Number(input.value));
          const out = host.querySelector(`[data-theme-output="${cssEscape(path)}"]`);
          if (out) out.textContent = input.value;
          return;
        }
        const value = safeHexColor(input.value, get(state.draft, path) || '#000000');
        setDraftValue(path, value);
        host.querySelectorAll(`[data-theme-path="${cssEscape(path)}"]`).forEach(peer => {
          if (peer !== input) peer.value = value;
        });
      });
    });
    host.querySelector('[data-theme-generate]')?.addEventListener('click', generateRamp);
    host.querySelector('[data-theme-reset]')?.addEventListener('click', resetTheme);
    host.querySelector('[data-preset-save]')?.addEventListener('click', savePreset);
    host.querySelector('[data-theme-advanced-open]')?.addEventListener('click', () => {
      host.replaceWith(renderThemeStudioLiveCanvas());
    });
    host.querySelector('[data-theme-preview]')?.addEventListener('load', () => {
      previewReady = true;
      postStudioPreview();
    });
    paintPresets();
    return host;
  }

  // Legacy object-canvas studio retained for historical drafts; the live public-site canvas is the default.
  // DEAD CODE — superseded by renderThemeStudioLiveCanvas(); not reachable from any dispatch. Kept for reference only.
  function renderThemeStudioCanvas() {
    const host = document.createElement('div');
    host.className = 'admin-theme-studio admin-theme-studio--canvas';
    const colorFields = [
      ['theme.accent', 'Accent'],
      ['theme.accent2', 'Secondary'],
      ['theme.bg1', 'Background start'],
      ['theme.bg2', 'Background end'],
      ['theme.fg1', 'Primary text'],
      ['theme.fg2', 'Secondary text']
    ];
    const rangeFields = [
      ['appearance.heroTitleSize', 'Hero title', 42, 160, 'px'],
      ['appearance.countdownSize', 'Countdown', 32, 100, 'px'],
      ['appearance.scheduleTitleSize', 'Schedule heading', 14, 44, 'px'],
      ['appearance.periodCardPadding', 'Period padding', 8, 34, 'px'],
      ['appearance.periodCardRadius', 'Period radius', 0, 28, 'px'],
      ['appearance.footerSize', 'Footer text', 9, 24, 'px']
    ];
    const pages = [
      { id: 'schedule', label: 'Schedule', path: 'index.html', x: 32, y: 32, w: 500, h: 560 },
      { id: 'announcements', label: 'Announcements', path: 'announcements.html', x: 458, y: 72, w: 300, h: 400 },
      { id: 'grades', label: 'Grades', path: 'gradeviewer.html', x: 360, y: 500, w: 340, h: 260 }
    ];
    const layoutKey = 'phs:admin-theme-canvas-layout:v1';
    const defaultLayout = () => Object.fromEntries(pages.map(page => [page.id, { x: page.x, y: page.y, w: page.w, h: page.h }]));
    const loadLayout = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(layoutKey) || '{}');
        return Object.assign(defaultLayout(), parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        return defaultLayout();
      }
    };
    let canvasLayout = loadLayout();
    const saveLayout = () => {
      try { localStorage.setItem(layoutKey, JSON.stringify(canvasLayout)); } catch {}
    };
    const previewUrl = page => {
      const url = new URL(page.path, publicPreviewBase());
      url.searchParams.set('_preview', '1');
      url.searchParams.set('_ts', String(Date.now()));
      return url.href;
    };
    const postStudioPreview = () => {
      host.querySelectorAll('[data-theme-preview]').forEach(frame => {
        if (!frame?.contentWindow) return;
        try {
          frame.contentWindow.postMessage({ type: 'phs:preview-settings', settings: state.draft, previewDate: state.previewDate || '' }, new URL(frame.src).origin);
        } catch {}
      });
    };
    const schedulePreviewPost = (() => {
      let timer = 0;
      return () => {
        clearTimeout(timer);
        timer = setTimeout(postStudioPreview, 32);
      };
    })();
    const setDraftValue = (path, value) => {
      set(state.draft, path, value);
      markDirty();
      pushPreview();
      schedulePreviewPost();
    };
    const refreshControls = () => {
      colorFields.forEach(([path]) => {
        const value = safeHexColor(get(state.draft, path), '#000000');
        host.querySelectorAll(`[data-theme-path="${cssEscape(path)}"]`).forEach(input => { input.value = value; });
      });
      rangeFields.forEach(([path]) => {
        const value = Number(get(state.draft, path)) || 0;
        host.querySelectorAll(`[data-theme-path="${cssEscape(path)}"]`).forEach(input => { input.value = String(value); });
        const out = host.querySelector(`[data-theme-output="${cssEscape(path)}"]`);
        if (out) out.textContent = String(value);
      });
    };
    const paintCanvasPositions = () => {
      const canvas = host.querySelector('[data-theme-canvas]');
      const rect = canvas?.getBoundingClientRect();
      host.querySelectorAll('[data-theme-page]').forEach(panel => {
        const page = pages.find(item => item.id === panel.dataset.themePage);
        const layout = canvasLayout[panel.dataset.themePage] || page;
        const w = rect ? Math.min(layout.w, Math.max(260, rect.width - 24)) : layout.w;
        const h = rect ? Math.min(layout.h, Math.max(220, rect.height - 24)) : layout.h;
        const x = rect ? Math.max(0, Math.min(rect.width - w, layout.x)) : layout.x;
        const y = rect ? Math.max(0, Math.min(rect.height - h, layout.y)) : layout.y;
        panel.style.setProperty('--x', `${x}px`);
        panel.style.setProperty('--y', `${y}px`);
        panel.style.setProperty('--w', `${w}px`);
        panel.style.setProperty('--h', `${h}px`);
      });
    };
    const paintPresets = () => {
      const list = host.querySelector('[data-theme-presets]');
      if (!list) return;
      const presets = themePresets();
      list.innerHTML = presets.length ? presets.map((preset, index) => `
        <article class="admin-theme-preset">
          <div class="admin-theme-preset__swatches">
            ${['accent', 'bg1', 'fg1'].map(key => `<i style="background:${escapeHtml(safeHexColor(preset.tokens?.theme?.[key], '#a8aaa8'))}"></i>`).join('')}
          </div>
          <div>
            <strong>${escapeHtml(preset.name || 'Untitled preset')}</strong>
            <span>${escapeHtml(preset.id || `preset-${index + 1}`)}</span>
          </div>
          <div class="admin-theme-preset__actions">
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-preset-apply="${index}">Apply</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-preset-duplicate="${index}">Duplicate</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" aria-label="Delete preset" data-preset-delete="${index}">${ICON.trash}</button>
          </div>
        </article>`).join('') : '<div class="admin-rule-empty">No saved theme presets yet.</div>';
      list.querySelectorAll('[data-preset-apply]').forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = presets[Number(btn.dataset.presetApply)];
          if (!preset) return;
          applyThemeTokens(preset.tokens);
          refreshControls();
          schedulePreviewPost();
          toast('Preset applied to draft.', 'success', 1800);
        });
      });
      list.querySelectorAll('[data-preset-duplicate]').forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = presets[Number(btn.dataset.presetDuplicate)];
          if (!preset) return;
          presets.push({
            id: `preset-${Date.now().toString(36)}`,
            name: `${preset.name || 'Preset'} copy`,
            tokens: deepClone(preset.tokens || currentThemeTokens()),
            light: deepClone(preset.light || preset.tokens || {}),
            dark: deepClone(preset.dark || preset.tokens || {})
          });
          markDirty();
          paintPresets();
        });
      });
      list.querySelectorAll('[data-preset-delete]').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = Number(btn.dataset.presetDelete);
          const [removed] = presets.splice(index, 1);
          markDirty();
          paintPresets();
          if (removed) {
            undoToast('Theme preset deleted.', () => {
              presets.splice(index, 0, removed);
              markDirty();
              paintPresets();
            });
          }
        });
      });
      refreshWorkspaceLayoutSoon();
    };
    const generateRamp = () => {
      const base = safeHexColor(state.draft.theme?.accent, '#a8aaa8');
      state.draft.theme = Object.assign({}, state.draft.theme, {
        accent: base,
        accent2: mixHex(base, '#000000', 0.78),
        bg1: mixHex(base, '#000000', 0.94),
        bg2: mixHex(base, '#000000', 0.84),
        fg1: mixHex(base, '#ffffff', 0.92),
        fg2: mixHex(base, '#ffffff', 0.58)
      });
      markDirty();
      refreshControls();
      pushPreview();
      schedulePreviewPost();
    };
    const resetTheme = () => {
      state.draft.theme = deepClone(state.defaults?.theme || {});
      state.draft.appearance = deepClone(state.defaults?.appearance || {});
      markDirty();
      refreshControls();
      pushPreview();
      schedulePreviewPost();
      toast('Theme reset to published defaults.', 'success', 2000);
    };
    const savePreset = () => {
      const nameInput = host.querySelector('[data-preset-name]');
      const name = String(nameInput?.value || '').trim() || `Preset ${themePresets().length + 1}`;
      const tokens = currentThemeTokens();
      themePresets().push({
        id: `preset-${Date.now().toString(36)}`,
        name,
        tokens,
        light: deepClone(tokens),
        dark: deepClone(tokens)
      });
      if (nameInput) nameInput.value = '';
      markDirty();
      paintPresets();
      toast('Theme preset saved to draft.', 'success', 2000);
    };

    host.innerHTML = `
      <div class="admin-theme-console">
        <aside class="admin-theme-inspector">
          <div class="admin-theme-inspector__head">
            <div><h2>Theme Studio</h2><span>Draft tokens and live page canvas</span></div>
          </div>
          <section class="admin-theme-inspector__section">
            <div class="admin-panel-heading"><h2>Palette</h2><span>One draft source</span></div>
            <div class="admin-theme-color-grid">
              ${colorFields.map(([path, label]) => {
                const value = safeHexColor(get(state.draft, path), '#000000');
                return `
                  <label class="admin-theme-color">
                    <span>${escapeHtml(label)}</span>
                    <input type="color" value="${escapeHtml(value)}" data-theme-path="${escapeHtml(path)}">
                    <input class="admin-input mono" type="text" value="${escapeHtml(value)}" data-theme-path="${escapeHtml(path)}" spellcheck="false">
                  </label>`;
              }).join('')}
            </div>
            <div class="admin-theme-actions">
              <button type="button" class="admin-btn admin-btn-sm" data-theme-generate>Generate ramp</button>
              <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-theme-reset>Reset to default</button>
            </div>
          </section>
          <section class="admin-theme-inspector__section">
            <div class="admin-panel-heading"><h2>Type and shape</h2><span>Live in preview</span></div>
            <div class="admin-theme-range-grid">
              ${rangeFields.map(([path, label, min, max, unit]) => {
                const value = Number(get(state.draft, path)) || min;
                return `
                  <label class="admin-theme-range">
                    <span>${escapeHtml(label)} <b><output data-theme-output="${escapeHtml(path)}">${value}</output>${escapeHtml(unit)}</b></span>
                    <input type="range" min="${min}" max="${max}" step="1" value="${value}" data-theme-path="${escapeHtml(path)}">
                  </label>`;
              }).join('')}
            </div>
          </section>
        </aside>
        <section class="admin-theme-canvas-shell">
          <div class="admin-theme-canvas-toolbar">
            <div><h2>Page canvas</h2><span>Drag page panels to arrange the public experience.</span></div>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-theme-canvas-reset>Reset canvas</button>
          </div>
          <div class="admin-theme-canvas" data-theme-canvas>
            <svg class="admin-theme-canvas__links" viewBox="0 0 1120 820" aria-hidden="true" focusable="false">
              <path d="M306 102 C520 50 640 128 794 164" />
              <path d="M322 552 C466 468 590 504 712 648" />
            </svg>
            ${pages.map(page => {
              const layout = canvasLayout[page.id] || page;
              return `
                <article class="admin-theme-panel-window admin-theme-panel-window--${escapeHtml(page.id)}" data-theme-page="${escapeHtml(page.id)}" style="--x:${layout.x}px;--y:${layout.y}px;--w:${layout.w}px;--h:${layout.h}px">
                  <div class="admin-theme-panel-window__bar" data-theme-drag-handle>
                    <span>${escapeHtml(page.label)}</span>
                    <small>draft</small>
                  </div>
                  <iframe data-theme-preview title="${escapeHtml(page.label)} draft preview" src="${escapeHtml(previewUrl(page))}"></iframe>
                </article>`;
            }).join('')}
          </div>
        </section>
      </div>
      <div class="admin-theme-presets">
        <div class="admin-panel-heading"><h2>Presets</h2><span>${themePresets().length} saved</span></div>
        <div class="admin-theme-save-row">
          <input class="admin-input" type="text" placeholder="Preset name" data-preset-name>
          <button type="button" class="ad-btn ad-btn--primary" data-preset-save>${ICON.plus}<span>Save preset</span></button>
        </div>
        <div class="admin-theme-preset-list" data-theme-presets></div>
      </div>`;

    host.querySelectorAll('[data-theme-path]').forEach(input => {
      input.addEventListener('input', () => {
        const path = input.dataset.themePath;
        if (input.type === 'range') {
          setDraftValue(path, Number(input.value));
          const out = host.querySelector(`[data-theme-output="${cssEscape(path)}"]`);
          if (out) out.textContent = input.value;
          return;
        }
        const value = safeHexColor(input.value, get(state.draft, path) || '#000000');
        setDraftValue(path, value);
        host.querySelectorAll(`[data-theme-path="${cssEscape(path)}"]`).forEach(peer => {
          if (peer !== input) peer.value = value;
        });
      });
    });
    host.querySelector('[data-theme-generate]')?.addEventListener('click', generateRamp);
    host.querySelector('[data-theme-reset]')?.addEventListener('click', resetTheme);
    host.querySelector('[data-preset-save]')?.addEventListener('click', savePreset);
    host.querySelector('[data-theme-canvas-reset]')?.addEventListener('click', () => {
      canvasLayout = defaultLayout();
      saveLayout();
      paintCanvasPositions();
      toast('Canvas layout reset.', 'success', 1600);
    });
    host.querySelectorAll('[data-theme-preview]').forEach(frame => frame.addEventListener('load', postStudioPreview));
    host.querySelectorAll('[data-theme-drag-handle]').forEach(handle => {
      handle.addEventListener('pointerdown', event => {
        const panel = handle.closest('[data-theme-page]');
        const canvas = host.querySelector('[data-theme-canvas]');
        if (!panel || !canvas) return;
        event.preventDefault();
        handle.setPointerCapture?.(event.pointerId);
        const pageId = panel.dataset.themePage;
        const start = { ...(canvasLayout[pageId] || defaultLayout()[pageId]) };
        const startX = event.clientX;
        const startY = event.clientY;
        panel.classList.add('is-dragging');
        const move = moveEvent => {
          const rect = canvas.getBoundingClientRect();
          const width = Number(start.w) || panel.offsetWidth;
          const height = Number(start.h) || panel.offsetHeight;
          canvasLayout[pageId] = {
            ...start,
            x: Math.max(0, Math.min(rect.width - width, start.x + moveEvent.clientX - startX)),
            y: Math.max(0, Math.min(rect.height - height, start.y + moveEvent.clientY - startY))
          };
          paintCanvasPositions();
        };
        const up = () => {
          panel.classList.remove('is-dragging');
          saveLayout();
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up, { once: true });
      });
    });
    paintPresets();
    paintCanvasPositions();
    return host;
  }

  function renderNavEditor() {
    const host = document.createElement('div');
    state.draft.nav = state.draft.nav || { items: [] };
    const items = state.draft.nav.items;
    function paint() {
      host.innerHTML = '';
      items.forEach((it, i) => {
        const labelId = `nav-item-${i}-label`;
        const hrefId = `nav-item-${i}-href`;
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
            <div class="admin-field admin-field--flush">
              <div class="admin-field-row"><label for="${labelId}">Label</label></div>
              <input id="${labelId}" class="admin-input" data-field="label" value="${escapeHtml(it.label || '')}" maxlength="60">
            </div>
            <div class="admin-field admin-field--flush">
              <div class="admin-field-row"><label for="${hrefId}">Href</label></div>
              <input id="${hrefId}" class="admin-input mono" data-field="href" value="${escapeHtml(it.href || '')}" maxlength="500">
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

  function announcementScheduleStatus(card) {
    const today = todayISODate();
    const showFrom = String(card?.showFrom || '').trim();
    const expiresOn = String(card?.expiresOn || '').trim();
    if (expiresOn && expiresOn < today) return { label: 'Expired', tone: 'expired' };
    if (showFrom && showFrom > today) return { label: 'Scheduled', tone: 'scheduled' };
    return { label: 'Live', tone: 'live' };
  }

  function renderAnnouncementsEditor() {
    const host = document.createElement('div');
    state.draft.announcements = state.draft.announcements || { items: [] };
    const items = state.draft.announcements.items;
    function paint() {
      host.innerHTML = '';
      items.forEach((card, i) => {
        const scheduleStatus = announcementScheduleStatus(card);
        const titleId = `announcement-${i}-title`;
        const showId = `announcement-${i}-show-from`;
        const expireId = `announcement-${i}-expire-on`;
        const wrap = document.createElement('div');
        wrap.className = 'admin-list-item';
        wrap.innerHTML = `
          <div class="admin-list-item-head">
            <span class="handle">Card ${i + 1}</span>
            <span class="admin-announcement-status ${escapeHtml(scheduleStatus.tone)}">${escapeHtml(scheduleStatus.label)}</span>
            <div class="admin-list-item-actions">
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Move up" aria-label="Move announcement card ${i + 1} up" data-act="up" ${i===0 ? 'disabled' : ''}>${ICON.up}</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" title="Move down" aria-label="Move announcement card ${i + 1} down" data-act="down" ${i===items.length-1 ? 'disabled' : ''}>${ICON.down}</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" title="Remove" aria-label="Remove announcement card ${i + 1}" data-act="del">${ICON.trash}</button>
            </div>
          </div>
          <div class="admin-field">
            <div class="admin-field-row"><label for="${titleId}">Title</label></div>
            <input id="${titleId}" class="admin-input" data-card-field="title" value="${escapeHtml(card.title || '')}" maxlength="200">
          </div>
          <div class="admin-grid-2 admin-announcement-schedule">
            <div class="admin-field">
              <div class="admin-field-row"><label for="${showId}">Show from</label></div>
              <input id="${showId}" class="admin-input mono" data-card-field="showFrom" type="date" value="${escapeHtml(card.showFrom || '')}">
            </div>
            <div class="admin-field">
              <div class="admin-field-row"><label for="${expireId}">Expire on</label></div>
              <input id="${expireId}" class="admin-input mono" data-card-field="expiresOn" type="date" value="${escapeHtml(card.expiresOn || '')}">
            </div>
          </div>
          <div class="admin-field admin-field--tight">
            <div class="admin-field-row"><label>Bullets</label></div>
            <div data-bullets></div>
          </div>
          ${(!String(card.title || '').trim() || !asArray(card.bullets).some(b => String(b || '').trim())) ? '<div class="admin-inline-note admin-inline-note--warn"><strong>Incomplete card</strong><span>Add a title and at least one bullet, or remove this announcement.</span></div>' : ''}
          <button type="button" class="admin-btn admin-btn-sm" data-act="add-bullet">${ICON.plus}<span>Add bullet</span></button>`;
        wrap.querySelectorAll('[data-card-field]').forEach(input => {
          input.addEventListener('input', e => {
            card[e.target.dataset.cardField] = e.target.value;
            markDirty();
            pushPreview();
          });
        });
        const bulletsHost = wrap.querySelector('[data-bullets]');
        function paintBullets() {
          bulletsHost.innerHTML = '';
          (card.bullets || []).forEach((b, j) => {
            const row = document.createElement('div');
            row.className = 'admin-bullet-row';
            row.innerHTML = `
              <input class="admin-input" value="${escapeHtml(b)}" maxlength="2000" aria-label="Bullet ${j + 1} for announcement card ${i + 1}">
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
      addBtn.addEventListener('click', () => { items.push({ title: 'New announcement', bullets: [''], showFrom: '', expiresOn: '' }); markDirty(); paint(); pushPreview(); });
      host.appendChild(addBtn);
    }
    paint();
    return host;
  }

  function renderScheduleOverrideEditor() {
    const host = document.createElement('div');
    const baseTypes = ['none', 'Normal Schedule', 'Advisory', 'Early Release', 'Assembly', 'Exam Day', 'No School'];
    const extraTypes = Object.keys(state.draft.bellSchedules || {})
      .filter(t => t && t !== '_dateOverrides' && !baseTypes.includes(t) && Object.keys(state.draft.bellSchedules[t] || {}).length);
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

  function rowsToTemplate(rows) {
    const out = {};
    rows
      .slice()
      .sort((a, b) => a.start - b.start)
      .forEach(row => {
        out[String(row.start)] = [row.end, row.name || 'Period'];
      });
    return out;
  }

  function scheduleStudioIssues(rows) {
    const issues = [];
    const sorted = rows.slice().sort((a, b) => a.start - b.start);
    sorted.forEach((row, index) => {
      if (!String(row.name || '').trim()) issues.push(`Row ${index + 1} needs a name.`);
      if (row.end <= row.start) issues.push(`${row.name || `Row ${index + 1}`} ends before it starts.`);
      const previous = sorted[index - 1];
      if (previous && row.start < previous.end) issues.push(`${row.name || `Row ${index + 1}`} overlaps ${previous.name || 'the previous row'}.`);
    });
    return issues;
  }

  function scheduleStudioGaps(rows) {
    const sorted = rows.slice().sort((a, b) => a.start - b.start);
    return sorted.map((row, index) => {
      const previous = sorted[index - 1];
      if (!previous || row.start <= previous.end + 60) return null;
      return `${Math.round((row.start - previous.end) / 60)}m passing gap before ${row.name || `row ${index + 1}`}`;
    }).filter(Boolean);
  }

  function renderScheduleStudio() {
    const host = document.createElement('div');
    state.draft.bellSchedules = state.draft.bellSchedules || {};
    const baseTypes = ['Normal Schedule', 'Advisory', 'Early Release', 'Assembly', 'Exam Day'];
    const extraTypes = Object.keys(state.draft.bellSchedules || {}).filter(t => t && t !== '_dateOverrides' && !baseTypes.includes(t));
    const types = [...baseTypes, ...extraTypes].filter((type, index, list) => list.indexOf(type) === index);
    let activeType = types[0] || 'Normal Schedule';
    const snap = seconds => Math.max(4 * 3600, Math.min(22 * 3600, Math.round(seconds / 300) * 300));
    const commitRows = rows => {
      state.draft.bellSchedules[activeType] = rowsToTemplate(rows);
      markDirty();
      pushPreview();
    };

    function rowsForActive() {
      const directRows = scheduleRows(state.draft.bellSchedules[activeType] || {});
      if (directRows.length) return directRows;
      const fallbackEntry = Object.values(state.scheduleData || {}).find(entry => Array.isArray(entry) && entry[0] === activeType);
      return scheduleRows(fallbackEntry?.[1] || {});
    }

    function paint() {
      const rows = rowsForActive();
      const starts = rows.map(row => row.start);
      const ends = rows.map(row => row.end);
      const min = Math.min(7 * 3600, ...starts);
      const max = Math.max(16 * 3600, ...ends);
      const span = Math.max(3600, max - min);
      const issues = scheduleStudioIssues(rows);
      const gaps = scheduleStudioGaps(rows);
      const minutes = rows.reduce((sum, row) => sum + Math.max(0, row.end - row.start), 0) / 60;
      const ticks = [];
      for (let t = Math.ceil(min / 3600) * 3600; t <= max; t += 3600) ticks.push(t);
	    host.innerHTML = `
	        <div class="admin-studio-toolbar">
	          <label class="admin-field admin-field--flush">
	            <div class="admin-field-row"><span>Template</span></div>
	            <select class="admin-select" data-studio-template>
              ${types.map(type => `<option value="${escapeHtml(type)}" ${type === activeType ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
            </select>
          </label>
          <div class="admin-studio-summary ${issues.length ? 'has-issues' : ''}">
            <strong>${issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Clean template'}</strong>
            <span>${issues[0] ? escapeHtml(issues[0]) : `${rows.length} blocks · ${Math.round(minutes)} scheduled minutes · drag an edge to adjust time`}</span>
          </div>
        </div>
        <div class="admin-schedule-studio">
          <div class="admin-schedule-studio__ticks">
            ${ticks.map(t => `<span style="top:${((t - min) / span) * 100}%">${escapeHtml(secondsToClock(t).replace(':00', ''))}</span>`).join('')}
          </div>
          <div class="admin-schedule-studio__rail" data-studio-rail>
            ${ticks.map(t => `<i style="top:${((t - min) / span) * 100}%"></i>`).join('')}
            ${rows.map((row, index) => {
              const top = ((row.start - min) / span) * 100;
              const height = Math.max(4, ((row.end - row.start) / span) * 100);
              const previous = rows[index - 1];
              const next = rows[index + 1];
              const hasIssue = row.end <= row.start || (previous && row.start < previous.end) || (next && next.start < row.end);
              const duration = Math.round((row.end - row.start) / 60);
              return `
                <article class="admin-schedule-block ${hasIssue ? 'has-issue' : ''}" style="top:${top}%;height:${height}%">
                  <button type="button" class="admin-schedule-block__handle top" data-drag-edge="start" data-drag-index="${index}" aria-label="Adjust ${escapeHtml(row.name)} start"></button>
                  <div class="admin-schedule-block__time">${escapeHtml(secondsToClock(row.start))}</div>
                  <div class="admin-schedule-block__body">
                    <strong>${escapeHtml(row.name)}</strong>
                    <span>${escapeHtml(secondsToClock(row.start))} - ${escapeHtml(secondsToClock(row.end))} · ${duration}m</span>
                  </div>
                  <button type="button" class="admin-schedule-block__handle bottom" data-drag-edge="end" data-drag-index="${index}" aria-label="Adjust ${escapeHtml(row.name)} end"></button>
                </article>`;
            }).join('')}
          </div>
        </div>
        <div class="admin-studio-issues">
          ${issues.length ? issues.map(issue => `<div class="admin-inline-note admin-inline-note--warn"><strong>Check</strong><span>${escapeHtml(issue)}</span></div>`).join('') : `
            <div class="admin-schedule-gap-row">
              ${gaps.slice(0, 5).map(gap => `<span>${escapeHtml(gap)}</span>`).join('') || '<span>No overlaps or timing conflicts.</span>'}
            </div>`}
        </div>`;

      host.querySelector('[data-studio-template]')?.addEventListener('change', event => {
        activeType = event.target.value;
        paint();
      });
      host.querySelectorAll('[data-drag-edge]').forEach(handle => {
        handle.addEventListener('pointerdown', event => {
          event.preventDefault();
          handle.setPointerCapture?.(event.pointerId);
          const rail = host.querySelector('[data-studio-rail]');
          const index = Number(handle.dataset.dragIndex);
          const edge = handle.dataset.dragEdge;
          const move = moveEvent => {
            const rect = rail.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (moveEvent.clientY - rect.top) / rect.height));
            const nextRows = rowsForActive();
            const row = nextRows[index];
            if (!row) return;
            const nextSeconds = snap(min + pct * span);
            if (edge === 'start') row.start = Math.min(nextSeconds, row.end - 300);
            else row.end = Math.max(nextSeconds, row.start + 300);
            commitRows(nextRows);
            paint();
          };
          const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
          };
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up, { once: true });
        });
      });
      refreshWorkspaceLayoutSoon();
    }

    if (!state.scheduleData && !state.scheduleDataLoading) {
      loadScheduleData().then(() => {
        if (state.activeTab === 'bellSchedules' && document.body.contains(host)) paint();
      }).catch(() => {
        if (state.activeTab === 'bellSchedules' && document.body.contains(host)) paint();
      });
    }
    paint();
    return host;
  }

  function renderBellEditor() {
    const host = document.createElement('div');
    state.draft.bellSchedules = state.draft.bellSchedules || {};
    const baseTypes = ['Normal Schedule', 'Advisory', 'Early Release', 'Assembly', 'Exam Day'];
    const extraTypes = Object.keys(state.draft.bellSchedules || {}).filter(t => t && t !== '_dateOverrides' && !baseTypes.includes(t));
    const types = [...baseTypes, ...extraTypes];
    let activeType = types[0];

    const tabs = document.createElement('div');
    tabs.className = 'admin-preview-bar';
    tabs.classList.add('admin-preview-bar--flush');
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
        <div class="admin-bell-row admin-bell-row--head">
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
        row.querySelector('[data-f=name]').addEventListener('input', e => { rows[i].name = e.target.value; commit(rows); });
        row.querySelector('[data-f=start]').addEventListener('change', e => { const s = hhmmToSecs(e.target.value); if (isPresent(s)) { rows[i].start = s; commit(rows); paintBody(); } });
        row.querySelector('[data-f=end]').addEventListener('change',   e => { const s = hhmmToSecs(e.target.value); if (isPresent(s)) { rows[i].end   = s; commit(rows); paintBody(); } });
        row.querySelector('[data-f=del]').addEventListener('click', () => { rows.splice(i, 1); commit(rows); paintBody(); });
        body.appendChild(row);
      });

      const actions = document.createElement('div');
      actions.className = 'admin-bell-actions';
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
      help.classList.add('admin-field-help--spaced');
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
        const textareaId = `privacy-paragraph-${i}`;
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
          <label class="sr-only" for="${textareaId}">Privacy paragraph ${i + 1}</label>
          <textarea id="${textareaId}" class="admin-textarea admin-textarea--privacy" maxlength="4000" placeholder="Write one clear paragraph for the privacy modal.">${escapeHtml(p)}</textarea>`;
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
      if (isNil(start) || isNil(end) || end <= start) continue;
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

        <div class="row-gap-8 row-gap-8--spaced">
          <button type="button" class="admin-btn admin-btn-primary" id="oi-extract" ${data.images.length ? '' : 'disabled'}>Extract Schedule</button>
          <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" id="oi-clear-images" ${data.images.length ? '' : 'disabled'}>Remove all images</button>
          <span class="admin-field-help" id="oi-status"></span>
        </div>

        <div class="admin-field">
          <div class="admin-field-row"><label>2 · Preview rows (editable)</label></div>
          <table class="admin-import-table" id="oi-table"></table>
          <button type="button" class="admin-btn admin-btn-sm admin-btn--field-spaced" id="oi-add-row">+ Add row</button>
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
        tbl.innerHTML = `<tbody><tr><td colspan="5" class="admin-field-help admin-import-empty-cell">No rows yet. Upload schedule images, then click Extract Schedule.</td></tr></tbody>`;
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
        data.images.push({ id: uniqueId('image'), name: f.name, dataUrl, status: 'ready' });
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
        if (resp.disabled) throw new Error(resp.error || 'Schedule image extraction is not configured here.');
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
            id: uniqueId('attachment'),
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
      const keys = Object.keys(pending.patch || {});
      const approved = pending.approved || Object.fromEntries(keys.map(key => [key, true]));
      const afterDraft = deepClone(pending.beforeDraft || state.draft);
      applySettingsPatch(afterDraft, pending.patch || {});
      const diff = publishDiffDetails(pending.patch || {}, pending.beforeDraft || state.draft, afterDraft);
      if (!pending.applied) {
        return `
          <div class="admin-jarvis-pending admin-jarvis-pending--plan">
            <div>
              <strong>${escapeHtml(pending.summary || 'Draft plan ready')}</strong>
              <span>Approve the pieces you want before Jarvis touches the draft.</span>
            </div>
            <div class="admin-jarvis-plan-list">
              ${diff.map(section => `
                <label class="admin-jarvis-plan-row">
                  <input type="checkbox" data-jarvis-section="${escapeHtml(section.key)}" ${approved[section.key] !== false ? 'checked' : ''}>
                  <span><strong>${escapeHtml(section.label)}</strong><small>${escapeHtml(section.items.join('; '))}</small></span>
                </label>`).join('') || '<div class="admin-field-help">Jarvis did not propose a settings change.</div>'}
            </div>
            <div class="row-gap-8">
              <button type="button" class="admin-btn admin-btn-sm admin-btn-primary" data-jarvis-act="apply-approved">Apply approved</button>
              <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-jarvis-act="reject">Reject</button>
            </div>
          </div>`;
      }
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
      const pageScroll = { left: window.scrollX || 0, top: window.scrollY || 0 };
      const restorePageScroll = () => {
        const desktopJarvis = window.matchMedia?.('(min-width: 861px)').matches;
        window.scrollTo({ left: desktopJarvis ? 0 : pageScroll.left, top: desktopJarvis ? 0 : pageScroll.top, behavior: 'auto' });
      };
      const busy = !!state.jarvis.busy;
      const hasConversation = state.jarvis.messages.length > 1;
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
      restorePageScroll();
      requestAnimationFrame(restorePageScroll);
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
      host.querySelectorAll('[data-jarvis-section]').forEach(input => {
        input.addEventListener('change', () => {
          if (!state.jarvis.pending) return;
          state.jarvis.pending.approved = state.jarvis.pending.approved || {};
          state.jarvis.pending.approved[input.dataset.jarvisSection] = input.checked;
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
      host.querySelector('[data-jarvis-act="apply-approved"]')?.addEventListener('click', () => {
        const pending = state.jarvis.pending;
        if (!pending) return;
        const selectedPatch = {};
        const approved = pending.approved || {};
        for (const [key, value] of Object.entries(pending.patch || {})) {
          if (approved[key] !== false) selectedPatch[key] = value;
        }
        if (!Object.keys(selectedPatch).length) {
          toast('No Jarvis changes selected.', 'error', 2500);
          return;
        }
        const beforeDraft = deepClone(state.draft);
        applySettingsPatch(state.draft, selectedPatch);
        state.jarvis.undoStack.unshift({ beforeDraft, patch: selectedPatch, at: new Date().toISOString() });
        state.jarvis.undoStack = state.jarvis.undoStack.slice(0, 8);
        state.jarvis.pending = {
          ...pending,
          patch: selectedPatch,
          sections: Object.keys(selectedPatch),
          beforeDraft,
          applied: true
        };
        markDirty();
        pushPreview();
        state.jarvis.messages.push({ role: 'assistant', text: 'Approved changes are now staged in the draft.' });
        paint();
      });
      host.querySelector('[data-jarvis-act="reject"]')?.addEventListener('click', () => {
        state.jarvis.pending = null;
        state.jarvis.messages.push({ role: 'assistant', text: 'Plan rejected. The draft was not changed.' });
        paint();
      });
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
          state.jarvis.pending = {
            patch,
            sections,
            summary: resp.summary || 'Draft plan ready',
            beforeDraft,
            approved: Object.fromEntries(Object.keys(patch).map(key => [key, true])),
            applied: false
          };
        }
        state.jarvis.messages.push({ role: 'assistant', text: resp.reply || (sections.length ? 'I drafted a plan. Approve the parts you want to stage.' : 'I need more detail before changing anything.') });
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
    host.innerHTML = renderLoadingState('Loading backups');
    api('/admin/backups?limit=50').then(j => {
      const storage = j.storage;
      const storageNote = storage ? `<div class="admin-privacy-note admin-privacy-note--spaced">Backup storage: ${escapeHtml(storage.type)}${storage.durable ? ` · ${escapeHtml(storage.repo || '')}/${escapeHtml(storage.path || '')}` : ' · local development only'}</div>` : '';
      async function createSnapshot() {
        const input = host.querySelector('#snapshot-label');
        const label = String(input?.value || '').trim() || 'Named snapshot';
        const btn = host.querySelector('#snapshot-create');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
          await api('/admin/snapshots', { method: 'POST', body: JSON.stringify({ label }) });
          toast('Snapshot saved.', 'success', 2200);
          renderActiveTab();
        } catch (e) {
          toast('Snapshot failed: ' + e.message, 'error', 5000);
          btn.disabled = false;
          btn.innerHTML = `${ICON.plus}<span>Create snapshot</span>`;
        }
      }
      if (!j.backups?.length) {
        host.innerHTML = `
          ${storageNote}
          <div class="admin-version-toolbar">
            <input class="admin-input" id="snapshot-label" placeholder="Snapshot label">
            <button type="button" class="admin-btn admin-btn-sm" id="snapshot-create">${ICON.plus}<span>Create snapshot</span></button>
          </div>
          <div class="admin-field-help">No backups yet. A backup is created automatically before each publish or named snapshot.</div>`;
        host.querySelector('#snapshot-create')?.addEventListener('click', createSnapshot);
        refreshWorkspaceLayoutSoon();
        return;
      }
      const options = j.backups.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.label || b.source || 'Backup')} · ${backupTimestamp(b) ? new Date(backupTimestamp(b)).toLocaleString() : b.id}</option>`).join('');
      host.innerHTML = `
        ${storageNote}
        <div class="admin-version-toolbar">
          <input class="admin-input" id="snapshot-label" placeholder="Snapshot label">
          <button type="button" class="admin-btn admin-btn-sm" id="snapshot-create">${ICON.plus}<span>Create snapshot</span></button>
        </div>
        <div class="admin-version-diff">
          <div class="admin-grid-2">
            <label class="admin-field admin-field--flush">
              <div class="admin-field-row"><span>Compare from</span></div>
              <select class="admin-select" id="backup-before">${options}</select>
            </label>
            <label class="admin-field admin-field--flush">
              <div class="admin-field-row"><span>Compare to</span></div>
              <select class="admin-select" id="backup-after">${options}</select>
            </label>
          </div>
          <div class="row-gap-8">
            <button type="button" class="admin-btn admin-btn-sm" id="backup-compare">${ICON.audit}<span>Compare versions</span></button>
          </div>
          <div id="backup-diff-result" class="admin-diff-list admin-diff-list--compact">
            <div class="admin-field-help">Pick two versions to see a plain-language diff.</div>
          </div>
        </div>
        <div class="admin-table-scroll">
          <table class="admin-audit-table admin-audit-table--backups">
            <thead><tr><th>When</th><th>Label</th><th>Source</th><th>Actor</th><th>Changed</th><th></th></tr></thead>
            <tbody>
              ${j.backups.map(b => `
                <tr data-backup-id="${escapeHtml(b.id)}">
                  <td class="muted">${backupTimestamp(b) ? new Date(backupTimestamp(b)).toLocaleString() : 'No timestamp'}</td>
                  <td class="action">${escapeHtml(b.label || '—')}</td>
                  <td class="action">${escapeHtml(b.source || b.action || 'manual')}</td>
                  <td class="muted admin-audit-actor">${escapeHtml(b.actor?.email || b.actor?.name || '—')}</td>
                  <td class="muted admin-audit-detail">${escapeHtml((b.sections || b.patchKeys || []).join(', ') || b.message || '—')}</td>
                  <td><button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-act="restore">Restore</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      async function compareBackups() {
        const beforeId = host.querySelector('#backup-before')?.value;
        const afterId = host.querySelector('#backup-after')?.value;
        const result = host.querySelector('#backup-diff-result');
        if (!beforeId || !afterId || !result) return;
        result.innerHTML = renderLoadingState('Comparing versions');
        try {
          const [before, after] = await Promise.all([
            api('/admin/backups/' + encodeURIComponent(beforeId)),
            api('/admin/backups/' + encodeURIComponent(afterId))
          ]);
          const patch = {};
          const beforeSettings = before.settings || {};
          const afterSettings = after.settings || {};
          for (const key of new Set([...Object.keys(beforeSettings), ...Object.keys(afterSettings)])) {
            if (key !== 'updatedAt' && !eq(beforeSettings[key], afterSettings[key])) patch[key] = afterSettings[key];
          }
          const details = publishDiffDetails(patch, beforeSettings, afterSettings);
          result.innerHTML = details.length
            ? details.map(section => `<div class="admin-diff-row"><strong>${escapeHtml(section.label)}</strong><span>${escapeHtml(section.items.join('; '))}</span></div>`).join('')
            : '<div class="admin-diff-row"><strong>No difference</strong><span>These two versions match.</span></div>';
        } catch (e) {
          result.innerHTML = `<div class="admin-field-help admin-field-help--danger">${escapeHtml(e.message)}</div>`;
        }
        refreshWorkspaceLayoutSoon();
      }
      host.querySelector('#snapshot-create')?.addEventListener('click', createSnapshot);
      host.querySelector('#backup-compare')?.addEventListener('click', compareBackups);
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
      host.innerHTML = `<div class="admin-field-help admin-field-help--danger">${escapeHtml(e.message)}</div>`;
      refreshWorkspaceLayoutSoon();
    });
    return host;
  }

  function renderAuditLog() {
    const host = document.createElement('div');
    host.innerHTML = renderLoadingState('Loading events');
    api('/admin/audit-log?limit=80').then(j => {
      const storage = j.storage;
      const storageNote = storage ? `<div class="admin-privacy-note admin-privacy-note--spaced">Audit storage: ${escapeHtml(storage.type)}${storage.durable ? ` · ${escapeHtml(storage.repo || '')}/${escapeHtml(storage.path || '')}` : ' · local development only'}</div>` : '';
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
      host.innerHTML = `<div class="admin-field-help admin-field-help--danger">${escapeHtml(e.message)}</div>`;
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
    host.innerHTML = renderLoadingState('Loading statistics');
    loadAnalyticsSummary(true).then(j => {
      const ga = j.googleAnalytics || {};
      const days = j.days || {};
      const keys = Object.keys(days).sort();
      const rangeDays = Number(state.analyticsRangeDays) || 7;
      const last7 = keys.slice(-rangeDays);
      const totals = last7.reduce((acc, key) => {
        const t = days[key]?.totals || {};
        acc.pageviews += t.pageviews || 0;
        acc.durationSeconds += t.durationSeconds || 0;
        return acc;
      }, { pageviews: 0, durationSeconds: 0 });

      const pages = {};
      const devices = {};
      const hours = {};
      for (const key of last7) {
        for (const [page, metrics] of Object.entries(days[key]?.pages || {})) {
          pages[page] ||= { pageviews: 0, durationSeconds: 0 };
          pages[page].pageviews += metrics.pageviews || 0;
          pages[page].durationSeconds += metrics.durationSeconds || 0;
        }
        for (const [device, metrics] of Object.entries(days[key]?.devices || {})) {
          devices[device] ||= { pageviews: 0, durationSeconds: 0 };
          devices[device].pageviews += metrics.pageviews || 0;
          devices[device].durationSeconds += metrics.durationSeconds || 0;
        }
        for (const [hour, metrics] of Object.entries(days[key]?.hours || {})) {
          hours[hour] ||= { pageviews: 0, durationSeconds: 0 };
          hours[hour].pageviews += metrics.pageviews || 0;
          hours[hour].durationSeconds += metrics.durationSeconds || 0;
        }
      }

      const pageEntries = Object.entries(pages).sort((a, b) => b[1].pageviews - a[1].pageviews);
      const deviceEntries = Object.entries(devices).sort((a, b) => b[1].pageviews - a[1].pageviews);
      const hourEntries = Object.entries(hours).sort((a, b) => Number(a[0]) - Number(b[0]));
      const maxPageViews = Math.max(1, ...pageEntries.map(([, m]) => m.pageviews || 0));
      const maxDeviceViews = Math.max(1, ...deviceEntries.map(([, m]) => m.pageviews || 0));
      const maxHourViews = Math.max(1, ...hourEntries.map(([, m]) => m.pageviews || 0));
      const trendDays = keys.slice(-rangeDays);
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

      const deviceBars = deviceEntries.map(([device, m]) => `
        <div class="admin-rank-row">
          <div>
            <strong>${escapeHtml(device[0]?.toUpperCase() + device.slice(1))}</strong>
            <span>${formatDuration(m.durationSeconds)} total time</span>
          </div>
          <div class="admin-rank-meter"><span style="width:${Math.round(((m.pageviews || 0) / maxDeviceViews) * 100)}%"></span></div>
          <b>${formatNumber(m.pageviews)}</b>
        </div>`).join('');

      const hourBars = hourEntries.map(([hour, m]) => {
        const labelHour = Number(hour);
        const label = `${labelHour % 12 || 12}${labelHour >= 12 ? 'p' : 'a'}`;
        return `<div class="admin-hour-bar" title="${escapeHtml(label)} · ${formatNumber(m.pageviews)} views">
          <span style="height:${Math.max(4, Math.round(((m.pageviews || 0) / maxHourViews) * 100))}%"></span>
          <em>${escapeHtml(label)}</em>
        </div>`;
      }).join('');

      const csv = [
        ['Date', 'Page', 'Device', 'Hour', 'Views', 'Tracked seconds'].join(','),
        ...last7.flatMap(key => {
          const day = days[key] || {};
          const pageRows = Object.entries(day.pages || {}).map(([page, metrics]) => [key, page, '', '', metrics.pageviews || 0, metrics.durationSeconds || 0].join(','));
          const deviceRows = Object.entries(day.devices || {}).map(([device, metrics]) => [key, '', device, '', metrics.pageviews || 0, metrics.durationSeconds || 0].join(','));
          const hourRows = Object.entries(day.hours || {}).map(([hour, metrics]) => [key, '', '', hour, metrics.pageviews || 0, metrics.durationSeconds || 0].join(','));
          return [...pageRows, ...deviceRows, ...hourRows];
        })
      ].join('\n');

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
        </table>` : ga.error ? `<div class="admin-field-help admin-field-help--danger">${escapeHtml(ga.error)}</div>` : '';

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
        <div class="admin-analytics-toolbar">
          <label class="admin-field admin-field--flush">
            <div class="admin-field-row"><span>Date range</span></div>
            <select class="admin-select" id="analytics-range">
              ${[7, 14, 30].map(n => `<option value="${n}" ${n === rangeDays ? 'selected' : ''}>Last ${n} days</option>`).join('')}
            </select>
          </label>
          <button type="button" class="admin-btn admin-btn-sm" id="analytics-copy-csv">${ICON.audit}<span>Copy CSV</span></button>
        </div>
        <div class="admin-analytics-grid">
          <section class="admin-analytics-panel admin-analytics-panel--wide">
            <div class="admin-panel-heading">
              <h2>${rangeDays}-day traffic trend</h2>
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
          <section class="admin-analytics-panel">
            <div class="admin-panel-heading">
              <h2>Devices</h2>
              <span>Privacy-safe aggregate</span>
            </div>
            <div class="admin-rank-list">${deviceBars || '<div class="admin-field-help">No device data yet.</div>'}</div>
          </section>
          <section class="admin-analytics-panel admin-analytics-panel--wide">
            <div class="admin-panel-heading">
              <h2>Peak hours</h2>
              <span>Views by local hour</span>
            </div>
            <div class="admin-hour-chart">${hourBars || '<div class="admin-field-help">No hourly data yet.</div>'}</div>
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
      host.querySelector('#analytics-range')?.addEventListener('change', event => {
        state.analyticsRangeDays = Number(event.target.value) || 7;
        renderActiveTab();
      });
      host.querySelector('#analytics-copy-csv')?.addEventListener('click', () => {
        copyText(csv)
          .then(() => toast('Analytics CSV copied.', 'success', 2200))
          .catch(e => toast('Copy failed: ' + e.message, 'error', 5000));
      });
      refreshWorkspaceLayoutSoon();
    }).catch(e => {
      host.innerHTML = `<div class="admin-field-help admin-field-help--danger">${escapeHtml(e.message)}</div>`;
      refreshWorkspaceLayoutSoon();
    });
    return host;
  }

  function renderAutomationsEngine() {
    const host = document.createElement('div');
    host.innerHTML = renderLoadingState('Loading automations');
    const scheduleTypes = ['Normal Schedule', 'Advisory', 'Early Release', 'Assembly', 'Exam Day', 'No School']
      .concat(Object.keys(state.draft?.bellSchedules || {}).filter(type => type && type !== '_dateOverrides'))
      .filter((type, index, list) => list.indexOf(type) === index);
    const announcements = asArray(state.draft?.announcements?.items);
    const refreshSettings = async () => {
      const { settings, defaults } = await loadSettingsPair();
      state.settings = settings;
      state.defaults = defaults;
      state.draft = deepClone(settings);
      refreshDirtyMarkers();
    };
    const jobSummary = job => {
      const trigger = job.trigger || {};
      const action = job.action || {};
      const triggerText = trigger.type === 'weekday'
        ? `Every ${asArray(trigger.weekdays).map(day => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(day)]).filter(Boolean).join(', ')} at ${trigger.time || '00:00'}`
        : `${trigger.date || 'No date'} ${trigger.time || ''}`.trim();
      const actionText = ({
        setSchedule: `Stage ${action.scheduleType || 'schedule'} for ${action.date || 'today'}`,
        publishDraft: 'Publish staged draft',
        setMaintenance: `Stage ${action.mode === 'maintenance' ? 'maintenance' : 'live'} mode`,
        announcementWindow: `${action.mode || 'Update'} announcement ${Number(action.index || 0) + 1}`
      })[action.type] || action.type || 'Action';
      return `${triggerText} · ${actionText}${action.publishAfter ? ' · publish after' : ''}`;
    };

    function paint(summary) {
      const jobs = asArray(summary.jobs);
      const fallback = summary.fallbackMode !== false;
      host.innerHTML = `
        ${fallback ? '<div class="admin-setup-note">Local preview applies due jobs the next time the admin or settings endpoint opens. History records every run.</div>' : ''}
        <div class="admin-automation-grid">
          <section class="admin-automation-builder">
            <div class="admin-panel-heading"><h2>Create rule</h2><span>Stages changes unless publish is selected</span></div>
            <div class="admin-grid-2">
              <label class="admin-field admin-field--flush">
                <div class="admin-field-row"><span>Name</span></div>
                <input class="admin-input" id="automation-name" value="Scheduled update">
              </label>
              <label class="admin-field admin-field--flush">
                <div class="admin-field-row"><span>Trigger</span></div>
                <select class="admin-select" id="automation-trigger">
                  <option value="dateTime">Date and time</option>
                  <option value="weekday">Weekday</option>
                </select>
              </label>
              <label class="admin-field admin-field--flush" data-trigger-date>
                <div class="admin-field-row"><span>Date</span></div>
                <input class="admin-input mono" id="automation-date" type="date" value="${escapeHtml(todayISODate())}">
              </label>
              <label class="admin-field admin-field--flush">
                <div class="admin-field-row"><span>Time</span></div>
                <input class="admin-input mono" id="automation-time" type="time" value="08:00">
              </label>
            </div>
            <div class="admin-weekday-row hidden" data-trigger-weekdays>
              ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, day) => `<label><input type="checkbox" value="${day}" ${day >= 1 && day <= 5 ? 'checked' : ''}><span>${label}</span></label>`).join('')}
            </div>
            <div class="admin-grid-2">
              <label class="admin-field admin-field--flush">
                <div class="admin-field-row"><span>Action</span></div>
                <select class="admin-select" id="automation-action">
                  <option value="setSchedule">Set planned schedule</option>
                  <option value="publishDraft">Publish staged changes</option>
                  <option value="setMaintenance">Set availability</option>
                  <option value="announcementWindow">Show or expire announcement</option>
                </select>
              </label>
              <label class="admin-field admin-field--flush" data-action-publish>
                <div class="admin-field-row"><span>After action</span></div>
                <label class="admin-checkline"><input type="checkbox" id="automation-publish-after"><span>Publish immediately after staging</span></label>
              </label>
            </div>
            <div class="admin-automation-action-fields" data-action-fields></div>
            <button type="button" class="ad-btn ad-btn--primary" id="automation-create">${ICON.plus}<span>Create automation</span></button>
          </section>
          <section class="admin-automation-list">
            <div class="admin-panel-heading"><h2>Scheduled jobs</h2><span>${jobs.length} active</span></div>
            ${jobs.length ? jobs.map(job => `
              <article class="admin-automation-job" data-job-id="${escapeHtml(job.id)}">
                <div>
                  <strong>${escapeHtml(job.name || 'Scheduled job')}</strong>
                  <span>${escapeHtml(jobSummary(job))}</span>
                  ${job.error ? `<small class="danger">${escapeHtml(job.error)}</small>` : `<small>${escapeHtml(job.status || 'scheduled')}${job.lastAppliedAt ? ` · ${escapeHtml(new Date(job.lastAppliedAt).toLocaleString())}` : ''}</small>`}
                </div>
                <div class="row-gap-8">
                  <button type="button" class="admin-btn admin-btn-sm" data-job-apply>Apply now</button>
                  <button type="button" class="admin-btn admin-btn-sm admin-btn-danger" data-job-delete>Delete</button>
                </div>
              </article>`).join('') : `
              <div class="admin-compact-empty-state admin-compact-empty-state--action">
                <div>
                  <strong>No automations yet</strong>
                  <span>Create the first scheduled rule for a schedule, availability, announcement, or publish action.</span>
                </div>
                <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-focus-create-automation>New rule</button>
              </div>`}
          </section>
        </div>
        <details class="admin-advanced-renderer">
          <summary>Advanced visual editor</summary>
          <div>
            <p>Open the experimental visual editor only when the simple rule form is not enough.</p>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-automation-advanced-open>Open advanced editor</button>
          </div>
        </details>`;

      const triggerSelect = host.querySelector('#automation-trigger');
      const actionSelect = host.querySelector('#automation-action');
      const triggerDate = host.querySelector('[data-trigger-date]');
      const triggerWeekdays = host.querySelector('[data-trigger-weekdays]');
      const actionFields = host.querySelector('[data-action-fields]');
      const paintTrigger = () => {
        const weekday = triggerSelect.value === 'weekday';
        triggerDate.classList.toggle('hidden', weekday);
        triggerWeekdays.classList.toggle('hidden', !weekday);
      };
      const paintAction = () => {
        const type = actionSelect.value;
        const scheduleOptions = scheduleTypes.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
        const announcementOptions = announcements.map((item, index) => `<option value="${index}">${escapeHtml(item.title || `Card ${index + 1}`)}</option>`).join('');
        actionFields.innerHTML = ({
          setSchedule: `
            <div class="admin-grid-2">
              <label class="admin-field admin-field--flush"><div class="admin-field-row"><span>Schedule type</span></div><select class="admin-select" id="automation-schedule-type">${scheduleOptions}</select></label>
              <label class="admin-field admin-field--flush"><div class="admin-field-row"><span>Schedule date</span></div><input class="admin-input mono" id="automation-schedule-date" type="date" value="${escapeHtml(todayISODate())}"></label>
            </div>`,
          publishDraft: `<div class="admin-field-help">Publishes whatever draft is staged when the trigger fires.</div>`,
          setMaintenance: `
            <div class="admin-grid-2">
              <label class="admin-field admin-field--flush"><div class="admin-field-row"><span>Mode</span></div><select class="admin-select" id="automation-maint-mode"><option value="maintenance">Maintenance</option><option value="live">Live</option></select></label>
              <label class="admin-field admin-field--flush"><div class="admin-field-row"><span>Title</span></div><input class="admin-input" id="automation-maint-title" value="Site paused for maintenance"></label>
            </div>
            <label class="admin-field admin-field--flush"><div class="admin-field-row"><span>Message</span></div><textarea class="admin-textarea" id="automation-maint-message" rows="2">Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon.</textarea></label>`,
          announcementWindow: `
            <div class="admin-grid-3">
              <label class="admin-field admin-field--flush"><div class="admin-field-row"><span>Announcement</span></div><select class="admin-select" id="automation-ann-index">${announcementOptions || '<option value="0">Card 1</option>'}</select></label>
              <label class="admin-field admin-field--flush"><div class="admin-field-row"><span>Action</span></div><select class="admin-select" id="automation-ann-mode"><option value="show">Show from date</option><option value="expire">Expire on date</option><option value="clear">Clear dates</option></select></label>
              <label class="admin-field admin-field--flush"><div class="admin-field-row"><span>Date</span></div><input class="admin-input mono" id="automation-ann-date" type="date" value="${escapeHtml(todayISODate())}"></label>
            </div>`
        })[type] || '';
        refreshWorkspaceLayoutSoon();
      };
      triggerSelect.addEventListener('change', paintTrigger);
      actionSelect.addEventListener('change', paintAction);
      paintTrigger();
      paintAction();
      host.querySelector('[data-focus-create-automation]')?.addEventListener('click', () => {
        host.querySelector('#automation-name')?.focus();
      });
      host.querySelector('[data-automation-advanced-open]')?.addEventListener('click', () => {
        host.replaceWith(renderAutomationsGraphWorkbench());
      });
      host.querySelector('#automation-create')?.addEventListener('click', async () => {
        const name = host.querySelector('#automation-name').value.trim() || 'Scheduled job';
        const trigger = triggerSelect.value === 'weekday'
          ? {
              type: 'weekday',
              weekdays: [...host.querySelectorAll('[data-trigger-weekdays] input:checked')].map(input => Number(input.value)),
              time: host.querySelector('#automation-time').value || '08:00'
            }
          : {
              type: 'dateTime',
              date: host.querySelector('#automation-date').value || todayISODate(),
              time: host.querySelector('#automation-time').value || '08:00'
            };
        const actionType = actionSelect.value;
        const action = { type: actionType, publishAfter: Boolean(host.querySelector('#automation-publish-after')?.checked) };
        if (actionType === 'setSchedule') {
          action.scheduleType = host.querySelector('#automation-schedule-type')?.value || 'Normal Schedule';
          action.date = host.querySelector('#automation-schedule-date')?.value || todayISODate();
        } else if (actionType === 'setMaintenance') {
          action.mode = host.querySelector('#automation-maint-mode')?.value || 'maintenance';
          action.title = host.querySelector('#automation-maint-title')?.value || '';
          action.message = host.querySelector('#automation-maint-message')?.value || '';
        } else if (actionType === 'announcementWindow') {
          action.index = Number(host.querySelector('#automation-ann-index')?.value || 0);
          action.mode = host.querySelector('#automation-ann-mode')?.value || 'show';
          action.date = host.querySelector('#automation-ann-date')?.value || todayISODate();
        }
        try {
          await api('/admin/scheduled-jobs', { method: 'POST', body: JSON.stringify({ name, trigger, action }) });
          toast('Automation created.', 'success', 2200);
          state.scheduledJobs = null;
          renderActiveTab();
        } catch (e) {
          toast('Automation failed: ' + e.message, 'error', 5000);
        }
      });
      host.querySelectorAll('[data-job-apply]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('[data-job-id]')?.dataset.jobId;
          btn.disabled = true;
          btn.textContent = 'Applying...';
          try {
            await api('/admin/scheduled-jobs/' + encodeURIComponent(id) + '/apply', { method: 'POST' });
            await refreshSettings();
            state.scheduledJobs = null;
            toast('Automation applied and logged.', 'success', 2600);
            renderActiveTab();
          } catch (e) {
            toast('Automation apply failed: ' + e.message, 'error', 5200);
            btn.disabled = false;
            btn.textContent = 'Apply now';
          }
        });
      });
      host.querySelectorAll('[data-job-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('[data-job-id]')?.dataset.jobId;
          try {
            await api('/admin/scheduled-jobs/' + encodeURIComponent(id) + '/delete', { method: 'POST' });
            state.scheduledJobs = null;
            toast('Automation deleted.', 'success', 1800);
            renderActiveTab();
          } catch (e) {
            toast('Delete failed: ' + e.message, 'error', 5000);
          }
        });
      });
      refreshWorkspaceLayoutSoon();
    }

    loadScheduledJobs(true).then(paint).catch(e => {
      host.innerHTML = `<div class="admin-field-help admin-field-help--danger">${escapeHtml(e.message)}</div>`;
      refreshWorkspaceLayoutSoon();
    });
    return host;
  }

  function renderAutomationsEngineCanvas() {
    const host = document.createElement('div');
    host.className = 'admin-automation-workbench-host';
    host.innerHTML = renderLoadingState('Loading automations');
    const scheduleTypes = ['Normal Schedule', 'Advisory', 'Early Release', 'Assembly', 'Exam Day', 'No School']
      .concat(Object.keys(state.draft?.bellSchedules || {}).filter(type => type && type !== '_dateOverrides'))
      .filter((type, index, list) => list.indexOf(type) === index);
    const announcements = asArray(state.draft?.announcements?.items);
    const refreshSettings = async () => {
      const { settings, defaults } = await loadSettingsPair();
      state.settings = settings;
      state.defaults = defaults;
      state.draft = deepClone(settings);
      refreshDirtyMarkers();
    };
    const jobSummary = job => {
      const trigger = job.trigger || {};
      const action = job.action || {};
      const triggerText = trigger.type === 'weekday'
        ? `Every ${asArray(trigger.weekdays).map(day => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(day)]).filter(Boolean).join(', ')} at ${trigger.time || '00:00'}`
        : `${trigger.date || 'No date'} ${trigger.time || ''}`.trim();
      const actionText = ({
        setSchedule: `Stage ${action.scheduleType || 'schedule'} for ${action.date || 'today'}`,
        publishDraft: 'Publish staged draft',
        setMaintenance: `Stage ${action.mode === 'maintenance' ? 'maintenance' : 'live'} mode`,
        announcementWindow: `${action.mode || 'Update'} announcement ${Number(action.index || 0) + 1}`
      })[action.type] || action.type || 'Action';
      return `${triggerText} · ${actionText}${action.publishAfter ? ' · publish after' : ''}`;
    };

    function paint(summary) {
      const jobs = asArray(summary.jobs);
      const fallback = summary.fallbackMode !== false;
      host.innerHTML = `
        <div class="admin-automation-workbench">
          <section class="admin-automation-canvas-shell">
            <div class="admin-automation-canvas-head">
              <div><h2>Rules canvas</h2><span>${fallback ? 'Fallback runner applies due jobs when the site is next opened.' : 'Worker is connected.'}</span></div>
              <div class="admin-automation-status"><strong>${jobs.length}</strong><span>active</span></div>
            </div>
            <div class="admin-flow-canvas" data-flow-canvas>
              <svg class="admin-flow-lines" viewBox="0 0 1120 560" aria-hidden="true" focusable="false">
                <path d="M250 156 C330 156 365 156 444 156" />
                <path d="M676 156 C742 156 766 156 824 156" />
                <path d="M560 292 C606 350 704 386 824 386" />
              </svg>
              <article class="admin-flow-node admin-flow-node--trigger">
                <div class="admin-flow-node__head"><span>Trigger</span><small>when</small></div>
                <label class="admin-flow-field">
                  <span>Type</span>
                  <select class="admin-select" id="automation-trigger">
                    <option value="dateTime">Date and time</option>
                    <option value="weekday">Weekday</option>
                  </select>
                </label>
                <div class="admin-flow-grid">
                  <label class="admin-flow-field" data-trigger-date><span>Date</span><input class="admin-input mono" id="automation-date" type="date" value="${escapeHtml(todayISODate())}"></label>
                  <label class="admin-flow-field"><span>Time</span><input class="admin-input mono" id="automation-time" type="time" value="08:00"></label>
                </div>
                <div class="admin-weekday-row hidden" data-trigger-weekdays>
                  ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, day) => `<label><input type="checkbox" value="${day}" ${day >= 1 && day <= 5 ? 'checked' : ''}><span>${label}</span></label>`).join('')}
                </div>
                <i class="admin-flow-port admin-flow-port--out"></i>
              </article>
              <article class="admin-flow-node admin-flow-node--action">
                <i class="admin-flow-port admin-flow-port--in"></i>
                <div class="admin-flow-node__head"><span>Action</span><small>do</small></div>
                <label class="admin-flow-field">
                  <span>Action</span>
                  <select class="admin-select" id="automation-action">
                    <option value="setSchedule">Set planned schedule</option>
                    <option value="publishDraft">Publish staged changes</option>
                    <option value="setMaintenance">Set availability</option>
                    <option value="announcementWindow">Show or expire announcement</option>
                  </select>
                </label>
                <div class="admin-automation-action-fields" data-action-fields></div>
                <i class="admin-flow-port admin-flow-port--out"></i>
              </article>
              <article class="admin-flow-node admin-flow-node--publish">
                <i class="admin-flow-port admin-flow-port--in"></i>
                <div class="admin-flow-node__head"><span>Publish</span><small>optional</small></div>
                <label class="admin-checkline" data-action-publish><input type="checkbox" id="automation-publish-after"><span>Publish immediately after staging</span></label>
                <p>Leave off to stage the draft for review.</p>
                <i class="admin-flow-port admin-flow-port--out"></i>
              </article>
              <article class="admin-flow-node admin-flow-node--output">
                <i class="admin-flow-port admin-flow-port--in"></i>
                <div class="admin-flow-node__head"><span>Queue</span><small>result</small></div>
                <strong>${jobs.length ? `${jobs.length} scheduled` : 'No jobs yet'}</strong>
                <p>${jobs.length ? 'Created jobs appear in the queue below.' : 'Create the first workflow from this canvas.'}</p>
              </article>
            </div>
            <div class="admin-flow-footer">
              <label class="admin-flow-field admin-flow-field--name"><span>Workflow name</span><input class="admin-input" id="automation-name" value="Scheduled update"></label>
              <button type="button" class="ad-btn ad-btn--primary" id="automation-create">${ICON.plus}<span>Create automation</span></button>
            </div>
          </section>
          <section class="admin-automation-job-dock">
            <div class="admin-panel-heading"><h2>Scheduled jobs</h2><span>${jobs.length} active</span></div>
            ${jobs.length ? jobs.map(job => `
              <article class="admin-automation-job" data-job-id="${escapeHtml(job.id)}">
                <div>
                  <strong>${escapeHtml(job.name || 'Scheduled job')}</strong>
                  <span>${escapeHtml(jobSummary(job))}</span>
                  ${job.error ? `<small class="danger">${escapeHtml(job.error)}</small>` : `<small>${escapeHtml(job.status || 'scheduled')}${job.lastAppliedAt ? ` · ${escapeHtml(new Date(job.lastAppliedAt).toLocaleString())}` : ''}</small>`}
                </div>
                <div class="row-gap-8">
                  <button type="button" class="admin-btn admin-btn-sm" data-job-apply>Apply now</button>
                  <button type="button" class="admin-btn admin-btn-sm admin-btn-danger" data-job-delete>Delete</button>
                </div>
              </article>`).join('') : '<div class="admin-compact-empty-state"><div><strong>No automations yet</strong><span>Create a workflow for schedule changes, maintenance, publishing, or announcement timing.</span></div></div>'}
          </section>
        </div>`;

      const triggerSelect = host.querySelector('#automation-trigger');
      const actionSelect = host.querySelector('#automation-action');
      const triggerDate = host.querySelector('[data-trigger-date]');
      const triggerWeekdays = host.querySelector('[data-trigger-weekdays]');
      const actionFields = host.querySelector('[data-action-fields]');
      const paintTrigger = () => {
        const weekday = triggerSelect.value === 'weekday';
        triggerDate.classList.toggle('hidden', weekday);
        triggerWeekdays.classList.toggle('hidden', !weekday);
      };
      const paintAction = () => {
        const type = actionSelect.value;
        const scheduleOptions = scheduleTypes.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
        const announcementOptions = announcements.map((item, index) => `<option value="${index}">${escapeHtml(item.title || `Card ${index + 1}`)}</option>`).join('');
        actionFields.innerHTML = ({
          setSchedule: `
            <div class="admin-flow-grid">
              <label class="admin-flow-field"><span>Schedule</span><select class="admin-select" id="automation-schedule-type">${scheduleOptions}</select></label>
              <label class="admin-flow-field"><span>Date</span><input class="admin-input mono" id="automation-schedule-date" type="date" value="${escapeHtml(todayISODate())}"></label>
            </div>`,
          publishDraft: `<div class="admin-field-help">Publishes the draft that is staged when the trigger fires.</div>`,
          setMaintenance: `
            <div class="admin-flow-grid">
              <label class="admin-flow-field"><span>Mode</span><select class="admin-select" id="automation-maint-mode"><option value="maintenance">Maintenance</option><option value="live">Live</option></select></label>
              <label class="admin-flow-field"><span>Title</span><input class="admin-input" id="automation-maint-title" value="Site paused for maintenance"></label>
            </div>
            <label class="admin-flow-field"><span>Message</span><textarea class="admin-textarea" id="automation-maint-message" rows="2">Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon.</textarea></label>`,
          announcementWindow: `
            <div class="admin-flow-grid admin-flow-grid--three">
              <label class="admin-flow-field"><span>Card</span><select class="admin-select" id="automation-ann-index">${announcementOptions || '<option value="0">Card 1</option>'}</select></label>
              <label class="admin-flow-field"><span>Action</span><select class="admin-select" id="automation-ann-mode"><option value="show">Show from date</option><option value="expire">Expire on date</option><option value="clear">Clear dates</option></select></label>
              <label class="admin-flow-field"><span>Date</span><input class="admin-input mono" id="automation-ann-date" type="date" value="${escapeHtml(todayISODate())}"></label>
            </div>`
        })[type] || '';
        refreshWorkspaceLayoutSoon();
      };
      triggerSelect.addEventListener('change', paintTrigger);
      actionSelect.addEventListener('change', paintAction);
      paintTrigger();
      paintAction();
      host.querySelector('#automation-create')?.addEventListener('click', async () => {
        const name = host.querySelector('#automation-name').value.trim() || 'Scheduled job';
        const trigger = triggerSelect.value === 'weekday'
          ? {
              type: 'weekday',
              weekdays: [...host.querySelectorAll('[data-trigger-weekdays] input:checked')].map(input => Number(input.value)),
              time: host.querySelector('#automation-time').value || '08:00'
            }
          : {
              type: 'dateTime',
              date: host.querySelector('#automation-date').value || todayISODate(),
              time: host.querySelector('#automation-time').value || '08:00'
            };
        const actionType = actionSelect.value;
        const action = { type: actionType, publishAfter: Boolean(host.querySelector('#automation-publish-after')?.checked) };
        if (actionType === 'setSchedule') {
          action.scheduleType = host.querySelector('#automation-schedule-type')?.value || 'Normal Schedule';
          action.date = host.querySelector('#automation-schedule-date')?.value || todayISODate();
        } else if (actionType === 'setMaintenance') {
          action.mode = host.querySelector('#automation-maint-mode')?.value || 'maintenance';
          action.title = host.querySelector('#automation-maint-title')?.value || '';
          action.message = host.querySelector('#automation-maint-message')?.value || '';
        } else if (actionType === 'announcementWindow') {
          action.index = Number(host.querySelector('#automation-ann-index')?.value || 0);
          action.mode = host.querySelector('#automation-ann-mode')?.value || 'show';
          action.date = host.querySelector('#automation-ann-date')?.value || todayISODate();
        }
        try {
          await api('/admin/scheduled-jobs', { method: 'POST', body: JSON.stringify({ name, trigger, action }) });
          toast('Automation created.', 'success', 2200);
          state.scheduledJobs = null;
          paint(await loadScheduledJobs(true));
        } catch (e) {
          toast('Automation failed: ' + e.message, 'error', 5000);
        }
      });
      host.querySelectorAll('[data-job-apply]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('[data-job-id]')?.dataset.jobId;
          btn.disabled = true;
          btn.textContent = 'Applying...';
          try {
            await api('/admin/scheduled-jobs/' + encodeURIComponent(id) + '/apply', { method: 'POST' });
            await refreshSettings();
            state.scheduledJobs = null;
            toast('Automation applied and logged.', 'success', 2600);
            paint(await loadScheduledJobs(true));
          } catch (e) {
            toast('Automation apply failed: ' + e.message, 'error', 5200);
            btn.disabled = false;
            btn.textContent = 'Apply now';
          }
        });
      });
      host.querySelectorAll('[data-job-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('[data-job-id]')?.dataset.jobId;
          try {
            await api('/admin/scheduled-jobs/' + encodeURIComponent(id) + '/delete', { method: 'POST' });
            state.scheduledJobs = null;
            toast('Automation deleted.', 'success', 1800);
            paint(await loadScheduledJobs(true));
          } catch (e) {
            toast('Delete failed: ' + e.message, 'error', 5000);
          }
        });
      });
      refreshWorkspaceLayoutSoon();
    }

    loadScheduledJobs(true).then(paint).catch(e => {
      host.innerHTML = `<div class="admin-field-help admin-field-help--danger">${escapeHtml(e.message)}</div>`;
      refreshWorkspaceLayoutSoon();
    });
    return host;
  }

  function renderThemeStudioObjectWorkbench() {
    const host = document.createElement('div');
    host.className = 'admin-theme-workbench-host admin-object-workbench-host';
    const STORAGE_KEY = 'phs:admin-theme-object-canvas:v2';
    const palette = [
      { type: 'heroTitle', group: 'Page objects', label: 'Hero title', hint: 'Main public headline', w: 360, h: 116, bindings: ['appearance.heroTitleSize', 'hero.schedulePageEyebrow'] },
      { type: 'countdownRing', group: 'Page objects', label: 'Countdown ring', hint: 'Next-bell timer material', w: 220, h: 220, bindings: ['appearance.countdownSize', 'theme.accent'] },
      { type: 'scheduleCard', group: 'Page objects', label: 'Schedule card', hint: 'Period surface', w: 320, h: 156, bindings: ['appearance.periodCardPadding', 'appearance.periodCardRadius', 'appearance.periodNameSize'] },
      { type: 'navGroup', group: 'Page objects', label: 'Navigation', hint: 'Pill navigation cluster', w: 330, h: 84, bindings: ['nav.items'] },
      { type: 'announcementCard', group: 'Features', label: 'Announcement', hint: 'Announcement feature card', w: 300, h: 170, bindings: ['hero.announcementsPageTitle'] },
      { type: 'gradeShell', group: 'Features', label: 'GradeViewer shell', hint: 'Embedded grade module frame', w: 340, h: 190, bindings: ['gradeMelon.embedUrl'] },
      { type: 'footerStrip', group: 'Features', label: 'Footer strip', hint: 'Privacy and contact block', w: 420, h: 92, bindings: ['appearance.footerSize', 'footer.supportEmail'] },
      { type: 'materialPanel', group: 'Materials', label: 'Material panel', hint: 'Surface, border, radius', w: 280, h: 150, bindings: ['theme.bg1', 'theme.bg2', 'appearance.periodCardRadius'] },
      { type: 'colorRamp', group: 'Materials', label: 'Color ramp', hint: 'Accent and text tokens', w: 300, h: 140, bindings: ['theme.accent', 'theme.accent2', 'theme.fg1', 'theme.fg2'] },
      { type: 'actionButton', group: 'Materials', label: 'Action button', hint: 'Primary button material', w: 210, h: 82, bindings: ['theme.accent', 'theme.fg1'] },
      { type: 'freeText', group: 'Sketch', label: 'Text label', hint: 'Local canvas note', w: 220, h: 88, bindings: [] }
    ];
    const fieldSpecs = {
      'theme.accent': { label: 'Accent', kind: 'color' },
      'theme.accent2': { label: 'Secondary', kind: 'color' },
      'theme.bg1': { label: 'Background start', kind: 'color' },
      'theme.bg2': { label: 'Background end', kind: 'color' },
      'theme.fg1': { label: 'Primary text', kind: 'color' },
      'theme.fg2': { label: 'Secondary text', kind: 'color' },
      'appearance.heroTitleSize': { label: 'Hero title', kind: 'range', min: 42, max: 160, unit: 'px' },
      'appearance.countdownSize': { label: 'Countdown', kind: 'range', min: 32, max: 100, unit: 'px' },
      'appearance.periodCardPadding': { label: 'Period padding', kind: 'range', min: 8, max: 34, unit: 'px' },
      'appearance.periodCardRadius': { label: 'Period radius', kind: 'range', min: 0, max: 28, unit: 'px' },
      'appearance.periodNameSize': { label: 'Period name', kind: 'range', min: 12, max: 24, unit: 'px' },
      'appearance.footerSize': { label: 'Footer text', kind: 'range', min: 9, max: 24, unit: 'px' },
      'hero.schedulePageEyebrow': { label: 'Hero eyebrow', kind: 'text' },
      'hero.announcementsPageTitle': { label: 'Announcements title', kind: 'text' },
      'footer.supportEmail': { label: 'Support copy', kind: 'textarea' },
      'gradeMelon.embedUrl': { label: 'GradeViewer URL', kind: 'text' },
      'nav.items': { label: 'Nav items', kind: 'readonly', note: 'Edit exact links in Site.' }
    };
    const defaultModel = {
      viewport: { x: 0, y: 0, scale: 1 },
      selectedId: 'theme-hero',
      objects: [
        { id: 'theme-hero', type: 'heroTitle', label: 'Hero title', x: 96, y: 88, w: 390, h: 124, z: 3, bindings: ['appearance.heroTitleSize', 'hero.schedulePageEyebrow'], props: {} },
        { id: 'theme-ring', type: 'countdownRing', label: 'Countdown ring', x: 570, y: 84, w: 218, h: 218, z: 4, bindings: ['appearance.countdownSize', 'theme.accent'], props: {} },
        { id: 'theme-card', type: 'scheduleCard', label: 'Schedule card', x: 136, y: 288, w: 336, h: 158, z: 2, bindings: ['appearance.periodCardPadding', 'appearance.periodCardRadius', 'appearance.periodNameSize'], props: {} },
        { id: 'theme-ramp', type: 'colorRamp', label: 'Color ramp', x: 548, y: 340, w: 302, h: 144, z: 1, bindings: ['theme.accent', 'theme.accent2', 'theme.fg1', 'theme.fg2'], props: {} }
      ]
    };
    let model = normalizeThemeModel(readStorageJson(STORAGE_KEY, defaultModel));
    let dragState = null;

    function normalizeThemeModel(value) {
      const copy = Object.assign(deepClone(defaultModel), value || {});
      copy.viewport = Object.assign({ x: 0, y: 0, scale: 1 }, copy.viewport || {});
      copy.viewport.scale = clampNumber(copy.viewport.scale, 0.65, 1.4);
      copy.objects = asArray(copy.objects).map((object, index) => {
        const paletteItem = palette.find(item => item.type === object.type) || palette[0];
        return Object.assign({}, paletteItem, object, {
          id: object.id || uniqueId('theme-object'),
          label: object.label || paletteItem.label,
          x: clampNumber(object.x, 0, 1400),
          y: clampNumber(object.y, 0, 1000),
          w: clampNumber(object.w || paletteItem.w, 120, 720),
          h: clampNumber(object.h || paletteItem.h, 64, 520),
          z: Number.isFinite(Number(object.z)) ? Number(object.z) : index + 1,
          bindings: asArray(object.bindings).length ? asArray(object.bindings) : asArray(paletteItem.bindings),
          props: Object.assign({}, object.props || {})
        });
      });
      if (!copy.objects.length) copy.objects = deepClone(defaultModel.objects);
      if (!copy.objects.some(object => object.id === copy.selectedId)) copy.selectedId = copy.objects[0]?.id || null;
      return copy;
    }
    const selectedObject = () => model.objects.find(object => object.id === model.selectedId) || null;
    const saveModel = () => writeStorageJson(STORAGE_KEY, model);
    const canvasPoint = event => {
      const canvas = host.querySelector('[data-theme-object-canvas]');
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return { x: 120, y: 120 };
      return {
        x: Math.round((event.clientX - rect.left - model.viewport.x) / model.viewport.scale),
        y: Math.round((event.clientY - rect.top - model.viewport.y) / model.viewport.scale)
      };
    };
    const setDraftValue = (path, rawValue) => {
      const spec = fieldSpecs[path] || {};
      const value = spec.kind === 'range'
        ? clampNumber(rawValue, spec.min, spec.max)
        : spec.kind === 'color'
          ? safeHexColor(rawValue, get(state.draft, path) || '#000000')
          : String(rawValue ?? '');
      set(state.draft, path, value);
      markDirty();
      pushPreview();
      return value;
    };
    const updateWorldTransform = () => {
      const world = host.querySelector('[data-theme-object-world]');
      if (!world) return;
      world.style.transform = `translate3d(${model.viewport.x}px, ${model.viewport.y}px, 0) scale(${model.viewport.scale})`;
      const zoom = host.querySelector('[data-theme-zoom-value]');
      if (zoom) zoom.textContent = `${Math.round(model.viewport.scale * 100)}%`;
    };
    function objectPreview(object) {
      const accent = safeHexColor(get(state.draft, 'theme.accent'), '#a8aaa8');
      const fg = safeHexColor(get(state.draft, 'theme.fg1'), '#ffffff');
      const fg2 = safeHexColor(get(state.draft, 'theme.fg2'), '#b9bab8');
      const radius = `${clampNumber(get(state.draft, 'appearance.periodCardRadius'), 0, 28)}px`;
      if (object.type === 'heroTitle') {
        const size = clampNumber(get(state.draft, 'appearance.heroTitleSize'), 42, 160);
        return `<small>${escapeHtml(get(state.draft, 'hero.schedulePageEyebrow') || 'We are in')}</small><strong style="font-size:${Math.min(44, Math.max(24, size * 0.44))}px">School Day Ended</strong>`;
      }
      if (object.type === 'countdownRing') {
        return `<div class="admin-theme-object-ring" style="--ring:${escapeHtml(accent)}"><span>Next bell</span><strong>${clampNumber(get(state.draft, 'appearance.countdownSize'), 32, 100)}px</strong></div>`;
      }
      if (object.type === 'scheduleCard') {
        return `<div class="admin-theme-object-card" style="border-radius:${radius};padding:${clampNumber(get(state.draft, 'appearance.periodCardPadding'), 8, 34)}px"><strong>Period card</strong><span>Padding, radius, labels</span></div>`;
      }
      if (object.type === 'navGroup') {
        return `<div class="admin-theme-object-nav"><span>Announcements</span><span class="active">Schedule</span><span>Grades</span></div>`;
      }
      if (object.type === 'announcementCard') {
        return `<div class="admin-theme-object-card"><strong>${escapeHtml(get(state.draft, 'hero.announcementsPageTitle') || 'Announcements')}</strong><span>Feature card material</span></div>`;
      }
      if (object.type === 'gradeShell') {
        return `<div class="admin-theme-object-card"><strong>GradeViewer</strong><span>${escapeHtml(get(state.draft, 'gradeMelon.embedUrl') || 'Embedded app')}</span></div>`;
      }
      if (object.type === 'footerStrip') {
        return `<small>Footer</small><span style="font-size:${clampNumber(get(state.draft, 'appearance.footerSize'), 9, 24)}px">${escapeHtml(get(state.draft, 'footer.supportEmail') || 'Support copy')}</span>`;
      }
      if (object.type === 'materialPanel') {
        return `<div class="admin-theme-material-swatch" style="background:linear-gradient(135deg,${escapeHtml(safeHexColor(get(state.draft, 'theme.bg1'), '#010101'))},${escapeHtml(safeHexColor(get(state.draft, 'theme.bg2'), '#131414'))});border-radius:${radius}"></div><span>Surface material</span>`;
      }
      if (object.type === 'colorRamp') {
        return `<div class="admin-theme-ramp">${['theme.accent','theme.accent2','theme.fg1','theme.fg2'].map(path => `<i style="background:${escapeHtml(safeHexColor(get(state.draft, path), path.includes('fg') ? fg : accent))}"></i>`).join('')}</div><span>${escapeHtml(fg)} · ${escapeHtml(fg2)}</span>`;
      }
      if (object.type === 'actionButton') {
        return `<button type="button" class="ad-btn ad-btn--primary" tabindex="-1">Primary action</button>`;
      }
      return `<strong>${escapeHtml(object.props.text || object.label || 'Text label')}</strong><span>Local canvas note</span>`;
    }
    function renderObject(object) {
      const selected = object.id === model.selectedId ? ' is-selected' : '';
      return `
        <article class="admin-theme-object${selected}" data-theme-object="${escapeHtml(object.id)}" style="left:${object.x}px;top:${object.y}px;width:${object.w}px;height:${object.h}px;z-index:${object.z}">
          <div class="admin-theme-object__bar" data-theme-object-drag><span>${escapeHtml(object.label)}</span><small>${escapeHtml(object.type)}</small></div>
          <div class="admin-theme-object__body">${objectPreview(object)}</div>
          <button type="button" class="admin-theme-object__delete" aria-label="Delete ${escapeHtml(object.label)}" data-theme-delete-object="${escapeHtml(object.id)}">${ICON.trash}</button>
          <i class="admin-theme-resize-handle" data-theme-resize="${escapeHtml(object.id)}"></i>
        </article>`;
    }
    function renderInspector() {
      const object = selectedObject();
      if (!object) return '<div class="admin-node-empty"><strong>No object selected</strong><span>Choose an object on the canvas or add one from the palette.</span></div>';
      const bindings = object.bindings.map(path => {
        const spec = fieldSpecs[path] || { label: path, kind: 'text' };
        const value = get(state.draft, path);
        if (spec.kind === 'readonly') return `<div class="admin-inspector-readonly"><span>${escapeHtml(spec.label)}</span><small>${escapeHtml(spec.note || 'Edit in its source tab.')}</small></div>`;
        if (spec.kind === 'textarea') return `<label class="admin-flow-field"><span>${escapeHtml(spec.label)}</span><textarea class="admin-textarea" rows="3" data-theme-binding="${escapeHtml(path)}">${escapeHtml(value || '')}</textarea></label>`;
        if (spec.kind === 'range') return `<label class="admin-theme-range admin-theme-range--compact"><span>${escapeHtml(spec.label)} <b><output>${escapeHtml(value ?? spec.min)}</output>${escapeHtml(spec.unit || '')}</b></span><input type="range" min="${spec.min}" max="${spec.max}" step="1" value="${escapeHtml(value ?? spec.min)}" data-theme-binding="${escapeHtml(path)}"></label>`;
        if (spec.kind === 'color') return `<label class="admin-flow-field"><span>${escapeHtml(spec.label)}</span><div class="admin-inspector-color"><input type="color" value="${escapeHtml(safeHexColor(value, '#000000'))}" data-theme-binding="${escapeHtml(path)}"><input class="admin-input mono" value="${escapeHtml(safeHexColor(value, '#000000'))}" data-theme-binding="${escapeHtml(path)}" spellcheck="false"></div></label>`;
        return `<label class="admin-flow-field"><span>${escapeHtml(spec.label)}</span><input class="admin-input" value="${escapeHtml(value || '')}" data-theme-binding="${escapeHtml(path)}"></label>`;
      }).join('');
      return `
        <div class="admin-inspector-head">
          <div><strong>${escapeHtml(object.label)}</strong><span>${escapeHtml(object.type)}</span></div>
          <div class="row-gap-8">
            <button type="button" class="admin-btn admin-btn-sm admin-btn-icon" aria-label="Duplicate object" data-theme-duplicate-selected>${ICON.duplicate}</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" aria-label="Delete object" data-theme-delete-selected>${ICON.trash}</button>
          </div>
        </div>
        <div class="admin-inspector-grid">
          ${['x','y','w','h'].map(key => `<label class="admin-flow-field"><span>${key.toUpperCase()}</span><input class="admin-input mono" type="number" min="0" value="${escapeHtml(object[key])}" data-theme-geo="${key}"></label>`).join('')}
        </div>
        <label class="admin-flow-field"><span>Label</span><input class="admin-input" value="${escapeHtml(object.label)}" data-theme-object-label></label>
        ${object.type === 'freeText' ? `<label class="admin-flow-field"><span>Text</span><input class="admin-input" value="${escapeHtml(object.props.text || '')}" data-theme-object-text></label>` : ''}
        <div class="admin-inspector-bindings">${bindings || '<div class="admin-inspector-readonly"><span>Local object</span><small>This item only guides the canvas composition.</small></div>'}</div>`;
    }
    function addObject(type, point) {
      const item = palette.find(entry => entry.type === type) || palette[0];
      const maxZ = Math.max(0, ...model.objects.map(object => Number(object.z) || 0));
      const object = {
        id: uniqueId('theme-object'),
        type: item.type,
        label: item.label,
        x: Math.round((point?.x ?? 140) / 8) * 8,
        y: Math.round((point?.y ?? 140) / 8) * 8,
        w: item.w,
        h: item.h,
        z: maxZ + 1,
        bindings: deepClone(item.bindings || []),
        props: item.type === 'freeText' ? { text: 'Canvas note' } : {}
      };
      model.objects.push(object);
      model.selectedId = object.id;
      saveModel();
      paint();
    }
    function deleteObject(id = model.selectedId) {
      const index = model.objects.findIndex(object => object.id === id);
      if (index < 0) return;
      model.objects.splice(index, 1);
      model.selectedId = model.objects[Math.max(0, index - 1)]?.id || model.objects[0]?.id || null;
      saveModel();
      paint();
    }
    function duplicateObject() {
      const object = selectedObject();
      if (!object) return;
      const copy = deepClone(object);
      copy.id = uniqueId('theme-object');
      copy.label = `${object.label} copy`;
      copy.x += 32;
      copy.y += 32;
      copy.z = Math.max(0, ...model.objects.map(item => Number(item.z) || 0)) + 1;
      model.objects.push(copy);
      model.selectedId = copy.id;
      saveModel();
      paint();
    }
    function paint() {
      const groups = palette.reduce((acc, item) => {
        (acc[item.group] ||= []).push(item);
        return acc;
      }, {});
      host.innerHTML = `
        <div class="admin-studio-frame">
          <aside class="admin-studio-palette" aria-label="Theme object palette">
            <div class="admin-studio-pane-head"><h2>Objects</h2><span>Drag into canvas</span></div>
            <div class="admin-studio-palette-scroll">
              ${Object.entries(groups).map(([group, items]) => `
                <section class="admin-studio-palette-group">
                  <h3>${escapeHtml(group)}</h3>
                  ${items.map(item => `<button type="button" draggable="true" data-add-theme-object="${escapeHtml(item.type)}">${ICON.cursor}<span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.hint)}</small></span></button>`).join('')}
                </section>`).join('')}
            </div>
          </aside>
          <section class="admin-studio-canvas-panel">
            <div class="admin-studio-toolbar">
              <div><h2>Creative canvas</h2><span>Arrange, size, and bind page objects to the draft.</span></div>
              <div class="row-gap-8">
                <button type="button" class="admin-btn admin-btn-sm" data-theme-zoom-out>-</button>
                <span class="admin-studio-zoom" data-theme-zoom-value>${Math.round(model.viewport.scale * 100)}%</span>
                <button type="button" class="admin-btn admin-btn-sm" data-theme-zoom-in>+</button>
                <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-theme-reset-canvas>Reset</button>
                <button type="button" class="admin-btn admin-btn-sm" data-theme-fullscreen>${ICON.fullscreen}<span>Fullscreen</span></button>
              </div>
            </div>
            <div class="admin-object-canvas" data-theme-object-canvas tabindex="0" aria-label="Theme Studio canvas">
              <div class="admin-canvas-world" data-theme-object-world>
                ${model.objects.map(renderObject).join('')}
              </div>
            </div>
          </section>
          <aside class="admin-node-inspector" aria-label="Object inspector">
            <div class="admin-studio-pane-head"><h2>Inspector</h2><span>${model.objects.length} objects</span></div>
            <div data-theme-inspector>${renderInspector()}</div>
          </aside>
        </div>`;
      updateWorldTransform();
      bindThemeWorkbenchEvents();
      refreshWorkspaceLayoutSoon();
    }
    function bindThemeWorkbenchEvents() {
      host.querySelectorAll('[data-add-theme-object]').forEach(btn => {
        btn.addEventListener('click', () => addObject(btn.dataset.addThemeObject, { x: 160 + model.objects.length * 24, y: 160 + model.objects.length * 24 }));
        btn.addEventListener('dragstart', event => {
          event.dataTransfer?.setData('text/plain', btn.dataset.addThemeObject);
          event.dataTransfer?.setData('application/phs-theme-object', btn.dataset.addThemeObject);
        });
      });
      const canvas = host.querySelector('[data-theme-object-canvas]');
      canvas?.addEventListener('dragover', event => event.preventDefault());
      canvas?.addEventListener('drop', event => {
        event.preventDefault();
        const type = event.dataTransfer?.getData('application/phs-theme-object') || event.dataTransfer?.getData('text/plain');
        if (type) addObject(type, canvasPoint(event));
      });
      canvas?.addEventListener('pointerdown', event => {
        if (event.target.closest('[data-theme-object]') || event.target.closest('button,input,textarea,select')) return;
        dragState = { mode: 'pan', startX: event.clientX, startY: event.clientY, origin: deepClone(model.viewport) };
        canvas.setPointerCapture?.(event.pointerId);
      });
      canvas?.addEventListener('pointermove', event => {
        if (!dragState) return;
        if (dragState.mode === 'pan') {
          model.viewport.x = dragState.origin.x + event.clientX - dragState.startX;
          model.viewport.y = dragState.origin.y + event.clientY - dragState.startY;
          updateWorldTransform();
        } else if (dragState.mode === 'move' && dragState.object) {
          const dx = (event.clientX - dragState.startX) / model.viewport.scale;
          const dy = (event.clientY - dragState.startY) / model.viewport.scale;
          dragState.object.x = Math.round((dragState.origin.x + dx) / 8) * 8;
          dragState.object.y = Math.round((dragState.origin.y + dy) / 8) * 8;
          const el = host.querySelector(`[data-theme-object="${cssEscape(dragState.object.id)}"]`);
          if (el) { el.style.left = `${dragState.object.x}px`; el.style.top = `${dragState.object.y}px`; }
        } else if (dragState.mode === 'resize' && dragState.object) {
          const dx = (event.clientX - dragState.startX) / model.viewport.scale;
          const dy = (event.clientY - dragState.startY) / model.viewport.scale;
          dragState.object.w = clampNumber(Math.round((dragState.origin.w + dx) / 8) * 8, 120, 720);
          dragState.object.h = clampNumber(Math.round((dragState.origin.h + dy) / 8) * 8, 64, 520);
          const el = host.querySelector(`[data-theme-object="${cssEscape(dragState.object.id)}"]`);
          if (el) { el.style.width = `${dragState.object.w}px`; el.style.height = `${dragState.object.h}px`; }
        }
      });
      canvas?.addEventListener('pointerup', () => {
        if (!dragState) return;
        dragState = null;
        saveModel();
        paint();
      });
      host.querySelectorAll('[data-theme-object]').forEach(el => {
        el.addEventListener('pointerdown', event => {
          const object = model.objects.find(item => item.id === el.dataset.themeObject);
          if (!object || event.target.closest('[data-theme-resize],[data-theme-delete-object],button,input,textarea,select')) return;
          model.selectedId = object.id;
          saveModel();
          paint();
        });
      });
      host.querySelectorAll('[data-theme-object-drag]').forEach(handle => {
        handle.addEventListener('pointerdown', event => {
          const object = model.objects.find(item => item.id === handle.closest('[data-theme-object]')?.dataset.themeObject);
          if (!object) return;
          event.stopPropagation();
          model.selectedId = object.id;
          dragState = { mode: 'move', object, startX: event.clientX, startY: event.clientY, origin: { x: object.x, y: object.y } };
          canvas?.setPointerCapture?.(event.pointerId);
        });
      });
      host.querySelectorAll('[data-theme-resize]').forEach(handle => {
        handle.addEventListener('pointerdown', event => {
          const object = model.objects.find(item => item.id === handle.dataset.themeResize);
          if (!object) return;
          event.preventDefault();
          event.stopPropagation();
          model.selectedId = object.id;
          dragState = { mode: 'resize', object, startX: event.clientX, startY: event.clientY, origin: { w: object.w, h: object.h } };
          canvas?.setPointerCapture?.(event.pointerId);
        });
      });
      host.querySelectorAll('[data-theme-delete-object]').forEach(btn => btn.addEventListener('click', event => {
        event.stopPropagation();
        deleteObject(btn.dataset.themeDeleteObject);
      }));
      host.querySelector('[data-theme-delete-selected]')?.addEventListener('click', () => deleteObject());
      host.querySelector('[data-theme-duplicate-selected]')?.addEventListener('click', duplicateObject);
      host.querySelector('[data-theme-reset-canvas]')?.addEventListener('click', () => {
        model = normalizeThemeModel(defaultModel);
        saveModel();
        paint();
      });
      host.querySelector('[data-theme-fullscreen]')?.addEventListener('click', () => toggleWorkbenchFullscreen(host));
      host.querySelector('[data-theme-zoom-in]')?.addEventListener('click', () => {
        model.viewport.scale = clampNumber(model.viewport.scale + 0.1, 0.65, 1.4);
        saveModel();
        updateWorldTransform();
      });
      host.querySelector('[data-theme-zoom-out]')?.addEventListener('click', () => {
        model.viewport.scale = clampNumber(model.viewport.scale - 0.1, 0.65, 1.4);
        saveModel();
        updateWorldTransform();
      });
      host.querySelectorAll('[data-theme-geo]').forEach(input => input.addEventListener('change', () => {
        const object = selectedObject();
        if (!object) return;
        object[input.dataset.themeGeo] = clampNumber(input.value, 0, input.dataset.themeGeo === 'h' ? 520 : 1400);
        saveModel();
        paint();
      }));
      host.querySelector('[data-theme-object-label]')?.addEventListener('change', event => {
        const object = selectedObject();
        if (!object) return;
        object.label = String(event.target.value || object.label).trim() || object.label;
        saveModel();
        paint();
      });
      host.querySelector('[data-theme-object-text]')?.addEventListener('input', event => {
        const object = selectedObject();
        if (!object) return;
        object.props.text = event.target.value;
        saveModel();
        const body = host.querySelector(`[data-theme-object="${cssEscape(object.id)}"] .admin-theme-object__body`);
        if (body) body.innerHTML = objectPreview(object);
      });
      host.querySelectorAll('[data-theme-binding]').forEach(input => {
        input.addEventListener('input', () => {
          const path = input.dataset.themeBinding;
          const value = setDraftValue(path, input.value);
          if (input.type === 'range') input.closest('label')?.querySelector('output')?.replaceChildren(document.createTextNode(String(value)));
          host.querySelectorAll(`[data-theme-binding="${cssEscape(path)}"]`).forEach(peer => {
            if (peer !== input && (peer.matches('input') || peer.matches('textarea'))) peer.value = value;
          });
          const object = selectedObject();
          if (object) {
            const body = host.querySelector(`[data-theme-object="${cssEscape(object.id)}"] .admin-theme-object__body`);
            if (body) body.innerHTML = objectPreview(object);
          }
        });
      });
      if (!host.dataset.themeCanvasKeysBound) {
        host.dataset.themeCanvasKeysBound = '1';
        host.addEventListener('keydown', event => {
          if (event.target.closest('input,textarea,select')) return;
          const object = selectedObject();
          if ((event.key === 'Delete' || event.key === 'Backspace') && object) {
            event.preventDefault();
            deleteObject(object.id);
          }
          if (!object || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
          event.preventDefault();
          const step = event.shiftKey ? 16 : 8;
          if (event.key === 'ArrowUp') object.y -= step;
          if (event.key === 'ArrowDown') object.y += step;
          if (event.key === 'ArrowLeft') object.x -= step;
          if (event.key === 'ArrowRight') object.x += step;
          saveModel();
          paint();
        });
      }
    }
    paint();
    return host;
  }

  function renderThemeStudioLiveCanvas() {
    const host = document.createElement('div');
    host.className = 'admin-theme-workbench-host admin-live-theme-studio admin-object-workbench-host';
    let selectedKey = 'heroTitle';
    let selectedText = '';
    let selectedTextPath = '';
    let selectedLabel = '';
    let selectedPaths = [];
    let studioPage = 'schedule';
    const STUDIO_PAGES = [
      { key: 'schedule', label: 'Schedule', file: 'index.html' },
      { key: 'announcements', label: 'Announcements', file: 'announcements.html' },
      { key: 'grades', label: 'Grades', file: 'gradeviewer.html' },
      { key: 'privacy', label: 'Privacy', file: 'privacy.html' }
    ];
    let imageThemeDraft = null;

    const targets = [
      { group: 'Tokens', key: 'brandTokens', label: 'Brand tokens', hint: 'Core public-site palette', paths: ['theme.accent', 'theme.accent2', 'theme.bg1', 'theme.bg2', 'theme.fg1', 'theme.fg2'] },
      { group: 'Tokens', key: 'siteScale', label: 'Type and shape', hint: 'Global scale, radius, and density', paths: ['appearance.heroTitleSize', 'appearance.countdownSize', 'appearance.scheduleTitleSize', 'appearance.periodCardPadding', 'appearance.periodCardRadius', 'appearance.footerSize'] },
      { group: 'Page', key: 'nav', label: 'Navigation shell', hint: 'Logo and nav material', paths: ['branding.logoSrc', 'branding.logoAlt', 'branding.logoLink', 'nav.items'] },
      { group: 'Page', key: 'navLink', label: 'Nav links', hint: 'Default link typography', textTarget: 'navLink', paths: ['nav.items', 'appearance.textStyles.targets.navLink'] },
      { group: 'Page', key: 'navLinkActive', label: 'Active nav', hint: 'Selected link typography', textTarget: 'navLinkActive', paths: ['appearance.textStyles.targets.navLinkActive'] },
      { group: 'Hero', key: 'statusLabel', label: 'Status label', hint: 'Small live-state copy', textTarget: 'statusLabel', textPath: 'hero.noSchoolStatusText', paths: ['hero.schedulePageStatusFallback', 'hero.noSchoolStatusText', 'appearance.textStyles.targets.statusLabel'] },
      { group: 'Hero', key: 'heroEyebrow', label: 'Hero eyebrow', hint: 'Above the main title', textTarget: 'heroEyebrow', textPath: 'hero.schedulePageEyebrow', paths: ['hero.schedulePageEyebrow', 'appearance.heroEyebrowSize', 'appearance.textStyles.targets.heroEyebrow'] },
      { group: 'Hero', key: 'heroTitle', label: 'Hero title', hint: 'Main live schedule title', textTarget: 'heroTitle', paths: ['appearance.heroTitleSize', 'appearance.textStyles.targets.heroTitle'] },
      { group: 'Hero', key: 'countdownRing', label: 'Countdown ring', hint: 'Next-bell timer material', paths: ['appearance.countdownSize', 'theme.accent'] },
      { group: 'Schedule', key: 'scheduleSection', label: 'Schedule surface', hint: 'Period list container', paths: ['appearance.periodCardPadding', 'appearance.periodCardRadius'] },
      { group: 'Schedule', key: 'periodCard', label: 'Period card', hint: 'Individual period surface', paths: ['appearance.periodCardPadding', 'appearance.periodCardRadius'] },
      { group: 'Schedule', key: 'scheduleTitle', label: 'Schedule title', hint: 'Schedule heading', textTarget: 'scheduleTitle', paths: ['appearance.scheduleTitleSize', 'appearance.textStyles.targets.scheduleTitle'] },
      { group: 'Schedule', key: 'scheduleDate', label: 'Schedule date', hint: 'Date line', textTarget: 'scheduleDate', paths: ['appearance.textStyles.targets.scheduleDate'] },
      { group: 'Schedule', key: 'periodTime', label: 'Period time', hint: 'Time range labels', textTarget: 'periodTime', paths: ['appearance.periodTimeSize', 'appearance.textStyles.targets.periodTime'] },
      { group: 'Schedule', key: 'periodName', label: 'Period name', hint: 'Period card title', textTarget: 'periodName', paths: ['appearance.periodNameSize', 'appearance.textStyles.targets.periodName'] },
      { group: 'Schedule', key: 'periodMeta', label: 'Period metadata', hint: 'Duration labels', textTarget: 'periodMeta', paths: ['appearance.periodDurationSize', 'appearance.textStyles.targets.periodMeta'] },
      { group: 'Announcements', key: 'announcementTitle', label: 'Announcement title', hint: 'Page title or selected card title', textTarget: 'announcementTitle', textPath: 'hero.announcementsPageTitle', paths: ['hero.announcementsPageTitle', 'appearance.textStyles.targets.announcementTitle'] },
      { group: 'Announcements', key: 'announcementBullet', label: 'Announcement bullet', hint: 'Selected bullet copy and typography', textTarget: 'announcementBullet', paths: ['announcements.items', 'appearance.textStyles.targets.announcementBullet'] },
      { group: 'Announcements', key: 'announcementCard', label: 'Announcement card', hint: 'Card content lives in Announcements', paths: ['announcements.items'] },
      { group: 'Grades', key: 'gradesTitle', label: 'Grades title', hint: 'Grades page headline', textTarget: 'gradesTitle', textPath: 'hero.gradesPageTitle', paths: ['hero.gradesPageTitle', 'appearance.textStyles.targets.gradesTitle'] },
      { group: 'Grades', key: 'gradesFrame', label: 'Grades embed', hint: 'GradeViewer iframe targets', paths: ['grades.iframeUrlLocal', 'grades.iframeUrlProd'] },
      { group: 'Footer', key: 'footerContact', label: 'Footer contact', hint: 'Support copy and scale', textTarget: 'footerContact', textPath: 'footer.supportEmail', paths: ['footer.supportEmail', 'appearance.footerSize', 'appearance.footerColor', 'appearance.textStyles.targets.footerContact'] },
      { group: 'Footer', key: 'footerLink', label: 'Footer link', hint: 'Privacy link typography', textTarget: 'footerLink', paths: ['appearance.footerSize', 'appearance.footerColor', 'appearance.textStyles.targets.footerLink'] }
    ];
    const targetAliases = {
      logo: 'nav',
      navLinks: 'navLink',
      statusPill: 'statusLabel',
      heroText: 'heroTitle',
      announcementsSection: 'announcementTitle',
      announcementsList: 'announcementBullet'
    };
    function targetFor(key) {
      const raw = String(key || '');
      const normalized = targetAliases[raw] || raw;
      return targets.find(target => target.key === normalized || target.textTarget === normalized) || null;
    }
    function fallbackTarget() {
      return targets.find(target => target.key === 'brandTokens') || targets[0];
    }
    function resolveStudioTarget(key, options = {}) {
      const known = targetFor(key);
      const raw = String(key || options.styleTarget || '').trim();
      const paths = Array.isArray(options.paths) ? options.paths.filter(Boolean) : [];
      const textTarget = String(options.styleTarget || '').trim();
      if (known) {
        return {
          ...known,
          label: options.label || known.label,
          textPath: options.textPath || known.textPath || '',
          paths: paths.length ? [...new Set([...(known.paths || []), ...paths])] : (known.paths || [])
        };
      }
      return {
        group: 'Selection',
        key: raw || 'pageSelection',
        label: options.label || raw || 'Page selection',
        hint: 'Live public-site element',
        textTarget: textTarget || '',
        textPath: options.textPath || '',
        paths
      };
    }
    const fieldSpecs = {
      'theme.accent': { label: 'Accent', kind: 'color' },
      'theme.accent2': { label: 'Secondary', kind: 'color' },
      'theme.bg1': { label: 'Background start', kind: 'color' },
      'theme.bg2': { label: 'Background end', kind: 'color' },
      'theme.fg1': { label: 'Primary text', kind: 'color' },
      'theme.fg2': { label: 'Secondary text', kind: 'color' },
      'branding.logoSrc': { label: 'Logo image path', kind: 'text' },
      'branding.logoAlt': { label: 'Logo alt text', kind: 'text' },
      'branding.logoLink': { label: 'Logo click URL', kind: 'text' },
      'hero.schedulePageStatusFallback': { label: 'Status pill loading text', kind: 'text', note: 'Shown while the schedule loads on the public site.' },
      'hero.noSchoolStatusText': { label: '"Enjoy your day" text', kind: 'text', note: 'Shown on non-school days inside the status pill.' },
      'hero.schedulePageEyebrow': { label: 'Hero eyebrow text', kind: 'text' },
      'hero.announcementsPageTitle': { label: 'Announcements page title', kind: 'text' },
      'hero.gradesPageTitle': { label: 'Grades page title', kind: 'text' },
      'announcements.items': { label: 'Announcement cards', kind: 'readonly', note: 'Click a card title or bullet in the preview to edit its text, or use the Announcements tab for full card controls.' },
      'grades.iframeUrlLocal': { label: 'Local GradeViewer URL', kind: 'text' },
      'grades.iframeUrlProd': { label: 'Production GradeViewer URL', kind: 'text' },
      'gradeMelon.embedUrl': { label: 'Grades embed URL', kind: 'text' },
      'footer.supportEmail': { label: 'Footer support copy', kind: 'textarea' },
      'appearance.heroEyebrowSize': { label: 'Eyebrow size', kind: 'range', min: 12, max: 48, unit: 'px' },
      'appearance.heroTitleSize': { label: 'Hero title size', kind: 'range', min: 42, max: 160, unit: 'px' },
      'appearance.countdownSize': { label: 'Countdown size', kind: 'range', min: 32, max: 100, unit: 'px' },
      'appearance.scheduleTitleSize': { label: 'Schedule title size', kind: 'range', min: 16, max: 40, unit: 'px' },
      'appearance.periodTimeSize': { label: 'Period time size', kind: 'range', min: 11, max: 22, unit: 'px' },
      'appearance.periodNameSize': { label: 'Period name size', kind: 'range', min: 12, max: 28, unit: 'px' },
      'appearance.periodDurationSize': { label: 'Period meta size', kind: 'range', min: 10, max: 20, unit: 'px' },
      'appearance.periodCardPadding': { label: 'Card padding', kind: 'range', min: 8, max: 34, unit: 'px' },
      'appearance.periodCardRadius': { label: 'Card radius', kind: 'range', min: 0, max: 28, unit: 'px' },
      'appearance.footerSize': { label: 'Footer text size', kind: 'range', min: 9, max: 24, unit: 'px' },
      'appearance.footerColor': { label: 'Footer color', kind: 'color' },
      'nav.items': { label: 'Navigation items', kind: 'readonly', note: 'Go to the Site tab → Navigation to edit labels and links.' }
    };

    function studioPreviewUrl() {
      const page = STUDIO_PAGES.find(p => p.key === studioPage) || STUDIO_PAGES[0];
      const url = new URL(page.file, publicPreviewBase());
      url.searchParams.set('_preview', '1');
      url.searchParams.set('_studio', '1');
      url.searchParams.set('_ts', String(Date.now()));
      return url.href;
    }
    function studioOrigin() {
      const frame = host.querySelector('[data-theme-studio-frame]');
      if (!frame) return null;
      try {
        const url = new URL(frame.src, location.href);
        return isAllowedPublicPreviewUrl(url) ? url.origin : null;
      } catch {
        return null;
      }
    }
    function postStudioPreview() {
      const frame = host.querySelector('[data-theme-studio-frame]');
      const origin = studioOrigin();
      if (!frame?.contentWindow || !origin) return;
      try {
        frame.contentWindow.postMessage({
          type: 'phs:preview-settings',
          settings: state.draft,
          previewDate: state.previewDate || ''
        }, origin);
        frame.contentWindow.postMessage({ type: 'phs:studio-select-key', key: selectedKey }, origin);
      } catch {}
    }
    const debouncedStudioPreview = (() => {
      let t = 0;
      return () => { clearTimeout(t); t = setTimeout(postStudioPreview, 120); };
    })();
    function setDraftValue(path, rawValue) {
      const spec = fieldSpecs[path] || {};
      const value = spec.kind === 'range'
        ? clampNumber(rawValue, spec.min, spec.max)
        : spec.kind === 'color'
          ? safeHexColor(rawValue, get(state.draft, path) || '#000000')
          : String(rawValue ?? '');
      set(state.draft, path, value);
      markDirty();
      pushPreview();
      debouncedStudioPreview();
      return value;
    }
    function ensureTextStyleTarget(textTarget) {
      if (!textTarget) return null;
      state.draft.appearance ||= {};
      state.draft.appearance.textStyles ||= { version: 1, targets: {} };
      state.draft.appearance.textStyles.version = 1;
      state.draft.appearance.textStyles.targets ||= {};
      state.draft.appearance.textStyles.targets[textTarget] ||= { base: {}, letters: [] };
      state.draft.appearance.textStyles.targets[textTarget].base ||= {};
      state.draft.appearance.textStyles.targets[textTarget].letters ||= [];
      return state.draft.appearance.textStyles.targets[textTarget];
    }
    function currentTextStyle(textTarget) {
      return state.draft?.appearance?.textStyles?.targets?.[textTarget] || { base: {}, letters: [] };
    }
    function setBaseStyle(textTarget, prop, value, options = {}) {
      const target = ensureTextStyleTarget(textTarget);
      if (!target) return;
      if (!value) delete target.base[prop];
      else target.base[prop] = value;
      markDirty();
      pushPreview();
      debouncedStudioPreview();
      if (options.paint !== false) paintInspector();
    }
    function addLetterRun(textTarget, start, end, style) {
      const target = ensureTextStyleTarget(textTarget);
      const chars = Array.from(selectedText || '');
      if (!target || !chars.length) return;
      const safeStart = clampNumber(start, 0, chars.length - 1);
      const safeEnd = clampNumber(end, safeStart + 1, chars.length);
      target.letters.push({ start: safeStart, end: safeEnd, style });
      target.letters = target.letters.slice(-80);
      markDirty();
      pushPreview();
      debouncedStudioPreview();
      paintInspector();
    }
    function clearLetterRuns(textTarget) {
      const target = ensureTextStyleTarget(textTarget);
      if (!target) return;
      target.letters = [];
      markDirty();
      pushPreview();
      debouncedStudioPreview();
      paintInspector();
    }
    function resetTextTarget(textTarget) {
      const targets = state.draft?.appearance?.textStyles?.targets;
      if (!textTarget || !targets?.[textTarget]) return;
      delete targets[textTarget];
      markDirty();
      pushPreview();
      debouncedStudioPreview();
      paintInspector();
    }
    function applyTextPreset(textTarget, preset) {
      const target = ensureTextStyleTarget(textTarget);
      if (!target) return;
      const presets = {
        label: { fontWeight: '760', letterSpacing: '0.08em', textTransform: 'uppercase', fontStyle: 'normal', textDecoration: 'none' },
        headline: { fontWeight: '820', letterSpacing: '-0.01em', textTransform: 'none', fontStyle: 'normal', textDecoration: 'none' },
        editorial: { fontWeight: '520', letterSpacing: '0px', textTransform: 'none', fontStyle: 'italic', textDecoration: 'none' },
        quiet: { fontWeight: '560', letterSpacing: '0.01em', textTransform: 'none', fontStyle: 'normal', textDecoration: 'none' }
      };
      if (preset === 'reset') target.base = {};
      else target.base = { ...(target.base || {}), ...(presets[preset] || {}) };
      markDirty();
      pushPreview();
      postStudioPreview();
      paintInspector();
    }
    function textValueForTarget(target) {
      if (target?.textPath) return String(get(state.draft, target.textPath) || '');
      if (target?.textTarget && selectedText) return selectedText;
      return ({
        statusLabel: 'In session',
        heroTitle: 'Live schedule title',
        countdownRing: 'Next bell countdown',
        navLink: 'Schedule',
        navLinkActive: 'Schedule',
        scheduleTitle: 'Today schedule',
        scheduleDate: 'Friday, May 29',
        periodTime: '7:45 AM - 8:35 AM',
        periodName: 'Period 1',
        periodMeta: '50 minutes',
        announcementBullet: 'Announcement text',
        footerLink: 'Privacy & Safety'
      })[target?.key] || '';
    }
    function changedThemeTokenCount() {
      const paths = Object.keys(fieldSpecs).filter(path => fieldSpecs[path].kind !== 'readonly');
      const direct = paths.filter(path => JSON.stringify(get(state.draft, path)) !== JSON.stringify(get(state.settings, path))).length;
      const textStylesChanged = JSON.stringify(state.draft?.appearance?.textStyles || {}) !== JSON.stringify(state.settings?.appearance?.textStyles || {});
      return direct + (textStylesChanged ? 1 : 0);
    }
    function saveLiveThemePreset() {
      const nameInput = host.querySelector('[data-live-preset-name]');
      const name = String(nameInput?.value || '').trim() || `Studio draft ${themePresets().length + 1}`;
      const tokens = currentThemeTokens();
      themePresets().push({
        id: `preset-${Date.now().toString(36)}`,
        name,
        tokens,
        light: deepClone(tokens),
        dark: deepClone(tokens)
      });
      if (nameInput) nameInput.value = '';
      markDirty();
      toast('Theme preset saved to draft.', 'success', 1800);
      paintInspector();
    }
    function luminance(color) {
      return (color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722) / 255;
    }
    function colorDistance(a, b) {
      return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    }
    function extractPaletteFromPixels(pixels) {
      const samples = [];
      for (let i = 0; i < pixels.length; i += 4 * 5) {
        const alpha = pixels[i + 3];
        if (alpha < 180) continue;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min < 8 && max > 244) continue;
        samples.push({ r, g, b });
        if (samples.length >= 2600) break;
      }
      if (!samples.length) return null;
      let centers = [0.12, 0.32, 0.52, 0.72, 0.9].map(point => {
        const sorted = samples.slice().sort((a, b) => luminance(a) - luminance(b));
        return { ...sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * point))] };
      });
      for (let pass = 0; pass < 10; pass++) {
        const buckets = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
        samples.forEach(sample => {
          let best = 0;
          let bestDistance = Infinity;
          centers.forEach((center, index) => {
            const distance = colorDistance(sample, center);
            if (distance < bestDistance) {
              best = index;
              bestDistance = distance;
            }
          });
          buckets[best].r += sample.r;
          buckets[best].g += sample.g;
          buckets[best].b += sample.b;
          buckets[best].count += 1;
        });
        centers = centers.map((center, index) => {
          const bucket = buckets[index];
          return bucket.count
            ? { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count, count: bucket.count }
            : center;
        });
      }
      return centers
        .filter(color => color.count !== 0)
        .sort((a, b) => luminance(a) - luminance(b));
    }
    function tokensFromPalette(palette) {
      const darkest = palette[0] || hexToRgb('#050505');
      const lightest = palette[palette.length - 1] || hexToRgb('#f6f6f2');
      const middle = palette[Math.max(0, Math.floor(palette.length / 2))] || hexToRgb('#a8aaa8');
      const accent = rgbToHex(middle);
      return {
        theme: {
          accent,
          accent2: mixHex(accent, '#131414', 0.72),
          bg1: rgbToHex(darkest),
          bg2: rgbToHex(palette[1] || darkest),
          fg1: rgbToHex(lightest),
          fg2: mixHex(rgbToHex(lightest), accent, 0.42)
        }
      };
    }
    async function extractThemeFromImage(file) {
      if (!file?.type?.startsWith('image/')) throw new Error('Choose a PNG, JPEG, or WebP image.');
      const bitmap = await createImageBitmap(file);
      const size = 96;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, size, size);
      bitmap.close?.();
      const palette = extractPaletteFromPixels(ctx.getImageData(0, 0, size, size).data);
      if (!palette) throw new Error('Could not read usable colors from that image.');
      imageThemeDraft = tokensFromPalette(palette);
      applyThemeTokens(imageThemeDraft);
      postStudioPreview();
      paintImageThemeDrop();
      toast('Image palette applied to the preview.', 'success', 1800);
    }
    function renderImageThemeDrop() {
      const swatches = imageThemeDraft?.theme
        ? ['accent', 'bg1', 'bg2', 'fg1', 'fg2'].map(key => `<i style="background:${escapeHtml(imageThemeDraft.theme[key])}"></i>`).join('')
        : '';
      return `
        <section class="admin-image-theme-drop" data-image-theme-drop>
          <input type="file" accept="image/png,image/jpeg,image/webp" data-image-theme-input hidden>
          <div><strong>Image to theme</strong><span>Drop a screenshot or photo to extract a restrained palette.</span></div>
          <button type="button" class="ad-btn ad-btn--ghost" data-image-theme-pick>${ICON.upload}<span>Choose image</span></button>
          <div class="admin-image-theme-swatches" data-image-theme-swatches>${swatches}</div>
          <button type="button" class="ad-btn ad-btn--quiet" data-image-theme-save ${imageThemeDraft ? '' : 'disabled'}>Save as preset</button>
        </section>`;
    }
    function paintImageThemeDrop() {
      const drop = host.querySelector('[data-image-theme-drop]');
      if (!drop) return;
      const template = document.createElement('template');
      template.innerHTML = renderImageThemeDrop().trim();
      drop.replaceWith(template.content.firstElementChild);
      bindImageThemeDrop();
    }
    function bindImageThemeDrop() {
      const drop = host.querySelector('[data-image-theme-drop]');
      const input = host.querySelector('[data-image-theme-input]');
      if (!drop || !input) return;
      const handleFile = file => extractThemeFromImage(file).catch(error => toast(error.message, 'error', 3600));
      host.querySelector('[data-image-theme-pick]')?.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        if (input.files?.[0]) handleFile(input.files[0]);
        input.value = '';
      });
      drop.addEventListener('dragover', event => {
        event.preventDefault();
        drop.classList.add('is-dragging');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
      drop.addEventListener('drop', event => {
        event.preventDefault();
        drop.classList.remove('is-dragging');
        const file = event.dataTransfer?.files?.[0];
        if (file) handleFile(file);
      });
      host.querySelector('[data-image-theme-save]')?.addEventListener('click', () => {
        if (!imageThemeDraft) return;
        themePresets().push({
          id: `image-preset-${Date.now().toString(36)}`,
          name: `Image palette ${themePresets().length + 1}`,
          tokens: deepClone(imageThemeDraft),
          light: deepClone(imageThemeDraft),
          dark: deepClone(imageThemeDraft)
        });
        markDirty();
        toast('Image palette saved as a preset.', 'success', 1800);
        paintInspector();
        paintImageThemeDrop();
      });
    }
    function renderBoundField(path) {
      const spec = fieldSpecs[path] || { label: path, kind: 'text' };
      const value = get(state.draft, path);
      if (spec.kind === 'readonly') {
        return `<div class="admin-inspector-readonly"><span>${escapeHtml(spec.label)}</span><small>${escapeHtml(spec.note || '')}</small></div>`;
      }
      if (spec.kind === 'textarea') {
        return `<label class="admin-flow-field"><span>${escapeHtml(spec.label)}</span><textarea class="admin-textarea" rows="4" data-studio-binding="${escapeHtml(path)}">${escapeHtml(value || '')}</textarea></label>`;
      }
      if (spec.kind === 'range') {
        const next = Number.isFinite(Number(value)) ? value : spec.min;
        return `<label class="admin-theme-range admin-theme-range--compact"><span>${escapeHtml(spec.label)} <b><output>${escapeHtml(next)}</output>${escapeHtml(spec.unit || '')}</b></span><input type="range" min="${spec.min}" max="${spec.max}" step="1" value="${escapeHtml(next)}" data-studio-binding="${escapeHtml(path)}"></label>`;
      }
      if (spec.kind === 'color') {
        const hex = safeHexColor(value, '#a8aaa8');
        return `<label class="admin-flow-field"><span>${escapeHtml(spec.label)}</span><div class="admin-inspector-color"><input type="color" value="${escapeHtml(hex)}" data-studio-binding="${escapeHtml(path)}"><input class="admin-input mono" value="${escapeHtml(hex)}" data-studio-binding="${escapeHtml(path)}" spellcheck="false"></div></label>`;
      }
      return `<label class="admin-flow-field"><span>${escapeHtml(spec.label)}</span><input class="admin-input" value="${escapeHtml(value || '')}" data-studio-binding="${escapeHtml(path)}"></label>`;
    }
    function renderTextContentEditor(target) {
      if (!target?.textTarget) return '';
      const liveText = textValueForTarget(target);
      if (!target.textPath) {
        return `<div class="admin-inspector-live-badge">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5l2 1"/></svg>
          <span>Live — set by schedule · <em>style below</em></span>
        </div>`;
      }
      const multiline = String(liveText).length > 52 || target.textPath === 'footer.supportEmail';
      return `<section class="admin-live-text-editor">
        <div class="admin-inspector-minihead"><strong>Text content</strong><span>${escapeHtml(target.label)}</span></div>
        <label class="admin-flow-field">
          <span>${escapeHtml(target.label)}</span>
          ${multiline
            ? `<textarea class="admin-textarea" rows="4" data-studio-text-content="${escapeHtml(target.textPath)}">${escapeHtml(liveText)}</textarea>`
            : `<input class="admin-input" value="${escapeHtml(liveText)}" data-studio-text-content="${escapeHtml(target.textPath)}">`}
        </label>
      </section>`;
    }
    function renderTextStyleInspector(textTarget) {
      if (!textTarget) return '';
      const textStyle = currentTextStyle(textTarget);
      const base = textStyle.base || {};
      const letters = asArray(textStyle.letters);
      const chars = Array.from(selectedText || textValueForTarget(targetFor(textTarget) || { key: textTarget, textTarget }) || '').slice(0, 80);
      const brush = safeHexColor(base.color, safeHexColor(get(state.draft, 'theme.fg1'), '#ffffff'));
      return `
        <section class="admin-live-style-panel">
          <div class="admin-inspector-head">
            <div><strong>Text style</strong><span>${escapeHtml(textTarget)} · ${letters.length} letter ${letters.length === 1 ? 'run' : 'runs'}</span></div>
          </div>
          <label class="admin-flow-field">
            <span>Base color</span>
            <div class="admin-inspector-color">
              <input type="color" value="${escapeHtml(brush)}" data-style-base="${escapeHtml(textTarget)}" data-style-prop="color">
              <input class="admin-input mono" value="${escapeHtml(brush)}" data-style-base="${escapeHtml(textTarget)}" data-style-prop="color" spellcheck="false">
            </div>
          </label>
          <label class="admin-theme-range admin-theme-range--compact">
            <span>Weight <b><output>${escapeHtml(base.fontWeight || 700)}</output></b></span>
            <input type="range" min="100" max="900" step="100" value="${escapeHtml(base.fontWeight || 700)}" data-style-base="${escapeHtml(textTarget)}" data-style-prop="fontWeight">
          </label>
          <label class="admin-theme-range admin-theme-range--compact">
            <span>Letter spacing <b><output>${escapeHtml(parseFloat(base.letterSpacing || '0') || 0)}</output>px</b></span>
            <input type="range" min="-2" max="8" step="0.25" value="${escapeHtml(parseFloat(base.letterSpacing || '0') || 0)}" data-style-base="${escapeHtml(textTarget)}" data-style-prop="letterSpacing">
          </label>
          <details class="admin-inspector-disclosure">
            <summary>Advanced text controls</summary>
            <div class="admin-inspector-disclosure__body">
              <div class="admin-style-toggle-row">
                <button type="button" class="ad-btn ad-btn--ghost ${base.fontStyle === 'italic' ? 'is-active' : ''}" data-style-toggle="${escapeHtml(textTarget)}" data-style-prop="fontStyle" data-style-on="italic" data-style-off="normal">Italic</button>
                <button type="button" class="ad-btn ad-btn--ghost ${base.textDecoration === 'underline' ? 'is-active' : ''}" data-style-toggle="${escapeHtml(textTarget)}" data-style-prop="textDecoration" data-style-on="underline" data-style-off="none">Underline</button>
              </div>
              <label class="admin-flow-field">
                <span>Text case</span>
                <select class="admin-select" data-style-base="${escapeHtml(textTarget)}" data-style-prop="textTransform">
                  ${['none', 'uppercase', 'lowercase', 'capitalize'].map(option => `<option value="${option}" ${base.textTransform === option ? 'selected' : ''}>${option}</option>`).join('')}
                </select>
              </label>
              <div class="admin-style-preset-row" aria-label="Text style presets">
                <button type="button" class="ad-btn ad-btn--ghost" data-style-preset="${escapeHtml(textTarget)}" data-style-preset-name="label">Label</button>
                <button type="button" class="ad-btn ad-btn--ghost" data-style-preset="${escapeHtml(textTarget)}" data-style-preset-name="headline">Headline</button>
                <button type="button" class="ad-btn ad-btn--ghost" data-style-preset="${escapeHtml(textTarget)}" data-style-preset-name="editorial">Editorial</button>
                <button type="button" class="ad-btn ad-btn--quiet" data-style-preset="${escapeHtml(textTarget)}" data-style-preset-name="reset">Reset</button>
              </div>
              <div class="admin-letter-editor">
                <div class="admin-letter-editor__head">
                  <strong>Letter painter</strong>
                  <button type="button" class="ad-btn ad-btn--quiet" data-clear-letter-runs="${escapeHtml(textTarget)}">Clear</button>
                </div>
                <div class="admin-letter-controls">
                  <input class="admin-input mono" type="number" min="0" max="${Math.max(chars.length - 1, 0)}" value="0" aria-label="Start character" data-letter-start>
                  <input class="admin-input mono" type="number" min="1" max="${Math.max(chars.length, 1)}" value="${Math.min(1, chars.length)}" aria-label="End character" data-letter-end>
                  <input type="color" value="${escapeHtml(brush)}" aria-label="Letter color" data-letter-color>
                  <button type="button" class="ad-btn ad-btn--ghost" data-apply-letter-run="${escapeHtml(textTarget)}">Apply</button>
                </div>
                <div class="admin-letter-grid" aria-label="Editable characters">
                  ${chars.length ? chars.map((char, index) => `<button type="button" data-letter-cell="${index}" data-style-target="${escapeHtml(textTarget)}" title="Character ${index + 1}" aria-label="Paint character ${index + 1}: ${escapeHtml(char === ' ' ? 'space' : char)}">${escapeHtml(char === ' ' ? '·' : char)}</button>`).join('') : '<span>No live text selected yet.</span>'}
                </div>
              </div>
            </div>
          </details>
        </section>`;
    }
    function renderInspector() {
      const target = resolveStudioTarget(selectedKey, { paths: selectedPaths, textPath: selectedTextPath, label: selectedLabel });
      const allPaths = [...new Set([...(target.paths || []), ...selectedPaths])];
      // Separate paths into editable settings vs text-style internals
      const settingPaths = allPaths
        .filter(path => path !== target.textPath)
        .filter(path => !String(path).startsWith('appearance.textStyles.targets.'));
      // Split settings into categories for grouping
      const colorPaths = settingPaths.filter(p => fieldSpecs[p]?.kind === 'color');
      const sizePaths = settingPaths.filter(p => fieldSpecs[p]?.kind === 'range');
      const otherPaths = settingPaths.filter(p => !colorPaths.includes(p) && !sizePaths.includes(p));
      return `
        <div class="admin-inspector-head">
          <div><strong>${escapeHtml(target.label)}</strong><span>${escapeHtml(target.hint || 'Click any element on the page to edit it')}</span></div>
          <button type="button" class="admin-btn admin-btn-sm admin-btn-icon" aria-label="Highlight in preview" data-studio-focus-selected>${ICON.eye}</button>
        </div>
        ${renderTextContentEditor(target)}
        ${colorPaths.length ? `<section class="admin-inspector-section"><div class="admin-inspector-minihead"><strong>Colors</strong></div>${colorPaths.map(renderBoundField).join('')}</section>` : ''}
        ${sizePaths.length ? `<section class="admin-inspector-section"><div class="admin-inspector-minihead"><strong>Size & spacing</strong></div>${sizePaths.map(renderBoundField).join('')}</section>` : ''}
        ${otherPaths.length ? `<section class="admin-inspector-section"><div class="admin-inspector-minihead"><strong>Settings</strong></div>${otherPaths.map(renderBoundField).join('')}</section>` : ''}
        ${renderTextStyleInspector(target.textTarget)}
        <details class="admin-inspector-disclosure">
          <summary>Presets</summary>
          <div class="admin-inspector-disclosure__body">
            <div class="admin-live-studio-actions">
              <input class="admin-input" data-live-preset-name placeholder="Name this preset…" aria-label="Theme preset name">
              <button type="button" class="ad-btn ad-btn--primary" data-live-preset-save>${ICON.plus}<span>Save preset</span></button>
            </div>
            ${target.textTarget ? `<button type="button" class="ad-btn ad-btn--quiet" style="width:100%;margin-top:var(--space-2)" data-reset-text-target="${escapeHtml(target.textTarget)}">Reset text style</button>` : ''}
          </div>
        </details>`;
    }
    function groupedTargets() {
      return targets.reduce((acc, target) => {
        (acc[target.group] ||= []).push(target);
        return acc;
      }, {});
    }
    function paintLayerState() {
      host.querySelectorAll('[data-studio-target]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.studioTarget === selectedKey);
      });
    }
    function paintInspector() {
      const inspector = host.querySelector('[data-live-theme-inspector]');
      if (!inspector) return;
      inspector.innerHTML = renderInspector();
      bindInspectorEvents(inspector);
      paintLayerState();
      host.querySelector('.admin-studio-frame--live')?.classList.add('has-selection');
    }
    function selectTarget(key, options = {}) {
      const target = resolveStudioTarget(key, options);
      selectedKey = target.key;
      selectedTextPath = options.textPath || '';
      selectedLabel = options.label || '';
      if (isPresent(options.text)) selectedText = String(options.text || '');
      else selectedText = textValueForTarget(target);
      if (Array.isArray(options.paths)) selectedPaths = options.paths;
      paintInspector();
      if (options.post !== false) postStudioPreview();
    }
    function bindInspectorEvents(root) {
      root.querySelectorAll('[data-studio-text-content]').forEach(input => {
        input.addEventListener('input', () => {
          const value = setDraftValue(input.dataset.studioTextContent, input.value);
          selectedText = String(value || '');
          root.querySelectorAll(`[data-studio-text-content="${cssEscape(input.dataset.studioTextContent)}"]`).forEach(peer => {
            if (peer !== input) peer.value = value;
          });
        });
        input.addEventListener('change', () => {
          if (input.type !== 'color') paintInspector();
        });
      });
      root.querySelectorAll('[data-studio-binding]').forEach(input => {
        input.addEventListener('input', () => {
          const value = setDraftValue(input.dataset.studioBinding, input.value);
          if (input.type === 'range') input.closest('label')?.querySelector('output')?.replaceChildren(document.createTextNode(String(value)));
          root.querySelectorAll(`[data-studio-binding="${cssEscape(input.dataset.studioBinding)}"]`).forEach(peer => {
            if (peer !== input && (peer.matches('input') || peer.matches('textarea'))) peer.value = value;
          });
        });
      });
      root.querySelectorAll('[data-style-base]').forEach(input => {
        input.addEventListener('input', () => {
          const prop = input.dataset.styleProp;
          let value = input.value;
          if (prop === 'color') value = safeHexColor(value, '#ffffff');
          if (prop === 'letterSpacing') value = `${Number(value || 0)}px`;
          if (input.type === 'range') input.closest('label')?.querySelector('output')?.replaceChildren(document.createTextNode(String(parseFloat(value) || value)));
          root.querySelectorAll(`[data-style-base="${cssEscape(input.dataset.styleBase)}"][data-style-prop="${cssEscape(prop)}"]`).forEach(peer => {
            if (peer !== input && (peer.matches('input') || peer.matches('textarea') || peer.matches('select'))) peer.value = input.value;
          });
          setBaseStyle(input.dataset.styleBase, prop, value, { paint: false });
        });
        input.addEventListener('change', () => {
          if (input.type !== 'color') paintInspector();
        });
      });
      root.querySelectorAll('[data-style-toggle]').forEach(button => {
        button.addEventListener('click', () => {
          const style = currentTextStyle(button.dataset.styleToggle).base || {};
          const prop = button.dataset.styleProp;
          setBaseStyle(button.dataset.styleToggle, prop, style[prop] === button.dataset.styleOn ? button.dataset.styleOff : button.dataset.styleOn);
        });
      });
      root.querySelectorAll('[data-style-preset]').forEach(button => {
        button.addEventListener('click', () => applyTextPreset(button.dataset.stylePreset, button.dataset.stylePresetName));
      });
      root.querySelector('[data-apply-letter-run]')?.addEventListener('click', event => {
        const textTarget = event.currentTarget.dataset.applyLetterRun;
        const start = Number(root.querySelector('[data-letter-start]')?.value || 0);
        const end = Number(root.querySelector('[data-letter-end]')?.value || start + 1);
        const color = safeHexColor(root.querySelector('[data-letter-color]')?.value, '#ffffff');
        addLetterRun(textTarget, start, end, { color });
      });
      root.querySelectorAll('[data-letter-cell]').forEach(button => {
        button.addEventListener('click', () => {
          const color = safeHexColor(root.querySelector('[data-letter-color]')?.value, '#ffffff');
          const start = Number(button.dataset.letterCell);
          addLetterRun(button.dataset.styleTarget, start, start + 1, { color });
        });
      });
      root.querySelector('[data-clear-letter-runs]')?.addEventListener('click', event => clearLetterRuns(event.currentTarget.dataset.clearLetterRuns));
      root.querySelector('[data-studio-focus-selected]')?.addEventListener('click', () => {
        const frame = host.querySelector('[data-theme-studio-frame]');
        const origin = studioOrigin();
        if (frame?.contentWindow && origin) {
          try { frame.contentWindow.postMessage({ type: 'phs:studio-reveal', key: selectedKey }, origin); } catch {}
        }
      });
      root.querySelector('[data-live-preset-save]')?.addEventListener('click', saveLiveThemePreset);
      root.querySelector('[data-reset-text-target]')?.addEventListener('click', event => resetTextTarget(event.currentTarget.dataset.resetTextTarget));
    }
    function paint() {
      const groups = groupedTargets();
      host.innerHTML = `
        <div class="admin-studio-frame admin-studio-frame--live">
          <aside class="admin-studio-palette admin-live-layer-list" aria-label="Public site layers">
            <div class="admin-studio-pane-head"><h2>Real page</h2><span>Select anything users can see</span></div>
            <div class="admin-studio-search">
              ${ICON.search}
              <input class="admin-input" type="search" data-studio-layer-search placeholder="Filter layers" aria-label="Filter public site layers">
            </div>
            ${renderImageThemeDrop()}
            <div class="admin-studio-palette-scroll">
              ${Object.entries(groups).map(([group, items]) => `
                <section class="admin-studio-palette-group">
                  <h3>${escapeHtml(group)}</h3>
                  ${items.map(item => `<button type="button" data-studio-target="${escapeHtml(item.key)}">${ICON.cursor}<span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.hint)}</small></span></button>`).join('')}
                </section>`).join('')}
            </div>
          </aside>
          <section class="admin-studio-canvas-panel admin-site-canvas-shell">
            <div class="admin-studio-toolbar">
              <div class="admin-studio-page-seg" role="tablist" aria-label="Preview page">
                ${STUDIO_PAGES.map(p => `<button type="button" class="admin-studio-page-tab${p.key === studioPage ? ' is-active' : ''}" data-studio-page="${p.key}" role="tab" aria-selected="${p.key === studioPage}">${escapeHtml(p.label)}</button>`).join('')}
              </div>
              <div class="row-gap-8">
                <button type="button" class="admin-btn admin-btn-sm is-active" data-studio-frame-width="100%">Desktop</button>
                <button type="button" class="admin-btn admin-btn-sm" data-studio-frame-width="390">Mobile</button>
                <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-studio-reload>${ICON.refresh}<span>Reload</span></button>
                <button type="button" class="admin-btn admin-btn-sm" data-theme-fullscreen>${ICON.fullscreen}<span>Fullscreen</span></button>
              </div>
            </div>
            <div class="admin-site-preview-bezel" data-site-preview-bezel>
              <div class="admin-site-preview-hint">${ICON.cursor}<span>Click the live page to select an editable element.</span></div>
              <iframe data-theme-studio-frame title="Public site theme canvas" src="${escapeHtml(studioPreviewUrl())}"></iframe>
            </div>
          </section>
          <aside class="admin-node-inspector" aria-label="Live site inspector">
            <div class="admin-studio-pane-head"><h2>Inspector</h2><span>Draft writes to the live preview</span></div>
            <div data-live-theme-inspector>${renderInspector()}</div>
          </aside>
        </div>`;
      bindWorkbenchEvents();
      paintLayerState();
      postStudioPreview();
      refreshWorkspaceLayoutSoon();
    }
    function bindWorkbenchEvents() {
      host.querySelectorAll('[data-studio-target]').forEach(button => {
        button.addEventListener('click', () => selectTarget(button.dataset.studioTarget));
      });
      host.querySelector('[data-studio-layer-search]')?.addEventListener('input', event => {
        const query = String(event.target.value || '').trim().toLowerCase();
        host.querySelectorAll('[data-studio-target]').forEach(button => {
          const haystack = button.textContent.toLowerCase();
          button.hidden = Boolean(query && !haystack.includes(query));
        });
      });
      host.querySelector('[data-theme-fullscreen]')?.addEventListener('click', () => toggleWorkbenchFullscreen(host));
      host.querySelector('[data-studio-reload]')?.addEventListener('click', () => {
        const frame = host.querySelector('[data-theme-studio-frame]');
        if (frame) frame.src = studioPreviewUrl();
      });
      host.querySelectorAll('[data-studio-page]').forEach(button => {
        button.addEventListener('click', () => {
          if (button.dataset.studioPage === studioPage) return;
          studioPage = button.dataset.studioPage;
          host.querySelectorAll('[data-studio-page]').forEach(peer => {
            const on = peer === button;
            peer.classList.toggle('is-active', on);
            peer.setAttribute('aria-selected', String(on));
          });
          // reset inspector to the primary element for this page
          const pageDefaults = { schedule: 'heroTitle', announcements: 'announcementTitle', grades: 'gradesTitle', privacy: 'brandTokens' };
          selectedKey = pageDefaults[studioPage] || 'brandTokens';
          selectedTextPath = '';
          selectedLabel = '';
          selectedPaths = [];
          paintInspector();
          const frame = host.querySelector('[data-theme-studio-frame]');
          if (frame) frame.src = studioPreviewUrl();
          setTimeout(postStudioPreview, 90);
        });
      });
      host.querySelectorAll('[data-studio-frame-width]').forEach(button => {
        button.addEventListener('click', () => {
          const bezel = host.querySelector('[data-site-preview-bezel]');
          if (!bezel) return;
          const width = button.dataset.studioFrameWidth;
          bezel.style.setProperty('--studio-frame-width', width.endsWith('%') ? width : `${width}px`);
          host.querySelectorAll('[data-studio-frame-width]').forEach(peer => peer.classList.toggle('is-active', peer === button));
        });
      });
      bindImageThemeDrop();
      const frame = host.querySelector('[data-theme-studio-frame]');
      frame?.addEventListener('load', () => setTimeout(postStudioPreview, 60));
      paintInspector();
    }
    function handleStudioMessage(event) {
      if (!document.body.contains(host)) {
        if (studioMessageCleanup) studioMessageCleanup();
        return;
      }
      const frame = host.querySelector('[data-theme-studio-frame]');
      const frameUrl = frame ? new URL(frame.src, location.href) : null;
      if (!frame || event.source !== frame.contentWindow || !frameUrl || event.origin !== frameUrl.origin || !isAllowedPublicPreviewUrl(frameUrl)) return;
      if (event.data?.type === 'phs:preview-ready') {
        postStudioPreview();
        return;
      }
      if (event.data?.type !== 'phs:studio-select') return;
      const key = String(event.data.key || event.data.styleTarget || '');
      const target = resolveStudioTarget(key, {
        styleTarget: event.data.styleTarget,
        label: event.data.label,
        textPath: event.data.textPath,
        paths: event.data.paths
      });
      selectedKey = target.key;
      selectedTextPath = event.data.textPath || target.textPath || '';
      selectedLabel = event.data.label || target.label || '';
      selectedText = String(event.data.text || textValueForTarget(target) || selectedText || '');
      selectedPaths = Array.isArray(event.data.paths) ? event.data.paths : [];
      paintInspector();
    }
    if (studioMessageCleanup) studioMessageCleanup();
    const studioMessageController = new AbortController();
    window.addEventListener('message', event => {
      const frame = host.querySelector('[data-theme-studio-frame]');
      const frameUrl = frame ? new URL(frame.src, location.href) : null;
      if (!frame || event.source !== frame.contentWindow || !frameUrl || event.origin !== frameUrl.origin || !isAllowedPublicPreviewUrl(frameUrl)) return;
      handleStudioMessage(event);
    }, { signal: studioMessageController.signal });
    const cleanup = () => {
      studioMessageController.abort();
      if (studioMessageCleanup === cleanup) studioMessageCleanup = null;
    };
    studioMessageCleanup = cleanup;
    paint();
    return host;
  }

  // ── Guided tour (coachmarks) — highlight an element + step tooltip ──────
  let activeTour = null;
  function runGuidedTour(steps, { storageKey } = {}) {
    if (!Array.isArray(steps) || !steps.length) return;
    if (activeTour) activeTour.cleanup(false);
    let i = 0;
    const root = document.createElement('div');
    root.className = 'admin-tour-root';
    root.innerHTML = `
      <div class="admin-tour-spot" data-tour-spot></div>
      <div class="admin-tour-pop" role="dialog" aria-modal="true" aria-label="Guided tour">
        <span class="admin-tour-step" data-tour-step></span>
        <h3 data-tour-title></h3>
        <p data-tour-body></p>
        <div class="admin-tour-actions">
          <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-tour-skip>Skip</button>
          <div class="row-gap-8">
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-tour-back>Back</button>
            <button type="button" class="ad-btn ad-btn--primary admin-btn-sm" data-tour-next>Next</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    const spot = root.querySelector('[data-tour-spot]');
    const pop = root.querySelector('.admin-tour-pop');
    let currentTarget = null;
    const blockScroll = e => { e.preventDefault(); e.stopPropagation(); };
    function cleanup(markSeen) {
      if (markSeen && storageKey) { try { localStorage.setItem(storageKey, '1'); } catch {} }
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('keydown', onKey, true);
      root.removeEventListener('wheel', blockScroll);
      root.removeEventListener('touchmove', blockScroll);
      root.remove();
      activeTour = null;
    }
    // Position the spotlight + card around the CURRENT target — runs on every
    // scroll/resize so the card follows its element instead of stranding top-left.
    function reposition() {
      if (!currentTarget || !document.body.contains(currentTarget)) {
        spot.style.opacity = '0';
        pop.style.transform = 'translate(-50%,-50%)';
        pop.style.left = '50%'; pop.style.top = '44%';
        return;
      }
      const r = currentTarget.getBoundingClientRect();
      const pad = 8;
      spot.style.opacity = '1';
      spot.style.left = `${r.left - pad}px`;
      spot.style.top = `${r.top - pad}px`;
      spot.style.width = `${r.width + pad * 2}px`;
      spot.style.height = `${r.height + pad * 2}px`;
      pop.style.transform = 'none';
      const pr = pop.getBoundingClientRect();
      const gap = 14, m = 10;
      const clampL = v => Math.min(Math.max(m, v), window.innerWidth - pr.width - m);
      const clampT = v => Math.min(Math.max(m, v), window.innerHeight - pr.height - m);
      let left, top;
      if (r.right + gap + pr.width <= window.innerWidth - m) { left = r.right + gap; top = clampT(r.top); }       // right
      else if (r.bottom + gap + pr.height <= window.innerHeight - m) { left = clampL(r.left); top = r.bottom + gap; } // below
      else if (r.left - gap - pr.width >= m) { left = r.left - gap - pr.width; top = clampT(r.top); }              // left
      else { left = clampL(r.left); top = Math.max(m, r.top - gap - pr.height); }                                  // above
      pop.style.left = `${clampL(left)}px`;
      pop.style.top = `${clampT(top)}px`;
    }
    function place() {
      const step = steps[i];
      currentTarget = typeof step.target === 'function' ? step.target() : document.querySelector(step.target);
      root.querySelector('[data-tour-step]').textContent = `Step ${i + 1} of ${steps.length}`;
      root.querySelector('[data-tour-title]').textContent = step.title;
      root.querySelector('[data-tour-body]').textContent = step.body;
      root.querySelector('[data-tour-back]').style.visibility = i === 0 ? 'hidden' : 'visible';
      root.querySelector('[data-tour-next]').textContent = i === steps.length - 1 ? 'Got it' : 'Next';
      // Instant scroll (not smooth) so the element's final rect is ready when we anchor —
      // smooth scrolling positioned the card off the pre-scroll rect and stranded it.
      if (currentTarget && currentTarget.scrollIntoView) currentTarget.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      reposition();                       // synchronous — rect is final after instant scroll
      requestAnimationFrame(reposition);  // again next frame in case pop size changed with new copy
    }
    function next() { if (i < steps.length - 1) { i++; place(); } else cleanup(true); }
    function back() { if (i > 0) { i--; place(); } }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cleanup(true); }
      else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    }
    root.querySelector('[data-tour-next]').addEventListener('click', next);
    root.querySelector('[data-tour-back]').addEventListener('click', back);
    root.querySelector('[data-tour-skip]').addEventListener('click', () => cleanup(true));
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);   // follow the element if anything scrolls
    root.addEventListener('wheel', blockScroll, { passive: false });   // block background scroll
    root.addEventListener('touchmove', blockScroll, { passive: false });
    activeTour = { cleanup };
    place();
  }

  function dismissActiveTour(markSeen = false) {
    if (activeTour && typeof activeTour.cleanup === 'function') activeTour.cleanup(markSeen);
  }

  function startAutomationsTour() {
    runGuidedTour([
      { target: null, title: 'What Automations does for you', body: 'It runs site changes on a schedule so you don\'t have to remember to. Example: it can flip the site to “No School” the night before a snow day, switch to the early-release bell schedule every half-day, or publish a planned change at 6 AM — all by itself. You set it up once; it fires on time, every time, and logs each run.' },
      { target: '.admin-studio-frame--automation .admin-studio-palette', title: 'Every workflow = WHEN + WHAT', body: 'A workflow is one Trigger (WHEN it runs) plus one or more Actions (WHAT it does). Drag a block from here onto the canvas to add it — Triggers are the green “when”, Actions are the “what”.' },
      { target: '.admin-workflow-template-row', title: 'Fastest start: a Template', body: 'Don\'t build from scratch. Click a template and it drops a complete, connected workflow you can tweak. “Schedule + publish” = set a planned schedule on a date, then publish it automatically. Great for learning by example.' },
      { target: '[data-automation-canvas]', title: 'Arrange & connect on the canvas', body: 'Drag a block to move it. To connect Trigger → Action → Publish, drag from a block\'s right-edge dot to the next block\'s left dot. Navigate like a design tool: scroll to pan, ⌘/Ctrl + scroll to zoom, ⌫ delete, ⌘C/⌘V copy-paste, ⌘D duplicate, arrows nudge.' },
      { target: '.admin-workflow-summary-card', title: 'Always know what will happen', body: 'This sentence is your safety net — it reads back exactly what the workflow will do in plain English. If it says the right thing, the workflow is right. No guessing, no surprises.' },
      { target: '[data-automation-create]', title: 'Create it — then forget it', body: 'When the summary looks correct, hit Create. The automation now runs on its trigger automatically, and every run is recorded in History so you can always see what happened and roll back if needed.' }
    ], { storageKey: 'phs:admin-automations-tour:v1' });
  }

  function renderAutomationsGraphWorkbench() {
    const host = document.createElement('div');
    host.className = 'admin-automation-graph-host admin-object-workbench-host';
    host.innerHTML = renderLoadingState('Loading automations');
    const STORAGE_KEY = 'phs:admin-automation-workflow-canvas:v3';
    const scheduleTypes = ['Normal Schedule', 'Advisory', 'Early Release', 'Assembly', 'Exam Day', 'No School']
      .concat(Object.keys(state.draft?.bellSchedules || {}).filter(type => type && type !== '_dateOverrides'))
      .filter((type, index, list) => list.indexOf(type) === index);
    const announcements = asArray(state.draft?.announcements?.items);
    const nodeTypes = [
      { type: 'triggerDateTime', kind: 'trigger', group: 'Triggers', label: 'Date and time', hint: 'Run once on a date', w: 320, h: 142, defaults: () => ({ date: todayISODate(), time: '08:00' }) },
      { type: 'triggerWeekday', kind: 'trigger', group: 'Triggers', label: 'Weekday repeat', hint: 'Run every selected weekday', w: 340, h: 154, defaults: () => ({ weekdays: [1,2,3,4,5], time: '08:00' }) },
      { type: 'setSchedule', kind: 'action', group: 'Actions', label: 'Set schedule', hint: 'Stage a planned schedule', w: 340, h: 154, defaults: () => ({ scheduleType: scheduleTypes[0] || 'Normal Schedule', date: todayISODate() }) },
      { type: 'setMaintenance', kind: 'action', group: 'Actions', label: 'Set availability', hint: 'Stage live or maintenance', w: 360, h: 172, defaults: () => ({ mode: 'maintenance', title: 'Site paused for maintenance', message: 'Poolesville Schedule is temporarily unavailable while we make an update. Please check back soon.' }) },
      { type: 'announcementWindow', kind: 'action', group: 'Actions', label: 'Announcement timing', hint: 'Show, expire, or clear a card', w: 360, h: 160, defaults: () => ({ index: 0, mode: 'show', date: todayISODate() }) },
      { type: 'publishDraft', kind: 'action', group: 'Actions', label: 'Publish draft', hint: 'Publish staged draft', w: 280, h: 118, defaults: () => ({}) },
      { type: 'note', kind: 'utility', group: 'Utility', label: 'Note', hint: 'Document the workflow', w: 280, h: 112, defaults: () => ({ text: 'Add a note' }) }
    ];
    const typeFor = type => nodeTypes.find(node => node.type === type) || nodeTypes[0];
    const defaultModel = {
      name: 'Scheduled update',
      viewport: { x: 0, y: 0, scale: 0.72 },
      selectedId: 'auto-trigger',
      nodes: [
        { id: 'auto-trigger', type: 'triggerDateTime', x: 48, y: 120, w: 320, h: 142, data: { date: todayISODate(), time: '08:00' } },
        { id: 'auto-action', type: 'setSchedule', x: 392, y: 120, w: 340, h: 154, data: { scheduleType: scheduleTypes[0] || 'Normal Schedule', date: todayISODate() } },
        { id: 'auto-publish', type: 'publishDraft', x: 760, y: 124, w: 280, h: 118, data: {} }
      ],
      edges: [
        { id: 'edge-trigger-action', from: 'auto-trigger', to: 'auto-action' },
        { id: 'edge-action-publish', from: 'auto-action', to: 'auto-publish' }
      ]
    };
    let storedWorkflowModel = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      storedWorkflowModel = parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      storedWorkflowModel = null;
    }
    let model = normalizeModel(storedWorkflowModel || defaultModel);
    let dragState = null;
    let connectingFrom = null;
    let clipboardNode = null;
    let saveModelTimer = 0;
    let didInitialViewportFit = false;

    function normalizeModel(value) {
      const copy = Object.assign(deepClone(defaultModel), value || {});
      copy.viewport = Object.assign({ x: 0, y: 0, scale: 1 }, copy.viewport || {});
      copy.viewport.scale = clampNumber(copy.viewport.scale, 0.6, 1.45);
      copy.nodes = asArray(copy.nodes).map((node, index) => {
        const type = typeFor(node.type);
        return Object.assign({}, node, {
          id: node.id || uniqueId('auto-node'),
          type: type.type,
          x: clampNumber(node.x, -1000, 2600),
          y: clampNumber(node.y, -1000, 1800),
          w: clampNumber(Math.max(Number(node.w || type.w), type.w), 180, 520),
          h: clampNumber(node.h || type.h, 96, 320),
          data: Object.assign({}, type.defaults(), node.data || {}),
          z: Number.isFinite(Number(node.z)) ? Number(node.z) : index + 1
        });
      });
      if (!copy.nodes.length) copy.nodes = deepClone(defaultModel.nodes);
      const nodeIds = new Set(copy.nodes.map(node => node.id));
      copy.edges = asArray(copy.edges)
        .map(edge => ({ id: edge.id || uniqueId('edge'), from: edge.from, to: edge.to }))
        .filter(edge => edge.from && edge.to && edge.from !== edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to));
      if (!copy.edges.length) copy.edges = defaultEdges(copy.nodes);
      if (!copy.nodes.some(node => node.id === copy.selectedId)) copy.selectedId = copy.nodes[0]?.id || null;
      copy.name = String(copy.name || 'Scheduled update');
      return copy;
    }
    const saveModel = () => writeStorageJson(STORAGE_KEY, model);
    const saveModelDebounced = () => {
      clearTimeout(saveModelTimer);
      saveModelTimer = setTimeout(saveModel, 120);
    };
    const selectedNode = () => model.nodes.find(node => node.id === model.selectedId) || null;
    const nodeById = id => model.nodes.find(node => node.id === id) || null;
    function selectNodeInCanvas(id) {
      model.selectedId = id;
      host.querySelectorAll('[data-workflow-node]').forEach(el => {
        el.classList.toggle('is-selected', el.dataset.workflowNode === id);
      });
    }
    const canStartEdge = node => node && (typeFor(node.type).kind === 'trigger' || ['setSchedule','setMaintenance','announcementWindow'].includes(node.type));
    const canEndEdge = node => node && typeFor(node.type).kind === 'action' && node.type !== 'triggerDateTime' && node.type !== 'triggerWeekday';
    function defaultEdges(nodes = model.nodes) {
      const trigger = nodes.find(node => typeFor(node.type).kind === 'trigger');
      const firstAction = nodes.find(node => ['setSchedule','setMaintenance','announcementWindow','publishDraft'].includes(node.type) && node.type !== 'publishDraft');
      const publish = nodes.find(node => node.type === 'publishDraft');
      const edges = [];
      if (trigger && firstAction) edges.push({ id: uniqueId('edge'), from: trigger.id, to: firstAction.id });
      if (firstAction && publish) edges.push({ id: uniqueId('edge'), from: firstAction.id, to: publish.id });
      if (!firstAction && trigger && publish) edges.push({ id: uniqueId('edge'), from: trigger.id, to: publish.id });
      return edges;
    }
    function connectNodes(from, to) {
      const fromNode = nodeById(from);
      const toNode = nodeById(to);
      if (!canStartEdge(fromNode) || !canEndEdge(toNode) || from === to) {
        toast('That connection cannot compile to a scheduled job.', 'error', 2600);
        connectingFrom = null;
        return;
      }
      if (!model.edges.some(edge => edge.from === from && edge.to === to)) {
        model.edges.push({ id: uniqueId('edge'), from, to });
      }
      model.selectedId = to;
      connectingFrom = null;
      saveModel();
      paint(model.summary || { jobs: [] });
    }
    function reachableFrom(startId) {
      const seen = new Set();
      const queue = [startId];
      while (queue.length) {
        const id = queue.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        model.edges.filter(edge => edge.from === id).forEach(edge => queue.push(edge.to));
      }
      return seen;
    }
    function firstReachableAction(triggerNode) {
      const reachable = reachableFrom(triggerNode.id);
      return model.nodes
        .filter(node => reachable.has(node.id))
        .sort((a, b) => (a.x - b.x) || (a.y - b.y))
        .find(node => ['setSchedule','setMaintenance','announcementWindow','publishDraft'].includes(node.type));
    }
    function orderedReachableActions(triggerNode) {
      const actionTypes = new Set(['setSchedule', 'setMaintenance', 'announcementWindow', 'publishDraft']);
      const visited = new Set();
      const ordered = [];
      function visit(id) {
        if (!id || visited.has(id)) return;
        visited.add(id);
        model.edges
          .filter(edge => edge.from === id)
          .map(edge => nodeById(edge.to))
          .filter(Boolean)
          .sort((a, b) => (a.x - b.x) || (a.y - b.y))
          .forEach(node => {
            if (actionTypes.has(node.type) && !ordered.some(item => item.id === node.id)) ordered.push(node);
            visit(node.id);
          });
      }
      visit(triggerNode.id);
      return ordered;
    }
    function primaryTriggerNode() {
      const triggers = model.nodes.filter(node => typeFor(node.type).kind === 'trigger');
      return triggers.find(trigger => orderedReachableActions(trigger).length) || triggers[0] || null;
    }
    const canvasPoint = event => {
      const canvas = host.querySelector('[data-automation-canvas]');
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return { x: 160, y: 160 };
      return {
        x: Math.round((event.clientX - rect.left - model.viewport.x) / model.viewport.scale),
        y: Math.round((event.clientY - rect.top - model.viewport.y) / model.viewport.scale)
      };
    };
    const visibleCanvasCenter = () => {
      const canvas = host.querySelector('[data-automation-canvas]');
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return { x: 160, y: 160 };
      return {
        x: Math.round(((rect.width / 2) - model.viewport.x) / model.viewport.scale),
        y: Math.round(((rect.height / 2) - model.viewport.y) / model.viewport.scale)
      };
    };
    const updateWorldTransform = () => {
      const world = host.querySelector('[data-automation-world]');
      if (!world) return;
      world.style.transform = `translate3d(${model.viewport.x}px, ${model.viewport.y}px, 0) scale(${model.viewport.scale})`;
      const safeScale = Math.max(0.1, Number(model.viewport.scale) || 1);
      world.style.setProperty('--flow-port-hit-size', `${Math.ceil(44 / safeScale)}px`);
      world.style.setProperty('--flow-port-dot-size', `${Math.ceil(14 / safeScale)}px`);
      world.style.setProperty('--flow-node-action-size', `${Math.ceil(44 / safeScale)}px`);
      const zoom = host.querySelector('[data-automation-zoom-value]');
      if (zoom) zoom.textContent = `${Math.round(model.viewport.scale * 100)}%`;
    };
    const actionSummary = action => {
      if (!action) return 'Action';
      if (action.type === 'sequence') return asArray(action.actions).map(actionSummary).filter(Boolean).join(' → ') || 'Workflow sequence';
      return ({
        setSchedule: `Stage ${action.scheduleType || 'schedule'} for ${action.date || 'today'}`,
        publishDraft: 'Publish staged draft',
        setMaintenance: `Stage ${action.mode === 'maintenance' ? 'maintenance' : 'live'} mode`,
        announcementWindow: `${action.mode || 'Update'} announcement ${Number(action.index || 0) + 1}`
      })[action.type] || action.type || 'Action';
    };
    const jobSummary = job => {
      const trigger = job.trigger || {};
      const action = job.action || {};
      const triggerText = trigger.type === 'weekday'
        ? `Every ${asArray(trigger.weekdays).map(day => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(day)]).filter(Boolean).join(', ')} at ${trigger.time || '00:00'}`
        : `${trigger.date || 'No date'} ${trigger.time || ''}`.trim();
      const actionText = actionSummary(action);
      return `${triggerText} · ${actionText}${action.publishAfter ? ' · publish after' : ''}`;
    };
    function nodeSubtitle(node) {
      const data = node.data || {};
      if (node.type === 'triggerDateTime') return `${data.date || todayISODate()} · ${data.time || '08:00'}`;
      if (node.type === 'triggerWeekday') return `${asArray(data.weekdays).length || 0} weekdays · ${data.time || '08:00'}`;
      if (node.type === 'setSchedule') return `${data.scheduleType || 'Schedule'} · ${data.date || todayISODate()}`;
      if (node.type === 'setMaintenance') return data.mode === 'live' ? 'Return site to live' : 'Show maintenance page';
      if (node.type === 'announcementWindow') return `${data.mode || 'show'} card ${Number(data.index || 0) + 1}`;
      if (node.type === 'publishDraft') return 'Publish after upstream action';
      return data.text || 'Workflow note';
    }
    function renderNode(node) {
      const type = typeFor(node.type);
      const selected = node.id === model.selectedId ? ' is-selected' : '';
      const connecting = connectingFrom === node.id ? ' is-connecting' : '';
      const utility = type.kind === 'utility' ? ' admin-flow-node-card--utility' : '';
      return `
        <article class="admin-flow-node-card${selected}${connecting}${utility}" data-workflow-node="${escapeHtml(node.id)}" style="left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px;z-index:${node.z}">
          <div class="admin-flow-node-card__bar" data-workflow-node-drag>
            <span>${escapeHtml(type.label)}</span><small>${escapeHtml(type.kind)}</small>
          </div>
          <div class="admin-flow-node-card__body">
            <strong>${escapeHtml(nodeSubtitle(node))}</strong>
            <span>${escapeHtml(type.hint)}</span>
          </div>
          ${canEndEdge(node) ? `<button type="button" class="admin-flow-port admin-flow-port--in" data-flow-port="in" data-flow-node="${escapeHtml(node.id)}" aria-label="Connect into ${escapeHtml(type.label)}"></button>` : ''}
          ${canStartEdge(node) ? `<button type="button" class="admin-flow-port admin-flow-port--out" data-flow-port="out" data-flow-node="${escapeHtml(node.id)}" aria-label="Connect from ${escapeHtml(type.label)}"></button>` : ''}
          <button type="button" class="admin-theme-object__delete" aria-label="Delete node" data-delete-workflow-node="${escapeHtml(node.id)}">${ICON.trash}</button>
        </article>`;
    }
    function pathForEdge(edge) {
        const node = nodeById(edge.from);
        const next = nodeById(edge.to);
        if (!node || !next) return '';
        const x1 = node.x + node.w;
        const y1 = node.y + node.h / 2;
        const x2 = next.x;
        const y2 = next.y + next.h / 2;
        const mid = Math.max(56, (x2 - x1) / 2);
        return `M${x1} ${y1} C${x1 + mid} ${y1} ${x2 - mid} ${y2} ${x2} ${y2}`;
    }
    function renderLines() {
      return model.edges.map(edge => {
        const d = pathForEdge(edge);
        return d ? `<path data-workflow-edge="${escapeHtml(edge.id)}" d="${d}" />` : '';
      }).join('');
    }
    function refreshLines() {
      model.edges.forEach(edge => {
        const path = host.querySelector(`[data-workflow-edge="${cssEscape(edge.id)}"]`);
        const d = pathForEdge(edge);
        if (path && d) path.setAttribute('d', d);
      });
    }
    function actionFromNode(node) {
      if (!node) return null;
      const action = { type: node.type };
      if (node.type === 'setSchedule') {
        action.scheduleType = node.data.scheduleType || scheduleTypes[0] || 'Normal Schedule';
        action.date = node.data.date || todayISODate();
      } else if (node.type === 'setMaintenance') {
        action.mode = node.data.mode || 'maintenance';
        action.title = node.data.title || '';
        action.message = node.data.message || '';
      } else if (node.type === 'announcementWindow') {
        action.index = Number(node.data.index || 0);
        action.mode = node.data.mode || 'show';
        action.date = node.data.date || todayISODate();
      } else if (node.type !== 'publishDraft') {
        return null;
      }
      return action;
    }
    function compileWorkflow() {
      const triggerNode = primaryTriggerNode();
      const actionNodes = triggerNode ? orderedReachableActions(triggerNode) : [];
      if (!triggerNode) throw new Error('Add a trigger node before creating the automation.');
      if (!actionNodes.length) throw new Error('Connect the trigger to an action before creating the automation.');
      const trigger = triggerNode.type === 'triggerWeekday'
        ? { type: 'weekday', weekdays: asArray(triggerNode.data.weekdays).map(Number).filter(Number.isFinite), time: triggerNode.data.time || '08:00' }
        : { type: 'dateTime', date: triggerNode.data.date || todayISODate(), time: triggerNode.data.time || '08:00' };
      if (trigger.type === 'weekday' && !trigger.weekdays.length) throw new Error('Choose at least one weekday.');
      const actions = actionNodes.map(actionFromNode).filter(Boolean);
      const action = actions.length === 1 ? actions[0] : { type: 'sequence', actions };
      return {
        name: model.name || 'Scheduled update',
        trigger,
        action,
        graph: {
          viewport: model.viewport,
          nodes: model.nodes.map(node => ({ id: node.id, type: node.type, x: node.x, y: node.y, w: node.w, h: node.h, data: node.data })),
          edges: model.edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to }))
        }
      };
    }
    function validationReport() {
      const issues = [];
      const warnings = [];
      const triggers = model.nodes.filter(node => typeFor(node.type).kind === 'trigger');
      const actions = model.nodes.filter(node => ['setSchedule','setMaintenance','announcementWindow','publishDraft'].includes(node.type));
      if (!triggers.length) issues.push('Add a trigger.');
      if (!actions.length) issues.push('Add an action.');
      if (triggers.length > 1) warnings.push('Use one connected trigger for the workflow that should run.');
      const connectedIds = new Set(model.edges.flatMap(edge => [edge.from, edge.to]));
      model.nodes.filter(node => typeFor(node.type).kind !== 'utility' && !connectedIds.has(node.id)).forEach(node => warnings.push(`${typeFor(node.type).label} is disconnected.`));
      let preview = '';
      try {
        preview = jobSummary(compileWorkflow());
      } catch (error) {
        issues.push(error.message);
      }
      return {
        status: issues.length ? 'blocked' : warnings.length ? 'warn' : 'ready',
        issues: [...new Set(issues)],
        warnings: [...new Set(warnings)],
        preview
      };
    }
    function renderValidation(report = validationReport()) {
      const items = report.issues.length ? report.issues : report.warnings;
      const title = report.status === 'ready' ? 'Ready to create' : report.status === 'warn' ? 'Creates with warnings' : 'Needs a fix';
      return `
        <div class="admin-workflow-validation admin-workflow-validation--${escapeHtml(report.status)}">
          <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(report.preview || items[0] || 'Connect a trigger to an action.')}</span></div>
          ${items.length ? `<ul>${items.slice(0, 4).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        </div>`;
    }
    function workflowPlainSummary(report = validationReport()) {
      if (report.preview) return report.preview.replace(/\s+·\s+/g, ' → ');
      if (report.issues.length) return report.issues[0];
      if (report.warnings.length) return report.warnings[0];
      return 'Choose a template, adjust the details, then create the automation.';
    }
    function renderInspector() {
      const node = selectedNode();
      if (!node) return '<div class="admin-node-empty"><strong>No node selected</strong><span>Add a block or select one on the canvas.</span></div>';
      const type = typeFor(node.type);
      const data = node.data || {};
      const weekdayRow = () => `<div class="admin-weekday-row admin-weekday-row--compact">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, day) => `<label><input type="checkbox" value="${day}" data-node-weekday ${asArray(data.weekdays).map(Number).includes(day) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>`;
      const scheduleOptions = scheduleTypes.map(type => `<option value="${escapeHtml(type)}" ${data.scheduleType === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('');
      const announcementOptions = announcements.map((item, index) => `<option value="${index}" ${Number(data.index || 0) === index ? 'selected' : ''}>${escapeHtml(item.title || `Card ${index + 1}`)}</option>`).join('');
      const fields = ({
        triggerDateTime: `
          <label class="admin-flow-field"><span>Date</span><input class="admin-input mono" type="date" value="${escapeHtml(data.date || todayISODate())}" data-node-field="date"></label>
          <label class="admin-flow-field"><span>Time</span><input class="admin-input mono" type="time" value="${escapeHtml(data.time || '08:00')}" data-node-field="time"></label>`,
        triggerWeekday: `
          <label class="admin-flow-field"><span>Time</span><input class="admin-input mono" type="time" value="${escapeHtml(data.time || '08:00')}" data-node-field="time"></label>
          ${weekdayRow()}`,
        setSchedule: `
          <label class="admin-flow-field"><span>Schedule</span><select class="admin-select" data-node-field="scheduleType">${scheduleOptions}</select></label>
          <label class="admin-flow-field"><span>Date</span><input class="admin-input mono" type="date" value="${escapeHtml(data.date || todayISODate())}" data-node-field="date"></label>`,
        setMaintenance: `
          <label class="admin-flow-field"><span>Mode</span><select class="admin-select" data-node-field="mode"><option value="maintenance" ${data.mode !== 'live' ? 'selected' : ''}>Maintenance</option><option value="live" ${data.mode === 'live' ? 'selected' : ''}>Live</option></select></label>
          <label class="admin-flow-field"><span>Title</span><input class="admin-input" value="${escapeHtml(data.title || '')}" data-node-field="title"></label>
          <label class="admin-flow-field"><span>Message</span><textarea class="admin-textarea" rows="3" data-node-field="message">${escapeHtml(data.message || '')}</textarea></label>`,
        announcementWindow: `
          <label class="admin-flow-field"><span>Card</span><select class="admin-select" data-node-field="index">${announcementOptions || '<option value="0">Card 1</option>'}</select></label>
          <label class="admin-flow-field"><span>Action</span><select class="admin-select" data-node-field="mode"><option value="show" ${data.mode !== 'expire' && data.mode !== 'clear' ? 'selected' : ''}>Show from date</option><option value="expire" ${data.mode === 'expire' ? 'selected' : ''}>Expire on date</option><option value="clear" ${data.mode === 'clear' ? 'selected' : ''}>Clear dates</option></select></label>
          <label class="admin-flow-field"><span>Date</span><input class="admin-input mono" type="date" value="${escapeHtml(data.date || todayISODate())}" data-node-field="date"></label>`,
        publishDraft: `<div class="admin-inspector-readonly"><span>Publish action</span><small>This node turns the workflow into an immediate publish after staging.</small></div>`,
        note: `<label class="admin-flow-field"><span>Note</span><textarea class="admin-textarea" rows="4" data-node-field="text">${escapeHtml(data.text || '')}</textarea></label>`
      })[node.type] || '';
      return `
        <div class="admin-inspector-head">
          <div><strong>${escapeHtml(type.label)}</strong><span>${escapeHtml(type.hint)}</span></div>
          <div class="row-gap-8">
            <button type="button" class="admin-btn admin-btn-sm admin-btn-icon" aria-label="Duplicate node" data-duplicate-selected-node>${ICON.duplicate}</button>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" aria-label="Delete node" data-delete-selected-node>${ICON.trash}</button>
          </div>
        </div>
        ${fields}
        <details class="admin-inspector-disclosure">
          <summary>Position and connections</summary>
          <div class="admin-inspector-disclosure__body">
            <div class="admin-inspector-grid">
              ${['x','y'].map(key => `<label class="admin-flow-field"><span>${key.toUpperCase()}</span><input class="admin-input mono" type="number" value="${escapeHtml(node[key])}" data-node-geo="${key}"></label>`).join('')}
            </div>
            ${renderConnectionList(node)}
          </div>
        </details>`;
    }
    function renderConnectionList(node) {
      const incoming = model.edges.filter(edge => edge.to === node.id);
      const outgoing = model.edges.filter(edge => edge.from === node.id);
      const rows = [...incoming.map(edge => ({ edge, label: `From ${typeFor(nodeById(edge.from)?.type).label || 'node'}` })), ...outgoing.map(edge => ({ edge, label: `To ${typeFor(nodeById(edge.to)?.type).label || 'node'}` }))];
      if (!rows.length) return '<div class="admin-inspector-readonly"><span>No connections</span><small>Use the small circular ports on the node edges to connect blocks.</small></div>';
      return `<div class="admin-connection-list">
        <strong>Connections</strong>
        ${rows.map(({ edge, label }) => `<button type="button" data-remove-edge="${escapeHtml(edge.id)}"><span>${escapeHtml(label)}</span>${ICON.close}</button>`).join('')}
      </div>`;
    }
    function addNode(typeName, point) {
      const type = typeFor(typeName);
      const node = {
        id: uniqueId('auto-node'),
        type: type.type,
        x: Math.round((point?.x ?? 120) / 8) * 8,
        y: Math.round((point?.y ?? 120) / 8) * 8,
        w: type.w,
        h: type.h,
        z: Math.max(0, ...model.nodes.map(item => Number(item.z) || 0)) + 1,
        data: type.defaults()
      };
      model.nodes.push(node);
      const previous = selectedNode();
      if (previous && previous.id !== node.id) {
        if (canStartEdge(previous) && canEndEdge(node)) model.edges.push({ id: uniqueId('edge'), from: previous.id, to: node.id });
        else if (canStartEdge(node) && canEndEdge(previous)) model.edges.push({ id: uniqueId('edge'), from: node.id, to: previous.id });
      }
      model.selectedId = node.id;
      saveModel();
      paint(model.summary || { jobs: [] });
    }
    function duplicateNode(id = model.selectedId) {
      const original = nodeById(id);
      if (!original) return;
      const node = deepClone(original);
      node.id = uniqueId('auto-node');
      node.x += 32;
      node.y += 32;
      node.z = Math.max(0, ...model.nodes.map(item => Number(item.z) || 0)) + 1;
      model.nodes.push(node);
      model.selectedId = node.id;
      saveModel();
      paint(model.summary || { jobs: [] });
    }
    function deleteNode(id = model.selectedId) {
      const index = model.nodes.findIndex(node => node.id === id);
      if (index < 0) return;
      model.nodes.splice(index, 1);
      model.edges = model.edges.filter(edge => edge.from !== id && edge.to !== id);
      model.selectedId = model.nodes[Math.max(0, index - 1)]?.id || model.nodes[0]?.id || null;
      saveModel();
      paint(model.summary || { jobs: [] });
    }
    // Keyboard shortcuts for the canvas — Figma-style. Ignored while typing in a field.
    function onCanvasKeydown(e) {
      if (!document.body.contains(host)) { if (automationKeyCleanup) automationKeyCleanup(); return; }
      if (state.activeTab !== 'automations') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = e.key;
      if ((k === 'Delete' || k === 'Backspace') && model.selectedId) {
        e.preventDefault();
        deleteNode();
      } else if (k === 'Escape') {
        if (connectingFrom) { connectingFrom = null; refreshLines(); }
        else if (model.selectedId) { model.selectedId = null; selectNodeInCanvas(null); }
      } else if ((e.metaKey || e.ctrlKey) && (k === 'd' || k === 'D') && model.selectedId) {
        e.preventDefault();
        duplicateNode();
      } else if ((e.metaKey || e.ctrlKey) && (k === 'c' || k === 'C') && model.selectedId) {
        const n = selectedNode();
        if (n) { clipboardNode = deepClone(n); toast('Block copied', 'success', 1200); }
      } else if ((e.metaKey || e.ctrlKey) && (k === 'v' || k === 'V') && clipboardNode) {
        e.preventDefault();
        const node = deepClone(clipboardNode);
        node.id = uniqueId('auto-node');
        node.x = clampNumber(node.x + 40, -1000, 2600);
        node.y = clampNumber(node.y + 40, -1000, 1800);
        node.z = Math.max(0, ...model.nodes.map(item => Number(item.z) || 0)) + 1;
        model.nodes.push(node);
        model.selectedId = node.id;
        saveModel();
        paint(model.summary || { jobs: [] });
      } else if ((e.metaKey || e.ctrlKey) && (k === 'a' || k === 'A')) {
        // select-all isn't meaningful for single-select; ignore quietly to avoid page select-all
        e.preventDefault();
      } else if (k.startsWith('Arrow') && model.selectedId) {
        const node = selectedNode();
        if (!node) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (k === 'ArrowLeft') node.x -= step;
        else if (k === 'ArrowRight') node.x += step;
        else if (k === 'ArrowUp') node.y -= step;
        else if (k === 'ArrowDown') node.y += step;
        node.x = clampNumber(node.x, -1000, 2600);
        node.y = clampNumber(node.y, -1000, 1800);
        const el = host.querySelector(`[data-workflow-node="${cssEscape(node.id)}"]`);
        if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; }
        refreshLines();
        saveModel();
      }
    }
    function onCanvasHostKeydown(event) {
      if (event.target.closest('input,textarea,select')) return;
      const node = selectedNode();
      if ((event.key === 'Delete' || event.key === 'Backspace') && node) {
        event.preventDefault();
        deleteNode(node.id);
      }
    }
    // Wheel: zoom toward cursor (pinch / ctrl+wheel) or pan (plain wheel) — never the page.
    function onCanvasWheel(e) {
      e.preventDefault();
      const canvas = host.querySelector('[data-automation-canvas]');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const s = model.viewport.scale;
        const s2 = clampNumber(s * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.6, 1.45);
        model.viewport.x = px - ((px - model.viewport.x) / s) * s2;
        model.viewport.y = py - ((py - model.viewport.y) / s) * s2;
        model.viewport.scale = s2;
      } else {
        model.viewport.x -= e.deltaX;
        model.viewport.y -= e.deltaY;
      }
      saveModelDebounced();
      updateWorldTransform();
    }
    function applyTemplate(template) {
      const date = todayISODate();
      const templates = {
        schedule: {
          name: 'Schedule workflow',
          nodes: [
            { id: 'tpl-trigger', type: 'triggerDateTime', x: 48, y: 132, w: 320, h: 142, data: { date, time: '08:00' } },
            { id: 'tpl-schedule', type: 'setSchedule', x: 392, y: 132, w: 340, h: 154, data: { scheduleType: scheduleTypes[0] || 'Normal Schedule', date } },
            { id: 'tpl-publish', type: 'publishDraft', x: 760, y: 150, w: 280, h: 118, data: {} }
          ],
          edges: [{ id: 'tpl-edge-1', from: 'tpl-trigger', to: 'tpl-schedule' }, { id: 'tpl-edge-2', from: 'tpl-schedule', to: 'tpl-publish' }]
        },
        maintenance: {
          name: 'Maintenance workflow',
          nodes: [
            { id: 'tpl-trigger', type: 'triggerDateTime', x: 48, y: 132, w: 320, h: 142, data: { date, time: '08:00' } },
            { id: 'tpl-maintenance', type: 'setMaintenance', x: 392, y: 128, w: 360, h: 172, data: typeFor('setMaintenance').defaults() },
            { id: 'tpl-publish', type: 'publishDraft', x: 784, y: 150, w: 280, h: 118, data: {} }
          ],
          edges: [{ id: 'tpl-edge-1', from: 'tpl-trigger', to: 'tpl-maintenance' }, { id: 'tpl-edge-2', from: 'tpl-maintenance', to: 'tpl-publish' }]
        },
        announcement: {
          name: 'Announcement timing',
          nodes: [
            { id: 'tpl-trigger', type: 'triggerDateTime', x: 48, y: 132, w: 320, h: 142, data: { date, time: '08:00' } },
            { id: 'tpl-announcement', type: 'announcementWindow', x: 392, y: 128, w: 360, h: 160, data: { index: 0, mode: 'show', date } },
            { id: 'tpl-publish', type: 'publishDraft', x: 784, y: 150, w: 280, h: 118, data: {} }
          ],
          edges: [{ id: 'tpl-edge-1', from: 'tpl-trigger', to: 'tpl-announcement' }, { id: 'tpl-edge-2', from: 'tpl-announcement', to: 'tpl-publish' }]
        }
      };
      const next = templates[template];
      if (!next) return;
      model.name = next.name;
      model.nodes = next.nodes.map(node => Object.assign({}, node, { id: uniqueId('auto-node') }));
      const [trigger, action, publish] = model.nodes;
      model.edges = publish
        ? [{ id: uniqueId('edge'), from: trigger.id, to: action.id }, { id: uniqueId('edge'), from: action.id, to: publish.id }]
        : [{ id: uniqueId('edge'), from: trigger.id, to: action.id }];
      model.selectedId = action.id;
      model.viewport = { x: 0, y: 0, scale: 0.72 };
      saveModel();
      paint(model.summary || { jobs: [] });
    }
    function autoLayoutWorkflow() {
      const triggers = model.nodes.filter(node => typeFor(node.type).kind === 'trigger');
      const actions = model.nodes.filter(node => ['setSchedule','setMaintenance','announcementWindow'].includes(node.type));
      const publishNodes = model.nodes.filter(node => node.type === 'publishDraft');
      const notes = model.nodes.filter(node => typeFor(node.type).kind === 'utility');
      triggers.forEach((node, index) => { node.x = 56; node.y = 120 + index * 192; });
      actions.forEach((node, index) => { node.x = 416; node.y = 120 + index * 192; });
      publishNodes.forEach((node, index) => { node.x = 808; node.y = 136 + index * 168; });
      notes.forEach((node, index) => { node.x = 416; node.y = 384 + index * 144; });
      model.nodes.forEach((node, index) => { node.z = index + 1; });
      if (!model.edges.length) model.edges = defaultEdges(model.nodes);
      model.viewport = { x: 0, y: 0, scale: 0.72 };
      saveModel();
      paint(model.summary || { jobs: [] });
    }
    function fitWorkflowToCanvas({ save = true } = {}) {
      const canvas = host.querySelector('[data-automation-canvas]');
      const rect = canvas?.getBoundingClientRect();
      const clipRect = canvas?.closest('.admin-studio-canvas-panel')?.getBoundingClientRect();
      if (!rect || !model.nodes.length) return false;
      const fitWidth = Math.max(1, Math.min(rect.width, clipRect?.width || rect.width));
      const fitHeight = Math.max(1, rect.height);
      const minX = Math.min(...model.nodes.map(node => node.x));
      const minY = Math.min(...model.nodes.map(node => node.y));
      const maxX = Math.max(...model.nodes.map(node => node.x + node.w));
      const maxY = Math.max(...model.nodes.map(node => node.y + node.h));
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const minReadableScale = fitWidth < 720 ? 0.48 : 0.72;
      const scale = clampNumber(Math.min((fitWidth - 96) / spanX, (fitHeight - 96) / spanY), minReadableScale, 1.2);
      model.viewport = {
        x: Math.round((fitWidth - spanX * scale) / 2 - minX * scale),
        y: Math.round((fitHeight - spanY * scale) / 2 - minY * scale),
        scale
      };
      if (save) saveModel();
      updateWorldTransform();
      return true;
    }
    function workflowViewportIsClipped() {
      const canvas = host.querySelector('[data-automation-canvas]');
      const rect = canvas?.getBoundingClientRect();
      const clipRect = canvas?.closest('.admin-studio-canvas-panel')?.getBoundingClientRect();
      if (!rect || !model.nodes.length) return false;
      const fitWidth = Math.max(1, Math.min(rect.width, clipRect?.width || rect.width));
      const minX = Math.min(...model.nodes.map(node => node.x));
      const minY = Math.min(...model.nodes.map(node => node.y));
      const maxX = Math.max(...model.nodes.map(node => node.x + node.w));
      const maxY = Math.max(...model.nodes.map(node => node.y + node.h));
      const pad = 16;
      return (
        minX * model.viewport.scale + model.viewport.x < pad ||
        minY * model.viewport.scale + model.viewport.y < pad ||
        maxX * model.viewport.scale + model.viewport.x > fitWidth - pad ||
        maxY * model.viewport.scale + model.viewport.y > rect.height - pad
      );
    }
    function paint(summary) {
      model.summary = summary;
      const jobs = asArray(summary.jobs);
      const fallback = summary.fallbackMode !== false;
      const unavailable = Boolean(summary.unavailable);
      const runnerCopy = unavailable
        ? 'Scheduled jobs backend is not deployed here yet.'
        : fallback
          ? 'Fallback runner applies due jobs when the site is next opened.'
          : 'Worker is connected.';
      const report = validationReport();
      const plainSummary = workflowPlainSummary(report);
      const jobsEmptyHtml = unavailable
        ? `<div class="admin-node-empty admin-node-empty--action"><strong>Scheduled jobs unavailable</strong><span>${escapeHtml(summary.error || 'This backend does not expose the scheduled-jobs endpoint yet.')}</span><button type="button" class="admin-btn admin-btn-sm" data-automation-retry>Retry connection</button></div>`
        : '<div class="admin-node-empty admin-node-empty--action"><strong>No automations yet</strong><span>Create one workflow, then it will appear here.</span><button type="button" class="admin-btn admin-btn-sm" data-focus-workflow-create>Create current workflow</button></div>';
      const groups = nodeTypes.reduce((acc, item) => {
        (acc[item.group] ||= []).push(item);
        return acc;
      }, {});
      host.innerHTML = `
        <div class="admin-studio-frame admin-studio-frame--automation">
          <aside class="admin-studio-palette" aria-label="Automation object palette">
            <div class="admin-studio-pane-head"><h2>Blocks</h2><span>Pick a template or drag blocks</span></div>
            <div class="admin-studio-palette-scroll">
              <section class="admin-studio-palette-group admin-template-group">
                <h3>Templates</h3>
                <button type="button" data-workflow-template="schedule">${ICON.schedule}<span><strong>Schedule + publish</strong><small>Ready graph: date, schedule, publish</small></span></button>
                <button type="button" data-workflow-template="maintenance">${ICON.privacy}<span><strong>Maintenance window</strong><small>Ready graph: date, maintenance, publish</small></span></button>
                <button type="button" data-workflow-template="announcement">${ICON.announce}<span><strong>Announcement timing</strong><small>Ready graph: show or expire a card</small></span></button>
              </section>
              ${Object.entries(groups).map(([group, items]) => `
                <section class="admin-studio-palette-group">
                  <h3>${escapeHtml(group)}</h3>
                  ${items.map(item => `<button type="button" draggable="true" data-add-workflow-node="${escapeHtml(item.type)}">${ICON.automation}<span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.hint)}</small></span></button>`).join('')}
                </section>`).join('')}
            </div>
          </aside>
          <section class="admin-studio-canvas-panel">
            <div class="admin-studio-toolbar">
              <div><h2>Rules canvas</h2><span>${escapeHtml(runnerCopy)} ${jobs.length} active</span></div>
              <div class="row-gap-8">
                <button type="button" class="admin-btn admin-btn-sm" data-automation-zoom-out>-</button>
                <span class="admin-studio-zoom" data-automation-zoom-value>${Math.round(model.viewport.scale * 100)}%</span>
                <button type="button" class="admin-btn admin-btn-sm" data-automation-zoom-in>+</button>
                <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-automation-fit>Fit</button>
                <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-automation-autolayout>Auto-layout</button>
                <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-automation-reset-view>Reset</button>
                <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost" data-automation-guide title="Show the guided walkthrough">? Guide</button>
                <button type="button" class="admin-btn admin-btn-sm" data-automation-fullscreen>${ICON.fullscreen}<span>Fullscreen</span></button>
              </div>
            </div>
            <div class="admin-workflow-summary-card">
              <div><span>What this workflow will do</span><strong>${escapeHtml(plainSummary)}</strong></div>
              <div class="admin-workflow-template-row" aria-label="Workflow templates">
                <button type="button" data-workflow-template="schedule">Schedule + publish</button>
                <button type="button" data-workflow-template="maintenance">Maintenance window</button>
                <button type="button" data-workflow-template="announcement">Announcement timing</button>
              </div>
            </div>
            <div class="admin-object-canvas admin-object-canvas--flow" data-automation-canvas tabindex="0" aria-label="Automation canvas">
              <div class="admin-canvas-world" data-automation-world>
                <svg class="admin-workflow-lines" viewBox="0 0 1800 1200" aria-hidden="true" focusable="false">${renderLines()}</svg>
                ${model.nodes.map(renderNode).join('')}
              </div>
              <div class="admin-canvas-hint" aria-hidden="true">scroll pan · ⌘scroll zoom · ⌫ delete · ⌘C/⌘V copy·paste · ⌘D duplicate · arrows nudge</div>
            </div>
            <div class="admin-flow-footer admin-flow-footer--graph">
              <label class="admin-flow-field admin-flow-field--name"><span>Workflow name</span><input class="admin-input" data-workflow-name value="${escapeHtml(model.name)}"></label>
              ${renderValidation(report)}
              <button type="button" class="ad-btn ad-btn--primary" data-automation-create ${unavailable ? 'disabled title="Scheduled jobs backend is not available yet."' : ''}>${ICON.plus}<span>Create automation</span></button>
            </div>
          </section>
          <aside class="admin-node-inspector" aria-label="Workflow inspector">
            <div class="admin-studio-pane-head"><h2>Inspector</h2><span>${model.nodes.length} nodes</span></div>
            <div data-automation-inspector>${renderInspector()}</div>
            <div class="admin-job-queue admin-job-queue--validation">
              <div class="admin-panel-heading"><h2>Workflow check</h2><span>${escapeHtml(report.status)}</span></div>
              ${renderValidation(report)}
            </div>
            <div class="admin-job-queue">
              <div class="admin-panel-heading"><h2>Scheduled jobs</h2><span>${jobs.length} active</span></div>
              ${jobs.length ? jobs.map(job => `
                <article class="admin-automation-job" data-job-id="${escapeHtml(job.id)}">
                  <div><strong>${escapeHtml(job.name || 'Scheduled job')}</strong><span>${escapeHtml(jobSummary(job))}</span><small>${escapeHtml(job.status || 'scheduled')}</small></div>
                  <div class="row-gap-8">
                    <button type="button" class="admin-btn admin-btn-sm" data-job-apply>Apply</button>
                    <button type="button" class="admin-btn admin-btn-sm admin-btn-danger admin-btn-icon" aria-label="Delete job" data-job-delete>${ICON.trash}</button>
                  </div>
                </article>`).join('') : jobsEmptyHtml}
            </div>
          </aside>
        </div>`;
      updateWorldTransform();
      if (!didInitialViewportFit) {
        didInitialViewportFit = true;
        requestAnimationFrame(() => {
          if (!storedWorkflowModel || workflowViewportIsClipped()) fitWorkflowToCanvas({ save: !storedWorkflowModel });
        });
      }
      bindAutomationEvents();
      refreshWorkspaceLayoutSoon();
    }
    function bindAutomationEvents() {
      host.querySelectorAll('[data-workflow-template]').forEach(btn => {
        btn.addEventListener('click', () => applyTemplate(btn.dataset.workflowTemplate));
      });
      host.querySelectorAll('[data-add-workflow-node]').forEach(btn => {
        btn.addEventListener('click', () => {
          const center = visibleCanvasCenter();
          addNode(btn.dataset.addWorkflowNode, { x: center.x + model.nodes.length * 16, y: center.y + model.nodes.length * 16 });
        });
        btn.addEventListener('dragstart', event => {
          event.dataTransfer?.setData('application/phs-workflow-node', btn.dataset.addWorkflowNode);
          event.dataTransfer?.setData('text/plain', btn.dataset.addWorkflowNode);
        });
      });
      const canvas = host.querySelector('[data-automation-canvas]');
      canvas?.addEventListener('dragover', event => event.preventDefault());
      canvas?.addEventListener('drop', event => {
        event.preventDefault();
        const type = event.dataTransfer?.getData('application/phs-workflow-node') || event.dataTransfer?.getData('text/plain');
        if (type) addNode(type, canvasPoint(event));
      });
      canvas?.addEventListener('pointerdown', event => {
        if (event.target.closest('[data-workflow-node]') || event.target.closest('button,input,textarea,select')) return;
        dragState = { mode: 'pan', startX: event.clientX, startY: event.clientY, origin: deepClone(model.viewport) };
        canvas.setPointerCapture?.(event.pointerId);
      });
      canvas?.addEventListener('pointermove', event => {
        if (!dragState) return;
        if (dragState.mode === 'pan') {
          model.viewport.x = dragState.origin.x + event.clientX - dragState.startX;
          model.viewport.y = dragState.origin.y + event.clientY - dragState.startY;
          updateWorldTransform();
        } else if (dragState.mode === 'move' && dragState.node) {
          const dx = (event.clientX - dragState.startX) / model.viewport.scale;
          const dy = (event.clientY - dragState.startY) / model.viewport.scale;
          dragState.node.x = Math.round((dragState.origin.x + dx) / 8) * 8;
          dragState.node.y = Math.round((dragState.origin.y + dy) / 8) * 8;
          const el = host.querySelector(`[data-workflow-node="${cssEscape(dragState.node.id)}"]`);
          if (el) { el.style.left = `${dragState.node.x}px`; el.style.top = `${dragState.node.y}px`; }
          refreshLines();
        }
      });
      const finishDrag = () => {
        if (!dragState) return;
        dragState = null;
        saveModel();
        paint(model.summary || { jobs: [] });
      };
      canvas?.addEventListener('pointerup', finishDrag);
      canvas?.addEventListener('pointercancel', finishDrag);
      host.querySelectorAll('[data-workflow-node]').forEach(el => {
        el.addEventListener('pointerdown', event => {
          const node = model.nodes.find(item => item.id === el.dataset.workflowNode);
          if (!node || event.target.closest('[data-delete-workflow-node],[data-flow-port],button,input,textarea,select')) return;
          event.preventDefault();
          event.stopPropagation();
          node.z = Math.max(0, ...model.nodes.map(item => Number(item.z) || 0)) + 1;
          el.style.zIndex = String(node.z);
          selectNodeInCanvas(node.id);
          dragState = { mode: 'move', node, startX: event.clientX, startY: event.clientY, origin: { x: node.x, y: node.y } };
          el.setPointerCapture?.(event.pointerId);
        });
      });
      host.querySelectorAll('[data-flow-port]').forEach(port => {
        port.addEventListener('click', event => {
          event.stopPropagation();
          const nodeId = port.dataset.flowNode;
          if (port.dataset.flowPort === 'out') {
            connectingFrom = connectingFrom === nodeId ? null : nodeId;
            model.selectedId = nodeId;
            paint(model.summary || { jobs: [] });
            return;
          }
          if (connectingFrom) connectNodes(connectingFrom, nodeId);
          else {
            model.selectedId = nodeId;
            paint(model.summary || { jobs: [] });
          }
        });
      });
      host.querySelectorAll('[data-delete-workflow-node]').forEach(btn => btn.addEventListener('click', event => {
        event.stopPropagation();
        deleteNode(btn.dataset.deleteWorkflowNode);
      }));
      host.querySelectorAll('[data-remove-edge]').forEach(btn => btn.addEventListener('click', () => {
        model.edges = model.edges.filter(edge => edge.id !== btn.dataset.removeEdge);
        saveModel();
        paint(model.summary || { jobs: [] });
      }));
      host.querySelector('[data-delete-selected-node]')?.addEventListener('click', () => deleteNode());
      host.querySelector('[data-duplicate-selected-node]')?.addEventListener('click', () => duplicateNode());
      host.querySelector('[data-workflow-name]')?.addEventListener('input', event => {
        model.name = event.target.value;
        saveModel();
      });
      host.querySelectorAll('[data-node-field]').forEach(input => {
        input.addEventListener(input.matches('textarea,input[type="text"]') ? 'input' : 'change', () => {
          const node = selectedNode();
          if (!node) return;
          node.data[input.dataset.nodeField] = input.dataset.nodeField === 'index' ? Number(input.value) : input.value;
          saveModel();
          const card = host.querySelector(`[data-workflow-node="${cssEscape(node.id)}"] .admin-flow-node-card__body strong`);
          if (card) card.textContent = nodeSubtitle(node);
        });
      });
      host.querySelectorAll('[data-node-weekday]').forEach(input => {
        input.addEventListener('change', () => {
          const node = selectedNode();
          if (!node) return;
          node.data.weekdays = [...host.querySelectorAll('[data-node-weekday]:checked')].map(item => Number(item.value));
          saveModel();
          paint(model.summary || { jobs: [] });
        });
      });
      host.querySelectorAll('[data-node-geo]').forEach(input => input.addEventListener('change', () => {
        const node = selectedNode();
        if (!node) return;
        const key = input.dataset.nodeGeo === 'y' ? 'y' : 'x';
        node[key] = clampNumber(Number(input.value), -1000, key === 'y' ? 1800 : 2600);
        saveModel();
        paint(model.summary || { jobs: [] });
      }));
      host.querySelector('[data-automation-create]')?.addEventListener('click', async () => {
        try {
          const payload = compileWorkflow();
          await api('/admin/scheduled-jobs', { method: 'POST', body: JSON.stringify(payload) });
          toast('Automation created from canvas.', 'success', 2200);
          state.scheduledJobs = null;
          paint(await loadScheduledJobs(true));
        } catch (e) {
          toast('Automation failed: ' + e.message, 'error', 5200);
        }
      });
      host.querySelector('[data-focus-workflow-create]')?.addEventListener('click', () => {
        host.querySelector('[data-automation-create]')?.focus();
      });
      host.querySelector('[data-automation-retry]')?.addEventListener('click', async () => {
        state.scheduledJobs = null;
        paint(await loadScheduledJobs(true));
      });
      host.querySelector('[data-automation-fullscreen]')?.addEventListener('click', () => toggleWorkbenchFullscreen(host));
      host.querySelector('[data-automation-reset-view]')?.addEventListener('click', () => {
        model.viewport = { x: 0, y: 0, scale: 1 };
        saveModel();
        updateWorldTransform();
      });
      host.querySelector('[data-automation-autolayout]')?.addEventListener('click', autoLayoutWorkflow);
      host.querySelector('[data-automation-fit]')?.addEventListener('click', () => fitWorkflowToCanvas());
      host.querySelector('[data-automation-zoom-in]')?.addEventListener('click', () => {
        model.viewport.scale = clampNumber(model.viewport.scale + 0.1, 0.6, 1.45);
        saveModel();
        updateWorldTransform();
      });
      host.querySelector('[data-automation-zoom-out]')?.addEventListener('click', () => {
        model.viewport.scale = clampNumber(model.viewport.scale - 0.1, 0.6, 1.45);
        saveModel();
        updateWorldTransform();
      });
      // Scoped canvas zoom/pan (wheel + pinch) — re-bound each paint on the fresh canvas.
      const canvasEl = host.querySelector('[data-automation-canvas]');
      if (canvasEl) canvasEl.addEventListener('wheel', onCanvasWheel, { passive: false });
      // Keyboard shortcuts — attach once per workbench instance.
      if (!host.dataset.keysBound) {
        host.dataset.keysBound = '1';
        if (automationKeyCleanup) automationKeyCleanup();
        document.addEventListener('keydown', onCanvasKeydown);
        host.addEventListener('keydown', onCanvasHostKeydown);
        const cleanup = () => {
          document.removeEventListener('keydown', onCanvasKeydown);
          host.removeEventListener('keydown', onCanvasHostKeydown);
          if (automationKeyCleanup === cleanup) automationKeyCleanup = null;
        };
        automationKeyCleanup = cleanup;
      }
      host.querySelector('[data-automation-guide]')?.addEventListener('click', startAutomationsTour);
      host.querySelectorAll('[data-job-apply]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('[data-job-id]')?.dataset.jobId;
          btn.disabled = true;
          try {
            await api('/admin/scheduled-jobs/' + encodeURIComponent(id) + '/apply', { method: 'POST' });
            state.scheduledJobs = null;
            toast('Automation applied and logged.', 'success', 2600);
            paint(await loadScheduledJobs(true));
          } catch (e) {
            toast('Automation apply failed: ' + e.message, 'error', 5200);
            btn.disabled = false;
          }
        });
      });
      host.querySelectorAll('[data-job-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('[data-job-id]')?.dataset.jobId;
          try {
            await api('/admin/scheduled-jobs/' + encodeURIComponent(id) + '/delete', { method: 'POST' });
            state.scheduledJobs = null;
            toast('Automation deleted.', 'success', 1800);
            paint(await loadScheduledJobs(true));
          } catch (e) {
            toast('Delete failed: ' + e.message, 'error', 5000);
          }
        });
      });
    }
    loadScheduledJobs(true).then(paint).catch(e => {
      host.innerHTML = `<div class="admin-field-help admin-field-help--danger">${escapeHtml(e.message)}</div>`;
      refreshWorkspaceLayoutSoon();
    });
    return host;
  }

  function renderPageHeader(tab) {
    const header = document.createElement('header');
    header.className = 'ad-pagehead';
    header.style.setProperty('--stagger', '0');
    header.innerHTML = `
      <div class="ad-pagehead__text">
        <h1 class="ad-pagehead__title">${escapeHtml(tab.title || tab.label)}</h1>
        <p class="ad-pagehead__sub">${escapeHtml(tab.sub || '')}</p>
      </div>
    `;
    return header;
  }

  const DEVELOPMENT_NOTICES = {
    automations: {
      title: 'Automation editor is under development',
      text: 'The rules canvas is powerful but still being refined. Start from a template, review the summary, and check scheduled jobs before publishing.'
    },
    advanced: {
      title: 'Theme Studio is under development',
      text: 'The live theme editor writes to the draft preview. Use it for experiments, then inspect the public preview before publishing.'
    }
  };

  function renderDevelopmentNotice(tab) {
    const copy = DEVELOPMENT_NOTICES[tab.id];
    if (!copy) return null;
    const note = document.createElement('aside');
    note.className = 'admin-dev-note';
    note.setAttribute('role', 'note');
    note.style.setProperty('--stagger', '0');
    note.innerHTML = `
      <span class="admin-dev-note__icon" aria-hidden="true">${ICON.info}</span>
      <span class="admin-dev-note__copy">
        <strong>${escapeHtml(copy.title)}</strong>
        <span>${escapeHtml(copy.text)}</span>
      </span>
    `;
    return note;
  }

  // ── Tab body render ────────────────────────────────────────────────────
  function renderActiveTab(options = {}) {
    // Preserve scroll + focus unless this is a fresh tab enter (animate=true)
    const _scrollY = options.animate ? null : (window.scrollY || document.documentElement.scrollTop || 0);
    const _activeEl = options.animate ? null : document.activeElement;
    const _focusKey = (() => {
      if (!_activeEl || _activeEl === document.body) return null;
      const id = _activeEl.id;
      const path = _activeEl.dataset?.path || _activeEl.dataset?.studioBinding || _activeEl.dataset?.studioTextContent || _activeEl.dataset?.styleBase;
      const styleProp = _activeEl.dataset?.styleProp;
      const selStart = isPresent(_activeEl.selectionStart) ? _activeEl.selectionStart : null;
      const selEnd = isPresent(_activeEl.selectionEnd) ? _activeEl.selectionEnd : null;
      if (!id && !path) return null;
      return { id, path, styleProp, selStart, selEnd };
    })();
    const _restoreScroll = () => {
      if (isPresent(_scrollY)) {
        window.scrollTo({ top: _scrollY, left: 0, behavior: 'instant' });
        requestAnimationFrame(() => window.scrollTo({ top: _scrollY, left: 0, behavior: 'instant' }));
      }
      if (_focusKey) {
        let el = null;
        if (_focusKey.id) el = document.getElementById(_focusKey.id);
        if (!el && _focusKey.path) {
          const sel = _focusKey.styleProp
            ? `[data-style-base="${CSS.escape(_focusKey.path)}"][data-style-prop="${CSS.escape(_focusKey.styleProp)}"]`
            : `[data-path="${CSS.escape(_focusKey.path)}"] input, [data-path="${CSS.escape(_focusKey.path)}"] textarea, [data-studio-binding="${CSS.escape(_focusKey.path)}"], [data-studio-text-content="${CSS.escape(_focusKey.path)}"]`;
          el = document.querySelector(sel);
        }
        if (el && typeof el.focus === 'function') {
          el.focus({ preventScroll: true });
          if (isPresent(_focusKey.selStart) && typeof el.setSelectionRange === 'function') {
            try { el.setSelectionRange(_focusKey.selStart, _focusKey.selEnd); } catch {}
          }
        }
      }
    };
    const tab = SCHEMA.find(t => t.id === state.activeTab) || SCHEMA[0];
    const animateEnter = options.animate === true;
    if (animateEnter) dismissActiveTour(false);
    document.querySelectorAll('.admin-object-workbench-host.is-fullscreen').forEach(host => setWorkbenchFullscreen(host, false));
    document.querySelectorAll('.admin-card--fullscreen-host').forEach(card => card.classList.remove('admin-card--fullscreen-host'));
    document.body.classList.remove('admin-canvas-fullscreen');
    if (tab.id !== 'today' && todayDashboardTimer) {
      clearTimeout(todayDashboardTimer);
      todayDashboardTimer = null;
    }
    const shell = $('#app-shell');
    [...shell.classList].filter(cls => cls.startsWith('admin-shell--tab-')).forEach(cls => shell.classList.remove(cls));
    shell.classList.toggle('admin-shell--jarvis', tab.id === 'jarvis');
    document.body?.classList.toggle('admin-body--jarvis', tab.id === 'jarvis');
    shell.classList.add(`admin-shell--tab-${tab.id}`);
    $('#tab-title').textContent = tab.title || tab.label;
    $('#tab-sub').textContent   = tab.sub;
    const panels = $('#panels');
    panels.innerHTML = '';
    const wideTabs = new Set(['today', 'availability', 'jarvis', 'bellSchedules', 'announcements', 'appearance', 'safety', 'history', 'automations', 'advanced']);
    panels.className = [
      'admin-panels',
      `admin-panels--${tab.id}`,
      wideTabs.has(tab.id) ? 'admin-panels--wide' : '',
      tab.id === 'appearance' ? 'admin-panels--appearance' : '',
      animateEnter ? 'admin-panels--animate' : ''
    ].filter(Boolean).join(' ');
    if (!(tab.id === 'today' && state.todayVariant === 'b')) {
      panels.appendChild(renderPageHeader(tab));
    }
    const workspace = document.createElement('div');
    workspace.className = [
      'admin-workspace',
      `admin-workspace--${tab.id}`,
      'admin-workspace--no-rail',
      wideTabs.has(tab.id) ? 'admin-workspace--wide' : ''
    ].filter(Boolean).join(' ');
    const developmentNotice = renderDevelopmentNotice(tab);
    if (developmentNotice) workspace.appendChild(developmentNotice);

    const workspaceMain = document.createElement('div');
    workspaceMain.className = 'admin-workspace-main';
    workspace.appendChild(workspaceMain);
    panels.appendChild(workspace);

    const q = state.search.trim().toLowerCase();
    const matches = (label) => !q || (label || '').toLowerCase().includes(q);

    let anyVisible = false;
    for (const group of tab.groups) {
      if (group.custom && q && !groupMatchesSearch(tab, group, q)) continue;
      if (group.custom === 'todayDashboard') {
        const todayNode = renderTodayDashboard();
        todayNode.style.setProperty('--i', '0');
        todayNode.style.setProperty('--stagger', '1');
        workspaceMain.appendChild(todayNode);
        anyVisible = true;
        continue;
      }
      const card = document.createElement('section');
      card.className = 'admin-card ad-card';
      const staggerIndex = Math.min(workspaceMain.children.length + 1, 6);
      card.style.setProperty('--i', String(staggerIndex));
      card.style.setProperty('--stagger', String(staggerIndex));
      if (group.custom === 'jarvisAssistant') card.classList.add('admin-card--jarvis');
      if (group.custom) card.classList.add(`admin-card--${group.custom}`);
      if (group.title) card.classList.add(`admin-card--group-${classSlug(group.title)}`);
      if (tab.id === 'appearance' && group.title) card.classList.add(`admin-appearance-card-${classSlug(group.title)}`);
      card.innerHTML = group.title ? `<h2 class="ad-card__title">${escapeHtml(group.title)}</h2>` : '';

      if (group.custom === 'availabilityEditor')        { card.appendChild(renderAvailabilityEditor()); anyVisible = true; }
      else if (group.custom === 'navEditor')            { card.appendChild(renderNavEditor()); anyVisible = true; }
      else if (group.custom === 'themeStudio')          { card.appendChild(renderThemeStudioLiveCanvas()); anyVisible = true; }
      else if (group.custom === 'jarvisAssistant')      { card.appendChild(renderJarvisAssistant()); anyVisible = true; }
      else if (group.custom === 'announcementsEditor')  { card.appendChild(renderAnnouncementsEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleRulesEditor')  { card.appendChild(renderScheduleRulesEditor()); anyVisible = true; }
      else if (group.custom === 'schedulePlanner')      { card.appendChild(renderSchedulePlanner()); anyVisible = true; }
      else if (group.custom === 'scheduleOverrideEditor'){ card.appendChild(renderScheduleOverrideEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleStudio')       { card.appendChild(renderScheduleStudio()); anyVisible = true; }
      else if (group.custom === 'bellEditor')           { card.appendChild(renderBellEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleImageImport') { card.appendChild(renderScheduleImageImport()); anyVisible = true; }
      else if (group.custom === 'privacyParagraphsEditor'){ card.appendChild(renderPrivacyParagraphsEditor()); anyVisible = true; }
      else if (group.custom === 'analyticsDashboard')   { card.appendChild(renderAnalyticsDashboard()); anyVisible = true; }
      else if (group.custom === 'auditLog')             { card.appendChild(renderAuditLog()); anyVisible = true; }
      else if (group.custom === 'backupManager')        { card.appendChild(renderBackupManager()); anyVisible = true; }
      else if (group.custom === 'automationsEngine')    { card.appendChild(renderAutomationsGraphWorkbench()); anyVisible = true; }
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
      workspaceMain.innerHTML = `<div class="admin-card ad-card"><div class="admin-field-help">No fields match "${escapeHtml(q)}" on this tab. Other tabs may have matches.</div></div>`;
    }

    refreshDirtyMarkers();
    pushPreview();
    scheduleWorkspaceMasonry(workspaceMain);
    observeScrollReveals(panels);
    _restoreScroll();
  }

  // ── Dirty / publish ────────────────────────────────────────────────────
  function formatLastSaved() {
    if (state.lastSaveStatus === 'saving') return 'Saving...';
    if (state.lastSaveStatus === 'error') return state.lastSaveError ? `Save failed: ${state.lastSaveError}` : 'Save failed';
    if (!state.lastSavedAt) return '';
    const seconds = Math.max(0, Math.round((Date.now() - new Date(state.lastSavedAt).getTime()) / 1000));
    if (seconds < 8) return 'Saved just now';
    if (seconds < 60) return `Saved ${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `Saved ${minutes}m ago`;
    return `Saved ${new Date(state.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  function syncLastSavedTicker() {
    if (lastSavedTicker) clearInterval(lastSavedTicker);
    lastSavedTicker = null;
    if (!state.lastSavedAt || state.lastSaveStatus === 'saving') return;
    lastSavedTicker = setInterval(refreshDirtyMarkers, 15_000);
  }

  function updateSaveStatusUI() {
    const pill = $('#save-status-pill');
    if (!pill) return;
    const text = formatLastSaved();
    pill.textContent = text;
    pill.classList.toggle('visible', Boolean(text));
    pill.dataset.status = state.lastSaveStatus || 'idle';
  }

  function refreshDirtyMarkers() {
    const clientDirty = hasClientDraftChanges();
    const unpublished = hasUnpublishedDraftChanges();
    const changed = changedSections();
    const tab = SCHEMA.find(t => t.id === state.activeTab) || SCHEMA[0];
    const readOnly = Boolean(tab.readOnly);
    $('#app-shell')?.classList.toggle('admin-shell--has-unsaved', unpublished && !readOnly);
    document.body?.classList.toggle('admin-body--has-unsaved', unpublished && !readOnly);
    $('#discard-btn').classList.toggle('hidden', readOnly);
    $('#publish-btn').classList.toggle('hidden', readOnly);
    $('#save-draft-btn')?.classList.toggle('hidden', readOnly);
    $('#dirty-pill').classList.toggle('hidden', readOnly);
    $('#dirty-pill').classList.toggle('visible', unpublished);
    $('#dirty-pill').textContent = unpublished
      ? `${changed.length || 1} unpublished ${changed.length === 1 ? 'section' : 'sections'}`
      : '';
    updateSaveStatusUI();
    $('#publish-btn').textContent = unpublished ? `Publish ${changed.length || 1}` : 'Publish';
    $('#publish-btn').disabled = readOnly || !unpublished || state.lastSaveStatus === 'saving';
    $('#discard-btn').disabled = readOnly || (!clientDirty && !unpublished) || state.lastSaveStatus === 'saving';
    $('#discard-btn').textContent = unpublished ? 'Discard draft' : (clientDirty ? 'Discard' : 'Discard');
    const saveBtn = $('#save-draft-btn');
    if (saveBtn) {
      saveBtn.disabled = readOnly || !clientDirty || state.lastSaveStatus === 'saving';
      saveBtn.textContent = state.lastSaveStatus === 'saving' ? 'Saving...' : 'Save draft';
    }
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

  function allSchemaFields() {
    return SCHEMA.flatMap(tab => (tab.groups || []).flatMap(group => group.fields || []));
  }

  function labelForPath(path) {
    return allSchemaFields().find(field => field.path === path)?.label || path.split('.').slice(1).join('.') || path;
  }

  function changedLeafPaths(before, after, prefix = '', limit = 10) {
    if (eq(before, after)) return [];
    if (limit <= 0) return [];
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) {
      return [prefix || 'value'];
    }
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const out = [];
    for (const key of keys) {
      if (key === 'updatedAt') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      out.push(...changedLeafPaths(before?.[key], after?.[key], path, limit - out.length));
      if (out.length >= limit) break;
    }
    return out;
  }

  function describeSectionChange(key, before, after) {
    if (key === 'announcements') {
      const beforeItems = asArray(before?.items);
      const afterItems = asArray(after?.items);
      const scheduled = afterItems.filter(item => item.showFrom || item.expiresOn).length;
      return [
        `${afterItems.length} announcement card${afterItems.length === 1 ? '' : 's'} in draft`,
        beforeItems.length !== afterItems.length ? `card count changed from ${beforeItems.length} to ${afterItems.length}` : '',
        scheduled ? `${scheduled} card${scheduled === 1 ? '' : 's'} have show or expire dates` : ''
      ].filter(Boolean);
    }
    if (key === 'bellSchedules') {
      const beforeDates = dateOverrideMap({ bellSchedules: before });
      const afterDates = dateOverrideMap({ bellSchedules: after });
      const changedDates = changedLeafPaths(beforeDates, afterDates, 'planner', 6).length;
      const templateChanges = changedLeafPaths(
        Object.fromEntries(Object.entries(before || {}).filter(([name]) => name !== '_dateOverrides')),
        Object.fromEntries(Object.entries(after || {}).filter(([name]) => name !== '_dateOverrides')),
        'templates',
        6
      ).length;
      return [
        changedDates ? `${Object.keys(afterDates).length} planned date${Object.keys(afterDates).length === 1 ? '' : 's'} saved` : '',
        templateChanges ? 'bell template periods changed' : ''
      ].filter(Boolean);
    }
    if (key === 'scheduleOverride') {
      return [after ? `${after.type || 'Override'} applies ${after.date || 'today'}` : 'active schedule override cleared'];
    }
    if (key === 'scheduleRules') {
      const beforeRules = asArray(before);
      const afterRules = asArray(after);
      return [
        `${afterRules.length} recurring schedule rule${afterRules.length === 1 ? '' : 's'} in draft`,
        beforeRules.length !== afterRules.length ? `rule count changed from ${beforeRules.length} to ${afterRules.length}` : ''
      ].filter(Boolean);
    }
    if (key === 'siteStatus') {
      return [`public site mode set to ${after?.mode === 'maintenance' ? 'maintenance' : 'live'}`];
    }
    if (key === 'themePresets') {
      return [`${asArray(after).length} saved theme preset${asArray(after).length === 1 ? '' : 's'} in draft`];
    }
    if (key === 'nav') {
      return [`${asArray(after?.items).length} navigation links in draft`];
    }
    if (key === 'gradeMelon') {
      return [`privacy modal copy changed (${asArray(after?.privacyParagraphs).length} paragraphs)`];
    }
    const paths = changedLeafPaths(before, after, key, 8)
      .map(path => labelForPath(path))
      .filter(Boolean);
    return paths.length ? paths : [`${sectionLabelForKey(key)} settings changed`];
  }

  function publishDiffDetails(patch, before = state.defaults, after = state.draft) {
    return Object.keys(patch || {})
      .filter(key => key !== 'updatedAt')
      .map(key => {
        const items = describeSectionChange(key, before?.[key], after?.[key]);
        return { key, label: sectionLabelForKey(key), items: items.length ? items : ['changed'] };
      });
  }

  function showPublishReviewDialog(details, issues) {
    return new Promise(resolve => {
      const existing = $('#admin-publish-review');
      existing?.remove();
      const dialog = document.createElement('div');
      dialog.id = 'admin-publish-review';
      dialog.className = 'admin-publish-review';
      const hasBlocks = issues.blocking.length > 0;
      const issueRows = [
        ...issues.blocking.map(text => ({ kind: 'Block', text })),
        ...issues.warnings.map(text => ({ kind: 'Watch', text }))
      ];
      dialog.innerHTML = `
        <div class="admin-publish-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-review-title">
          <div class="admin-publish-head">
            <div>
              <span>Publish review</span>
              <h2 id="publish-review-title">${hasBlocks ? 'Fix these before publishing' : 'Review changes before publishing'}</h2>
            </div>
            <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" data-publish-cancel aria-label="Close">${ICON.close}</button>
          </div>
          <div class="admin-diff-list">
            ${details.length ? details.map(section => `
              <div class="admin-diff-row">
                <strong>${escapeHtml(section.label)}</strong>
                <span>${escapeHtml(section.items.join('; '))}</span>
              </div>`).join('') : '<div class="admin-diff-row"><strong>No changes</strong><span>There is nothing to publish.</span></div>'}
          </div>
          ${issueRows.length ? `<div class="admin-publish-issues">${issueRows.map(issue => `<div class="${issue.kind === 'Block' ? 'danger' : 'attention'}"><strong>${issue.kind}</strong><span>${escapeHtml(issue.text)}</span></div>`).join('')}</div>` : ''}
          <div class="admin-publish-actions">
            <button type="button" class="admin-btn" data-publish-preview>${ICON.eye}<span>Preview draft</span></button>
            <button type="button" class="admin-btn admin-btn-ghost" data-publish-cancel>Cancel</button>
            <button type="button" class="admin-btn admin-btn-primary" data-publish-confirm ${hasBlocks ? 'disabled' : ''}>Publish</button>
          </div>
        </div>`;
      function finish(value) {
        dialog.remove();
        window.removeEventListener('keydown', onKeydown);
        resolve(value);
      }
      function onKeydown(event) {
        if (event.key === 'Escape') finish(false);
      }
      dialog.addEventListener('click', event => {
        if (event.target === dialog) finish(false);
      });
      dialog.querySelectorAll('[data-publish-cancel]').forEach(btn => btn.addEventListener('click', () => finish(false)));
      dialog.querySelector('[data-publish-preview]')?.addEventListener('click', () => openDraftPreview(null, { fromActiveTab: true }));
      dialog.querySelector('[data-publish-confirm]')?.addEventListener('click', () => finish(true));
      window.addEventListener('keydown', onKeydown);
      document.body.appendChild(dialog);
      observeScrollReveals(dialog);
      requestAnimationFrame(() => dialog.querySelector('[data-publish-confirm]:not(:disabled), [data-publish-cancel]')?.focus());
    });
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
    const plannedDates = dateOverrideMap(state.draft);
    for (const [date, type] of Object.entries(plannedDates)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) blocking.push(`Schedule planner date ${date} is invalid.`);
      if (!String(type || '').trim()) blocking.push(`Schedule planner date ${date} needs a schedule type.`);
    }
    asArray(state.draft?.scheduleRules).forEach((rule, index) => {
      const label = `Schedule rule ${index + 1}`;
      if (!['weekday', 'dateRange', 'date'].includes(rule.kind)) blocking.push(`${label} has an invalid rule type.`);
      if (!String(rule.scheduleType || '').trim()) blocking.push(`${label} needs a schedule type.`);
      if (rule.kind === 'weekday' && !asArray(rule.weekdays).length) blocking.push(`${label} needs at least one weekday.`);
      if (rule.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(rule.date || ''))) blocking.push(`${label} needs a valid date.`);
      if (rule.kind === 'dateRange') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rule.from || ''))) blocking.push(`${label} needs a valid start date.`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rule.to || ''))) blocking.push(`${label} needs a valid end date.`);
        if (rule.from && rule.to && rule.from > rule.to) blocking.push(`${label} ends before it starts.`);
      }
    });
    const schedules = state.draft?.bellSchedules && typeof state.draft.bellSchedules === 'object' ? state.draft.bellSchedules : {};
    const earliestAllowed = 4 * 3600;
    const latestAllowed = 22 * 3600;
    for (const [name, map] of Object.entries(schedules)) {
      if (name === '_dateOverrides') continue;
      const rows = Object.entries(map || {}).map(([start, value]) => ({
        start: Number(start),
        end: Number(asArray(value)[0]),
        name: String(asArray(value)[1] || '')
      })).sort((a, b) => a.start - b.start);
      if (!isNonInstructionalScheduleType(name) && !rows.length) {
        if (isEmptyScheduleTemplate(map) && fallbackRowsForScheduleType(name).length) continue;
        blocking.push(`${name} has no bell periods and no built-in schedule fallback.`);
      }
      rows.forEach((row, index) => {
        if (!Number.isFinite(row.start) || !Number.isFinite(row.end)) blocking.push(`${name} row ${index + 1} has an invalid time.`);
        if (row.end <= row.start) blocking.push(`${name} row ${index + 1} ends before it starts.`);
        if (row.start < earliestAllowed || row.end > latestAllowed) blocking.push(`${name} row ${index + 1} must stay between 4:00 AM and 10:00 PM.`);
        if (!row.name.trim()) blocking.push(`${name} row ${index + 1} needs a period name.`);
        const previous = rows[index - 1];
        if (previous && row.start < previous.end) blocking.push(`${name} row ${index + 1} overlaps the previous period.`);
      });
    }
    const overrideChecks = [
      ...Object.entries(plannedDates).map(([date, type]) => ({ date, type, label: `Planned schedule ${date}` })),
      ...(override?.date && override?.type ? [{ date: override.date, type: override.type, label: 'Active schedule override' }] : [])
    ];
    overrideChecks.forEach(item => {
      const effectiveRows = effectiveRowsForScheduleType(item.type, state.draft?.bellSchedules?.[item.type]);
      if (!isNonInstructionalScheduleType(item.type) && !effectiveRows.length) {
        blocking.push(`${item.label} uses ${item.type}, but that school day has no bell periods.`);
      }
    });

    const paragraphs = asArray(state.draft?.gradeMelon?.privacyParagraphs).map(p => String(p || '').trim()).filter(Boolean);
    asArray(state.draft?.announcements?.items).forEach((item, index) => {
      const showFrom = String(item.showFrom || '').trim();
      const expiresOn = String(item.expiresOn || '').trim();
      if (showFrom && !/^\d{4}-\d{2}-\d{2}$/.test(showFrom)) blocking.push(`Announcement ${index + 1} has an invalid show-from date.`);
      if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) blocking.push(`Announcement ${index + 1} has an invalid expire-on date.`);
      if (showFrom && expiresOn && showFrom > expiresOn) blocking.push(`Announcement ${index + 1} expires before it starts.`);
      if (!String(item.title || '').trim()) warnings.push(`Announcement ${index + 1} has no title.`);
      if (!asArray(item.bullets).some(b => String(b || '').trim())) warnings.push(`Announcement ${index + 1} has no visible bullet.`);
    });
    if (!paragraphs.length) warnings.push('Privacy modal has no explanatory paragraph.');
    if (normalizedSiteStatus().mode === 'maintenance') warnings.push('Publishing now will show the maintenance page to public visitors.');
    return { blocking, warnings };
  }

  async function confirmPublishReview(patch) {
    if (!state.scheduleData) {
      try {
        await loadScheduleData();
      } catch (_) {}
    }
    const issues = collectPublishIssues();
    const details = publishDiffDetails(patch);
    return showPublishReviewDialog(details, issues).then(ok => {
      if (!ok && issues.blocking.length) toast('Publish blocked by validation.', 'error', 4200);
      return ok;
    });
  }

  async function saveDraft(source = 'manual', opts = {}) {
    const patch = buildSettingsPatch(opts.onlyKeys || null);
    if (!Object.keys(patch).length) {
      state.lastSaveStatus = 'idle';
      refreshDirtyMarkers();
      toast('Draft is already saved.', 'success', 1600);
      return { settings: state.settings };
    }
    const requestId = ++activeSaveRequest;
    const previousSettings = deepClone(state.settings || {});
    const draftSnapshot = deepClone(state.draft || {});
    state.lastSaveStatus = 'saving';
    state.lastSaveError = '';
    state.lastSavedAt = new Date().toISOString();
    state.settings = deepClone(draftSnapshot);
    refreshDirtyMarkers();
    try {
      const json = await api('/site-settings', { method: 'PUT', body: JSON.stringify({ patch, source }) });
      if (requestId !== activeSaveRequest) return json;
      state.settings = json.settings || deepClone(draftSnapshot);
      if (eq(state.draft, draftSnapshot)) state.draft = deepClone(state.settings);
      state.lastSaveStatus = 'saved';
      state.lastSaveError = '';
      state.lastSavedAt = new Date().toISOString();
      syncLastSavedTicker();
      refreshDirtyMarkers();
      pushPreview();
      if (opts.toast !== false) toast('Draft saved.', 'success', 1800);
      return json;
    } catch (e) {
      if (requestId === activeSaveRequest) {
        state.settings = previousSettings;
        state.lastSaveStatus = 'error';
        state.lastSaveError = e.message || 'Could not save draft';
        refreshDirtyMarkers();
      }
      toast('Save failed: ' + (e.message || 'Could not save draft'), 'error', 6000);
      throw e;
    }
  }

  function confirmLeaveWithUnpublished(action = 'continue') {
    if (!hasUnpublishedDraftChanges()) return true;
    return window.confirm(`You have unpublished draft changes. ${action}`);
  }

  window.addEventListener('beforeunload', event => {
    if (!hasUnpublishedDraftChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  $('#discard-btn').addEventListener('click', async () => {
    const clientDirty = hasClientDraftChanges();
    const unpublished = hasUnpublishedDraftChanges();
    if (clientDirty && !unpublished) {
      state.draft = deepClone(state.settings);
      renderActiveTab();
      toast('Discarded local changes', 'success', 1800);
      return;
    }
    if (!unpublished) return;
    activeSaveRequest += 1;
    const patch = buildDiscardDraftPatch();
    if (!Object.keys(patch).length) {
      state.settings = deepClone(state.defaults);
      state.draft = deepClone(state.defaults);
      renderActiveTab();
      return;
    }
    const btn = $('#discard-btn');
    btn.disabled = true;
    btn.textContent = 'Discarding...';
    try {
      const json = await api('/site-settings', { method: 'PUT', body: JSON.stringify({ patch, source: 'discard-draft' }) });
      let cleanSettings = json.settings || deepClone(patch);
      try {
        cleanSettings = await fetchAdminJson('/site-settings/defaults');
      } catch (_) {}
      state.settings = deepClone(cleanSettings);
      state.defaults = deepClone(cleanSettings);
      state.draft = deepClone(cleanSettings);
      state.lastSaveStatus = 'saved';
      state.lastSaveError = '';
      state.lastSavedAt = new Date().toISOString();
      syncLastSavedTicker();
      renderActiveTab();
      state.settings = deepClone(cleanSettings);
      state.defaults = deepClone(cleanSettings);
      state.draft = deepClone(cleanSettings);
      refreshDirtyMarkers();
      toast('Saved draft discarded.', 'success', 2200);
    } catch (error) {
      state.lastSaveStatus = 'error';
      state.lastSaveError = error.message || 'Could not discard draft';
      refreshDirtyMarkers();
      toast('Discard failed: ' + (error.message || 'Could not discard draft'), 'error', 6000);
    }
  });

  $('#save-draft-btn')?.addEventListener('click', () => {
    saveDraft('manual').catch(() => {});
  });

  async function publishDraft(source = 'manual', opts = {}) {
    const btn = $('#publish-btn');
    btn.disabled = true; btn.textContent = 'Publishing...';
    try {
      const savePatch = buildSettingsPatch(opts.onlyKeys || null);
      const publishPatch = buildPublishPatch(opts.onlyKeys || null);
      if (!Object.keys(savePatch).length && !Object.keys(publishPatch).length) { toast('Nothing to publish'); return; }
      if (!await confirmPublishReview(publishPatch)) return;
      const json = Object.keys(savePatch).length
        ? await api('/site-settings', { method: 'PUT', body: JSON.stringify({ patch: savePatch, source }) })
        : { settings: state.settings };
      let syncJson = null;
      try {
        syncJson = await api('/admin/publish-public-settings', { method: 'POST' });
      } catch (syncError) {
        syncJson = { publicFrontend: { error: syncError.message } };
      }
      const publicFrontend = syncJson?.publicFrontend;
      const publicSyncOk = !publicFrontend?.error && publicFrontend?.enabled !== false;
      const savedSettings = syncJson?.settings || json.settings;
      state.settings = deepClone(savedSettings);
      if (publicSyncOk) state.defaults = deepClone(savedSettings);
      state.draft = deepClone(savedSettings);
      state.lastSaveStatus = 'saved';
      state.lastSaveError = '';
      state.lastSavedAt = new Date().toISOString();
      syncLastSavedTicker();
      state.lastPublishResult = Object.assign({}, json, syncJson || {});
      state.lastPublishAt = new Date().toISOString();
      if (publicFrontend?.error) {
        toast('Publish could not update the live site: ' + publicFrontend.error, 'error', 7000);
      } else if (publicFrontend?.enabled === false) {
        toast('Publish could not update the live site: ' + (publicFrontend.reason || 'public sync is not configured'), 'error', 7000);
      } else {
        toast(state.lastPublishResult.backup?.id ? 'Changes published. Backup saved first.' : 'Changes published. Public settings are synced.', 'success', 4000);
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
        toast('Live sync is not configured on this backend: ' + (json.publicFrontend.reason || 'missing GitHub token'), 'error', 7000);
      } else {
        if (json.settings) {
          state.settings = deepClone(json.settings);
          state.defaults = deepClone(json.settings);
          state.draft = deepClone(json.settings);
        }
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
        entries.push(...customCommandEntries(tab, group));
        for (const field of group.fields || []) {
          entries.push({ tab: tab.id, type: 'Field', title: field.label, detail: `${tab.label} · ${field.path}`, query: field.label, fieldPath: field.path });
        }
      }
    }
    return entries;
  }

  function customCommandEntries(tab, group) {
    const detail = (name) => `${tab.label} · ${name}`;
    const panelTarget = group.custom ? `admin-card--${group.custom}` : '';
    const panelEntry = (title, name = title) => ({ tab: tab.id, type: 'Field', title, detail: detail(name), query: `${title} ${name}`, targetClass: panelTarget });
    switch (group.custom) {
      case 'todayDashboard':
        return [
          panelEntry('Publish checks', 'sanity validation'),
          panelEntry('Lunch forecast', 'today lunch weather'),
          panelEntry('Usage overview', 'analytics overview')
        ];
      case 'availabilityEditor':
        return [
          { tab: tab.id, type: 'Field', title: 'Public site mode', detail: detail('siteStatus.mode'), query: 'live maintenance availability site status mode', targetClass: panelTarget },
          { tab: tab.id, type: 'Field', title: 'Maintenance title', detail: detail('siteStatus.title'), query: 'maintenance title siteStatus title', targetId: 'site-status-title' },
          { tab: tab.id, type: 'Field', title: 'Maintenance message', detail: detail('siteStatus.message'), query: 'maintenance message siteStatus message', targetId: 'site-status-message' }
        ];
      case 'schedulePlanner':
        return [
          panelEntry('Planner calendar', 'schedule date overrides'),
          panelEntry('Future date schedule', 'bellSchedules._dateOverrides')
        ];
      case 'scheduleRulesEditor':
        return [
          panelEntry('Recurring schedule rules', 'scheduleRules'),
          panelEntry('Weekday schedule rule', 'every weekday schedule'),
          panelEntry('Date range schedule rule', 'bulk date range schedule')
        ];
      case 'scheduleOverrideEditor':
        return [
          { tab: tab.id, type: 'Field', title: 'Active override type', detail: detail('scheduleOverride.type'), query: 'active override schedule type today', targetId: 'sched-override-select' },
          { tab: tab.id, type: 'Field', title: 'Override date', detail: detail('scheduleOverride.date'), query: 'active override date scheduleOverride date', targetId: 'sched-override-date' }
        ];
      case 'scheduleStudio':
        return [
          panelEntry('Schedule Studio timeline', 'bell schedule timeline editor'),
          panelEntry('Drag bell boundaries', 'period start end conflict')
        ];
      case 'bellEditor':
        return [
          panelEntry('Reusable schedule tabs', 'bellSchedules'),
          panelEntry('Bell period times', 'period start end')
        ];
      case 'scheduleImageImport':
        return [
          { tab: tab.id, type: 'Field', title: 'Schedule image upload', detail: detail('AI schedule image import'), query: 'upload extract schedule image', targetId: 'oi-pick' },
          { tab: tab.id, type: 'Field', title: 'Image target date', detail: detail('custom schedule target date'), query: 'image import target date', targetId: 'oi-date' }
        ];
      case 'announcementsEditor':
        return [
          panelEntry('Announcement cards', 'announcements.items'),
          panelEntry('Show from date', 'announcement showFrom'),
          panelEntry('Expire on date', 'announcement expiresOn')
        ];
      case 'navEditor':
        return [panelEntry('Navigation items', 'nav.items')];
      case 'themeStudio':
        return [
          panelEntry('Public-site canvas', 'live click element theme editor'),
          panelEntry('Layer list', 'select public site element'),
          panelEntry('Inspector controls', 'color size weight material'),
          panelEntry('Letter painter', 'per-letter text styling'),
          panelEntry('Dev clock preview', 'schedule preview clock')
        ];
      case 'privacyParagraphsEditor':
        return [panelEntry('Privacy paragraphs', 'privacy copy')];
      case 'analyticsDashboard':
        return [
          panelEntry('Analytics Studio', 'analytics charts'),
          panelEntry('CSV export', 'analytics csv export'),
          panelEntry('Peak hours', 'analytics peak hours devices')
        ];
      case 'auditLog':
        return [panelEntry('Audit log', 'audit history')];
      case 'backupManager':
        return [
          panelEntry('Backups and rollback', 'restore backup'),
          panelEntry('Visual version diff', 'compare backups'),
          panelEntry('Named snapshots', 'snapshot label')
        ];
      case 'automationsEngine':
        return [
          panelEntry('Rules canvas', 'node graph workflow editor'),
          panelEntry('Workflow templates', 'schedule maintenance announcement'),
          panelEntry('Block palette', 'drag trigger action publish note'),
          panelEntry('Workflow inspector', 'selected node controls'),
          panelEntry('Scheduled jobs', 'apply delete queue')
        ];
      case 'jarvisAssistant':
        return [
          { tab: tab.id, type: 'Field', title: 'Ask Jarvis', detail: detail('AI prompt'), query: 'ask jarvis prompt ai draft', targetId: 'jarvis-input' },
          panelEntry('Jarvis conversation', 'AI conversation')
        ];
      default:
        return [];
    }
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
          <input id="admin-command-input" type="search" autocomplete="off" placeholder="Jump to a tab, panel, date, or field">
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
    state.commandActiveIndex = 0;
    paintCommandPalette();
    requestAnimationFrame(() => input.focus());
  }

  function runCommandEntry(position = state.commandActiveIndex) {
    const palette = ensureCommandPalette();
    const row = $$('[data-command-index]', palette)[position] || $('[data-command-index]', palette);
    if (!row) return;
    const entry = commandEntries()[Number(row.dataset.commandIndex)];
    if (!entry) return;
    state.search = '';
    const searchInput = $('#search-input');
    if (searchInput) searchInput.value = '';
    goTab(entry.tab);
    closeCommandPalette();
    const revealTarget = () => {
      const targetControl = entry.targetId
        ? document.getElementById(entry.targetId)
        : entry.fieldPath
          ? document.getElementById(fieldElementId(entry.fieldPath))
          : null;
      const target = targetControl?.closest('.admin-field, .admin-list-item, .admin-card')
        || (entry.targetClass ? document.querySelector(`.${entry.targetClass}`) : null)
        || targetControl;
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      targetControl?.focus({ preventScroll: true });
    };
    requestAnimationFrame(revealTarget);
    setTimeout(revealTarget, 80);
  }

  function paintCommandPalette() {
    const palette = ensureCommandPalette();
    const input = $('#admin-command-input', palette);
    const results = $('#admin-command-results', palette);
    const query = String(input.value || '').trim().toLowerCase();
    const entries = commandEntries();
    const scored = entries
      .map((entry, index) => {
        const text = `${entry.type} ${entry.title} ${entry.detail} ${entry.query || ''}`.toLowerCase();
        const words = query.split(/\s+/).filter(Boolean);
        const score = !query
          ? 1
          : words.reduce((sum, word) => sum + (text.includes(word) ? (text.startsWith(word) ? 4 : 2) : -8), 0);
        return { entry, index, text, score };
      })
      .filter(row => !query || row.score > -1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    if (state.commandActiveIndex >= scored.length) state.commandActiveIndex = Math.max(0, scored.length - 1);
    results.innerHTML = scored.map((row, position) => `
      <button type="button" class="admin-command-row ${position === state.commandActiveIndex ? 'active' : ''}" data-command-index="${row.index}">
        <span>${escapeHtml(row.entry.type)}</span>
        <strong>${escapeHtml(row.entry.title)}</strong>
        <small>${escapeHtml(row.entry.detail)}</small>
      </button>`).join('') || '<div class="admin-command-empty">No matching admin command.</div>';
    $$('[data-command-index]', results).forEach((btn, position) => {
      btn.addEventListener('click', () => runCommandEntry(position));
    });
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
  }

  function closePreview() {
    $('#preview-host')?.classList.remove('open');
  }

  function ensureShortcutSheet() {
    let sheet = $('#admin-shortcuts-sheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'admin-shortcuts-sheet';
    sheet.className = 'admin-shortcuts-sheet';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = `
      <div class="admin-shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-shortcuts-title">
        <div class="admin-panel-heading">
          <h2 id="admin-shortcuts-title">Keyboard shortcuts</h2>
          <button type="button" class="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon" data-shortcuts-close aria-label="Close">${ICON.close}</button>
        </div>
        <dl>
          <div><dt>Command K</dt><dd>Jump to a tab or setting</dd></div>
          <div><dt>Command S</dt><dd>Save draft</dd></div>
          <div><dt>Command Enter</dt><dd>Publish after review</dd></div>
          <div><dt>Esc</dt><dd>Close preview, modal, or palette</dd></div>
          <div><dt>?</dt><dd>Show this sheet</dd></div>
        </dl>
      </div>`;
    sheet.addEventListener('click', event => {
      if (event.target === sheet || event.target.closest('[data-shortcuts-close]')) closeShortcutSheet();
    });
    document.body.appendChild(sheet);
    return sheet;
  }

  function openShortcutSheet() {
    const sheet = ensureShortcutSheet();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => sheet.querySelector('[data-shortcuts-close]')?.focus());
  }

  function closeShortcutSheet() {
    const sheet = $('#admin-shortcuts-sheet');
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  }

  $('#sidebar-collapse-btn')?.addEventListener('click', toggleDesktopSidebar);
  $('#theme-toggle-btn')?.addEventListener('click', toggleThemePreference);
  $('#style-toggle-btn')?.addEventListener('click', toggleStylePreference);
  $('#mobile-sidebar-toggle')?.addEventListener('click', toggleMobileSidebar);
  $('#sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);
  window.addEventListener('resize', () => {
    if (!isMobileSidebarMode()) closeMobileSidebar();
    syncSidebarState();
    scheduleWorkspaceMasonry();
  });
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === 's') {
      e.preventDefault();
      saveDraft('shortcut').catch(() => {});
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      publishDraft('shortcut').catch(() => {});
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
      e.preventDefault();
      openShortcutSheet();
      return;
    }
    const palette = $('#admin-command-palette');
    if (palette?.classList.contains('open')) {
      const rows = $$('[data-command-index]', palette);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.commandActiveIndex = rows.length ? (state.commandActiveIndex + 1) % rows.length : 0;
        paintCommandPalette();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.commandActiveIndex = rows.length ? (state.commandActiveIndex - 1 + rows.length) % rows.length : 0;
        paintCommandPalette();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        runCommandEntry(state.commandActiveIndex);
        return;
      }
    }
    if (e.key === 'Escape') {
      closeShortcutSheet();
      closeCommandPalette();
      closeMobileSidebar();
      closePreview();
    }
  });
  document.addEventListener('input', e => {
    if (e.target?.id === 'admin-command-input') paintCommandPalette();
  });

  // ── Search ─────────────────────────────────────────────────────────────
  $('#search-input').addEventListener('focus', (e) => openCommandPalette(e.target.value));
  $('#search-input').addEventListener('input', (e) => openCommandPalette(e.target.value));

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
  function previewDateValue() {
    return state.previewDate || todayISODate();
  }
  function dateOffsetFromToday(iso) {
    const date = isoToLocalDate(iso);
    const today = isoToLocalDate(todayISODate());
    if (!date || !today) return 0;
    return Math.round((date - today) / 86400000);
  }
  function syncPreviewDateControls() {
    const iso = previewDateValue();
    const input = $('#preview-date-input');
    const range = $('#preview-date-range');
    if (input) input.value = iso;
    if (range) {
      const offset = Math.max(Number(range.min), Math.min(Number(range.max), dateOffsetFromToday(iso)));
      range.value = String(offset);
    }
  }
  function setPreviewDate(iso, opts = {}) {
    const next = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso) : todayISODate();
    state.previewDate = next === todayISODate() ? '' : next;
    syncPreviewDateControls();
    const shell = $('#preview-frame-shell');
    if (shell && opts.animate !== false) {
      shell.classList.remove('is-time-traveling');
      void shell.offsetWidth;
      shell.classList.add('is-time-traveling');
    }
    pushPreview({ requireReady: false });
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
      $('#preview-frame').contentWindow.postMessage({
        type: 'phs:preview-settings',
        settings: state.draft,
        previewDate: state.previewDate || ''
      }, targetOrigin);
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
    syncPreviewDateControls();
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
  $('#preview-close-btn').addEventListener('click', closePreview);
  $('#preview-refresh-btn').addEventListener('click', refreshPreview);
  $('#preview-date-input')?.addEventListener('change', e => setPreviewDate(e.target.value));
  $('#preview-date-range')?.addEventListener('input', e => {
    const base = isoToLocalDate(todayISODate()) || new Date();
    setPreviewDate(dateToISODate(addDays(base, Number(e.target.value) || 0)));
  });
  $('#preview-date-today-btn')?.addEventListener('click', () => setPreviewDate(todayISODate()));
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
  ensureAdminCanvas();
  state.style = loadStylePreference();
  if (state.theme === 'light' && state.style === 'atelier') {
    state.style = 'classic';
    persistStylePreference();
  }
  syncThemePreference();
  syncStylePreference();
  restoreBearerSession();
  if (isLocal || isBackendHostedAdmin || state.token) bootApp(); else showLogin();
  if (!isLocal) loadAuthConfig();
})();
