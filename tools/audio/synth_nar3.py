import wave, io, json, subprocess, numpy as np
from scipy import signal
import pyloudnorm as pyln
from piper import PiperVoice, SynthesisConfig
from narration3 import NAR
SR=24000
v=PiperVoice.load('fr_FR-tom-medium.onnx')
cfg=SynthesisConfig(length_scale=0.98,noise_scale=0.33,noise_w_scale=0.35)      # débit rapide, intonation plate : annonce militaire
meter=pyln.Meter(SR); TARGET_LUFS=-12.5; CEIL=10**(-1.0/20)
def sos(kind,fc,order=4): return signal.butter(order,fc,kind,fs=SR,output='sos')
def trim(x,th=0.012):
    idx=np.where(np.abs(x)>th)[0]
    return x[max(0,idx[0]-int(.01*SR)):idx[-1]+int(.03*SR)] if len(idx) else x
def synth(text):
    text=text.rstrip('.').replace('. ',', ')
    b=io.BytesIO()
    with wave.open(b,'wb') as w: v.synthesize_wav(text,w,syn_config=cfg)
    b.seek(0); w=wave.open(b); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
    g=np.gcd(SR,sr); return trim(signal.resample_poly(x,SR//g,sr//g).astype(np.float32))
def peaking(x,f0,gain_db,q):
    A=10**(gain_db/40); w0=2*np.pi*f0/SR; al=np.sin(w0)/(2*q); c=np.cos(w0)
    return signal.lfilter([1+al*A,-2*c,1-al*A],[1+al/A,-2*c,1-al/A],x)
def xfade_edges(n,f=int(.006*SR)):
    w=np.ones(n,dtype=np.float32); f=min(f,n//2); w[:f]=np.linspace(0,1,f); w[-f:]=np.linspace(1,0,f); return w
def pitch_seg(x,a,L,f):
    src=x[a:a+int(L*f)]
    if len(src)<16 or a+L>len(x): return x
    seg=np.interp(np.linspace(0,len(src)-1,L),np.arange(len(src)),src).astype(np.float32); w=xfade_edges(L)
    out=x.copy(); out[a:a+L]=x[a:a+L]*(1-w)+seg*w; return out
def glitches(x,r):
    n=len(x); k=(1 if r.random()<.6 else 0) if n>1.5*SR else (1 if r.random()<.25 else 0)
    for _ in range(k):
        t=r.choice(['down','up'])
        L=int(r.uniform(.05,.09)*SR); a=int(r.uniform(.08,max(.09,n/SR-.3))*SR)
        if a+L*2>=n: continue
        if t=='down': x=pitch_seg(x,a,L,r.uniform(.78,.9))
        elif t=='up': x=pitch_seg(x,a,L,r.uniform(1.12,1.25))
        elif t=='stutter':
            sl=x[a:a+int(r.uniform(.03,.07)*SR)].copy(); rep=np.tile(sl,r.integers(2,5)); m=min(len(rep),n-a); x[a:a+m]=rep[:m]
        elif t=='drop':
            m=int(r.uniform(.03,.075)*SR); x[a:a+m]*=0; x[a:a+m]+=r.standard_normal(m).astype(np.float32)*.05
        else:
            m=int(r.uniform(.06,.12)*SR); s=x[a:a+m]; hold=8; s=np.repeat(s[::hold],hold)[:m]; q=2**3; x[a:a+m]=np.round(s*q)/q
    return x
def interference(y,r):
    n=len(y); t=np.arange(n)/SR
    if r.random()<.15:                                  # sifflet hétérodyne (battement de porteuses)
        a=int(r.uniform(0,max(.01,n/SR-.5))*SR); m=int(r.uniform(.15,.5)*SR); m=min(m,n-a)
        f=np.cumsum(r.uniform(900,2400)+r.uniform(-500,500)*np.linspace(0,1,m))/SR
        y[a:a+m]+=np.sin(2*np.pi*f)*np.hanning(m)*r.uniform(.03,.07)
    for _ in range(r.integers(0,2)):                    # rafales de parasites
        a=int(r.uniform(0,max(.01,n/SR-.2))*SR); m=min(int(r.uniform(.04,.16)*SR),n-a)
        b=signal.sosfilt(sos('bandpass',[r.uniform(300,900),r.uniform(2500,3500)],2),r.standard_normal(m))
        y[a:a+m]+=b*np.hanning(m)*r.uniform(.03,.07)
    y*=(1-.04*(.5+.5*np.sin(2*np.pi*r.uniform(5,11)*t+r.uniform(0,6.28))))      # scintillement AM
    return y
def process(x,seed):
    r=np.random.default_rng(seed)
    x=signal.sosfilt(sos('highpass',220),x); x=signal.sosfilt(sos('lowpass',3800),x)
    x=peaking(x,1800,4,.9); x=peaking(x,450,-2.5,.8)
    env=np.maximum(signal.sosfilt(sos('lowpass',18,2),np.abs(x)),2e-3); x=x*np.clip((0.12/env)**0.55,0.4,6.0)
    x=np.tanh(1.25*x/max(1e-3,np.percentile(np.abs(x),99.5)))/np.tanh(1.25)
    x=glitches(x.astype(np.float32),r)
    q=2**11; x=np.round(x*q)/q; x=signal.sosfilt(sos('lowpass',3900),x)
    x=x/(np.sqrt(np.mean(x**2))+1e-9)*10**(-19/20)
    head=int(.07*SR); tail=int(.15*SR); nn=len(x); y=np.zeros(head+nn+tail,dtype=np.float32); y[head:head+nn]=x
    y[int(.012*SR):int(.012*SR)+6]=[.4,-.55,.45,-.3,.2,-.1]
    hiss=signal.sosfilt(sos('bandpass',[400,3300],2),r.standard_normal(len(y)).astype(np.float32))
    y+=hiss*0.010*(0.5+np.minimum(1,np.linspace(0,1,len(y))*0+1))
    sq=int(.11*SR); tt=np.arange(sq)/SR; y[head+nn:head+nn+sq]+=signal.sosfilt(sos('bandpass',[600,3000],2),r.standard_normal(sq))*np.exp(-tt/.035)*.18
    y=interference(y,r)
    return y.astype(np.float32)
def master(y):
    for _ in range(3):
        l=meter.integrated_loudness(y.astype(np.float64)) if len(y)>int(.5*SR) else -25
        y=y*10**((TARGET_LUFS-l)/20)
        y=CEIL*np.tanh(y/CEIL)
    y[:32]*=np.linspace(0,1,32); y[-64:]*=np.linspace(1,0,64)
    return y.astype(np.float32)
durs={}
for k,(i,t) in enumerate(NAR.items()):
    y=master(process(synth(t),k+101))
    wp=f'wav3/{i}.wav'
    with wave.open(wp,'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y,-1,1)*32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wp,'-ar',str(SR),'-ac','1','-codec:a','libmp3lame','-b:a','64k',f'out3/nar/{i}.mp3'],check=True)
    durs[i]=round(len(y)/SR,2)
json.dump(durs,open('out3/durations.json','w'),indent=1)
vs=[d for k,d in durs.items() if '-' in k and not k.startswith('c')]
print('clips',len(durs),'units',len(vs),'sum units',round(sum(vs),1),'s mean',round(sum(vs)/len(vs),2),'max',max(vs),'| chapters',round(sum(d for k,d in durs.items() if k.startswith('c') and k[1:].isdigit()),1),'| intro',durs['intro'],'outro',durs['outro'])
