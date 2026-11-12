/* ═══════════════════════════════════════════════════════════════
   CINEMA PROJECTION — 3 minutes maximum, strict time budget
   · lancée depuis l'écran d'accueil (guide.js) → orage → 4 pages bloc par bloc : Aperçu, TDOA, Cible (orbite), Solaire
   · French military voice (pre-recorded brief summaries of what is displayed) + AM-radio ambience (static MP3)
   · SCENARIO: forced transmission (30 s, reversed voices, abstract waveform) → black + accelerating sirens + tornado → resume
     déclenchée juste après l'orbite (ou appui long sur le titre du bandeau) ; désactivable dans les réglages ; fin à l'heure (3:00)
   · no real-time generated sound: everything is played from MP3 files
   · after the run every page of the app stays available (exit() restores the full navigation)
*/
(function () {
  'use strict';
  const doc = document, root = doc.documentElement;
  const $ = (s, r) => (r || doc).querySelector(s);
  const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const N = window.AndroidFX;
  const buzz = p => { try { N && N.vibrate && N.vibrate(String(p)); } catch (e) {} };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const noflash = () => root.classList.contains('noflash');
  const now = () => performance.now();
  const RATE = 1.16;                        // vitesse de lecture des voix
  const TOTAL_MS = 180000;                  // 3:00 depuis l'ouverture de l'app
  const FINALE_MS = 6500, INTRO_MS = 2300, HACK_MS = 30000, BLACK_MS = 11000, FADE_MS = 1500, SCEN_MS = HACK_MS + BLACK_MS + FADE_MS + 600;
  const DUR = window.__AUDDUR || {};
  const clipSec = id => ((DUR[id] || 1.6) / RATE);

  /* ═════════════════════ 1. SON : MP3 statiques (aucune synthèse temps réel) ═════════════════════ */
  const Sound = (function () {
    const NATIVE = !!(N && typeof N.bgStart === 'function' && typeof N.fxPlay === 'function');
    const BG_VOL = 1.0, BG_DUCK = .42;
    let bg = null, started = false, muted = false, seq = 0, cur = null, fxCur = null, rampT = 0, vol = BG_VOL, env = null;
    try { const b64 = window.__BGENV; if (b64) { const bin = atob(b64); env = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) env[i] = bin.charCodeAt(i); } } catch (e) { env = null; }

    function setVol(v, ms) {
      clearInterval(rampT); vol = v;
      if (NATIVE) { try { N.bgVolume(muted ? 0 : v, ms || 0); } catch (e) {} return; }
      if (!bg) return;
      const v0 = bg.volume, t0 = now(), d = Math.max(1, ms || 1), target = muted ? 0 : v;
      rampT = setInterval(() => { const k = clamp((now() - t0) / d, 0, 1); bg.volume = clamp(v0 + (target - v0) * k, 0, 1); if (k >= 1) clearInterval(rampT); }, 30);
    }
    function bgStart() {
      if (started) return; started = true;
      if (NATIVE) { try { N.bgStart('www/audio/bg.mp3', muted ? 0 : vol); } catch (e) { started = false; } return; }
      bg = new Audio('audio/bg.mp3'); bg.loop = true; bg.volume = 0; bg.preload = 'auto'; bg.play().catch(() => {}); setVol(BG_VOL, 1200);
    }
    function bgStop(fade) {
      if (!started) return; started = false; stopSay(); fxStop(); clearInterval(rampT);
      if (NATIVE) { try { N.bgStop(Math.round((fade || 1.5) * 1000)); } catch (e) {} return; }
      if (!bg) return; const b = bg, v0 = b.volume, t0 = now(), d = (fade || 1.5) * 1000; bg = null;
      const id = setInterval(() => { const k = clamp((now() - t0) / d, 0, 1); b.volume = v0 * (1 - k); if (k >= 1) { clearInterval(id); b.pause(); } }, 40);
    }
    // l'émission pirate « court-circuite » la piste en cours : coupure nette puis retour progressif
    function bgCut(ms) { setVol(0, ms || 90); }
    function bgRestore(ms) { setVol(BG_VOL, ms || 1500); }
    function mute(m) { muted = m; setVol(vol, 250); if (m) { stopSay(); } }
    function pauseAll(p) {
      if (NATIVE) { try { p ? N.bgPause() : N.bgResume(); p ? N.sayPause() : N.sayResume(); } catch (e) {} return; }
      if (bg) { p ? bg.pause() : bg.play().catch(() => {}); }
      if (cur && cur.audio) { p ? cur.audio.pause() : cur.audio.play().catch(() => {}); }
    }
    // ── voix de la projection ──
    function finish(token) {
      if (!cur || cur.token !== token) return;
      clearTimeout(cur.timer); const r = cur.res; cur = null; if (started && !fxCur) setVol(BG_VOL, 500); r();
    }
    function say(id, rate) {
      return new Promise(res => {
        if (!started || muted || !id || tok.cancel || fxCur) return res();
        stopSay(); const token = ++seq; cur = { token, res };
        setVol(BG_DUCK, 160);
        cur.timer = setTimeout(() => finish(token), 15000);
        if (NATIVE) { try { N.say('www/audio/nar/' + id + '.mp3', rate || RATE, token); } catch (e) { finish(token); } }
        else {
          const a = new Audio('audio/nar/' + id + '.mp3'); cur.audio = a; a.playbackRate = rate || RATE; a.preservesPitch = true;
          a.onended = () => finish(token); a.onerror = () => finish(token); a.play().catch(() => finish(token));
        }
      });
    }
    function stopSay() {
      if (!cur) return; const t = cur.token;
      try { if (NATIVE) N.sayStop(); else if (cur.audio) cur.audio.pause(); } catch (e) {}
      finish(t);
    }
    // ── effets forts du scénario (transmission forcée, blackout) : volume maximal ──
    function fx(name) {
      return new Promise(res => {
        fxStop(); const token = ++seq, ms = ((DUR[name] || 12) * 1000) + 400; fxCur = { token, res };
        fxCur.timer = setTimeout(() => fxDone(token), ms + 1500);
        if (muted) { setTimeout(() => fxDone(token), ms); return; }
        if (NATIVE) { try { N.fxPlay('www/audio/' + name + '.mp3', 1.0, token); } catch (e) { fxDone(token); } }
        else { const a = new Audio('audio/' + name + '.mp3'); fxCur.audio = a; a.volume = 1; a.onended = () => fxDone(token); a.onerror = () => setTimeout(() => fxDone(token), ms); a.play().catch(() => setTimeout(() => fxDone(token), ms)); }
      });
    }
    function fxDone(token) { if (!fxCur || fxCur.token !== token) return; clearTimeout(fxCur.timer); const r = fxCur.res; fxCur = null; r(); }
    function fxStop() {
      if (!fxCur) return; const t = fxCur.token;
      try { if (NATIVE) N.fxStop(); else if (fxCur.audio) fxCur.audio.pause(); } catch (e) {}
      fxDone(t);
    }
    window.__snd = { onEnd(t) { finish(+t); }, onFxEnd(t) { fxDone(+t); }, onFail() { if (cur) finish(cur.token); } };
    function level() {
      if (!started || !env) return 0;
      let pos = -1;
      if (NATIVE) { try { pos = N.bgPos() / 1000; } catch (e) {} } else if (bg) pos = bg.currentTime;
      if (pos < 0) return 0; return env[Math.floor(pos * 20) % env.length] / 255;
    }
    return { bgStart, bgStop, bgCut, bgRestore, mute, pauseAll, say, stopSay, fx, fxStop, level, get on() { return started; }, get speaking() { return !!cur; }, get muted() { return muted; } };
  })();
  const Score = { start() { Sound.bgStart(); }, stop(f) { Sound.bgStop(f); }, setMuted(m) { Sound.mute(m); }, level() { return Sound.level(); }, get on() { return Sound.on; } };

  /* ═════════════════════ 2. OUTILS DE MISE EN SCÈNE ═════════════════════ */
  let tok = { cancel: false }, paused = false, skipReq = 0, pageSkip = false, active = false, hijack = false, hackDone = false, hackReq = false;
  let deadline = 0, T0 = 0, scenAt = 0, pauseAt = 0, finaleStarted = false;
  const finishers = new Set();
  const D = ms => Math.max(60, ms);
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function wait(ms) {
    return new Promise(res => {
      let el = 0;
      const id = setInterval(() => {
        if (tok.cancel || skipReq || hackReq) { clearInterval(id); return res(); }
        if (paused) return;
        el += 30; if (el >= ms) { clearInterval(id); res(); }
      }, 30);
    });
  }
  async function gate() { while (hijack && !tok.cancel) await sleep(60); }
  function anim(el, kf, opts) {
    const a = el.animate(kf, Object.assign({ fill: 'backwards' }, opts));
    finishers.add(a); a.finished.catch(() => {}).then(() => finishers.delete(a));
    if (paused) a.pause();
    return a.finished.catch(() => {});
  }
  function finishAll() { finishers.forEach(a => { try { a.finish ? a.finish() : a(); } catch (e) {} }); }
  function customFinisher(fn) { finishers.add(fn); return () => finishers.delete(fn); }

  let layer = null;
  function getLayer() { if (!layer) { layer = doc.createElement('div'); layer.id = 'cx-layer'; doc.body.appendChild(layer); } return layer; }
  function box(el) { const r = el.getBoundingClientRect(); return { r, x: r.left + scrollX, y: r.top + scrollY }; }
  function mkClone(el, r, x, y) {
    const c = el.cloneNode(true); c.removeAttribute('id'); $$('[id]', c).forEach(n => n.removeAttribute('id'));
    c.classList.remove('cx-b', 'cx-on', 'fx-r'); $$('.cx-b', c).forEach(n => n.classList.remove('cx-b', 'cx-on'));
    Object.assign(c.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0',
      visibility: 'visible', pointerEvents: 'none', transform: 'none', animation: 'none' });
    return c;
  }
  function on(el) { el.classList.add('cx-on'); }
  function camera(el, dur) {
    return new Promise(res => {
      const cs = getComputedStyle(root), r = el.getBoundingClientRect(), top = 54 + (parseFloat(cs.getPropertyValue('--sat')) || 0), bot = innerHeight - 78 - (parseFloat(cs.getPropertyValue('--sab')) || 0);
      const H = bot - top; let target;
      if (r.height > H * .85) target = scrollY + r.top - top - 10;
      else if (r.top < top + 6 || r.bottom > bot - 6) target = scrollY + r.top - top - (H - r.height) * .3;
      else return res();
      target = clamp(target, 0, doc.documentElement.scrollHeight - innerHeight);
      if (Math.abs(target - scrollY) < 6) return res();
      const y0 = scrollY, t0 = now(), d = D(dur || 520); let done = false;
      const end = () => { if (!done) { done = true; unreg(); scrollTo(0, target); res(); } };
      const unreg = customFinisher(end);
      const step = n => { if (done) return; const k = clamp((n - t0) / d, 0, 1), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; scrollTo(0, y0 + (target - y0) * e);
        if (k < 1 && !tok.cancel) requestAnimationFrame(step); else end(); };
      requestAnimationFrame(step);
    });
  }

  /* ═════════════════════ 3. CATALOGUE D'EFFETS ═════════════════════ */
  const EASE = 'cubic-bezier(.2,.75,.2,1)';
  const FX = {
    // flou → net
    async deblur(el) { on(el); await anim(el, [{ opacity: 0, filter: 'blur(26px) brightness(2.2)', transform: 'scale(1.14)' }, { opacity: 1, filter: 'blur(0) brightness(1)', transform: 'none' }], { duration: D(1100), easing: EASE }); },
    // assemblage 3D depuis l'espace
    async assemble3d(el) {
      on(el); const s = () => rnd(-1, 1);
      await anim(el, [{ opacity: 0, filter: 'blur(8px)', transform: `perspective(1100px) translate3d(${s() * 520}px,${s() * 380}px,-1700px) rotateX(${s() * 140}deg) rotateY(${s() * 140}deg) rotateZ(${s() * 60}deg)` },
        { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: D(1350), easing: 'cubic-bezier(.16,.9,.2,1)' });
    },
    // volet 3D
    async flip(el) { on(el); el.style.transformOrigin = '50% 0'; await anim(el, [{ opacity: 0, transform: 'perspective(900px) rotateX(-92deg)' }, { opacity: 1, transform: 'none' }], { duration: D(1000), easing: 'cubic-bezier(.2,.9,.25,1.12)' }); el.style.transformOrigin = ''; },
    // balayage laser
    async scan(el) { on(el); await anim(el, [{ clipPath: 'inset(0 100% 0 0)', filter: 'brightness(3) drop-shadow(0 0 8px #00e5ff)' }, { clipPath: 'inset(0 0 0 0)', filter: 'brightness(1) drop-shadow(0 0 0 transparent)' }], { duration: D(900), easing: 'cubic-bezier(.5,0,.2,1)' }); },
    // iris circulaire
    async iris(el) { on(el); await anim(el, [{ clipPath: 'circle(0% at 50% 50%)', filter: 'brightness(2.4) blur(6px)' }, { clipPath: 'circle(78% at 50% 50%)', filter: 'brightness(1) blur(0)' }], { duration: D(1100), easing: 'cubic-bezier(.4,0,.2,1)' }); },
    // glitch numérique
    async glitch(el) {
      on(el);
      await anim(el, [{ opacity: 0, transform: 'translateX(-10px) skewX(24deg)', filter: 'hue-rotate(90deg) saturate(3)' }, { opacity: 1, transform: 'translateX(7px) skewX(-14deg)', filter: 'hue-rotate(-60deg) saturate(2)' },
        { opacity: .35, transform: 'translateX(-4px)', filter: 'none' }, { opacity: 1, transform: 'translateX(3px) skewX(5deg)', filter: 'hue-rotate(40deg)' }, { opacity: .7, transform: 'translateX(-1px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: D(760), easing: 'steps(6, jump-none)' });
    },
    // glissement (lignes de tableau)
    async slide(el) { on(el); await anim(el, [{ opacity: 0, transform: 'translateX(-46px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: D(700), easing: EASE }); },
    // tourbillon
    async whirl(el) { on(el); await anim(el, [{ opacity: 0, transform: 'rotate(620deg) scale(.04)', filter: 'blur(12px)' }, { opacity: 1, transform: 'rotate(0deg) scale(1)', filter: 'blur(0)' }], { duration: D(1400), easing: 'cubic-bezier(.12,.85,.2,1)' }); },
    // distorsion liquide (filtre SVG animé)
    async liquid(el) {
      const map = $('#cx-liq-map'); if (!map) return FX.deblur(el);
      on(el); el.style.filter = 'url(#cx-liq)'; const dur = D(1400), t0 = performance.now(); let done = false;
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: dur * .55 });
      await new Promise(res => {
        const end = () => { if (!done) { done = true; unreg(); res(); } };
        const unreg = customFinisher(end);
        const step = n => { if (done) return; const k = clamp((n - t0) / dur, 0, 1); map.setAttribute('scale', String(240 * Math.pow(1 - k, 2.2)));
          if (k < 1 && !tok.cancel) requestAnimationFrame(step); else end(); };
        requestAnimationFrame(step);
      });
      map.setAttribute('scale', '0'); el.style.filter = '';
    },
    // puzzle : tuiles qui s'emboîtent
    async puzzle(el) {
      const { r, x, y } = box(el), cols = clamp(Math.round(r.width / 95), 2, 5), rows = clamp(Math.round(r.height / 95), 2, 4), tw = r.width / cols, th = r.height / rows, L = getLayer(), tiles = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const c = mkClone(el, r, x, y); c.style.clipPath = `inset(${j * th}px ${r.width - (i + 1) * tw}px ${r.height - (j + 1) * th}px ${i * tw}px)`; L.appendChild(c); tiles.push(c);
      }
      await Promise.all(tiles.map(c => anim(c, [{ opacity: 0, filter: 'blur(10px)', transform: `translate3d(${rnd(-1, 1) * innerWidth * .8}px,${rnd(-1, 1) * innerHeight * .7}px,0) rotate(${rnd(-220, 220)}deg) scale(${rnd(.15, .55)})` },
        { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: D(rnd(850, 1150)), delay: D(rnd(0, 520)), easing: 'cubic-bezier(.2,.9,.25,1.15)' })));
      on(el); tiles.forEach(c => c.remove());
    },
    // kaléidoscope : 6 secteurs miroirs qui convergent vers l'image réelle
    async kaleido(el) {
      const { r, x, y } = box(el), w = r.width, h = r.height, cx = w / 2, cy = h / 2, R = Math.hypot(w, h), L = getLayer();
      const wedge = a0 => { const a1 = a0 + Math.PI / 3, am = (a0 + a1) / 2, P = a => `${(cx + R * Math.cos(a)).toFixed(1)}px ${(cy + R * Math.sin(a)).toFixed(1)}px`; return `polygon(${cx}px ${cy}px, ${P(a0)}, ${P(am)}, ${P(a1)})`; };
      const g = doc.createElement('div'); Object.assign(g.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); L.appendChild(g);
      const ps = [];
      for (let k = 0; k < 6; k++) {
        const c = mkClone(el, r, 0, 0); g.appendChild(c);
        const t0 = k % 2 ? `rotate(${k * 60 + 60}deg) scale(1,-1)` : `rotate(${k * 60}deg) scale(1,1)`;
        ps.push(anim(c, [{ clipPath: wedge(0), transform: t0 }, { clipPath: wedge(k * Math.PI / 3), transform: 'rotate(0deg) scale(1,1)' }], { duration: D(1650), easing: 'cubic-bezier(.65,0,.2,1)' }));
      }
      ps.push(anim(g, [{ opacity: 0, filter: 'blur(10px) hue-rotate(70deg)', transform: 'rotate(-170deg) scale(.3)' }, { opacity: 1, filter: 'blur(0) hue-rotate(0)', transform: 'none' }], { duration: D(1650), easing: 'cubic-bezier(.2,.8,.2,1)' }));
      await Promise.all(ps); on(el); g.remove();
    },
  };
  const HAS_CANVAS = el => !!(el.matches('canvas') || el.querySelector('canvas'));
  const CYCLE_LEAF = ['puzzle', 'kaleido', 'assemble3d', 'deblur', 'whirl', 'liquid', 'flip', 'scan', 'glitch'];
  const CYCLE_FRAME = ['iris', 'scan', 'deblur', 'flip'];
  const CYCLE_MEDIA = ['whirl', 'liquid', 'flip', 'iris', 'assemble3d'];
  let lastFx = '', cyc = 0;
  function chooseFx(b) {
    let pool;
    if (b.kind === 'frame') pool = CYCLE_FRAME;
    else if (b.tag === 'TR') pool = ['slide', 'scan', 'deblur'];
    else if (b.media) pool = HAS_CANVAS(b.el) ? CYCLE_MEDIA : CYCLE_MEDIA.concat(['puzzle', 'kaleido']);
    else if (b.tiny) pool = ['deblur', 'scan'];
    else pool = CYCLE_LEAF;
    if (noflash()) pool = pool.filter(f => f !== 'glitch');
    if (b.footer) return 'kaleido';
    // cloner un bloc contenant un canvas ou un tableau donnerait une image vide
    pool = pool.filter(f => !((f === 'puzzle' || f === 'kaleido') && (HAS_CANVAS(b.el) || b.el.matches('table, tr') || b.el.querySelector('table'))));
    let f; let guard = 0; do { f = pool[(cyc++ + ((Math.random() * 3) | 0)) % pool.length]; } while (f === lastFx && pool.length > 1 && ++guard < 6);
    lastFx = f; return f;
  }


  /* ═════════════════════ 3b. NARRATION : unités (blocs) ═════════════════════ */
  const UNIT_SEL = '.page-title, .hero, .card, .card-wide, .timeline-item, .alert, .img-panel, .method-card';
  const UNIT_COUNTS = { overview: 8, timeline: 11, spatial: 7, spectral: 7, temporal: 10, methods: 7, tdoa: 7, target: 6, solar: 6, about: 10 };
  const pad2 = n => String(n).padStart(2, '0');
  function assignNar() {
    $$('.section').forEach(sec => {
      const id = sec.id.replace('section-', ''), u = $$(UNIT_SEL, sec).filter(e => !(e.matches('.img-panel') && e.closest('.card-wide')));
      u.forEach(e => { e.removeAttribute('data-nar'); e.removeAttribute('data-nar-st'); });
      if (UNIT_COUNTS[id] === u.length) u.forEach((e, i) => e.setAttribute('data-nar', id + '-' + pad2(i + 1)));
    });
  }

  /* ═════════════════════ 4. COLLECTE DES BLOCS D'UNE PAGE ═════════════════════ */
  function hasBox(n) {
    const cs = getComputedStyle(n);
    const bg = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    const bd = ['Top', 'Left', 'Right', 'Bottom'].some(s => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)/.test(cs['border' + s + 'Color']));
    return bg || bd;
  }
  const BLOCKY = /^(DIV|TABLE|TBODY|THEAD|SECTION|UL|TR|FIGURE)$/;
  function collectBlocks(sec) {
    const out = [];
    const shown = n => n.getClientRects().length > 0;
    (function walk(n) {
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|BR)$/.test(n.tagName) || !shown(n)) return;
      const tag = n.tagName;
      if (n.matches('.card-wide, .hero')) { out.push({ el: n, kind: 'frame' }); Array.from(n.children).forEach(walk); return; }
      if (tag === 'TR') { out.push({ el: n, kind: 'leaf', tag: 'TR' }); return; }
      if (n.matches('.card, .timeline-item, .page-title')) { out.push({ el: n, kind: 'leaf' }); return; }
      if (/^(IMG|CANVAS|SVG)$/i.test(tag)) { out.push({ el: n, kind: 'leaf', media: true }); return; }
      const kids = Array.from(n.children), blockKids = kids.some(c => BLOCKY.test(c.tagName) || /^(IMG|CANVAS)$/.test(c.tagName));
      if (blockKids) { if (hasBox(n) && n.textContent.trim().length) out.push({ el: n, kind: 'frame' }); kids.forEach(walk); return; }
      if (n.textContent.trim().length || n.querySelector('img,canvas')) out.push({ el: n, kind: 'leaf' }); else if (shown(n) && n.getBoundingClientRect().height > 2) out.push({ el: n, kind: 'leaf', tiny: true });
    })(sec);
    const ft = $('.app-footer'); if (ft) out.push({ el: ft, kind: 'leaf', footer: true });
    out.forEach(b => { b.len = (b.el.textContent || '').trim().length; if (b.len < 22 && b.kind === 'leaf' && !b.media && !b.footer) b.tiny = true; });
    // regroupe les petits éléments consécutifs d'un même parent (étiquettes, barres…) : ils apparaissent en cascade
    const groups = []; let cur = null;
    const small = b => b.kind === 'leaf' && !b.media && !b.footer && !b.el.dataset.nar && (b.tiny || b.len <= 170);
    out.forEach(b => {
      if (small(b) && cur && cur.tinyGroup && cur.items.length < 14 && cur.items[0].el.parentElement === b.el.parentElement) cur.items.push(b);
      else { cur = { items: [b], tinyGroup: small(b) }; groups.push(cur); }
    });
    return groups;
  }


  /* ═════════════════════ 5. INTERFACE : barres, HUD, cartes, scénario ═════════════════════ */
  const ICON = {
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>', play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 6l8.5 6L6 18zM16 6h2.5v12H16z"/></svg>', page: '<svg viewBox="0 0 24 24"><path d="M4 6l7 6-7 6zM12 6l7 6-7 6zM20 6h2v12h-2z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6L7 10H3zm11.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6L7 10H3zm13 .6L17.4 9 19 10.6 20.6 9 22 10.6 20.4 12.2 22 13.8 20.6 15.4 19 13.8 17.4 15.4 16 13.8 17.6 12.2z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
    help: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 16.2a1.3 1.3 0 110-2.6 1.3 1.3 0 010 2.6zm1.4-5.1c-.6.4-.8.7-.8 1.4v.4h-2v-.5c0-1.3.5-2 1.4-2.6.8-.5 1.2-.9 1.2-1.6 0-.8-.6-1.3-1.4-1.3-.9 0-1.5.6-1.6 1.5H8.2C8.3 8 9.8 6.5 12 6.5c2.1 0 3.6 1.3 3.6 3.1 0 1.4-.8 2.2-2.2 3.5z"/></svg>',
    film: '<svg viewBox="0 0 24 24"><path d="M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1zm1 2v2h2V6H5zm0 4v2h2v-2H5zm0 4v2h2v-2H5zm12-8v2h2V6h-2zm0 4v2h2v-2h-2zm0 4v2h2v-2h-2zM9 6v12h6V6H9z"/></svg>',
  };
  doc.body.insertAdjacentHTML('beforeend',
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="cx-liq" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="turbulence" baseFrequency="0.011 0.02" numOctaves="2" seed="4" result="t"/><feDisplacementMap id="cx-liq-map" in="SourceGraphic" in2="t" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></svg>' +
    '<div id="cx-glow"></div><div id="cx-vig"></div>' +
    '<div id="cx-bars"><div class="cx-bar top"><span class="lab" id="cx-lab">OPÉRATION LIGHTNING</span><span class="pg" id="cx-pg" aria-label="Temps restant">3:00</span></div>' +
    '<div class="cx-bar bot"><div id="cx-prog"><i></i></div><div id="cx-hud">' +
      '<button id="cx-pause" aria-label="Pause">' + ICON.pause + '<span>Pause</span></button>' +
      '<button id="cx-next" aria-label="Bloc suivant">' + ICON.next + '<span>Suivant</span></button>' +
      '<button id="cx-page" aria-label="Page suivante">' + ICON.page + '<span>Page +</span></button>' +
      '<button id="cx-snd" aria-label="Couper le son">' + ICON.vol + '<span>Son</span></button>' +
      '<button id="cx-help" aria-label="Aide">' + ICON.help + '<span>Aide</span></button>' +
      '<button id="cx-exit" aria-label="Quitter la visite">' + ICON.close + '<span>Quitter</span></button></div></div></div>' +
    '<div id="cx-card"><div class="cx-kal"></div><div class="cx-rings"></div><div class="cx-rings b"></div><div class="cx-num"></div><div class="cx-name"></div><div class="cx-sub"></div></div>' +
    '<div id="cx-hack"><canvas id="cx-hack-cv" width="150" height="270"></canvas><div class="hk-top">⚠ SIGNAL NON IDENTIFIÉ</div><div class="hk-mid" id="hk-mid">TRANSMISSION FORCÉE</div><div class="hk-bot" id="hk-bot"></div></div>' +
    '<div id="cx-black"></div>' +
    '<button id="cx-fab" aria-label="Lancer la visite guidée">' + ICON.film + '<span>Visite guidée</span></button>');
  const el$ = id => doc.getElementById(id), card = el$('cx-card'), glow = el$('cx-glow');

  const GL = '█▓▒░<>/\\|01#$%&*+=?';
  function scramble(el, text, ms) {
    return new Promise(res => {
      const t0 = now(), d = D(ms || 900);
      const id = setInterval(() => {
        const k = clamp((now() - t0) / d, 0, 1), rev = Math.floor(k * text.length); let s = '';
        for (let i = 0; i < text.length; i++) s += (i < rev || text[i] === ' ') ? text[i] : GL[(Math.random() * GL.length) | 0];
        el.textContent = s; if (k >= 1 || tok.cancel) { clearInterval(id); el.textContent = text; res(); }
      }, 34);
    });
  }
  function setPaused(p) {
    if (hijack) return;
    if (p) pauseAt = now(); else { const d = now() - pauseAt; deadline += d; scenAt += d; }
    paused = p; finishers.forEach(a => { try { p ? a.pause && a.pause() : a.play && a.play(); } catch (e) {} });
    Sound.pauseAll(p); setBtn('cx-pause', p ? ICON.play : ICON.pause, p ? 'Reprendre' : 'Pause');
  }
  function setBtn(id, icon, label) { const b = el$(id); b.innerHTML = icon + '<span>' + label + '</span>'; b.setAttribute('aria-label', label); }
  const G = () => window.__guide || null;
  function tapSkip() { skipReq = 1; finishAll(); }
  el$('cx-pause').addEventListener('click', e => { e.stopPropagation(); setPaused(!paused); });
  el$('cx-next').addEventListener('click', e => { e.stopPropagation(); if (!hijack) tapSkip(); });
  el$('cx-page').addEventListener('click', e => { e.stopPropagation(); if (hijack) return; pageSkip = true; tapSkip(); Sound.stopSay(); });
  el$('cx-snd').addEventListener('click', e => { e.stopPropagation(); const m = !Sound.muted; Sound.mute(m); ls.set('lx.sound', m ? '0' : '1'); if (!m && !Sound.on) Score.start();
    setBtn('cx-snd', m ? ICON.mute : ICON.vol, m ? 'Muet' : 'Son'); if (G()) G().toast(m ? 'Son coupé' : 'Son activé', 1400); });
  el$('cx-help').addEventListener('click', e => { e.stopPropagation(); if (hijack || !G()) return; const was = paused; if (!was) setPaused(true); G().openHelp(() => { if (!was && active) setPaused(false); }); });
  el$('cx-exit').addEventListener('click', e => { e.stopPropagation(); exit(); });
  // toucher l'écran = passer au bloc suivant (un toucher pendant la pause = reprendre)
  doc.addEventListener('pointerdown', e => {
    if (!active || e.target.closest('#cx-bars, #gd-aide, #gd-toast') || hijack || finaleStarted) return;
    if (paused) { setPaused(false); return; }
    tapSkip();
  }, { passive: true });
  // easter egg : appui long (1,2 s) sur le titre du bandeau = déclenche la « transmission pirate » (si activée)
  (function () {
    let lp = 0; const lab = el$('cx-lab');
    lab.addEventListener('pointerdown', () => { clearTimeout(lp); lp = setTimeout(() => { if (active && !hackDone && !hijack && !paused) { hackReq = true; finishAll(); } }, 1200); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => lab.addEventListener(t, () => clearTimeout(lp)));
  })();
  el$('cx-fab').addEventListener('click', () => { window.__lxFromLaunch = false; start(); });

  /* ── scénario : transmission forcée → noir + sirènes/tornade → reprise ── */
  let hackRaf = 0;
  function hackVisual(onOff) {
    const hk = el$('cx-hack'), cv = el$('cx-hack-cv'), c = cv.getContext('2d'), W = cv.width, H = cv.height, mid = el$('hk-mid'), bot = el$('hk-bot');
    cancelAnimationFrame(hackRaf);
    if (!onOff) { hk.classList.remove('on'); return; }
    hk.classList.add('on'); const t0 = now(), nf = noflash(), id = ImageData ? c.createImageData(W, H) : null; let last = 0;
    const MSG = ['TRANSMISSION FORCÉE', 'SOURCE INCONNUE', 'CANAL COMPROMIS', 'ÉMISSION EXTÉRIEURE'];
    const step = n => {
      if (!hk.classList.contains('on')) return; hackRaf = requestAnimationFrame(step);
      if (n - last < 42) return; last = n; const t = (now() - t0) / 1000, k = clamp(t / 30, 0, 1);
      const d = id.data, amp = nf ? .10 : (.16 + .20 * k);                                     // grain sombre : pas de flash blanc plein écran
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() < .5 ? Math.random() * 90 * amp * 4 : 0; d[i] = v * .7; d[i + 1] = v * .9; d[i + 2] = v; d[i + 3] = 150; }
      c.putImageData(id, 0, 0);
      if (!nf) for (let b = 0; b < 4; b++) { if (Math.random() < .5) { const y = Math.random() * H | 0, h = 2 + Math.random() * 14 | 0, dx = (Math.random() - .5) * 60 | 0; c.drawImage(cv, 0, y, W, h, dx, y, W, h); } }
      c.lineWidth = 1.4; c.strokeStyle = 'rgba(0,229,255,.9)'; c.beginPath();                    // oscilloscope du signal
      for (let x = 0; x < W; x++) { const a = Math.sin(x * .09 + t * 9) * (6 + 22 * Math.abs(Math.sin(t * 1.7 + x * .015))) + (Math.random() - .5) * (4 + 14 * k); const y = H * .5 + a; x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke(); c.strokeStyle = 'rgba(255,60,60,.55)'; c.beginPath();
      for (let x = 0; x < W; x++) { const y = H * .5 + Math.sin(x * .05 - t * 5) * 18 * Math.sin(t * .9) + (Math.random() - .5) * 6; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      mid.textContent = MSG[Math.floor(t / 3) % MSG.length]; const f = (1000 + Math.random() * 999).toFixed(1);
      bot.textContent = 'FRÉQ ' + f.replace('.', ',') + ' MHz · SOURCE : INCONNUE · CAP : — · T-' + String(Math.max(0, Math.ceil(30 - t))).padStart(2, '0');
    };
    hackRaf = requestAnimationFrame(step);
  }
  async function hack() {
    if (hackDone || hijack || tok.cancel) return;
    hackDone = true; hijack = true; hackReq = false; finishAll(); Sound.stopSay();
    const nf = noflash(), blk = el$('cx-black');
    // 1. la piste en cours est court-circuitée (bégaiement puis coupure), la transmission forcée prend le dessus à plein volume
    Sound.bgCut(60); await sleep(110); Sound.bgRestore(40); await sleep(90); Sound.bgCut(60); await sleep(120);
    const fxP = Sound.fx('hack'); hackVisual(true); buzz('0,120,60,120,60,260');
    const hv = setInterval(() => buzz('0,80,120,200'), 2600);
    // 2. 30 s de transmission
    await sleep(HACK_MS - 200); clearInterval(hv);
    // 3. fondu au noir + sirènes accélérées + vent de tornade
    blk.style.transition = 'opacity 1.3s ease'; blk.style.opacity = 1; await sleep(1300); hackVisual(false);
    Sound.fxStop(); Sound.fx('blackout'); const bv = setInterval(() => buzz('0,260,90,260'), 900);
    if (!nf) blk.classList.add('alarm');
    await sleep(BLACK_MS - 1300); clearInterval(bv); blk.classList.remove('alarm');
    // 4. retour à la projection classique
    blk.style.transition = 'opacity ' + (FADE_MS / 1000) + 's ease'; blk.style.opacity = 0; Sound.bgRestore(FADE_MS);
    await sleep(FADE_MS); hijack = false; skipReq = 0;
  }


  /* ═════════════════════ 6. SÉQUENCEUR À BUDGET DE TEMPS ═════════════════════ */
  let pages = [], plans = [], pIdx = 0, lvlRaf = 0, nomLeft = 0, U = null, clockInt = 0;
  function pageList() {
    const navs = $$('.nav-item');
    const PLAY = ['overview', 'tdoa', 'target', 'solar'];       // projection : 4 pages seulement (toutes les pages restent accessibles ensuite)
    return PLAY.map(id => document.getElementById('section-' + id)).filter(Boolean).map(sec => {
      const id = sec.id.replace('section-', ''), nav = navs.find(n => (n.getAttribute('onclick') || '').includes("'" + id + "'"));
      let name = id.toUpperCase();
      if (nav) { const c = nav.cloneNode(true); $$('.nav-icon,.nav-badge', c).forEach(x => x.remove()); name = c.textContent.trim(); }
      const sub = $('.subtitle', sec), kick = $('.hero-kicker', sec);
      return { id, sec, name, sub: sub ? sub.textContent.trim() : (kick ? kick.textContent.replace('⚠', '').trim() : '') };
    });
  }
  // durée nominale : on budgétise par BLOC (unité de narration) ; les sous-groupes d'un bloc se partagent son temps (cascade rapide)
  function annotate(groups) {
    const byU = new Map(), orphan = [];
    groups.forEach(g => { const u = g.items[0].el.closest('[data-nar]'); if (u) { if (!byU.has(u)) byU.set(u, []); byU.get(u).push(g); } else orphan.push(g); });
    let total = 0;
    byU.forEach((gs, u) => {
      const narr = !u.matches('.page-title'), vis = .7 + .12 * gs.length, need = narr ? clipSec(u.dataset.nar) + .14 : 0; let nom = Math.max(vis, need);
      if (u.dataset.nar === 'target-05') nom += 4.5;                      // orbit animation: extra dwell so it can be admired
      gs.forEach(g => { g.nom = nom / gs.length; }); gs[gs.length - 1].lastOf = u.dataset.nar; gs[0].unit = narr ? u : null; total += nom;
    });
    orphan.forEach(g => { g.nom = .7; total += .7; });
    return total;
  }
  const CH_NOM = 2.3;                                   // destructuration + carte de chapitre (nominal)

  async function chapterCard(p, i, n) {
    card.style.display = 'flex';
    card.querySelector('.cx-num').textContent = 'CHAPITRE ' + pad2(i + 1) + ' / ' + pad2(n);
    el$('cx-lab').textContent = (i + 1) + '/' + n + ' · ' + p.name.toUpperCase();
    const nm = card.querySelector('.cx-name'), sb = card.querySelector('.cx-sub'); nm.textContent = ''; sb.textContent = p.sub || '';
    sb.style.opacity = 0; card.querySelector('.cx-num').style.opacity = 0;
    anim(card, [{ clipPath: 'circle(0% at 50% 50%)', filter: 'blur(14px)' }, { clipPath: 'circle(75% at 50% 50%)', filter: 'blur(0)' }], { duration: 550, easing: 'cubic-bezier(.5,0,.2,1)' });
    card.querySelector('.cx-num').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 150, fill: 'forwards' });
    sb.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 350, fill: 'forwards' });
    buzz('0,25,40,60'); return scramble(nm, p.name.toUpperCase(), 520);
  }
  function chapterOut() {
    return anim(card, [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(1.6)', filter: 'blur(20px)' }], { duration: 480, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' })
      .then(() => { card.style.display = 'none'; card.getAnimations().forEach(a => a.cancel()); });
  }
  function startUnit(g) { if (g.unit) { g.unit.dataset.narSt = '1'; if (Sound.speaking) Sound.stopSay(); Sound.say(g.unit.dataset.nar, RATE); } }
  function kLive() {
    const end = deadline - FINALE_MS - 2500 - (hackDone ? 0 : SCEN_MS), avail = end - now();
    return clamp(avail / Math.max(1, nomLeft * 1000), .3, 1.7);
  }
  async function revealGroup(g) {
    skipReq = 0; if (tok.cancel) return;
    if (!hackDone && (hackReq || now() >= scenAt)) await hack();
    await gate(); if (tok.cancel) return;
    const t0 = now(), rush = now() > deadline - FINALE_MS - 800;
    if (pageSkip || rush) { g.items.forEach(b => b.el.classList.add('cx-on')); nomLeft -= g.nom; return; }
    const slot = Math.max(110, g.nom * 1000 * kLive());
    startUnit(g);
    const first = g.items[0];
    await Promise.race([camera(first.el, 480), wait(520)]); if (tok.cancel) return;
    if (U && !noflash()) U.boost = Math.max(U.boost, 1.9);
    if (g.items.length > 1 && g.tinyGroup) {
      const stag = Math.min(110, Math.max(40, (slot + 250) / g.items.length));
      g.items.forEach((b, i) => setTimeout(() => {
        const f = b.tag === 'TR' ? pick(['slide', 'slide', 'scan']) : pick(noflash() ? ['deblur', 'slide', 'scan', 'flip'] : ['deblur', 'slide', 'scan', 'flip', 'glitch']);
        FX[f](b.el).catch(() => b.el.classList.add('cx-on'));
      }, i * stag));
    } else { FX[chooseFx(first)](first.el).catch(() => first.el.classList.add('cx-on')); }
    nomLeft -= g.nom;
    const rest = slot - (now() - t0); if (rest > 0) await wait(rest);
    if (g.lastOf === 'target-05' && !hackDone) scenAt = now();      // the forced transmission hits right after the orbit has been shown
  }
  async function destructure() {
    const els = $$('.section.active .cx-b.cx-on, .app-footer.cx-on').filter(e => !e.parentElement.closest('.cx-b'));
    if (!els.length) return; buzz('0,20,30,30');
    const ps = els.map(e => { const s = () => rnd(-1, 1);
      return anim(e, [{ opacity: 1, filter: 'blur(0)', transform: 'none' }, { opacity: 0, filter: 'blur(16px)', transform: `perspective(1000px) translate3d(${s() * 900}px,${s() * 700}px,${-1400 - rnd(0, 1800)}px) rotate3d(${s()},${s()},${s()},${rnd(120, 420)}deg)` }],
        { duration: rnd(420, 620), delay: rnd(0, 140), easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'forwards' }); });
    await Promise.race([Promise.all(ps), sleep(800)]);
    els.forEach(e => { e.classList.remove('cx-on'); e.getAnimations().forEach(a => a.cancel()); }); $$('.cx-b.cx-on').forEach(b => b.classList.remove('cx-b', 'cx-on'));
  }
  async function planAll() {
    window.__quietShow = true; plans = [];
    for (const p of pages) {
      window.showSection(p.id); await nextFrame();
      const groups = collectBlocks(p.sec); const nom = annotate(groups); plans.push({ p, groups, nom });
    }
    window.showSection('overview'); window.__quietShow = false; scrollTo(0, 0);
    nomLeft = plans.reduce((a, x) => a + x.nom + CH_NOM, 0);
  }
  async function finale() {
    finaleStarted = true; card.style.display = 'flex';
    const nm = card.querySelector('.cx-name'), sb = card.querySelector('.cx-sub'), nu = card.querySelector('.cx-num');
    nu.textContent = 'FIN DE TRANSMISSION'; el$('cx-lab').textContent = 'OPÉRATION LIGHTNING'; nu.style.opacity = 1; nm.textContent = ''; sb.textContent = 'PROJECT S3CR3T  ·  #by VTLO@xda'; sb.style.opacity = 1;
    anim(card, [{ opacity: 0, filter: 'blur(20px)', transform: 'scale(.8) rotate(-12deg)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: 900, easing: EASE });
    Sound.say('outro', RATE); await scramble(nm, 'OPÉRATION LIGHTNING', 900);
    const left = deadline - now(); if (left > 0) await wait(left);
  }
  function levelLoop() {
    if (!active) { glow.style.opacity = 0; return; }
    const l = Sound.on && !hijack ? Sound.level() : 0; glow.style.opacity = String(noflash() ? l * .3 : .10 + l * .6);
    if (U && !noflash()) U.boost += (1 + l * 1.1 - U.boost) * .08;
    lvlRaf = requestAnimationFrame(levelLoop);
  }
  function clockLoop() {
    const left = Math.max(0, deadline - now()), m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
    el$('cx-pg').textContent = 'reste ' + m + ':' + String(s).padStart(2, '0');
    el$('cx-prog').firstElementChild.style.width = clamp((now() - T0) / Math.max(1, deadline - T0) * 100, 0, 100) + '%';
  }

  async function run() {
    for (pIdx = 0; pIdx < plans.length && !tok.cancel; pIdx++) {
      const { p, groups } = plans[pIdx]; pageSkip = false;
      if (!hackDone && (hackReq || now() >= scenAt)) await hack();
      await gate(); if (tok.cancel) break;
      Sound.say('c' + pad2(pIdx + 1), RATE);
      const cardP = chapterCard(p, pIdx, plans.length);          // la carte de chapitre recouvre la destructuration de la page précédente
      if (pIdx > 0) await destructure();
      if (tok.cancel) break;
      window.showSection(p.id); $$('.cx-b').forEach(b => b.classList.remove('cx-b', 'cx-on'));
      const ft = $('.app-footer'); if (ft) ft.classList.remove('cx-on');
      await nextFrame(); groups.forEach(g => g.items.forEach(b => b.el.classList.add('cx-b'))); scrollTo(0, 0);
      const holdMs = Math.max(450, clipSec('c' + pad2(pIdx + 1)) * 1000 + 120) * Math.min(1, kLive() + .2);
      await Promise.all([cardP, wait(holdMs)]);
      chapterOut(); nomLeft -= CH_NOM; await sleep(140); skipReq = 0;
      for (const g of groups) { if (tok.cancel) break; await revealGroup(g); }
      if (now() > deadline - FINALE_MS) { /* temps écoulé : on passe à la fin */ break; }
    }
    if (!tok.cancel) { await destructure(); await finale(); }
    if (!tok.cancel) exit(true);
  }

  async function start() {
    if (active) return;
    U = window.__fx ? window.__fx.U : null;
    active = true; window.__cinemaActive = true; tok = { cancel: false }; paused = false; skipReq = 0; pageSkip = false; hijack = false; hackReq = false; finaleStarted = false;
    hackDone = ls.get('lx.choc', '1') !== '1';                   // séquence « transmission pirate » désactivée dans les réglages
    setBtn('cx-pause', ICON.pause, 'Pause'); el$('cx-lab').textContent = 'OPÉRATION LIGHTNING';
    root.classList.add('cinema'); pages = pageList(); assignNar(); $$('[data-nar-st]').forEach(e => e.removeAttribute('data-nar-st'));
    T0 = now(); const L0 = window.__lxT0 || 0;                  // 3:00 à partir du toucher « visite guidée » (intro d'orage comprise)
    deadline = window.__lxFromLaunch && L0 ? Math.max(T0 + 120000, L0 + TOTAL_MS) : T0 + 170000; scenAt = T0 + (deadline - T0) * .72;
    const snd = ls.get('lx.sound', '1') === '1'; Sound.mute(!snd); setBtn('cx-snd', snd ? ICON.vol : ICON.mute, snd ? 'Son' : 'Muet');
    if (G()) G().tip('Touchez l\'écran pour passer au bloc suivant. Les boutons en bas : pause, page suivante, son, aide, quitter.', 6500);
    if (snd) Score.start();
    levelLoop(); clockInt = setInterval(clockLoop, 250); clockLoop();
    // carte d'ouverture + planification (calcul des durées de chaque bloc) pendant l'annonce d'intro
    card.style.display = 'flex'; card.querySelector('.cx-num').textContent = 'TRANSMISSION'; card.querySelector('.cx-num').style.opacity = 1;
    card.querySelector('.cx-sub').textContent = 'SYNCHRONISATION · CANAL SÉCURISÉ'; card.querySelector('.cx-sub').style.opacity = 1;
    scramble(card.querySelector('.cx-name'), 'OPÉRATION LIGHTNING', 900);
    Sound.say('intro', RATE); await planAll();
    await wait(Math.max(300, INTRO_MS - 400)); await chapterOutQuick(); skipReq = 0;
    run();
  }
  function chapterOutQuick() { return anim(card, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).then(() => { card.style.display = 'none'; card.getAnimations().forEach(a => a.cancel()); }); }

  function exit(natural) {
    if (!active) return;
    active = false; window.__cinemaActive = false; tok.cancel = true; finishAll(); hijack = false; hackReq = false;
    cancelAnimationFrame(lvlRaf); clearInterval(clockInt); glow.style.opacity = 0; hackVisual(false);
    const blk = el$('cx-black'); blk.style.transition = 'none'; blk.style.opacity = 0; blk.classList.remove('alarm');
    Sound.stopSay(); Sound.fxStop(); Score.stop(natural ? 2.5 : 1.2); $$('[data-nar-st]').forEach(e => e.removeAttribute('data-nar-st'));
    $$('.cx-b').forEach(b => { b.classList.remove('cx-b', 'cx-on'); b.getAnimations && b.getAnimations().forEach(a => a.cancel()); b.style.filter = ''; });
    if (layer) layer.innerHTML = '';
    card.style.display = 'none'; card.getAnimations().forEach(a => a.cancel());
    root.classList.remove('cinema'); window.__quietShow = false;
    try { window.showSection('overview'); } catch (e) {}
    scrollTo(0, 0); if (U) U.boost = 1;
    if (G()) G().afterVisit(!!natural);
  }


  /* ═════════════════════ 7. LANCEMENT ═════════════════════
     L'écran d'accueil (guide.js) choisit le mode : visite guidée (window.__lxCinema = true) ou exploration libre,
     puis appelle window.__launchSeq() ; à la fin de l'intro, fx.js lance start() si la visite guidée est demandée. */

  window.__cinemaTest = collectBlocks;
  window.__cinema = { FX, start, exit, hack, get plans() { return plans; }, get nomLeft() { return nomLeft; }, kLive: () => kLive(), get active() { return active; }, get hijack() { return hijack; }, get deadline() { return deadline; }, Score, Sound };
})();
