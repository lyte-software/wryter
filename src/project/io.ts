import { join, type FS } from "../fs";
import { joinFrontmatter, splitFrontmatter } from "./frontmatter";
import { PROJECT_FILE, SECTIONS, type Doc, type Project, type ProjectFile } from "./model";

export async function isProject(fs: FS, root: string): Promise<boolean> {
  return fs.exists(join(root, PROJECT_FILE));
}

export async function loadProject(fs: FS, root: string): Promise<Project> {
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
