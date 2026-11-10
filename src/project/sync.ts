/**
 * Keeping the open project in step with files edited by other apps (Obsidian, a text
 * editor, a sync client). The store remembers the exact text it last read or wrote for
 * each file ("known"). Anything on disk that differs from that was changed elsewhere.
 */
import { join, type FS } from "../fs";
import { docFromText } from "./io";
import { PROJECT_FILE, SECTIONS, type Doc, type Project } from "./model";

/** Current file text by project-relative id; null when the file is gone. */
export type DiskState = Map<string, string | null>;

/** The project-relative id for an absolute path, or null if it isn't a file the project tracks. */
export function relativeId(root: string, path: string): string | null {
  const base = join(root).replace(/\/$/, "") + "/";
  const p = join(path);
  if (!p.startsWith(base)) return null;
  const rel = p.slice(base.length);
  if (rel === PROJECT_FILE) return rel;
  const [dir, name, ...deeper] = rel.split("/");
  if (deeper.length || !name?.toLowerCase().endsWith(".md")) return null;
  return SECTIONS.some((s) => s.dir === dir) ? rel : null;
}

export async function readDisk(fs: FS, root: string, ids: Iterable<string>): Promise<DiskState> {
  const disk: DiskState = new Map();
  for (const id of new Set(ids)) {
    try {
      const path = join(root, id);
      disk.set(id, (await fs.exists(path)) ? await fs.readText(path) : null);
    } catch {
      // Deleted between the check and the read.
      disk.set(id, null);
    }
  }
  return disk;
}

export interface Reconciled {
  /** New or updated docs, as they are on disk. */
  changed: Doc[];
  /** Docs whose files were deleted. */
  removed: string[];
  /** Docs changed on disk while they had unsaved edits: id -> disk text. */
  conflicts: Record<string, string>;
}

/**
 * Decide what to do with what's on disk. `dirty(id)` is true while a doc has edits that
 * haven't been written yet; those are never replaced, they become conflicts instead.
 */
export function reconcile(
  project: Project,
  known: ReadonlyMap<string, string>,
  disk: DiskState,
  dirty: (id: string) => boolean,
): Reconciled {
  const out: Reconciled = { changed: [], removed: [], conflicts: {} };
  for (const [id, text] of disk) {
    if (id === PROJECT_FILE) continue;
    const doc = project.docs[id];
    if (text === null) {
      // A deleted file with unsaved edits stays open; the next save writes it back.
      if (doc && !dirty(id)) out.removed.push(id);
    } else if (!doc) {
      out.changed.push(docFromText(id, text));
    } else if (text !== known.get(id)) {
      if (dirty(id)) out.conflicts[id] = text;
      else out.changed.push(docFromText(id, text));
    }
  }
  return out;
}
