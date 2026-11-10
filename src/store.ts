import { create } from "zustand";
import { storageKey } from "./brand";
import { fs, join } from "./fs";
import { createProject, docFromText, docText, isProject, listDocIds, loadProject, projectFileText, writeFiles } from "./project/io";
import { linkMentions, retargetLinks } from "./project/links";
import { readDisk, reconcile, relativeId } from "./project/sync";
import { compile } from "./export/compile";
import { localDate, manuscriptWords, rollToday } from "./project/goals";
import {
  cleanTitle,
  docId,
  PROJECT_FILE,
  sectionFor,
  type Doc,
  type DocMeta,
  type ExportSettings,
  type Goals,
  type Kind,
  type Project,
  type ProjectFile,
} from "./project/model";
import { SAMPLE_FILES, SAMPLE_TITLE } from "./sample";

export const THEMES = [
  { id: "light", label: "Light" },
  { id: "sepia", label: "Sepia" },
  { id: "dark", label: "Dark" },
  { id: "programmer", label: "Programmer" },
] as const;
export type Theme = (typeof THEMES)[number]["id"];

/** Earlier builds called Light "paper" and Dark "night". */
function savedTheme(saved: string): Theme {
  const id = saved === "paper" ? "light" : saved === "night" ? "dark" : saved;
  return THEMES.find((t) => t.id === id)?.id ?? "light";
}
export type SaveState = "saved" | "saving" | "error";

export interface Find {
  query: string;
  /** Show the replace row too. */
  replace: boolean;
  /** Which match to start on (from a project search result). */
  start: number;
  /** Bumped on every open, so asking again refocuses the bar. */
  seq: number;
}

interface Recent {
  root: string;
  title: string;
}

interface State {
  project: Project | null;
  openId: string | null;
  /** Bumped when a doc changes outside the editor, so the editor reloads it. */
  rev: Record<string, number>;
  focus: boolean;
  /** Show links as their `[[Name|Text]]` source instead of highlighted names. */
  raw: boolean;
  theme: Theme;
  save: SaveState;
  error: string | null;
  /** Docs changed on disk by another app while they had unsaved edits: id -> the disk text. */
  conflicts: Record<string, string>;
  quickOpen: boolean;
  exportOpen: boolean;
  /** The centre column: the open doc, or the manuscript outline. */
  view: "doc" | "outline";
  /** The find bar in the open doc; null when closed. */
  find: Find | null;
  recents: Recent[];
}

const SAVE_DELAY = 600;
const pending = new Map<string, ReturnType<typeof setTimeout>>();
/**
 * The exact text last read from or written to each file, by id (the project file under
 * PROJECT_FILE). A file on disk that differs from this was changed by another app.
 */
const known = new Map<string, string>();
/** Writes per id, and the ids being written right now, so a sync can ignore files mid-write. */
const writeSeq = new Map<string, number>();
const writing = new Set<string>();
let unwatch: (() => void) | null = null;

const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(storageKey(key));
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(value));
    } catch {
      // Preferences are a convenience; ignore blocked storage.
    }
  },
};

export const useStore = create<State>(() => ({
  project: null,
  openId: null,
  rev: {},
  focus: false,
  raw: prefs.get<boolean>("raw", false),
  theme: savedTheme(prefs.get<string>("theme", "light")),
  save: "saved",
  error: null,
  conflicts: {},
  quickOpen: false,
  exportOpen: false,
  view: "doc",
  find: null,
  recents: prefs.get<Recent[]>("recents", []),
}));

const get = useStore.getState;
const set = useStore.setState;

function fail(err: unknown) {
  console.error(err);
  set({ save: "error", error: err instanceof Error ? err.message : String(err) });
}

function rememberRecent(project: Project) {
  const recents = [
    { root: project.root, title: project.file.title },
    ...get().recents.filter((r) => r.root !== project.root),
  ].slice(0, 8);
  prefs.set("recents", recents);
  set({ recents });
}

function patchDocs(update: (docs: Record<string, Doc>) => void) {
  const project = get().project;
  if (!project) return;
  const docs = { ...project.docs };
  update(docs);
  set({ project: { ...project, docs } });
}

