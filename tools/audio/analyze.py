import sys, wave, numpy as np
from scipy import signal
f=sys.argv[1]
w=wave.open(f); sr=w.getframerate(); ch=w.getnchannels(); x=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,ch).astype(np.float32)/32768
print('sr',sr,'ch',ch,'dur',round(len(x)/sr,1),'s')
print('peak dBFS',round(20*np.log10(np.abs(x).max()),2),'| clipped samples (>=0.999):',int((np.abs(x)>=0.999).sum()))
print('L/R correlation',round(float(np.corrcoef(x[:,0],x[:,1])[0,1]),3))
m=x.mean(1); fr,P=signal.welch(m,sr,nperseg=4096)
def e(lo,hi): return 10*np.log10(P[(fr>=lo)&(fr<hi)].sum()+1e-20)
tot=10*np.log10(P.sum())
for lo,hi in [(20,140),(140,330),(330,3300),(3300,8000),(8000,16000)]: print(f'{lo:>5}-{hi:<5} Hz : {e(lo,hi)-tot:6.1f} dB rel')
# short-term RMS dynamics
b=sr//2; r=np.sqrt(np.convolve(m**2,np.ones(b)/b,'valid')[::b]); print('RMS dynamics (p5..p95 dB):',round(20*np.log10(np.percentile(r,5)+1e-9),1),round(20*np.log10(np.percentile(r,95)+1e-9),1))
try:
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    f2,t2,S=signal.spectrogram(m,sr,nperseg=1024,noverlap=768); plt.figure(figsize=(10,4)); plt.pcolormesh(t2,f2,10*np.log10(S+1e-12),vmin=-110,vmax=-50,shading='auto'); plt.ylim(0,9000); plt.colorbar(); plt.tight_layout(); plt.savefig(f+'.png',dpi=90); print('spectrogram saved')
except Exception as ex: print('no plot',ex)
