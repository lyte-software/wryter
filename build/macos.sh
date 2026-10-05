#!/usr/bin/env bash
# macOS, as a universal binary (Apple Silicon + Intel). Run on a Mac.
#
#   build/macos.sh                  both of the below
#   build/macos.sh --dmg            notarized .dmg for direct download (Developer ID)
#   build/macos.sh --appstore       sandboxed .pkg for the Mac App Store
#   build/macos.sh --appstore --upload   ...and upload it to App Store Connect

. "$(dirname "$0")/lib.sh"

DMG=0 APPSTORE=0 UPLOAD=0
for arg in "$@"; do
  case "$arg" in
    --dmg) DMG=1 ;;
    --appstore) APPSTORE=1 ;;
    --upload) UPLOAD=1 ;;
    *) die "unknown option $arg" ;;
  esac
done
[ "$DMG$APPSTORE" = "00" ] && DMG=1 APPSTORE=1

[ "$(uname -s)" = "Darwin" ] || die "macos.sh has to run on a Mac"
need npm
need xcrun "Run: xcode-select --install"
need_env APPLE_TEAM_ID

TARGET=universal-apple-darwin
BUNDLE="$TAURI_DIR/target/$TARGET/release/bundle"
ensure_rust_targets aarch64-apple-darwin x86_64-apple-darwin

install_deps
run_tests
cd "$ROOT"

if [ "$DMG" = "1" ]; then
  need_env APPLE_DEVELOPER_ID_IDENTITY APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
  log "Building the notarized .dmg"
  # With APPLE_API_* set, Tauri notarizes and staples after signing.
  APPLE_SIGNING_IDENTITY="$APPLE_DEVELOPER_ID_IDENTITY" \
    npm run tauri build -- --target "$TARGET" --bundles app,dmg

  OUT="$(out_dir macos)"
  log "Collecting into ${OUT#$ROOT/}"
  collect "$OUT" "$BUNDLE"/dmg/*.dmg
fi

if [ "$APPSTORE" = "1" ]; then
  need_env MAS_APP_IDENTITY MAS_INSTALLER_IDENTITY MAS_PROVISION_PROFILE
  [ -f "$MAS_PROVISION_PROFILE" ] || die "provisioning profile not found at $MAS_PROVISION_PROFILE"

  # The App Store build needs the sandbox and a provisioning profile, which the direct
  # download doesn't. Both are generated here and layered on with --config so
  # tauri.conf.json stays the plain desktop config.
  GEN="$BUILD_DIR/out/.appstore"
  mkdir -p "$GEN"
  cat >"$GEN/entitlements.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key><true/>
  <key>com.apple.security.files.user-selected.read-write</key><true/>
  <key>com.apple.security.files.bookmarks.app-scope</key><true/>
  <key>com.apple.application-identifier</key><string>$APPLE_TEAM_ID.$(identifier)</string>
  <key>com.apple.developer.team-identifier</key><string>$APPLE_TEAM_ID</string>
</dict>
</plist>
EOF
  cat >"$GEN/tauri.appstore.conf.json" <<EOF
{
  "bundle": {
    "macOS": {
      "entitlements": "$GEN/entitlements.plist",
      "files": { "embedded.provisionprofile": "$MAS_PROVISION_PROFILE" }
    }
  }
}
EOF

  log "Building the Mac App Store .app"
  # Unset the API key vars so Tauri doesn't try to notarize; the store does its own review.
  env -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
    APPLE_SIGNING_IDENTITY="$MAS_APP_IDENTITY" \
    npm run tauri build -- --target "$TARGET" --bundles app --config "$GEN/tauri.appstore.conf.json"

  OUT="$(out_dir macos)"
  PKG="$OUT/$(app_name)_$(version)_appstore.pkg"
  log "Packaging $(basename "$PKG")"
  xcrun productbuild --sign "$MAS_INSTALLER_IDENTITY" \
    --component "$BUNDLE/macos/$(app_name).app" /Applications "$PKG"

  [ "$UPLOAD" = "1" ] && appstore_upload macos "$PKG"
fi

log "Done"
ls -1 "$(out_dir macos)"
