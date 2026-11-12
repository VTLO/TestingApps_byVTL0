<p align="center"><img src="icon.png" width="128" alt="VTLOdr3m3r"></p>

# VTLOdr3m3r — Operation Lightning (Android)

Offline Android app presenting the report **OPERATION LIGHTNING — GNSS Interference Intelligence** (arXiv 2606.03673) as a **3-minute cinematic presentation**. `#by VTLO@xda` · PROJECT S3CR3T · Copyleft — all wrongs reserved.
All on-screen text is in English; the narration voice is French (brief radio-style summaries of what is displayed).

## Run (3:00 from app launch)
| Time | Sequence |
|---|---|
| 0:00 – 0:04 | **Real-time clock** (local time, UTC, date) + compact viewer-discretion notice and a *No-flash mode* switch |
| 0:04 – 0:10 | Original storm intro (shortened) |
| 0:10 – 3:00 | Presentation of **4 pages**: Overview, TDOA Capture, Target Profile (with the enlarged, highlighted Molniya orbit animation), Solar Comparison — 27 blocks revealed one by one with blur/deblur, puzzle, kaleidoscope, whirlpool, liquid, 3D assemble/disassemble… |
| right after the orbit animation, **or 3 taps within 8 s** | **Scenario**: unidentified forced radio transmission (30 s, reversed voices, guttural growl, abstract inharmonic waveform, maximum volume, running track "hacked") → fade to black: accelerating sirens + tornado (11 s) → back to the presentation |
| 2:53 – 3:00 | End of transmission, back to the app |

After the run **all 10 pages remain available** through the normal navigation (the floating film button replays the presentation).
The sequencer is **time-budgeted**: pace adapts continuously (taps, pause, scenario) so the run ends on time. One tap = next block; HUD: pause, next block, next page, sound, exit.

## Audio: 100 % static (no real-time synthesis)
`app/src/main/assets/www/audio/`, played by native `MediaPlayer` (3 channels: ambience, voice, loud effects):
- `bg.mp3`: 3 min AM-radio / air-control ambience (unintelligible voices, flanger, bitcrusher, distortion), −13.5 LUFS, band-split mastering
- `nar/*.mp3`: 33 clips (Piper `fr_FR-tom-medium`), slower and cleaner than before, lightly radio-processed (mild pitch glitches, band-limited, hiss); played at ×1.16; ambience ducks under the voice
- `hack.mp3` (30 s) and `blackout.mp3` (11 s): scenario, −9.6 / −11 LUFS, peak ≤ −1 dBFS
- `meta.js`: clip durations + ambience pulse envelope (for the lighting)
Generators and measurements: `tools/audio/`.

## App
No Internet permission (VIBRATE only), embedded fonts, mobile layout, tilt-reactive WebGL storm background.

## Web app (PWA)
Same presentation in any modern browser, installable and fully offline (service worker): `./scripts/build-web.sh` → `web/` (needs Python + Pillow).
A start screen asks for one tap (browsers block autoplay audio) → *Start 3-min presentation* or *Browse pages only*.
Deployed by `.github/workflows/pages.yml` to GitHub Pages (enable Settings → Pages → Source: GitHub Actions). Local test: `cd web && python3 -m http.server`.

## Build
**Gradle**: `echo "sdk.dir=/path/sdk" > local.properties && ./gradlew assembleRelease`
**Without Gradle**: `ANDROID_HOME=/path/sdk ./scripts/build-apk.sh` → `out/VTLOdr3m3r.apk` (MP3s stored uncompressed: required by `AssetFileDescriptor`).
Optional release signing: `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. CI: `.github/workflows/build.yml`.
