import * as fs from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { documentDir } from "@tauri-apps/api/path";
import { isMobile } from "./platform";
import { join, type FS } from "./types";

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
  // The dialog plugin has no folder picker on Android or iOS.
  canPickFolder: !isMobile,
  async pickFolder(title) {
    if (isMobile) return null;
    const picked = await open({ directory: true, multiple: false, title });
    return typeof picked === "string" ? picked : null;
  },
  async library() {
    if (!isMobile) return null;
    // Already app-specific on both platforms; Files shows it under the app's name in "On My iPhone".
    const dir = join(await documentDir());
    await fs.mkdir(dir, { recursive: true });
    return dir;
  },
};
