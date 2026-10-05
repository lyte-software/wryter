import { join, type FS } from "../fs";
import { joinFrontmatter, splitFrontmatter } from "./frontmatter";
import { FORMER_PROJECT_FILES, PROJECT_FILE, SECTIONS, type Doc, type Project, type ProjectFile } from "./model";

/** The project file `root` actually has: the current name, or one from before a rename. */
async function projectFileIn(fs: FS, root: string): Promise<string | null> {
  for (const name of [PROJECT_FILE, ...FORMER_PROJECT_FILES]) {
    if (await fs.exists(join(root, name))) return name;
  }
  return null;
}

export async function isProject(fs: FS, root: string): Promise<boolean> {
  return (await projectFileIn(fs, root)) !== null;
}

/** Projects directly inside `dir`, sorted by title. Folders without a project file are skipped. */
export async function listProjects(fs: FS, dir: string): Promise<{ root: string; title: string }[]> {
  if (!(await fs.exists(dir))) return [];
  const found: { root: string; title: string }[] = [];
  for (const entry of await fs.readDir(dir)) {
    const root = join(dir, entry.name);
    if (!entry.isDir || !(await isProject(fs, root))) continue;
    let title = entry.name;
    try {
      const name = (await projectFileIn(fs, root)) ?? PROJECT_FILE;
      title = (JSON.parse(await fs.readText(join(root, name))) as ProjectFile).title || title;
    } catch {
      // A damaged project file still lists under its folder name; opening it reports the error.
    }
    found.push({ root, title });
  }
  return found.sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadProject(fs: FS, root: string): Promise<Project> {
  // Opening a project saved under a former app name renames its project file.
  const found = await projectFileIn(fs, root);
  if (found && found !== PROJECT_FILE) await fs.rename(join(root, found), join(root, PROJECT_FILE));
  const file = JSON.parse(await fs.readText(join(root, PROJECT_FILE))) as ProjectFile;
  file.order ??= {};
  const docs: Record<string, Doc> = {};

  for (const section of SECTIONS) {
    const dir = join(root, section.dir);
    if (!(await fs.exists(dir))) continue;
    for (const entry of await fs.readDir(dir)) {
      if (entry.isDir || !entry.name.toLowerCase().endsWith(".md")) continue;
      const id = `${section.dir}/${entry.name}`;
      const { meta, body } = splitFrontmatter(await fs.readText(join(root, id)));
      docs[id] = { id, kind: section.kind, title: entry.name.slice(0, -3), meta, body };
    }
  }
  return { root, file, docs };
}

export async function createProject(fs: FS, root: string, title: string): Promise<void> {
  await fs.mkdir(root);
  for (const s of SECTIONS) await fs.mkdir(join(root, s.dir));
  const file: ProjectFile = { version: 1, title, order: { Manuscript: ["Chapter 1"] } };
  await saveProjectFile(fs, root, file);
  await fs.writeText(join(root, "Manuscript", "Chapter 1.md"), "");
}

export async function saveProjectFile(fs: FS, root: string, file: ProjectFile): Promise<void> {
  await fs.writeText(join(root, PROJECT_FILE), JSON.stringify(file, null, 2) + "\n");
}

export async function saveDoc(fs: FS, root: string, doc: Doc): Promise<void> {
  await fs.writeText(join(root, doc.id), joinFrontmatter(doc.meta, doc.body));
}

/** Write a set of files into `root` (used for the bundled sample project). */
export async function writeFiles(fs: FS, root: string, files: Record<string, string>): Promise<void> {
  for (const s of SECTIONS) await fs.mkdir(join(root, s.dir));
  for (const [path, contents] of Object.entries(files)) await fs.writeText(join(root, path), contents);
}
