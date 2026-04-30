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

/* --- Admin time override (localhost only) --- */
let _timeOffsetSeconds = 0; // added to real time

/* --- Schedule override (set by admin panel, synced from backend) --- */
let _scheduleOverride = null; // { type: string, timestamp: number } | null

const _BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://phs-grades-backend.onrender.com';

async function _pollScheduleOverride() {
  try {
    const res = await fetch(`${_BACKEND_URL}/schedule-override`);
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

function _isLocalhost() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
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
    document.getElementById('admin-h').value = '';
    document.getElementById('admin-m').value = '';
    document.getElementById('admin-s').value = '';
    document.getElementById('admin-status').textContent = 'Real time';
    updateAll();
  });
}

/* --- Cache DOM refs --- */
let _hmEl, _sEl, _heroTitle, _heroEyebrow;
let _signatureTitle, _signatureEyebrow;
let _ringFill, _statusPill, _statusLabel, _schedTitle, _schedDate, _periodList;
let _hmTextNode = null;
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
    const response = await fetch('data.json');
    data = await response.json();

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

    /* Strip any existing text nodes from #cd-hm (the hardcoded "00 " in HTML),
       then insert a single controlled text node before the MIN span. */
    if (_hmEl) {
      Array.from(_hmEl.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .forEach(n => n.remove());
      _hmTextNode = document.createTextNode('');
      _hmEl.insertBefore(_hmTextNode, _hmEl.firstChild);
    }

    _initAdminPanel();
    await _pollScheduleOverride();
    setInterval(_pollScheduleOverride, 30000); // re-check every 30 s
    updateAll();
    setInterval(updateAll, 1000);
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
  let val = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + 37 + _timeOffsetSeconds;
  if (!(str in data)) { str = "base"; }

  let arr = data[str];
  // Apply admin schedule override if one is active
  if (_scheduleOverride && _scheduleOverride.type) {
    const overrideArr = _getOverrideData(_scheduleOverride.type);
    if (overrideArr) arr = overrideArr;
  }
  scheduleType = arr[0];
  let periods = arr[1];
  // Admin-controlled bell-schedule template overrides for this type, if non-empty.
  const _bs = (window.__SITE_SETTINGS__ && window.__SITE_SETTINGS__.bellSchedules) || null;
  if (_bs && _bs[scheduleType] && Object.keys(_bs[scheduleType]).length) {
    periods = _bs[scheduleType];
  }
  let largestUnder = -1;
  let largest = -1;
  myArray = [];

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
  let val = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + 37 + _timeOffsetSeconds;
  let timeleft = Math.max(0, goal - val);

  let h = Math.floor(timeleft / 3600);
  let m = Math.floor((timeleft % 3600) / 60);
  let s = timeleft % 60;

  /* --- Zero Timer if No School --- */
  const dayIsOver = (timeleft <= 0 && !isBeforeSchool);
  const noSchool = scheduleType === "No School" || scheduleType === "No School (Most Likely)" || dayIsOver;

  if (noSchool) {
    h = 0; m = 0; s = 0;
  }

  /* --- Countdown --- */
  if (_hmEl) {
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

  document.title = h === 0
    ? `${m}:${String(s).padStart(2, '0')} PHS`
    : `${h}:${String(m).padStart(2, '0')} PHS`;

  /* --- Hero text & Status --- */
  if (_heroTitle && _heroEyebrow && _statusPill && _statusLabel) {
    if (noSchool) {
      setHeroLine('eyebrow', '', false);
      setHeroLine('title', 'No School', true, { fontSize: 142, revealStroke: 62 });

      _statusPill.style.display = "inline-flex";
      _statusPill.dataset.status = "off";
      _statusLabel.textContent = "Enjoy your day \u2728";
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
}

function renderPeriodList(currentSeconds) {
  if (!_periodList) return;

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

window.onload = main;
