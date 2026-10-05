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
}

export function join(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
}
