# -*- coding: utf-8 -*-
"""
Scénario sonore « transmission forcée » (30 s) + « blackout : sirènes qui s'accélèrent + tornade » (11 s).
Voix françaises synthétisées puis INVERSÉES, abaissées (guttural), anneau modulé, saturées ; sirènes à effet Doppler ;
mastering par bandes (LR4) avec sidechain pour que chaque couche garde sa zone de fréquences.
"""
import io, wave, json, subprocess, numpy as np
from scipy import signal, ndimage
import pyloudnorm as pyln
from piper import PiperVoice, SynthesisConfig
from narration3 import HACK

SR = 32000
rng = np.random.default_rng(666)
def sos(kind, fc, order=4): return signal.butter(order, fc, kind, fs=SR, output='sos')
def lr4(x, fc, kind): s = signal.butter(2, fc, kind, fs=SR, output='sos'); return signal.sosfilt(s, signal.sosfilt(s, x))
def band(x, lo, hi):
    y = x
    if lo: y = lr4(y, lo, 'highpass')
    if hi: y = lr4(y, hi, 'lowpass')
    return y
def env_of(x, fc=10): return np.maximum(signal.sosfilt(sos('lowpass', fc, 2), np.abs(x)), 0)
def tanh_drive(x, d): return np.tanh(d * x) / np.tanh(d)
def crush(x, bits, rate):
    k = max(1, int(SR / rate)); xs = np.repeat(x[::k], k)[:len(x)]; q = 2 ** (bits - 1); return np.round(np.clip(xs, -1, 1) * q) / q
def limiter(x, ceil_db=-1.0, half_ms=15):
    ceil = 10 ** (ceil_db / 20); h = int(half_ms * SR / 1000)
    need = np.minimum(1.0, ceil / (np.abs(x) + 1e-12)); g = ndimage.uniform_filter1d(ndimage.minimum_filter1d(need, 2 * h + 1), 2 * h + 1); return x * g
def lufs(x_st): return pyln.Meter(SR).integrated_loudness(x_st.T.astype(np.float64))
def to_lufs(st, target, ceil=-1.0):
    for _ in range(4):
        st = st * 10 ** ((target - lufs(st)) / 20); st = np.stack([limiter(st[0], ceil), limiter(st[1], ceil)])
    return st
def tts(path, text, ls=1.6):
    v = PiperVoice.load(path); b = io.BytesIO()
    with wave.open(b, 'wb') as w: v.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=ls, noise_scale=.5, noise_w_scale=.5))
    b.seek(0); w = wave.open(b); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    g = np.gcd(SR, sr); return signal.resample_poly(x, SR // g, sr // g)
def resample_pitch(x, f):                      # f<1 : plus grave ET plus lent (comme un disque ralenti)
    n = int(len(x) / f); return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
def write_mp3(st, path, kbps=128):
    pcm = (np.clip(st.T, -1, 1) * 32767).astype('<i2'); wp = path + '.wav'
    with wave.open(wp, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wp, '-ar', str(SR), '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', '-joint_stereo', '1', path], check=True)

# ═══════════════════ 1. TRANSMISSION FORCÉE (30,0 s) ═══════════════════
D1 = 30.0; N1 = int(D1 * SR); t1 = np.arange(N1) / SR
print('voix inversées…', flush=True)
voices = {'m': 'fr_FR-gilles-low.onnx', 'f': 'fr_FR-siwis-medium.onnx', 't': 'fr_FR-tom-medium.onnx'}
starts = [3.0, 7.4, 11.2, 15.0, 19.4, 22.6, 25.4]
VOX = np.zeros(N1, dtype=np.float32); VOX2 = np.zeros(N1, dtype=np.float32)
for i, (ph, s0) in enumerate(zip(HACK, starts)):
    for key, depth, gain, off, store in (('m', .60, 1.0, 0.0, VOX), ('f', .72, .55, .55, VOX2)):
        x = tts(voices[key], ph, ls=1.35)[::-1].copy()                 # phrase inversée
        x = resample_pitch(x, depth)                                      # voix grave et lente
        tt = np.arange(len(x)) / SR
        x = x * (.55 + .45 * np.sin(2 * np.pi * (31 + 6 * i) * tt))        # râle : modulation d'anneau grave
        x = tanh_drive(x / (np.max(np.abs(x)) + 1e-9), 4.5)                # distorsion
        x = crush(x, 6, 9000); x = band(x, 90, 2300)
        a = int((s0 + off) * SR); m = min(len(x), N1 - a)
        if m > 0: store[a:a + m] += (x[:m] * gain).astype(np.float32)
