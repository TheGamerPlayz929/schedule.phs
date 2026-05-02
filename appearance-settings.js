/* Visitor-only appearance controls for the schedule page. */
(function () {
  const KEY = 'phs:appearance:v1';
  const defaults = { accent: '#8288d5', colors: ['#8288d5', '#17173a'], hue: 236, intensity: 60, textScale: 1, reduceGlow: false };
  const MAX_COLORS = 5;
  const presets = ['#8288d5', '#a855f7', '#22c55e', '#38bdf8', '#f97316', '#f43f5e'];

  function hexToRgb(hex) {
    const clean = String(hex || '').replace('#', '').trim();
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const n = Number.parseInt(full, 16);
    if (!Number.isFinite(n)) return { r: 130, g: 136, b: 213 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function clampHex(value) {
    const hex = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : defaults.accent.toUpperCase();
  }
  function mix(hex, amount) {
    const c = hexToRgb(hex);
    const target = amount >= 0 ? 255 : 0;
    const p = Math.abs(amount);
    const next = [c.r, c.g, c.b].map(v => Math.round(v + (target - v) * p));
    return rgbToHex(next[0], next[1], next[2]);
  }
  function rgba(hex, alpha) {
    const c = hexToRgb(hex);
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  }
  function hslToHex(h, s = 62, l = 62) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function planeColor(h, x, y) {
    const base = hexToRgb(hslToHex(h, 78, 55));
    const whiteMix = x;
    const darkMix = y;
    const rgb = [base.r, base.g, base.b].map(v => {
      const withWhite = 255 + (v - 255) * whiteMix;
      return withWhite * (1 - darkMix);
    });
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
  }
  function read() {
    try {
      const merged = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
      const intensity = Number(merged.intensity);
      const textScale = Number(merged.textScale);
      merged.intensity = Number.isFinite(intensity) ? Math.max(15, Math.min(100, intensity)) : defaults.intensity;
      merged.textScale = Number.isFinite(textScale) ? Math.max(0.85, Math.min(1.2, textScale)) : defaults.textScale;
      merged.accent = clampHex(merged.accent);
      merged.colors = normalizeColors(merged.colors, merged.accent);
      return merged;
    } catch { return { ...defaults, colors: [...defaults.colors] }; }
  }
  function write(settings) {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
    try { document.dispatchEvent(new CustomEvent('phs:appearance-storage-sync', { detail: settings })); } catch {}
  }
  function apply(settings) {
    const root = document.documentElement;
    const colors = normalizeColors(settings.colors, settings.accent);
    const accent = clampHex(settings.accent || colors[0]);
    const darkColor = clampHex(colors[1] || mix(accent, -0.7));
    const intensity = Math.max(15, Math.min(100, Number(settings.intensity) || defaults.intensity)) / 100;
    root.style.setProperty('--user-bg-base', mix(colors[0], -0.9));
    root.style.setProperty('--user-orb-1', rgba(colors[0], 0.95 * intensity));
    root.style.setProperty('--user-orb-2', rgba(darkColor, 0.85 * intensity));
    root.style.setProperty('--user-orb-3', rgba(colors[2] || mix(accent, 0.18), 0.7 * intensity));
    root.style.setProperty('--user-gradient-angle', '281deg');
    root.style.setProperty('--user-theme-gradient', gradient(colors));
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--ring-start', mix(accent, 0.28));
    root.style.setProperty('--ring-end', accent);
    document.querySelectorAll('#ringGradient stop').forEach((stop, index) => {
      stop.setAttribute('stop-color', index === 0 ? mix(accent, 0.28) : accent);
    });
    const scale = Number(settings.textScale);
    root.style.setProperty('--user-text-scale', String(Number.isFinite(scale) ? Math.max(0.85, Math.min(1.2, scale)) : 1));
    document.body.classList.toggle('user-reduce-glow', Boolean(settings.reduceGlow));
  }
  function normalizeColors(colors, fallback) {
    const list = (Array.isArray(colors) ? colors : [fallback || defaults.accent, mix(fallback || defaults.accent, -0.7)])
      .map(clampHex)
      .slice(0, MAX_COLORS);
    while (list.length < 2) list.push(mix(list[0], -0.7));
    return list;
  }
  function gradient(colors) {
    const stops = normalizeColors(colors).map((color, index, list) => {
      const pct = list.length === 1 ? 0 : Math.round((index / (list.length - 1)) * 100);
      return `${color} ${pct}%`;
    });
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }
  function sliderFill(value, min, max, color) {
    const pct = Math.max(0, Math.min(100, ((Number(value) - min) / (max - min)) * 100));
    return `linear-gradient(90deg, ${color} 0 ${pct}%, rgba(255,255,255,0.88) ${pct}% 100%)`;
  }

  function mount() {
    const toggle = document.getElementById('appearance-toggle');
    const panel = document.getElementById('appearance-panel');
    if (!toggle || !panel) return;

    const color = panel.querySelector('[data-appearance="accent"]');
    const hex = panel.querySelector('[data-appearance="hex"]');
    const plane = panel.querySelector('[data-appearance-plane]');
    const hue = panel.querySelector('[data-appearance="hue"]');
    const intensity = panel.querySelector('[data-appearance="intensity"]');
    const scale = panel.querySelector('[data-appearance="textScale"]');
    const glow = panel.querySelector('[data-appearance="reduceGlow"]');
    const reset = panel.querySelector('[data-appearance-reset]');
    const close = panel.querySelector('[data-appearance-close]');
    const surprise = panel.querySelector('[data-appearance-surprise]');
    const add = panel.querySelector('[data-appearance-add]');
    const remove = panel.querySelector('[data-appearance-remove]');
    const eyeDropper = panel.querySelector('[data-appearance-eyedropper]');
    const intensityValue = panel.querySelector('[data-appearance-intensity-value]');
    const scaleValue = panel.querySelector('[data-appearance-scale-value]');
    const strip = panel.querySelector('[data-theme-strip]');
    const swatch = panel.querySelector('[data-theme-swatch]');
    const dot = panel.querySelector('[data-theme-picker-dot]');
    let current = read();
    let activeSlot = 0;

    function paint() {
      current.colors = normalizeColors(current.colors, current.accent);
      current.accent = clampHex(current.accent);
      if (activeSlot >= current.colors.length || activeSlot < 0) activeSlot = 0;
      current.colors[activeSlot] = current.accent;
      const safeIntensity = Number.isFinite(Number(current.intensity)) ? Math.max(15, Math.min(100, Number(current.intensity))) : defaults.intensity;
      const safeScale = Number.isFinite(Number(current.textScale)) ? Math.max(0.85, Math.min(1.2, Number(current.textScale))) : defaults.textScale;
      current.intensity = safeIntensity;
      current.textScale = safeScale;
      color.value = current.accent;
      if (document.activeElement !== hex) hex.value = current.accent;
      hue.value = Number.isFinite(current.hue) ? current.hue : defaults.hue;
      intensity.value = safeIntensity;
      scale.value = safeScale;
      glow.checked = Boolean(current.reduceGlow);
      intensityValue.textContent = `${safeIntensity}%`;
      scaleValue.textContent = `${Math.round(safeScale * 100)}%`;
      intensity.style.setProperty('--slider-accent', current.accent);
      scale.style.setProperty('--slider-accent', current.accent);
      intensity.style.background = sliderFill(safeIntensity, 15, 100, current.accent);
      scale.style.background = sliderFill(safeScale, 0.85, 1.2, current.accent);
      strip.style.background = gradient(current.colors);
      remove.disabled = current.colors.length <= 2;
      add.disabled = current.colors.length >= MAX_COLORS;
      strip.innerHTML = current.colors.map((stop, index) => {
        const raw = current.colors.length === 1 ? 0 : (index / (current.colors.length - 1)) * 100;
        const left = Math.max(4.5, Math.min(95.5, raw));
        return `<button type="button" class="theme-stop ${index === activeSlot ? 'active' : ''}" data-theme-slot="${index}" style="left:${left}%;--stop-color:${stop}" aria-label="Color stop ${index + 1}"></button>`;
      }).join('');
      strip.querySelectorAll('[data-theme-slot]').forEach(slot => {
        slot.addEventListener('click', event => {
          event.stopPropagation();
          activeSlot = Number(slot.dataset.themeSlot) || 0;
          current.accent = current.colors[activeSlot] || current.accent;
          paint();
        });
      });
      swatch.style.background = current.accent;
      dot.style.background = current.accent;
      dot.style.color = current.accent;
      plane.style.setProperty('--plane-color', hslToHex(Number.isFinite(current.hue) ? current.hue : defaults.hue, 78, 55));
      dot.style.left = `${Number.isFinite(current.planeX) ? current.planeX : 54}%`;
      dot.style.top = `${Number.isFinite(current.planeY) ? current.planeY : 28}%`;
      apply(current);
      write(current);
    }
    function openPanel(open) {
      panel.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    }

    toggle.addEventListener('click', () => openPanel(!panel.classList.contains('open')));
    close.addEventListener('click', () => openPanel(false));
    document.addEventListener('click', event => {
      if (!panel.classList.contains('open')) return;
      const path = event.composedPath?.() || [];
      if (path.includes(panel) || path.includes(toggle) || panel.contains(event.target) || toggle.contains(event.target)) return;
      openPanel(false);
    });
    color.addEventListener('input', () => { current.accent = color.value; current.colors[activeSlot] = current.accent; paint(); });
    hex.addEventListener('input', () => {
      let v = hex.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        current.accent = v.toUpperCase();
        current.colors[activeSlot] = current.accent;
      }
      paint();
    });
    hex.addEventListener('blur', () => { hex.value = current.accent; });
    hue.addEventListener('input', () => { current.hue = Number(hue.value); current.accent = hslToHex(current.hue); paint(); });
    plane.addEventListener('pointerdown', event => {
      const rect = plane.getBoundingClientRect();
      const move = e => {
        current.planeX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        current.planeY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        current.accent = planeColor(Number.isFinite(current.hue) ? current.hue : defaults.hue, current.planeX / 100, current.planeY / 100);
        current.colors[activeSlot] = current.accent;
        paint();
      };
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        try { plane.releasePointerCapture?.(event.pointerId); } catch {}
      };
      move(event);
      try { plane.setPointerCapture?.(event.pointerId); } catch {}
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
    intensity.addEventListener('input', () => { current.intensity = Number(intensity.value); paint(); });
    scale.addEventListener('input', () => { current.textScale = Number(scale.value); paint(); });
    glow.addEventListener('change', () => { current.reduceGlow = glow.checked; paint(); });
    eyeDropper.addEventListener('click', async event => {
      event.stopPropagation();
      if ('EyeDropper' in window) {
        try {
          const picked = await new EyeDropper().open();
          current.accent = clampHex(picked.sRGBHex);
          current.colors[activeSlot] = current.accent;
          paint();
          return;
        } catch {
          return;
        }
      }
      color.click();
    });
    surprise.addEventListener('click', () => {
      const next = presets[Math.floor(Math.random() * presets.length)];
      current.colors = [next, '#000000', '#40ffce', mix(next, 0.55)];
      activeSlot = 0;
      current.accent = current.colors[0];
      current.hue = Math.floor(Math.random() * 361);
      current.planeX = 55;
      current.planeY = 28;
      current.intensity = 45 + Math.floor(Math.random() * 41);
      paint();
    });
    add.addEventListener('click', () => {
      current.colors = normalizeColors(current.colors, current.accent);
      if (current.colors.length < MAX_COLORS) current.colors.push(mix(current.colors[current.colors.length - 1], 0.25));
      activeSlot = current.colors.length - 1;
      current.accent = current.colors[activeSlot];
      paint();
    });
    remove.addEventListener('click', () => {
      current.colors = normalizeColors(current.colors, current.accent);
      if (current.colors.length > 2) current.colors.splice(activeSlot, 1);
      activeSlot = Math.max(0, Math.min(activeSlot, current.colors.length - 1));
      current.accent = current.colors[activeSlot];
      paint();
    });
    reset.addEventListener('click', () => { current = { ...defaults, colors: [...defaults.colors] }; activeSlot = 0; paint(); });

    paint();
  }

  apply(read());
  // Re-apply after admin settings load so admin's theme doesn't overwrite the user's choice.
  document.addEventListener('site-settings:applied', () => apply(read()));
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    apply(read());
    document.dispatchEvent(new CustomEvent('phs:appearance-storage-sync'));
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
