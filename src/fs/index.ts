import { createMemoryFS } from "./memory";
import { tauriFS } from "./tauri";
import type { FS } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const fs: FS = isTauri ? tauriFS : createMemoryFS("authorbox:browser-fs");

export { join } from "./types";
export type { FS, DirEntry } from "./types";
