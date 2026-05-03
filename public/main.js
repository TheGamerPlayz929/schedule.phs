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

/* --- Cache DOM refs --- */
let _hmEl, _sEl, _heroTitle, _heroEyebrow;
let _progressFill, _statusPill, _statusLabel, _schedTitle, _schedDate, _periodList;
let _hmTextNode = null;
let _lastHm = '', _lastS = '', _lastPeriodCount = -1;
let _clockTimerId = null;
let _clockTickMs = 0;

const ACTIVE_CLOCK_MS = 1000;
const IDLE_CLOCK_MS = 60000;

function _clockSeconds(date = new Date()) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
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
  const circle = document.querySelector('.glass-circle');
  if (!circle) return;
  circle.hidden = !visible;
  circle.style.display = visible ? '' : 'none';
  circle.setAttribute('aria-hidden', String(!visible));
}

function _clearCountdownDisplay() {
  if (_hmEl) _hmEl.textContent = '';
  if (_sEl) _sEl.textContent = '';
  _lastHm = '';
  _lastS = '';
}

async function main() {
  try {
    const response = await fetch('data.json');
    data = await response.json();

    _hmEl = document.getElementById('cd-hm');
    _sEl = document.getElementById('cd-s');
    _heroTitle = document.getElementById('hero-title');
    _heroEyebrow = document.querySelector('.hero-eyebrow');
    _progressFill = document.getElementById('progress-fill');
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

    updateAll();
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
  scheduleType = arr[0];
  let periods = arr[1];
  if (_isNonInstructionalSchedule(scheduleType)) {
    _resetTimerState();
    return;
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
  } else if (periods[largestUnder][0] - val < 0 && largestUnder != largest) {
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
  if (_hmEl && _hmTextNode && !isTimerInactive) {
    const hm = h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}`;
    const ss = String(s).padStart(2, '0');

    if (hm !== _lastHm) {
      _hmTextNode.textContent = hm + ' ';
      _lastHm = hm;
    }
    if (ss !== _lastS) { _sEl.textContent = ss; _lastS = ss; }
  }

  document.title = isTimerInactive
    ? `${noSchool ? scheduleType : 'Done'} | PHS`
    : (h === 0
      ? `${m}:${String(s).padStart(2, '0')} PHS`
      : `${h}:${String(m).padStart(2, '0')} PHS`);

  /* --- Hero text & Status --- */
  if (_heroTitle && _heroEyebrow && _statusPill && _statusLabel) {
    if (noSchool) {
      _heroEyebrow.style.display = "none";
      _heroTitle.style.display = "block";
      _heroTitle.textContent = "No School";

      _statusPill.style.display = "inline-flex";
      _statusPill.dataset.status = "off";
      _statusLabel.textContent = "Enjoy your day \u2728";
    } else if (dayIsOver) {
      _heroEyebrow.style.display = "none";
      _heroTitle.style.display = "block";
      _heroTitle.textContent = "School Day Ended";

      _statusPill.style.display = "inline-flex";
      _statusPill.dataset.status = "off";
      _statusLabel.textContent = "See you tomorrow";
    } else if (isBeforeSchool) {
      _heroEyebrow.style.display = "block";
      _heroEyebrow.textContent = "Starts in";
      _heroTitle.style.display = "none";
      _statusPill.style.display = "none";
    } else {
      _heroEyebrow.style.display = "block";
      _heroEyebrow.textContent = isTransition ? "Passing" : "Current";
      _heroTitle.style.display = "block";
      _heroTitle.textContent = period;

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

  /* --- Progress bar --- */
  if (_progressFill && periodEndTime > periodStartTime) {
    const elapsed = val - periodStartTime;
    const total = periodEndTime - periodStartTime;
    const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    _progressFill.style.width = pct + '%';
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

window.onload = main;
