/* ==========================================================================
   PHS Schedule — Purple Liquid Glass Design (Render Logic)
   ========================================================================== */

let data;
let goal = 24420;
let period = "";
let myArray = [];
let periodStartTime = 0;
let periodEndTime = 0;
let scheduleType = "";
let isBeforeSchool = false;
let isTransition = false;
let isTimerInactive = false;
let _overrideInterval = null;

/* --- Admin time override (localhost only) --- */
let _timeOffsetSeconds = 0; // added to real time
let _devScheduleType = null;

/* --- Schedule override (set by admin panel, synced from backend) --- */
let _scheduleOverride = null; // { type: string, timestamp: number } | null
let _clockTimerId = null;
let _clockTickMs = 0;

const ACTIVE_CLOCK_MS = 1000;
const IDLE_CLOCK_MS = 60000;
const OVERRIDE_FETCH_TIMEOUT_MS = 1500;
const SCHEDULE_DATA_CACHE_KEY = 'phs:schedule-data:v1';
const SCHEDULE_DATA_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const GRADEVIEWER_DEFAULT_LOCAL_URL = 'http://localhost:3001/login';
const GRADEVIEWER_DEFAULT_PROD_URL = 'https://schedulephs.web.app/login';

const _BACKEND_URL = ['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(location.hostname)
  ? location.origin
  : 'https://phs-grades-backend.onrender.com';
const _IS_ADMIN_PREVIEW = new URLSearchParams(location.search).has('_preview');

let _siteView = 'schedule';
let _siteViewScroll = { schedule: 0, grades: 0 };
let _gradesFrame = null;
let _gradesScaler = null;
let _gradesFrameUrlLocked = false;
let _gradesFrameApplyToken = 0;
let _gradesFrameSizeRaf = 0;
let _gradesFrameBridgeReady = false;
let _gradesIsFullscreen = false;
let _gradesSavedFrameCss = '';
let _gradesSavedScalerCss = '';
const _gradesSavedTransforms = [];

async function _pollScheduleOverride() {
  if (_IS_ADMIN_PREVIEW && window.__SITE_SETTINGS__) {
    _scheduleOverride = window.__SITE_SETTINGS__.scheduleOverride || null;
    return;
  }
  const previousOverride = JSON.stringify(_scheduleOverride);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OVERRIDE_FETCH_TIMEOUT_MS);
    const res = await fetch(`${_BACKEND_URL}/schedule-override`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeout);
    const json = await res.json();
    _scheduleOverride = json.override || null;
    if (_scheduleOverride) {
      localStorage.setItem('phs_schedule_override', JSON.stringify(_scheduleOverride));
    } else {
      localStorage.removeItem('phs_schedule_override');
    }
  } catch (e) {
    // Fallback to localStorage when offline
    const stored = localStorage.getItem('phs_schedule_override');
    _scheduleOverride = stored ? JSON.parse(stored) : null;
  }
  if (data && previousOverride !== JSON.stringify(_scheduleOverride)) updateAll();
}

function _getOverrideData(targetType) {
  if (!data) return null;
  for (const key of Object.keys(data)) {
    if (key !== 'base' && Array.isArray(data[key]) && data[key][0] === targetType) {
      return data[key];
    }
  }
  return null;
}

function _todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _overrideAppliesToday(override) {
  return !override?.date || override.date === _todayISODate();
}

function _applySettingsScheduleOverride(settings) {
  if (!settings || typeof settings !== 'object') return;
  const previousOverride = JSON.stringify(_scheduleOverride);
  _scheduleOverride = settings.scheduleOverride || null;
  if (data && previousOverride !== JSON.stringify(_scheduleOverride)) updateAll();
}

function _isLocalhost() {
  return ['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(location.hostname);
}

function _clockSeconds(date = new Date()) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + 37 + _timeOffsetSeconds;
}

function _isNonInstructionalSchedule(type) {
  return /\b(no school|holiday|closure|closed)\b/i.test(String(type || ''));
}

function _resetTimerState() {
  goal = 0;
  period = "";
  myArray = [];
  periodStartTime = 0;
  periodEndTime = 0;
  isBeforeSchool = false;
  isTransition = false;
  isTimerInactive = true;
}

function _setClockCadence(active) {
  const nextMs = active ? ACTIVE_CLOCK_MS : IDLE_CLOCK_MS;
  if (_clockTimerId && _clockTickMs === nextMs) return;
  if (_clockTimerId) clearInterval(_clockTimerId);
  _clockTickMs = nextMs;
  _clockTimerId = setInterval(updateAll, nextMs);
}

function _setTimerSurfaceVisible(visible) {
  const ringWrap = document.querySelector('.ring-wrap');
  if (!ringWrap) return;
  ringWrap.hidden = !visible;
  ringWrap.style.display = visible ? '' : 'none';
  ringWrap.setAttribute('aria-hidden', String(!visible));
  const hero = document.querySelector('.hero');
  if (hero) hero.classList.toggle('hero--compact', !visible);
}

function _clearCountdownDisplay() {
  if (_hmEl) _hmEl.textContent = '';
  if (_sEl) _sEl.textContent = '';
  _lastHm = '';
  _lastS = '';
}

