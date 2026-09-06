/* PHS shared default background: subtle gray dot/letter field.
 * Generalized from admin-login-canvas.js for site-wide use.
 * Targets <canvas id="site-bg-canvas"> inside .ambient-canvas.
 * Dark field by default (faint dots via u_dim) with brighter morphed glyphs
 * near the pointer (u_glyph) so hover text reads clearly without lifting the
 * overall background. Respects prefers-reduced-motion and
 * body.user-reduce-glow. Fails silently (CSS orbs remain) if WebGL2 is missing.
 */
(() => {
  'use strict';

  function init() {
    const canvas = document.getElementById('site-bg-canvas');
    if (!canvas || canvas.dataset.phsBgInit) return false;
    canvas.dataset.phsBgInit = '1';

    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) return true;
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : '';
    /* Software GPUs handle the original single pass better than an extra framebuffer. */
    const softwareRenderer = /SwiftShader|llvmpipe|softpipe|software|Microsoft Basic Render/i.test(renderer);
    const canCacheCells = !!gl.getExtension('EXT_color_buffer_float') && !softwareRenderer;

    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const tileSize = 32;
    const atlasColumns = 6;
    const atlasSize = tileSize * atlasColumns;
    const atlas = document.createElement('canvas');
    atlas.width = atlas.height = atlasSize;
    const ctx = atlas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    const scale = tileSize / 6;
    ctx.font = '600 ' + (7 * scale) + 'px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    const distances = new Uint8Array(atlasSize * atlasSize);
    const morphSteps = 17;
    const corrections = new Uint8Array(morphSteps * glyphs.length).fill(128);
    const dotDistances = new Float32Array(tileSize * tileSize);
    const sampleAA = 0.5 / scale;
    const coverage = value => {
      const t = Math.max(0, Math.min(1, (value + sampleAA) / (2 * sampleAA)));
      return t * t * (3 - 2 * t);
    };
    const lowerBound = (values, target) => {
      let low = 0, high = values.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (values[middle] < target) low = middle + 1;
        else high = middle;
      }
      return low;
    };
    let dotArea = 0;
    for (let y = 0; y < tileSize; y += 1) {
      for (let x = 0; x < tileSize; x += 1) {
        const qx = Math.abs((x + 0.5) / scale - 3) - 1;
        const qy = Math.abs((y + 0.5) / scale - 3) - 1;
        const distance = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
        dotDistances[y * tileSize + x] = distance;
        dotArea += coverage(distance);
      }
    }

    /* A tiny distance atlas lets a dot become a stroke, rather than leaving a dot under text. */
    for (let index = 0; index < glyphs.length; index += 1) {
      const ox = (index % atlasColumns) * tileSize;
      const oy = Math.floor(index / atlasColumns) * tileSize;
      ctx.fillText(glyphs[index], ox + tileSize / 2, oy + tileSize / 2);
      const rgba = ctx.getImageData(ox, oy, tileSize, tileSize).data;
      const inside = new Uint8Array(tileSize * tileSize);
      const glyphDistances = new Float32Array(tileSize * tileSize);
      let glyphArea = 0;
      const edges = [];
      for (let p = 0; p < inside.length; p += 1) {
        inside[p] = rgba[p * 4 + 3] >= 128 ? 1 : 0;
      }
      for (let y = 0; y < tileSize; y += 1) {
        for (let x = 0; x < tileSize; x += 1) {
          const p = y * tileSize + x;
          if (inside[p] && (x === 0 || y === 0 || x === tileSize - 1 || y === tileSize - 1 ||
            !inside[p - 1] || !inside[p + 1] || !inside[p - tileSize] || !inside[p + tileSize])) {
            edges.push([x, y]);
          }
        }
      }
      for (let y = 0; y < tileSize; y += 1) {
        for (let x = 0; x < tileSize; x += 1) {
          let nearest = tileSize * tileSize;
          for (const edge of edges) {
            const dx = x - edge[0], dy = y - edge[1];
            nearest = Math.min(nearest, dx * dx + dy * dy);
          }
          const signed = inside[y * tileSize + x]
            ? Math.sqrt(nearest) + 0.5
            : 0.5 - Math.sqrt(nearest);
          const encoded = Math.round(255 * Math.max(0, Math.min(1, 0.5 + signed / scale / 8)));
          distances[(oy + y) * atlasSize + ox + x] = encoded;
          const distance = (encoded / 255 - 0.5) * 8;
          glyphDistances[y * tileSize + x] = distance;
          glyphArea += coverage(distance);
        }
      }
      /* Precompute a small contour adjustment: the ink area must not dip mid-morph. */
      const intermediate = new Float32Array(tileSize * tileSize);
      for (let step = 1; step < morphSteps - 1; step += 1) {
        const morph = step / (morphSteps - 1);
        const targetArea = dotArea + (glyphArea - dotArea) * morph;
        for (let p = 0; p < intermediate.length; p += 1) {
          intermediate[p] = dotDistances[p] + (glyphDistances[p] - dotDistances[p]) * morph;
        }
        intermediate.sort();
        let low = -1.98, high = 1.98;
        for (let pass = 0; pass < 11; pass += 1) {
          const adjustment = (low + high) * 0.5;
          /* Only the contour needs evaluation; fully filled/empty samples count directly. */
          const first = lowerBound(intermediate, -adjustment - sampleAA);
          const last = lowerBound(intermediate, -adjustment + sampleAA);
          let area = intermediate.length - last;
          for (let p = first; p < last; p += 1) area += coverage(intermediate[p] + adjustment);
          if (area < targetArea) low = adjustment;
          else high = adjustment;
        }
        corrections[index * morphSteps + step] = Math.round(128 + (low + high) * 32);
      }
    }

    const vertexSource = `#version 300 es
precision highp float;
in vec2 a_position;
uniform vec2 u_resolution;
out vec2 fragCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  fragCoord = (a_position + vec2(1.0)) * 0.5 * u_resolution;
  fragCoord.y = u_resolution.y - fragCoord.y;
}`;
    const fragmentSource = `#version 300 es
precision highp float;
precision highp int;
in vec2 fragCoord;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_hover;
uniform float u_dim;
uniform float u_glyph;
uniform uint u_revision;
uniform sampler2D u_atlas;
uniform sampler2D u_morph_corrections;
uniform sampler2D u_cell_state;
uniform bool u_use_cell_state;
uniform bool u_cell_pass;
out vec4 fragColor;
const float TOTAL_SIZE = 12.0;
const float DOT_SIZE = 4.0;
const float PHI = 1.61803398874989484820459;

float random(vec2 xy) {
  return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
}
float opacityStep(float rand) {
  float steps[10] = float[10](0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1.0);
  return steps[int(clamp(rand, 0.0, 0.999) * 10.0)];
}
void main() {
  vec2 offset = abs(floor((mod(u_resolution, TOTAL_SIZE) - DOT_SIZE) * 0.5));
  vec2 st = fragCoord - offset;
  /* Center each tile on the original dot. */
  vec2 cell = u_cell_pass ? floor(gl_FragCoord.xy) : floor((st + 4.0) / TOTAL_SIZE);
  vec2 local = mod(st + 4.0, TOTAL_SIZE) * 0.5;
  /* Cache lighting and morph parameters in one texel per cell, at full float precision. */
  vec4 state;
  if (u_use_cell_state && !u_cell_pass) {
    state = texelFetch(u_cell_state, ivec2(cell), 0);
  } else {
    float phase = u_time / 4.0 + random(cell) + 4.0;
    float twinkle = mix(opacityStep(random(cell * floor(phase))),
      opacityStep(random(cell * (floor(phase) + 1.0))), smoothstep(0.0, 1.0, fract(phase)));
    float wave = pow(0.5 + 0.5 * sin(cell.x * 0.085 + cell.y * 0.045 - u_time * 1.4), 3.0);
    float opacity = (0.2 + 0.8 * wave) * (0.55 + 0.45 * twinkle);
    float reach = clamp(1.0 - distance(offset + cell * TOTAL_SIZE + 2.0, u_pointer) / 360.0, 0.0, 1.0);
    float reveal = pow(reach, 1.55) * u_hover;
    float morph = 0.0, correction = 0.0;
    int glyph = 0;
    if (reveal > 0.001) {
      uint seed = uint(cell.x) * 374761393u ^ uint(cell.y) * 668265263u ^ u_revision * 1274126177u;
      seed = (seed ^ (seed >> 13u)) * 1274126177u;
      glyph = int((seed ^ (seed >> 16u)) % 36u);
      morph = smoothstep(0.0, 0.24, reveal);
      float encodedCorrection = texture(u_morph_corrections,
        vec2((morph * 16.0 + 0.5) / 17.0, (float(glyph) + 0.5) / 36.0)).r;
      correction = (encodedCorrection * 255.0 - 128.0) / 64.0;
      /* Glyphs near the pointer resolve brighter than the dot field so they read as text. */
      opacity = mix(opacity, max(opacity, 0.55), morph);
    }
    float introOffset = distance(u_resolution / 2.0 / TOTAL_SIZE, cell) * 0.006 + random(cell) * 0.15;
    opacity *= step(introOffset, u_time * 0.5);
    opacity *= clamp((1.0 - step(introOffset + 0.1, u_time * 0.5)) * 1.25, 1.0, 1.25);
    state = vec4(opacity, morph, correction, float(glyph));
  }
  if (u_cell_pass) {
    fragColor = state;
    return;
  }
  float shape = step(2.0, local.x) * (1.0 - step(4.0, local.x)) *
    step(2.0, local.y) * (1.0 - step(4.0, local.y));
  /* Preserve the existing contour and screen-pixel coverage, including its edge fixes. */
  float aa = max(fwidth(fragCoord.x), fwidth(fragCoord.y)) * 0.25;
  if (state.y > 0.0) {
    vec2 q = abs(local - 3.0) - 1.0;
    float dotDistance = -(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
    int glyph = int(state.w);
    vec2 tile = vec2(float(glyph % 6), float(glyph / 6));
    float glyphDistance = (texture(u_atlas, (tile + local / 6.0) / 6.0).r - 0.5) * 8.0;
    float surface = mix(dotDistance, glyphDistance, state.y) + state.z;
    shape = smoothstep(-aa, aa, surface);
  }
  float opacity = state.x * mix(u_dim, u_glyph, state.y);
  opacity *= shape * step(0.0, st.x) * step(0.0, st.y);
  fragColor = vec4(vec3(opacity), opacity);
}`;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, canCacheCells ? fragmentSource : fragmentSource
      .replace('uniform bool u_use_cell_state;', 'const bool u_use_cell_state = false;')
      .replace('uniform bool u_cell_pass;', 'const bool u_cell_pass = false;'));
    if (!vertex || !fragment) return true;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return true;
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, atlasSize, atlasSize, 0, gl.RED, gl.UNSIGNED_BYTE, distances);
    gl.uniform1i(gl.getUniformLocation(program, 'u_atlas'), 0);
    const correctionTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, correctionTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, morphSteps, glyphs.length, 0, gl.RED, gl.UNSIGNED_BYTE, corrections);
    gl.uniform1i(gl.getUniformLocation(program, 'u_morph_corrections'), 1);
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const pointerLocation = gl.getUniformLocation(program, 'u_pointer');
    const hoverLocation = gl.getUniformLocation(program, 'u_hover');
    const dimLocation = gl.getUniformLocation(program, 'u_dim');
    const glyphLocation = gl.getUniformLocation(program, 'u_glyph');
    const revisionLocation = gl.getUniformLocation(program, 'u_revision');
    const cellPassLocation = gl.getUniformLocation(program, 'u_cell_pass');
    const useCellStateLocation = gl.getUniformLocation(program, 'u_use_cell_state');
    const cellTexture = gl.createTexture();
    const cellFramebuffer = gl.createFramebuffer();
    let cacheCells = false, columns = 0, rows = 0;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, cellTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'u_cell_state'), 2);
    gl.clearColor(0, 0, 0, 0);

    // Scale the background's coordinates while keeping its high-DPI canvas sharp.
    const backgroundScale = 1.75;
    const shaderUnitsPerPixel = 2 / backgroundScale;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = matchMedia('(any-pointer: fine)');
    const start = performance.now();
    let x = -1000, y = -1000, active = false, dirty = false, revision = 0;
    let frame = 0, strength = 0, lastNow = start;
    let resizeNeeded = true, pixelRatio = 0;

    function resize() {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight;
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      const resolutionX = cssWidth * shaderUnitsPerPixel, resolutionY = cssHeight * shaderUnitsPerPixel;
      gl.uniform2f(resolutionLocation, resolutionX, resolutionY);
      columns = Math.ceil(resolutionX / 12) + 1;
      rows = Math.ceil(resolutionY / 12) + 1;
      if (canCacheCells) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, cellTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, columns, rows, 0, gl.RGBA, gl.FLOAT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, cellFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cellTexture, 0);
        cacheCells = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.uniform1i(useCellStateLocation, cacheCells ? 1 : 0);
      pixelRatio = ratio;
      resizeNeeded = false;
    }
    function draw(now) {
      if (resizeNeeded || pixelRatio !== Math.min(devicePixelRatio || 1, 2)) resize();
      const dt = Math.min(50, now - lastNow);
      lastNow = now;
      const reduceGlow = document.body && document.body.classList.contains('user-reduce-glow');
      strength = motion.matches ? 0 : Math.max(0, Math.min(1, strength + (active && !reduceGlow ? dt / 60 : -dt / 150)));
      if (dirty) {
        revision += 1;
        dirty = false;
      }
      gl.uniform1f(timeLocation, motion.matches ? 6 : (now - start) / 1000);
      gl.uniform2f(pointerLocation, x * shaderUnitsPerPixel, y * shaderUnitsPerPixel);
      gl.uniform1f(hoverLocation, reduceGlow ? strength * 0.25 : strength);
      /* Dark field, brighter glyphs: dots stay faint while morphed text near the pointer pops. */
      const motionDim = motion.matches ? 0.5 : 1.0;
      gl.uniform1f(dimLocation, 0.12 * (reduceGlow ? 0.3 : 1.0) * motionDim);
      gl.uniform1f(glyphLocation, 0.65 * (reduceGlow ? 0.35 : 1.0) * motionDim);
      gl.uniform1ui(revisionLocation, revision);
      if (cacheCells) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, cellFramebuffer);
        gl.viewport(0, 0, columns, rows);
        gl.uniform1i(cellPassLocation, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindTexture(gl.TEXTURE_2D, cellTexture);
        gl.uniform1i(cellPassLocation, 0);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function loop(now) {
      draw(now);
      frame = requestAnimationFrame(loop);
    }
    function render() {
      cancelAnimationFrame(frame);
      if (document.hidden) return;
      lastNow = performance.now();
      if (motion.matches) draw(lastNow);
      else frame = requestAnimationFrame(loop);
    }
    function stop() {
      active = false;
      dirty = false;
    }
    window.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || motion.matches || !finePointer.matches) return;
      if (document.body && document.body.classList.contains('user-reduce-glow')) return;
      /* .ambient-canvas is inset -20vw, so the canvas origin sits off-viewport:
         map viewport coords into canvas-relative coords. */
      const rect = canvas.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      if (active && cx === x && cy === y) return;
      x = cx;
      y = cy;
      active = true;
      dirty = true;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', stop);
    window.addEventListener('blur', stop);
    window.addEventListener('resize', () => {
      resizeNeeded = true;
      if (motion.matches) draw(performance.now());
    }, { passive: true });
    motion.addEventListener('change', () => { stop(); render(); });
    finePointer.addEventListener('change', stop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { stop(); strength = 0; }
      render();
    });
    render();
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); }, { once: true });
  } else {
    if (!init()) {
      document.addEventListener('DOMContentLoaded', () => { init(); }, { once: true });
    }
  }
})();
