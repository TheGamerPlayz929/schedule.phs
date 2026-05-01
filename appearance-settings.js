/* Visitor-only appearance controls for the schedule page. */
(function () {
  const KEY = 'phs:appearance:v1';
  const defaults = { bg: '#000000', textScale: 1, reduceGlow: false };

  function read() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...defaults }; }
  }
  function write(settings) {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  }
  function apply(settings) {
    const root = document.documentElement;
    root.style.setProperty('--user-bg-base', settings.bg || defaults.bg);
    root.style.setProperty('--user-text-scale', String(settings.textScale || 1));
    document.body.classList.toggle('user-reduce-glow', Boolean(settings.reduceGlow));
  }

  function mount() {
    const toggle = document.getElementById('appearance-toggle');
    const panel = document.getElementById('appearance-panel');
    if (!toggle || !panel) return;

    const bg = panel.querySelector('[data-appearance="bg"]');
    const scale = panel.querySelector('[data-appearance="textScale"]');
    const glow = panel.querySelector('[data-appearance="reduceGlow"]');
    const reset = panel.querySelector('[data-appearance-reset]');
    let current = read();

    function paint() {
      bg.value = current.bg;
      scale.value = current.textScale;
      glow.checked = Boolean(current.reduceGlow);
      apply(current);
      write(current);
    }

    toggle.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(event.target) || toggle.contains(event.target)) return;
      panel.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
    bg.addEventListener('input', () => { current.bg = bg.value; paint(); });
    scale.addEventListener('input', () => { current.textScale = Number(scale.value); paint(); });
    glow.addEventListener('change', () => { current.reduceGlow = glow.checked; paint(); });
    reset.addEventListener('click', () => { current = { ...defaults }; paint(); });

    paint();
  }

  apply(read());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