function _prepareCountdownDisplay() {
  if (_hmEl) {
    Array.from(_hmEl.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .forEach(n => n.remove());
    if (!_hmEl.querySelector('.cd-min-label')) {
      const label = document.createElement('span');
      label.className = 'cd-min-label';
      label.textContent = 'm';
      _hmEl.appendChild(label);
    }
  }
  if (_sEl) _sEl.textContent = '';
  _lastHm = '';
  _lastS = '';
}

function _readScheduleDataCache() {
  try {
    const raw = sessionStorage.getItem(SCHEDULE_DATA_CACHE_KEY) || localStorage.getItem(SCHEDULE_DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') return null;
    if (Date.now() - Number(parsed.ts || 0) > SCHEDULE_DATA_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function _writeScheduleDataCache(nextData) {
  try {
    const payload = JSON.stringify({ ts: Date.now(), data: nextData });
    sessionStorage.setItem(SCHEDULE_DATA_CACHE_KEY, payload);
    localStorage.setItem(SCHEDULE_DATA_CACHE_KEY, payload);
  } catch {}
}

function _timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    try { return AbortSignal.timeout(ms); } catch {}
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function _localGradeMelonAvailable() {
  try {
    const res = await fetch('/local-grade-melon-status', { cache: 'no-store', signal: _timeoutSignal(1500) });
    const json = await res.json();
    return Boolean(json.available);
  } catch {
    return false;
  }
}

function _urlsEqual(a, b) {
  try { return new URL(a, location.href).href === new URL(b, location.href).href; }
  catch { return a === b; }
}

function _navHrefKind(href) {
  if (!href) return '';
  try {
    const url = new URL(href, location.href);
    const path = url.pathname;
    if (/\/(?:gradeviewer|grademelon)\.html?$/i.test(path)) return 'grades';
    if (/\/index\.html?$/i.test(path) || path.endsWith('/')) return 'schedule';
  } catch {
    if (/gradeviewer\.html?|grademelon\.html?/i.test(href)) return 'grades';
    if (/index\.html?/i.test(href) || href === '/') return 'schedule';
  }
  return '';
}

function _viewFromLocation() {
  return _navHrefKind(location.pathname) === 'grades' ? 'grades' : 'schedule';
}

function _routeForView(view) {
  return view === 'grades' ? 'gradeviewer.html' : 'index.html';
}

function _urlForView(view) {
  const url = new URL(location.href);
  const parts = url.pathname.split('/');
  parts[parts.length - 1] = _routeForView(view);
  url.pathname = parts.join('/');
  url.search = '';
  url.hash = '';
  return url.href;
}

function _updateNavActive(view = _siteView) {
  const wrap = document.getElementById('nav-links');
  if (!wrap) return;
  wrap.setAttribute('data-page', view);
  wrap.querySelectorAll('a').forEach(link => {
    const kind = _navHrefKind(link.getAttribute('href'));
    link.classList.toggle('active', kind === view);
  });
}

function _showSiteView(view, opts = {}) {
  const nextView = view === 'grades' ? 'grades' : 'schedule';
  if (_siteView && _siteView !== nextView) _siteViewScroll[_siteView] = window.scrollY || 0;
  _siteView = nextView;

  document.body.classList.toggle('site-view-schedule', nextView === 'schedule');
  document.body.classList.toggle('site-view-grades', nextView === 'grades');
  document.querySelectorAll('[data-site-view]').forEach(el => {
    const visible = el.getAttribute('data-site-view') === nextView;
    el.hidden = !visible;
    el.setAttribute('aria-hidden', String(!visible));
  });
  _updateNavActive(nextView);

  if (!opts.skipHistory) {
    const method = opts.replace ? 'replaceState' : 'pushState';
    if (_viewFromLocation() !== nextView || opts.replace) {
      history[method]({ siteView: nextView }, '', _urlForView(nextView));
    } else {
      history.replaceState({ siteView: nextView }, '', location.href);
    }
  }

  if (nextView === 'grades') {
    document.title = 'Grades - PHS';
    _ensureGradesFrame();
  } else if (data) {
    updateAll();
  }

  if (opts.restoreScroll !== false) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: _siteViewScroll[nextView] || 0, left: 0, behavior: 'auto' });
      if (nextView === 'grades') _scheduleGradesFrameSize();
    });
  }
}

function _initKeepAliveTabs() {
  if (!document.getElementById('grades-view')) return;
  _siteView = _viewFromLocation();
  _showSiteView(_siteView, { replace: true, restoreScroll: false });

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('#nav-links a');
    if (!link || (link.target && link.target !== '_self')) return;
    const kind = _navHrefKind(link.getAttribute('href'));
    if (kind !== 'schedule' && kind !== 'grades') return;
    event.preventDefault();
    _showSiteView(kind);
  });

  window.addEventListener('popstate', () => {
    _showSiteView(_viewFromLocation(), { skipHistory: true });
  });

  document.addEventListener('site-settings:applied', () => {
    requestAnimationFrame(() => _updateNavActive(_siteView));
  });
}

function _ensureGradesFrame() {
  _gradesFrame = _gradesFrame || document.getElementById('grades-frame');
  _gradesScaler = _gradesScaler || document.getElementById('grades-scaler');
  if (!_gradesFrame || !_gradesScaler) return;
  if (!_gradesFrameBridgeReady) _initGradesFrameBridge();
  _applyGradesFrameUrl(window.__SITE_SETTINGS__ || {});
  _scheduleGradesFrameSize();
}

