#!/usr/bin/env bash
# Prints the current version, or sets a new one everywhere it lives.
#
#   build/version.sh            -> 0.1.0
#   build/version.sh 0.2.0      -> sets 0.2.0
#   build/version.sh patch      -> 0.1.0 becomes 0.1.1 (also: minor, major)
#
# package.json is the source of truth. tauri.conf.json reads it directly, and the
# Android versionCode / iOS build number are derived from it, so every store upload
# needs a bump.

. "$(dirname "$0")/lib.sh"

[ $# -eq 0 ] && { version; exit 0; }

node - "$1" "$ROOT" <<'EOF'
const fs = require("fs");
const [arg, root] = process.argv.slice(2);

const pkgPath = `${root}/package.json`;
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);

const next =
  arg === "major" ? `${maj + 1}.0.0` :
  arg === "minor" ? `${maj}.${min + 1}.0` :
  arg === "patch" ? `${maj}.${min}.${pat + 1}` : arg;

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`error: "${next}" is not a plain x.y.z version`);
  process.exit(1);
}

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Only the [package] version, not dependency versions.
const cargoPath = `${root}/src-tauri/Cargo.toml`;
const cargo = fs.readFileSync(cargoPath, "utf8")
  .replace(/(\[package\][^[]*?\nversion = )"[^"]*"/, `$1"${next}"`);
fs.writeFileSync(cargoPath, cargo);

console.log(next);
EOF
