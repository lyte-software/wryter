/**
 * Full-text search across a project. Matches the words as the writer sees them:
 * links count as the text they show, and Markdown punctuation is ignored.
 */
import { flattenLinks } from "../editor/markdown";
import { SECTIONS, type Doc, type Project } from "./model";

export interface TextHit {
  doc: Doc;
  /** Matches in the doc. */
  count: number;
  /** The first match in context, split so the UI can highlight it. */
  before: string;
  match: string;
  after: string;
}

/** A doc's body as plain text: no link brackets, emphasis markers, escapes or block markers. */
export function plainText(markdown: string): string {
  return (
    flattenLinks(markdown)
      // Scene breaks, then heading / quote / list markers at line starts.
      .replace(/^ {0,3}(\*[ \t]*\*[ \t]*\*|-{3,}|_{3,})[ \t]*$/gm, "")
      .replace(/^ {0,3}(#{1,6}[ \t]+|>[ \t]?|[-+*][ \t]+|\d+[.)][ \t]+)/gm, "")
      // Emphasis markers that aren't escaped; underscores only at word edges, so snake_case stays.
      .replace(/(?<!\\)(\*\*|~~|\*)(?=\S)|(?<=[^\s\\])(\*\*|~~|\*)/g, "")
      .replace(/(?<![\\\p{L}\p{N}_])(__|_)(?=\S)|(?<=[^\s\\])(__|_)(?![\p{L}\p{N}_])/gu, "")
      .replace(/\\(.)/g, "$1")
      .replace(/&(amp|lt|gt|quot);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"' })[e]!)
  );
}

/** Lower-case one UTF-16 unit at a time, so indices line up with the original text. */
export function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

const CONTEXT = 40;

function excerpt(text: string, at: number, length: number): Pick<TextHit, "before" | "match" | "after"> {
  const flat = (s: string) => s.replace(/\s+/g, " ");
  let start = Math.max(0, at - CONTEXT);
  let end = Math.min(text.length, at + length + CONTEXT);
  // Start and end on word boundaries where we can.
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > at + length ? text.lastIndexOf(" ", end) : end;
  return {
    before: (start > 0 ? "…" : "") + flat(text.slice(start, at)).trimStart(),
    match: text.slice(at, at + length),
    after: flat(text.slice(at + length, end)).trimEnd() + (end < text.length ? "…" : ""),
  };
}

/** Docs whose text contains `query` (case-insensitive), manuscript first, then by match count. */
export function searchProject(project: Project, query: string, limit = 20): TextHit[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const rank = (d: Doc) => SECTIONS.findIndex((s) => s.kind === d.kind);
  const hits: TextHit[] = [];
  for (const doc of Object.values(project.docs)) {
    const text = plainText(doc.body);
    const folded = fold(text);
    let at = folded.indexOf(q);
    if (at === -1) continue;
    const first = at;
    let count = 0;
    while (at !== -1) {
      count++;
      at = folded.indexOf(q, at + q.length);
    }
    hits.push({ doc, count, ...excerpt(text, first, q.length) });
  }
  return hits
    .sort((a, b) => rank(a.doc) - rank(b.doc) || b.count - a.count || a.doc.title.localeCompare(b.doc.title))
    .slice(0, limit);
}
