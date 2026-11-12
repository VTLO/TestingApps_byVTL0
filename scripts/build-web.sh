#!/bin/bash
# Builds the installable web app (PWA) from the Android assets → web/
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=app/src/main/assets/www; OUT=web
rm -rf "$OUT"; mkdir -p "$OUT/icons"; cp -r "$SRC"/. "$OUT"/
python3 - <<'PY'
import re
p='web/index.html'; h=open(p,encoding='utf-8').read()
assert '<script src="cinema.js"></script>' in h
# the browser blocks autoplay: cinema.js is loaded only after the first tap on the start gate
h=h.replace('<script src="cinema.js"></script>','<script src="web.js"></script>')
h=h.replace('<head>','<head>\n<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#020408"><link rel="icon" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/icon-192.png">',1)
open(p,'w',encoding='utf-8').write(h)
PY
python3 - <<'PY'
from PIL import Image
im=Image.open('icon.png').convert('RGBA')
for s in (192,512): im.resize((s,s),Image.LANCZOS).save(f'web/icons/icon-{s}.png')
PY
cat > "$OUT/manifest.webmanifest" <<'J'
{"name":"VTLOdr3m3r — Operation Lightning","short_name":"VTLOdr3m3r","start_url":"./","scope":"./","display":"fullscreen","orientation":"portrait","background_color":"#020408","theme_color":"#020408",
 "icons":[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]}
J
cat > "$OUT/web.js" <<'J'
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
J
python3 - <<'PY'
import os,json
files=[]
for r,_,fs in os.walk('web'):
    for f in fs:
        if f=='sw.js': continue
        files.append(os.path.relpath(os.path.join(r,f),'web'))
files.sort()
v=str(abs(hash(tuple(files)))%10**6)
open('web/sw.js','w').write("""const C='vtlo-v%s',F=%s;
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
"""%(v,json.dumps(['./']+files)))
PY
echo "web/ built: $(find $OUT -type f | wc -l) files, $(du -sh $OUT | cut -f1)"
