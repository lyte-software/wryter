#!/usr/bin/env node
// Copies brand.json into the config files that can't read it themselves:
// package.json, tauri.conf.json, Cargo.toml/Cargo.lock and index.html.
//
//   npm run brand
//
// To rename the app: add the current slug to "formerSlugs" (so existing projects
// and preferences carry over), change name/slug/identifier, then run this.
// src/brand.test.ts fails if anything drifts out of sync.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = JSON.parse(readFileSync(join(root, "brand.json"), "utf8"));

function edit(path, fn) {
  const file = join(root, path);
  if (!existsSync(file)) return;
  const before = readFileSync(file, "utf8");
  const after = fn(before);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`updated ${path}`);
  }
}

const json = (fn) => (text) => {
  const data = JSON.parse(text);
  fn(data);
  return JSON.stringify(data, null, 2) + "\n";
};

edit("package.json", json((pkg) => {
  pkg.name = brand.slug;
}));

// Targeted replacements rather than a JSON rewrite, to keep the hand formatting.
edit("src-tauri/tauri.conf.json", (t) =>
  t
    .replace(/("productName": )"[^"]*"/, `$1"${brand.name}"`)
    .replace(/("identifier": )"[^"]*"/, `$1"${brand.identifier}"`)
    .replace(/("title": )"[^"]*"/g, `$1"${brand.name}"`),
);

// Only the [package] name, not dependency names. The lock file lists this crate
// under the same name; rename that entry too so cargo doesn't have to.
const cargoName = /\[package\]\nname = "([^"]*)"/;
const oldCrate = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8").match(cargoName)?.[1];
edit("src-tauri/Cargo.toml", (t) => t.replace(cargoName, `[package]\nname = "${brand.slug}"`));
if (oldCrate) {
  edit("src-tauri/Cargo.lock", (t) =>
    t.replace(`[[package]]\nname = "${oldCrate}"\n`, `[[package]]\nname = "${brand.slug}"\n`));
}

edit("index.html", (t) => t.replace(/<title>[^<]*<\/title>/, `<title>${brand.name}</title>`));