async function _applyGradesFrameUrl(settings) {
  if (_gradesFrameUrlLocked || !_gradesFrame) return;
  const token = ++_gradesFrameApplyToken;
  const localUrl = settings?.grades?.iframeUrlLocal || (_isLocalhost() ? GRADEVIEWER_DEFAULT_LOCAL_URL : '');
  const prodUrl = settings?.grades?.iframeUrlProd || GRADEVIEWER_DEFAULT_PROD_URL;
  let url = _isLocalhost() ? localUrl : prodUrl;
  if (_isLocalhost() && (!localUrl || !(await _localGradeMelonAvailable()))) url = prodUrl;
  if (token !== _gradesFrameApplyToken || _gradesFrameUrlLocked) return;
  if (url && !_urlsEqual(_gradesFrame.src, url)) {
    _gradesFrame.src = url;
    _gradesFrameUrlLocked = true;
  }
}

function _scheduleGradesFrameSize() {
  if (!_gradesScaler || !_gradesFrame || _gradesIsFullscreen) return;
  if (_gradesFrameSizeRaf) return;
  _gradesFrameSizeRaf = requestAnimationFrame(() => {
    _gradesFrameSizeRaf = 0;
    _setGradesFrameSize();
  });
}

function _setGradesFrameSize() {
  if (!_gradesScaler || !_gradesFrame || _gradesIsFullscreen) return;
  const w = _gradesScaler.offsetWidth;
  if (!w) return;
  const top = _gradesScaler.getBoundingClientRect().top;
  const h = Math.max(720, window.innerHeight - top - 24);
  _gradesFrame.style.width = w + 'px';
  _gradesFrame.style.height = h + 'px';
  _gradesScaler.style.height = h + 'px';
}

function _isAllowedGradesOrigin(origin) {
  if (!_gradesFrame) return false;
  try {
    if (origin === new URL(_gradesFrame.src, location.href).origin) return true;
  } catch {}
  const settings = window.__SITE_SETTINGS__ || {};
  const list = [
    settings?.grades?.iframeUrlLocal,
    settings?.grades?.iframeUrlProd,
    GRADEVIEWER_DEFAULT_LOCAL_URL,
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    GRADEVIEWER_DEFAULT_PROD_URL
  ];
  return list.some(url => {
    try { return url && new URL(url).origin === origin; }
    catch { return false; }
  });
}

function _readAppearanceForGrades() {
  try {
    const raw = JSON.parse(localStorage.getItem('phs:appearance:v2') || '{}');
    const isHex = value => /^#[0-9a-fA-F]{6}$/.test(String(value || ''));
    const colors = Array.isArray(raw.colors) ? raw.colors.filter(isHex).slice(0, 5).map(color => color.toUpperCase()) : [];
    while (colors.length < 2) colors.push(colors[0] || '#8288D5');
    const requestedAccent = isHex(raw.accent) ? String(raw.accent).toUpperCase() : colors[0];
    return { ...raw, colors, accent: colors.includes(requestedAccent) ? requestedAccent : colors[0] };
  } catch {
    return {};
  }
}

function _gradesFrameTargetOrigin() {
  if (!_gradesFrame) return null;
  try { return new URL(_gradesFrame.src, location.href).origin; }
  catch { return null; }
}

function _postThemeToGradesFrame() {
  if (!_gradesFrame?.contentWindow) return;
  const targetOrigin = _gradesFrameTargetOrigin();
  if (!targetOrigin || targetOrigin === 'null') return;
  try {
    _gradesFrame.contentWindow.postMessage({ type: 'phs:appearance-settings', settings: _readAppearanceForGrades() }, targetOrigin);
  } catch {}
}

function _initGradesFrameBridge() {
  if (!_gradesFrame || !_gradesScaler) return;
  _gradesFrameBridgeReady = true;

  if ('ResizeObserver' in window) new ResizeObserver(_scheduleGradesFrameSize).observe(_gradesScaler);
  window.addEventListener('resize', _scheduleGradesFrameSize, { passive: true });

  window.addEventListener('message', event => {
    if (event.source !== _gradesFrame.contentWindow) return;
    if (!_isAllowedGradesOrigin(event.origin)) return;
    if (event.data?.type === 'gradeviewer:privacy-modal') {
      document.body.classList.toggle('privacy-modal-open', Boolean(event.data.open));
    }
    if (event.data?.type === 'modalOpen') _goGradesFullscreen();
    if (event.data?.type === 'modalClose') _exitGradesFullscreen();
    if (event.data?.type === 'gradeviewer:theme-ready') _postThemeToGradesFrame();
  });

  window.addEventListener('storage', event => {
    if (event.key === 'phs:appearance:v2') _postThemeToGradesFrame();
  });
  document.addEventListener('phs:appearance-storage-sync', _postThemeToGradesFrame);
  _gradesFrame.addEventListener('load', () => {
    setTimeout(_postThemeToGradesFrame, 100);
    _scheduleGradesFrameSize();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && _gradesIsFullscreen) _exitGradesFullscreen();
  });
}

