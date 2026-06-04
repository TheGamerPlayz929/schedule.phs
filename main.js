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
let _heroSettings = {}; // populated from site-settings:applied, used for editable status text
let _devScheduleType = null;

/* --- Schedule override (set by admin panel, synced from backend) --- */
let _scheduleOverride = null; // { type: string, timestamp: number, date: string } | null
let _clockTimerId = null;
let _clockTickMs = 0;
const renderState = {
  lastHm: '',
  lastS: '',
  lastPeriodCount: -1,
  lastSignedTitle: '',
  lastSignedEyebrow: ''
};

const ACTIVE_CLOCK_MS = 1000;
const IDLE_CLOCK_MS = 60000;
const OVERRIDE_FETCH_TIMEOUT_MS = 5000;
const OVERRIDE_POLL_INTERVAL_MS = 5000;
const OVERRIDE_FAILURE_BACKOFF_MAX_MS = 60000;
const OVERRIDE_CACHE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_DATA_CACHE_KEY = 'phs:schedule-data:v2';
const OLD_SCHEDULE_DATA_CACHE_KEYS = ['phs:schedule-data:v1'];
const SCHEDULE_DATA_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const SCHEDULE_DATA_FETCH_TIMEOUT_MS = 5000;
const LUNCH_WEATHER_CACHE_KEY = 'phs:lunch-weather:v7';
const LUNCH_WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;
const LUNCH_WEATHER_STALE_TTL_MS = 6 * 60 * 60 * 1000;
const LUNCH_WEATHER_FETCH_TIMEOUT_MS = 6500;
const LUNCH_WEATHER_RETRY_COOLDOWN_MS = 60 * 1000;
const LUNCH_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=39.1459&longitude=-77.4169&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&minutely_15=precipitation,precipitation_probability,weather_code&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=2';
const LUNCH_WEATHER_FALLBACK_START_SEC = 10 * 3600 + 20 * 60;
const LUNCH_WEATHER_FALLBACK_END_SEC = 12 * 3600;
const LUNCH_WEATHER_FORECAST_END_SEC = 14 * 3600 + 30 * 60;
const LUNCH_WEATHER_MAX_HOURS = 5;
const LUNCH_WEATHER_SOON_WINDOW_MINUTES = 45;
const GRADEVIEWER_DEFAULT_LOCAL_URL = 'http://localhost:3001/login';
const GRADEVIEWER_DEFAULT_PROD_URL = 'https://schedulephs.web.app/login';
const GRADEVIEWER_EMBED_CACHE_BUST = '20260525-faq';
const OPENTYPE_SCRIPT_URL = 'vendor/opentype.min.js?v=20260524-perf1';
const SIGNATURE_FONT_URL = 'assets/fonts/AlexBrush-Regular.ttf';
const FALLBACK_ANNOUNCEMENTS = {
  announcements: {
    items: [
      {
        title: 'Certificate',
        bullets: ['Certificate of Authenticity: The new website link is the one you are currently on.']
      },
      {
        title: 'Welcome!',
        bullets: [
          'Hello everyone!',
          'This website was designed in response to the inconveniences students face with modern applications.',
          'Working on importing GradeViewer for more ease of access.'
        ]
      }
    ]
  }
};

const _BACKEND_URL = ['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(location.hostname)
  ? location.origin
  : 'https://phs-grades-backend.onrender.com';
const _IS_ADMIN_PREVIEW = new URLSearchParams(location.search).has('_preview');
const _IS_STUDIO_PREVIEW = new URLSearchParams(location.search).has('_studio');

function _isScheduleEntry(entry) {
  return Array.isArray(entry)
    && typeof entry[0] === 'string'
    && entry[1]
    && typeof entry[1] === 'object'
    && !Array.isArray(entry[1]);
}

function _isScheduleDataShape(nextData) {
  if (!nextData || typeof nextData !== 'object' || !_isScheduleEntry(nextData.base)) return false;
  return Object.values(nextData).every(_isScheduleEntry);
}

let _siteView = 'schedule';
let _siteViewScroll = { announcements: 0, schedule: 0, grades: 0 };
let _gradesFrame = null;
let _gradesScaler = null;
let _gradesFrameUrlLocked = false;
let _gradesFrameApplyGeneration = 0;
let _gradesFrameSizeRaf = 0;
let _gradesFrameBridgeReady = false;
let _gradesIsFullscreen = false;
let _gradesSavedFrameCss = '';
let _gradesSavedScalerCss = '';
const _gradesSavedTransforms = [];
let _weatherCard = null;
let _weatherAlert = null;
let _weatherAlertIcon = null;
let _weatherDetails = null;
let _weatherTemp = null;
let _weatherCondition = null;
let _weatherSymbol = null;
let _weatherHours = null;
let _weatherMeta = null;
let _weatherPayload = null;
let _weatherLoading = false;
let _weatherVisible = false;
let _weatherRetryAt = 0;
let _lunchWeatherInterval = null;
let _overrideFailureCount = 0;
let _overrideRetryAt = 0;
const _periodEntryCache = new WeakMap();

async function _pollScheduleOverride() {
  if (_IS_ADMIN_PREVIEW && window.__SITE_SETTINGS__) {
    _scheduleOverride = _normalizeScheduleOverride(window.__SITE_SETTINGS__.scheduleOverride || null);
    return;
  }
  if (_isLocalhost()) {
    const previousOverride = JSON.stringify(_scheduleOverride);
    _scheduleOverride = _readSettingsScheduleOverride() || _readStoredScheduleOverride();
    if (data && previousOverride !== JSON.stringify(_scheduleOverride)) updateAll();
    return;
  }
  if (Date.now() < _overrideRetryAt) return;
  const previousOverride = JSON.stringify(_scheduleOverride);
  const settingsOverride = _readSettingsScheduleOverride();
  let timeout = 0;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), OVERRIDE_FETCH_TIMEOUT_MS);
    const res = await fetch(`${_BACKEND_URL}/schedule-override`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    const json = await res.json();
    _scheduleOverride = _chooseFreshScheduleOverride(json.override || null, settingsOverride);
    if (_scheduleOverride) {
      _writeStoredScheduleOverride(_scheduleOverride);
    } else {
      localStorage.removeItem('phs_schedule_override');
    }
    _overrideFailureCount = 0;
    _overrideRetryAt = 0;
  } catch (e) {
    _overrideFailureCount += 1;
    const backoff = Math.min(OVERRIDE_FAILURE_BACKOFF_MAX_MS, OVERRIDE_POLL_INTERVAL_MS * (2 ** _overrideFailureCount));
    _overrideRetryAt = Date.now() + backoff;
    _scheduleOverride = _readSettingsScheduleOverride() || _readStoredScheduleOverride();
  } finally {
    clearTimeout(timeout);
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

function _dateToISODate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _currentScheduleDate() {
  const previewISO = window.__PHS_PREVIEW_DATE__;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(previewISO || ''))) {
    const [y, m, d] = String(previewISO).split('-').map(Number);
    const now = new Date();
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  }
  return new Date();
}

function _todayISODate() {
  return _dateToISODate(_currentScheduleDate());
}

function _timestampToISODate(timestamp) {
  const value = Number(timestamp);
  return Number.isFinite(value) ? _dateToISODate(new Date(value)) : '';
}

function _overrideAppliesToday(override) {
  if (!override || !override.type) return false;
  const today = _todayISODate();
  if (override.date) return String(override.date) === today;
  if (override.timestamp) return _timestampToISODate(override.timestamp) === today;
  return false;
}

function _normalizeScheduleOverride(override) {
  return _overrideAppliesToday(override) ? override : null;
}

function _overrideTimestamp(override) {
  const value = Number(override?.timestamp || 0);
  return Number.isFinite(value) ? value : 0;
}

function _chooseFreshScheduleOverride(apiOverride, settingsOverride) {
  const api = _normalizeScheduleOverride(apiOverride || null);
  const settings = _normalizeScheduleOverride(settingsOverride || null);
  if (!api) return settings;
  if (!settings) return api;

  const apiTimestamp = _overrideTimestamp(api);
  const settingsTimestamp = _overrideTimestamp(settings);
  if (apiTimestamp && settingsTimestamp) {
    return apiTimestamp >= settingsTimestamp ? api : settings;
  }
  if (settingsTimestamp && !apiTimestamp) return settings;
  if (apiTimestamp && !settingsTimestamp) return api;
  return settings;
}

function _plannedScheduleOverrides() {
  const map = window.__SITE_SETTINGS__?.bellSchedules?._dateOverrides
    || window.__SITE_SETTINGS__?.scheduleOverride?.dateOverrides
    || {};
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

function _plannedOverrideForDate(date) {
  const iso = _dateToISODate(date);
  const type = _plannedScheduleOverrides()[iso];
  return type ? { type, date: iso, planned: true } : null;
}

function _writeStoredScheduleOverride(override) {
  try {
    localStorage.setItem('phs_schedule_override', JSON.stringify({ ...override, fetchedAt: Date.now() }));
  } catch {}
}

function _readSettingsScheduleOverride() {
  return _normalizeScheduleOverride(window.__SITE_SETTINGS__?.scheduleOverride || null) || _plannedOverrideForDate(_currentScheduleDate());
}

function _readStoredScheduleOverride() {
  try {
    const stored = localStorage.getItem('phs_schedule_override');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    const fetchedAt = Number(parsed?.fetchedAt || 0);
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > OVERRIDE_CACHE_FALLBACK_TTL_MS) {
      localStorage.removeItem('phs_schedule_override');
      return null;
    }
    delete parsed.fetchedAt;
    return _normalizeScheduleOverride(parsed);
  } catch {
    localStorage.removeItem('phs_schedule_override');
    return null;
  }
}

