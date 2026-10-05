# Shared helpers for the build scripts. Sourced, not run.
# Keep this bash 3.2 compatible: macOS still ships it.

set -euo pipefail

BUILD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$BUILD_DIR/.." && pwd)"
TAURI_DIR="$ROOT/src-tauri"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing '$1'. ${2:-}"
}

need_env() {
  local name
  for name in "$@"; do
    [ -n "${!name:-}" ] || die "set $name in build/.env (see build/.env.example)"
  done
}

# Secrets and machine paths live in build/.env, which is gitignored.
load_env() {
  if [ -f "$BUILD_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$BUILD_DIR/.env"
    set +a
  fi
}

version() {
  node -p "require('$ROOT/package.json').version"
}

# The app's name lives in brand.json. Use these instead of spelling it out.
app_name() {
  node -p "require('$ROOT/brand.json').name"
}

app_slug() {
  node -p "require('$ROOT/brand.json').slug"
}

identifier() {
  node -p "require('$ROOT/brand.json').identifier"
}

# build/out/<version>/<platform>
out_dir() {
  local dir="$BUILD_DIR/out/$(version)/$1"
  mkdir -p "$dir"
  echo "$dir"
}

# Copies whatever matches the globs into the output dir. Unmatched globs are skipped.
collect() {
  local dest="$1"; shift
  local f
  for f in "$@"; do
    [ -e "$f" ] || continue
    cp -R "$f" "$dest/"
    log "  $(basename "$f")"
  done
}

install_deps() {
  log "Installing npm dependencies"
  cd "$ROOT"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
}

run_tests() {
  [ "${SKIP_TESTS:-0}" = "1" ] && { warn "SKIP_TESTS=1, not running tests"; return; }
  log "Type checking and running tests"
  cd "$ROOT"
  npm run check
  npm test
}

ensure_rust_targets() {
  local installed t
  installed="$(rustup target list --installed)"
  for t in "$@"; do
    echo "$installed" | grep -qx "$t" || { log "Adding Rust target $t"; rustup target add "$t"; }
  done
}

# Uploads a .pkg (macos) or .ipa (ios) to App Store Connect with the API key.
# altool finds the key by filename, so it must be named AuthKey_<APPLE_API_KEY>.p8.
appstore_upload() {
  local type="$1" file="$2"
  need_env APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
  [ "$(basename "$APPLE_API_KEY_PATH")" = "AuthKey_$APPLE_API_KEY.p8" ] \
    || die "APPLE_API_KEY_PATH must point to a file named AuthKey_$APPLE_API_KEY.p8"
  log "Uploading $(basename "$file") to App Store Connect"
  API_PRIVATE_KEYS_DIR="$(dirname "$APPLE_API_KEY_PATH")" xcrun altool --upload-app \
    --type "$type" --file "$file" \
    --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
}

load_env
