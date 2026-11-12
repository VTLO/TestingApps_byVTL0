# -*- coding: utf-8 -*-
"""
Piste d'ambiance statique : radio AM / contrôle aérien, voix inintelligibles (formants synthétiques),
flanger + bitcrusher + distorsion, souffle porteuse, craquements, battements graves.
Mastering par bandes (Linkwitz-Riley 4) : chaque couche occupe sa propre zone du spectre ;
sidechain de la voix sur les couches voisines ; limiteur à anticipation ; boucle sans couture.
usage: gen_bg.py <durée_s> <sortie.wav> [graine]
"""
import sys, json, numpy as np
from scipy import signal, ndimage

SR = 32000
DUR = float(sys.argv[1]); OUT = sys.argv[2]; SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 2026
LOOP_X = 2.0                                    # secondes de fondu enchaîné pour la boucle
N = int((DUR + LOOP_X) * SR)
rng = np.random.default_rng(SEED)

def sos(kind, fc, order=4): return signal.butter(order, fc, kind, fs=SR, output='sos')
CH = SR * 90
def sf(s_, x):
    """sosfilt par blocs (état conservé) : sortie float32, pic mémoire borné."""
    out = np.empty(len(x), dtype=np.float32); zi = np.zeros((s_.shape[0], 2))
    for i in range(0, len(x), CH):
        y, zi = signal.sosfilt(s_, x[i:i + CH].astype(np.float64), zi=zi); out[i:i + CH] = y
    return out
def lr4(x, fc, kind):
    s = signal.butter(2, fc, kind, fs=SR, output='sos'); return sf(s, sf(s, x))
def band(x, lo, hi):                            # bande LR4 (passe-haut lo puis passe-bas hi)
    y = x
    if lo: y = lr4(y, lo, 'highpass')
    if hi: y = lr4(y, hi, 'lowpass')
    return y
def smooth_env(x, fc=25): return np.maximum(sf(sos('lowpass', fc, 2), np.abs(x)), 0)

# ═════════ 1. VOIX « BABIL » (formants) ═════════
VOW = [(730, 1090, 2440), (300, 2200, 2900), (280, 2250, 2900), (500, 870, 2400), (320, 800, 2300), (530, 1840, 2480), (380, 1400, 2300),
       (290, 1650, 2200), (650, 1000, 2450), (450, 800, 2300), (600, 1250, 2500)]
BW = (70, 90, 130)
def formant_bp(f, bw):
    lo = max(60, f - bw / 2); hi = min(SR / 2 - 200, f + bw / 2); return signal.butter(2, [lo, hi], 'bandpass', fs=SR, output='sos')

