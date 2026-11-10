#!/usr/bin/env bash
# Prints the current version, or sets a new one everywhere it lives.
#
#   build/version.sh            -> 0.1.0
#   build/version.sh 0.2.0      -> sets 0.2.0
#   build/version.sh patch      -> 0.1.0 becomes 0.1.1 (also: minor, major)
#
# VERSION is the source of truth; this writes it and runs `npm run brand`, which copies
# it into package.json (read by tauri.conf.json) and Cargo.toml. The Android versionCode
# and iOS build number come from it, so every store upload needs a bump.
#
# For a release, prefer `/tag-version major|minor|patch` in Claude Code: it does this,
# then commits and tags vX.Y.Z on master, which the GitHub build workflow picks up.

. "$(dirname "$0")/lib.sh"

[ $# -eq 0 ] && { version; exit 0; }

IFS=. read -r maj min pat <<< "$(version)"
case "$1" in
  major) next="$((maj + 1)).0.0" ;;
  minor) next="$maj.$((min + 1)).0" ;;
  patch) next="$maj.$min.$((pat + 1))" ;;
  *) next="${1#v}" ;;
esac
[[ "$next" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "\"$next\" is not a plain x.y.z version"

echo "$next" > "$ROOT/VERSION"
node "$BUILD_DIR/brand.mjs" >/dev/null
echo "$next"