VOX = VOX / (np.max(np.abs(VOX)) + 1e-9) * .9; VOX2 = VOX2 / (np.max(np.abs(VOX2)) + 1e-9) * .6
venv = ndimage.maximum_filter1d(env_of(VOX + VOX2, 12), int(.05 * SR)); venv = np.clip(venv / (np.percentile(venv, 97) + 1e-9), 0, 1)
duck = signal.sosfilt(sos('lowpass', 8, 1), venv)

print('forme d\'onde abstraite…', flush=True)
def smooth_rand(n, fc, seed):
    r = np.random.default_rng(seed); x = signal.sosfilt(sos('lowpass', fc, 2), r.standard_normal(n)); return x / (np.std(x) + 1e-9)
def fold(x, k): return np.sin(k * x)                                                  # repliement d\'onde (wavefolder)
def abstract_pass(dur, f0, seed, glide):
    """Masse inharmonique : FM chaotique à ratios irrationnels + cluster de secondes mineures en chute continue
    (Shepard–Risset) + déchirures d\'amplitude. Aucune hauteur stable, aucun timbre de sirène ni de thérémine."""
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    f = f0 * np.exp(glide * u)                                                       # glissando exponentiel
    f = f * (1 + .035 * smooth_rand(n, 9, seed))                                     # instabilité aléatoire (pas de vibrato régulier)
    ph_c = 2 * np.pi * np.cumsum(f) / SR
    idx = 2.5 + 5.5 * np.clip(.5 + .5 * smooth_rand(n, 1.7, seed + 1), 0, 1)         # indice de modulation chaotique
    m1 = np.sin(2 * np.pi * np.cumsum(f * 1.4142) / SR); m2 = np.sin(2 * np.pi * np.cumsum(f * 2.7183) / SR)
    fm = np.sin(ph_c + idx * (m1 + .6 * m2))
    cl = np.zeros(n)
    for k, ratio in enumerate((1.0, 1.0595, 1.4983, 1.5874, 2.0, 2.1189)):          # seconde mineure, triton, etc. : dissonance
        fk = f * ratio * (1 + .002 * (k - 3))
        cl += np.sin(2 * np.pi * np.cumsum(fk) / SR + k * 1.3) / (1 + .35 * k)
    w = fold(fm * .9 + cl * .55, 2.2 + 3.0 * u)                                      # repliement croissant -> spectre de plus en plus dur
    gate = np.clip(smooth_rand(n, 14, seed + 2) * 1.2 + .55, 0, 1)                   # déchirures irrégulières
    gate = .35 + .65 * gate
    ring = 1 - .55 * (.5 + .5 * np.sin(2 * np.pi * (11 + 40 * u ** 2) * t))         # tremblement AM accéléré
    env = np.minimum(1, t / .5) * np.minimum(1, (dur - t) / .5)
    w = w * gate * ring * env
    w = signal.sosfilt(sos('bandpass', [max(140, f0 * .5), min(6500, f0 * 9)], 2), w)
    return w.astype(np.float32)
SIRL = np.zeros(N1, dtype=np.float32); SIRR = np.zeros(N1, dtype=np.float32)
for k, (c, dur, f0, glide, g) in enumerate(((8.0, 7.5, 640, -.9, .75), (16.0, 7.0, 900, -1.1, .72),
                                             (23.2, 6.0, 520, -1.3, .8), (27.2, 3.0, 1200, -1.6, .85))):
    w = abstract_pass(dur, f0, 700 + k * 13, glide); a = int((c - dur / 2) * SR); a = max(0, a); m = min(len(w), N1 - a)
    tt_ = np.arange(m) / SR; rot = np.cumsum(.35 + 1.8 * (tt_ / dur) ** 2) / SR * 2 * np.pi    # rotation spatiale qui s\'accélère
    ang = (np.sin(rot) + 1) * np.pi / 4
    SIRL[a:a + m] += w[:m] * np.cos(ang) * g; SIRR[a:a + m] += np.roll(w[:m], 11 + 3 * k) * np.sin(ang) * g       # décorrélation Haas
