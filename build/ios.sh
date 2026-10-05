#!/usr/bin/env bash
# iOS: an App Store .ipa. Run on a Mac with Xcode.
#
#   build/ios.sh             build the .ipa
#   build/ios.sh --upload    ...and upload it to App Store Connect (lands in TestFlight)

. "$(dirname "$0")/lib.sh"

UPLOAD=0
for arg in "$@"; do
  case "$arg" in
    --upload) UPLOAD=1 ;;
    *) die "unknown option $arg" ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || die "ios.sh has to run on a Mac"
need npm
need xcodebuild "Install Xcode from the App Store, then run: sudo xcodebuild -license accept"
need_env APPLE_TEAM_ID

# Tauri signs with Xcode's automatic signing for this team. The App Store Connect API
# key, when set, lets xcodebuild create or refresh certificates and profiles itself.
export APPLE_DEVELOPMENT_TEAM="$APPLE_TEAM_ID"

ensure_rust_targets aarch64-apple-ios

install_deps
run_tests
cd "$ROOT"

if [ ! -d "$TAURI_DIR/gen/apple" ]; then
  log "Generating the Xcode project (first run only)"
  npm run tauri ios init -- --ci
fi

log "Building the App Store .ipa"
npm run tauri ios build -- --export-method app-store-connect --ci

IPA="$(ls "$TAURI_DIR"/gen/apple/build/*/*.ipa 2>/dev/null | head -1 || true)"
[ -n "$IPA" ] || die "no .ipa produced under src-tauri/gen/apple/build"

OUT="$(out_dir ios)"
cp "$IPA" "$OUT/$(app_name)_$(version).ipa"
log "Built ${OUT#$ROOT/}/$(app_name)_$(version).ipa"

[ "$UPLOAD" = "1" ] && appstore_upload ios "$OUT/$(app_name)_$(version).ipa"
true