function _applySettingsScheduleOverride(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (!Object.prototype.hasOwnProperty.call(settings, 'scheduleOverride')) return;
  const previousOverride = JSON.stringify(_scheduleOverride);
  const nextOverride = _normalizeScheduleOverride(settings.scheduleOverride || null);
  if (!nextOverride && _scheduleOverride && _overrideAppliesToday(_scheduleOverride)) {
    const settingsUpdatedAt = Number(settings.updatedAt || 0);
    const activeTimestamp = Number(_scheduleOverride.timestamp || 0);
    if (activeTimestamp && (!settingsUpdatedAt || settingsUpdatedAt < activeTimestamp)) return;
  }
  _scheduleOverride = nextOverride;
  if (_scheduleOverride) _writeStoredScheduleOverride(_scheduleOverride);
  else localStorage.removeItem('phs_schedule_override');
  if (data && previousOverride !== JSON.stringify(_scheduleOverride)) updateAll();
}

function _isLocalhost() {
  return ['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(location.hostname);
}

function _clockSeconds(date = new Date()) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + _timeOffsetSeconds;
}

function _effectiveClockDate(date = new Date()) {
  return new Date(date.getTime() + _timeOffsetSeconds * 1000);
}

function _scheduleKeyForDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function _isWeekendDate(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function _startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function _getScheduleDataForDate(date) {
  const baseEntry = _defaultScheduleDataForDate(date);
  const resolved = window.PhsScheduleResolver?.resolveScheduleType
    ? window.PhsScheduleResolver.resolveScheduleType(date, window.__SITE_SETTINGS__ || {}, baseEntry?.[0] || '')
    : { type: _plannedOverrideForDate(date)?.type || baseEntry?.[0] || '', source: _plannedOverrideForDate(date) ? 'manual' : 'default' };
  if (resolved?.type && resolved.source !== 'default') {
    const template = window.__SITE_SETTINGS__?.bellSchedules?.[resolved.type];
    if (template && typeof template === 'object' && !Array.isArray(template) && Object.keys(template).length) {
      return [resolved.type, template];
    }
    if (_isNonInstructionalSchedule(resolved.type)) return [resolved.type, {}];
    const matching = Object.values(data || {}).find(entry => Array.isArray(entry) && entry[0] === resolved.type);
    if (matching) return matching;
    return [resolved.type, baseEntry?.[1] || {}];
  }
  return baseEntry;
}

function _defaultScheduleDataForDate(date) {
  const key = _scheduleKeyForDate(date);
  if (key in data) return data[key];
  return _isWeekendDate(date) ? ['No School', {}] : data.base;
}

function _escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function _renderScheduleDifferenceBanner(date) {
  document.getElementById('schedule-difference-banner')?.remove();
}

function _getPeriodEntries(periods) {
  if (!periods || typeof periods !== 'object') return [];
  const cached = _periodEntryCache.get(periods);
  if (cached) return cached;

  const entries = Object.entries(periods)
    .map(([start, value]) => {
      const startSec = Number(start);
      const endSec = Number(value?.[0]);
      return {
        startSec,
        endSec,
        name: String(value?.[1] || ''),
        timeStr: proccessTime(startSec) + " \u2192 " + proccessTime(endSec)
      };
    })
    .filter(p => Number.isFinite(p.startSec) && Number.isFinite(p.endSec) && p.endSec > p.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  _periodEntryCache.set(periods, entries);
  return entries;
}

function _isNonInstructionalSchedule(type) {
  return /\b(no school|holiday|closure|closed)\b/i.test(String(type || ''));
}

function _nextInstructionalDate(from = new Date()) {
  if (!data) return null;
  const cursor = _startOfDay(from);
  for (let i = 1; i <= 30; i += 1) {
    cursor.setDate(cursor.getDate() + 1);
    const arr = _getScheduleDataForDate(cursor);
    if (arr && !_isNonInstructionalSchedule(arr[0])) return new Date(cursor);
  }
  return null;
}

function _getNextSchoolDayLabel(from = new Date()) {
  const next = _nextInstructionalDate(from);
  if (!next) return 'See you next school day';
  const diffDays = Math.round((_startOfDay(next) - _startOfDay(from)) / 86400000);
  if (diffDays === 1) return 'See you tomorrow';
  const weekday = next.toLocaleDateString(undefined, { weekday: 'long' });
  return weekday ? `See you ${weekday}` : 'See you next school day';
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
  if (domRefs.hmEl) domRefs.hmEl.textContent = '';
  if (domRefs.sEl) domRefs.sEl.textContent = '';
  renderState.lastHm = '';
  renderState.lastS = '';
}

function _prepareCountdownDisplay() {
  if (domRefs.hmEl) {
    Array.from(domRefs.hmEl.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .forEach(n => n.remove());
    if (!domRefs.hmEl.querySelector('.cd-min-label')) {
      const label = document.createElement('span');
      label.className = 'cd-min-label';
      label.textContent = 'm';
      domRefs.hmEl.appendChild(label);
    }
  }
  if (domRefs.sEl) domRefs.sEl.textContent = '';
  renderState.lastHm = '';
  renderState.lastS = '';
}

function _readScheduleDataCache() {
  try {
    const raw = sessionStorage.getItem(SCHEDULE_DATA_CACHE_KEY) || localStorage.getItem(SCHEDULE_DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') return null;
    if (Date.now() - Number(parsed.ts || 0) > SCHEDULE_DATA_CACHE_TTL_MS) return null;
    return _isScheduleDataShape(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

function _clearOldScheduleDataCaches() {
  for (const key of OLD_SCHEDULE_DATA_CACHE_KEYS) {
    try { sessionStorage.removeItem(key); } catch {}
    try { localStorage.removeItem(key); } catch {}
  }
}

function _writeScheduleDataCache(nextData) {
  try {
    const payload = JSON.stringify({ ts: Date.now(), data: nextData });
    sessionStorage.setItem(SCHEDULE_DATA_CACHE_KEY, payload);
    localStorage.setItem(SCHEDULE_DATA_CACHE_KEY, payload);
  } catch {}
}

function _weatherLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function _lunchWeatherContext(referenceDate = _effectiveClockDate()) {
  const { startSec, endSec } = _lunchWeatherWindowSeconds();
  return {
    localDate: _weatherLocalDateKey(referenceDate),
    scheduleType: String(scheduleType || ''),
    startSec,
    endSec
  };
}

function _readLunchWeatherCache(maxAgeMs = LUNCH_WEATHER_STALE_TTL_MS) {
  try {
    const raw = localStorage.getItem(LUNCH_WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ageMs = Date.now() - Number(parsed?.ts || 0);
    if (!parsed?.api || !Number.isFinite(ageMs) || ageMs > maxAgeMs) return null;
    if (!_isLunchWeatherApiValid(parsed.api)) {
      localStorage.removeItem(LUNCH_WEATHER_CACHE_KEY);
      return null;
    }
    return parsed.api;
  } catch {
    return null;
  }
}

function _writeLunchWeatherCache(api) {
  try {
    if (!_isLunchWeatherApiValid(api)) return;
    localStorage.setItem(LUNCH_WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), api }));
  } catch {}
}

function _lunchWeatherFetchUrls() {
  const urls = [];
  if (location.protocol !== 'file:') urls.push(`${_BACKEND_URL}/weather/lunch`);
  urls.push(LUNCH_WEATHER_URL);
  return [...new Set(urls)];
}

async function _fetchLunchWeatherApi() {
  let lastError = null;
  for (const url of _lunchWeatherFetchUrls()) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: _timeoutSignal(LUNCH_WEATHER_FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const api = _isLunchWeatherApiValid(json?.api) ? json.api : json;
      if (!_isLunchWeatherApiValid(api)) throw new Error('Invalid weather payload');
      return api;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Weather fetch failed');
}

function _hasWeatherArray(hourly, key, minLength) {
  return Array.isArray(hourly?.[key]) && hourly[key].length >= minLength;
}

function _isLunchWeatherApiValid(api) {
  const hourly = api?.hourly;
  const times = hourly?.time;
  if (!api || typeof api !== 'object' || !Array.isArray(times) || !times.length) return false;
  return _hasWeatherArray(hourly, 'temperature_2m', times.length)
    && _hasWeatherArray(hourly, 'apparent_temperature', times.length)
    && _hasWeatherArray(hourly, 'precipitation_probability', times.length)
    && _hasWeatherArray(hourly, 'weather_code', times.length)
    && _hasWeatherArray(hourly, 'wind_speed_10m', times.length);
}

function _weatherKind(code, isDay = true) {
  const value = Number(code);
  if ([0].includes(value)) return 'clear';
  if ([1, 2].includes(value)) return isDay ? 'partly' : 'cloudy';
  if ([3].includes(value)) return 'cloudy';
  if ([45, 48].includes(value)) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(value)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'snow';
  return 'cloudy';
}

function _weatherGlyph(code, isDay = true) {
  const value = Number(code);
  if (value === 0) return isDay ? '☀️' : '🌙';
  if ([1, 2].includes(value)) return isDay ? '🌤️' : '☁️';
  if (value === 3) return '☁️';
  if ([45, 48].includes(value)) return '🌫️';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return '🌨️';
  if ([95, 96, 99].includes(value)) return '⛈️';
  return '☁️';
}

function _weatherLabel(code) {
  const value = Number(code);
  if (value === 0) return 'Clear';
  if (value === 1) return 'Mostly Clear';
  if (value === 2) return 'Partly Cloudy';
  if (value === 3) return 'Cloudy';
  if ([45, 48].includes(value)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(value)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'Snow';
  if ([95, 96, 99].includes(value)) return 'Storms';
  return 'Weather';
}

function _setWeatherSymbol(el, code, isDay = true) {
  if (!el) return;
  const isMini = el.classList.contains('weather-symbol--mini');
  el.className = `weather-symbol${isMini ? ' weather-symbol--mini' : ''}`;
  el.textContent = _weatherGlyph(code, isDay);
  el.setAttribute('aria-label', _weatherLabel(code));
}

function _formatWeatherHour(iso, index) {
  if (index === 0) return 'Now';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  const hour24 = date.getHours();
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour = hour24 === 0 ? 12 : (hour24 > 12 ? hour24 - 12 : hour24);
  return `${hour}${suffix}`;
}

function _isWeatherDaylight(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;
  const hour = date.getHours();
  return hour >= 6 && hour < 20;
}

function _weatherDateAt(referenceDate, seconds) {
  const date = new Date(referenceDate);
  date.setHours(Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), 0, 0);
  return date;
}

function _weatherNextHour(date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

function _nearestWeatherHourIndex(times, targetMs, minMs, maxMs) {
  let bestIndex = null;
  let bestDiff = Infinity;
  times.forEach((time, index) => {
    const timeMs = new Date(time).getTime();
    if (!Number.isFinite(timeMs) || timeMs < minMs || timeMs > maxMs) return;
    const diff = Math.abs(timeMs - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function _schedulePeriodBounds(pattern) {
  const entry = myArray.find(item => pattern.test(String(item.name || '')));
  if (!entry) return null;
  return {
    startSec: Number(entry.startSec),
    endSec: Number(entry.endSec)
  };
}

function _lunchWeatherWindowSeconds() {
  const period4Bounds = _schedulePeriodBounds(/^period\s*4$/i);
  const lunchBounds = _schedulePeriodBounds(/\blunch\b/i);
  const startSec = Number.isFinite(period4Bounds?.startSec)
    ? period4Bounds.startSec
    : Number.isFinite(lunchBounds?.startSec)
      ? lunchBounds.startSec
      : LUNCH_WEATHER_FALLBACK_START_SEC;
  const endSec = Number.isFinite(lunchBounds?.endSec)
    ? lunchBounds.endSec
    : Number.isFinite(period4Bounds?.endSec)
      ? period4Bounds.endSec
      : LUNCH_WEATHER_FALLBACK_END_SEC;
  return { startSec, endSec };
}

function _weatherHourlyNumber(hourly, key, index, fallback = 0) {
  if (index === null || index === undefined) return Number(fallback);
  return Number(hourly?.[key]?.[index] ?? fallback);
}

function _weatherHourFromSource(hourly, current, time, sourceIndex, label) {
  return {
    label,
    temp: Math.round(_weatherHourlyNumber(hourly, 'temperature_2m', sourceIndex, current.temperature_2m ?? 0)),
    code: Number(hourly.weather_code?.[sourceIndex] ?? current.weather_code ?? 3),
    rainChance: Number(hourly.precipitation_probability?.[sourceIndex] ?? 0),
    isDay: _isWeatherDaylight(time)
  };
}

function _minuteWeatherNumber(minutely, key, index, fallback = 0) {
  if (index === null || index === undefined) return Number(fallback);
  return Number(minutely?.[key]?.[index] ?? fallback);
}

function _rainSoonFromApi(api, referenceDate = _effectiveClockDate()) {
  const minutely = api?.minutely_15;
  const times = Array.isArray(minutely?.time) ? minutely.time : [];
  if (!times.length) return null;
  const startMs = referenceDate.getTime();
  const endMs = startMs + LUNCH_WEATHER_SOON_WINDOW_MINUTES * 60 * 1000;
  let firstRain = null;
  let maxChance = 0;
  for (let index = 0; index < times.length; index += 1) {
    const timeMs = new Date(times[index]).getTime();
    if (!Number.isFinite(timeMs) || timeMs < startMs || timeMs > endMs) continue;
    const chance = _minuteWeatherNumber(minutely, 'precipitation_probability', index, 0);
    const precipitation = _minuteWeatherNumber(minutely, 'precipitation', index, 0);
    const code = Number(minutely.weather_code?.[index] ?? 0);
    maxChance = Math.max(maxChance, chance);
    if (!firstRain && (precipitation > 0 || _weatherKind(code) === 'rain')) {
      firstRain = { timeMs, chance, precipitation, code };
    }
  }
  if (!firstRain && maxChance < 35) return null;
  return {
    minutes: firstRain ? Math.max(0, Math.round((firstRain.timeMs - startMs) / 60000)) : null,
    chance: Math.round(firstRain?.chance ?? maxChance),
    precipitation: Number(firstRain?.precipitation ?? 0),
    code: Number(firstRain?.code ?? 0),
    windowMinutes: LUNCH_WEATHER_SOON_WINDOW_MINUTES
  };
}

function _renderLunchWeatherDetails(payload) {
  if (!_weatherDetails) return;
  const details = payload
    ? [
        ['Feels', `${payload.feelsLike}°`],
        ['Wind', `${payload.wind} mph`],
        ['Rain', `${Math.round(Number(payload.rainChance || 0))}%`]
      ]
    : [
        ['Feels', '--°'],
        ['Wind', '-- mph'],
        ['Rain', '--%']
      ];
  _weatherDetails.textContent = '';
  for (const [labelText, valueText] of details) {
    const item = document.createElement('span');
    item.className = 'lunch-weather-detail';
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('strong');
    value.textContent = valueText;
    item.append(label, value);
    item.setAttribute('aria-label', `${labelText} ${valueText}`);
    _weatherDetails.appendChild(item);
  }
}

function _lunchWeatherAdvice(payload) {
  if (!payload) return 'Lunch weather loading...';
  if (payload.soonRain) {
    if (payload.soonRain.minutes !== null && payload.soonRain.minutes <= 15) return 'Rain expected soon.';
    if (payload.soonRain.chance >= 60) return 'Rain likely soon.';
    return 'Rain possible soon.';
  }
  if (_weatherKind(payload.code, payload.isDay !== false) === 'rain' || payload.precipitation > 0) return 'Rain around lunch.';
  if (payload.rainChance >= 60) return 'Rain likely around lunch.';
  if (payload.rainChance >= 35) return 'Rain possible around lunch.';
  return `${payload.condition} around lunch.`;
}

function _weatherPayloadFromApi(api, referenceDate = _effectiveClockDate()) {
  if (!_isLunchWeatherApiValid(api)) return null;
  const current = api?.current || {};
  const hourly = api?.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const context = _lunchWeatherContext(referenceDate);
  const lunchStartMs = _weatherDateAt(referenceDate, context.startSec).getTime();
  const lunchEndMs = _weatherDateAt(referenceDate, context.endSec).getTime();
  const forecastEndMs = Math.max(lunchEndMs, _weatherDateAt(referenceDate, LUNCH_WEATHER_FORECAST_END_SEC).getTime());
  const primarySourceIndex = _nearestWeatherHourIndex(times, referenceDate.getTime(), lunchStartMs, lunchEndMs);
  const nowTime = primarySourceIndex !== null ? times[primarySourceIndex] : referenceDate.toISOString();
  const currentCode = Number(hourly.weather_code?.[primarySourceIndex] ?? current.weather_code ?? 3);
  const currentIsDay = primarySourceIndex !== null ? _isWeatherDaylight(nowTime) : current.is_day !== 0;
  const nowHour = {
    label: 'Now',
    temp: Math.round(_weatherHourlyNumber(hourly, 'temperature_2m', primarySourceIndex, current.temperature_2m ?? 0)),
    code: currentCode,
    rainChance: Number(hourly.precipitation_probability?.[primarySourceIndex] ?? 0),
    isDay: currentIsDay
  };
  const nextHourMs = _weatherNextHour(referenceDate).getTime();
  const futureHours = times
    .map((time, sourceIndex) => ({ time, sourceIndex, timeMs: new Date(time).getTime() }))
    .filter(item => Number.isFinite(item.timeMs) && item.timeMs >= nextHourMs && item.timeMs <= forecastEndMs)
    .slice(0, LUNCH_WEATHER_MAX_HOURS - 1)
    .map(({ time, sourceIndex }, index) => _weatherHourFromSource(hourly, current, time, sourceIndex, _formatWeatherHour(time, index + 1)));
  const hours = [nowHour, ...futureHours];
  return {
    temp: nowHour.temp,
    feelsLike: Math.round(_weatherHourlyNumber(hourly, 'apparent_temperature', primarySourceIndex, current.apparent_temperature ?? current.temperature_2m ?? nowHour.temp)),
    wind: Math.round(_weatherHourlyNumber(hourly, 'wind_speed_10m', primarySourceIndex, current.wind_speed_10m ?? 0)),
    precipitation: Number(current.precipitation ?? 0),
    rainChance: Number(nowHour.rainChance ?? 0),
    code: currentCode,
    isDay: currentIsDay,
    condition: _weatherLabel(currentCode),
    soonRain: _rainSoonFromApi(api, referenceDate),
    hours,
    referenceTime: referenceDate.toISOString(),
    lunchWeatherEndTime: _weatherDateAt(referenceDate, context.endSec).toISOString(),
    localDate: context.localDate,
    scheduleType: context.scheduleType,
    startSec: context.startSec,
    endSec: context.endSec,
    fetchedAt: Date.now()
  };
}

function _currentScheduleSeconds() {
  return _clockSeconds(new Date());
}

function _isLunchNow() {
  const lunchBounds = _schedulePeriodBounds(/\blunch\b/i);
  const currentSec = _currentScheduleSeconds();
  return Number.isFinite(lunchBounds?.startSec)
    && Number.isFinite(lunchBounds?.endSec)
    && currentSec >= lunchBounds.startSec
    && currentSec < lunchBounds.endSec;
}

function _shouldShowLunchWeather() {
  if (_isNonInstructionalSchedule(scheduleType)) return false;
  const { startSec, endSec } = _lunchWeatherWindowSeconds();
  const currentSec = _currentScheduleSeconds();
  return Number.isFinite(startSec)
    && Number.isFinite(endSec)
    && endSec > startSec
    && currentSec >= startSec
    && currentSec < endSec;
}

function _syncLunchWeatherVisibility() {
  if (!_weatherCard) return false;
  const shouldShow = _shouldShowLunchWeather();
  if (!shouldShow) _weatherPayload = null;
  _weatherVisible = shouldShow;
  _weatherCard.hidden = !shouldShow;
  _weatherCard.setAttribute('aria-hidden', String(!shouldShow));
  _weatherCard.classList.toggle('is-lunch', shouldShow && _isLunchNow());
  return shouldShow;
}

function _renderLunchWeather(payload, state = 'ready') {
  if (!_weatherCard) return;
  if (state === 'error') _weatherPayload = null;
  else if (payload) _weatherPayload = payload;
  const activePayload = state === 'error' ? null : (payload || _weatherPayload);
  if (!_syncLunchWeatherVisibility()) return;
  _weatherCard.classList.toggle('is-loading', state === 'loading');
  if (_weatherAlert) _weatherAlert.textContent = state === 'error' ? 'Weather is not available right now' : _lunchWeatherAdvice(activePayload);
  if (_weatherAlertIcon) _weatherAlertIcon.textContent = activePayload ? _weatherGlyph(activePayload.code, activePayload.isDay !== false) : '🌤️';
  _renderLunchWeatherDetails(activePayload);
  if (_weatherTemp) _weatherTemp.textContent = activePayload ? `${activePayload.temp}°` : '--°';
  if (_weatherCondition) _weatherCondition.textContent = activePayload ? activePayload.condition : 'Loading forecast';
  if (_weatherMeta) {
    _weatherMeta.textContent = activePayload
      ? `Feels like ${activePayload.feelsLike}° · Wind ${activePayload.wind} mph · Rain ${activePayload.rainChance}%`
      : 'Feels like -- · Wind -- · Rain --';
  }
  if (_weatherSymbol) _setWeatherSymbol(_weatherSymbol, activePayload?.code ?? 0, activePayload?.isDay !== false);
  if (_weatherHours) {
    _weatherHours.innerHTML = '';
    const hours = activePayload?.hours?.length ? activePayload.hours : [
      { label: 'Now', temp: '--', code: 3, rainChance: null, isDay: true },
      { label: 'Next', temp: '--', code: 3, rainChance: null, isDay: true },
      { label: 'Later', temp: '--', code: 3, rainChance: null, isDay: true },
      { label: 'After', temp: '--', code: 3, rainChance: null, isDay: true }
    ];
    for (const hour of hours.slice(0, LUNCH_WEATHER_MAX_HOURS)) {
      const item = document.createElement('div');
      item.className = 'lunch-weather-hour';
      const label = document.createElement('span');
      label.textContent = hour.label;
      const icon = document.createElement('span');
      icon.className = 'weather-symbol weather-symbol--mini';
      icon.setAttribute('aria-hidden', 'true');
      _setWeatherSymbol(icon, hour.code, hour.isDay !== false);
      const temp = document.createElement('strong');
      temp.textContent = `${hour.temp}°`;
      const rain = document.createElement('span');
      rain.className = 'lunch-weather-rain';
      const hasRainChance = hour.rainChance !== null && hour.rainChance !== undefined && Number.isFinite(Number(hour.rainChance));
      const rainChance = hasRainChance ? Math.round(Number(hour.rainChance)) : null;
      rain.textContent = hasRainChance ? `${rainChance}%` : '--%';
      rain.setAttribute('aria-label', hasRainChance ? `${rainChance}% chance of rain` : 'Rain chance unavailable');
      item.append(label, icon, temp, rain);
      _weatherHours.appendChild(item);
    }
  }
}

async function _loadLunchWeather(forceFresh = false) {
  if (_weatherLoading || !_syncLunchWeatherVisibility()) return;
  const freshApi = _readLunchWeatherCache(LUNCH_WEATHER_CACHE_TTL_MS);
  const cachedApi = freshApi || _readLunchWeatherCache(LUNCH_WEATHER_STALE_TTL_MS);
  const cachedPayload = cachedApi ? _weatherPayloadFromApi(cachedApi) : null;
  if (cachedPayload) _renderLunchWeather(cachedPayload);
  else _renderLunchWeather(null, 'loading');
  if (freshApi && !forceFresh) {
    return;
  }
  if (_weatherRetryAt > Date.now()) {
    if (!cachedPayload) _renderLunchWeather(null, 'error');
    return;
  }
  _weatherLoading = true;
  try {
    const api = await _fetchLunchWeatherApi();
    _writeLunchWeatherCache(api);
    _weatherRetryAt = 0;
    _renderLunchWeather(_weatherPayloadFromApi(api));
  } catch (e) {
    console.warn('Lunch weather unavailable:', e);
    _weatherRetryAt = Date.now() + LUNCH_WEATHER_RETRY_COOLDOWN_MS;
    if (!cachedPayload) _renderLunchWeather(null, 'error');
  } finally {
    _weatherLoading = false;
  }
}

function _initLunchWeather() {
  _weatherCard = document.getElementById('lunch-weather');
  if (!_weatherCard) return;
  _weatherAlert = document.getElementById('lunch-weather-alert');
  _weatherAlertIcon = _weatherCard.querySelector('.weather-alert-mark');
  _weatherDetails = document.getElementById('lunch-weather-details');
  _weatherTemp = document.getElementById('lunch-weather-temp');
  _weatherCondition = document.getElementById('lunch-weather-condition');
  _weatherSymbol = document.getElementById('lunch-weather-symbol');
  _weatherHours = document.getElementById('lunch-weather-hours');
  _weatherMeta = document.getElementById('lunch-weather-meta');
  _syncLunchWeatherVisibility();
  if (_lunchWeatherInterval) clearInterval(_lunchWeatherInterval);
  _lunchWeatherInterval = setInterval(() => {
    if (document.visibilityState === 'visible') _loadLunchWeather();
  }, LUNCH_WEATHER_CACHE_TTL_MS);
  window.addEventListener('pagehide', () => {
    if (_lunchWeatherInterval) clearInterval(_lunchWeatherInterval);
    _lunchWeatherInterval = null;
  }, { once: true });
}

function _updateLunchWeatherMode() {
  if (!_weatherCard) return;
  const wasVisible = _weatherVisible;
  if (!_syncLunchWeatherVisibility()) return;
  if ((!wasVisible || !_weatherPayload) && !_weatherLoading) {
    _loadLunchWeather(!wasVisible);
    return;
  }
  if (_weatherPayload) _renderLunchWeather(_weatherPayload);
  if (_weatherPayload && _weatherAlert) _weatherAlert.textContent = _lunchWeatherAdvice(_weatherPayload);
  if (_weatherPayload && _weatherAlertIcon) _weatherAlertIcon.textContent = _weatherGlyph(_weatherPayload.code, _weatherPayload.isDay !== false);
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
  if (!_isLocalhost() || !['8080', '8096'].includes(location.port)) return false;
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

function _safeFrameUrl(value) {
  try {
    const url = new URL(String(value || '').trim(), location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    const allowedHosts = new Set(['schedulephs.web.app']);
    if (_isLocalhost()) {
      ['localhost', '127.0.0.1', '[::1]', '::1'].forEach(host => allowedHosts.add(host));
    }
    if (!allowedHosts.has(url.hostname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function _withGradeViewerEmbedVersion(value) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.href);
    if (url.hostname === 'schedulephs.web.app') {
      url.searchParams.set('phs_embed_v', GRADEVIEWER_EMBED_CACHE_BUST);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function _navHrefKind(href) {
  if (!href) return '';
  try {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return '';
    const path = url.pathname;
    if (/\/announcements\.html?$/i.test(path)) return 'announcements';
    if (/\/(?:gradeviewer|grademelon)(?:\.html?)?\/?$/i.test(path)) return 'grades';
    if (/\/(?:index\.html?|schedule)\/?$/i.test(path) || path.endsWith('/')) return 'schedule';
  } catch {
    if (/announcements\.html?/i.test(href)) return 'announcements';
    if (/(^|\/)(?:gradeviewer|grademelon)(?:\.html?)?\/?$/i.test(href)) return 'grades';
    if (/(^|\/)(?:index\.html?|schedule)\/?$/i.test(href) || href === '/') return 'schedule';
  }
  return '';
}

function _viewFromLocation() {
  const requested = (new URLSearchParams(location.search).get('_view') || location.hash.replace(/^#/, '') || '').toLowerCase();
  if (requested === 'announcements' || requested === 'grades' || requested === 'schedule') return requested;
  const kind = _navHrefKind(location.pathname);
  return kind === 'announcements' || kind === 'grades' ? kind : 'schedule';
}

function _routeForView(view) {
  if (view === 'announcements') return 'announcements.html';
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

function _titleForView(view) {
  if (view === 'announcements') return 'Announcements - PHS';
  if (view === 'grades') return window.__SITE_SETTINGS__?.grades?.pageTitle || 'Grades - PHS';
  return window.__SITE_SETTINGS__?.branding?.siteTitle || 'PHS Schedule';
}

function _applyViewTitle(view = _siteView) {
  document.title = _titleForView(view);
}

function _showSiteView(view, opts = {}) {
  const nextView = view === 'announcements' || view === 'grades' ? view : 'schedule';
  if (_siteView && _siteView !== nextView) _siteViewScroll[_siteView] = window.scrollY || 0;
  _siteView = nextView;

  document.body.classList.toggle('site-view-announcements', nextView === 'announcements');
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
    _ensureGradesFrame();
  } else if (nextView === 'announcements') {
    _renderAnnouncements(window.__SITE_SETTINGS__ || null);
  } else if (data) {
    updateAll();
  }
  _applyViewTitle(nextView);

  if (opts.restoreScroll !== false) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: _siteViewScroll[nextView] || 0, left: 0, behavior: 'auto' });
      if (nextView === 'grades') _scheduleGradesFrameSize();
    });
  }
}

function _initKeepAliveTabs() {
  if (!document.querySelector('[data-site-view]')) return;
  _siteView = _viewFromLocation();
  _showSiteView(_siteView, { replace: true, restoreScroll: false });

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target?.nodeType === Node.ELEMENT_NODE ? event.target : event.target?.parentElement;
    const link = target?.closest?.('#nav-links a');
    if (!link || (link.target && link.target !== '_self')) return;
    const kind = _navHrefKind(link.getAttribute('href'));
    if (kind !== 'announcements' && kind !== 'schedule' && kind !== 'grades') return;
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

function _escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function _setStyledText(el, target, text) {
  if (!el) return;
  if (window.PhsTextStyle?.setText) window.PhsTextStyle.setText(el, target, text);
  else el.textContent = String(text ?? '');
}

function _hasTextStyleRuns(target) {
  return Boolean(window.PhsTextStyle?.hasLetterStyles?.(target));
}

function _renderAnnouncements(settings) {
  const list = document.getElementById('announcements-list');
  if (!list) return;
  const configured = settings?.announcements?.items;
  const sourceItems = Array.isArray(configured) && configured.length
    ? configured
    : FALLBACK_ANNOUNCEMENTS.announcements.items;
  const today = _todayISODate();
  const items = sourceItems.map((item, index) => ({ item, index })).filter(({ item }) => {
    const showFrom = String(item.showFrom || '').trim();
    const expiresOn = String(item.expiresOn || '').trim();
    return (!showFrom || today >= showFrom) && (!expiresOn || today <= expiresOn);
  });
  if (!items.length) {
    list.innerHTML = '<div class="announcements-empty">No announcements yet.</div>';
    return;
  }
  list.innerHTML = items.map(({ item, index }) => {
    const bulletItems = Array.isArray(item.bullets) ? item.bullets : [];
    const bullets = bulletItems.map((bullet, bulletIndex) => `<li data-studio-key="announcementBullet" data-text-style="announcementBullet" data-studio-label="Announcement ${index + 1} bullet ${bulletIndex + 1}" data-studio-paths="announcements.items,appearance.textStyles.targets.announcementBullet" data-studio-text-path="announcements.items.${index}.bullets.${bulletIndex}">${_escapeHtml(bullet)}</li>`).join('');
    return `<div class="announcement-card" data-studio-key="announcementCard" data-studio-label="Announcement ${index + 1} card" data-studio-paths="announcements.items">
      <div class="announcement-title" data-studio-key="announcementTitle" data-text-style="announcementTitle" data-studio-label="Announcement ${index + 1} title" data-studio-paths="announcements.items,appearance.textStyles.targets.announcementTitle" data-studio-text-path="announcements.items.${index}.title">${_escapeHtml(item.title || '')}</div>
      <div class="announcement-content"><ul>${bullets}</ul></div>
    </div>`;
  }).join('');
  window.PhsTextStyle?.applyAll?.(list);
}

function _initAnnouncementsView() {
  const list = document.getElementById('announcements-list');
  if (!list) return;
  document.addEventListener('site-settings:applied', event => _renderAnnouncements(event.detail));
  if (window.__SITE_SETTINGS__) _renderAnnouncements(window.__SITE_SETTINGS__);
  window.setTimeout(() => {
    if (/Loading/.test(list.textContent || '') && !window.__SITE_SETTINGS__) {
      _renderAnnouncements(FALLBACK_ANNOUNCEMENTS);
    }
  }, 2500);
}

function _analyticsPageName() {
  const path = location.pathname.toLowerCase();
  const hash = location.hash.toLowerCase();
  if (path.includes('announcement') || hash.includes('announcement')) return 'announcements';
  if (path.includes('grade') || hash.includes('grade')) return 'grades';
  if (path.includes('privacy') || hash.includes('privacy')) return 'privacy';
  return 'schedule';
}

function _analyticsDeviceType() {
  const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  if (width < 760) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

function _analyticsEndpoint() {
  return _isLocalhost() ? '/analytics/event' : `${_BACKEND_URL}/analytics/event`;
}

function _sendAnalyticsEvent(payload) {
  if (new URLSearchParams(location.search).has('_preview')) return;
  if (_isLocalhost()) return;
  const endpoint = _analyticsEndpoint();
  const body = JSON.stringify({
    page: _analyticsPageName(),
    device: _analyticsDeviceType(),
    ...payload
  });
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
  } catch {}
  try {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  } catch {}
}

function _initFirstPartyAnalytics() {
  if (new URLSearchParams(location.search).has('_preview')) return;
  const start = Date.now();
  let sentDuration = false;
  _sendAnalyticsEvent({ type: 'view' });
  const sendDuration = () => {
    if (sentDuration) return;
    sentDuration = true;
    _sendAnalyticsEvent({ type: 'duration', durationSeconds: Math.max(1, Math.round((Date.now() - start) / 1000)) });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDuration();
  });
  window.addEventListener('pagehide', sendDuration);
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
  const applyGeneration = ++_gradesFrameApplyGeneration;
  const localUrl = settings?.grades?.iframeUrlLocal || (_isLocalhost() ? GRADEVIEWER_DEFAULT_LOCAL_URL : '');
  const prodUrl = _withGradeViewerEmbedVersion(settings?.grades?.iframeUrlProd || GRADEVIEWER_DEFAULT_PROD_URL);
  let url = _safeFrameUrl(_isLocalhost() ? localUrl : prodUrl);
  if (_isLocalhost() && (!localUrl || !(await _localGradeMelonAvailable()))) url = prodUrl;
  url = _safeFrameUrl(url);
  if (applyGeneration !== _gradesFrameApplyGeneration || _gradesFrameUrlLocked) return;
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
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const minHeight = window.matchMedia('(max-width: 640px)').matches ? 420 : 720;
  const h = Math.max(minHeight, viewportHeight - top - 24);
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
    _safeFrameUrl(settings?.grades?.iframeUrlLocal),
    _safeFrameUrl(settings?.grades?.iframeUrlProd),
    GRADEVIEWER_DEFAULT_PROD_URL
  ];
  if (_isLocalhost()) {
    list.push(GRADEVIEWER_DEFAULT_LOCAL_URL, 'http://localhost:3001', 'http://127.0.0.1:3001');
  }
  return list.some(url => {
    try { return url && new URL(url).origin === origin; }
    catch { return false; }
  });
}

function _readAppearanceForGrades() {
  try {
    const raw = JSON.parse(localStorage.getItem('phs:appearance:v3') || '{}');
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

function _gradesFrameReachedTargetOrigin(targetOrigin) {
  try {
    return _gradesFrame.contentWindow.location.origin === targetOrigin;
  } catch {
    return true;
  }
}

function _postThemeToGradesFrame() {
  if (!_gradesFrame?.contentWindow) return;
  const targetOrigin = _gradesFrameTargetOrigin();
  if (!targetOrigin || targetOrigin === 'null') return;
  if (!_gradesFrameReachedTargetOrigin(targetOrigin)) return;
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
    if (event.key === 'phs:appearance:v3') _postThemeToGradesFrame();
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
  // In Theme Studio preview we KEEP the dev clock — it's how you simulate a school
  // day / time so the ring, periods, and in-session states actually appear to style.
  // It's docked bottom-right + dimmed via .phs-studio-preview CSS so it stays out of the way.
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
  const adminPanel = document.getElementById('admin-panel');
  const adminBody = document.getElementById('admin-body');
  const adminCollapse = document.getElementById('admin-collapse');
  const setAdminCollapsed = (nextCollapsed) => {
    collapsed = nextCollapsed;
    adminPanel.classList.toggle('is-collapsed', collapsed);
    adminBody.style.display = collapsed ? 'none' : 'flex';
    adminCollapse.textContent = collapsed ? '▸' : '▾';
  };
  const collapseAdminOnCompactViewport = () => {
    if (window.innerWidth <= 640) setAdminCollapsed(true);
  };
  adminCollapse.addEventListener('click', () => setAdminCollapsed(!collapsed));
  window.addEventListener('resize', collapseAdminOnCompactViewport);
  collapseAdminOnCompactViewport();
  if (_IS_STUDIO_PREVIEW) setAdminCollapsed(true);

  const ampmBtn = document.getElementById('admin-ampm');
  ampmBtn.addEventListener('click', () => {
    ampmBtn.textContent = ampmBtn.textContent === 'AM' ? 'PM' : 'AM';
    ampmBtn.classList.toggle('admin-ampm-btn--pm', ampmBtn.textContent === 'PM');
  });

  document.getElementById('admin-apply').addEventListener('click', () => {
    let h = parseInt(document.getElementById('admin-h').value, 10) || 12;
    const m = parseInt(document.getElementById('admin-m').value, 10) || 0;
    const s = parseInt(document.getElementById('admin-s').value, 10) || 0;
    const isPM = ampmBtn.textContent === 'PM';
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    const targetSec = h * 3600 + m * 60 + s;
    const now = new Date();
    const realSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    _timeOffsetSeconds = targetSec - realSec;
    const pad = (n) => String(n).padStart(2, '0');
    const dispH = parseInt(document.getElementById('admin-h').value, 10) || 12;
    document.getElementById('admin-status').textContent = `Set → ${dispH}:${pad(m)}:${pad(s)} ${ampmBtn.textContent}`;
    updateAll();
    _loadLunchWeather(true);
    collapseAdminOnCompactViewport();
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
    _loadLunchWeather(true);
    collapseAdminOnCompactViewport();
  });

  document.getElementById('admin-schedule-type').addEventListener('change', (event) => {
    _devScheduleType = event.target.value || null;
    _setAdminStatus(_devScheduleType ? `Testing ${_devScheduleType}` : 'Auto schedule');
    _weatherPayload = null;
    updateAll();
    _loadLunchWeather(true);
  });
}

/* --- Cache DOM refs --- */
const domRefs = {
  hmEl: null,
  sEl: null,
  heroTitle: null,
  heroEyebrow: null,
  signatureTitle: null,
  signatureEyebrow: null,
  ringFill: null,
  statusPill: null,
  statusLabel: null,
  schedTitle: null,
  schedDate: null,
  periodList: null
};
let _handwritingFontPromise = null;
let _handwritingLibraryPromise = null;
let _heroScriptDrawId = 0;
let _heroScriptRequestId = 0;
const HOMEPAGE_INTRO_COPY = 'poolesville.web';
const HOMEPAGE_INTRO_SEEN_KEY = 'phs:homepage-intro-seen:v1';
let _homepageIntroMotionReady = false;
let _homepageIntroDataReady = false;
let _homepageIntroRenderDeferred = false;
let _homepageIntroExitTimer = 0;

function _homepageIntroDelay(min, max) {
  const duration = Math.round(min + Math.random() * (max - min));
  return new Promise(resolve => setTimeout(resolve, duration));
}

function _randomizeHomepageIntroBackground(root) {
  const range = (min, max) => min + Math.random() * (max - min);
  const percent = (value) => `${Math.round(value)}%`;
  const degree = (value) => `${Math.round(value)}deg`;
  const number = (value) => value.toFixed(2);
  const targets = [document.documentElement, root].filter(Boolean);
  const setShaderProperty = (name, value) => {
    for (const target of targets) target.style.setProperty(name, value);
  };
  const patterns = [
    { conic: [48, 42], glowA: [22, 36], glowB: [70, 28], glowC: [48, 86], shadow: 82 },
    { conic: [38, 58], glowA: [62, 30], glowB: [20, 66], glowC: [80, 78], shadow: 108 },
    { conic: [58, 54], glowA: [30, 76], glowB: [76, 46], glowC: [42, 22], shadow: 64 },
    { conic: [50, 34], glowA: [74, 24], glowB: [34, 44], glowC: [58, 84], shadow: 132 },
    { conic: [46, 66], glowA: [18, 28], glowB: [80, 64], glowC: [44, 82], shadow: 44 }
  ];
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  const randomPoint = (point, amount) => Math.random() < 0.45
    ? [range(14, 86), range(14, 86)]
    : [jitter(point[0], amount), jitter(point[1], amount)];
  const jitter = (value, amount = 10) => Math.max(12, Math.min(88, value + range(-amount, amount)));
  const size = (wMin, wMax, hMin, hMax) => `${Math.round(range(wMin, wMax))}% ${Math.round(range(hMin, hMax))}%`;
  const conicPoint = randomPoint(pattern.conic, 20);
  const glowPointA = randomPoint(pattern.glowA, 24);
  const glowPointB = randomPoint(pattern.glowB, 24);
  const glowPointC = randomPoint(pattern.glowC, 24);

  setShaderProperty('--homepage-conic-from', degree(range(0, 360)));
  setShaderProperty('--homepage-conic-x', percent(conicPoint[0]));
  setShaderProperty('--homepage-conic-y', percent(conicPoint[1]));
  setShaderProperty('--homepage-conic-blur', `${Math.round(range(24, 48))}px`);
  setShaderProperty('--homepage-conic-opacity', number(range(0.76, 0.98)));
  setShaderProperty('--homepage-conic-scale-a', number(range(1.16, 1.28)));
  setShaderProperty('--homepage-conic-scale-b', number(range(1.26, 1.42)));
  setShaderProperty('--homepage-conic-rotate-a', degree(range(-14, 8)));
  setShaderProperty('--homepage-conic-rotate-b', degree(range(-4, 18)));
  setShaderProperty('--homepage-glow-a-x', percent(glowPointA[0]));
  setShaderProperty('--homepage-glow-a-y', percent(glowPointA[1]));
  setShaderProperty('--homepage-glow-a-size', size(44, 90, 30, 68));
  setShaderProperty('--homepage-glow-a-strength', `${Math.round(range(16, 30))}%`);
  setShaderProperty('--homepage-glow-b-x', percent(glowPointB[0]));
  setShaderProperty('--homepage-glow-b-y', percent(glowPointB[1]));
  setShaderProperty('--homepage-glow-b-size', size(48, 96, 34, 70));
  setShaderProperty('--homepage-glow-c-x', percent(glowPointC[0]));
  setShaderProperty('--homepage-glow-c-y', percent(glowPointC[1]));
  setShaderProperty('--homepage-glow-c-size', size(52, 104, 38, 78));
  setShaderProperty('--homepage-vignette-x', percent(range(28, 76)));
  setShaderProperty('--homepage-vignette-y', percent(range(30, 78)));
  setShaderProperty('--homepage-shadow-angle', degree(Math.random() < 0.5 ? range(0, 360) : pattern.shadow + range(-28, 28)));
  setShaderProperty('--homepage-texture-size', `${Math.round(range(28, 42))}px`);
  setShaderProperty('--homepage-texture-opacity', number(range(0.055, 0.1)));
  setShaderProperty('--homepage-texture-drift-x', `${Math.round(range(-44, 44))}px`);
  setShaderProperty('--homepage-texture-drift-y', `${Math.round(range(-44, 44))}px`);
  setShaderProperty('--homepage-move-x-a', percent(range(-7, 7)));
  setShaderProperty('--homepage-move-y-a', percent(range(-6, 6)));
  setShaderProperty('--homepage-move-x-b', percent(range(-7, 7)));
  setShaderProperty('--homepage-move-y-b', percent(range(-6, 6)));
}

async function _homepageIntroTypeTo(textEl, targetLength) {
  while (textEl.textContent.length < targetLength) {
    textEl.textContent = HOMEPAGE_INTRO_COPY.slice(0, textEl.textContent.length + 1);
    await _homepageIntroDelay(30, 48);
  }
}

function _finishHomepageIntro(root) {
  if (!root || root.dataset.finished === 'true') return;
  root.dataset.finished = 'true';
  if (_homepageIntroRenderDeferred && data) {
    _homepageIntroRenderDeferred = false;
    updateAll();
  }
  root.classList.add('is-exiting');
  setTimeout(() => root.remove(), 720);
}

function _hasSeenHomepageIntro() {
  try { return sessionStorage.getItem(HOMEPAGE_INTRO_SEEN_KEY) === 'true'; }
  catch { return false; }
}

function _markHomepageIntroSeen() {
  try {
    sessionStorage.setItem(HOMEPAGE_INTRO_SEEN_KEY, 'true');
  } catch {}
}

function _maybeFinishHomepageIntro() {
  if (!_homepageIntroMotionReady || !_homepageIntroDataReady) return;
  const root = document.getElementById('homepage-intro');
  if (!root) return;
  clearTimeout(_homepageIntroExitTimer);
  _homepageIntroExitTimer = setTimeout(() => _finishHomepageIntro(root), 20);
}

function _markHomepageIntroDataReady() {
  _homepageIntroDataReady = true;
  _maybeFinishHomepageIntro();
}

function _updateAllOrDeferForHomepageIntro() {
  const root = document.getElementById('homepage-intro');
  if (root && !root.classList.contains('is-exiting')) {
    _homepageIntroRenderDeferred = true;
    return;
  }
  updateAll();
}

function _renderScheduleDataUnavailable(error) {
  console.warn('Schedule data unavailable:', error);
  document.title = 'Schedule unavailable | PHS';
  document.body.classList.add('schedule-terminal-state');
  document.body.classList.remove('schedule-no-school-state', 'schedule-ended-state');
  _setTimerSurfaceVisible(false);
  _clearCountdownDisplay();
  if (domRefs.heroEyebrow) setHeroLine('eyebrow', '', false);
  if (domRefs.heroTitle) setHeroLine('title', 'Schedule unavailable', true, { fontSize: 96, revealStroke: 40 });
  if (domRefs.statusPill && domRefs.statusLabel) {
    domRefs.statusPill.style.display = 'inline-flex';
    domRefs.statusPill.dataset.status = 'off';
    _setStyledText(domRefs.statusLabel, 'statusLabel', 'Refresh to retry');
  }
  _setStyledText(domRefs.schedTitle, 'scheduleTitle', 'Schedule unavailable');
  _setStyledText(domRefs.schedDate, 'scheduleDate', '');
  if (domRefs.periodList) {
    domRefs.periodList.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'period-card period-card--empty';
    li.textContent = 'Could not load bell schedule data';
    domRefs.periodList.appendChild(li);
  }
}

async function _runHomepageIntro(root, textEl) {
  root.classList.add('is-running');

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    textEl.textContent = HOMEPAGE_INTRO_COPY;
    _homepageIntroMotionReady = true;
    _maybeFinishHomepageIntro();
    return;
  }

  textEl.textContent = '';
  const finalLength = HOMEPAGE_INTRO_COPY.length;
  await _homepageIntroTypeTo(textEl, finalLength);
  _homepageIntroMotionReady = true;
  _maybeFinishHomepageIntro();
}

function _initHomepageIntro() {
  const root = document.getElementById('homepage-intro');
  const textEl = document.getElementById('homepage-intro-text');
  if (!root || !textEl) return;
  _randomizeHomepageIntroBackground(root);
  if (_hasSeenHomepageIntro()) {
    document.documentElement.classList.add('homepage-intro-skip');
    root.remove();
    return;
  }
  _markHomepageIntroSeen();
  _runHomepageIntro(root, textEl).catch(() => _finishHomepageIntro(root));
}

function getSignatureFont() {
  if (_handwritingFontPromise) return _handwritingFontPromise;

  _handwritingFontPromise = loadSignatureLibrary().then((opentypeApi) => new Promise((resolve, reject) => {
    opentypeApi.load(SIGNATURE_FONT_URL, (err, font) => {
      if (err || !font) reject(err || new Error('Signature font did not load'));
      else resolve(font);
    });
  }));
  return _handwritingFontPromise;
}

function loadSignatureLibrary() {
  if (window.opentype) return Promise.resolve(window.opentype);
  if (_handwritingLibraryPromise) return _handwritingLibraryPromise;

  _handwritingLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = OPENTYPE_SCRIPT_URL;
    script.async = true;
    script.onload = () => window.opentype ? resolve(window.opentype) : reject(new Error('opentype.js did not initialize'));
    script.onerror = () => reject(new Error('opentype.js failed to load'));
    document.head.appendChild(script);
  });
  return _handwritingLibraryPromise;
}

function smootherStep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function updateHeroSignatureLayout() {
  const wrapper = document.querySelector('.hero-title-wrapper');
  if (!wrapper) return;

  const pendingEyebrow = Boolean(domRefs.signatureEyebrow?.dataset.pendingHeroScriptText);
  const pendingTitle = Boolean(domRefs.signatureTitle?.dataset.pendingHeroScriptText);
  const visibleEyebrow = Boolean(domRefs.signatureEyebrow?.classList.contains('is-visible'));
  const visibleTitle = Boolean(domRefs.signatureTitle?.classList.contains('is-visible'));
  const layoutCount = Number(visibleEyebrow || pendingEyebrow) + Number(visibleTitle || pendingTitle);
  const visibleCount = Number(visibleEyebrow) + Number(visibleTitle);

  wrapper.classList.toggle('signature-ready', visibleCount > 0);
  wrapper.classList.toggle('signature-pending', pendingEyebrow || pendingTitle);
  wrapper.classList.toggle('signature-single', layoutCount === 1);
  wrapper.classList.toggle('signature-double', layoutCount === 2);
}

function setHeroLine(line, text, visible, options = {}) {
  const isEyebrow = line === 'eyebrow';
  const fallback = isEyebrow ? domRefs.heroEyebrow : domRefs.heroTitle;
  const stage = isEyebrow ? domRefs.signatureEyebrow : domRefs.signatureTitle;
  const styleTarget = isEyebrow ? 'heroEyebrow' : 'heroTitle';
  const hasLetterStyles = _IS_STUDIO_PREVIEW || _hasTextStyleRuns(styleTarget);

  if (!fallback) return;

  _setStyledText(fallback, styleTarget, text);
  fallback.style.display = visible ? 'block' : 'none';
  fallback.classList.toggle('signature-fallback-hidden', Boolean(stage && visible && !hasLetterStyles));

  if (!stage) return;
  if (!visible) {
    delete stage.dataset.pendingHeroScriptText;
    delete stage.dataset.heroScriptRequestId;
    stage.classList.remove('is-visible', 'is-complete');
    stage.innerHTML = '';
    fallback.classList.remove('signature-fallback-hidden');
    if (isEyebrow) renderState.lastSignedEyebrow = '';
    else renderState.lastSignedTitle = '';
    updateHeroSignatureLayout();
    return;
  }

  if (hasLetterStyles) {
    delete stage.dataset.pendingHeroScriptText;
    delete stage.dataset.heroScriptRequestId;
    stage.classList.remove('is-visible', 'is-complete');
    stage.innerHTML = '';
    fallback.classList.remove('signature-fallback-hidden');
    updateHeroSignatureLayout();
    return;
  }

  const currentText = isEyebrow ? renderState.lastSignedEyebrow : renderState.lastSignedTitle;
  if (currentText === text && (stage.classList.contains('is-visible') || stage.dataset.pendingHeroScriptText === text)) return;

  if (isEyebrow) renderState.lastSignedEyebrow = text;
  else renderState.lastSignedTitle = text;

  const requestId = String(++_heroScriptRequestId);
  stage.dataset.pendingHeroScriptText = text;
  stage.dataset.heroScriptRequestId = requestId;
  stage.classList.remove('is-visible', 'is-complete');
  stage.innerHTML = '';
  updateHeroSignatureLayout();

  signHeroText(stage, text, options, requestId).catch((error) => {
    console.warn('Signature renderer fallback:', error);
    if (stage.dataset.heroScriptRequestId !== requestId) return;
    delete stage.dataset.heroScriptRequestId;
    delete stage.dataset.pendingHeroScriptText;
    stage.classList.remove('is-visible', 'is-complete');
    stage.innerHTML = '';
    fallback.classList.remove('signature-fallback-hidden');
    updateHeroSignatureLayout();
  });
}

async function signHeroText(target, text, options = {}, requestId = '') {
  const phrase = String(text || '').trim();
  if (!target || !phrase) return;

  target.dataset.pendingHeroScriptText = phrase;
  const font = await getSignatureFont();
  if (target.dataset.pendingHeroScriptText !== phrase) return;
  if (requestId && target.dataset.heroScriptRequestId !== requestId) return;

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

  const bounds = glyphPaths.reduce((acc, path) => {
    const box = path.getBoundingBox();
    return {
      x1: Math.min(acc.x1, box.x1),
      y1: Math.min(acc.y1, box.y1),
      x2: Math.max(acc.x2, box.x2),
      y2: Math.max(acc.y2, box.y2)
    };
  }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
  const { x1, y1, x2, y2 } = bounds;

  const padX = fontSize * 0.28;
  const padTop = fontSize * 0.72;
  const padBottom = fontSize * 0.38;
  const viewX = x1 - padX;
  const viewY = y1 - padTop;
  const viewW = (x2 - x1) + padX * 2;
  const viewH = (y2 - y1) + padTop + padBottom;
  const viewBox = `${viewX} ${viewY} ${viewW} ${viewH}`;
  const ns = 'http://www.w3.org/2000/svg';
  const runId = ++_heroScriptDrawId;
  const maskId = `signature-mask-${runId}`;
  const gradId = `signature-brush-${runId}`;

  if (requestId && target.dataset.heroScriptRequestId !== requestId) return;
  if (target._signatureRaf) cancelAnimationFrame(target._signatureRaf);
  target.innerHTML = '';
  target.dataset.heroScriptText = phrase;
  delete target.dataset.pendingHeroScriptText;
  target.classList.remove('is-complete');
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
  if (requestId && target.dataset.heroScriptRequestId !== requestId) return;
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
    if (requestId && target.dataset.heroScriptRequestId !== requestId) return;
    brush.setAttribute('width', String(viewW + brushWidth));
    glintGroup.style.opacity = '0';
    target.classList.add('is-complete');
    updateHeroSignatureLayout();
    return;
  }

  const startTime = performance.now();
  const animate = (now) => {
    if (requestId && target.dataset.heroScriptRequestId !== requestId) return;
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
      target.classList.add('is-complete');
      updateHeroSignatureLayout();
    }
  };

  target._signatureRaf = requestAnimationFrame(animate);
  setTimeout(() => {
    if (target.dataset.heroScriptText !== phrase) return;
    if (requestId && target.dataset.heroScriptRequestId !== requestId) return;
    brush.setAttribute('width', String(viewW + brushWidth));
    glintGroup.style.opacity = '0';
    target.classList.add('is-complete');
    updateHeroSignatureLayout();
  }, totalDuration + 350);
}

async function main() {
  try {
    domRefs.hmEl = document.getElementById('cd-hm');
    domRefs.sEl = document.getElementById('cd-s');
    domRefs.heroTitle = document.getElementById('hero-title');
    domRefs.heroEyebrow = document.querySelector('.hero-eyebrow');
    domRefs.signatureTitle = document.getElementById('signature-title');
    domRefs.signatureEyebrow = document.getElementById('signature-eyebrow');
    domRefs.ringFill = document.getElementById('ring-fill');
    domRefs.statusPill = document.getElementById('status-pill');
    domRefs.statusLabel = document.getElementById('status-label');
    domRefs.schedTitle = document.getElementById('schedule-title');
    domRefs.schedDate = document.getElementById('schedule-date');
    domRefs.periodList = document.getElementById('period-list');
    _initAnnouncementsView();

    const isSchedulePage = Boolean(domRefs.hmEl && domRefs.sEl && domRefs.ringFill && domRefs.schedTitle && domRefs.periodList);
    if (!isSchedulePage) return;

    _initKeepAliveTabs();
    _prepareCountdownDisplay();
    _initLunchWeather();

    _clearOldScheduleDataCaches();
    const cachedData = _readScheduleDataCache();
    if (cachedData) {
      data = cachedData;
    }

    try {
      const response = await fetch('data.json', {
        cache: 'no-cache',
        signal: _timeoutSignal(SCHEDULE_DATA_FETCH_TIMEOUT_MS)
      });
      const freshData = await response.json();
      if (!_isScheduleDataShape(freshData)) throw new Error('Invalid schedule data shape');
      if (freshData && typeof freshData === 'object') {
        data = freshData;
        _writeScheduleDataCache(freshData);
      }
    } catch (fetchError) {
      if (!data) {
        _renderScheduleDataUnavailable(fetchError);
        _markHomepageIntroDataReady();
        return;
      }
      console.warn('Using cached schedule data:', fetchError);
    }

    if (window.PhsSettingsReady && typeof window.PhsSettingsReady.then === 'function') {
      try { await window.PhsSettingsReady; } catch {}
    }

    _initAdminPanel();
    _scheduleOverride = _readSettingsScheduleOverride() || _readStoredScheduleOverride();
    _updateAllOrDeferForHomepageIntro();
    _markHomepageIntroDataReady();
    _pollScheduleOverride();
    _overrideInterval = setInterval(() => {
      if (!_IS_ADMIN_PREVIEW && document.visibilityState === 'visible') _pollScheduleOverride();
    }, OVERRIDE_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!_IS_ADMIN_PREVIEW) _pollScheduleOverride();
        updateAll();
      }
    });
  } catch (e) {
    console.error("Initialization failed:", e);
    _markHomepageIntroDataReady();
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
  const date = _currentScheduleDate();
  let val = _clockSeconds(date);

  let arr = _getScheduleDataForDate(date);
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
  isTimerInactive = false;

  const periodEntries = _getPeriodEntries(periods);
  myArray = periodEntries;

  isBeforeSchool = false;
  isTransition = false;

  if (!periodEntries.length) {
    _resetTimerState();
    scheduleType = arr[0];
    return;
  }

  const activePeriod = periodEntries.find(p => val >= p.startSec && val < p.endSec);
  const nextPeriod = periodEntries.find(p => p.startSec > val);
  const lastPeriod = periodEntries[periodEntries.length - 1];

  if (val < periodEntries[0].startSec) {
    goal = periodEntries[0].startSec;
    period = "Before School";
    periodStartTime = 0;
    periodEndTime = periodEntries[0].startSec;
    isBeforeSchool = true;
  } else if (activePeriod) {
    period = activePeriod.name;
    goal = activePeriod.endSec;
    periodStartTime = activePeriod.startSec;
    periodEndTime = activePeriod.endSec;
  } else if (nextPeriod) {
    period = "Transition";
    goal = nextPeriod.startSec;
    let previousPeriod = lastPeriod;
    for (let i = periodEntries.length - 1; i >= 0; i -= 1) {
      if (periodEntries[i].endSec <= val) {
        previousPeriod = periodEntries[i];
        break;
      }
    }
    periodStartTime = previousPeriod.endSec;
    periodEndTime = nextPeriod.startSec;
    isTransition = true;
  } else {
    period = lastPeriod.name;
    goal = lastPeriod.endSec;
    periodStartTime = lastPeriod.startSec;
    periodEndTime = lastPeriod.endSec;
  }
}

/* --------------------------------------------------------------------------
   Render layer
   -------------------------------------------------------------------------- */

function updateAll() {
  if (!data) return;
  calculateGoal();
  _updateLunchWeatherMode();

  const date = _currentScheduleDate();
  let val = _clockSeconds(date);
  let timeleft = Math.max(0, goal - val);

  let h = Math.floor(timeleft / 3600);
  let m = Math.floor((timeleft % 3600) / 60);
  let s = timeleft % 60;

  /* --- Timer terminal states --- */
  const noSchool = _isNonInstructionalSchedule(scheduleType);
  const dayIsOver = !noSchool && (timeleft <= 0 && !isBeforeSchool);
  isTimerInactive = noSchool || dayIsOver;
  document.body.classList.toggle('schedule-terminal-state', isTimerInactive);
  document.body.classList.toggle('schedule-no-school-state', noSchool);
  document.body.classList.toggle('schedule-ended-state', dayIsOver);

  if (isTimerInactive) {
    h = 0; m = 0; s = 0;
    _clearCountdownDisplay();
  }
  _setTimerSurfaceVisible(!isTimerInactive);

  /* --- Countdown --- */
  if (domRefs.hmEl && !isTimerInactive) {
    const u = (t) => `<span class="cd-min-label">${t}</span>`;
    const hm = h > 0
      ? `${h}${u('h')}${m > 0 ? (m < 10 ? '&nbsp;' : '') + m + u('m') : ''}`
      : `${m}${u('m')}`;
    if (hm !== renderState.lastHm) { domRefs.hmEl.innerHTML = hm; renderState.lastHm = hm; }

    const ss = String(s).padStart(2, '0');
    if (ss !== renderState.lastS && domRefs.sEl) {
      domRefs.sEl.innerHTML = `${ss}<span class="cd-sec-label" style="margin-left:3px">s</span>`;
      renderState.lastS = ss;
    }
  }

  if (_siteView === 'schedule') {
    document.title = isTimerInactive
      ? `${noSchool ? scheduleType : 'Done'} | PHS`
      : (h === 0
        ? `${m}:${String(s).padStart(2, '0')} PHS`
        : `${h}:${String(m).padStart(2, '0')} PHS`);
  }

  /* --- Hero text & Status --- */
  if (domRefs.heroTitle && domRefs.heroEyebrow && domRefs.statusPill && domRefs.statusLabel) {
    if (noSchool) {
      setHeroLine('eyebrow', '', false);
      setHeroLine('title', 'No School', true, { fontSize: 178, revealStroke: 78 });

      domRefs.statusPill.style.display = "inline-flex";
      domRefs.statusPill.dataset.status = "off";
      _setStyledText(domRefs.statusLabel, 'statusLabel', _heroSettings.noSchoolStatusText || "Enjoy your day");
    } else if (dayIsOver) {
      setHeroLine('eyebrow', '', false);
      setHeroLine('title', 'School Day Ended', true, { fontSize: 178, revealStroke: 78 });

      domRefs.statusPill.style.display = "inline-flex";
      domRefs.statusPill.dataset.status = "off";
      _setStyledText(domRefs.statusLabel, 'statusLabel', _getNextSchoolDayLabel(date));
    } else if (isBeforeSchool) {
      setHeroLine('eyebrow', 'Starts in', true, { fontSize: 112, revealStroke: 52 });
      setHeroLine('title', '', false);
      domRefs.statusPill.style.display = "none";
    } else {
      setHeroLine('eyebrow', isTransition ? "Passing" : "Currently in", true, { fontSize: 112, revealStroke: 52 });
      setHeroLine('title', period, true, { fontSize: 142, revealStroke: 62 });

      domRefs.statusPill.style.display = "inline-flex";
      if (isTransition) {
        domRefs.statusPill.dataset.status = "passing";
        _setStyledText(domRefs.statusLabel, 'statusLabel', "Next period soon");
      } else if (timeleft <= 60 && timeleft > 0) {
        domRefs.statusPill.dataset.status = "urgent";
        _setStyledText(domRefs.statusLabel, 'statusLabel', "Ending Soon");
      } else {
        domRefs.statusPill.dataset.status = "live";
        _setStyledText(domRefs.statusLabel, 'statusLabel', "In Session");
      }
    }
  }

  /* --- Ring --- */
  if (domRefs.ringFill && periodEndTime > periodStartTime) {
    const elapsed = val - periodStartTime;
    const total = periodEndTime - periodStartTime;
    const pctRemaining = Math.min(1, Math.max(0, 1 - elapsed / total));
    const arcLen = pctRemaining * 100;
    domRefs.ringFill.style.strokeDasharray = `${arcLen} 100`;
    domRefs.ringFill.style.strokeDashoffset = '0';
  } else if (domRefs.ringFill) {
    domRefs.ringFill.style.strokeDasharray = '0 100';
    domRefs.ringFill.style.strokeDashoffset = '0';
  }

  /* --- Schedule header --- */
  _setStyledText(domRefs.schedTitle, 'scheduleTitle', scheduleType);
  if (domRefs.schedDate) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    _setStyledText(domRefs.schedDate, 'scheduleDate', `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`);
  }
  _renderScheduleDifferenceBanner(date);

  /* --- Period list --- */
  renderPeriodList(val);
  _setClockCadence(!isTimerInactive);
}

function renderPeriodList(currentSeconds) {
  if (!domRefs.periodList) return;
  if (myArray.length === 0) {
    const emptyLabel = _isNonInstructionalSchedule(scheduleType)
      ? 'No bell schedule today'
      : 'No remaining bell schedule';
    if (renderState.lastPeriodCount !== 0 || domRefs.periodList.dataset.emptyLabel !== emptyLabel) {
      domRefs.periodList.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'period-card period-card--empty';
      li.textContent = emptyLabel;
      domRefs.periodList.appendChild(li);
      domRefs.periodList.dataset.emptyLabel = emptyLabel;
      renderState.lastPeriodCount = 0;
    }
    return;
  }
  delete domRefs.periodList.dataset.emptyLabel;

  if (domRefs.periodList.children.length === myArray.length && myArray.length === renderState.lastPeriodCount) {
    for (let i = 0; i < myArray.length; i++) {
      const li = domRefs.periodList.children[i];
      const p = myArray[i];
      const stateClass = getStateClass(p, currentSeconds);

      const expectedClass = 'period-card ' + stateClass;
      if (li.className !== expectedClass.trim()) {
        li.className = expectedClass.trim();
      }
      li.dataset.studioKey = 'periodCard';
      li.dataset.studioLabel = p.name;
      li.dataset.studioPaths = 'appearance.periodCardPadding,appearance.periodCardRadius';
      _setStyledText(li.querySelector('.period-time'), 'periodTime', p.timeStr);
      _setStyledText(li.querySelector('.period-name'), 'periodName', p.name);
      _setStyledText(li.querySelector('.period-meta'), 'periodMeta', `${Math.round((p.endSec - p.startSec) / 60)} min`);
    }
    return;
  }

  domRefs.periodList.innerHTML = '';
  for (let i = 0; i < myArray.length; i++) {
    const p = myArray[i];
    const stateClass = getStateClass(p, currentSeconds);
    const durationMin = Math.round((p.endSec - p.startSec) / 60);

    const li = document.createElement('li');
    li.className = 'period-card ' + stateClass;
    li.dataset.studioKey = 'periodCard';
    li.dataset.studioLabel = p.name;
    li.dataset.studioPaths = 'appearance.periodCardPadding,appearance.periodCardRadius';

    const time = document.createElement('div');
    time.className = 'period-time';
    time.dataset.studioKey = 'periodTime';
    time.dataset.textStyle = 'periodTime';
    time.dataset.studioLabel = 'Period time';
    time.dataset.studioPaths = 'appearance.periodTimeSize,appearance.textStyles.targets.periodTime';
    _setStyledText(time, 'periodTime', p.timeStr);

    const name = document.createElement('div');
    name.className = 'period-name';
    name.dataset.studioKey = 'periodName';
    name.dataset.textStyle = 'periodName';
    name.dataset.studioLabel = 'Period name';
    name.dataset.studioPaths = 'appearance.periodNameSize,appearance.textStyles.targets.periodName';
    _setStyledText(name, 'periodName', p.name);

    const meta = document.createElement('div');
    meta.className = 'period-meta';
    meta.dataset.studioKey = 'periodMeta';
    meta.dataset.textStyle = 'periodMeta';
    meta.dataset.studioLabel = 'Period duration';
    meta.dataset.studioPaths = 'appearance.periodDurationSize,appearance.textStyles.targets.periodMeta';
    _setStyledText(meta, 'periodMeta', `${durationMin} min`);

    li.append(time, name, meta);

    domRefs.periodList.appendChild(li);
  }
  renderState.lastPeriodCount = myArray.length;
}

function getStateClass(period, currentSeconds) {
  if (currentSeconds >= period.endSec) return 'is-past';
  if (currentSeconds >= period.startSec && currentSeconds < period.endSec) return 'is-current';
  return '';
}

document.addEventListener('site-settings:applied', e => {
  _heroSettings = e.detail?.hero || {};
  _applySettingsScheduleOverride(e.detail);
  _applyGradesFrameUrl(e.detail);
  _applyViewTitle(document.querySelector('[data-site-view]') ? _siteView : _viewFromLocation());
  if (data) updateAll();
  requestAnimationFrame(() => _updateNavActive(_siteView));
});

_initHomepageIntro();
_initFirstPartyAnalytics();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
