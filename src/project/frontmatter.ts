import { parse, stringify } from "yaml";
import type { DocMeta } from "./model";

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(text: string): { meta: DocMeta; body: string } {
  const match = FENCE.exec(text);
  if (!match) return { meta: {}, body: text };
  let meta: DocMeta = {};
  try {
    const parsed = parse(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) meta = parsed;
  } catch {
    // Malformed YAML: keep it in the body rather than silently dropping it.
    return { meta: {}, body: text };
  }
  return { meta, body: text.slice(match[0].length).replace(/^\r?\n/, "") };
}

export function joinFrontmatter(meta: DocMeta, body: string): string {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  );
  const content = body.trimEnd() + "\n";
  if (Object.keys(clean).length === 0) return content;
  return `---\n${stringify(clean).trimEnd()}\n---\n\n${content}`;
}