function _goGradesFullscreen() {
  if (_gradesIsFullscreen || !_gradesFrame || !_gradesScaler) return;
  _gradesIsFullscreen = true;
  _gradesSavedFrameCss = _gradesFrame.style.cssText;
  _gradesSavedScalerCss = _gradesScaler.style.cssText;
  let el = _gradesFrame.parentElement;
  while (el && el !== document.body) {
    _gradesSavedTransforms.push({ el, transform: el.style.transform, willChange: el.style.willChange, animation: el.style.animation, opacity: el.style.opacity });
    el.style.transform = 'none';
    el.style.willChange = 'auto';
    el.style.animation = 'none';
    el.style.opacity = '1';
    el = el.parentElement;
  }
  document.body.classList.add('gradeviewer-modal-open');
  _gradesScaler.classList.add('is-modal-fullscreen');
  _gradesFrame.style.cssText = _gradesSavedFrameCss + ';width:100vw;height:100vh;border-radius:0;background:transparent';
  document.body.style.overflow = 'hidden';
}

function _exitGradesFullscreen() {
  if (!_gradesIsFullscreen || !_gradesFrame || !_gradesScaler) return;
  _gradesIsFullscreen = false;
  document.body.classList.remove('gradeviewer-modal-open');
  document.body.style.overflow = '';
  _gradesScaler.classList.remove('is-modal-fullscreen');
  _gradesScaler.style.cssText = _gradesSavedScalerCss;
  _gradesFrame.style.cssText = _gradesSavedFrameCss;
  _gradesSavedScalerCss = '';
  _gradesSavedFrameCss = '';
  _gradesSavedTransforms.forEach(saved => {
    saved.el.style.transform = saved.transform;
    saved.el.style.willChange = saved.willChange;
    saved.el.style.animation = saved.animation;
    saved.el.style.opacity = saved.opacity;
  });
  _gradesSavedTransforms.length = 0;
  _setGradesFrameSize();
}

function _setAdminStatus(text) {
  const status = document.getElementById('admin-status');
  if (status) status.textContent = text;
}

function _initAdminPanel() {
  if (!_isLocalhost()) return;
  if (!location.pathname.endsWith('index.html') && location.pathname !== '/' && !location.pathname.endsWith('/')) return;

  const panel = document.createElement('div');
  panel.id = 'admin-panel';
  panel.innerHTML = `
    <div class="admin-header">
      <span class="admin-dot"></span>
      <span>Dev Clock</span>
      <button type="button" class="admin-collapse-btn" id="admin-collapse">▾</button>
    </div>
    <div class="admin-body" id="admin-body">
      <div class="admin-time-row">
        <div class="admin-field">
          <input type="number" id="admin-h" class="admin-seg" min="1" max="12" placeholder="12">
          <span class="admin-seg-label">h</span>
        </div>
        <div class="admin-field">
          <input type="number" id="admin-m" class="admin-seg" min="0" max="59" placeholder="00">
          <span class="admin-seg-label">m</span>
        </div>
        <div class="admin-field">
          <input type="number" id="admin-s" class="admin-seg" min="0" max="59" placeholder="00">
          <span class="admin-seg-label">s</span>
        </div>
        <button type="button" id="admin-ampm" class="admin-ampm-btn">AM</button>
      </div>
      <div class="admin-actions">
        <button type="button" id="admin-apply" class="admin-btn admin-btn--apply">Apply</button>
        <button type="button" id="admin-reset" class="admin-btn admin-btn--reset">Reset</button>
      </div>
      <div class="admin-schedule">
        <label class="admin-select-label" for="admin-schedule-type">Schedule</label>
        <select id="admin-schedule-type" class="admin-select">
          <option value="">Auto / today</option>
          <option value="Normal Schedule">Force Normal</option>
          <option value="No School">Force No School</option>
          <option value="Early Release">Force Early Release</option>
          <option value="Advisory">Force Advisory</option>
        </select>
      </div>
      <div class="admin-status" id="admin-status">Real time</div>
    </div>
  `;
  document.body.appendChild(panel);

  let collapsed = false;
  document.getElementById('admin-collapse').addEventListener('click', () => {
    collapsed = !collapsed;
    document.getElementById('admin-body').style.display = collapsed ? 'none' : 'flex';
    document.getElementById('admin-collapse').textContent = collapsed ? '▸' : '▾';
  });

  const ampmBtn = document.getElementById('admin-ampm');
  ampmBtn.addEventListener('click', () => {
    ampmBtn.textContent = ampmBtn.textContent === 'AM' ? 'PM' : 'AM';
    ampmBtn.classList.toggle('admin-ampm-btn--pm', ampmBtn.textContent === 'PM');
  });

  document.getElementById('admin-apply').addEventListener('click', () => {
    let h = parseInt(document.getElementById('admin-h').value) || 12;
    const m = parseInt(document.getElementById('admin-m').value) || 0;
    const s = parseInt(document.getElementById('admin-s').value) || 0;
    const isPM = ampmBtn.textContent === 'PM';
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    const targetSec = h * 3600 + m * 60 + s;
    const now = new Date();
    const realSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    _timeOffsetSeconds = targetSec - realSec;
    const pad = (n) => String(n).padStart(2, '0');
    const dispH = parseInt(document.getElementById('admin-h').value) || 12;
    document.getElementById('admin-status').textContent = `Set → ${dispH}:${pad(m)}:${pad(s)} ${ampmBtn.textContent}`;
    updateAll();
  });

  document.getElementById('admin-reset').addEventListener('click', () => {
    _timeOffsetSeconds = 0;
    _devScheduleType = null;
    document.getElementById('admin-h').value = '';
    document.getElementById('admin-m').value = '';
    document.getElementById('admin-s').value = '';
    document.getElementById('admin-schedule-type').value = '';
    document.getElementById('admin-status').textContent = 'Real time';
    updateAll();
  });

  document.getElementById('admin-schedule-type').addEventListener('change', (event) => {
    _devScheduleType = event.target.value || null;
    _setAdminStatus(_devScheduleType ? `Testing ${_devScheduleType}` : 'Auto schedule');
    updateAll();
  });
}

