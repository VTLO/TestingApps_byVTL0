/* ═══════════════════════════════════════════════════════════════
   GUIDE — accueil, réglages, aide, lexique, « En bref », astuces
   Pensé pour un public débutant : tout est en français, chaque bouton est légendé,
   rien ne démarre sans que l'utilisateur l'ait choisi.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const doc = document, root = doc.documentElement;
  const $ = (s, r) => (r || doc).querySelector(s);
  const $$ = (s, r) => Array.from((r || doc).querySelectorAll(s));
  const N = window.AndroidFX;
  const buzz = p => { try { N && N.vibrate && N.vibrate(String(p)); } catch (e) {} };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ═════════════ 1. RÉGLAGES (mémorisés sur l'appareil) ═════════════ */
  const OPTS = {
    son:     { key: 'lx.sound',   def: '1', label: 'Son', help: 'Ambiance radio et voix off en français' },
    noflash: { key: 'lx.noflash', def: '0', label: 'Mode sans flash', help: 'Supprime les éclairs et clignotements (yeux sensibles, épilepsie)' },
    choc:    { key: 'lx.choc',    def: '1', label: 'Séquence « transmission pirate »', help: '30 s de sons très forts et sirènes pendant la visite. Désactivez-la si vous êtes sensible.' },
  };
  const opt = k => ls.get(OPTS[k].key, OPTS[k].def) === '1';
  function setOpt(k, v) {
    ls.set(OPTS[k].key, v ? '1' : '0');
    if (k === 'noflash') root.classList.toggle('noflash', v);
    if (k === 'son' && window.__cinema && window.__cinema.active) { const b = $('#cx-snd'); if (b && (window.__cinema.Sound.muted === v)) b.click(); }
    $$('input[data-opt="' + k + '"]').forEach(i => { i.checked = v; });
    resume();
  }
  function resume() {
    const r = $('#acc-resume'); if (!r) return;
    r.textContent = '· ' + [opt('son') ? 'son activé' : 'son coupé', opt('noflash') ? 'sans flash' : null, opt('choc') ? null : 'sans séquence pirate'].filter(Boolean).join(' · ');
  }
  function bindSwitch(input, k) {
    input.dataset.opt = k; input.checked = opt(k);
    input.addEventListener('change', () => setOpt(k, input.checked));
  }
  function switchesHtml() {
    return Object.keys(OPTS).map(k => '<label class="acc-sw"><input type="checkbox" data-sw="' + k + '"><span><b>' + esc(OPTS[k].label) + '</b><small>' + esc(OPTS[k].help) + '</small></span></label>').join('');
  }
  root.classList.toggle('noflash', opt('noflash'));

  /* ═════════════ 2. LEXIQUE ═════════════ */
  const LEX = [
    ['gnss', 'GNSS / GPS', 'Les systèmes de positionnement par satellite. Le GPS (américain) est le plus connu ; Galileo (européen), BeiDou (chinois) et GLONASS (russe) en font aussi partie. Téléphones, avions et bateaux s\'en servent pour savoir où ils sont et quelle heure il est.'],
    ['brouillage', 'Brouillage', 'Émettre volontairement un signal radio qui « couvre » le signal GPS, un peu comme quelqu\'un qui crie pendant qu\'on vous parle : le récepteur n\'entend plus le satellite.'],
    ['cnr', 'CNR (rapport porteuse/bruit)', 'La qualité du signal GPS reçu. Plus il est haut, mieux c\'est. Quand il chute, le signal se noie dans le bruit et la position devient fausse ou impossible.'],
    ['db', 'dB (décibel)', 'Unité qui compare deux puissances. Une chute de 10 dB veut dire un signal utile 10 fois plus faible ; 20 dB, 100 fois plus faible.'],
    ['mhz', 'MHz (mégahertz)', 'Unité de fréquence radio, comme le numéro d\'une station. Le GPS civil émet à 1575,42 MHz ; le brouilleur, juste à côté, à 1577,5 MHz.'],
    ['igs', 'Stations IGS', 'Un réseau mondial de récepteurs GPS scientifiques installés au sol. Leurs enregistrements, publics, ont permis de repérer le brouillage.'],
    ['salve', 'Salve', 'Une bouffée de brouillage courte (moins de 10 secondes) qui se répète.'],
    ['utc', 'UTC', 'L\'heure universelle de référence. En France : heure UTC + 1 h en hiver, + 2 h en été.'],
    ['tdoa', 'TDOA', '« Différence de temps d\'arrivée ». Un même signal atteint deux récepteurs éloignés avec un minuscule décalage ; ce décalage indique d\'où il vient, comme l\'écho d\'un orage qui permet d\'estimer sa distance.'],
    ['iq', 'Données IQ', 'L\'enregistrement brut du signal radio, tel que l\'antenne le capte, avant tout traitement. C\'est la « bande originale » de l\'événement.'],
    ['molniya', 'Orbite Molniya', 'Une orbite très allongée : le satellite passe vite près de la Terre, puis reste longtemps très loin, au-dessus de l\'hémisphère nord. Idéal pour surveiller la Russie… et l\'Europe.'],
    ['apogee', 'Apogée / périgée', 'Le point de l\'orbite le plus éloigné de la Terre (apogée, ~39 000 km) et le plus proche (périgée, ~500 km).'],
    ['eks', 'EKS / Cosmos 2546', 'EKS est la constellation russe de satellites d\'alerte précoce, qui détecte les tirs de missiles. Cosmos 2546 en fait partie ; « NORAD 45608 » est son numéro au catalogue des objets spatiaux.'],
    ['glrt', 'GLRT, fusion bayésienne', 'Des méthodes statistiques qui comparent plusieurs hypothèses (« est-ce ce satellite-ci ? celui-là ? ») et calculent laquelle est la plus probable.'],
    ['solaire', 'Sursaut radio solaire', 'Une bouffée d\'ondes radio émise par le Soleil lors d\'une éruption. Elle gêne aussi le GPS, mais naturellement, plus longtemps et sur toutes les fréquences à la fois.'],
  ];
  const LEXM = Object.fromEntries(LEX.map(e => [e[0], e]));

  /* ═════════════ 3. « EN BREF » : résumé simple en haut de chaque page ═════════════ */
  const BREF = {
    overview: ['Depuis 2019, quelque chose perturbe les signaux GPS en Europe, au Groenland et au Canada, par courtes salves. Cette page résume l\'enquête : combien de jours touchés, avec quelle force, et le coupable identifié, un satellite militaire russe.', ['gnss', 'brouillage', 'cnr', 'db', 'igs', 'eks']],
    timeline: ['Quand le brouillage a-t-il eu lieu ? 75 jours en 7 ans, surtout en semaine et aux heures de bureau : un indice que des humains le déclenchent volontairement.', ['salve', 'utc']],
    spatial: ['Où le brouillage est-il le plus fort ? Sur les cartes, chaque point est une station GPS au sol : plus la couleur est vive, plus le signal a été perturbé. Les pays baltes sont les plus touchés, signe d\'une source haut dans le ciel au-dessus du nord de l\'Europe.', ['igs', 'cnr', 'molniya']],
    spectral: ['Sur quelles fréquences ? Le brouilleur émet juste à côté de la fréquence du GPS, sur deux bandes différentes. Le graphique animé simule ce qu\'un récepteur « voit » : les bosses rouges sont le brouillage.', ['mhz', 'gnss']],
    temporal: ['À quel rythme ? Les salves reviennent environ toutes les 150 secondes : une régularité de machine programmée, pas d\'un phénomène naturel.', ['salve']],
    methods: ['Comment trouver le coupable parmi des milliers de satellites ? Trois méthodes, de la plus simple à la plus précise, réduisent peu à peu la liste des suspects.', ['glrt']],
    tdoa: ['La preuve décisive : le 11 février 2026, deux récepteurs (Amsterdam et Trondheim) ont enregistré le même brouillage. Le minuscule écart d\'heure d\'arrivée entre les deux a permis de pointer le satellite.', ['tdoa', 'iq']],
    target: ['Le suspect : Cosmos 2546, un satellite russe d\'alerte précoce. Son orbite très allongée le garde longtemps au-dessus de l\'Europe. L\'animation montre son trajet et la zone qu\'il « éclaire ».', ['eks', 'molniya', 'apogee']],
    solar: ['Et si c\'était le Soleil ? Les éruptions solaires perturbent aussi le GPS, mais autrement : plus longtemps, sur toutes les fréquences, et sur toute la moitié éclairée de la Terre. Cette page compare les deux.', ['solaire', 'db']],
    about: ['D\'où viennent ces informations ? D\'un article de chercheurs des universités du Texas et de Stanford (2026). Cette application en est une mise en scène, pas une source officielle.', ['igs']],
  };
  $$('.section').forEach(sec => {
    const id = sec.id.replace('section-', ''), b = BREF[id]; if (!b) return;
    const anchor = $('.page-title', sec) || $('.hero', sec); if (!anchor) return;
    const chips = b[1].map(k => LEXM[k] ? '<button type="button" class="gd-chip" data-lex="' + k + '">' + esc(LEXM[k][1]) + '</button>' : '').join('');
    anchor.insertAdjacentHTML('afterend', '<aside class="gd-bref"><div class="gd-bref-h">💡 En bref</div><p>' + esc(b[0]) + '</p>' +
      (chips ? '<div class="gd-chips"><span>Mots à connaître :</span>' + chips + '</div>' : '') + '</aside>');
  });

  /* ═════════════ 4. AIDE (guide + lexique + réglages) ═════════════ */
  const ICONS = '<span class="gd-k">⏸ Pause</span><span class="gd-k">⏭ Suivant</span><span class="gd-k">⏩ Page +</span><span class="gd-k">🔊 Son</span><span class="gd-k">? Aide</span><span class="gd-k">✕ Quitter</span>';
  doc.body.insertAdjacentHTML('beforeend',
    '<div id="gd-aide" role="dialog" aria-modal="true" aria-labelledby="gd-aide-t" hidden><div class="gd-box">' +
      '<div class="gd-head"><h2 id="gd-aide-t">Aide</h2><button type="button" class="gd-x" id="gd-close" aria-label="Fermer l\'aide">✕</button></div>' +
      '<nav class="gd-tabs" role="tablist">' +
        '<button type="button" role="tab" data-tab="sujet" aria-selected="true">L\'histoire</button>' +
        '<button type="button" role="tab" data-tab="mode">Mode d\'emploi</button>' +
        '<button type="button" role="tab" data-tab="lexique">Lexique</button>' +
        '<button type="button" role="tab" data-tab="reglages">Réglages</button></nav>' +
      '<div class="gd-body">' +
        '<section data-pane="sujet"><h3>De quoi parle cette application ?</h3>' +
          '<p>Le <b>GPS</b> de votre téléphone, des avions et des bateaux dépend de signaux très faibles venus de satellites. Depuis 2019, ces signaux sont régulièrement <b>brouillés</b> au-dessus de l\'Europe, pendant quelques secondes.</p>' +
          '<p>Des chercheurs ont analysé 7 ans de mesures et ont remonté la piste jusqu\'à un satellite russe, <b>Cosmos 2546</b>. L\'application raconte leur enquête en 10 pages : <i>quand</i>, <i>où</i>, <i>sur quelles fréquences</i>, <i>comment</i> le coupable a été identifié, et pourquoi ce n\'est pas le Soleil.</p>' +
          '<p class="gd-note">C\'est une mise en scène inspirée d\'un article scientifique (arXiv 2606.03673), pas une source officielle.</p>' +
          '<button type="button" class="acc-btn primary gd-go"><span class="acc-ic">▶</span><span class="acc-tx"><b>Lancer la visite guidée</b><small>3 minutes, tout est automatique</small></span></button></section>' +
        '<section data-pane="mode" hidden><h3>Deux façons de découvrir</h3>' +
          '<ol class="gd-steps"><li><b>Visite guidée (3 min)</b> : le récit défile tout seul, avec une voix off. Vous n\'avez rien à faire.</li>' +
          '<li><b>Exploration libre</b> : vous choisissez les pages dans la barre du bas, à votre rythme.</li></ol>' +
          '<h3>Pendant la visite guidée</h3><ul class="gd-list"><li><b>Touchez l\'écran</b> pour passer au bloc suivant.</li>' +
          '<li>Les boutons en bas de l\'écran : <span class="gd-keys">' + ICONS + '</span></li>' +
          '<li>Le <b>temps restant</b> s\'affiche en haut à droite, le chapitre en haut à gauche.</li>' +
          '<li>À la fin, toutes les pages restent consultables.</li></ul>' +
          '<h3>En exploration libre</h3><ul class="gd-list"><li><b>Faites glisser la barre du bas</b> vers la gauche : il y a 10 pages.</li>' +
          '<li>Chaque page commence par un encadré <b>💡 En bref</b> qui résume l\'essentiel.</li>' +
          '<li>Touchez un <b>mot à connaître</b> pour lire sa définition.</li>' +
          '<li>Le bouton rond <b>« Visite guidée »</b> relance la présentation ; <b>?</b> en haut ouvre cette aide.</li>' +
          '<li>Sur Android, le bouton <b>Retour</b> ramène à l\'Aperçu, puis quitte l\'application.</li></ul></section>' +
        '<section data-pane="lexique" hidden><h3>Les mots à connaître</h3><dl class="gd-lex">' +
          LEX.map(e => '<div id="lex-' + e[0] + '"><dt>' + esc(e[1]) + '</dt><dd>' + esc(e[2]) + '</dd></div>').join('') + '</dl></section>' +
        '<section data-pane="reglages" hidden><h3>Réglages</h3><p class="gd-note">Vos choix sont mémorisés sur cet appareil.</p>' + switchesHtml() + '</section>' +
      '</div></div></div>' +
    '<div id="gd-toast" role="status" aria-live="polite" hidden><span class="gd-t-tx"></span><button type="button" class="gd-t-ok">OK</button></div>');

  const aide = $('#gd-aide');
  $$('input[data-sw]', aide).forEach(i => bindSwitch(i, i.dataset.sw));
  let onHelpClose = null, lastFocus = null;
  function tab(name) {
    $$('[role="tab"]', aide).forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-pane]', aide).forEach(p => { p.hidden = p.dataset.pane !== name; });
    $('.gd-body', aide).scrollTop = 0;
  }
  function openHelp(cb, tabName, lexId) {
    onHelpClose = typeof cb === 'function' ? cb : null; lastFocus = doc.activeElement;
    aide.hidden = false; requestAnimationFrame(() => aide.classList.add('on'));
    $('.gd-go', aide).hidden = !!(window.__cinema && window.__cinema.active) || !!$('#accueil:not([hidden])');
    tab(tabName || 'sujet');
    if (lexId) { const e = $('#lex-' + lexId, aide); if (e) { e.classList.add('hl'); e.scrollIntoView({ block: 'center' }); setTimeout(() => e.classList.remove('hl'), 1800); } }
    $('#gd-close').focus({ preventScroll: true }); buzz('12');
  }
  function closeHelp() {
    if (aide.hidden) return false;
    aide.classList.remove('on'); setTimeout(() => { aide.hidden = true; }, 220);
    const cb = onHelpClose; onHelpClose = null; if (cb) cb();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    return true;
  }
  $('#gd-close').addEventListener('click', closeHelp);
  aide.addEventListener('click', e => { if (e.target === aide) closeHelp(); });
  $$('[role="tab"]', aide).forEach(t => t.addEventListener('click', () => tab(t.dataset.tab)));
  $('.gd-go', aide).addEventListener('click', () => { closeHelp(); startVisit(); });
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') closeHelp(); });
  doc.addEventListener('click', e => { const c = e.target.closest('.gd-chip'); if (c) openHelp(null, 'lexique', c.dataset.lex); });

  /* ═════════════ 5. ASTUCES (bandeau discret en bas) ═════════════ */
  const toastEl = $('#gd-toast'); let toastT = 0;
  function toast(msg, ms, withOk) {
    clearTimeout(toastT); $('.gd-t-tx', toastEl).textContent = msg; toastEl.classList.toggle('ok', !!withOk);
    toastEl.hidden = false; requestAnimationFrame(() => toastEl.classList.add('on'));
    toastT = setTimeout(hideToast, ms || 3000);
  }
  function hideToast() { clearTimeout(toastT); toastEl.classList.remove('on'); setTimeout(() => { if (!toastEl.classList.contains('on')) toastEl.hidden = true; }, 300); }
  $('.gd-t-ok', toastEl).addEventListener('click', e => { e.stopPropagation(); hideToast(); });
  const tip = (msg, ms) => toast('💡 ' + msg, ms || 6000, true);

  /* ═════════════ 6. BOUTON D'AIDE DANS L'EN-TÊTE ═════════════ */
  const hdr = $('.header');
  if (hdr) {
    hdr.insertAdjacentHTML('beforeend', '<button type="button" id="gd-hbtn" aria-label="Aide et lexique">?</button>');
    $('#gd-hbtn').addEventListener('click', () => openHelp());
  }

  /* ═════════════ 7. ACCUEIL ═════════════ */
  const acc = $('#accueil');
  let launched = false;
  function startVisit() {
    if (window.__cinema && !window.__cinema.active) { window.__lxFromLaunch = false; window.__cinema.start(); }
  }
  function launch(guided) {
    if (launched) return; launched = true;
    window.__lxCinema = guided; window.__lxFromLaunch = guided; window.__lxT0 = performance.now();
    if (!guided) {
      const ov = $('#launch-overlay');
      if (ov) new MutationObserver((m, o) => { if (ov.classList.contains('done')) { o.disconnect();
        setTimeout(() => tip('Faites glisser la barre du bas pour changer de page. Le bouton « ? » en haut ouvre l\'aide et le lexique.', 8000), 900); } })
        .observe(ov, { attributes: true, attributeFilter: ['class'] });
    }
    acc.classList.add('out'); buzz('18');
    setTimeout(() => { acc.hidden = true; }, 650);
    if (window.__launchSeq) window.__launchSeq();
  }
  if (acc) {
    bindSwitch($('#acc-son'), 'son'); bindSwitch($('#acc-noflash'), 'noflash'); bindSwitch($('#acc-choc'), 'choc'); resume();
    $('#acc-go').addEventListener('click', () => launch(true));
    $('#acc-libre').addEventListener('click', () => launch(false));
    $('#acc-aide').addEventListener('click', () => openHelp(null, 'mode'));
    const tEl = $('#acc-time'), dEl = $('#acc-date'), p2 = n => String(n).padStart(2, '0');
    let dTxt = '';
    const tick = () => {
      if (acc.hidden) return;
      const d = new Date(); tEl.textContent = p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
      const t = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (t !== dTxt) dEl.textContent = dTxt = t;
      setTimeout(tick, 1000 - d.getMilliseconds() + 5);
    };
    tick();
    setTimeout(() => { const g = $('#acc-go'); if (g && !acc.hidden) g.focus({ preventScroll: true }); }, 300);
  } else launch(true);

  /* ═════════════ 8. FIN DE VISITE ═════════════ */
  function afterVisit(natural) {
    tip(natural ? 'Visite terminée ! Explorez maintenant les 10 pages avec la barre du bas, ou relancez avec « Visite guidée ».'
                : 'Visite interrompue. Vous êtes en exploration libre : changez de page avec la barre du bas.', 8000);
  }

  /* ═════════════ 9. BOUTON RETOUR (Android) ═════════════ */
  const back0 = window.__lxBack;
  window.__lxBack = function () {
    if (closeHelp()) return true;
    if (acc && !acc.hidden) return false;
    return back0 ? back0() : false;
  };

  window.__guide = { openHelp, closeHelp, toast, tip, afterVisit, opt, setOpt };
})();
