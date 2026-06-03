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
    if (page === 'schedule')      return /(^|\/)(?:index\.html?|schedule)\/?$/i.test(href) || href === '/' || href === 'index.html';
    if (page === 'announcements') return /announcements\.html?$/i.test(href);
    if (page === 'grades')        return /(?:^|\/)(?:gradeviewer|grademelon)(?:\.html?)?\/?$/i.test(href);
    return false;
  }

  function safeNavHref(href) {
    const raw = String(href || '').trim();
    if (!raw) return null;
    try {
      const url = new URL(raw, location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) || raw.startsWith('//') ? url.href : raw;
    } catch {
      return null;
    }
  }

  function render(settings) {
    const wrap = document.getElementById('nav-links');
    if (!wrap) return;
    const page = wrap.getAttribute('data-page') || '';
    const configured = settings?.nav?.items;
    const items = Array.isArray(configured) && configured.length ? configured : DEFAULT_NAV_ITEMS;
    wrap.innerHTML = '';
    for (const it of items) {
      const href = safeNavHref(it.href);
      if (!href) continue;
      const a = document.createElement('a');
      a.href = href;
      a.className = 'nav-btn' + (pageMatches(it.href, page) ? ' active' : '');
      a.dataset.studioKey = pageMatches(it.href, page) ? 'navLinkActive' : 'navLink';
      a.dataset.textStyle = pageMatches(it.href, page) ? 'navLinkActive' : 'navLink';
      a.dataset.studioLabel = `${it.label || 'Navigation'} link`;
      a.dataset.studioPaths = 'nav.items,appearance.textStyles.targets.navLink,appearance.textStyles.targets.navLinkActive';
      a.textContent = it.label;
      wrap.appendChild(a);
    }
    window.PhsTextStyle?.applyAll?.(wrap);
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
