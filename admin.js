/* PHS Schedule — Admin dashboard
 * Talks to the backend admin API at /admin/* and /site-settings.
 * Designed to be fully driven by `SCHEMA` so adding a new field is a one-liner.
 */
(() => {
  'use strict';

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const BACKEND = isLocal ? 'http://localhost:3000' : 'https://phs-grades-backend.onrender.com';
  const TOKEN_KEY = 'phs:admin-token:v1';

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    settings: null,    // current saved settings (server)
    defaults: null,
    draft: null,       // working copy with unsaved edits
    activeTab: 'branding',
    search: ''
  };

  // ── Schema (drives the entire UI) ──────────────────────────────────────
  // Each tab has fields. Fields target a dotted path on the settings object.
  const SCHEMA = [
    {
      id: 'branding', label: 'Branding', icon: '🪪',
      sub: 'Site title, logo, favicon — visible on every page.',
      groups: [{
        title: 'Identity', fields: [
          { path: 'branding.siteTitle',       label: 'Site title (browser tab)', kind: 'text', max: 200 },
          { path: 'branding.siteDescription', label: 'Meta description',         kind: 'text', max: 300 },
        ]
      },{
        title: 'Logo', fields: [
          { path: 'branding.logoSrc',  label: 'Logo image', kind: 'image', help: 'PNG / JPG / SVG, ≤ 4 MB' },
          { path: 'branding.logoAlt',  label: 'Logo alt text', kind: 'text', max: 120 },
          { path: 'branding.logoLink', label: 'Logo click-through URL', kind: 'url' },
        ]
      },{
        title: 'Favicon', fields: [
          { path: 'branding.favicon', label: 'Favicon (ico / png)', kind: 'image' }
        ]
      }]
    },
    {
      id: 'nav', label: 'Navigation', icon: '🧭',
      sub: 'Links shown in the top navigation bar of every page.',
      groups: [{ title: 'Nav items', custom: 'navEditor' }]
    },
    {
      id: 'hero', label: 'Page Headers', icon: '🎯',
      sub: 'Hero text on each page.',
      groups: [{
        title: 'Schedule page', fields: [
          { path: 'hero.schedulePageEyebrow',        label: 'Eyebrow above period name', kind: 'text', max: 80 },
          { path: 'hero.schedulePageStatusFallback', label: 'Status pill loading text', kind: 'text', max: 60 },
        ]
      },{
        title: 'Other pages', fields: [
          { path: 'hero.announcementsPageTitle', label: 'Announcements title', kind: 'text', max: 80 },
          { path: 'hero.gradesPageTitle',        label: 'Grades title',        kind: 'text', max: 80 },
        ]
      }]
    },
    {
      id: 'announcements', label: 'Announcements', icon: '📣',
      sub: 'Cards shown on the announcements page.',
      groups: [{ title: 'Cards', custom: 'announcementsEditor' }]
    },
    {
      id: 'schedule', label: 'Schedule Override', icon: '📅',
      sub: 'Force a schedule type for all users (overrides data.json).',
      groups: [{ title: 'Override', custom: 'scheduleOverrideEditor' }]
    },
    {
      id: 'grades', label: 'Grades Iframe', icon: '🍉',
      sub: 'Where the embedded GradeMelon iframe loads from.',
      groups: [{
        title: 'Iframe URLs', fields: [
          { path: 'grades.iframeUrlLocal', label: 'Local-development URL', kind: 'url', help: 'Used when site runs on localhost.' },
          { path: 'grades.iframeUrlProd',  label: 'Production URL',         kind: 'url' },
          { path: 'grades.pageTitle',      label: 'Browser-tab title',      kind: 'text' },
        ]
      }]
    },
    {
      id: 'theme', label: 'Theme Colors', icon: '🎨',
      sub: 'CSS variables applied site-wide (--accent, --bg-1, etc.).',
      groups: [{
        title: 'Palette', fields: [
          { path: 'theme.accent',  label: 'Accent',           kind: 'color' },
          { path: 'theme.accent2', label: 'Accent (deep)',    kind: 'color' },
          { path: 'theme.bg1',     label: 'Background outer', kind: 'color' },
          { path: 'theme.bg2',     label: 'Background inner', kind: 'color' },
          { path: 'theme.fg1',     label: 'Foreground',       kind: 'color' },
          { path: 'theme.fg2',     label: 'Muted foreground', kind: 'color' },
        ]
      }]
    },
    {
      id: 'footer', label: 'Footer', icon: '🪧',
      sub: 'Footer copy, feedback link, support email.',
      groups: [{
        title: 'Footer', fields: [
          { path: 'footer.copyright',     label: 'Copyright line',  kind: 'text' },
          { path: 'footer.feedbackUrl',   label: 'Feedback URL',    kind: 'url' },
          { path: 'footer.feedbackLabel', label: 'Feedback label',  kind: 'text' },
          { path: 'footer.supportEmail',  label: 'Support email',   kind: 'email' },
        ]
      }]
    },
    {
      id: 'countdown', label: 'Countdown copy', icon: '⏱️',
      sub: 'Labels around the countdown ring.',
      groups: [{
        title: 'Labels', fields: [
          { path: 'countdown.minSuffix', label: 'Minute suffix (e.g. "m")', kind: 'text', max: 6 }
        ]
      }]
    },
    {
      id: 'privacy', label: 'Privacy / Support', icon: '🔒',
      sub: 'Copy for the GradeMelon Privacy & Safety FAQ.',
      groups: [{
        title: 'FAQ copy', fields: [
          { path: 'privacy.faqTitle', label: 'Modal title',  kind: 'text' },
          { path: 'privacy.faqBody',  label: 'Modal body',   kind: 'textarea' },
        ]
      }]
    },
    {
      id: 'audit', label: 'Audit Log', icon: '📜',
      sub: 'Recent admin changes — read only.',
      groups: [{ title: 'Recent events', custom: 'auditLog' }]
    }
  ];

  // ── Helpers ────────────────────────────────────────────────────────────
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function get(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function set(obj, path, val) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] ?? {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function authHeaders(extra = {}) {
    return Object.assign({ 'Authorization': 'Bearer ' + state.token }, extra);
  }

  async function api(path, opts = {}) {
    const init = Object.assign({}, opts);
    init.headers = Object.assign({}, opts.headers || {}, opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {});
    if (state.token) Object.assign(init.headers, { Authorization: 'Bearer ' + state.token });
    const res = await fetch(BACKEND + path, init);
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
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, ms - 300);
    setTimeout(() => el.remove(), ms);
  }

  // ── Login ──────────────────────────────────────────────────────────────
  function showLogin(errorMsg) {
    $('#app-shell').classList.add('hidden');
    $('#login-shell').classList.remove('hidden');
    if (errorMsg) $('#login-error').textContent = errorMsg;
    setTimeout(() => $('#login-password').focus(), 50);
  }
  function showApp() {
    $('#login-shell').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#login-password').value;
    const btn = $('#login-btn');
    const err = $('#login-error');
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res = await fetch(BACKEND + '/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Login failed');
      state.token = json.token;
      localStorage.setItem(TOKEN_KEY, json.token);
      $('#login-password').value = '';
      await bootApp();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/admin/logout', { method: 'POST' }); } catch {}
    state.token = null;
    localStorage.removeItem(TOKEN_KEY);
    showLogin('Signed out.');
  });

  // ── Boot ───────────────────────────────────────────────────────────────
  async function bootApp() {
    try {
      // Validate token before showing the shell
      await api('/admin/whoami');
      const [settings, defaults] = await Promise.all([
        fetch(BACKEND + '/site-settings').then(r => r.json()),
        fetch(BACKEND + '/site-settings/defaults').then(r => r.json())
      ]);
      state.settings = settings;
      state.defaults = defaults;
      state.draft = deepClone(settings);
      showApp();
      renderSidebar();
      renderActiveTab();
      pingConnection();
    } catch (e) {
      console.warn('boot error', e);
      showLogin('Sign in to continue.');
    }
  }

  function pingConnection() {
    fetch(BACKEND + '/health')
      .then(r => r.ok ? r.json() : null)
      .then(j => { $('#conn-status').textContent = j?.ok ? 'Backend online · ' + new URL(BACKEND).host : 'Backend reachable but not OK'; })
      .catch(() => { $('#conn-status').textContent = 'Backend offline'; });
  }

  // ── Sidebar / tabs ─────────────────────────────────────────────────────
  function renderSidebar() {
    const nav = $('#tabs');
    nav.innerHTML = '';
    for (const tab of SCHEMA) {
      const b = document.createElement('button');
      b.className = 'admin-tab-btn' + (tab.id === state.activeTab ? ' active' : '');
      b.dataset.tab = tab.id;
      b.innerHTML = `<span class="admin-tab-icon">${tab.icon}</span><span>${escapeHtml(tab.label)}</span>`;
      b.addEventListener('click', () => { state.activeTab = tab.id; renderSidebar(); renderActiveTab(); });
      nav.appendChild(b);
    }
  }

  // ── Field rendering ────────────────────────────────────────────────────
  function fieldId(path) { return 'fld_' + path.replace(/\./g, '_'); }
  function isModified(path) {
    return !eq(get(state.settings, path), get(state.draft, path));
  }
  function isDefault(path) {
    return eq(get(state.draft, path), get(state.defaults, path));
  }

  function renderField(field) {
    const wrap = document.createElement('div');
    wrap.className = 'admin-field';
    wrap.dataset.path = field.path;
    if (isModified(field.path)) wrap.classList.add('is-modified');

    const head = document.createElement('div');
    head.className = 'admin-field-row';
    head.innerHTML = `<label for="${fieldId(field.path)}">${escapeHtml(field.label)}</label>`;
    const reset = document.createElement('button');
    reset.className = 'admin-field-reset';
    reset.type = 'button';
    reset.textContent = isDefault(field.path) ? '· default ·' : 'reset to default';
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
      ta.className = 'admin-textarea';
      ta.id = fieldId(field.path);
      ta.value = value ?? '';
      ta.addEventListener('input', () => { set(state.draft, field.path, ta.value); markDirty(); refreshDirtyMarkers(); });
      wrap.appendChild(ta);
    } else if (field.kind === 'color') {
      const row = document.createElement('div');
      row.className = 'admin-color-row';
      const hex = document.createElement('input');
      hex.type = 'color';
      hex.value = (value || '#000000').slice(0, 7);
      const text = document.createElement('input');
      text.className = 'admin-input';
      text.id = fieldId(field.path);
      text.value = value || '';
      function commit(v) { set(state.draft, field.path, v); markDirty(); refreshDirtyMarkers(); }
      hex.addEventListener('input', () => { text.value = hex.value; commit(hex.value); });
      text.addEventListener('input', () => { if (/^#[0-9a-fA-F]{3,8}$/.test(text.value)) hex.value = text.value.slice(0,7); commit(text.value); });
      row.append(hex, text);
      wrap.appendChild(row);
    } else if (field.kind === 'image') {
      wrap.appendChild(renderImageField(field, value));
    } else {
      const input = document.createElement('input');
      input.className = 'admin-input';
      input.id = fieldId(field.path);
      input.type = field.kind === 'email' ? 'email' : 'text';
      if (field.max) input.maxLength = field.max;
      input.value = value ?? '';
      input.addEventListener('input', () => { set(state.draft, field.path, input.value); markDirty(); refreshDirtyMarkers(); });
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

  function renderImageField(field, value) {
    const host = document.createElement('div');
    const preview = document.createElement('div');
    preview.className = 'admin-image-preview';
    function urlOf(v) {
      if (!v) return '';
      if (/^(https?:|\/uploads\/)/.test(v)) return v;
      // Relative file in schedule.phs-main
      return v;
    }
    function paint() {
      const v = get(state.draft, field.path) || '';
      preview.innerHTML = `
        <img src="${escapeHtml(urlOf(v))}" alt="" onerror="this.style.opacity=.2">
        <div class="info">
          <div class="name">${escapeHtml(v) || '— no image set —'}</div>
          <div class="meta">Click "Choose file" to upload, or paste a URL/path below.</div>
        </div>
      `;
    }
    paint();
    const text = document.createElement('input');
    text.className = 'admin-input';
    text.style.marginTop = '10px';
    text.value = value || '';
    text.placeholder = 'phs-logo.png · /uploads/123-logo.svg · https://…';
    text.addEventListener('input', () => { set(state.draft, field.path, text.value); markDirty(); paint(); refreshDirtyMarkers(); });

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.style.display = 'none';
    file.addEventListener('change', async () => {
      if (!file.files?.length) return;
      const fd = new FormData();
      fd.append('file', file.files[0]);
      try {
        const res = await fetch(BACKEND + '/admin/upload', { method: 'POST', headers: authHeaders(), body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Upload failed');
        text.value = BACKEND + json.url;
        set(state.draft, field.path, text.value);
        markDirty(); paint(); refreshDirtyMarkers();
        toast('Uploaded ' + json.filename);
      } catch (e) { toast(e.message, 'error'); }
      file.value = '';
    });

    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '8px';
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'admin-btn admin-btn-sm';
    upBtn.textContent = 'Choose file…';
    upBtn.addEventListener('click', () => file.click());
    const clrBtn = document.createElement('button');
    clrBtn.type = 'button';
    clrBtn.className = 'admin-btn admin-btn-sm admin-btn-ghost';
    clrBtn.textContent = 'Clear';
    clrBtn.addEventListener('click', () => { text.value = ''; set(state.draft, field.path, ''); markDirty(); paint(); refreshDirtyMarkers(); });
    btnRow.append(upBtn, clrBtn, file);

    host.append(preview, text, btnRow);
    return host;
  }

  // ── Custom editors ─────────────────────────────────────────────────────
  function renderNavEditor() {
    const host = document.createElement('div');
    const items = state.draft.nav?.items || [];

    function paint() {
      host.innerHTML = '';
      items.forEach((it, i) => {
        const card = document.createElement('div');
        card.className = 'admin-list-item';
        card.innerHTML = `
          <div class="admin-list-item-head">
            <span class="handle">Item ${i + 1}</span>
            <div class="admin-list-item-actions">
              <button class="admin-btn admin-btn-sm" data-act="up"   ${i===0 ? 'disabled' : ''}>↑</button>
              <button class="admin-btn admin-btn-sm" data-act="down" ${i===items.length-1 ? 'disabled' : ''}>↓</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger" data-act="del">Delete</button>
            </div>
          </div>
          <div class="admin-grid-2">
            <div class="admin-field" style="margin-bottom:0">
              <label>Label</label>
              <input class="admin-input" data-field="label" value="${escapeHtml(it.label || '')}" maxlength="60">
            </div>
            <div class="admin-field" style="margin-bottom:0">
              <label>Href</label>
              <input class="admin-input" data-field="href" value="${escapeHtml(it.href || '')}" maxlength="500">
            </div>
          </div>
        `;
        card.querySelectorAll('[data-field]').forEach(inp => {
          inp.addEventListener('input', () => { it[inp.dataset.field] = inp.value; markDirty(); });
        });
        card.querySelector('[data-act=up]').addEventListener('click', () => { items.splice(i-1,0,items.splice(i,1)[0]); markDirty(); paint(); });
        card.querySelector('[data-act=down]').addEventListener('click', () => { items.splice(i+1,0,items.splice(i,1)[0]); markDirty(); paint(); });
        card.querySelector('[data-act=del]').addEventListener('click', () => { items.splice(i,1); markDirty(); paint(); });
        host.appendChild(card);
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'admin-btn admin-btn-sm';
      addBtn.textContent = '+ Add nav item';
      addBtn.addEventListener('click', () => { items.push({ label: 'New', href: '#' }); markDirty(); paint(); });
      host.appendChild(addBtn);
    }
    state.draft.nav = state.draft.nav || { items: [] };
    state.draft.nav.items = items;
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
              <button class="admin-btn admin-btn-sm" data-act="up"   ${i===0 ? 'disabled' : ''}>↑</button>
              <button class="admin-btn admin-btn-sm" data-act="down" ${i===items.length-1 ? 'disabled' : ''}>↓</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger" data-act="del">Delete</button>
            </div>
          </div>
          <div class="admin-field">
            <label>Title</label>
            <input class="admin-input" data-card-field="title" value="${escapeHtml(card.title || '')}" maxlength="200">
          </div>
          <div class="admin-field" style="margin-bottom:8px">
            <label>Bullet points</label>
            <div data-bullets></div>
          </div>
          <button class="admin-btn admin-btn-sm" data-act="add-bullet">+ Add bullet</button>
        `;
        wrap.querySelector('[data-card-field=title]').addEventListener('input', e => { card.title = e.target.value; markDirty(); });
        const bulletsHost = wrap.querySelector('[data-bullets]');
        function paintBullets() {
          bulletsHost.innerHTML = '';
          (card.bullets || []).forEach((b, j) => {
            const row = document.createElement('div');
            row.className = 'admin-bullet-row';
            row.innerHTML = `
              <input class="admin-input" value="${escapeHtml(b)}" maxlength="2000">
              <button class="admin-btn admin-btn-sm admin-btn-ghost" type="button">↑</button>
              <button class="admin-btn admin-btn-sm admin-btn-ghost" type="button">↓</button>
              <button class="admin-btn admin-btn-sm admin-btn-danger" type="button">✕</button>
            `;
            const [inp, up, dn, del] = row.children;
            inp.addEventListener('input', () => { card.bullets[j] = inp.value; markDirty(); });
            up.addEventListener('click', () => { if (j>0) { card.bullets.splice(j-1,0,card.bullets.splice(j,1)[0]); markDirty(); paintBullets(); } });
            dn.addEventListener('click', () => { if (j<card.bullets.length-1) { card.bullets.splice(j+1,0,card.bullets.splice(j,1)[0]); markDirty(); paintBullets(); } });
            del.addEventListener('click', () => { card.bullets.splice(j,1); markDirty(); paintBullets(); });
            bulletsHost.appendChild(row);
          });
        }
        paintBullets();
        wrap.querySelector('[data-act=up]').addEventListener('click', () => { items.splice(i-1,0,items.splice(i,1)[0]); markDirty(); paint(); });
        wrap.querySelector('[data-act=down]').addEventListener('click', () => { items.splice(i+1,0,items.splice(i,1)[0]); markDirty(); paint(); });
        wrap.querySelector('[data-act=del]').addEventListener('click', () => { items.splice(i,1); markDirty(); paint(); });
        wrap.querySelector('[data-act=add-bullet]').addEventListener('click', () => { card.bullets = card.bullets || []; card.bullets.push(''); markDirty(); paintBullets(); });
        host.appendChild(wrap);
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'admin-btn admin-btn-sm';
      addBtn.textContent = '+ Add announcement card';
      addBtn.addEventListener('click', () => { items.push({ title: 'New announcement', bullets: ['…'] }); markDirty(); paint(); });
      host.appendChild(addBtn);
    }
    paint();
    return host;
  }

  function renderScheduleOverrideEditor() {
    const host = document.createElement('div');
    const types = ['none', 'Normal Schedule', 'Advisory', 'Early Release', 'No School'];
    function curType() {
      const o = state.draft.scheduleOverride;
      return o?.type || 'none';
    }
    function paint() {
      const cur = curType();
      host.innerHTML = `
        <div class="admin-field">
          <label>Active override</label>
          <select class="admin-select" id="sched-override-select">
            ${types.map(t => `<option value="${escapeHtml(t)}" ${t===cur?'selected':''}>${t==='none'?'— No override (use data.json) —':escapeHtml(t)}</option>`).join('')}
          </select>
          <div class="admin-field-help">Saved overrides take effect for all users within 30 seconds.</div>
        </div>
        ${state.draft.scheduleOverride ? `<div class="admin-field-help">Set at ${new Date(state.draft.scheduleOverride.timestamp).toLocaleString()}.</div>` : ''}
      `;
      host.querySelector('#sched-override-select').addEventListener('change', (e) => {
        const v = e.target.value;
        state.draft.scheduleOverride = (v === 'none') ? null : { type: v, timestamp: Date.now() };
        markDirty(); paint();
      });
    }
    paint();
    return host;
  }

  function renderAuditLog() {
    const host = document.createElement('div');
    host.innerHTML = '<div class="admin-field-help">Loading…</div>';
    api('/admin/audit-log?limit=200').then(j => {
      if (!j.entries?.length) { host.innerHTML = '<div class="admin-field-help">No events yet.</div>'; return; }
      host.innerHTML = `
        <table class="admin-audit-table">
          <thead><tr><th>When</th><th>IP</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            ${j.entries.map(e => `
              <tr>
                <td>${new Date(e.ts).toLocaleString()}</td>
                <td>${escapeHtml(e.ip || '—')}</td>
                <td class="action">${escapeHtml(e.action)}</td>
                <td>${escapeHtml([e.sections?.join(','), e.section, e.file, e.type].filter(Boolean).join(' · ') || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }).catch(e => { host.innerHTML = `<div class="admin-field-help" style="color:#ff6b6b">${escapeHtml(e.message)}</div>`; });
    return host;
  }

  // ── Tab body render ────────────────────────────────────────────────────
  function renderActiveTab() {
    const tab = SCHEMA.find(t => t.id === state.activeTab) || SCHEMA[0];
    $('#tab-title').textContent = tab.label;
    $('#tab-sub').textContent   = tab.sub;
    const panels = $('#panels');
    panels.innerHTML = '';

    const q = state.search.trim().toLowerCase();
    const matches = (label) => !q || (label || '').toLowerCase().includes(q);

    let anyVisible = false;
    for (const group of tab.groups) {
      const card = document.createElement('section');
      card.className = 'admin-card';
      card.innerHTML = `<h2>${escapeHtml(group.title)}</h2>`;

      if (group.custom === 'navEditor')              { card.appendChild(renderNavEditor()); anyVisible = true; }
      else if (group.custom === 'announcementsEditor'){ card.appendChild(renderAnnouncementsEditor()); anyVisible = true; }
      else if (group.custom === 'scheduleOverrideEditor'){ card.appendChild(renderScheduleOverrideEditor()); anyVisible = true; }
      else if (group.custom === 'auditLog')          { card.appendChild(renderAuditLog()); anyVisible = true; }
      else if (group.fields) {
        const visible = group.fields.filter(f => matches(f.label) || matches(f.path));
        if (!visible.length) continue;
        anyVisible = true;
        for (const f of visible) card.appendChild(renderField(f));
      }
      panels.appendChild(card);
    }
    if (!anyVisible && q) {
      panels.innerHTML = `<div class="admin-card"><div class="admin-field-help">No fields match “${escapeHtml(q)}” on this tab. Other tabs may have matches.</div></div>`;
    }

    refreshDirtyMarkers();
  }

  // ── Dirty / publish ────────────────────────────────────────────────────
  function refreshDirtyMarkers() {
    const dirty = !eq(state.settings, state.draft);
    $('#dirty-pill').classList.toggle('visible', dirty);
    $('#publish-btn').disabled = !dirty;
    $('#discard-btn').disabled = !dirty;
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
      // Compute a top-level patch (only sections that changed)
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
      // Refresh preview if open
      if ($('#preview-host').classList.contains('open')) refreshPreview();
      renderActiveTab();
    } catch (e) {
      toast('Publish failed: ' + e.message, 'error', 6000);
    } finally {
      btn.disabled = false; btn.textContent = 'Publish changes';
    }
  });

  // ── Search ─────────────────────────────────────────────────────────────
  $('#search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    // If query is non-empty, show all tabs but auto-jump to first tab with a match
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
  let previewPage = 'index.html';
  function refreshPreview() {
    const frame = $('#preview-frame');
    // cache-bust to force a fresh fetch of /site-settings
    frame.src = previewPage + '?_preview=' + Date.now();
  }
  $('#open-preview-btn').addEventListener('click', () => {
    $('#preview-host').classList.add('open');
    $('#preview-mode-label').textContent = 'Live (latest published)';
    refreshPreview();
  });
  $('#preview-close-btn').addEventListener('click', () => { $('#preview-host').classList.remove('open'); });
  $('#preview-refresh-btn').addEventListener('click', refreshPreview);
  $$('#preview-host [data-preview-page]').forEach(b => b.addEventListener('click', () => { previewPage = b.dataset.previewPage; refreshPreview(); }));

  // ── Init ───────────────────────────────────────────────────────────────
  if (state.token) bootApp(); else showLogin();
})();
