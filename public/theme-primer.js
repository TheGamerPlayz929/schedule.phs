(function () {
  const root = document.documentElement;
  const isHex = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
  const cleanHex = value => isHex(value) ? String(value).toUpperCase() : '#8288D5';
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const hexToRgb = value => {
    const n = Number.parseInt(cleanHex(value).slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const mix = (value, amount) => {
    const c = hexToRgb(value);
    const target = amount >= 0 ? 255 : 0;
    const p = Math.abs(amount);
    return rgbToHex(c.r + (target - c.r) * p, c.g + (target - c.g) * p, c.b + (target - c.b) * p);
  };
  const rgba = (value, alpha) => {
    const c = hexToRgb(value);
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  };
  const readJson = key => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  };
  const normalizeColors = (colors, fallback) => {
    const base = Array.isArray(colors) ? colors : [fallback || '#8288D5', mix(fallback || '#8288D5', -0.7)];
    const list = base.filter(isHex).slice(0, 5).map(cleanHex);
    while (list.length < 2) list.push(mix(list[0] || '#8288D5', -0.7));
    return list;
  };
  const gradient = colors => `linear-gradient(90deg, ${colors.map((color, index) => {
    const pct = colors.length === 1 ? 0 : Math.round((index / (colors.length - 1)) * 100);
    return `${color} ${pct}%`;
  }).join(', ')})`;
  const applySettingsTheme = settings => {
    const theme = settings && settings.theme ? settings.theme : {};
    if (theme.accent) root.style.setProperty('--accent', theme.accent);
    if (theme.accent2) root.style.setProperty('--accent-2', theme.accent2);
    if (theme.bg1) {
      root.style.setProperty('--bg-1', theme.bg1);
      root.style.setProperty('--bg-base', theme.bg1);
      root.style.setProperty('--user-bg-base', theme.bg1);
    }
    if (theme.bg2) root.style.setProperty('--bg-2', theme.bg2);
    if (theme.fg1) root.style.setProperty('--fg-1', theme.fg1);
    if (theme.fg2) root.style.setProperty('--fg-2', theme.fg2);
  };
  const applyAppearance = settings => {
    if (!settings || (!settings.accent && !settings.colors)) return;
    const colors = normalizeColors(settings.colors, settings.accent);
    const accent = cleanHex(settings.accent || colors[0]);
    const darkColor = cleanHex(colors[1] || mix(accent, -0.7));
    const intensity = Math.max(15, Math.min(100, Number(settings.intensity) || 60)) / 100;
    root.style.setProperty('--user-bg-base', mix(colors[0], -0.9));
    root.style.setProperty('--user-orb-1', rgba(colors[0], 0.95 * intensity));
    root.style.setProperty('--user-orb-2', rgba(darkColor, 0.85 * intensity));
    root.style.setProperty('--user-orb-3', rgba(colors[2] || mix(accent, 0.18), 0.7 * intensity));
    root.style.setProperty('--user-gradient-angle', '281deg');
    root.style.setProperty('--user-theme-gradient', gradient(colors));
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--ring-start', mix(accent, 0.28));
    root.style.setProperty('--ring-end', accent);
    root.style.setProperty('--user-text-scale', String(Math.max(0.85, Math.min(1.2, Number(settings.textScale) || 1))));
    if (settings.reduceGlow) {
      document.addEventListener('DOMContentLoaded', () => document.body.classList.add('user-reduce-glow'), { once: true });
    }
  };

  const cached = readJson('phs:site-settings:last-good:v2');
  applySettingsTheme(cached && cached.settings);
  applyAppearance(readJson('phs:appearance:v2'));
  root.classList.add('theme-primed');
})();
