/* Video editor — frame compositor: keyframed transforms, color, chroma key (WebGL), masks,
   borders/shadows, transitions, text, mattes. Resolution-independent (preview scale / export). */
(() => {
'use strict';
const App = window.App, V = App.V;
const { clamp } = App;

const ease = p => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));
const backOut = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

V.TRANSITIONS = [
  { id: 'fade', name: 'Fade', tip: 'Gradually fades the clip in from (or out to) whatever is underneath — or black on the bottom track.' },
  { id: 'dissolve', name: 'Cross dissolve', tip: 'Blends smoothly from the previous clip on the same track into this one. Uses extra footage past the cut when available.' },
  { id: 'dipBlack', name: 'Dip to black', tip: 'The picture fades through black. Classic for scene or time changes.' },
  { id: 'dipWhite', name: 'Dip to white', tip: 'The picture flashes through white — great for dreamy or flashback cuts.' },
  { id: 'wipeL', name: 'Wipe left', tip: 'A hard edge sweeps across the frame from right to left, revealing the clip.' },
  { id: 'wipeR', name: 'Wipe right', tip: 'A hard edge sweeps across the frame from left to right.' },
  { id: 'wipeU', name: 'Wipe up', tip: 'A hard edge sweeps upward across the frame.' },
  { id: 'wipeD', name: 'Wipe down', tip: 'A hard edge sweeps downward across the frame.' },
  { id: 'slideL', name: 'Slide left', tip: 'The clip slides in from the right side (or exits to the left).' },
  { id: 'slideR', name: 'Slide right', tip: 'The clip slides in from the left side (or exits to the right).' },
  { id: 'slideU', name: 'Slide up', tip: 'The clip slides up from the bottom edge.' },
  { id: 'slideD', name: 'Slide down', tip: 'The clip drops in from the top edge.' },
  { id: 'iris', name: 'Iris', tip: 'A growing circle reveals the clip from the center outward.' },
  { id: 'zoom', name: 'Zoom', tip: 'The clip scales up from small while fading in (or shrinks away).' },
  { id: 'zoomBlur', name: 'Zoom blur', tip: 'A punchy zoom with motion blur — energetic, good for music edits.' },
  { id: 'blur', name: 'Blur', tip: 'The clip comes into focus from a heavy blur.' },
  { id: 'spin', name: 'Spin', tip: 'The clip rotates and scales into place.' },
  { id: 'pop', name: 'Pop', tip: 'A springy scale-up with a little overshoot. Fun for titles and stickers.' },
];

V.imageEl = m => {
  if (!m.img) { m.img = new Image(); m.img.onload = () => V.requestRender(); m.img.src = m.url; }
  return m.img;
};
V.filterString = (fx, extraBlur = 0, rs = 1) => {
  const p = [];
  if (fx.brightness !== 100) p.push(`brightness(${fx.brightness}%)`);
  if (fx.contrast !== 100) p.push(`contrast(${fx.contrast}%)`);
  if (fx.saturate !== 100) p.push(`saturate(${fx.saturate}%)`);
  if (fx.hue) p.push(`hue-rotate(${fx.hue}deg)`);
  if (fx.grayscale) p.push(`grayscale(${fx.grayscale}%)`);
  if (fx.sepia) p.push(`sepia(${fx.sepia}%)`);
  if (fx.invert) p.push(`invert(${fx.invert}%)`);
  const b = ((fx.blur || 0) + extraBlur) * rs;
  if (b > 0.05) p.push(`blur(${b.toFixed(2)}px)`);
  return p.length ? p.join(' ') : 'none';
};

