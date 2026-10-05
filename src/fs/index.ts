import { storageKey } from "../brand";
import { createMemoryFS } from "./memory";
import { isTauri } from "./platform";
import { tauriFS } from "./tauri";
import type { FS } from "./types";

export { isMobile, isTauri } from "./platform";

export const fs: FS = isTauri ? tauriFS : createMemoryFS(storageKey("browser-fs"), "/browser");

export { join } from "./types";
export type { FS, DirEntry } from "./types";
