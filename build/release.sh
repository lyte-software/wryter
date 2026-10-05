#!/usr/bin/env bash
# Builds every platform this machine can build, or the ones you name.
#
#   build/release.sh                       Linux: linux, windows, android   Mac: macos, ios
#   build/release.sh android ios           just these
#   build/release.sh --upload              also push to Google Play / App Store Connect
#
# Output lands in build/out/<version>/<platform>/.

. "$(dirname "$0")/lib.sh"

UPLOAD=""
PLATFORMS=""
for arg in "$@"; do
  case "$arg" in
    --upload) UPLOAD="--upload" ;;
    linux|windows|android|macos|ios) PLATFORMS="$PLATFORMS $arg" ;;
    *) die "unknown option $arg" ;;
  esac
done

if [ -z "$PLATFORMS" ]; then
  case "$(uname -s)" in
    Linux) PLATFORMS="linux windows android" ;;
    Darwin) PLATFORMS="macos ios" ;;
    *) die "no default platforms for $(uname -s), name them explicitly" ;;
  esac
fi

cd "$ROOT"
[ -z "$(git status --porcelain)" ] || warn "working tree has uncommitted changes"
log "Releasing $(version) for:$PLATFORMS"

install_deps
run_tests
export SKIP_TESTS=1

for p in $PLATFORMS; do
  log "---- $p ----"
  case "$p" in
    linux|windows) "$BUILD_DIR/$p.sh" ;;
    *) "$BUILD_DIR/$p.sh" $UPLOAD ;;
  esac
done

log "All done. Output is in build/out/$(version)/"
