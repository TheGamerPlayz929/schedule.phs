(function () {
  let sliderId = 0;

  const defaults = {
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 50,
    label: '',
    disabled: false,
    showValue: false,
    accentColor: '#0a8fdc',
    className: '',
    onChange: null
  };

  function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
  }

  function toNumber(value, fallback) {
    return isFiniteNumber(value) ? Number(value) : fallback;
  }

  function toBoolean(value, fallback) {
    if (value === undefined || value === null) return fallback;
    if (value === '') return true;
    if (typeof value === 'boolean') return value;
    return !/^(false|0|no)$/i.test(String(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeColor(value, fallback) {
    const color = String(value || '').trim();
    return color ? color : fallback;
  }

  class LiquidGlassSlider {
    constructor(root, options = {}) {
      if (!(root instanceof HTMLElement)) {
        throw new TypeError('LiquidGlassSlider requires a root HTMLElement.');
      }

      this.root = root;
      this.rawOptions = options;
      this.options = { ...defaults, ...options };
      this.id = this.options.id || root.id || `liquid-slider-${++sliderId}`;
      this.onChange = typeof this.options.onChange === 'function' ? this.options.onChange : null;
      this.controlled = Object.prototype.hasOwnProperty.call(this.rawOptions, 'value');

      this.readOptionsFromDom();
      this.value = this.coerce(this.controlled ? this.rawOptions.value : this.initialValue);
      this.render();
      this.bind();
      this.updateVisuals();
    }

    readOptionsFromDom() {
      const data = this.root.dataset || {};
      const hasOption = key => Object.prototype.hasOwnProperty.call(this.rawOptions, key);
      const pick = (key, dataKey = key, fallback = defaults[key]) => (
        hasOption(key) ? this.rawOptions[key] : (data[dataKey] !== undefined ? data[dataKey] : fallback)
      );

      this.min = toNumber(pick('min'), defaults.min);
      this.max = toNumber(pick('max'), defaults.max);
      if (this.max <= this.min) this.max = this.min + 100;
      this.step = pick('step');
      this.label = pick('label');
      this.disabled = toBoolean(pick('disabled'), defaults.disabled);
      this.showValue = toBoolean(pick('showValue'), defaults.showValue);
      this.accentColor = normalizeColor(pick('accentColor'), defaults.accentColor);
      this.className = pick('className', 'className', '');
      this.initialValue = toNumber(pick('defaultValue', 'defaultValue', defaults.defaultValue), defaults.defaultValue);

      const domValue = data.value;
      if (!this.controlled && !hasOption('defaultValue') && isFiniteNumber(domValue)) this.initialValue = Number(domValue);
    }

    render() {
      this.root.classList.add('liquid-slider');
      if (this.className) {
        String(this.className).split(/\s+/).filter(Boolean).forEach(name => this.root.classList.add(name));
      }
      this.root.classList.toggle('is-disabled', this.disabled);
      this.root.style.setProperty('--liquid-slider-accent', this.accentColor);

      this.root.innerHTML = '';

      const meta = document.createElement('div');
      meta.className = 'liquid-slider__meta';

      const labelEl = document.createElement('label');
      labelEl.className = 'liquid-slider__label';
      labelEl.htmlFor = this.id;
      labelEl.hidden = !this.label;
      labelEl.textContent = this.label;

      const valueEl = document.createElement('output');
      valueEl.className = 'liquid-slider__value';
      valueEl.setAttribute('for', this.id);
      valueEl.hidden = !this.showValue;

      meta.append(labelEl, valueEl);

      const control = document.createElement('div');
      control.className = 'liquid-slider__control';

      const track = document.createElement('div');
      track.className = 'liquid-slider__track';
      track.setAttribute('aria-hidden', 'true');

      const input = document.createElement('input');
      input.className = 'liquid-slider__input';
      input.id = this.id;
      input.type = 'range';
      input.min = String(this.min);
      input.max = String(this.max);
      input.step = String(this.step);
      input.disabled = this.disabled;
      input.value = String(this.value);
      if (!this.label) input.setAttribute('aria-label', 'Liquid glass slider');

      const thumb = document.createElement('div');
      thumb.className = 'liquid-slider__thumb';
      thumb.setAttribute('aria-hidden', 'true');

      control.append(track, input, thumb);
      this.root.append(meta, control);

      this.input = input;
      this.valueEl = valueEl;
    }

    bind() {
      this.handleInput = () => {
        const nextValue = this.coerce(this.input.value);
        this.value = nextValue;
        this.updateVisuals();
        this.emitChange(nextValue);
      };
      this.handlePointerDown = () => this.root.classList.add('is-dragging');
      this.handlePointerUp = () => this.root.classList.remove('is-dragging');

      this.input.addEventListener('input', this.handleInput);
      this.input.addEventListener('pointerdown', this.handlePointerDown);
      window.addEventListener('pointerup', this.handlePointerUp);
      window.addEventListener('pointercancel', this.handlePointerUp);
    }

    coerce(value) {
      return clamp(toNumber(value, defaults.defaultValue), this.min, this.max);
    }

    percent() {
      return ((this.value - this.min) / (this.max - this.min)) * 100;
    }

    formatPercent() {
      return `${Number(clamp(this.percent(), 0, 100).toFixed(4))}%`;
    }

    formatValue() {
      if (this.min === 0 && this.max === 100) return `${Math.round(this.value)}%`;
      return String(Number.isInteger(this.value) ? this.value : Number(this.value.toFixed(2)));
    }

    updateVisuals() {
      this.root.style.setProperty('--liquid-slider-percent', this.formatPercent());
      this.root.style.setProperty('--liquid-slider-accent', this.accentColor);
      if (this.input && Number(this.input.value) !== this.value) this.input.value = String(this.value);
      if (this.valueEl) this.valueEl.value = this.formatValue();
    }

    emitChange(value) {
      const detail = { value, percent: clamp(this.percent(), 0, 100) };
      if (this.onChange) this.onChange(value);
      this.root.dispatchEvent(new CustomEvent('liquid-slider-change', { detail, bubbles: true }));
    }

    setValue(value, options = {}) {
      this.value = this.coerce(value);
      this.updateVisuals();
      if (options.emit) this.emitChange(this.value);
    }

    setDisabled(disabled) {
      this.disabled = Boolean(disabled);
      this.root.classList.toggle('is-disabled', this.disabled);
      if (this.input) this.input.disabled = this.disabled;
    }

    destroy() {
      if (!this.input) return;
      this.input.removeEventListener('input', this.handleInput);
      this.input.removeEventListener('pointerdown', this.handlePointerDown);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointercancel', this.handlePointerUp);
      delete this.root.liquidGlassSlider;
    }
  }

  function initLiquidGlassSliders(scope = document) {
    return Array.from(scope.querySelectorAll('[data-liquid-glass-slider]')).map(root => {
      if (!root.liquidGlassSlider) root.liquidGlassSlider = new LiquidGlassSlider(root);
      return root.liquidGlassSlider;
    });
  }

  window.LiquidGlassSlider = LiquidGlassSlider;
  window.initLiquidGlassSliders = initLiquidGlassSliders;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initLiquidGlassSliders());
  } else {
    initLiquidGlassSliders();
  }
})();
