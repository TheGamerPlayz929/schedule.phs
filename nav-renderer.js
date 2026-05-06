/* Renders nav links from settings.nav.items into #nav-links.
 * The container's data-page attr ("schedule" | "announcements" | "grades")
 * controls which item is marked active.
 */
(function () {
  const DEFAULT_NAV_ITEMS = [
    { label: 'Announcements', href: 'announcements.html' },
    { label: 'Schedule', href: 'index.html' },
    { label: 'Grades', href: 'gradeviewer.html' }
  ];

  function pageMatches(href, page) {
    if (!href) return false;
    if (page === 'schedule')      return /(^|\/)index\.html?$/i.test(href) || href === 'index.html';
    if (page === 'announcements') return /announcements\.html?$/i.test(href);
    if (page === 'grades')        return /gradeviewer\.html?$/i.test(href) || /grademelon\.html?$/i.test(href);
    return false;
  }

  function render(settings) {
    const wrap = document.getElementById('nav-links');
    if (!wrap) return;
    const page = wrap.getAttribute('data-page') || '';
    const configured = settings?.nav?.items;
    const items = Array.isArray(configured) && configured.length ? configured : DEFAULT_NAV_ITEMS;
    wrap.innerHTML = '';
    for (const it of items) {
      const a = document.createElement('a');
      a.href = it.href;
      a.className = 'nav-btn' + (pageMatches(it.href, page) ? ' active' : '');
      a.textContent = it.label;
      wrap.appendChild(a);
    }
  }

  function tryRender() {
    render(window.__SITE_SETTINGS__);
  }

  document.addEventListener('site-settings:applied', e => render(e.detail));
  tryRender();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryRender);
  }
})();
