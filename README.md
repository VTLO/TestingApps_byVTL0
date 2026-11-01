<p align="center"><img src="icon.png" width="128" alt="VTLOdr3m3r"></p>

# VTLOdr3m3r — Operation Lightning (Android)

Offline Android app wrapping the **OPERATION LIGHTNING — GNSS Interference Intelligence** report (*Chasing Молния*, source: arXiv 2606.03673)
with a mobile layout and high-end visual effects. `#by VTLO@xda` · PROJECT S3CR3T · Copyleft — all wrongs reserved.

## Features
- Full original page: storm launch sequence, 9 sections, glitch title, charts, footer — fonts bundled, **no Internet permission**
- Mobile layout: bottom dock navigation, safe-area/cutout aware, back button → Overview → exit
- WebGL storm background (domain-warped fbm clouds, electric veins, star field) reacting to the phone tilt
- Procedural lightning bolts + touch arcs/sparks, ambient strikes, screen flash
- Section transitions: staggered reveal, scan sweep, text scramble, count-up numbers, animated bars
- Live spectrum analyzer and Kepler-accurate Molniya orbit with footprint beam on Europe
- Haptics synced with strikes (VIBRATE permission only)
- Highlighted VTLO signature in header + footer on every page

## Build
**Gradle** (Android Studio or CLI):
```bash
echo "sdk.dir=/path/to/Android/sdk" > local.properties
./gradlew assembleRelease        # → app/build/outputs/apk/release/app-release.apk
```
**Without Gradle** (JDK + SDK platform 34 / build-tools 34.0.0):
```bash
ANDROID_HOME=/path/to/sdk ./scripts/build-apk.sh   # → out/VTLOdr3m3r.apk
```
Release signing is optional: set `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` (otherwise the debug key is used).
GitHub Actions (`.github/workflows/build.yml`) builds the APK on every push; add the secrets `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` for a release signature.

## Layout
```
app/src/main/
  java/com/vtlo/lightning/MainActivity.java   WebView shell, insets, haptics, tilt feed, back handling
  assets/www/index.html                        original report (patched: local fonts, mobile viewport)
  assets/www/mobile.css                        responsive layer + FX styles
  assets/www/fx.js                             WebGL storm, bolts, transitions, live charts
  res/                                         icon, splash, theme
```
Debug the web layer in a desktop browser by opening `assets/www/index.html` (append `?nogl` to disable the WebGL background).
