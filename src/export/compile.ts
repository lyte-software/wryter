/**
 * Compiling the manuscript into one file. Chapters come in binder order; links become
 * the words they show. Characters, locations, items and notes are never included.
 */
import { flattenLinks, markdownToPlainHtml } from "../editor/markdown";
import { stringify } from "yaml";
import { docsIn, wordCount, type ChapterHeadings, type ExportFormat, type ExportSettings, type Project } from "../project/model";
import { toDocx } from "./docx";

export interface Chapter {
  /** The heading to print, or null for none. */
  heading: string | null;
  body: string;
}

export interface Manuscript {
  title: string;
  author: string;
  words: number;
  chapters: Chapter[];
}

export const DEFAULT_EXPORT: ExportSettings = { format: "docx", headings: "titles", author: "" };

export function exportSettings(project: Project): ExportSettings {
  return { ...DEFAULT_EXPORT, ...project.file.export };
}

function heading(mode: ChapterHeadings, title: string, n: number): string | null {
  return mode === "titles" ? title : mode === "numbers" ? `Chapter ${n}` : null;
}

export function manuscript(project: Project, settings: Pick<ExportSettings, "headings" | "author">): Manuscript {
  const docs = docsIn(project, "manuscript");
  return {
    title: project.file.title,
    author: settings.author.trim(),
    words: docs.reduce((n, d) => n + wordCount(d.body), 0),
    chapters: docs.map((d, i) => ({ heading: heading(settings.headings, d.title, i + 1), body: d.body.trim() })),
  };
}

/** "about 82,000 words", rounded the way manuscript title pages do. */
export function approxWords(words: number): string {
  const step = words < 10000 ? 100 : 1000;
  const rounded = Math.max(step, Math.round(words / step) * step);
  return `about ${rounded.toLocaleString("en-US")} words`;
}

/** One Markdown file, with a title block Pandoc understands. */
export function toMarkdown(m: Manuscript): string {
  const meta: Record<string, string> = { title: m.title };
  if (m.author) meta.author = m.author;
  const parts = [`---\n${stringify(meta).trimEnd()}\n---`];
  m.chapters.forEach((ch, i) => {
    if (ch.heading !== null) parts.push(`# ${ch.heading}`);
    else if (i > 0) parts.push("***");
    if (ch.body) parts.push(flattenLinks(ch.body));
  });
  return parts.join("\n\n") + "\n";
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A standalone web page, styled for reading and for printing to PDF. */
export function toHtml(m: Manuscript): string {
  const chapters = m.chapters
    .map((ch) => {
      const head = ch.heading !== null ? `<h1>${escapeHtml(ch.heading)}</h1>\n` : "";
      return `<section class="chapter">\n${head}${markdownToPlainHtml(ch.body)}</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(m.title)}</title>
<style>
  body { font: 1.15rem/1.6 Georgia, "Times New Roman", serif; color: #222; background: #fff; max-width: 36rem; margin: 0 auto; padding: 4rem 1.25rem; }
  .title-page { text-align: center; padding: 20vh 0; }
  .title-page h1 { font-size: 2.4rem; font-weight: normal; margin: 0 0 1rem; }
  .title-page p { margin: 0.25rem 0; font-style: italic; }
  .chapter { margin-top: 6rem; }
  .chapter h1 { text-align: center; font-weight: normal; font-size: 1.6rem; margin: 0 0 3rem; }
  .chapter h2, .chapter h3 { text-align: center; font-weight: normal; }
  p { margin: 0; text-indent: 1.5em; }
  h1 + p, h2 + p, h3 + p, hr + p, blockquote + p, ul + p, ol + p, .chapter > p:first-child { text-indent: 0; }
  hr { border: 0; text-align: center; margin: 1.5rem 0; }
  hr::after { content: "* * *"; letter-spacing: 0.3em; }
  blockquote { margin: 1rem 2rem; font-style: italic; }
  blockquote p { text-indent: 0; }
  @media print {
    body { max-width: none; padding: 0; font-size: 12pt; }
    @page { margin: 1in; }
    .title-page { padding: 0; height: 9in; display: flex; flex-direction: column; justify-content: center; }
    .chapter { margin-top: 0; break-before: page; padding-top: 2in; }
  }
</style>
</head>
<body>
<header class="title-page">
<h1>${escapeHtml(m.title)}</h1>
${m.author ? `<p>by ${escapeHtml(m.author)}</p>\n` : ""}</header>
${chapters}
</body>
</html>
`;
}

export interface ExportedFile {
  /** Suggested filename, e.g. "The Lantern Road.docx". */
  name: string;
  data: Uint8Array;
}

export const EXTENSIONS: Record<ExportFormat, string> = { docx: "docx", markdown: "md", html: "html" };

export function compile(project: Project, settings: ExportSettings): ExportedFile {
  const m = manuscript(project, settings);
  const name = `${project.file.title.replace(/[\\/:*?"<>|]/g, "").trim() || "Manuscript"}.${EXTENSIONS[settings.format]}`;
  const enc = new TextEncoder();
  const data = settings.format === "docx" ? toDocx(m) : enc.encode(settings.format === "html" ? toHtml(m) : toMarkdown(m));
  return { name, data };
}
