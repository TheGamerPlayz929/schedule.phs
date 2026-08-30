/* Anonymous first-party usage totals with browser-controlled opt-out. */
(function () {
  const STORAGE_KEY = 'phs:privacy:analytics-optout:v1';
  const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(location.hostname);
  const privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';

  function storedOptOut() {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch { return true; }
  }

  function setStoredOptOut(value) {
    try { localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false'); }
    catch {}
  }

  function initializeControl() {
    const control = document.getElementById('aggregate-analytics-toggle');
    const status = document.getElementById('aggregate-analytics-status');
    if (!control) return;
    control.checked = !privacySignal && !storedOptOut();
    control.disabled = privacySignal;
    if (privacySignal && status) status.textContent = 'Your browser privacy signal is active, so anonymous analytics are off.';
    control.addEventListener('change', () => {
      setStoredOptOut(!control.checked);
      if (status) status.textContent = control.checked
        ? 'Anonymous analytics are on for future page visits.'
        : 'Anonymous analytics are off for future page visits.';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeControl, { once: true });
  else initializeControl();

  if (isLocal || privacySignal || storedOptOut() || new URLSearchParams(location.search).has('_preview')) return;

  const BACKEND = 'https://phs-grades-backend.onrender.com';
  const PAGE_MAP = {
    '/': 'schedule',
    '/schedule': 'schedule',
    '/schedule/': 'schedule',
    '/index.html': 'schedule',
    '/announcements.html': 'announcements',
    '/gradeviewer.html': 'grades',
    '/privacy.html': 'privacy',
    '/grademelon': 'grades',
    '/grademelon/': 'grades',
    '/grademelon.html': 'grades'
  };
  const page = PAGE_MAP[location.pathname] || document.getElementById('nav-links')?.dataset.page;
  if (!page) return;

  const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  const device = width < 760 ? 'mobile' : width < 1100 ? 'tablet' : 'desktop';
  let visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
  let sentFinal = false;

  function post(payload, beacon = false) {
    const body = JSON.stringify({ page, device, ...payload });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(BACKEND + '/analytics/event', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(BACKEND + '/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: beacon,
      credentials: 'omit'
    }).catch(() => {});
  }

  function sendDuration(beacon = false) {
    if (!visibleSince) return;
    const seconds = Math.round((Date.now() - visibleSince) / 1000);
    visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
    if (seconds >= 3) post({ type: 'duration', durationSeconds: seconds }, beacon);
  }

  post({ type: 'pageview' });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDuration(true);
    else visibleSince = Date.now();
  });
  window.addEventListener('pagehide', () => {
    if (sentFinal) return;
    sentFinal = true;
    sendDuration(true);
  });
})();