/* ---------- WebGL chroma key ---------- */
const KEYER = (() => {
  let cv = null, gl = null, prog = null, tex = null, U = {};
  const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2((p.x+1.)*.5, 1.-(p.y+1.)*.5); gl_Position = vec4(p,0.,1.); }';
  const FS = `precision mediump float; varying vec2 v; uniform sampler2D tex; uniform vec3 key; uniform float sim, smoothv, spill;
    vec2 uv(vec3 c){ return vec2(c.r*-0.169 + c.g*-0.331 + c.b*0.5 + 0.5, c.r*0.5 + c.g*-0.419 + c.b*-0.081 + 0.5); }
    void main(){
      vec4 c = texture2D(tex, v);
      float d = distance(uv(c.rgb), uv(key));
      float base = d - sim;
      float a = pow(clamp(base / max(smoothv, 0.001), 0., 1.), 1.5);
      float sp = pow(clamp(base / max(spill, 0.001), 0., 1.), 1.5);
      float lum = clamp(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)), 0., 1.);
      vec3 rgb = mix(vec3(lum), c.rgb, sp);
      float alpha = c.a * a;
      gl_FragColor = vec4(rgb * alpha, alpha);
    }`;
  const init = () => {
    cv = document.createElement('canvas');
    gl = cv.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const n of ['key', 'sim', 'smoothv', 'spill']) U[n] = gl.getUniformLocation(prog, n);
    return true;
  };
  return (src, sw, sh, key, maxW) => {
    if (!gl && !init()) return null;
    const k = Math.min(1, maxW / sw);
    const w = Math.max(1, Math.round(sw * k)), hh = Math.max(1, Math.round(sh * k));
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    gl.viewport(0, 0, w, hh);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch { return null; }
    const [r, g, b] = App.hexToRgb(key.color);
    gl.uniform3f(U.key, r / 255, g / 255, b / 255);
    gl.uniform1f(U.sim, key.similarity / 100); gl.uniform1f(U.smoothv, key.smoothness / 100); gl.uniform1f(U.spill, key.spill / 100);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return { canvas: cv, k };
  };
})();

/* ---------- text ---------- */
V.textFont = T => `${T.italic ? 'italic ' : ''}${T.bold ? 800 : 500} ${T.size}px "${T.font}", Manrope, sans-serif`;
const measureCtx = document.createElement('canvas').getContext('2d');
V.textLayout = c => {
  const T = c.text;
  measureCtx.font = V.textFont(T);
  if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = (T.spacing || 0) + 'px';
  const lines = (T.content || ' ').split('\n');
  const widths = lines.map(l => measureCtx.measureText(l).width);
  const lh = T.size * 1.18;
  const pad = T.bg ? T.size * 0.38 : Math.max(4, T.strokeW);
  return { lines, widths, lh, pad, w: Math.max(1, ...widths) + pad * 2, h: lines.length * lh + pad * 2 };
};
/* captions: word timings ([start, end] seconds into the clip's text) drive a word highlight. If the text was edited
   and no longer has the same number of words, the timings are spread over the new words by length. */
