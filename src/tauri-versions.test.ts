import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import lock from "../src-tauri/Cargo.lock?raw";

/**
 * `tauri build` refuses to run when a Tauri npm package and its Rust crate are on
 * different major.minor releases. There's no npm lockfile, so CI installs the newest
 * version the package.json range allows; the ranges are pinned with `~` to stay on the
 * crate's minor. To upgrade, `cargo update -p <crate>` and move the `~` range with it.
 */
const PAIRS: Record<string, string> = {
  "@tauri-apps/api": "tauri",
  "@tauri-apps/plugin-fs": "tauri-plugin-fs",
  "@tauri-apps/plugin-dialog": "tauri-plugin-dialog",
};

const minor = (v: string) => v.split(".").slice(0, 2).join(".");
const crateVersion = (name: string) => new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"`).exec(lock)?.[1];

describe("Tauri npm packages and Rust crates", () => {
  for (const [npm, crate] of Object.entries(PAIRS)) {
    it(`${npm} matches ${crate}`, () => {
      const range = (pkg.dependencies as Record<string, string>)[npm];
      expect(range, `${npm} should be pinned with ~ so CI can't drift past the crate`).toMatch(/^~\d+\.\d+\.\d+$/);
      const version = crateVersion(crate);
      expect(version, `${crate} isn't in Cargo.lock`).toBeDefined();
      expect(minor(range.slice(1))).toBe(minor(version!));
    });
  }
});