/* --- Cache DOM refs --- */
let _hmEl, _sEl, _heroTitle, _heroEyebrow;
let _signatureTitle, _signatureEyebrow;
let _ringFill, _statusPill, _statusLabel, _schedTitle, _schedDate, _periodList;
let _lastHm = '', _lastS = '', _lastPeriodCount = -1;
let _lastSignedTitle = '', _lastSignedEyebrow = '';
let _signatureFontPromise = null;
let _signatureId = 0;

function getSignatureFont() {
  if (_signatureFontPromise) return _signatureFontPromise;
  if (!window.opentype) return Promise.reject(new Error('opentype.js did not load'));

  _signatureFontPromise = new Promise((resolve, reject) => {
    opentype.load('assets/fonts/AlexBrush-Regular.ttf', (err, font) => {
      if (err || !font) reject(err || new Error('Signature font did not load'));
      else resolve(font);
    });
  });
  return _signatureFontPromise;
}

function smootherStep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function updateHeroSignatureLayout() {
  const wrapper = document.querySelector('.hero-title-wrapper');
  if (!wrapper) return;

  const hasEyebrow = Boolean(_signatureEyebrow?.classList.contains('is-visible') || _signatureEyebrow?.dataset.pendingSignatureText);
  const hasTitle = Boolean(_signatureTitle?.classList.contains('is-visible') || _signatureTitle?.dataset.pendingSignatureText);
  const visibleCount = Number(hasEyebrow) + Number(hasTitle);

  wrapper.classList.toggle('signature-ready', visibleCount > 0);
  wrapper.classList.toggle('signature-single', visibleCount === 1);
  wrapper.classList.toggle('signature-double', visibleCount === 2);
}

function setHeroLine(line, text, visible, options = {}) {
  const isEyebrow = line === 'eyebrow';
  const fallback = isEyebrow ? _heroEyebrow : _heroTitle;
  const stage = isEyebrow ? _signatureEyebrow : _signatureTitle;

  if (!fallback) return;

  fallback.textContent = text;
  fallback.style.display = visible ? 'block' : 'none';

  if (!stage) return;
  if (!visible) {
    delete stage.dataset.pendingSignatureText;
    stage.classList.remove('is-visible');
    stage.innerHTML = '';
    if (isEyebrow) _lastSignedEyebrow = '';
    else _lastSignedTitle = '';
    updateHeroSignatureLayout();
    return;
  }

  const currentText = isEyebrow ? _lastSignedEyebrow : _lastSignedTitle;
  if (currentText === text && stage.classList.contains('is-visible')) return;

  if (isEyebrow) _lastSignedEyebrow = text;
  else _lastSignedTitle = text;

  stage.dataset.pendingSignatureText = text;
  updateHeroSignatureLayout();

  signHeroText(stage, text, options).catch((error) => {
    console.warn('Signature renderer fallback:', error);
    stage.classList.remove('is-visible');
    stage.innerHTML = '';
    updateHeroSignatureLayout();
  });
}