/** Write a file and remember its text, so the watcher knows the change was ours. */
async function writeKnown(root: string, id: string, text: string) {
  const before = known.get(id);
  known.set(id, text);
  writeSeq.set(id, (writeSeq.get(id) ?? 0) + 1);
  writing.add(id);
  try {
    await fs.writeText(join(root, id), text);
  } catch (err) {
    if (before === undefined) known.delete(id);
    else known.set(id, before);
    throw err;
  } finally {
    writing.delete(id);
  }
}

async function writeProjectFile() {
  const p = get().project;
  if (p) await writeKnown(p.root, PROJECT_FILE, projectFileText(p.file)).catch(fail);
}

/** Start a new "words today" baseline the first time the project is used each day. */
function rollIfNewDay() {
  const p = get().project;
  if (!p || p.file.today?.date === localDate()) return;
  const today = rollToday(p.file, manuscriptWords(p));
  if (!today) return;
  set({ project: { ...p, file: { ...p.file, today } } });
  void writeProjectFile();
}

const isConflicted = (id: string) => id in get().conflicts;

function setConflicts(conflicts: Record<string, string>) {
  set({ conflicts, save: pending.size ? "saving" : "saved" });
}

function scheduleSave(id: string) {
  clearTimeout(pending.get(id));
  // Hold saves until the writer picks a version; the edits stay in memory meanwhile.
  if (isConflicted(id)) return;
  set({ save: "saving" });
  pending.set(
    id,
    setTimeout(() => void flush(id), SAVE_DELAY),
  );
}

// One save per doc at a time, so a save never mistakes our own half-finished write for an outside edit.
const flushing = new Map<string, Promise<void>>();

function flush(id: string): Promise<void> {
  clearTimeout(pending.get(id));
  pending.delete(id);
  const next = (flushing.get(id) ?? Promise.resolve()).then(() => writeDoc(id));
  flushing.set(id, next);
  void next.finally(() => flushing.get(id) === next && flushing.delete(id));
  return next;
}

async function writeDoc(id: string) {
  const { project } = get();
  const doc = project?.docs[id];
  if (!project || !doc || isConflicted(id)) return;
  try {
    // Never overwrite a file another app changed since we last read or wrote it.
    const path = join(project.root, id);
    const onDisk = (await fs.exists(path)) ? await fs.readText(path) : null;
    if (onDisk !== null && known.has(id) && onDisk !== known.get(id)) {
      setConflicts({ ...get().conflicts, [id]: onDisk });
      return;
    }
    await writeKnown(project.root, id, docText(doc));
    if (pending.size === 0) set({ save: "saved", error: null });
  } catch (err) {
    fail(err);
  }
}

export const flushAll = () => Promise.all([...pending.keys()].map(flush));

