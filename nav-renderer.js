/* Renders nav links from settings.nav.items into #nav-links.
 * The container's data-page attr ("schedule" | "announcements" | "grades")
 * controls which item is marked active.
 */
(function () {
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
    const items = settings?.nav?.items || [];
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
    if (window.__SITE_SETTINGS__) render(window.__SITE_SETTINGS__);
  }

  document.addEventListener('site-settings:applied', e => render(e.detail));
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryRender);
  } else {
    tryRender();
  }
})();