SIRL, SIRR = band(SIRL, 200, 5500), band(SIRR, 200, 5500)

print('râle guttural + sub…', flush=True)
gr = signal.sosfilt(sos('bandpass', [140, 720], 2), rng.standard_normal(N1))
gr *= (.5 + .5 * np.sin(2 * np.pi * 7.3 * t1)) * (.6 + .4 * np.sin(2 * np.pi * 27 * t1 + 1)) * (.35 + .65 * np.clip((t1 - 2) / 14, 0, 1))
gr = band(gr, 130, 750)
SUB = np.sin(2 * np.pi * (38 + 6 * np.sin(2 * np.pi * .21 * t1)) * t1) * (.3 + .7 * np.clip((t1 - 1) / 20, 0, 1)); SUB = band(SUB, 26, 95)
stat = [band(rng.standard_normal(N1), 4200, 10500) * (.05 + .05 * np.sin(2 * np.pi * .6 * t1 + k)) for k in (0, 2)]
# intro de piratage : balayage de cadran + bégaiement de parasites
sw = np.zeros(N1); L = int(2.4 * SR); tt = np.arange(L) / SR
ph = 2 * np.pi * np.cumsum(300 * np.exp(tt / 2.4 * np.log(3800 / 300))) / SR
sw[:L] = np.sin(ph) * np.minimum(1, tt / .05) * np.exp(-tt / 1.1) * .9
for a in (0.35, 0.62, 0.78, 1.15, 1.4, 1.9):                     # parasites hachés
    m = int(.09 * SR); i0 = int(a * SR); sw[i0:i0 + m] += signal.sosfilt(sos('bandpass', [500, 5000], 2), rng.standard_normal(m)) * np.hanning(m) * 1.1
sw = band(sw, 280, 6000)
# montée finale (2,5 s) puis coupure nette à 30,0 s
riser = signal.sosfilt(sos('bandpass', [200, 6000], 2), rng.standard_normal(N1)) * np.clip((t1 - 27.0) / 3.0, 0, 1) ** 2.2 * .6
riser = band(riser, 250, 6500)

print('mixage par bandes…', flush=True)
gd = (1 - .45 * duck)            # la voix a priorité sur sirènes / râle / parasites : pas de masquage sur la même zone
L1 = (VOX * 1.0 + VOX2 * .7) + SIRL * .9 * gd + gr * .55 * (1 - .5 * duck) + SUB * .6 + stat[0] * gd + sw * .7 + riser
R1 = (VOX * 1.0 + VOX2 * .7)[::1] * 1.0 + SIRR * .9 * gd + gr * .55 * (1 - .5 * duck) + SUB * .6 + stat[1] * gd + sw * .7 + riser
# décorrélation légère (Haas 0,4 ms) des couches de voix entre G et D pour éviter l'annulation de phase en mono
R1 = np.roll(R1, 13)
fade = np.ones(N1); fade[-int(.02 * SR):] = np.linspace(1, 0, int(.02 * SR)); fade[:int(.004 * SR)] = np.linspace(0, 1, int(.004 * SR))
st1 = np.stack([L1 * fade, R1 * fade]).astype(np.float32)
st1 = np.stack([signal.sosfilt(sos('highpass', 24, 2), c) for c in st1]).astype(np.float32)
st1 = to_lufs(st1, -9.5, -1.7); write_mp3(st1, 'out3/hack.mp3', 128)
print('hack  : LUFS', round(lufs(st1), 1), 'crête', round(20 * np.log10(np.abs(st1).max()), 2), 'dBFS', flush=True)