function uniqueTitle(project: Project, kind: Kind, wanted: string): string {
  const base = cleanTitle(wanted) || sectionFor(kind).singular;
  const taken = (t: string) =>
    Object.values(project.docs).some((d) => d.kind === kind && d.title.toLowerCase() === t.toLowerCase());
  if (!taken(base)) return base;
  let n = 2;
  while (taken(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

const bump = (ids: string[]) => {
  const rev = { ...get().rev };
  for (const id of ids) rev[id] = (rev[id] ?? 0) + 1;
  set({ rev });
};

/**
 * Pick up changes other apps made to the project's files. `paths` (absolute, from the
 * watcher) limits the check to those files; without it the whole project is rescanned.
 */
async function syncFromDisk(paths?: string[]) {
  const project = get().project;
  if (!project) return;
  const { root } = project;
  let ids: string[];
  if (paths) {
    ids = paths.map((p) => relativeId(root, p)).filter((id): id is string => id !== null);
    if (!ids.length) return;
  } else {
    ids = [PROJECT_FILE, ...(await listDocIds(fs, root)), ...Object.keys(project.docs)];
  }
  const seq = new Map(ids.map((id) => [id, writeSeq.get(id) ?? 0]));
  const disk = await readDisk(fs, root, ids);

  const current = get().project;
  if (current?.root !== root) return; // closed or switched while reading
  // We wrote some of these while reading; what we read may be half old. Our write's own
  // watcher event will bring them back for another look.
  for (const id of disk.keys()) {
    if (writing.has(id) || (writeSeq.get(id) ?? 0) !== seq.get(id)) disk.delete(id);
  }

  const fileText = disk.get(PROJECT_FILE);
  let file = current.file;
  if (fileText && fileText !== known.get(PROJECT_FILE)) {
    try {
      file = { ...(JSON.parse(fileText) as ProjectFile) };
      file.order ??= {};
      known.set(PROJECT_FILE, fileText);
    } catch {
      // Half-written or hand-broken: keep what we have; a later change will fix it.
    }
  }

  const { changed, removed, conflicts } = reconcile(current, known, disk, (id) => pending.has(id) || isConflicted(id));
  if (file === current.file && !changed.length && !removed.length && !Object.keys(conflicts).length) return;

  const docs = { ...current.docs };
  for (const doc of changed) {
    docs[doc.id] = doc;
    known.set(doc.id, disk.get(doc.id)!);
  }
  for (const id of removed) {
    delete docs[id];
    known.delete(id);
  }
  const openId = get().openId;
  set({
    project: { ...current, file, docs },
    openId: openId && removed.includes(openId) ? null : openId,
  });
  bump(changed.map((d) => d.id));
  if (Object.keys(conflicts).length) setConflicts({ ...get().conflicts, ...conflicts });
}

// Watcher events and window focus can overlap; run one sync at a time.
let syncing: Promise<void> = Promise.resolve();
const sync = (paths?: string[]) => (syncing = syncing.then(() => syncFromDisk(paths)).catch(fail));

function stopWatching() {
  unwatch?.();
  unwatch = null;
}

async function startWatching(root: string) {
  stopWatching();
  try {
    // No watcher (browser demo, or a platform without one): window focus still syncs.
    const stop = (await fs.watch?.(root, (paths) => void sync(paths))) ?? null;
    if (get().project?.root === root) unwatch = stop;
    else stop?.();
  } catch (err) {
    console.warn("Not watching the project folder for outside changes:", err);
  }
}

export const actions = {
  async openProject(root: string) {
    try {
      await flushAll();
      if (!(await isProject(fs, root))) throw new Error(`No ${PROJECT_FILE} in ${root}`);
      const texts = new Map<string, string>();
      const project = await loadProject(fs, root, texts);
      const first = Object.values(project.docs).find((d) => d.kind === "manuscript");
      known.clear();
      for (const [id, text] of texts) known.set(id, text);
      set({ project, openId: first?.id ?? null, rev: {}, conflicts: {}, find: null, view: "doc", error: null, save: "saved" });
      rememberRecent(project);
      rollIfNewDay();
      await startWatching(root);
    } catch (err) {
      fail(err);
    }
  },

  async newProject(parent: string, title: string) {
    const name = cleanTitle(title) || "Untitled Project";
    const root = join(parent, name);
    try {
      if (await fs.exists(root)) throw new Error(`A folder named "${name}" already exists there.`);
      await createProject(fs, root, name);
      await actions.openProject(root);
    } catch (err) {
      fail(err);
    }
  },

  async openSample(parent: string) {
    const root = join(parent, SAMPLE_TITLE);
    if (!(await fs.exists(root))) await writeFiles(fs, root, SAMPLE_FILES);
    await actions.openProject(root);
  },

  async closeProject() {
    await flushAll();
    stopWatching();
    known.clear();
    set({ project: null, openId: null, conflicts: {}, find: null, view: "doc" });
  },

  /** Check the project folder for changes made by other apps. */
  syncFromDisk: (paths?: string[]) => sync(paths),

  /** Settle a doc that changed on disk while it had unsaved edits. */
  async resolveConflict(id: string, keep: "mine" | "disk") {
    const project = get().project;
    const diskText = get().conflicts[id];
    if (!project || diskText === undefined) return;
    const { [id]: _, ...rest } = get().conflicts;
    if (keep === "mine") {
      // Accept that the disk version was seen, then write ours over it.
      known.set(id, diskText);
      setConflicts(rest);
      await flush(id);
    } else {
      clearTimeout(pending.get(id));
      pending.delete(id);
      known.set(id, diskText);
      patchDocs((docs) => (docs[id] = docFromText(id, diskText)));
      setConflicts(rest);
      bump([id]);
    }
  },

  forgetRecent(root: string) {
    const recents = get().recents.filter((r) => r.root !== root);
    prefs.set("recents", recents);
    set({ recents });
  },

  async openDoc(id: string) {
    const prev = get().openId;
    if (prev && prev !== id) await flush(prev);
    set({ openId: id, quickOpen: false, view: "doc", find: prev === id ? get().find : null });
  },

  /** Open (or refocus) the find bar in the open doc. Keeps the current query unless given one. */
  openFind(opts: { query?: string; replace?: boolean; start?: number } = {}) {
    const find = get().find;
    set({
      find: {
        query: opts.query ?? find?.query ?? "",
        replace: opts.replace ?? find?.replace ?? false,
        start: opts.start ?? 0,
        seq: (find?.seq ?? 0) + 1,
      },
    });
  },

  setFindQuery(query: string) {
    const find = get().find;
    if (find) set({ find: { ...find, query, start: 0 } });
  },

  closeFind() {
    set({ find: null });
  },

  /** Open a project search result: the doc, with its matches highlighted from match `start`. */
  async openSearchResult(id: string, query: string, start = 0) {
    await actions.openDoc(id);
    actions.openFind({ query, start });
  },

  updateBody(id: string, body: string) {
    const doc = get().project?.docs[id];
    // A doc may have been renamed or deleted while an editor flush was in flight.
    if (!doc || doc.body === body) return;
    // Before the edit, so a day's first words count toward that day.
    if (doc.kind === "manuscript") rollIfNewDay();
    patchDocs((docs) => (docs[id] = { ...docs[id], body }));
    scheduleSave(id);
  },

  updateMeta(id: string, meta: Partial<DocMeta>) {
    patchDocs((docs) => (docs[id] = { ...docs[id], meta: { ...docs[id].meta, ...meta } }));
    scheduleSave(id);
  },

  async createDoc(kind: Kind, title: string, open = true): Promise<Doc | null> {
    const project = get().project;
    if (!project) return null;
    const doc: Doc = { id: "", kind, title: uniqueTitle(project, kind, title), meta: {}, body: "" };
    doc.id = docId(kind, doc.title);
    const dir = sectionFor(kind).dir;
    const order = [...(project.file.order[dir] ?? []), doc.title];
    set({ project: { ...project, file: { ...project.file, order: { ...project.file.order, [dir]: order } } } });
    patchDocs((docs) => (docs[doc.id] = doc));
    try {
      await fs.mkdir(join(project.root, dir));
      await writeKnown(project.root, doc.id, docText(doc));
      await writeProjectFile();
    } catch (err) {
      fail(err);
    }
    if (open) await actions.openDoc(doc.id);
    return doc;
  },

  /** Rename a doc's file and rewrite every link that pointed at it. */
  async renameDoc(id: string, wanted: string) {
    const project = get().project;
    const doc = project?.docs[id];
    if (!project || !doc) return;
    const cleaned = cleanTitle(wanted);
    if (!cleaned || cleaned === doc.title) return;
    const title = cleaned.toLowerCase() === doc.title.toLowerCase() ? cleaned : uniqueTitle(project, doc.kind, cleaned);
    const newId = docId(doc.kind, title);
    await flushAll();

    const text = known.get(id);
    if (text !== undefined) known.set(newId, text);
    known.delete(id);
    try {
      await fs.rename(join(project.root, id), join(project.root, newId));
    } catch (err) {
      known.delete(newId);
      if (text !== undefined) known.set(id, text);
      return fail(err);
    }
    if (isConflicted(id)) {
      const { [id]: diskText, ...rest } = get().conflicts;
      setConflicts({ ...rest, [newId]: diskText });
    }

    const changed: string[] = [];
    patchDocs((docs) => {
      delete docs[id];
      docs[newId] = { ...doc, id: newId, title };
      for (const d of Object.values(docs)) {
        const body = retargetLinks(d.body, doc.title, title);
        if (body !== d.body) {
          docs[d.id] = { ...d, body };
          changed.push(d.id);
        }
      }
    });
    const dir = sectionFor(doc.kind).dir;
    const p = get().project!;
    const order = (p.file.order[dir] ?? []).map((t) => (t === doc.title ? title : t));
    set({
      project: { ...p, file: { ...p.file, order: { ...p.file.order, [dir]: order } } },
      openId: get().openId === id ? newId : get().openId,
    });
    bump(changed);
    await writeProjectFile();
    await Promise.all(changed.map(flush));
  },

  async deleteDoc(id: string) {
    const project = get().project;
    const doc = project?.docs[id];
    if (!project || !doc) return;
    clearTimeout(pending.get(id));
    pending.delete(id);
    try {
      await fs.remove(join(project.root, id));
    } catch (err) {
      return fail(err);
    }
    known.delete(id);
    if (isConflicted(id)) {
      const { [id]: _, ...rest } = get().conflicts;
      setConflicts(rest);
    }
    patchDocs((docs) => delete docs[id]);
    const p = get().project!;
    const dir = sectionFor(doc.kind).dir;
    const order = (p.file.order[dir] ?? []).filter((t) => t !== doc.title);
    set({
      project: { ...p, file: { ...p.file, order: { ...p.file.order, [dir]: order } } },
      openId: get().openId === id ? null : get().openId,
    });
    await writeProjectFile();
  },

  async reorder(kind: Kind, titles: string[]) {
    const p = get().project;
    if (!p) return;
    const dir = sectionFor(kind).dir;
    set({ project: { ...p, file: { ...p.file, order: { ...p.file.order, [dir]: titles } } } });
    await writeProjectFile();
  },

  /** Turn plain-text mentions of an entity in `sourceId` into links. */
  async linkMentionsIn(sourceId: string, entityId: string) {
    const p = get().project;
    const source = p?.docs[sourceId];
    const entity = p?.docs[entityId];
    if (!source || !entity) return;
    const body = linkMentions(source.body, entity);
    if (body === source.body) return;
    patchDocs((docs) => (docs[sourceId] = { ...source, body }));
    bump([sourceId]);
    await flush(sourceId);
  },

  setFocus(focus: boolean) {
    set({ focus });
  },

  setRaw(raw: boolean) {
    prefs.set("raw", raw);
    set({ raw });
  },

  setTheme(theme: Theme) {
    prefs.set("theme", theme);
    set({ theme });
  },

  setQuickOpen(quickOpen: boolean) {
    set({ quickOpen });
  },

  async setGoals(goals: Goals) {
    const p = get().project;
    if (!p) return;
    const clean: Goals = {};
    if (goals.daily) clean.daily = goals.daily;
    if (goals.total) clean.total = goals.total;
    set({ project: { ...p, file: { ...p.file, goals: Object.keys(clean).length ? clean : undefined } } });
    await writeProjectFile();
  },

  /** Show the manuscript outline, or go back to the open doc. */
  async setView(view: "doc" | "outline") {
    const openId = get().openId;
    if (view === "outline" && openId) await flush(openId);
    set({ view, find: null, quickOpen: false });
  },

  setExportOpen(exportOpen: boolean) {
    set({ exportOpen });
  },

  /**
   * Compile the manuscript and save it. The file goes next to the project folder (or,
   * without a save dialog, into an Exports folder beside the projects, never inside one).
   * Resolves to where it was saved, or null if cancelled; throws if saving failed.
   */
  async exportManuscript(settings: ExportSettings): Promise<string | null> {
    await flushAll();
    const p = get().project;
    if (!p) return null;
    if (JSON.stringify(p.file.export) !== JSON.stringify(settings)) {
      set({ project: { ...p, file: { ...p.file, export: settings } } });
      await writeProjectFile();
    }
    const { name, data } = compile(get().project!, settings);
    const parent = p.root.replace(/\/[^/]+\/?$/, "") || "/";
    return fs.saveAs(fs.canPickFolder ? join(parent, name) : join(parent, "Exports", name), data);
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => void flushAll());
  // Coming back from another app is when outside edits are most likely, and the only
  // check on platforms without a folder watcher.
  window.addEventListener("focus", () => void (get().project && sync()));
  // Left open past midnight: start the new day's count.
  setInterval(rollIfNewDay, 60_000);
  document.addEventListener("visibilitychange", () => void (document.visibilityState === "visible" && get().project && sync()));
}
