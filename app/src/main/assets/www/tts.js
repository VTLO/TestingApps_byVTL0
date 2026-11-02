/* ═══════════════════════════════════════════════════════════
   Lecteur audio — lit la page active à voix haute en français.
   Android : moteur de synthèse vocale natif (fr-FR, voix féminine privilégiée)
   Navigateur : speechSynthesis (aperçu bureau)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const doc = document;
  const N = window.AndroidFX;
  const native = !!(N && typeof N.ttsSpeak === 'function');
  const webTTS = !native && 'speechSynthesis' in window;
  if (!native && !webTTS) return;

  const $ = (s, r) => (r || doc).querySelector(s);
  const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
  const RATES = [0.85, 1, 1.15, 1.3];
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  let rate = parseFloat(ls.get('tts.rate', '1')) || 1;
  if (native) { try { const r = N.ttsGetRate(); if (r > 0) rate = r; } catch (e) {} }
  let auto = ls.get('tts.auto', '0') === '1';
  let blocks = [], segs = [], pos = 0, playing = false, paused = false, curSeg = -1, runId = 0;

  /* ───────────── texte → parole française ───────────── */
  const GREEK = { 'η': 'éta', 'σ': 'sigma', 'α': 'alpha', 'Λ': 'lambda', 'χ': 'khi', 'μ': 'micro', 'Σ': 'somme' };
  const SUB = { '₀': ' zéro', '₁': ' un', 'ᵢ': ' i' };
  function frSpeak(s) {
    s = s.replace(/МОЛНИЯ/g, 'Molnia').replace(/Единая Космическая Система/g, 'Edinaïa Kosmitcheskaïa Sistéma').replace(/\(EKS\)/g, '(E K S)')
         .replace(/\bmax\./g, 'maximale').replace(/\bmin\./g, 'minimale').replace(/\bp\. ex\./g, 'par exemple').replace(/\bFréq\./g, 'Fréquence')
         .replace(/\bjanv\./g, 'janvier').replace(/\bavr\./g, 'avril').replace(/\bfévr\./g, 'février');
    s = s.replace(/ /g, ' ');
    s = s.replace(/(\d)[  ](\d{3})(?!\d)/g, '$1$2');                   // 39 000 → 39000
    s = s.replace(/(\d)\s?[–-]\s?(\d)/g, '$1 à $2');                           // 2019–2026
    s = s.replace(/[−](?=\d)/g, 'moins ');
    s = s.replace(/(\d)\s?°/g, '$1 degrés').replace(/°/g, ' degrés');
    s = s.replace(/±/g, 'plus ou moins ').replace(/≥/g, 'supérieur ou égal à ').replace(/≤/g, 'inférieur ou égal à ')
         .replace(/[<＜]/g, ' inférieur à ').replace(/>/g, ' supérieur à ').replace(/[≈~]/g, ' environ ')
         .replace(/→/g, ', puis ').replace(/%/g, ' pour cent');
    s = s.replace(/(\d)(dB|MHz|GHz|kHz|Hz|km|ms|ns)(?![A-Za-zÀ-ÿ])/g, '$1 $2');
    const U = (re, to) => { s = s.replace(new RegExp('(?<![A-Za-zÀ-ÿ])' + re + '(?![A-Za-zÀ-ÿ])', 'g'), to); };
    s = s.replace(/(\d)\s?m²/g, '$1 mètres carrés').replace(/(\d)\s?m(?![A-Za-zÀ-ÿ])/g, '$1 mètres').replace(/(\d)\s?h(?![A-Za-zÀ-ÿ])/g, '$1 heures');
    U('MHz', 'mégahertz'); U('GHz', 'gigahertz'); U('kHz', 'kilohertz'); U('Hz', 'hertz'); U('dB', 'décibels');
    U('[μµ]s', 'microsecondes'); U('ns', 'nanosecondes'); U('ms', 'millisecondes'); U('km', 'kilomètres');
    s = s.replace(/\bUTC\b/g, 'U T C').replace(/\bTDOA\b/g, 'T D O A').replace(/\bFDOA\b/g, 'F D O A').replace(/\bGLRT\b/g, 'G L R T')
         .replace(/\bGNSS\b/g, 'G N S S').replace(/\bCNR\b/g, 'C N R').replace(/\bTLE\b/g, 'T L E').replace(/\bIQ\b/g, 'I Q')
         .replace(/\bGPS\b/g, 'G P S').replace(/\bEKS\b/g, 'E K S').replace(/\bIGS\b/g, 'I G S').replace(/\bHEO\b/g, 'H E O')
         .replace(/\bNORAD\b/g, 'Norad').replace(/\bID\b/g, 'I D').replace(/\bRINEX\b/g, 'Rineks').replace(/\bLAMA\b/g, 'Lama')
         .replace(/\bCOSMOS\b/gi, 'Cosmos').replace(/\bMolniya\b/gi, 'Molnia').replace(/\bGRID SDR\b/g, 'grid S D R');
    s = s.replace(/[ηαΛχμΣσ]/g, c => ' ' + GREEK[c] + ' ').replace(/[₀₁ᵢ]/g, c => SUB[c]);
    s = s.replace(/[_*]/g, ' ').replace(/\/\//g, ' ').replace(/(\w)\/(\w)/g, '$1 $2');
    s = s.replace(/[·•▸✓⚠ℹ⚡★█▪◉◎⬡△∿⧗☀|]/g, ', ').replace(/[«»"“”]/g, ' ').replace(/[\[\]]/g, ' ');
    s = s.replace(/\s*[—–]\s*/g, ', ').replace(/\s*,(\s*,)+/g, ',').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1');
    return s.replace(/^[\s,.;:]+/, '').trim();
  }
  function splitSentences(t) {
    const out = []; let cur = '';
    t.split(/(?<=[.!?;])\s+/).forEach(p => {
      if (cur && (cur + ' ' + p).length > 230) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p;
    });
    if (cur) out.push(cur);
    return out.flatMap(x => {
      if (x.length <= 260) return [x];
      const parts = []; let c = '';
      x.split(/(?<=,)\s+/).forEach(p => { if (c && (c + ' ' + p).length > 220) { parts.push(c); c = p; } else c = c ? c + ' ' + p : p; });
      if (c) parts.push(c); return parts;
    }).filter(x => /[A-Za-zÀ-ÿ0-9]/.test(x));
  }

  /* ───────────── extraction des blocs lisibles ───────────── */
  function textOf(el) {
    const parts = [];
    (function rec(n) {
      if (n.nodeType === 3) { const t = n.data.replace(/\s+/g, ' ').trim(); if (t) parts.push(t); return; }
      if (n.nodeType !== 1 || n.matches('script,style,canvas,img,svg,.tts-skip')) return;
      const blk = getComputedStyle(n).display !== 'inline';
      if (blk) parts.push('\u0001');
      n.childNodes.forEach(rec);
      if (blk) parts.push('\u0001');
    })(el);
    let s = '';
    parts.forEach(t => {
      if (t === '\u0001') s = /[.!?:;,]\s*$/.test(s) || !s ? s.trimEnd() + ' ' : s.trimEnd() + '. ';
      else s += (s && !/ $/.test(s) ? ' ' : '') + t;
    });
    return s.trim().replace(/[.:;,\s]+$/, '');
  }
  function cardText(el) {
    const g = c => { const e = $(c, el); return e ? textOf(e) : ''; };
    const label = g('.card-label'), val = g('.card-value'), unit = g('.card-unit'), desc = g('.card-desc');
    if (!label && !val) return textOf(el);
    return [label && (label + ' :'), [val, unit].filter(Boolean).join(' '), desc].filter(Boolean).join(' ');
  }
  function rowText(tr) {
    const cells = Array.from(tr.children).map(textOf).filter(Boolean);
    if (!cells.length) return '';
    if (tr.parentElement.tagName === 'THEAD') return 'Colonnes : ' + cells.join(', ');
    return cells.length > 1 ? cells[0] + ' : ' + cells.slice(1).join(', ') : cells[0];
  }
  const LEAF = '.page-title, .hero, .timeline-item';
  function collect() {
    const sec = $('.section.active'); if (!sec) return [];
    const out = [];
    const emit = (el, text) => { text = (text || '').trim(); if (text.length > 1 && el.offsetParent !== null) out.push({ el, text }); };
    (function walk(n) {
      if (n.nodeType !== 1 || n.matches('script,style,canvas,img,svg,.year-bars,.year-labels,.tts-skip')) return;
      if (n.matches('.card-wide')) {
        const t = Array.from(n.children).find(c => c.classList.contains('card-wide-title'));
        if (t) emit(t, textOf(t));
        Array.from(n.children).forEach(c => { if (c !== t) walk(c); });
        return;
      }
      if (n.matches('.card')) { emit(n, cardText(n)); return; }
      if (n.tagName === 'TR') { emit(n, rowText(n)); return; }
      if (n.matches(LEAF)) { emit(n, textOf(n)); return; }
      const hasBlockKid = Array.from(n.children).some(c => /^(DIV|TABLE|TBODY|THEAD|SECTION|UL|TR)$/.test(c.tagName));
      if (hasBlockKid) Array.from(n.children).forEach(walk); else emit(n, textOf(n));
    })(sec);
    return out;
  }

  /* ───────────── interface ───────────── */
  const SVG = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 6l8.5 6L6 18zM16 6h2.5v12H16z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 6l-8.5 6L18 18zM5.5 6H8v12H5.5z"/></svg>',
    voice: '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.9V21h2v-3.1A7 7 0 0019 11z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
    ear: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6L7 10H3zm11.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM12 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z"/></svg>',
  };
  const root = doc.createElement('div'); root.id = 'tts-ui'; root.className = 'tts-skip';
  root.innerHTML =
    '<div id="tts-panel" role="toolbar" aria-label="Lecteur audio">' +
      '<div id="tts-status">Lecture de la page</div>' +
      '<div id="tts-bar"><i></i></div>' +
      '<div id="tts-row">' +
        '<button id="tts-prev" aria-label="Bloc précédent">' + SVG.prev + '</button>' +
        '<button id="tts-next" aria-label="Bloc suivant">' + SVG.next + '</button>' +
        '<button id="tts-rate" aria-label="Vitesse">1×</button>' +
        '<button id="tts-voice" aria-label="Changer de voix">' + SVG.voice + '<span id="tts-voice-n"></span></button>' +
        '<button id="tts-auto" aria-label="Enchaîner les pages">AUTO</button>' +
        '<button id="tts-close" aria-label="Fermer le lecteur">' + SVG.close + '</button>' +
      '</div>' +
    '</div>' +
    '<button id="tts-fab" aria-label="Écouter cette page"><span class="tts-ring"></span><span class="tts-ico">' + SVG.ear + '</span>' +
      '<span class="tts-eq"><b></b><b></b><b></b><b></b></span></button>';
  doc.body.appendChild(root);
  const el = id => doc.getElementById(id);
  const fab = el('tts-fab'), panel = el('tts-panel');

  function ui() {
    root.classList.toggle('open', playing || paused);
    root.classList.toggle('playing', playing);
    fab.querySelector('.tts-ico').innerHTML = playing ? SVG.pause : (paused ? SVG.play : SVG.ear);
    el('tts-rate').textContent = (rate % 1 === 0 ? rate : String(rate).replace('.', ',')) + '×';
    el('tts-auto').classList.toggle('on', auto);
    el('tts-bar').firstElementChild.style.width = blocks.length ? Math.round((pos + (playing ? .5 : 0)) / blocks.length * 100) + '%' : '0%';
    el('tts-status').textContent = playing ? 'Lecture · bloc ' + (pos + 1) + ' / ' + blocks.length : (paused ? 'En pause · bloc ' + (pos + 1) + ' / ' + blocks.length : '');
    if (native) { try { el('tts-voice-n').textContent = N.ttsVoiceInfo(); } catch (e) {} }
    else el('tts-voice-n').textContent = '';
  }
  function toast(msg, action, cb) {
    let t = $('#tts-toast'); if (!t) { t = doc.createElement('div'); t.id = 'tts-toast'; t.className = 'tts-skip'; doc.body.appendChild(t); }
    t.innerHTML = ''; const s = doc.createElement('span'); s.textContent = msg; t.appendChild(s);
    if (action) { const b = doc.createElement('button'); b.textContent = action; b.onclick = cb; t.appendChild(b); }
    t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), action ? 9000 : 3500);
  }

  function highlight(i) {
    $$('.tts-now').forEach(e => e.classList.remove('tts-now'));
    const b = blocks[i]; if (!b) return;
    b.el.classList.add('tts-now');
    const r = b.el.getBoundingClientRect(), H = innerHeight, dock = 90;
    if (r.top < 70 || r.bottom > H - dock) {
      const y = scrollY + r.top - Math.max(80, (H - Math.min(r.height, H * .6)) / 3);
      scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  }

  /* ───────────── lecture ───────────── */
  function nativeStatusOK() {
    let st = 'ok'; try { st = N.ttsStatus(); } catch (e) {}
    if (st === 'ok') return true;
    if (st === 'init') { toast('Moteur vocal en cours d’initialisation…'); return false; }
    toast('Voix française non installée sur ce téléphone.', 'Installer', () => { try { N.ttsInstall(); } catch (e) {} });
    return false;
  }
  function start(bi) {
    stopEngine();
    blocks = collect();
    if (!blocks.length) { toast('Rien à lire sur cette page.'); return; }
    pos = Math.max(0, Math.min(bi, blocks.length - 1));
    if (native && !nativeStatusOK()) { blocks = []; playing = paused = false; ui(); return; }
    segs = [];
    for (let b = pos; b < blocks.length; b++) splitSentences(frSpeak(blocks[b].text)).forEach(t => segs.push({ t, b }));
    if (!segs.length) { toast('Rien à lire sur cette page.'); return; }
    playing = true; paused = false; curSeg = -1; const id = ++runId;
    highlight(pos); ui();
    if (native) {
      try { N.ttsSpeak(JSON.stringify(segs.map(s => s.t)), rate); } catch (e) { toast('Erreur du moteur vocal.'); stop(); }
    } else {
      speechSynthesis.cancel();
      const vs = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang));
      const v = vs.find(x => /female|femme|amelie|amélie|audrey|marie|julie|denise|eloise/i.test(x.name)) || vs[0];
      segs.forEach((s, i) => {
        const u = new SpeechSynthesisUtterance(s.t); u.lang = 'fr-FR'; u.rate = rate; u.pitch = 1.05; if (v) u.voice = v;
        u.onstart = () => { if (id === runId) window.__tts.onStart(i); };
        u.onend = () => { if (id === runId) window.__tts.onDone(i); };
        u.onerror = () => { if (id === runId && playing) window.__tts.onDone(i); };
        speechSynthesis.speak(u);
      });
    }
  }
  function stopEngine() { runId++; try { native ? N.ttsStop() : speechSynthesis.cancel(); } catch (e) {} }
  function stop(keepPos) {
    stopEngine(); playing = false; paused = false;
    if (!keepPos) { $$('.tts-now').forEach(e => e.classList.remove('tts-now')); blocks = []; pos = 0; }
    ui();
  }
  function pause() { stopEngine(); playing = false; paused = true; ui(); }
  function goto(bi) { if (!blocks.length) blocks = collect(); start(Math.max(0, Math.min(bi, blocks.length - 1))); }

  function finished() {
    stop();
    if (!auto) { toast('Lecture terminée.'); return; }
    const items = $$('.nav-item'), cur = items.findIndex(n => n.classList.contains('active'));
    if (cur >= 0 && cur < items.length - 1) {
      items[cur + 1].click();
      setTimeout(() => { scrollTo(0, 0); start(0); }, 900);
    } else toast('Fin du rapport.');
  }

  window.__tts = {
    onStart(i) {
      i = +i; curSeg = i; const s = segs[i]; if (!s || !playing) return;
      if (s.b !== pos) { pos = s.b; highlight(pos); }
      ui();
    },
    onDone(i) { if (playing && +i >= segs.length - 1) finished(); },
    onError() { if (playing) { toast('Erreur du moteur vocal.'); stop(); } },
  };

  /* ───────────── commandes ───────────── */
  fab.addEventListener('click', () => {
    if (playing) pause(); else if (paused) start(pos); else start(0);
  });
  el('tts-next').addEventListener('click', () => goto(pos + 1));
  el('tts-prev').addEventListener('click', () => goto(pos - 1));
  el('tts-close').addEventListener('click', () => stop());
  el('tts-rate').addEventListener('click', () => {
    const i = RATES.findIndex(r => Math.abs(r - rate) < .01); rate = RATES[(i + 1) % RATES.length];
    ls.set('tts.rate', rate); ui(); if (playing) start(pos);
  });
  el('tts-auto').addEventListener('click', () => { auto = !auto; ls.set('tts.auto', auto ? '1' : '0'); ui(); toast(auto ? 'Enchaînement automatique des pages activé.' : 'Enchaînement désactivé.'); });
  el('tts-voice').addEventListener('click', () => {
    if (!native) { toast('Le choix de voix est géré par le navigateur.'); return; }
    let n = ''; try { n = N.ttsNextVoice(); } catch (e) {}
    ui(); toast('Voix ' + n); if (playing) start(pos);
  });

  // changement de page → arrêt de la lecture
  const _show = window.showSection;
  window.showSection = function (id) { if (playing || paused) stop(); return _show.apply(this, arguments); };
  document.addEventListener('visibilitychange', () => { /* la lecture continue écran éteint (Android) */ });
  ui();
})();
