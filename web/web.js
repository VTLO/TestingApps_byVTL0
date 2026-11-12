/* Web entry: start gate (browsers require a user gesture before audio), then loads the cinema engine. PWA registration. */
(function () {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(function () {});
  var g = document.createElement('div'); g.id = 'web-gate';
  g.innerHTML = '<div class="wg-in"><img src="icons/icon-192.png" alt="VTLO"><h1>VTLOdr3m3r</h1><p>OPERATION LIGHTNING · GNSS INTERFERENCE INTELLIGENCE</p>' +
    '<button id="wg-go">▶ START 3-MIN PRESENTATION</button><button id="wg-skip" class="alt">Browse pages only</button>' +
    '<small>⚠ Viewer discretion: sudden loud sounds, bright and strobing light effects. Sound on recommended.</small></div>';
  var st = document.createElement('style');
  st.textContent = '#web-gate{position:fixed;inset:0;z-index:2147483000;background:radial-gradient(ellipse at 50% 35%,#06263a,#020408 70%);display:flex;align-items:center;justify-content:center;text-align:center;color:#cfeaff;font-family:"Space Mono",monospace}' +
    '#web-gate .wg-in{padding:24px;max-width:420px}#web-gate img{width:104px;height:104px;border-radius:22px;box-shadow:0 0 34px rgba(255,140,0,.45)}' +
    '#web-gate h1{font-size:30px;letter-spacing:.18em;margin:18px 0 6px;color:#00e5ff;text-shadow:0 0 14px rgba(0,229,255,.6)}#web-gate p{font-size:11px;letter-spacing:.2em;opacity:.7;margin:0 0 28px}' +
    '#web-gate button{display:block;width:100%;margin:10px 0;padding:15px;border-radius:10px;border:1px solid #00e5ff;background:rgba(0,229,255,.1);color:#00e5ff;font:700 13px "Space Mono",monospace;letter-spacing:.12em;cursor:pointer}' +
    '#web-gate button.alt{border-color:#345;color:#89a;background:none}#web-gate small{display:block;margin-top:22px;font-size:11px;line-height:1.5;color:#ffb74d;opacity:.9}';
  document.head.appendChild(st); document.body.appendChild(g);
  function load(cinema) {
    g.remove();
    if (!cinema) { var c = document.getElementById('clockscreen'); if (c) c.style.display = 'none'; if (window.__launchSeq) window.__launchSeq(); return; }
    var s = document.createElement('script'); s.src = 'cinema.js'; document.body.appendChild(s);
  }
  document.getElementById('wg-go').addEventListener('click', function () { load(true); });
  document.getElementById('wg-skip').addEventListener('click', function () { load(false); });
})();
