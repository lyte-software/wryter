import { ENTITY_KINDS, type Doc, type Project } from "./model";

/** `[[Target]]` or `[[Target|shown text]]`. */
export const LINK_RE = /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

export interface Link {
  target: string;
  label?: string;
  index: number;
  length: number;
}

export function parseLinks(markdown: string): Link[] {
  return [...markdown.matchAll(LINK_RE)].map((m) => ({
    target: m[1].trim(),
    label: m[2]?.trim(),
    index: m.index!,
    length: m[0].length,
  }));
}

/** All the names a document answers to: its title plus aliases. */
export function namesOf(doc: Doc): string[] {
  const aliases = Array.isArray(doc.meta.aliases) ? doc.meta.aliases.map(String) : [];
  return [doc.title, ...aliases].filter((n) => n.trim().length > 0);
}

export type Resolver = (target: string) => Doc | undefined;

const resolvers = new WeakMap<Record<string, Doc>, Resolver>();

/** Case-insensitive title/alias lookup, cached per docs snapshot. */
export function resolverFor(project: Project): Resolver {
  let resolver = resolvers.get(project.docs);
  if (!resolver) {
    const byName = new Map<string, Doc>();
    const docs = Object.values(project.docs);
    // Aliases first so a real title always wins a collision.
    for (const d of docs) for (const n of namesOf(d).slice(1)) byName.set(n.toLowerCase(), d);
    for (const d of docs) byName.set(d.title.toLowerCase(), d);
    resolver = (target) => byName.get(target.trim().toLowerCase());
    resolvers.set(project.docs, resolver);
  }
  return resolver;
}

export interface Mention {
  source: Doc;
  count: number;
  /** A short excerpt around the first occurrence. */
  excerpt: string;
}

export interface LinkIndex {
  /** Entity id -> documents linking to it. */
  backlinks: Map<string, Mention[]>;
  /** Doc id -> entities it links to, in first-appearance order. */
  outlinks: Map<string, Doc[]>;
  /** Doc id -> link targets that match nothing. */
  unresolved: Map<string, string[]>;
}

export function buildIndex(project: Project): LinkIndex {
  const resolve = resolverFor(project);
  const backlinks = new Map<string, Mention[]>();
  const outlinks = new Map<string, Doc[]>();
  const unresolved = new Map<string, string[]>();

  for (const doc of Object.values(project.docs)) {
    const counts = new Map<string, { target: Doc; count: number; at: number }>();
    const missing = new Set<string>();
    for (const link of parseLinks(doc.body)) {
      const target = resolve(link.target);
      if (!target) {
        missing.add(link.target);
        continue;
      }
      if (target.id === doc.id) continue;
      const entry = counts.get(target.id);
      if (entry) entry.count++;
      else counts.set(target.id, { target, count: 1, at: link.index });
    }
    outlinks.set(doc.id, [...counts.values()].map((c) => c.target));
    if (missing.size) unresolved.set(doc.id, [...missing]);
    for (const { target, count, at } of counts.values()) {
      const list = backlinks.get(target.id) ?? [];
      list.push({ source: doc, count, excerpt: excerpt(doc.body, at) });
      backlinks.set(target.id, list);
    }
  }
  return { backlinks, outlinks, unresolved };
}

/** Plain-text excerpt of `markdown` centred on `at`. */
export function excerpt(markdown: string, at: number, radius = 70): string {
  let start = Math.max(0, at - radius);
  let end = Math.min(markdown.length, at + radius);
  // Never cut a [[link]] in half, or its raw syntax leaks into the excerpt.
  const openBefore = markdown.lastIndexOf("[[", start);
  if (openBefore !== -1 && markdown.indexOf("]]", openBefore) >= start) start = openBefore;
  const openInside = markdown.lastIndexOf("[[", end);
  const closeAfter = markdown.indexOf("]]", openInside);
  if (openInside >= start && closeAfter !== -1 && closeAfter + 2 > end) end = closeAfter + 2;
  const text = markdown
    .slice(start, end)
    .replace(LINK_RE, (_, target, label) => label ?? target)
    .replace(/[*_~`#>\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (start > 0 ? "…" : "") + text + (end < markdown.length ? "…" : "");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches any of the entity's names as a whole word, outside existing links. */
function mentionRegex(entity: Doc): RegExp | null {
  const names = namesOf(entity)
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  if (!names.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join("|")})(?![\\p{L}\\p{N}])`, "gu");
}

/** Blank out existing links so plain-text searches skip them but indices stay put. */
const maskLinks = (markdown: string) => markdown.replace(LINK_RE, (m) => " ".repeat(m.length));

/** Docs that name the entity in plain text without linking it. */
export function unlinkedMentions(project: Project, entity: Doc): Mention[] {
  const re = mentionRegex(entity);
  if (!re) return [];
  const result: Mention[] = [];
  for (const doc of Object.values(project.docs)) {
    if (doc.id === entity.id) continue;
    const matches = [...maskLinks(doc.body).matchAll(re)];
    if (matches.length) {
      result.push({ source: doc, count: matches.length, excerpt: excerpt(doc.body, matches[0].index!) });
    }
  }
  return result;
}

/** Turn every unlinked mention of `entity` in `markdown` into a link. */
export function linkMentions(markdown: string, entity: Doc): string {
  const re = mentionRegex(entity);
  if (!re) return markdown;
  const masked = maskLinks(markdown);
  let out = "";
  let last = 0;
  for (const m of masked.matchAll(re)) {
    const text = markdown.slice(m.index!, m.index! + m[0].length);
    out += markdown.slice(last, m.index!);
    out += text.toLowerCase() === entity.title.toLowerCase() ? `[[${entity.title}]]` : `[[${entity.title}|${text}]]`;
    last = m.index! + m[0].length;
  }
  return out + markdown.slice(last);
}

/**
 * Point links aimed at `from` to `to`. Bare links take the new name (renaming a
 * character renames them in the prose); custom labels are kept.
 */
export function retargetLinks(markdown: string, from: string, to: string): string {
  const key = from.trim().toLowerCase();
  return markdown.replace(LINK_RE, (whole, target: string, label?: string) => {
    if (target.trim().toLowerCase() !== key) return whole;
    return label && label.trim() !== to ? `[[${to}|${label.trim()}]]` : `[[${to}]]`;
  });
}

export const isEntity = (doc: Doc) => ENTITY_KINDS.includes(doc.kind);
