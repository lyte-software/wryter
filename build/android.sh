#!/usr/bin/env bash
# Android: a signed .aab for Google Play and a signed .apk for direct download.
#
#   build/android.sh             build and sign
#   build/android.sh --upload    also upload the .aab to Play (PLAY_TRACK, default internal)
#
# Runs on Linux or macOS. Needs the Android SDK + NDK and a JDK 17 or 21.

. "$(dirname "$0")/lib.sh"

UPLOAD=0
for arg in "$@"; do
  case "$arg" in
    --upload) UPLOAD=1 ;;
    *) die "unknown option $arg" ;;
  esac
done

need npm
need_env ANDROID_KEYSTORE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS
[ -f "$ANDROID_KEYSTORE" ] || die "keystore not found at $ANDROID_KEYSTORE"
export ANDROID_KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-$ANDROID_KEYSTORE_PASSWORD}"

# SDK: default install locations for Android Studio on Linux and macOS.
if [ -z "${ANDROID_HOME:-}" ]; then
  for d in "$HOME/Android/Sdk" "$HOME/Library/Android/sdk"; do
    [ -d "$d" ] && { ANDROID_HOME="$d"; break; }
  done
fi
[ -n "${ANDROID_HOME:-}" ] || die "Android SDK not found, set ANDROID_HOME"
export ANDROID_HOME

# NDK: newest one installed under the SDK.
if [ -z "${NDK_HOME:-}" ]; then
  NDK_HOME="$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1 || true)"
fi
[ -n "$NDK_HOME" ] && [ -d "$NDK_HOME" ] || die "Android NDK not found. Install it from \
Android Studio (SDK Manager > SDK Tools > NDK (Side by side)) or run:
  $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager 'ndk;28.2.13676358'"
export NDK_HOME

# Gradle lags behind new JDKs, so prefer 21 or 17 over whatever is the system default.
if [ -z "${JAVA_HOME:-}" ]; then
  for d in /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-17-openjdk /usr/lib/jvm/temurin-17-jdk \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    # Check for javac, not the folder: uninstalled packages can leave an empty one behind.
    [ -x "$d/bin/javac" ] && { JAVA_HOME="$d"; break; }
  done
fi
[ -n "${JAVA_HOME:-}" ] || die "no JDK 17 or 21 found, set JAVA_HOME"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
need jarsigner "It ships with the JDK; check JAVA_HOME"

ensure_rust_targets aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

install_deps
run_tests

cd "$ROOT"
if [ ! -d "$TAURI_DIR/gen/android" ]; then
  log "Generating the Android project (first run only)"
  npm run tauri android init -- --ci
fi

log "Building Android release (aab + apk)"
npm run tauri android build -- --aab --apk --ci

OUTPUTS="$TAURI_DIR/gen/android/app/build/outputs"
AAB="$(ls "$OUTPUTS"/bundle/*Release/*.aab 2>/dev/null | head -1 || true)"
APK="$(ls "$OUTPUTS"/apk/*/release/*.apk 2>/dev/null | head -1 || true)"
[ -n "$AAB" ] || die "no .aab produced under $OUTPUTS/bundle"

OUT="$(out_dir android)"
NAME="$(app_name)_$(version)"

log "Signing the app bundle"
cp "$AAB" "$OUT/$NAME.aab"
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore "$ANDROID_KEYSTORE" \
  -storepass "$ANDROID_KEYSTORE_PASSWORD" -keypass "$ANDROID_KEY_PASSWORD" \
  "$OUT/$NAME.aab" "$ANDROID_KEY_ALIAS" >/dev/null

if [ -f "${APK:-}" ]; then
  log "Aligning and signing the APK"
  "$BUILD_TOOLS/zipalign" -f -p 4 "$APK" "$OUT/$NAME.unsigned.apk"
  "$BUILD_TOOLS/apksigner" sign \
    --ks "$ANDROID_KEYSTORE" --ks-key-alias "$ANDROID_KEY_ALIAS" \
    --ks-pass "env:ANDROID_KEYSTORE_PASSWORD" --key-pass "env:ANDROID_KEY_PASSWORD" \
    --out "$OUT/$NAME.apk" "$OUT/$NAME.unsigned.apk"
  rm "$OUT/$NAME.unsigned.apk" "$OUT/$NAME.apk.idsig" 2>/dev/null || true
fi

log "Built into ${OUT#$ROOT/}"
ls -1 "$OUT"

if [ "$UPLOAD" = "1" ]; then
  need_env PLAY_SERVICE_ACCOUNT_JSON
  node "$BUILD_DIR/play-upload.mjs" \
    --key "$PLAY_SERVICE_ACCOUNT_JSON" \
    --package "$(identifier)" \
    --track "${PLAY_TRACK:-internal}" \
    --status "${PLAY_RELEASE_STATUS:-draft}" \
    "$OUT/$NAME.aab"
fi
