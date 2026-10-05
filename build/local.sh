#!/usr/bin/env bash
# Builds the app for this machine and installs it into ~/Applications/<name>,
# replacing whatever version was there. Safe to run while the app is open; the new
# version starts next launch.
#
#   build/local.sh                  test, build, install
#   SKIP_TESTS=1 build/local.sh     skip the tests
#
# Linux: installs the binary plus an app-menu launcher.
# macOS: installs <name>.app.

. "$(dirname "$0")/lib.sh"

NAME="$(app_name)"
SLUG="$(app_slug)"
DEST="${INSTALL_DIR:-$HOME/Applications/$NAME}"

need npm
need cargo "Install Rust from https://rustup.rs"

install_deps
run_tests
cd "$ROOT"
mkdir -p "$DEST"

case "$(uname -s)" in
  Linux)
    log "Building $(version) for this machine"
    # No installer packages needed, just the binary. It uses the system's WebKitGTK,
    # which is already here since it builds.
    npm run tauri build -- --no-bundle

    # Write beside the old binary, then rename over it. A plain cp fails with
    # "Text file busy" when the app is running.
    cp "$TAURI_DIR/target/release/$SLUG" "$DEST/.$SLUG.new"
    mv -f "$DEST/.$SLUG.new" "$DEST/$SLUG"
    cp "$TAURI_DIR/icons/128x128@2x.png" "$DEST/$SLUG.png"

    LAUNCHER="$HOME/.local/share/applications/$SLUG.desktop"
    mkdir -p "$(dirname "$LAUNCHER")"
    cat >"$LAUNCHER" <<EOF
[Desktop Entry]
Type=Application
Name=$NAME
Comment=A focused writing app with linked characters, places and items
Exec="$DEST/$SLUG"
Icon=$DEST/$SLUG.png
Categories=Office;WordProcessor;
Terminal=false
EOF
    command -v update-desktop-database >/dev/null && update-desktop-database -q "$(dirname "$LAUNCHER")" || true
    log "Installed $(version) to $DEST/$SLUG (also in your app menu)"
    ;;

  Darwin)
    log "Building $(version) for this Mac"
    npm run tauri build -- --bundles app
    rm -rf "$DEST/$NAME.app"
    cp -R "$TAURI_DIR/target/release/bundle/macos/$NAME.app" "$DEST/"
    log "Installed $(version) to $DEST/$NAME.app"
    ;;

  *) die "local.sh supports Linux and macOS" ;;
esac
