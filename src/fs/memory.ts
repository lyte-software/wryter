import type { DirEntry, FS } from "./types";

/**
 * A flat path -> contents map, optionally persisted to localStorage. Used
 * when the app runs in a plain browser (`npm run dev`) and in tests.
 * Directories are implicit: a path is a directory if any file lives under it.
 */
export function createMemoryFS(storageKey?: string, library: string | null = null): FS {
  let files: Record<string, string> = {};
  const dirs = new Set<string>();

  if (storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      files = saved.files ?? {};
      for (const d of saved.dirs ?? []) dirs.add(d);
    } catch {
      files = {};
    }
  }

  const persist = () => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ files, dirs: [...dirs] }));
    } catch {
      // Storage full or blocked: the session keeps working in memory.
    }
  };

  const under = (dir: string) => (dir.endsWith("/") ? dir : dir + "/");
  const isDir = (path: string) =>
    dirs.has(path) || Object.keys(files).some((f) => f.startsWith(under(path)));

  return {
    kind: "browser",
    async exists(path) {
      return path in files || isDir(path);
    },
    async readText(path) {
      if (!(path in files)) throw new Error(`No such file: ${path}`);
      return files[path];
    },
    async writeText(path, contents) {
      files[path] = contents;
      persist();
    },
    async readDir(path) {
      const prefix = under(path);
      const seen = new Map<string, DirEntry>();
      for (const p of [...Object.keys(files), ...dirs]) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const [name, ...deeper] = rest.split("/");
        if (!name) continue;
        const dir = deeper.length > 0 || dirs.has(prefix + name);
        if (!seen.has(name) || dir) seen.set(name, { name, isDir: dir });
      }
      return [...seen.values()];
    },
    async mkdir(path) {
      dirs.add(path.replace(/\/$/, ""));
      persist();
    },
    async remove(path) {
      delete files[path];
      const prefix = under(path);
      for (const f of Object.keys(files)) if (f.startsWith(prefix)) delete files[f];
      for (const d of [...dirs]) if (d === path || d.startsWith(prefix)) dirs.delete(d);
      persist();
    },
    async rename(from, to) {
      if (from in files) {
        files[to] = files[from];
        delete files[from];
      } else {
        const prefix = under(from);
        for (const f of Object.keys(files)) {
          if (f.startsWith(prefix)) {
            files[under(to) + f.slice(prefix.length)] = files[f];
            delete files[f];
          }
        }
        if (dirs.delete(from)) dirs.add(to);
      }
      persist();
    },
    async saveAs(path, data) {
      // Kept as a byte string so binary files survive; the browser also downloads it.
      let bytes = "";
      for (let i = 0; i < data.length; i += 0x8000) bytes += String.fromCharCode(...data.subarray(i, i + 0x8000));
      files[path] = bytes;
      persist();
      if (typeof document !== "undefined" && typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(new Blob([data as BlobPart]));
        const a = Object.assign(document.createElement("a"), { href: url, download: path.slice(path.lastIndexOf("/") + 1) });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return path;
    },
    canPickFolder: false,
    async pickFolder() {
      return null;
    },
    async library() {
      return library;
    },
  };
}