const wordTimes = (T, toks) => {
  const W = T.words;
  if (W.length === toks.length) return W;
  const t0 = W[0][0], t1 = W[W.length - 1][1], tot = toks.reduce((n, w) => n + w.length + 1, 0) || 1;
  let acc = 0;
  return toks.map(w => { const a = t0 + (t1 - t0) * acc / tot; acc += w.length + 1; return [a, t0 + (t1 - t0) * acc / tot]; });
};
function drawWords(ctx, c, lt, L, x0, y0, shadowOn) {
  const T = c.text, toks = L.lines.flatMap(l => l.split(' ').filter(Boolean)), times = wordTimes(T, toks), t = lt + (c.in || 0);
  let active = -1; for (let i = 0; i < times.length; i++) if (times[i][0] <= t + 1e-3) active = i;
  ctx.textAlign = 'left';
  let wi = 0;
  L.lines.forEach((line, li) => {
    const y = y0 + L.pad + L.lh * (li + 0.5), lw = L.widths[li];
    const xl = T.align === 'left' ? x0 + L.pad : T.align === 'right' ? -x0 - L.pad - lw : -lw / 2;
    let pos = 0;
    for (const tok of line.split(' ')) {
      const at = pos; pos += tok.length + 1;
      if (!tok) continue;
      const i = wi++;
      if (T.hl === 'reveal' && i > active) continue;
      const x = xl + (at ? ctx.measureText(line.slice(0, at)).width : 0), on = i === active && T.hl !== 'reveal';
      if (on && T.hl === 'box') {
        const w = ctx.measureText(tok).width, px = T.size * 0.16;
        ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = T.hlColor || '#7c5cff';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - px, y - L.lh * 0.46, w + px * 2, L.lh * 0.92, T.size * 0.16) : ctx.rect(x - px, y - L.lh * 0.46, w + px * 2, L.lh * 0.92); ctx.fill(); ctx.restore();
      }
      shadowOn(true);
      if (T.strokeW > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = T.strokeW * 2; ctx.strokeStyle = T.stroke; ctx.strokeText(tok, x, y); if (T.shadow !== 'glow') shadowOn(false); }
      ctx.fillStyle = on && T.hl === 'color' ? (T.hlColor || '#ffd43b') : T.color;
      ctx.fillText(tok, x, y);
      if (T.shadow === 'glow') ctx.fillText(tok, x, y);
    }
  });
}
function drawText(ctx, c, lt, L, rs) {
  const T = c.text, H = V.project.height;
  const animT = Math.min(0.6, c.dur / 3);
  let a = 1, dy = 0, chars = Infinity, s = 1;
  const total = L.lines.reduce((n, l) => n + l.length, 0);
  switch (T.anim) {
    case 'fade': a = clamp(Math.min(lt / animT, (c.dur - lt) / animT), 0, 1); break;
    case 'rise': { const p = ease(lt / animT); dy = (1 - p) * T.size * 0.7; a = p * clamp((c.dur - lt) / animT, 0, 1); break; }
    case 'pop': { const p = clamp(lt / animT, 0, 1); s = Math.max(0.01, backOut(p)); a = clamp(p * 3, 0, 1) * clamp((c.dur - lt) / (animT * 0.6), 0, 1); break; }
    case 'typewriter': chars = Math.floor(total * clamp(lt / Math.max(0.3, Math.min(c.dur * 0.7, total * 0.06)), 0, 1)); break;
    case 'scroll': dy = (H / 2 + L.h / 2) - (lt / c.dur) * (H + L.h); break;
  }
  if (a <= 0) return;
  ctx.globalAlpha *= a;
  if (s !== 1) ctx.scale(s, s);
  const x0 = -L.w / 2, y0 = -L.h / 2 + dy;
  if (T.bg) {
    ctx.save();
    ctx.globalAlpha *= T.bgAlpha;
    ctx.fillStyle = T.bgColor;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x0, y0, L.w, L.h, T.size * 0.18) : ctx.rect(x0, y0, L.w, L.h);
    ctx.fill();
    ctx.restore();
  }
  ctx.font = V.textFont(T);
  if ('letterSpacing' in ctx) ctx.letterSpacing = (T.spacing || 0) + 'px';
  ctx.textBaseline = 'middle';
  ctx.textAlign = T.align;
  const k = rs * (c.scale || 1);
  if (T.shadow === 'soft') { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = T.size * 0.14 * k; ctx.shadowOffsetY = T.size * 0.04 * k; }
  else if (T.shadow === 'glow') { ctx.shadowColor = T.color; ctx.shadowBlur = T.size * 0.45 * k; }
  else if (T.shadow === 'hard') { ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowOffsetX = T.size * 0.05 * k; ctx.shadowOffsetY = T.size * 0.05 * k; }
  if (T.hl && T.hl !== 'none' && T.words && T.words.length) {
    const sc = ctx.shadowColor;
    drawWords(ctx, c, lt, L, x0, y0, on => { ctx.shadowColor = on ? sc : 'transparent'; });
    return;
  }
  let left = chars;
  L.lines.forEach((line, i) => {
    if (left <= 0) return;
    const txt = left < line.length ? line.slice(0, left) : line;
    left -= line.length;
    const y = y0 + L.pad + L.lh * (i + 0.5);
    const x = T.align === 'left' ? x0 + L.pad : T.align === 'right' ? -x0 - L.pad : 0;
    if (T.strokeW > 0) {
      ctx.lineJoin = 'round'; ctx.lineWidth = T.strokeW * 2; ctx.strokeStyle = T.stroke;
      ctx.strokeText(txt, x, y);
      if (T.shadow !== 'glow') ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = T.color;
    ctx.fillText(txt, x, y);
    if (T.shadow === 'glow') ctx.fillText(txt, x, y);
  });
}