def babble(dur, male, r):
    n = int(dur * SR); out = np.zeros(n + SR // 4, dtype=np.float32)
    f0b = r.uniform(88, 135) if male else r.uniform(175, 235); fsc = r.uniform(.92, 1.0) if male else r.uniform(1.12, 1.22)
    pos = 0; tempo = r.uniform(.8, 1.25)
    while pos < n:
        if r.random() < .16: pos += int(r.uniform(.08, .30) * SR); continue          # micro-pause
        L = int(r.uniform(.085, .21) / tempo * SR); f0 = f0b * (1 + r.normal(0, .08)) * (1 - .10 * pos / n)
        f0c = f0 * (1 + r.uniform(-.14, .14) * np.linspace(-1, 1, L))
        s = (np.cumsum(f0c) / SR) % 1.0
        g = np.where(s < .62, np.sin(np.pi * s / .62) ** 2, 0.0); src = np.diff(g, prepend=0) * 14
        src += r.standard_normal(L) * .05
        F = VOW[r.integers(len(VOW))]; seg = np.zeros(L)
        for i, (f, a) in enumerate(zip(F, (1.0, .62, .34))):
            seg += a * signal.sosfilt(formant_bp(f * fsc, BW[i] * (1 + .4 * r.random())), src)
        env = np.hanning(L) ** .55; seg *= env
        if r.random() < .5:                                                            # consonne fricative / occlusive
            cl = int(r.uniform(.012, .05) * SR); ns = signal.sosfilt(sos('bandpass', [r.uniform(2200, 3200), r.uniform(4500, 7000)], 2), r.standard_normal(cl)) * np.hanning(cl)
            seg[:cl] += ns * r.uniform(.4, 1.2) * np.std(seg)
        if pos + L > len(out): break
        out[pos:pos + L] += seg.astype(np.float32); pos += int(L * .9)
    out = out[:n]; out /= (np.sqrt(np.mean(out ** 2)) + 1e-9); return out * .12

def flanger(x, rate, base_ms, depth_ms, fb, mix, r):
    n = len(x); t = np.arange(n) / SR
    d = (base_ms + depth_ms * (.5 + .5 * np.sin(2 * np.pi * rate * t + r.uniform(0, 6.28)))) * 1e-3 * SR
    idx = np.arange(n) - d; i0 = np.floor(idx).astype(np.int64); fr = (idx - i0).astype(np.float32)
    ok = i0 >= 0; i0c = np.clip(i0, 0, n - 1); i1c = np.clip(i0 + 1, 0, n - 1)
    def dly(s): return np.where(ok, s[i0c] * (1 - fr) + s[i1c] * fr, 0).astype(np.float32)
    y1 = dly(x); y2 = dly(y1); y3 = dly(y2)
    return (x * (1 - .35 * mix) + mix * (y1 + fb * y2 + fb * fb * y3)).astype(np.float32)

def bitcrush(x, bits, rate_hz):
    k = max(1, int(round(SR / rate_hz))); xs = np.repeat(x[::k], k)[:len(x)]
    q = 2 ** (bits - 1); return (np.round(np.clip(xs, -1, 1) * q) / q).astype(np.float32)

def am_chain(x, r):
    lo = r.uniform(320, 520); hi = r.uniform(2300, 3100)
    y = signal.sosfilt(sos('highpass', lo, 3), x); y = signal.sosfilt(sos('lowpass', hi, 4), y)
    y = y / (np.percentile(np.abs(y), 99.5) + 1e-9)
    drive = r.uniform(3, 9); bias = r.uniform(.05, .35)
    y = np.tanh(drive * (y + bias * .2)) - np.tanh(drive * bias * .2); y /= (np.max(np.abs(y)) + 1e-9)    # distorsion asymétrique
    if r.random() < .55: y = np.clip(y * r.uniform(1.4, 2.4), -.7, .7) / .7                                   # écrêtage dur
    y = bitcrush(y, int(r.integers(4, 8)), r.uniform(5200, 9500))                                              # bitcrusher
    y = flanger(y, r.uniform(.07, .5), r.uniform(.4, 1.6), r.uniform(1.5, 5.5), r.uniform(.35, .6), r.uniform(.55, 1.0), r)
    t = np.arange(len(y)) / SR                                                                                  # AM : fading rapide
    y *= (1 - .45 * r.random() * (.5 + .5 * np.sin(2 * np.pi * r.uniform(.4, 3.0) * t + r.uniform(0, 6.28))))
    y += .06 * np.sin(2 * np.pi * (r.uniform(900, 1900) + 120 * np.sin(2 * np.pi * r.uniform(.1, .4) * t)) * t) * (r.random() < .4)  # sifflet hétérodyne
    y = signal.sosfilt(sos('highpass', 300, 2), y); y = signal.sosfilt(sos('lowpass', 3300, 3), y)
    return y.astype(np.float32)

def transmission(r):
    dur = r.uniform(1.1, 6.8); male = r.random() < .72
    x = babble(dur, male, r); y = am_chain(x, r)
    y /= (np.max(np.abs(y)) + 1e-9)
    # clic de manipulateur + queue de squelch + bip occasionnel
    key = np.zeros(int(.03 * SR), dtype=np.float32); key[:8] = [.5, -.7, .6, -.4, .3, -.2, .1, -.05]
    tl = int(r.uniform(.08, .22) * SR); tt = np.arange(tl) / SR
    tail = (signal.sosfilt(sos('bandpass', [500, 3000], 2), r.standard_normal(tl)) * np.exp(-tt / .045) * .55).astype(np.float32)
    parts = [key, np.zeros(int(.03 * SR), dtype=np.float32), y, tail]
    if r.random() < .22:
        bl = int(.11 * SR); bt = np.arange(bl) / SR; f = r.choice([1100, 1400, 1700])
        parts.append((np.sin(2 * np.pi * f * bt) * np.hanning(bl) * .22).astype(np.float32))
    return np.concatenate(parts)

def place(buf_l, buf_r, x, start, pan, gain):
    a = (pan + 1) * np.pi / 4; gl, gr = np.cos(a) * gain, np.sin(a) * gain
    delay = 0 if abs(pan) < .15 else int(abs(pan) * 14)                 # Haas ≤ 0,5 ms : élargissement sans interférence en peigne
    end = min(len(buf_l), start + len(x)); m = end - start
    if m <= 0: return
    dl = delay if pan > 0 else 0; dr = delay if pan < 0 else 0
    e1 = min(len(buf_l), start + dl + m); buf_l[start + dl:e1] += x[:e1 - start - dl] * gl
    e2 = min(len(buf_r), start + dr + m); buf_r[start + dr:e2] += x[:e2 - start - dr] * gr

print('voix…', flush=True)
VL = np.zeros(N, dtype=np.float32); VR = np.zeros(N, dtype=np.float32)
for ch, pan0 in enumerate((-.72, .62, 0.0)):
    r = np.random.default_rng(SEED * 10 + ch); t = r.uniform(0, 4)
    while t < DUR + LOOP_X:
        x = transmission(r); g = 10 ** (r.uniform(-6, 0) / 20) * (1 if ch < 2 else .55)
        place(VL, VR, x, int(t * SR), np.clip(pan0 + r.normal(0, .12), -1, 1), g)
        t += len(x) / SR + r.lognormal(np.log(2.0 if ch < 2 else 6.0), .6)
print('couche voix prête', flush=True)
VL = band(VL, 330, 3300); VR = band(VR, 330, 3300)                         # bande « voix » strictement 330–3300 Hz

# ═════════ 2. SOUFFLE / CRAQUEMENTS (zone haute + creux discret dans le médium) ═════════
def qsb(n, r, f=.07):
    e = sf(sos('lowpass', f, 2), r.standard_normal(n // 64 + 1).repeat(64)[:n].astype(np.float32)); e = e / (np.std(e) + 1e-9); return np.clip(.65 + .3 * e, .15, 1.2).astype(np.float32)
def crackle(n, r):
    imp = np.zeros(n, dtype=np.float32); k = int(DUR * 5.5); pos = r.integers(0, n, k)
    imp[pos] = r.choice([-1, 1], k) * r.lognormal(-1.8, .8, k)
    for c in r.integers(0, n, int(DUR / 40) + 1):                                                  # rafales d'orage (sferics)
        m = r.integers(20, 70); p = np.clip(c + (r.random(m) * .35 * SR).astype(int), 0, n - 1); imp[p] += r.choice([-1, 1], m) * r.lognormal(-1.4, .6, m)
    return sf(sos('bandpass', [1800, 9000], 2), imp)
H = []
for ch in range(2):
    r = np.random.default_rng(SEED * 31 + ch); w = r.standard_normal(N, dtype=np.float32)
    mid = band(w, 330, 3300) * .10 * qsb(N, r); air = lr4(w, 3300, 'highpass') * .11 * qsb(N, r, .11)
    H.append(mid + air + crackle(N, r) * .26)
HL, HR = H

# ═════════ 3. GRAVES (< 140 Hz) : pouls sub + bourdon qui respire — mono pour rester cohérent en phase ═════════
S = np.empty(N, dtype=np.float32)
for i in range(0, N, SR * 60):
    t = (np.arange(i, min(N, i + SR * 60), dtype=np.float64)) / SR
    d = (np.sin(2 * np.pi * 55 * t) * .5 + np.sin(2 * np.pi * 82.41 * t + 1.1) * .22 + np.sin(2 * np.pi * 110.0 * t + .4) * .10)
    d *= (.55 + .45 * np.sin(2 * np.pi * .13 * t))                              # oscillation lente
    S[i:i + len(t)] = d * .16
period = 4.8; tp = 2.0
while tp < DUR + LOOP_X:
    for dt, a in ((0, .9), (.30, .42)):
        i0 = int((tp + dt) * SR); L = int(.85 * SR)
        if i0 + L < N:
            tt = np.arange(L) / SR; f = 78 * np.exp(-tt * 1.5) + 34
            ph = 2 * np.pi * np.cumsum(f) / SR; S[i0:i0 + L] += (np.sin(ph) * np.exp(-tt / .24) * np.minimum(1, tt / .006) * a * .55).astype(np.float32)
    tp += period * rng.uniform(.9, 1.1)
S = band(S, 28, 140)

# ═════════ 4. SIDECHAIN + MIX PAR BANDES ═════════
vmono = .5 * (VL + VR); venv = smooth_env(vmono, 12); venv = ndimage.maximum_filter1d(venv, int(.04 * SR)); venv = venv / (np.percentile(venv, 98) + 1e-9)
duck = sf(sos('lowpass', 7, 1), np.clip(venv, 0, 1))          # attaque ~20 ms / relâchement ~120 ms
gH = 1 - .38 * duck; gS = 1 - .50 * duck
L = VL * 1.0 + HL * gH + S * gS * 1.0
R = VR * 1.0 + HR * gH + S * gS * 1.0
L = sf(sos('lowpass', 12500, 4), sf(sos('highpass', 26, 2), L)); R = sf(sos('lowpass', 12500, 4), sf(sos('highpass', 26, 2), R))   # coupe-continu + borne haute

# ═════════ 5. BOUCLE SANS COUTURE ═════════
Xn = int(LOOP_X * SR); M = N - Xn
w_in = np.sin(np.linspace(0, np.pi / 2, Xn)) ** 1; w_out = np.cos(np.linspace(0, np.pi / 2, Xn))
def loopify(x):
    y = x[:M].copy(); y[:Xn] = x[:Xn] * w_in + x[M:M + Xn] * w_out; return y
L = loopify(L); R = loopify(R)

# ═════════ 6. LIMITEUR À ANTICIPATION + NORMALISATION ═════════
def limiter(x, ceil_db=-1.2, half_ms=18):
    """Limiteur sans écrêtage : gain = moyenne glissante du minimum glissant (garantit g <= plafond/|x| partout)."""
    ceil = 10 ** (ceil_db / 20); h = int(half_ms * SR / 1000)
    need = np.minimum(1.0, ceil / (np.abs(x) + 1e-12)).astype(np.float32)
    g = ndimage.uniform_filter1d(ndimage.minimum_filter1d(need, 2 * h + 1), 2 * h + 1)
    return (x * g).astype(np.float32)
stereo = np.stack([L, R]).astype(np.float32)
# gain cible : RMS global ≈ -24 dBFS (mesure LUFS affinée après coup avec ffmpeg)
rms = np.sqrt(np.mean(stereo ** 2)); stereo *= 10 ** (-17.0 / 20) / (rms + 1e-12)
stereo = np.stack([limiter(stereo[0]), limiter(stereo[1])])
peak = np.max(np.abs(stereo)); print('pic', round(20 * np.log10(peak), 2), 'dBFS  rms', round(20 * np.log10(np.sqrt(np.mean(stereo ** 2))), 2), flush=True)

# ═════════ 7. ÉCRITURE + enveloppe de pulsation (20 Hz) pour la synchro visuelle ═════════
import wave
pcm = (np.clip(stereo, -1, 1).T * 32767).astype('<i2')
with wave.open(OUT, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
low = S[:M]; venv2 = smooth_env(vmono[:M], 10)
def to20(x): k = SR // 20; m = len(x) // k; return x[:m * k].reshape(m, k).mean(1)
e = .7 * to20(np.abs(low)) / (np.percentile(to20(np.abs(low)), 99) + 1e-9) + .3 * to20(venv2) / (np.percentile(to20(venv2), 99) + 1e-9)
e = np.clip(e, 0, 1.2) / 1.2; np.save(OUT + '.env.npy', (e * 255).astype(np.uint8))
print('ok', OUT, round(len(pcm) / SR, 1), 's', flush=True)
