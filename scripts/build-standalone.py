#!/usr/bin/env python3
"""Builds ONE self-contained HTML file (fonts, CSS, JS, icons and all audio inlined) → dist/VTLOdr3m3r.html
Download it, open it in any modern browser: no server, no Internet, no install. Requires web/ (run scripts/build-web.sh first)."""
import base64, os, re, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); W = os.path.join(root, 'web')
rd = lambda p, m='r': open(os.path.join(W, p), m, **({} if 'b' in m else {'encoding': 'utf-8'})).read()
b64 = lambda p: base64.b64encode(rd(p, 'rb')).decode()
mime = {'woff2': 'font/woff2', 'png': 'image/png', 'mp3': 'audio/mpeg'}
def uri(p): return 'data:%s;base64,%s' % (mime[p.rsplit('.', 1)[1]], b64(p))

html = rd('index.html')
# CSS (fonts inlined)
fonts = re.sub(r'url\((fonts/[^)]+)\)', lambda m: 'url(%s)' % uri(m.group(1)), rd('fonts.css'))
html = html.replace('<link rel="stylesheet" href="fonts.css">', '<style>%s</style>' % fonts)
html = html.replace('<link rel="stylesheet" href="mobile.css">', '<style>%s</style>' % rd('mobile.css'))
# head links that need files
html = re.sub(r'<link rel="manifest"[^>]*>', '', html)
html = re.sub(r'<link rel="icon" href="icons/icon-192.png">', '<link rel="icon" href="%s">' % uri('icons/icon-192.png'), html)
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>', '', html)
assert 'href="fonts.css"' not in html and 'href="mobile.css"' not in html, 'stylesheet tag not matched'
# audio bundle: path -> blob URL, transparent for `new Audio('audio/...')`
paths = ['audio/bg.mp3', 'audio/hack.mp3', 'audio/blackout.mp3'] + sorted('audio/nar/' + f for f in os.listdir(os.path.join(W, 'audio/nar')))
bundle = '{' + ','.join('"%s":"%s"' % (p, b64(p)) for p in paths) + '}'
loader = '''<script>(function(){var D=%s,B={},A=window.Audio;
function url(p){if(!D[p])return p;if(!B[p]){var s=atob(D[p]),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);B[p]=URL.createObjectURL(new Blob([u],{type:"audio/mpeg"}));}return B[p];}
window.Audio=function(src){return new A(src?url(String(src)):src);};window.Audio.prototype=A.prototype;})();</script>''' % bundle
meta = rd('audio/meta.js')
fx = rd('fx.js'); cin = rd('cinema.js')
web = rd('web.js')
web = web.replace("if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(function () {});", '')
web = web.replace('src="icons/icon-192.png"', 'src="%s"' % uri('icons/icon-192.png'))
web = web.replace("s.src = 'cinema.js'; document.body.appendChild(s);", "s.textContent = document.getElementById('cinema-src').textContent; document.body.appendChild(s);")
assert "cinema-src" in web
esc = lambda t: t.replace('</script', '<\\/script')
html = html.replace('<script src="audio/meta.js"></script>', loader + '<script>%s</script>' % esc(meta))
html = html.replace('<script src="fx.js"></script>', '<script>%s</script>' % esc(fx))
html = html.replace('<script src="web.js"></script>', '<script type="text/plain" id="cinema-src">%s</script><script>%s</script>' % (esc(cin), esc(web)))
left = re.findall(r'(?:src|href)="(?!data:|#|https?:)[^"]+"', html)
if left: print('WARNING: unresolved references:', left[:8])
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
out = os.path.join(root, 'dist', 'VTLOdr3m3r.html'); open(out, 'w', encoding='utf-8').write(html)
print('dist/VTLOdr3m3r.html', round(os.path.getsize(out) / 1e6, 1), 'MB')