async function signHeroText(target, text, options = {}) {
  const phrase = String(text || '').trim();
  if (!target || !phrase) return;

  target.dataset.pendingSignatureText = phrase;
  const font = await getSignatureFont();
  if (target.dataset.pendingSignatureText !== phrase) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fontSize = options.fontSize || 128;
  const scale = fontSize / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(phrase);
  const glyphPaths = [];
  let penX = 0;
  let previousGlyph = null;

  for (const glyph of glyphs) {
    if (previousGlyph) penX += font.getKerningValue(previousGlyph, glyph) * scale;
    const path = glyph.getPath(penX, 0, fontSize);
    if (path.commands.length > 0) {
      glyphPaths.push(path);
    }
    penX += glyph.advanceWidth * scale;
    previousGlyph = glyph;
  }

  if (!glyphPaths.length) return;

  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  glyphPaths.forEach((path) => {
    const box = path.getBoundingBox();
    x1 = Math.min(x1, box.x1);
    y1 = Math.min(y1, box.y1);
    x2 = Math.max(x2, box.x2);
    y2 = Math.max(y2, box.y2);
  });

  const padX = fontSize * 0.28;
  const padTop = fontSize * 0.72;
  const padBottom = fontSize * 0.38;
  const viewX = x1 - padX;
  const viewY = y1 - padTop;
  const viewW = (x2 - x1) + padX * 2;
  const viewH = (y2 - y1) + padTop + padBottom;
  const viewBox = `${viewX} ${viewY} ${viewW} ${viewH}`;
  const ns = 'http://www.w3.org/2000/svg';
  const runId = ++_signatureId;
  const maskId = `signature-mask-${runId}`;
  const gradId = `signature-brush-${runId}`;

  if (target._signatureRaf) cancelAnimationFrame(target._signatureRaf);
  target.innerHTML = '';
  target.dataset.signatureText = phrase;
  delete target.dataset.pendingSignatureText;
  target.classList.add('is-visible');
  updateHeroSignatureLayout();

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'presentation');

  const defs = document.createElementNS(ns, 'defs');
  const gradient = document.createElementNS(ns, 'linearGradient');
  gradient.setAttribute('id', gradId);
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('x2', '100%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('y2', '0%');

  [
    ['0%', 'white', '1'],
    ['72%', 'white', '1'],
    ['100%', 'white', '0']
  ].forEach(([offset, color, opacity]) => {
    const stop = document.createElementNS(ns, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    stop.setAttribute('stop-opacity', opacity);
    gradient.appendChild(stop);
  });
  defs.appendChild(gradient);

  const mask = document.createElementNS(ns, 'mask');
  mask.setAttribute('id', maskId);
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('x', String(viewX));
  mask.setAttribute('y', String(viewY));
  mask.setAttribute('width', String(viewW));
  mask.setAttribute('height', String(viewH));

  const maskBg = document.createElementNS(ns, 'rect');
  maskBg.setAttribute('x', String(viewX));
  maskBg.setAttribute('y', String(viewY));
  maskBg.setAttribute('width', String(viewW));
  maskBg.setAttribute('height', String(viewH));
  maskBg.setAttribute('fill', 'black');
  mask.appendChild(maskBg);

  const brushWidth = viewW * 0.34;
  const brush = document.createElementNS(ns, 'rect');
  brush.setAttribute('x', String(viewX));
  brush.setAttribute('y', String(viewY));
  brush.setAttribute('width', '0');
  brush.setAttribute('height', String(viewH));
  brush.setAttribute('fill', `url(#${gradId})`);
  mask.appendChild(brush);

  const fillGroup = document.createElementNS(ns, 'g');
  fillGroup.setAttribute('mask', `url(#${maskId})`);
  const glintGroup = document.createElementNS(ns, 'g');

  glyphPaths.forEach((path) => {
    const d = path.toPathData(2);

    const fillPath = document.createElementNS(ns, 'path');
    fillPath.setAttribute('d', d);
    fillPath.setAttribute('class', 'signature-fill');
    fillGroup.appendChild(fillPath);

    const glintPath = document.createElementNS(ns, 'path');
    glintPath.setAttribute('d', d);
    glintPath.setAttribute('class', 'signature-glint');
    glintGroup.appendChild(glintPath);
  });

  defs.appendChild(mask);
  svg.appendChild(defs);
  svg.appendChild(fillGroup);
  svg.appendChild(glintGroup);
  target.appendChild(svg);

  const glintWidth = viewW * 0.08;
  const glintClipId = `signature-glint-clip-${runId}`;
  const clipPath = document.createElementNS(ns, 'clipPath');
  clipPath.setAttribute('id', glintClipId);
  clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const glintRect = document.createElementNS(ns, 'rect');
  glintRect.setAttribute('x', String(viewX - glintWidth));
  glintRect.setAttribute('y', String(viewY));
  glintRect.setAttribute('width', String(glintWidth));
  glintRect.setAttribute('height', String(viewH));
  clipPath.appendChild(glintRect);
  defs.appendChild(clipPath);
  glintGroup.setAttribute('clip-path', `url(#${glintClipId})`);

  const totalDuration = Math.min(1750, Math.max(950, viewW * 1.18));

  if (reduceMotion) {
    brush.setAttribute('width', String(viewW + brushWidth));
    glintGroup.style.opacity = '0';
    return;
  }

  const startTime = performance.now();
  const animate = (now) => {
    const elapsed = now - startTime;
    const progress = smootherStep(elapsed / totalDuration);
    const brushReach = Math.max(0, (viewW + brushWidth) * progress);
    const glintX = viewX - glintWidth + (viewW + glintWidth) * Math.min(1, Math.max(0, (elapsed - 120) / (totalDuration * 0.86)));

    brush.setAttribute('width', String(brushReach));
    glintRect.setAttribute('x', String(glintX));
    glintGroup.style.opacity = String(Math.sin(Math.min(1, elapsed / totalDuration) * Math.PI) * 0.58);

    if (elapsed < totalDuration) {
      target._signatureRaf = requestAnimationFrame(animate);
    } else {
      brush.setAttribute('width', String(viewW + brushWidth));
      glintGroup.style.opacity = '0';
    }
  };

  target._signatureRaf = requestAnimationFrame(animate);
  setTimeout(() => {
    if (target.dataset.signatureText !== phrase) return;
    brush.setAttribute('width', String(viewW + brushWidth));
    glintGroup.style.opacity = '0';
  }, totalDuration + 350);
}

async function main() {
  try {
    _hmEl = document.getElementById('cd-hm');
    _sEl = document.getElementById('cd-s');
    _heroTitle = document.getElementById('hero-title');
    _heroEyebrow = document.querySelector('.hero-eyebrow');
    _signatureTitle = document.getElementById('signature-title');
    _signatureEyebrow = document.getElementById('signature-eyebrow');
    _ringFill = document.getElementById('ring-fill');
    _statusPill = document.getElementById('status-pill');
    _statusLabel = document.getElementById('status-label');
    _schedTitle = document.getElementById('schedule-title');
    _schedDate = document.getElementById('schedule-date');
    _periodList = document.getElementById('period-list');

    const isSchedulePage = Boolean(_hmEl && _sEl && _ringFill && _schedTitle && _periodList);
    if (!isSchedulePage) return;

    _initKeepAliveTabs();
    _prepareCountdownDisplay();

    const cachedData = _readScheduleDataCache();
    if (cachedData) {
      data = cachedData;
      updateAll();
    }

    try {
      const response = await fetch('data.json');
      const freshData = await response.json();
      if (freshData && typeof freshData === 'object') {
        data = freshData;
        _writeScheduleDataCache(freshData);
      }
    } catch (fetchError) {
      if (!data) throw fetchError;
      console.warn('Using cached schedule data:', fetchError);
    }

    _initAdminPanel();
    await _pollScheduleOverride();
    _overrideInterval = setInterval(() => {
      if (!_IS_ADMIN_PREVIEW && document.visibilityState === 'visible') _pollScheduleOverride();
    }, 30000); // re-check every 30 s while visible
    updateAll();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!_IS_ADMIN_PREVIEW) _pollScheduleOverride();
        updateAll();
      }
    });
  } catch (e) {
    console.error("Initialization failed:", e);
  }
}