# ═══════════════════ 2. BLACKOUT : sirènes qui s'accélèrent + tornade (11,0 s) ═══════════════════
D2 = 11.0; N2 = int(D2 * SR); t2 = np.arange(N2) / SR
print('sirènes accélérées…', flush=True)
# fréquence de balayage qui s'accélère : période 3,6 s → 0,8 s
per = 3.6 - 2.8 * (t2 / D2) ** 1.2; phase_sw = np.cumsum(1.0 / per) / SR
sweep = .5 - .5 * np.cos(2 * np.pi * phase_sw)                              # 0→1→0
f_sir = 420 + 520 * sweep
ph = 2 * np.pi * np.cumsum(f_sir) / SR
sir = (2 * ((ph / (2 * np.pi)) % 1) - 1) * .6 + np.sin(ph) * .5 + np.sin(2.01 * ph) * .18
sir = band(sir, 360, 3600)
# klaxon à deux tons dont la cadence monte de 1,6 à 5 Hz (impulsions, pas de clignotement lumineux associé)
cad = 1.6 + 3.4 * (t2 / D2) ** 1.4; gate = (np.sin(2 * np.pi * np.cumsum(cad) / SR) > 0).astype(float); gate = signal.sosfilt(sos('lowpass', 60, 2), gate)
hl = np.where(np.sin(2 * np.pi * np.cumsum(cad * .5) / SR) > 0, 640.0, 850.0)
klax = np.sign(np.sin(2 * np.pi * np.cumsum(hl) / SR)) * gate * .35; klax = band(klax, 500, 2800)
print('tornade…', flush=True)
swirl = 260 + 700 * (.5 + .5 * np.sin(2 * np.pi * (.35 + .9 * t2 / D2) * t2))                 # centre de bande qui tourbillonne
def sweep_bp(x, fc, q=2.0):
    out = np.zeros_like(x); blk = 1024
    for i in range(0, len(x), blk):
        f = float(np.clip(fc[i], 120, 6000)); s = signal.butter(2, [f * .8, f * 1.25], 'bandpass', fs=SR, output='sos')
        seg = signal.sosfilt(s, x[i:i + blk + 256])[:blk]; w = np.hanning(2 * blk)[:len(seg)] if False else 1.0; out[i:i + blk] = seg
    return out
wind = sweep_bp(rng.standard_normal(N2), swirl) * (.4 + .6 * np.clip(t2 / 5, 0, 1)) * (.7 + .3 * np.sin(2 * np.pi * 1.3 * t2))
wind = band(wind, 150, 4200)
roar = band(rng.standard_normal(N2), 40, 420) * (.5 + .5 * np.sin(2 * np.pi * 11 * t2 + 2)) * (.3 + .7 * np.clip(t2 / 6, 0, 1)); roar = band(roar, 45, 400)
whistle = np.sin(2 * np.pi * np.cumsum(1500 + 700 * np.sin(2 * np.pi * .7 * t2)) / SR) * .08 * np.clip(t2 / 4, 0, 1); whistle = band(whistle, 900, 2600)
debris = np.zeros(N2)
for a in rng.uniform(1, D2 - .3, 90):
    m = int(rng.uniform(.004, .02) * SR); i0 = int(a * SR); debris[i0:i0 + m] += rng.standard_normal(m) * np.exp(-np.arange(m) / (m / 4)) * rng.uniform(.2, .6)
debris = band(debris, 1200, 7000)
# ducking : la tornade recule sous la sirène pour ne pas s'additionner sur les mêmes fréquences
sev = np.clip(env_of(sir, 6) / (np.percentile(env_of(sir, 6), 95) + 1e-9), 0, 1)
gw = 1 - .35 * sev
pan_w = np.sin(2 * np.pi * .23 * t2)
Lb = sir * .85 + klax * .8 + wind * .95 * gw + roar * .9 * gw + whistle + debris * .5
Rb = np.roll(sir, 11) * .85 + np.roll(klax, 7) * .8 + np.roll(wind, 29) * .95 * gw + roar * .9 * gw + np.roll(whistle, 5) + np.roll(debris, 23) * .5
Lb *= (1 + .25 * pan_w); Rb *= (1 - .25 * pan_w)
fd = np.ones(N2); fd[:int(.02 * SR)] = np.linspace(0, 1, int(.02 * SR)); fd[-int(2.0 * SR):] = np.linspace(1, 0, int(2.0 * SR)) ** 1.5
st2 = np.stack([Lb * fd, Rb * fd]).astype(np.float32); st2 = np.stack([signal.sosfilt(sos('highpass', 26, 2), c) for c in st2]).astype(np.float32)
st2 = to_lufs(st2, -11.0, -1.7); write_mp3(st2, 'out3/blackout.mp3', 128)
print('blackout : LUFS', round(lufs(st2), 1), 'crête', round(20 * np.log10(np.abs(st2).max()), 2), 'dBFS', flush=True)
json.dump({'hack': D1, 'blackout': D2}, open('out3/scenario.json', 'w'))
