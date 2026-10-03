import * as fs from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import type { FS } from "./types";

export const tauriFS: FS = {
  kind: "tauri",
  exists: (path) => fs.exists(path),
  readText: (path) => fs.readTextFile(path),
  writeText: (path, contents) => fs.writeTextFile(path, contents),
  async readDir(path) {
    const entries = await fs.readDir(path);
    return entries.map((e) => ({ name: e.name, isDir: e.isDirectory }));
  },
  mkdir: (path) => fs.mkdir(path, { recursive: true }),
  remove: (path) => fs.remove(path, { recursive: true }),
  rename: (from, to) => fs.rename(from, to),
  async pickFolder(title) {
    const picked = await open({ directory: true, multiple: false, title });
    return typeof picked === "string" ? picked : null;
  },
};