/* ---------- clip compositor ---------- */
V.boxes = new Map();
V._rs = 1;
const shapePath = (c, ox, oy, cw, ch, kx) => {
  const M = c.mask;
  if (!M || M.shape === 'none') return null;
  const p = new Path2D();
  if (M.shape === 'circle') { p.arc(ox + cw / 2, oy + ch / 2, Math.min(cw, ch) / 2, 0, Math.PI * 2); }
  else if (M.shape === 'ellipse') { p.ellipse(ox + cw / 2, oy + ch / 2, cw / 2, ch / 2, 0, 0, Math.PI * 2); }
  else { const r = Math.min(cw / 2, ch / 2, (M.radius || 0) / Math.max(1e-6, Math.abs(kx))); p.roundRect ? p.roundRect(ox, oy, cw, ch, r) : p.rect(ox, oy, cw, ch); }
  return p;
};
/** a clip whose media file is gone shows a "Media offline" slate instead of nothing (like pro editors do) */
function offlineSlate(ctx, c) {
  const W = V.project.width, H = V.project.height;
  ctx.save();
  ctx.fillStyle = '#2a0d0d'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,90,90,.18)'; ctx.lineWidth = H * 0.02;
  for (let x = -H; x < W; x += H * 0.08) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
  ctx.fillStyle = '#ff6b6b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(H * 0.07)}px Manrope, sans-serif`; ctx.fillText('MEDIA OFFLINE', W / 2, H / 2 - H * 0.03);
  ctx.fillStyle = 'rgba(255,220,220,.75)'; ctx.font = `600 ${Math.round(H * 0.028)}px Manrope, sans-serif`;
  ctx.fillText((c.name ? `“${c.name}” — ` : '') + 'the file for this clip is missing. Import it again or delete the clip.', W / 2, H / 2 + H * 0.05);
  ctx.restore();
}
V.drawClip = (ctx, c, t, opt = {}) => {
  const P = V.project, W = P.width, H = P.height, rs = V._rs;
  const m = c.mediaId ? V.getMedia(c.mediaId) : null;
  if (c.mediaId && !m && (c.kind === 'video' || c.kind === 'image')) return offlineSlate(ctx, c);
  let src = null, sw = W, sh = H, L = null;
  if (c.kind === 'video') {
    if (!m || m.loading) return;
    let el;
    if (opt.vids) {
      el = opt.vids.get(c.id);
      if (!el) return;
      if (el.src && el.w) { src = el.src; sw = el.w; sh = el.h; }
    } else {
      el = V.videoEl(c);
      if (!opt.synced) V.syncVideo(el, c, c.in + (t - c.start) * c.speed, m);
      if (el.seeking || el.readyState < 2) V._retry = true;
    }
    if (!src) {
      if (el.readyState < 2 || el.error) return;
      src = el; sw = el.videoWidth; sh = el.videoHeight;
    }
  } else if (c.kind === 'image') {
    if (!m) return;
    const img = V.imageEl(m);
    if (!img.complete || !img.naturalWidth) return;
    src = img; sw = img.naturalWidth; sh = img.naturalHeight;
  } else if (c.kind === 'text') {
    L = V.textLayout(c); sw = L.w; sh = L.h;
  } else if (c.kind !== 'color') return;
  if (!sw || !sh) return;

  const lt = t - c.start;
  let fx = 1, fy = 1;
  if (src) {
    if (c.fit === 'cover') fx = fy = Math.max(W / sw, H / sh);
    else if (c.fit === 'stretch') { fx = W / sw; fy = H / sh; }
    else if (c.fit === 'none') fx = fy = 1;
    else fx = fy = Math.min(W / sw, H / sh);
  }
  const kv = p => V.kfVal(c, p, lt);
  let alpha = kv('opacity'), tx = kv('x'), ty = kv('y'), sc = kv('scale'), rot = kv('rotation'), blur = 0, dip = null, clip = null;

  if (c.motion && c.motion !== 'none') {
    const p = clamp(lt / c.dur, 0, 1), e = ease(p);
    switch (c.motion) {
      case 'zoomIn': sc *= 1 + 0.2 * e; break;
      case 'zoomOut': sc *= 1.2 - 0.2 * e; break;
      case 'panL': sc *= 1.15; tx += (0.5 - e) * W * 0.12; break;
      case 'panR': sc *= 1.15; tx -= (0.5 - e) * W * 0.12; break;
      case 'panU': sc *= 1.15; ty += (0.5 - e) * H * 0.12; break;
      case 'panD': sc *= 1.15; ty -= (0.5 - e) * H * 0.12; break;
      case 'shake': tx += (Math.sin(lt * 41) + Math.sin(lt * 23)) * W * 0.004; ty += (Math.cos(lt * 37) + Math.sin(lt * 29)) * H * 0.004; sc *= 1.04; break;
      case 'pulse': sc *= 1 + 0.03 * Math.sin(lt * Math.PI * 2); break;
    }
  }
  const applyT = (type, p, isIn) => {
    p = clamp(p, 0, 1);
    const e = ease(p);
    switch (type) {
      case 'fade': case 'dissolve': alpha *= p; break;
      case 'dipBlack': dip = { color: '#000', a: 1 - p }; break;
      case 'dipWhite': dip = { color: '#fff', a: 1 - p }; break;
      case 'slideL': tx += (isIn ? 1 : -1) * (1 - e) * W; break;
      case 'slideR': tx += (isIn ? -1 : 1) * (1 - e) * W; break;
      case 'slideU': ty += (isIn ? 1 : -1) * (1 - e) * H; break;
      case 'slideD': ty += (isIn ? -1 : 1) * (1 - e) * H; break;
      case 'wipeL': clip = isIn ? { x: W * (1 - e), w: W * e } : { x: 0, w: W * e }; break;
      case 'wipeR': clip = isIn ? { x: 0, w: W * e } : { x: W * (1 - e), w: W * e }; break;
      case 'wipeU': clip = isIn ? { y: H * (1 - e), h: H * e } : { y: 0, h: H * e }; break;
      case 'wipeD': clip = isIn ? { y: 0, h: H * e } : { y: H * (1 - e), h: H * e }; break;
      case 'iris': clip = { r: e * Math.hypot(W, H) / 2 }; break;
      case 'zoom': sc *= 0.5 + 0.5 * e; alpha *= p; break;
      case 'zoomBlur': sc *= isIn ? 1.5 - 0.5 * e : 1 + 0.5 * (1 - e); blur += (1 - e) * 22; alpha *= Math.min(1, p * 1.6); break;
      case 'blur': blur += (1 - p) * 30; alpha *= Math.min(1, p * 1.5); break;
      case 'spin': rot += (1 - e) * (isIn ? -180 : 180); sc *= 0.3 + 0.7 * e; alpha *= p; break;
      case 'pop': sc *= Math.max(0.01, isIn ? backOut(p) : e); alpha *= Math.min(1, p * 3); break;
    }
  };
  if (!opt.held) {
    const ti = c.transIn, to = c.transOut;
    if (ti.type !== 'none' && ti.dur > 0 && lt < ti.dur) applyT(ti.type, lt / ti.dur, true);
    if (to.type !== 'none' && to.dur > 0 && c.dur - lt < to.dur) applyT(to.type, (c.dur - lt) / to.dur, false);
  }
  if (alpha <= 0.002 && !opt.pick) return;

  // chroma key: run the source through the GPU keyer
  let drawSrc = src, sk = 1;
  if (src && c.key && c.key.on && !opt.noKey) {
    const r = KEYER(src, sw, sh, c.key, opt.vids ? 3840 : 1920);
    if (r) { drawSrc = r.canvas; sk = r.k; }
  }

  const cr = c.kind === 'text' ? { l: 0, t: 0, r: 0, b: 0 } : c.crop;
  const cx = cr.l * sw, cy = cr.t * sh, cw = sw * (1 - cr.l - cr.r), ch = sh * (1 - cr.t - cr.b);
  if (cw <= 0 || ch <= 0) return;
  const ox = -sw / 2 + cx, oy = -sh / 2 + cy;
  const kx = sc * fx * (c.flipH ? -1 : 1), ky = sc * fy * (c.flipV ? -1 : 1);

  ctx.save();
  if (clip) {
    ctx.beginPath();
    if (clip.r != null) ctx.arc(W / 2, H / 2, Math.max(0.01, clip.r), 0, Math.PI * 2);
    else ctx.rect(clip.x ?? 0, clip.y ?? 0, clip.w ?? W, clip.h ?? H);
    ctx.clip();
  }
  ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
  ctx.globalCompositeOperation = c.blend || 'source-over';
  ctx.translate(W / 2 + tx, H / 2 + ty);
  if (rot) ctx.rotate(rot * Math.PI / 180);
  ctx.scale(kx, ky);
  const shp = c.kind !== 'text' ? shapePath(c, ox, oy, cw, ch, kx) : null;
  const S = c.shadow;
  const shadowOn = S && S.on && c.kind !== 'text';
  const keyed = drawSrc !== src;
  let shadowViaImage = false;
  const setShadow = () => { ctx.shadowColor = `rgba(0,0,0,${S.opacity / 100})`; ctx.shadowBlur = S.blur * rs; ctx.shadowOffsetY = S.dist * rs; ctx.shadowOffsetX = 0; };
  if (shadowOn) {
    if (shp || (c.kind === 'video' && !keyed) || c.kind === 'color') {
      ctx.save(); setShadow(); ctx.fillStyle = '#000';
      if (shp) ctx.fill(shp); else ctx.fillRect(ox, oy, cw, ch);
      ctx.restore();
    } else shadowViaImage = true;
  }
  if (shp) ctx.clip(shp);
  ctx.filter = V.filterString(c.fx, blur, rs);
  if (shadowViaImage) setShadow();
  if (drawSrc) ctx.drawImage(drawSrc, cx * sk, cy * sk, cw * sk, ch * sk, ox, oy, cw, ch);
  else if (c.kind === 'color') {
    const F = c.fill;
    if (F.gradient) {
      const a = F.angle * Math.PI / 180, r = Math.hypot(sw, sh) / 2;
      const g = ctx.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
      g.addColorStop(0, F.c1); g.addColorStop(1, F.c2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = F.c1;
    ctx.fillRect(ox, oy, cw, ch);
  } else if (c.kind === 'text') drawText(ctx, c, lt, L, rs);
  ctx.filter = 'none';
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (c.fx.vignette > 0 && c.kind !== 'text') {
    const g = ctx.createRadialGradient(0, 0, Math.min(sw, sh) * 0.3, 0, 0, Math.hypot(sw, sh) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${c.fx.vignette / 100})`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g; ctx.fillRect(ox, oy, cw, ch);
  }
  if (dip && dip.a > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = dip.a * Math.min(1, alpha > 0 ? kv('opacity') : 0);
    ctx.fillStyle = dip.color;
    ctx.fillRect(ox, oy, cw, ch);
  }
  if (c.border && c.border.width > 0 && c.kind !== 'text') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    ctx.lineWidth = c.border.width * 2 / Math.max(1e-6, Math.abs(kx));
    ctx.strokeStyle = c.border.color;
    if (shp) ctx.stroke(shp); else ctx.strokeRect(ox, oy, cw, ch);
  }
  ctx.restore();

  if (!opt.held) {
    const r = rot * Math.PI / 180, lx = (ox + cw / 2) * kx, ly = (oy + ch / 2) * ky;
    V.boxes.set(c.id, {
      cx: W / 2 + tx + lx * Math.cos(r) - ly * Math.sin(r),
      cy: H / 2 + ty + lx * Math.sin(r) + ly * Math.cos(r),
      w: Math.abs(cw * kx), h: Math.abs(ch * ky), rot: r,
    });
  }
};

/* ---------- full frame ---------- */
V.activeAt = t => {
  const out = [];
  const vtr = V.tracks.filter(tr => tr.type === 'video');
  for (let i = vtr.length - 1; i >= 0; i--) {
    const tr = vtr[i];
    if (tr.hidden) continue;
    const list = V.clipsOn(tr.id);
    const c = list.find(k => t >= k.start - 1e-6 && t < k.start + k.dur - 1e-6);
    if (!c) continue;
    if (c.transIn.type === 'dissolve' && t - c.start < c.transIn.dur) {
      const prev = list.find(p => p !== c && Math.abs(p.start + p.dur - c.start) < 0.75 / V.project.fps);
      if (prev) out.push({ c: prev, held: true });
    }
    out.push({ c, held: false });
  }
  return out;
};
const HOLD_MS = 10000;   // longer than player.js STUCK_MS, so a reloaded video gets time to show up
let holdAt = 0, shownSize = '';
// a video that is loading or seeking (not one that has failed: that one just shows nothing)
const waits = c => { if (c.kind !== 'video') return false; const m = V.getMedia(c.mediaId); return !!m && !m.loading && !V.videoReady(c) && !V.videoEl(c).error; };
const syncActive = (list, t) => {
  for (const { c } of list) {
    if (c.kind !== 'video') continue;
    const m = V.getMedia(c.mediaId);
    if (m && !m.loading) V.syncVideo(V.videoEl(c), c, c.in + (t - c.start) * c.speed, m);
  }
};
V.renderFrame = (t, ctx = V.ctx, opts = {}) => {
  const P = V.project;
  const list = V.activeAt(t);
  // The preview draws each video as it is right now and only then steers it to the new time, and while a
  // video is seeking or loading (it has no picture to give) the last frame stays up instead of flashing
  // black. The hold ends as soon as every video has caught up; a video stuck for longer is reloaded.
  const live = ctx === V.ctx && !opts.vids;
  if (live) {
    const waiting = list.some(({ c }) => waits(c));
    const size = ctx.canvas.width + 'x' + ctx.canvas.height;
    if (!waiting) holdAt = 0;
    else if (!holdAt) holdAt = performance.now();
    if (waiting && !opts.noKey && shownSize === size && performance.now() - holdAt < HOLD_MS) {
      syncActive(list, t);
      if (!V.playing) setTimeout(V.requestRender, 80);
      return;
    }
    shownSize = size;
  }
  const s = opts.scale ?? V.previewScale;
  V._rs = s;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  if (!opts.vids) { V.boxes.clear(); V._retry = false; }
  const active = new Set();
  for (const { c, held } of list) {
    V.drawClip(ctx, c, t, { held, vids: opts.vids, noKey: opts.noKey, synced: live });
    active.add(c.id);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  V._rs = V.previewScale;
  if (opts.vids) return;
  if (live) syncActive(list, t);
  V.activeIds = active;
  V.pauseInactive && V.pauseInactive(active);
  V.drawOverlay && V.drawOverlay();
  if (V._retry && !V.playing && ctx === V.ctx) setTimeout(V.requestRender, 80);
};

let pending = false;
V.requestRender = () => {
  if (pending || !V.ctx) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; if (!V.playing) V.renderFrame(V.time); });
};

/* ---------- transition thumbnail preview ---------- */
V.previewTransition = (ctx, type, p, w, h) => {
  const ga = ctx.createLinearGradient(0, 0, w, h); ga.addColorStop(0, '#3c4352'); ga.addColorStop(1, '#1d2129');
  const gb = ctx.createLinearGradient(0, 0, w, h); gb.addColorStop(0, '#ff9a6b'); gb.addColorStop(1, '#7b4dff');
  const e = ease(p);
  ctx.save(); ctx.fillStyle = ga; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = '700 11px Manrope'; ctx.fillText('A', 8, 16);
  ctx.restore();
  ctx.save();
  let a = 1, x = 0, y = 0, s = 1, r = 0, b = 0;
  const dipTo = (col) => { ctx.fillStyle = col; ctx.globalAlpha = p < 0.5 ? p * 2 : 1; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = p < 0.5 ? 0 : (p - 0.5) * 2; };
  switch (type) {
    case 'fade': case 'dissolve': a = p; break;
    case 'dipBlack': dipTo('#000'); a = ctx.globalAlpha; break;
    case 'dipWhite': dipTo('#fff'); a = ctx.globalAlpha; break;
    case 'slideL': x = (1 - e) * w; break; case 'slideR': x = -(1 - e) * w; break;
    case 'slideU': y = (1 - e) * h; break; case 'slideD': y = -(1 - e) * h; break;
    case 'wipeL': ctx.beginPath(); ctx.rect(w * (1 - e), 0, w * e, h); ctx.clip(); break;
    case 'wipeR': ctx.beginPath(); ctx.rect(0, 0, w * e, h); ctx.clip(); break;
    case 'wipeU': ctx.beginPath(); ctx.rect(0, h * (1 - e), w, h * e); ctx.clip(); break;
    case 'wipeD': ctx.beginPath(); ctx.rect(0, 0, w, h * e); ctx.clip(); break;
    case 'iris': ctx.beginPath(); ctx.arc(w / 2, h / 2, e * Math.hypot(w, h) / 2 + 0.01, 0, 7); ctx.clip(); break;
    case 'zoom': s = 0.5 + 0.5 * e; a = p; break;
    case 'zoomBlur': s = 1.5 - 0.5 * e; b = (1 - e) * 6; a = Math.min(1, p * 1.6); break;
    case 'blur': b = (1 - p) * 8; a = Math.min(1, p * 1.5); break;
    case 'spin': r = (1 - e) * -Math.PI; s = 0.3 + 0.7 * e; a = p; break;
    case 'pop': s = Math.max(0.01, backOut(p)); a = Math.min(1, p * 3); break;
  }
  ctx.globalAlpha = clamp(a, 0, 1);
  if (b) ctx.filter = `blur(${b}px)`;
  ctx.translate(w / 2 + x, h / 2 + y); ctx.rotate(r); ctx.scale(s, s);
  ctx.fillStyle = gb; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.font = '800 11px Manrope'; ctx.fillText('B', -w / 2 + 8, -h / 2 + 16);
  ctx.restore();
};
})();
