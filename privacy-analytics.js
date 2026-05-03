/* Privacy-safe first-party analytics.
 * Collects only aggregate page events. No cookies, localStorage, IPs, names,
 * emails, user agents, StudentVue data, or persistent identifiers.
 */
(function () {
  const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1', ''].includes(location.hostname);
  if (isLocal) return;
  const BACKEND = isLocal ? location.origin : 'https://phs-grades-backend.onrender.com';
  const PAGE_MAP = {
    '/': 'schedule',
    '/index.html': 'schedule',
    '/announcements.html': 'announcements',
    '/gradeviewer.html': 'grades'
  };

  const page = PAGE_MAP[location.pathname] || document.getElementById('nav-links')?.dataset.page;
  if (!page) return;

  const tabId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2))
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
  let visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
  let sentFinal = false;

  function post(payload, beacon = false) {
    const body = JSON.stringify({ page, tabId, ...payload });
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
    if (seconds >= 3) post({ type: 'duration', seconds }, beacon);
  }

  post({ type: 'pageview' });

  setInterval(() => {
    if (document.visibilityState === 'visible') post({ type: 'heartbeat' });
  }, 30000);

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
