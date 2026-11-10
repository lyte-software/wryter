/**
 * The tiny slice of a filesystem the app needs. Paths are absolute and
 * always use "/" — Rust's std::fs accepts that on Windows too.
 */
export interface DirEntry {
  name: string;
  isDir: boolean;
}

export interface FS {
  /** "tauri" reads real files; "browser" is the localStorage-backed demo. */
  readonly kind: "tauri" | "browser";
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, contents: string): Promise<void>;
  readDir(path: string): Promise<DirEntry[]>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** False where the OS has no folder picker (phones, the browser demo). */
  readonly canPickFolder: boolean;
  /** Ask the user for a folder. Returns null if cancelled or unsupported. */
  pickFolder(title: string): Promise<string | null>;
  /**
   * The fixed folder projects live in when there's no picker, or null on desktop.
   * On iOS it shows in the Files app; on Android it's Android/data/<app>/files/Documents.
   */
  library(): Promise<string | null>;
  /**
   * Watch a folder (recursively) for changes made by anyone, this app included. Calls
   * `onChange` with the absolute paths touched; resolves to a function that stops watching.
   * Missing where there's no watcher.
   */
  /**
   * Save a generated file (an export). Where there's a save dialog it opens at `path`
   * and the writer picks; elsewhere the file goes straight to `path`. Resolves to where
   * it was saved, or null if the writer cancelled.
   */
  saveAs(path: string, data: Uint8Array): Promise<string | null>;
  watch?(dir: string, onChange: (paths: string[]) => void): Promise<() => void>;
}

export function join(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
}
