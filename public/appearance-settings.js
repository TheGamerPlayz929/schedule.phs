/* Visitor-only appearance controls for the schedule page. */
(function () {
  const KEY = 'phs:appearance:v2';
  const OLD_KEYS = ['phs:appearance:v1'];
  const defaults = { accent: '#8288d5', colors: ['#8288d5', '#17173a'], hue: 236, planeX: 40, planeY: 16, intensity: 60, textScale: 1, reduceGlow: false };
  const MAX_COLORS = 5;

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
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex);
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    const delta = max - min;
    let h = 0;
    if (delta) {
      if (max === nr) h = 60 * (((ng - nb) / delta) % 6);
      else if (max === ng) h = 60 * ((nb - nr) / delta + 2);
      else h = 60 * ((nr - ng) / delta + 4);
    }
    if (h < 0) h += 360;
    return {
      h: Math.round(h),
      s: max === 0 ? 0 : delta / max,
      v: max
    };
  }
  function hsvToHex(h, s, v) {
    const hue = ((Number(h) % 360) + 360) % 360;
    const sat = clamp(Number(s), 0, 1);
    const val = clamp(Number(v), 0, 1);
    const c = val * sat;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = val - c;
    let rgb = [0, 0, 0];
    if (hue < 60) rgb = [c, x, 0];
    else if (hue < 120) rgb = [x, c, 0];
    else if (hue < 180) rgb = [0, c, x];
    else if (hue < 240) rgb = [0, x, c];
    else if (hue < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function planeColor(h, x, y) {
    return hsvToHex(h, clamp(x, 0, 1), 1 - clamp(y, 0, 1));
  }
  function syncPickerFromAccent(settings) {
    const hsv = hexToHsv(settings.accent);
    settings.hue = hsv.s < 0.03 ? (Number.isFinite(Number(settings.hue)) ? Number(settings.hue) : defaults.hue) : hsv.h;
    settings.planeX = Math.round(clamp(hsv.s, 0, 1) * 100);
    settings.planeY = Math.round((1 - clamp(hsv.v, 0, 1)) * 100);
    return settings;
  }
  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }
  function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  function randomThemeColors() {
    const count = randomInt(3, MAX_COLORS);
    const baseHue = Math.random() * 360;
    const spread = randomBetween(82, 224);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const darkAnchor = Math.random() < 0.78 ? randomInt(1, count - 1) : -1;
    const colors = [];

    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? 0 : index / (count - 1);
      const wildcard = Math.random() < 0.22;
      const hue = wildcard
        ? Math.random() * 360
        : baseHue + direction * spread * t + randomBetween(-24, 24);
      const muted = Math.random() < 0.18;
      const saturation = muted ? randomBetween(0.34, 0.58) : randomBetween(0.62, 0.96);
      const value = index === darkAnchor ? randomBetween(0.045, 0.2) : randomBetween(0.74, 0.98);
      colors.push(hsvToHex(hue, saturation, value));
    }

    return colors;
  }
  function read() {
    OLD_KEYS.forEach(key => {
      try { localStorage.removeItem(key); } catch {}
    });
    try {
      const merged = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
      const intensity = Number(merged.intensity);
      const textScale = Number(merged.textScale);
      merged.intensity = Number.isFinite(intensity) ? Math.max(15, Math.min(100, intensity)) : defaults.intensity;
      merged.textScale = Number.isFinite(textScale) ? Math.max(0.85, Math.min(1.2, textScale)) : defaults.textScale;
      merged.accent = clampHex(merged.accent);
      merged.colors = normalizeColors(merged.colors, merged.accent);
      syncPickerFromAccent(merged);
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
    const pct = sliderPercent(value, min, max);
    return `linear-gradient(90deg, ${rgba(color, 0.86)} 0 ${pct}%, rgba(255,255,255,0.68) ${pct}% 100%)`;
  }
  function sliderPercent(value, min, max) {
    return Math.max(0, Math.min(100, ((Number(value) - min) / (max - min)) * 100));
  }
  function enhanceAppearanceSlider(input) {
    if (!input || input.closest('.appearance-liquid-range')) return;
    const wrap = document.createElement('span');
    wrap.className = 'appearance-liquid-range';
    const track = document.createElement('span');
    track.className = 'appearance-liquid-track';
    track.setAttribute('aria-hidden', 'true');
    const thumb = document.createElement('span');
    thumb.className = 'appearance-liquid-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    input.parentNode.insertBefore(wrap, input);
    wrap.append(track, input, thumb);

    const stopDrag = () => wrap.classList.remove('is-dragging');
    input.addEventListener('pointerdown', () => wrap.classList.add('is-dragging'));
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
  }
  function paintAppearanceSlider(input, value, min, max, color) {
    const pct = Number(sliderPercent(value, min, max).toFixed(4));
    const wrap = input.closest('.appearance-liquid-range');
    const target = wrap || input;
    target.style.setProperty('--appearance-slider-percent', `${pct}%`);
    target.style.setProperty('--appearance-slider-accent', color);
    input.style.setProperty('--slider-accent', color);
    if (!wrap) input.style.background = sliderFill(value, min, max, color);
  }
  function writeLater(settings) {
    window.clearTimeout(writeLater.timer);
    writeLater.timer = window.setTimeout(() => write(settings), 120);
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
    enhanceAppearanceSlider(intensity);
    enhanceAppearanceSlider(scale);
    let current = read();
    let activeSlot = 0;
    let stopsLayoutSignature = '';
    let frame = 0;

    function normalizeCurrent(syncPicker) {
      current.colors = normalizeColors(current.colors, current.accent);
      current.accent = clampHex(current.accent);
      if (activeSlot >= current.colors.length || activeSlot < 0) activeSlot = 0;
      current.colors[activeSlot] = current.accent;
      const safeIntensity = Number.isFinite(Number(current.intensity)) ? Math.max(15, Math.min(100, Number(current.intensity))) : defaults.intensity;
      const safeScale = Number.isFinite(Number(current.textScale)) ? Math.max(0.85, Math.min(1.2, Number(current.textScale))) : defaults.textScale;
      current.intensity = safeIntensity;
      current.textScale = safeScale;
      if (syncPicker) syncPickerFromAccent(current);
      current.hue = Number.isFinite(Number(current.hue)) ? clamp(Number(current.hue), 0, 360) : defaults.hue;
      current.planeX = Number.isFinite(Number(current.planeX)) ? clamp(Number(current.planeX), 0, 100) : defaults.planeX;
      current.planeY = Number.isFinite(Number(current.planeY)) ? clamp(Number(current.planeY), 0, 100) : defaults.planeY;
    }
    function renderStops() {
      strip.style.background = gradient(current.colors);
      const signature = `${activeSlot}|${current.colors.length}`;
      if (signature !== stopsLayoutSignature || strip.children.length !== current.colors.length) {
        stopsLayoutSignature = signature;
        strip.innerHTML = current.colors.map((stop, index) => {
          const raw = current.colors.length === 1 ? 0 : (index / (current.colors.length - 1)) * 100;
          const left = `calc(${raw}% + ${30 - raw * 0.6}px)`;
          return `<button type="button" class="theme-stop ${index === activeSlot ? 'active' : ''}" data-theme-slot="${index}" style="left:${left};--stop-color:${stop}" aria-label="Color stop ${index + 1}"></button>`;
        }).join('');
        return;
      }
      strip.querySelectorAll('[data-theme-slot]').forEach(slot => {
        const index = Number(slot.dataset.themeSlot) || 0;
        slot.style.setProperty('--stop-color', current.colors[index]);
      });
    }
    function renderControls() {
      color.value = current.accent;
      if (document.activeElement !== hex) hex.value = current.accent;
      hue.value = current.hue;
      intensity.value = current.intensity;
      scale.value = current.textScale;
      glow.checked = Boolean(current.reduceGlow);
      intensityValue.textContent = `${current.intensity}%`;
      scaleValue.textContent = `${Math.round(current.textScale * 100)}%`;
      paintAppearanceSlider(intensity, current.intensity, 15, 100, current.accent);
      paintAppearanceSlider(scale, current.textScale, 0.85, 1.2, current.accent);
      remove.disabled = current.colors.length <= 2;
      add.disabled = current.colors.length >= MAX_COLORS;
      panel.style.setProperty('--accent', current.accent);
      swatch.style.background = current.accent;
      dot.style.background = current.accent;
      dot.style.color = current.accent;
      plane.style.setProperty('--plane-color', hsvToHex(current.hue, 1, 1));
      dot.style.left = `clamp(15px, ${current.planeX}%, calc(100% - 15px))`;
      dot.style.top = `clamp(15px, ${current.planeY}%, calc(100% - 15px))`;
    }
    function renderPickerOnly() {
      color.value = current.accent;
      if (document.activeElement !== hex) hex.value = current.accent;
      panel.style.setProperty('--accent', current.accent);
      swatch.style.background = current.accent;
      dot.style.background = current.accent;
      dot.style.color = current.accent;
      dot.style.left = `clamp(15px, ${current.planeX}%, calc(100% - 15px))`;
      dot.style.top = `clamp(15px, ${current.planeY}%, calc(100% - 15px))`;
      strip.style.background = gradient(current.colors);
      const slot = strip.querySelector(`[data-theme-slot="${activeSlot}"]`);
      if (slot) slot.style.setProperty('--stop-color', current.accent);
    }
    function paint(options = {}) {
      const syncPicker = options.syncPicker !== false;
      const persist = options.persist !== false;
      normalizeCurrent(syncPicker);
      renderStops();
      renderControls();
      apply(current);
      if (persist) writeLater(current);
    }
    function fastPaint() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        normalizeCurrent(false);
        renderPickerOnly();
      });
    }
    function openPanel(open) {
      panel.classList.toggle('open', open);
      document.body.classList.toggle('appearance-open', open);
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
    strip.addEventListener('click', event => {
      const slot = event.target.closest?.('[data-theme-slot]');
      if (!slot || !strip.contains(slot)) return;
      event.stopPropagation();
      activeSlot = Number(slot.dataset.themeSlot) || 0;
      current.accent = current.colors[activeSlot] || current.accent;
      paint();
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
    hue.addEventListener('input', () => {
      current.hue = Number(hue.value);
      current.accent = planeColor(current.hue, current.planeX / 100, current.planeY / 100);
      current.colors[activeSlot] = current.accent;
      paint({ syncPicker: false });
    });
    plane.addEventListener('pointerdown', event => {
      const rect = plane.getBoundingClientRect();
      const move = e => {
        current.planeX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        current.planeY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        current.accent = planeColor(Number.isFinite(current.hue) ? current.hue : defaults.hue, current.planeX / 100, current.planeY / 100);
        current.colors[activeSlot] = current.accent;
        fastPaint();
      };
      const stop = () => {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        paint({ syncPicker: false });
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
      current.colors = randomThemeColors();
      activeSlot = 0;
      current.accent = current.colors[activeSlot];
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