/* --------------------------------------------------------------------------
   Original logic — preserved exactly
   -------------------------------------------------------------------------- */

const proccessTime = function (time) {
  let displayTime = time;
  if (Math.floor(displayTime / 3600) > 12) { displayTime -= 43200; }
  let h = Math.floor(displayTime / 3600);
  let m = Math.floor((displayTime / 60)) % 60;
  return `${h}:${m < 10 ? "0" : ""}${m}`;
}

function calculateGoal() {
  if (!data) return;
  const date = new Date();
  let str = `${date.getMonth() + 1}/${date.getDate()}`;
  let val = _clockSeconds(date);
  if (!(str in data)) { str = "base"; }

  let arr = data[str];
  const effectiveOverride = _devScheduleType
    ? { type: _devScheduleType }
    : (_scheduleOverride && _scheduleOverride.type && _overrideAppliesToday(_scheduleOverride) ? _scheduleOverride : null);

  // Apply local dev or admin schedule override if one is active
  if (effectiveOverride) {
    const overrideArr = _getOverrideData(effectiveOverride.type);
    if (overrideArr) arr = overrideArr;
    else if (window.__SITE_SETTINGS__?.bellSchedules?.[effectiveOverride.type]) {
      arr = [effectiveOverride.type, window.__SITE_SETTINGS__.bellSchedules[effectiveOverride.type]];
    } else if (_isNonInstructionalSchedule(effectiveOverride.type)) {
      arr = [effectiveOverride.type, {}];
    }
  }
  scheduleType = arr[0];
  let periods = arr[1];
  if (_isNonInstructionalSchedule(scheduleType)) {
    _resetTimerState();
    return;
  }
  // Admin-controlled bell-schedule template overrides for this type, if non-empty.
  const _bs = (window.__SITE_SETTINGS__ && window.__SITE_SETTINGS__.bellSchedules) || null;
  if (_bs && _bs[scheduleType] && Object.keys(_bs[scheduleType]).length) {
    periods = _bs[scheduleType];
  }
  let largestUnder = -1;
  let largest = -1;
  myArray = [];
  isTimerInactive = false;

  let schoolStart = 10000000;
  for (let k in periods) {
    let key = parseInt(k);
    if (key < schoolStart) schoolStart = key;
    myArray.push({
      name: periods[key][1],
      startSec: key,
      endSec: periods[key][0],
      timeStr: proccessTime(key) + " \u2192 " + proccessTime(periods[key][0])
    });
    if (key <= val && key > largestUnder) largestUnder = key;
    if (key > largest) largest = key;
  }

  isBeforeSchool = false;
  isTransition = false;

  if (largestUnder == -1) {
    goal = schoolStart;
    period = "Before School";
    periodStartTime = 0;
    periodEndTime = schoolStart;
    isBeforeSchool = true;
  } else if (periods[largestUnder][0] - val <= 0 && largestUnder != largest) {
    for (let k in periods) {
      let key = parseInt(k);
      if (key > largestUnder) { goal = key; break; }
    }
    period = "Transition";
    periodStartTime = periods[largestUnder][0];
    periodEndTime = goal;
    isTransition = true;
  } else {
    period = periods[largestUnder][1];
    goal = periods[largestUnder][0];
    periodStartTime = largestUnder;
    periodEndTime = periods[largestUnder][0];
  }
}

/* --------------------------------------------------------------------------
   Render layer
   -------------------------------------------------------------------------- */

