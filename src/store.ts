import { create } from "zustand";
import { storageKey } from "./brand";
import { fs, join } from "./fs";
import { createProject, isProject, loadProject, saveDoc, saveProjectFile, writeFiles } from "./project/io";
import { linkMentions, retargetLinks } from "./project/links";
import { cleanTitle, docId, PROJECT_FILE, sectionFor, type Doc, type DocMeta, type Kind, type Project } from "./project/model";
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
  theme: Theme;
  save: SaveState;
  error: string | null;
  quickOpen: boolean;
  recents: Recent[];
}

const SAVE_DELAY = 600;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

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
  theme: savedTheme(prefs.get<string>("theme", "light")),
  save: "saved",
  error: null,
  quickOpen: false,
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

async function writeProjectFile() {
  const p = get().project;
  if (p) await saveProjectFile(fs, p.root, p.file).catch(fail);
}

function scheduleSave(id: string) {
  clearTimeout(pending.get(id));
  set({ save: "saving" });
  pending.set(
    id,
    setTimeout(() => void flush(id), SAVE_DELAY),
  );
}

async function flush(id: string) {
  clearTimeout(pending.get(id));
  pending.delete(id);
  const { project } = get();
  const doc = project?.docs[id];
  if (!project || !doc) return;
  try {
    await saveDoc(fs, project.root, doc);
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

export const actions = {
  async openProject(root: string) {
    try {
      await flushAll();
      if (!(await isProject(fs, root))) throw new Error(`No ${PROJECT_FILE} in ${root}`);
      const project = await loadProject(fs, root);
      const first = Object.values(project.docs).find((d) => d.kind === "manuscript");
      set({ project, openId: first?.id ?? null, rev: {}, error: null, save: "saved" });
      rememberRecent(project);
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
    set({ project: null, openId: null });
  },

  forgetRecent(root: string) {
    const recents = get().recents.filter((r) => r.root !== root);
    prefs.set("recents", recents);
    set({ recents });
  },

  async openDoc(id: string) {
    const prev = get().openId;
    if (prev && prev !== id) await flush(prev);
    set({ openId: id, quickOpen: false });
  },

  updateBody(id: string, body: string) {
    const doc = get().project?.docs[id];
    // A doc may have been renamed or deleted while an editor flush was in flight.
    if (!doc || doc.body === body) return;
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
      await saveDoc(fs, project.root, doc);
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

    try {
      await fs.rename(join(project.root, id), join(project.root, newId));
    } catch (err) {
      return fail(err);
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

  setTheme(theme: Theme) {
    prefs.set("theme", theme);
    set({ theme });
  },

  setQuickOpen(quickOpen: boolean) {
    set({ quickOpen });
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => void flushAll());
}
