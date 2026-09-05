/* Anonymous first-party usage totals. Always on. No identifiers, no cross-site tracking. */
(function () {
  const LEGACY_CONSENT_KEYS = ['phs:privacy:analytics-consent:v2', 'phs:privacy:analytics-optout:v1'];
  const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(location.hostname);

  /* The consent toggle is gone: analytics are always on, so drop the stale browser flag. */
  try { LEGACY_CONSENT_KEYS.forEach(key => localStorage.removeItem(key)); } catch {}

  if (isLocal || new URLSearchParams(location.search).has('_preview')) return;

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
