/**
 * On-disk format of a project. The project file is `<slug>.json`, slug from brand.json:
 *
 *   My Novel/
 *     wryter.json         project title + binder order
 *     Manuscript/*.md     chapters / scenes
 *     Characters/*.md     linkable entities ...
 *     Locations/*.md
 *     Items/*.md
 *     Notes/*.md
 *
 * Each document is Markdown with optional YAML frontmatter. A document's
 * title IS its filename, so `[[Mara Venn]]` links to Characters/Mara Venn.md
 * (case-insensitive), or to any document listing "Mara Venn" in `aliases`.
 */
import { APP_SLUG, FORMER_SLUGS } from "../brand";

export type Kind = "manuscript" | "character" | "location" | "item" | "note";

export interface Section {
  kind: Kind;
  dir: string;
  label: string;
  singular: string;
}

export const SECTIONS: Section[] = [
  { kind: "manuscript", dir: "Manuscript", label: "Manuscript", singular: "Chapter" },
  { kind: "character", dir: "Characters", label: "Characters", singular: "Character" },
  { kind: "location", dir: "Locations", label: "Locations", singular: "Location" },
  { kind: "item", dir: "Items", label: "Items", singular: "Item" },
  { kind: "note", dir: "Notes", label: "Notes", singular: "Note" },
];

export const sectionFor = (kind: Kind): Section => SECTIONS.find((s) => s.kind === kind)!;

/** Kinds that show up in the `[[` picker and get backlinks. */
export const ENTITY_KINDS: Kind[] = ["character", "location", "item", "note"];

export type Status = "draft" | "revised" | "final";

export interface DocMeta {
  aliases?: string[];
  summary?: string;
  synopsis?: string;
  status?: Status;
  [key: string]: unknown;
}

export interface Doc {
  /** Path relative to the project root, e.g. "Characters/Mara Venn.md". */
  id: string;
  kind: Kind;
  title: string;
  meta: DocMeta;
  body: string;
}

export type ExportFormat = "docx" | "markdown" | "html";
/** How each chapter starts: its binder title, "Chapter 1, 2…", or no heading. */
export type ChapterHeadings = "titles" | "numbers" | "none";

export interface ExportSettings {
  format: ExportFormat;
  headings: ChapterHeadings;
  /** For the title page and page headers. */
  author: string;
}

export interface ProjectFile {
  version: 1;
  title: string;
  /** Binder order per section dir, as filenames without ".md". */
  order: Record<string, string[]>;
  /** Last export's choices, so the next one starts there. */
  export?: Partial<ExportSettings>;
}

export interface Project {
  root: string;
  file: ProjectFile;
  docs: Record<string, Doc>;
}

export const PROJECT_FILE = `${APP_SLUG}.json`;
/** Project files written under the app's former names; renamed to PROJECT_FILE on open. */
export const FORMER_PROJECT_FILES = FORMER_SLUGS.map((slug) => `${slug}.json`);

export const docId = (kind: Kind, title: string) => `${sectionFor(kind).dir}/${title}.md`;

/** Strip characters that are illegal in filenames on any desktop OS. */
export function cleanTitle(title: string): string {
  return title.replace(/[\\/:*?"<>|\[\]#^]/g, "").replace(/\s+/g, " ").trim();
}

/** Documents of one section, in binder order. */
export function docsIn(project: Project, kind: Kind): Doc[] {
  const { dir } = sectionFor(kind);
  const order = project.file.order[dir] ?? [];
  const docs = Object.values(project.docs).filter((d) => d.kind === kind);
  const rank = (d: Doc) => {
    const i = order.indexOf(d.title);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return docs.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[#>*_~`\\-]/g, " ");
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
