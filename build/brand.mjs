#!/usr/bin/env node
// Copies brand.json and VERSION into the config files that can't read them
// themselves: package.json, tauri.conf.json, Cargo.toml/Cargo.lock and index.html.
//
//   npm run brand
//
// To rename the app: add the current slug to "formerSlugs" (so existing projects
// and preferences carry over), change name/slug/identifier, then run this.
// VERSION is the one place the version lives; /tag-version and build/version.sh
// change it and then run this. src/brand.test.ts fails if anything drifts.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = JSON.parse(readFileSync(join(root, "brand.json"), "utf8"));
const version = readFileSync(join(root, "VERSION"), "utf8").trim().replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`VERSION holds "${version}", which isn't MAJOR.MINOR.PATCH`);
  process.exit(1);
}

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
  pkg.version = version; // tauri.conf.json reads the app version from here
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
edit("src-tauri/Cargo.toml", (t) =>
  t
    .replace(cargoName, `[package]\nname = "${brand.slug}"`)
    .replace(/(\[package\][^[]*?\nversion = )"[^"]*"/, `$1"${version}"`),
);
if (oldCrate) {
  edit("src-tauri/Cargo.lock", (t) =>
    t.replace(
      new RegExp(`\\[\\[package\\]\\]\\nname = "${oldCrate}"\\nversion = "[^"]*"\\n`),
      `[[package]]\nname = "${brand.slug}"\nversion = "${version}"\n`,
    ));
}

edit("index.html", (t) => t.replace(/<title>[^<]*<\/title>/, `<title>${brand.name}</title>`));
