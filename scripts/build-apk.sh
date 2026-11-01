#!/bin/bash
# Gradle-free build (aapt2 + javac + d8 + apksigner). Needs: JDK 17+, Android SDK with platform 34 + build-tools 34.0.0.
# Usage: ANDROID_HOME=/path/to/sdk ./scripts/build-apk.sh   → out/VTLOdr3m3r.apk (signed with a local debug-style key)
set -euo pipefail
SDK=${ANDROID_HOME:?set ANDROID_HOME}; BT=$SDK/build-tools/34.0.0; AJ=$SDK/platforms/android-34/android.jar
ROOT=$(cd "$(dirname "$0")/.." && pwd); M=$ROOT/app/src/main; B=$ROOT/out/tmp
rm -rf "$B"; mkdir -p "$B/classes" "$B/dex"
cd "$M"
# manifest without Gradle: inject package name
sed 's#<manifest #<manifest package="com.vtlo.lightning" #' AndroidManifest.xml > "$B/AndroidManifest.xml"
$BT/aapt2 compile --dir res -o "$B/compiled.zip"
$BT/aapt2 link -o "$B/base.apk" -I "$AJ" --manifest "$B/AndroidManifest.xml" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0.0 -A assets "$B/compiled.zip"
javac -parameters -source 8 -target 8 -Xlint:-options -bootclasspath "$AJ" -d "$B/classes" java/com/vtlo/lightning/MainActivity.java
$BT/d8 --lib "$AJ" --min-api 24 --output "$B/dex" $(find "$B/classes" -name '*.class')
(cd "$B/dex" && zip -q -j "$B/base.apk" classes.dex)
$BT/zipalign -p -f 4 "$B/base.apk" "$B/aligned.apk"
KS=$ROOT/out/debug.jks
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -alias dev -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=dev"
$BT/apksigner sign --ks "$KS" --ks-pass pass:android --out "$ROOT/out/VTLOdr3m3r.apk" "$B/aligned.apk"
echo "OK → $ROOT/out/VTLOdr3m3r.apk"
