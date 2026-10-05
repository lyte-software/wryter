#!/usr/bin/env bash
# Linux packages: .deb, .rpm and .AppImage.
# Run on Linux. Prerequisites are in the README's Linux section.

. "$(dirname "$0")/lib.sh"

[ "$(uname -s)" = "Linux" ] || die "linux.sh has to run on Linux"
need npm
need cargo "Install Rust from https://rustup.rs"

install_deps
run_tests

log "Building Linux bundles"
cd "$ROOT"
npm run tauri build -- --bundles deb,rpm,appimage

OUT="$(out_dir linux)"
log "Collecting into ${OUT#$ROOT/}"
BUNDLE="$TAURI_DIR/target/release/bundle"
collect "$OUT" "$BUNDLE"/deb/*.deb "$BUNDLE"/rpm/*.rpm "$BUNDLE"/appimage/*.AppImage
