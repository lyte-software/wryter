#!/usr/bin/env bash
# Windows installer (.exe, NSIS) cross-compiled from Linux or macOS.
#
# Tauri calls cross-compiling for Windows experimental, and it can only make the NSIS
# installer (MSI needs Windows). The result is unsigned, so SmartScreen will warn
# people until it's signed. See build/README.md.
#
# One-time setup on Fedora:
#   sudo dnf install mingw32-nsis lld llvm
#   cargo install --locked cargo-xwin

. "$(dirname "$0")/lib.sh"

TARGET=x86_64-pc-windows-msvc

need npm
need makensis "Install NSIS (Fedora: sudo dnf install mingw32-nsis, macOS: brew install nsis)"
need lld "Install LLVM's linker (Fedora: sudo dnf install lld, macOS: brew install llvm)"
need llvm-rc "Install LLVM (Fedora: sudo dnf install llvm, macOS: brew install llvm)"
need cargo-xwin "Run: cargo install --locked cargo-xwin"
ensure_rust_targets "$TARGET"

install_deps
run_tests

log "Cross-compiling the Windows installer"
cd "$ROOT"
npm run tauri build -- --runner cargo-xwin --target "$TARGET" --bundles nsis

OUT="$(out_dir windows)"
log "Collecting into ${OUT#$ROOT/}"
collect "$OUT" "$TAURI_DIR/target/$TARGET/release/bundle"/nsis/*.exe
