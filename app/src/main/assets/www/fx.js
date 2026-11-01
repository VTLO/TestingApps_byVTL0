/* ═══════════════════════════════════════════════════════════
   OPERATION LIGHTNING — FX engine (WebGL storm, bolts, sparks,
   scramble text, count-ups, live spectrum, Kepler orbit, haptics)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const doc = document, root = doc.documentElement;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NATIVE = window.AndroidFX || null;
  const $ = (s, r) => (r || doc).querySelector(s);
  const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ───────── native bridge helpers ───────── */
  const buzz = p => { try { NATIVE && NATIVE.vibrate && NATIVE.vibrate(String(p)); } catch (e) {} };
  const tick = () => { try { NATIVE && NATIVE.tick && NATIVE.tick(); } catch (e) {} };

  window.__setInsets = function (t, r, b, l) {
    const s = root.style;
    s.setProperty('--sat', t + 'px'); s.setProperty('--sar', r + 'px');
    s.setProperty('--sab', b + 'px'); s.setProperty('--sal', l + 'px');
  };

  /* ───────── tilt (native accelerometer → here; touch fallback) ───────── */
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  window.__tilt = function (x, y) { tilt.tx = clamp(x, -1, 1); tilt.ty = clamp(y, -1, 1); kickTilt(); };
  let tiltRun = false, lastTX = 9, lastTY = 9;
  function tiltLoop() {
    tilt.x += (tilt.tx - tilt.x) * 0.08; tilt.y += (tilt.ty - tilt.y) * 0.08;
    const hero = $('.hero');
    if (hero && hero.offsetParent !== null && (Math.abs(tilt.x - lastTX) > .004 || Math.abs(tilt.y - lastTY) > .004)) {
      lastTX = tilt.x; lastTY = tilt.y;
      hero.style.setProperty('--tx', tilt.x.toFixed(3)); hero.style.setProperty('--ty', tilt.y.toFixed(3));
    }
    if (Math.abs(tilt.tx - tilt.x) > .002 || Math.abs(tilt.ty - tilt.y) > .002) requestAnimationFrame(tiltLoop); else tiltRun = false;
  }
  function kickTilt() { if (!tiltRun && !reduce) { tiltRun = true; requestAnimationFrame(tiltLoop); } }
  // touch-drag fallback: gently steers tilt when no native sensor feed
  let sensorSeen = false; const _st = window.__tilt;
  window.__tilt = function (x, y) { sensorSeen = true; _st(x, y); };
  addEventListener('touchmove', e => {
    if (sensorSeen || !e.touches[0]) return;
    tilt.tx = clamp((e.touches[0].clientX / innerWidth - .5) * 1.4, -1, 1);
    tilt.ty = clamp((e.touches[0].clientY / innerHeight - .5) * 1.4, -1, 1); kickTilt();
  }, { passive: true });

  /* ═════════════════════ 1. WEBGL STORM BACKGROUND ═════════════════════ */
  const bg = doc.createElement('canvas'); bg.id = 'fx-bg'; doc.body.prepend(bg);
  const fg = doc.createElement('canvas'); fg.id = 'fx-fg'; doc.body.appendChild(fg);
  const flashEl = doc.createElement('div'); flashEl.id = 'fx-flash'; doc.body.appendChild(flashEl);
  const sweepEl = doc.createElement('div'); sweepEl.id = 'fx-sweep'; doc.body.appendChild(sweepEl);

  const U = { flash: 0, boltX: .5, boltY: 1, boost: 1 };
  let gl = null, prog = null, uni = {}, glOK = false, bgW = 0, bgH = 0;
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uR; uniform float uT; uniform vec2 uTilt; uniform float uFlash; uniform vec2 uBolt; uniform float uBoost;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/uR;
  vec2 p=(gl_FragCoord.xy-.5*uR)/min(uR.x,uR.y);
  p+=uTilt*.07;
  float t=uT*.035;
  vec2 q=vec2(fbm(p*1.5+t),fbm(p*1.5+vec2(5.2,1.3)-t));
  float c=fbm(p*1.7+q*1.9+vec2(0.,t*2.));
  vec3 col=vec3(.012,.026,.052);
  col+=vec3(.018,.07,.115)*smoothstep(.22,.86,c)*1.5;
  // electric cyan veins
  float r1=1.-abs(2.*fbm(p*3.1+q*2.6+t*3.)-1.); r1=pow(r1,10.);
  col+=vec3(0.,.55,.78)*r1*.26*uBoost;
  // hot red filaments (the jammer)
  float r2=1.-abs(2.*fbm(p*2.3-q*2.1+vec2(t*2.,-t))-1.); r2=pow(r2,16.);
  col+=vec3(.95,.12,.1)*r2*.11*uBoost;
  // stars
  vec2 sg=floor(gl_FragCoord.xy/3.);
  float sh=hash(sg); float star=step(.9972,sh)*(.45+.55*sin(uT*2.+sh*90.));
  col+=vec3(.7,.85,1.)*star*(1.-smoothstep(.3,.7,c))*.7;
  // lightning flash, lights up clouds
  float d=length((uv-uBolt)*vec2(uR.x/uR.y,1.));
  col+=vec3(.5,.72,1.)*uFlash*exp(-d*2.2)*(.45+.9*c);
  col+=vec3(.12,.2,.35)*uFlash*.35;
  // vignette + faint grain
  col*=1.-.62*dot(uv-.5,uv-.5)*2.;
  col+=(hash(gl_FragCoord.xy+uT)-.5)*.012;
  gl_FragColor=vec4(col,1.);
}`;
  function initGL() {
    try {
      if (/[?&]nogl/.test(location.search)) return;
      gl = bg.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false }) ||
           bg.getContext('experimental-webgl');
      if (!gl) return;
      const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram();
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['uR', 'uT', 'uTilt', 'uFlash', 'uBolt', 'uBoost'].forEach(n => uni[n] = gl.getUniformLocation(prog, n));
      glOK = true;
    } catch (e) { glOK = false; }
  }
  function sizeBG() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sc = 0.42 * dpr;                      // render at reduced res, upscaled smoothly
    bgW = Math.max(2, Math.round(innerWidth * sc)); bgH = Math.max(2, Math.round(innerHeight * sc));
    bg.width = bgW; bg.height = bgH;
    if (glOK) gl.viewport(0, 0, bgW, bgH);
  }
  initGL(); sizeBG();
  bg.addEventListener('webglcontextlost', e => { e.preventDefault(); glOK = false; });
  bg.addEventListener('webglcontextrestored', () => { initGL(); sizeBG(); });

  let t0 = performance.now(), lastBG = 0, pageVisible = true;
  doc.addEventListener('visibilitychange', () => { pageVisible = !doc.hidden; if (pageVisible) requestAnimationFrame(bgLoop); });
  function bgLoop(now) {
    if (!pageVisible) return;
    requestAnimationFrame(bgLoop);
    if (!glOK || now - lastBG < 33) return;     // ≈30 fps cap: battery friendly
    lastBG = now;
    gl.uniform2f(uni.uR, bgW, bgH);
    gl.uniform1f(uni.uT, reduce ? 0 : (now - t0) / 1000);
    gl.uniform2f(uni.uTilt, tilt.x, -tilt.y);
    gl.uniform1f(uni.uFlash, U.flash);
    gl.uniform2f(uni.uBolt, U.boltX, U.boltY);
    gl.uniform1f(uni.uBoost, U.boost);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    U.flash *= 0.90; if (U.flash < 0.004) U.flash = 0;
    U.boost += (1 - U.boost) * 0.03;
  }
  requestAnimationFrame(bgLoop);

  /* ═════════════════════ 2. BOLTS + SPARKS (2D overlay) ═════════════════════ */
  const fctx = fg.getContext('2d');
  let FW = 0, FH = 0, fdpr = 1;
  function sizeFG() {
    fdpr = Math.min(window.devicePixelRatio || 1, 2);
    FW = innerWidth; FH = innerHeight;
    fg.width = Math.round(FW * fdpr); fg.height = Math.round(FH * fdpr);
    fctx.setTransform(fdpr, 0, 0, fdpr, 0, 0);
  }
  sizeFG();
  addEventListener('resize', () => { sizeFG(); sizeBG(); });

  const bolts = [];     // {pts, branches, life, max, color, w}
  const sparks = [];    // {x,y,vx,vy,life,max,c}
  let fgRunning = false;

  function jag(x0, y0, x1, y1, disp, out) {
    if (disp < 3.5) { out.push([x1, y1]); return; }
    const mx = (x0 + x1) / 2 + rnd(-.5, .5) * disp, my = (y0 + y1) / 2 + rnd(-.5, .5) * disp;
    jag(x0, y0, mx, my, disp / 2, out); jag(mx, my, x1, y1, disp / 2, out);
  }
  function makeBolt(x0, y0, x1, y1, disp, color, w, life, branches) {
    const pts = [[x0, y0]]; jag(x0, y0, x1, y1, disp, pts);
    const br = [];
    if (branches) {
      for (let i = 0; i < pts.length; i += 1) {
        if (Math.random() < 0.09 && i > 2) {
          const [bx, by] = pts[i];
          const ang = Math.atan2(y1 - y0, x1 - x0) + rnd(-1.1, 1.1);
          const len = rnd(.08, .22) * Math.hypot(x1 - x0, y1 - y0);
          const bp = [[bx, by]]; jag(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len, disp * .4, bp);
          br.push(bp);
        }
      }
    }
    bolts.push({ pts, br, life, max: life, color, w });
    kickFG();
  }
  function strokePath(pts, w, a, color) {
    fctx.beginPath(); fctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) fctx.lineTo(pts[i][0], pts[i][1]);
    fctx.lineWidth = w; fctx.strokeStyle = color.replace('A', a.toFixed(3)); fctx.stroke();
  }
  function fgFrame() {
    fctx.clearRect(0, 0, FW, FH);
    fctx.lineCap = 'round'; fctx.lineJoin = 'round';
    fctx.globalCompositeOperation = 'lighter';
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i], k = b.life / b.max;
      const flick = k > .55 ? 1 : (Math.random() < .55 ? 1 : .35);
      const a = Math.min(1, k * 1.4) * flick;
      // layered glow: wide soft → thin hot core
      strokePath(b.pts, b.w * 7, a * .10, b.color);
      strokePath(b.pts, b.w * 3.2, a * .30, b.color);
      strokePath(b.pts, b.w, a * .95, 'rgba(235,245,255,A)');
      b.br.forEach(p => { strokePath(p, b.w * 2.6, a * .12, b.color); strokePath(p, b.w * .6, a * .7, 'rgba(235,245,255,A)'); });
      if (--b.life <= 0) bolts.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vy += .08; s.vx *= .985; s.life--;
      const k = s.life / s.max;
      fctx.fillStyle = s.c.replace('A', (k * .9).toFixed(3));
      fctx.beginPath(); fctx.arc(s.x, s.y, 1.1 + k * 1.4, 0, 6.2832); fctx.fill();
      if (s.life <= 0) sparks.splice(i, 1);
    }
    fctx.globalCompositeOperation = 'source-over';
    if (bolts.length || sparks.length) requestAnimationFrame(fgFrame); else { fgRunning = false; fctx.clearRect(0, 0, FW, FH); }
  }
  function kickFG() { if (!fgRunning) { fgRunning = true; requestAnimationFrame(fgFrame); } }

  function spark(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.2832), v = rnd(.6, 3.4);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: Math.round(rnd(14, 34)), max: 34, c: col || 'rgba(120,235,255,A)' });
    }
    kickFG();
  }
  function touchArc(x, y) {
    if (reduce) return;
    const n = 2 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.2832), d = rnd(40, 110);
      makeBolt(x, y, x + Math.cos(a) * d, y + Math.sin(a) * d, d * .5, 'rgba(0,229,255,A)', 1.1, 9, false);
    }
    spark(x, y, 14);
  }
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    touchArc(e.clientX, e.clientY);
    if (e.target.closest && e.target.closest('.nav-item, .card, .card-wide, .launch-skip')) tick();
  }, { passive: true });

  /* big strike used by the ambient storm */
  function strike(opts) {
    opts = opts || {};
    const x = opts.x != null ? opts.x : innerWidth * rnd(.15, .85);
    const yEnd = innerHeight * rnd(.45, .8);
    makeBolt(x, -6, x + rnd(-90, 90), yEnd, innerHeight * .26, 'rgba(120,190,255,A)', 2.0, 20, true);
    if (Math.random() < .5) makeBolt(x + rnd(-30, 30), -6, x + rnd(-120, 120), yEnd * .8, innerHeight * .2, 'rgba(160,210,255,A)', 1.4, 15, true);
    root.style.setProperty('--fx', (x / innerWidth * 100).toFixed(1) + '%');
    flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
    U.flash = 1; U.boltX = x / innerWidth; U.boltY = 0.92; U.boost = 2.6;
    buzz('0,35,45,70,40,30');
  }
  window.__lxStrike = strike;

  /* ambient storm — begins once the launch overlay is gone */
  let stormTimer = null;
  function scheduleStrike() {
    clearTimeout(stormTimer);
    if (reduce) return;
    stormTimer = setTimeout(() => {
      if (!doc.hidden) { strike(); if (Math.random() < .4) setTimeout(strike, rnd(160, 380)); }
      scheduleStrike();
    }, rnd(11000, 24000));
  }

  /* hook the original launch sequence → haptics + native sync */
  const stormFlash = $('#storm-flash');
  if (stormFlash) {
    new MutationObserver(() => {
      if (stormFlash.classList.contains('strike')) { buzz('0,30,40,60,35,25'); U.flash = 1; U.boost = 2.4; }
    }).observe(stormFlash, { attributes: true, attributeFilter: ['class'] });
  }
  const credit = $('#launch-credit');
  if (credit) new MutationObserver(() => { if (credit.classList.contains('show')) buzz('0,18,30,18,30,90'); })
    .observe(credit, { attributes: true, attributeFilter: ['class'] });
  const overlay = $('#launch-overlay');
  let launched = false;
  function afterLaunch() {
    if (launched) return; launched = true;
    onEnter($('.section.active'), true);
    scheduleStrike();
  }
  if (overlay) {
    new MutationObserver(() => { if (overlay.classList.contains('done') || overlay.style.display === 'none') afterLaunch(); })
      .observe(overlay, { attributes: true, attributeFilter: ['class', 'style'] });
  } else afterLaunch();

  /* ═════════════════════ 3. SECTION CHOREOGRAPHY ═════════════════════ */
  const REVEAL = '.hero, .card, .card-wide, .timeline-item, .page-title';
  function prep() {
    $$('.section').forEach(sec => {
      $$(REVEAL, sec).forEach((el, i) => { el.classList.add('fx-r'); el.style.setProperty('--i', Math.min(i, 12)); });
    });
    $$('table.tech-table').forEach(t => {
      if (t.parentElement.classList.contains('tbl-scroll')) return;
      const w = doc.createElement('div'); w.className = 'tbl-scroll'; t.parentNode.insertBefore(w, t); w.appendChild(t);
    });
  }
  prep();

  const GLYPHS = '█▓▒░<>/\\|01#$%&*+=?';
  function scramble(el) {
    if (reduce || el.children.length) return;
    const final = el.dataset.txt || (el.dataset.txt = el.textContent);
    let frame = 0; const total = 22;
    clearInterval(el._sc);
    el._sc = setInterval(() => {
      const reveal = Math.floor(frame / total * final.length);
      let s = '';
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        s += (i < reveal || ch === ' ') ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = s;
      if (++frame > total) { clearInterval(el._sc); el.textContent = final; }
    }, 32);
  }

  function countUp(el) {
    if (reduce) return;
    const orig = el.dataset.orig || (el.dataset.orig = el.textContent.trim());
    const m = orig.match(/^([−+\-<≈]?)(\d+(?:\.\d+)?)([A-Za-z%]*)$/);
    if (!m) return;
    const target = parseFloat(m[2]); if (!(target > 0)) return;
    const dec = (m[2].split('.')[1] || '').length;
    const t0 = performance.now(), dur = 900 + Math.min(target, 2000) * .12;
    cancelAnimationFrame(el._cu);
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 4);
      el.textContent = m[1] + (target * e).toFixed(dec) + m[3];
      if (k < 1) el._cu = requestAnimationFrame(step); else el.textContent = orig;
    };
    el._cu = requestAnimationFrame(step);
  }

  function onEnter(sec, first) {
    if (!sec) return;
    sec.classList.remove('fx-enter'); void sec.offsetWidth; sec.classList.add('fx-enter');
    if (!reduce) { sweepEl.classList.remove('go'); void sweepEl.offsetWidth; sweepEl.classList.add('go'); }
    const h1 = $('.page-title h1', sec); if (h1) scramble(h1);
    $$('.card-value, .hero-meta-item strong', sec).forEach(countUp);
    // keep the active dock item in view
    const act = $('.nav-item.active');
    const nav = $('.nav');
    if (act && nav && getComputedStyle(nav).flexDirection === 'row') {
      nav.scrollTo({ left: act.offsetLeft - (nav.clientWidth - act.offsetWidth) / 2, behavior: first ? 'auto' : 'smooth' });
    }
    if (!first) { window.scrollTo(0, 0); buzz('12'); }
  }

  const _show = window.showSection;
  window.showSection = function (id) {
    const prev = $('.section.active');
    _show(id);
    const cur = $('.section.active');
    if (cur && cur !== prev) onEnter(cur, false);
  };

  /* back button support (called from Java) */
  window.__lxBack = function () {
    const sk = $('#launch-skip');
    if (overlay && overlay.style.display !== 'none' && !overlay.classList.contains('done') && sk) { sk.click(); return true; }
    const a = $('.section.active');
    if (a && a.id !== 'section-overview') { window.showSection('overview'); return true; }
    return false;
  };

  /* ═════════════════════ 4. LIVE SPECTRUM (replaces drawFreqViz) ═════════════════════ */
  const live = { freq: 0, orbit: 0 };
  function fitCanvas(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = c.clientWidth || 320, h = c.clientHeight || 140;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: x, W: w, H: h };
  }
  function visible(c) { return c && c.offsetParent !== null && !doc.hidden; }

  window.drawFreqViz = function () {
    const c = $('#freqCanvas'); if (!c) return;
    if (live.freq) return;                       // loop already running
    const fMin = 1555, fMax = 1585;
    const nPts = 160; const trace = new Float32Array(nPts); const peak = new Float32Array(nPts);
    const loop = now => {
      if (!visible(c)) { live.freq = 0; return; }
      live.freq = requestAnimationFrame(loop);
      const { ctx, W, H } = fitCanvas(c);
      const T = now / 1000, padB = 16, plotH = H - padB;
      const fx = f => (f - fMin) / (fMax - fMin) * W;
      ctx.clearRect(0, 0, W, H);
      // grid
      ctx.lineWidth = 1; ctx.font = '8.5px "Space Mono", monospace'; ctx.textAlign = 'center';
      for (let f = 1555; f <= 1585; f += 5) {
        const x = Math.round(fx(f)) + .5;
        ctx.strokeStyle = 'rgba(26,42,58,.9)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, plotH); ctx.stroke();
        ctx.fillStyle = 'rgba(100,130,165,.8)'; ctx.fillText(f, clamp(x, 12, W - 12), H - 4);
      }
      for (let i = 1; i < 4; i++) { const y = Math.round(plotH * i / 4) + .5; ctx.strokeStyle = 'rgba(26,42,58,.45)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // GPS L1 + BeiDou markers
      const gx = fx(1575.42), bx = fx(1561.098);
      ctx.fillStyle = 'rgba(0,229,255,.09)'; ctx.fillRect(fx(1574.4), 0, fx(1576.44) - fx(1574.4), plotH);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(0,229,255,.45)'; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, plotH); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,224,51,.4)'; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, plotH); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '8.5px "Space Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(0,229,255,.8)'; ctx.fillText('GPS L1 1575.42', gx - 4, 11);
      ctx.textAlign = 'left';  ctx.fillStyle = 'rgba(255,224,51,.8)'; ctx.fillText('BeiDou B1I', bx + 4, 11);
      // simulated live spectrum: bursts every ~150 s compressed into a visible rhythm
      const burst1 = .55 + .45 * Math.pow(Math.max(0, Math.sin(T * 1.1)), 2);
      const burst2 = .35 + .65 * Math.pow(Math.max(0, Math.sin(T * .8 + 2)), 2);
      const g = (f, c0, s) => Math.exp(-Math.pow((f - c0) / s, 2));
      for (let i = 0; i < nPts; i++) {
        const f = fMin + i / (nPts - 1) * (fMax - fMin);
        let a = .06 + .035 * Math.random();
        a += g(f, 1577.5, 1.55) * .78 * burst1 * (.9 + .1 * Math.random());
        a += g(f, 1558.5, 1.25) * .6 * burst2 * (.9 + .1 * Math.random());
        trace[i] += (a - trace[i]) * .35;
        peak[i] = Math.max(trace[i], peak[i] - .0035);
      }
      const yOf = v => plotH - 3 - v * (plotH - 26);
      const xOf = i => i / (nPts - 1) * W;
      // fill
      const grad = ctx.createLinearGradient(0, 0, 0, plotH);
      grad.addColorStop(0, 'rgba(255,59,59,.38)'); grad.addColorStop(.6, 'rgba(0,229,255,.10)'); grad.addColorStop(1, 'rgba(0,229,255,0)');
      ctx.beginPath(); ctx.moveTo(0, plotH);
      for (let i = 0; i < nPts; i++) ctx.lineTo(xOf(i), yOf(trace[i]));
      ctx.lineTo(W, plotH); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      // peak hold
      ctx.beginPath(); for (let i = 0; i < nPts; i++) { const x = xOf(i), y = yOf(peak[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; ctx.stroke();
      // trace with glow
      ctx.save(); ctx.shadowColor = 'rgba(255,80,80,.9)'; ctx.shadowBlur = 8;
      ctx.beginPath(); for (let i = 0; i < nPts; i++) { const x = xOf(i), y = yOf(trace[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = '#ff6a5e'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
      // band tags
      const tag = (f, txt, sub, col) => {
        const x = clamp(fx(f), 54, W - 54);
        ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.font = 'bold 9.5px "Space Mono", monospace'; ctx.fillText(txt, x, 28);
        if (W > 420) { ctx.font = '8.5px "Space Mono", monospace'; ctx.globalAlpha = .75; ctx.fillText(sub, x, 40); ctx.globalAlpha = 1; }
      };
      tag(1577.5, 'JAMMER 1 · 1577.5', '~5 MHz BW', '#ff5d55');
      tag(1558.5, 'JAMMER 2 · 1558.5', '~4 MHz BW', '#ffe033');
      // sweeping scan cursor
      const sx = ((T * .12) % 1) * W;
      const sg = ctx.createLinearGradient(sx - 40, 0, sx, 0); sg.addColorStop(0, 'rgba(0,229,255,0)'); sg.addColorStop(1, 'rgba(0,229,255,.22)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 40, 0, 40, plotH);
      ctx.fillStyle = 'rgba(0,229,255,.8)'; ctx.fillRect(sx, 0, 1, plotH);
    };
    live.freq = requestAnimationFrame(loop);
  };

  /* ═════════════════════ 5. MOLNIYA ORBIT — real Kepler motion ═════════════════════ */
  window.drawMolniya = function () {
    const c = $('#molniyaCanvas'); if (!c) return;
    if (live.orbit) return;
    c.style.background = '#010408';
    const ECC = .72;
    const stars = Array.from({ length: 90 }, (_, i) => ({ x: (Math.sin(i * 137.508) * .5 + .5), y: (Math.cos(i * 137.508 * 1.618) * .5 + .5), p: rnd(0, 6.28), s: rnd(.4, 1.1) }));
    const sats = [
      { ph: 0.00, col: '#ff3b3b', lab: 'COSMOS 2546', main: true },
      { ph: 0.34, col: '#00e5ff', lab: 'EKS-2' },
      { ph: 0.67, col: '#7fdcff', lab: 'EKS-3' },
    ];
    const kepler = (M, e) => { let E = M; for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)); };

    const loop = now => {
      if (!visible(c)) { live.orbit = 0; return; }
      live.orbit = requestAnimationFrame(loop);
      const { ctx, W, H } = fitCanvas(c);
      const T = now / 1000;
      ctx.clearRect(0, 0, W, H);

      // layout (relative → works at any width)
      let eR = clamp(Math.min(H * .105, W * .085), 16, 34);
      const ex = clamp(W * .2, eR + 26, 150), ey = H * .56;
      eR = Math.min(eR, ((W - 30 - ex) / (1 + ECC)) * (1 - ECC) * .7);
      const ap = Math.min(W - 30 - ex, H * .98);             // apogee distance from Earth centre
      const a = ap / (1 + ECC), p = a * (1 - ECC * ECC);
      const tiltA = -.26;
      const pos = nu => { const r = p / (1 + ECC * Math.cos(nu)); const ang = nu + Math.PI + tiltA;  // perigee left, apogee right
        return { x: ex + r * Math.cos(ang), y: ey + r * Math.sin(ang), r }; };
      // background glow + stars
      const bgG = ctx.createRadialGradient(ex, ey, 0, ex, ey, W * .7); bgG.addColorStop(0, 'rgba(0,50,95,.30)'); bgG.addColorStop(1, 'rgba(1,4,8,0)');
      ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);
      stars.forEach(s => { ctx.globalAlpha = .25 + .45 * (.5 + .5 * Math.sin(T * s.s * 2 + s.p)); ctx.fillStyle = '#cfe2ff'; ctx.fillRect(s.x * W, s.y * H, s.s * 1.4, s.s * 1.4); });
      ctx.globalAlpha = 1;
      // orbit path (glowing dashed)
      ctx.save(); ctx.setLineDash([3, 6]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,229,255,.32)'; ctx.shadowColor = 'rgba(0,229,255,.5)'; ctx.shadowBlur = 6;
      ctx.beginPath(); for (let i = 0; i <= 360; i++) { const q = pos(i / 360 * Math.PI * 2), x = q.x, y = q.y; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.restore();

      // Earth: gradient + atmosphere + rotating "Europe" glint
      const atm = ctx.createRadialGradient(ex, ey, eR * .9, ex, ey, eR * 1.9); atm.addColorStop(0, 'rgba(40,150,255,.45)'); atm.addColorStop(1, 'rgba(0,80,200,0)');
      ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(ex, ey, eR * 1.9, 0, 6.2832); ctx.fill();
      const eg = ctx.createRadialGradient(ex - eR * .35, ey - eR * .35, eR * .1, ex, ey, eR);
      eg.addColorStop(0, '#2a7fb8'); eg.addColorStop(.55, '#0d3d5e'); eg.addColorStop(1, '#041421');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, eR, 0, 6.2832); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(ex, ey, eR, 0, 6.2832); ctx.clip();
      ctx.fillStyle = 'rgba(30,120,70,.38)';
      const rot = T * .18;
      for (let k = 0; k < 4; k++) { const ang = rot + k * 1.7, cx2 = ex + Math.cos(ang) * eR * .55, vis = Math.cos(ang) > -.2;
        if (vis) { ctx.beginPath(); ctx.ellipse(cx2, ey + Math.sin(k * 2.3) * eR * .4, eR * .26, eR * .16, k, 0, 6.2832); ctx.fill(); } }
      const term = ctx.createLinearGradient(ex - eR, 0, ex + eR, 0); term.addColorStop(0, 'rgba(0,0,0,0)'); term.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = term; ctx.fillRect(ex - eR, ey - eR, eR * 2, eR * 2); ctx.restore();
      ctx.font = '9px "Space Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,229,255,.75)';
      ctx.fillText('EARTH', ex, ey + eR + 13);

      // apogee / perigee markers
      const ag = pos(Math.PI), pg = pos(0);
      ctx.beginPath(); ctx.arc(ag.x, ag.y, 4.5, 0, 6.2832); ctx.fillStyle = 'rgba(255,59,59,.3)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,59,59,.85)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,90,90,.95)'; ctx.font = 'bold 9px "Space Mono", monospace';
      ctx.fillText('APOGEE ~39,000 km', clamp(ag.x + 6, 90, W - 4), ag.y - 12);
      ctx.beginPath(); ctx.arc(pg.x, pg.y, 2.8, 0, 6.2832); ctx.fillStyle = 'rgba(0,229,255,.6)'; ctx.fill();
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(0,229,255,.7)'; ctx.font = '8px "Space Mono", monospace';
      ctx.fillText('PERIGEE ~500 km', 6, ey + eR + 28);

      // satellites on a true Kepler clock (slow at apogee, fast at perigee)
      const n = T * .26;
      sats.forEach(s => {
        const M = n + s.ph * Math.PI * 2;
        const nu = kepler(((M % 6.2832) + 6.2832) % 6.2832, ECC);
        const q = pos(nu);
        // trail: sampled analytically along the orbit (frame-rate independent)
        let prev = q;
        for (let i = 1; i <= 22; i++) {
          const Mi = M - i * .02, qi = pos(kepler(((Mi % 6.2832) + 6.2832) % 6.2832, ECC));
          ctx.strokeStyle = s.col; ctx.globalAlpha = (1 - i / 23) * .6; ctx.lineWidth = s.main ? 2.2 : 1.3;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(qi.x, qi.y); ctx.stroke(); prev = qi;
        }
        ctx.globalAlpha = 1;
        const nearApogee = q.r > ap * .72;
        if (s.main && nearApogee) {
          const k = (q.r / ap - .72) / .28;
          // footprint cone onto Earth
          const dx = ex - q.x, dy = ey - q.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
          const hx = ex - ux * eR * .98, hy = ey - uy * eR * .98;       // near-side point on Earth
          const wing = eR * .7;
          const g = ctx.createLinearGradient(q.x, q.y, hx, hy); g.addColorStop(0, 'rgba(255,59,59,0)'); g.addColorStop(1, `rgba(255,59,59,${.30 * k})`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(hx - uy * wing, hy + ux * wing); ctx.lineTo(hx + uy * wing, hy - ux * wing); ctx.closePath(); ctx.fill();
          // pulsing rings on the footprint (Europe)
          for (let r = 0; r < 3; r++) { const ph = ((T * .9 + r / 3) % 1);
            ctx.strokeStyle = `rgba(255,70,70,${(1 - ph) * .65 * k})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx, hy, 2 + ph * eR * .7, 0, 6.2832); ctx.stroke(); }
          ctx.textAlign = 'left'; ctx.fillStyle = `rgba(255,110,110,${.9 * k})`; ctx.font = '8px "Space Mono", monospace';
          ctx.fillText('EUROPE', clamp(hx + 8, 4, W - 50), hy - 8);
        }
        // satellite body with halo
        const rad = s.main ? 4.6 : 3;
        const halo = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad * 4.5); halo.addColorStop(0, s.col); halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = .45; ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(q.x, q.y, rad * 4.5, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 6.2832); ctx.fill();
        if (s.main) { ctx.strokeStyle = 'rgba(255,59,59,.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, rad + 3 + Math.sin(T * 5) * 1.2, 0, 6.2832); ctx.stroke(); }
        ctx.textAlign = q.x > W * .72 ? 'right' : 'left'; ctx.font = (s.main ? 'bold ' : '') + '8px "Space Mono", monospace'; ctx.fillStyle = s.col;
        ctx.fillText(s.lab, q.x + (q.x > W * .72 ? -9 : 9), q.y - 7);
      });
    };
    live.orbit = requestAnimationFrame(loop);
  };

  // the original page schedules a spectral draw at load; make sure ours runs when its tab is active
  addEventListener('resize', () => { if (live.freq) {} });
  const startViz = () => {
    if ($('#section-spectral.active')) window.drawFreqViz();
    if ($('#section-target.active')) window.drawMolniya();
  };
  new MutationObserver(startViz).observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

  /* signature: header mark + footer reveal on every page */
  (function () {
    const fl = $('.footer-logo'), hl = $('.header-logo'), ft = $('.app-footer');
    if (fl && hl && !$('.hdr-mark')) {
      const m = doc.createElement('img'); m.src = fl.src; m.className = 'hdr-mark'; m.alt = 'VTLO';
      m.addEventListener('click', () => { window.scrollTo({ top: doc.documentElement.scrollHeight, behavior: 'smooth' }); buzz('18,30,18'); });
      hl.prepend(m);
    }
    if (ft && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { ft.classList.remove('in'); void ft.offsetWidth; ft.classList.add('in'); buzz('10'); }
      }), { threshold: .35 });
      io.observe(ft);
    }
  })();

  /* initial entrance if the overlay is already absent */
  if (!overlay) onEnter($('.section.active'), true);
  doc.documentElement.classList.add('fx-ready');
})();