function updateAll() {
  if (!data) return;
  calculateGoal();

  const date = new Date();
  let val = _clockSeconds(date);
  let timeleft = Math.max(0, goal - val);

  let h = Math.floor(timeleft / 3600);
  let m = Math.floor((timeleft % 3600) / 60);
  let s = timeleft % 60;

  /* --- Timer terminal states --- */
  const noSchool = _isNonInstructionalSchedule(scheduleType);
  const dayIsOver = !noSchool && (timeleft <= 0 && !isBeforeSchool);
  isTimerInactive = noSchool || dayIsOver;

  if (isTimerInactive) {
    h = 0; m = 0; s = 0;
    _clearCountdownDisplay();
  }
  _setTimerSurfaceVisible(!isTimerInactive);

  /* --- Countdown --- */
  if (_hmEl && !isTimerInactive) {
    const u = (t) => `<span class="cd-min-label">${t}</span>`;
    const hm = h > 0
      ? `${h}${u('h')}${m > 0 ? (m < 10 ? '&nbsp;' : '') + m + u('m') : ''}`
      : `${m}${u('m')}`;
    if (hm !== _lastHm) { _hmEl.innerHTML = hm; _lastHm = hm; }

    const ss = String(s).padStart(2, '0');
    if (ss !== _lastS && _sEl) {
      _sEl.innerHTML = `${ss}<span class="cd-sec-label" style="margin-left:3px">s</span>`;
      _lastS = ss;
    }
  }

  if (_siteView !== 'grades') {
    document.title = isTimerInactive
      ? `${noSchool ? scheduleType : 'Done'} | PHS`
      : (h === 0
        ? `${m}:${String(s).padStart(2, '0')} PHS`
        : `${h}:${String(m).padStart(2, '0')} PHS`);
  }

  /* --- Hero text & Status --- */
  if (_heroTitle && _heroEyebrow && _statusPill && _statusLabel) {
    if (noSchool) {
      setHeroLine('eyebrow', '', false);
      setHeroLine('title', 'No School', true, { fontSize: 142, revealStroke: 62 });

      _statusPill.style.display = "inline-flex";
      _statusPill.dataset.status = "off";
      _statusLabel.textContent = "Enjoy your day \u2728";
    } else if (dayIsOver) {
      setHeroLine('eyebrow', '', false);
      setHeroLine('title', 'School Day Ended', true, { fontSize: 142, revealStroke: 62 });

      _statusPill.style.display = "inline-flex";
      _statusPill.dataset.status = "off";
      _statusLabel.textContent = "See you tomorrow";
    } else if (isBeforeSchool) {
      setHeroLine('eyebrow', 'Starts in', true, { fontSize: 112, revealStroke: 52 });
      setHeroLine('title', '', false);
      _statusPill.style.display = "none";
    } else {
      setHeroLine('eyebrow', isTransition ? "Passing" : "Currently in", true, { fontSize: 112, revealStroke: 52 });
      setHeroLine('title', period, true, { fontSize: 142, revealStroke: 62 });

      _statusPill.style.display = "inline-flex";
      if (isTransition) {
        _statusPill.dataset.status = "passing";
        _statusLabel.textContent = "Next period soon";
      } else if (timeleft <= 60 && timeleft > 0) {
        _statusPill.dataset.status = "urgent";
        _statusLabel.textContent = "Ending Soon";
      } else {
        _statusPill.dataset.status = "live";
        _statusLabel.textContent = "In Session";
      }
    }
  }

  /* --- Ring --- */
  if (_ringFill && periodEndTime > periodStartTime) {
    const elapsed = val - periodStartTime;
    const total = periodEndTime - periodStartTime;
    const pctRemaining = Math.min(1, Math.max(0, 1 - elapsed / total));
    const arcLen = pctRemaining * 100;
    _ringFill.style.strokeDasharray = `${arcLen} 100`;
    _ringFill.style.strokeDashoffset = '0';
  } else if (_ringFill) {
    _ringFill.style.strokeDasharray = '0 100';
    _ringFill.style.strokeDashoffset = '0';
  }

  /* --- Schedule header --- */
  if (_schedTitle) _schedTitle.textContent = scheduleType;
  if (_schedDate) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    _schedDate.textContent = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  /* --- Period list --- */
  renderPeriodList(val);
  _setClockCadence(!isTimerInactive);
}

function renderPeriodList(currentSeconds) {
  if (!_periodList) return;
  if (myArray.length === 0) {
    const emptyLabel = _isNonInstructionalSchedule(scheduleType)
      ? 'No bell schedule today'
      : 'No remaining bell schedule';
    if (_lastPeriodCount !== 0 || _periodList.dataset.emptyLabel !== emptyLabel) {
      _periodList.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'period-card period-card--empty';
      li.textContent = emptyLabel;
      _periodList.appendChild(li);
      _periodList.dataset.emptyLabel = emptyLabel;
      _lastPeriodCount = 0;
    }
    return;
  }
  delete _periodList.dataset.emptyLabel;

  if (_periodList.children.length === myArray.length && myArray.length === _lastPeriodCount) {
    for (let i = 0; i < myArray.length; i++) {
      const li = _periodList.children[i];
      const p = myArray[i];
      const stateClass = getStateClass(p, currentSeconds);

      const expectedClass = 'period-card ' + stateClass;
      if (li.className !== expectedClass.trim()) {
        li.className = expectedClass.trim();
      }
    }
    return;
  }

  _periodList.innerHTML = '';
  for (let i = 0; i < myArray.length; i++) {
    const p = myArray[i];
    const stateClass = getStateClass(p, currentSeconds);
    const durationMin = Math.round((p.endSec - p.startSec) / 60);

    const li = document.createElement('li');
    li.className = 'period-card ' + stateClass;

    li.innerHTML = `
      <div class="period-time">${p.timeStr}</div>
      <div class="period-name">${p.name}</div>
      <div class="period-meta">${durationMin} min</div>
    `;

    _periodList.appendChild(li);
  }
  _lastPeriodCount = myArray.length;
}

function getStateClass(period, currentSeconds) {
  if (currentSeconds >= period.endSec) return 'is-past';
  if (currentSeconds >= period.startSec && currentSeconds < period.endSec) return 'is-current';
  return '';
}

document.addEventListener('site-settings:applied', e => {
  _applySettingsScheduleOverride(e.detail);
  _applyGradesFrameUrl(e.detail);
  requestAnimationFrame(() => _updateNavActive(_siteView));
});

window.onload = main;
