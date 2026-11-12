# Génération audio (hors ligne)

```bash
pip install numpy scipy piper-tts pyloudnorm          # + ffmpeg ; voix Piper : fr_FR-tom/gilles/siwis (rhasspy/piper-voices)
python3 gen_bg.py 180 bg.wav 2027                      # ambiance 3 min (durée s, graine) → ffmpeg -c:a libmp3lame -b:a 96k
python3 synth_nar3.py                                  # 33 narration clips (text: narration3.py), clear voice + light radio link
python3 gen_scenario.py                                # hack.mp3 (30 s) + blackout.mp3 (11 s)
python3 analyze.py bg.wav                              # crête, corrélation G/D, énergie par bandes, spectrogramme
```
- **Mastering** : couches séparées par filtres Linkwitz-Riley 4 (voix 330–3300 Hz, air > 3,3 kHz, graves < 140 Hz en mono), sidechain de la voix sur les couches voisines (pas de masquage sur les mêmes fréquences), limiteur à anticipation sans écrêtage.
- **Transmission forcée** : phrases françaises synthétisées, **inversées**, abaissées, modulées en anneau (râle), saturées, écrêtées en 6 bits ; abstract waveform passes (chaotic inharmonic FM, descending dissonant cluster, wavefolder, accelerating spatial rotation — no siren / theremin timbre) ; balayage de cadran et rafales de parasites en ouverture ; montée finale puis coupure nette à 30,0 s.
- **Blackout** : sirène à balayage dont la période passe de 3,6 s à 0,8 s, klaxon deux tons de 1,6 à 5 Hz, tornade (bruit filtré tourbillonnant, grondement, sifflement, débris).
