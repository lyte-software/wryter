import { Marked, type TokenizerAndRendererExtension } from "marked";
import type { JSONContent } from "@tiptap/core";

/**
 * Markdown <-> editor conversion. Files on disk are the source of truth, so
 * this pair must round-trip everything the editor can produce:
 * paragraphs, headings, quotes, lists, scene breaks, hard breaks,
 * bold / italic / strikethrough, and `[[entity links]]`.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wikilink: TokenizerAndRendererExtension = {
  name: "wikilink",
  level: "inline",
  start: (src) => src.indexOf("[["),
  tokenizer(src) {
    const m = /^\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/.exec(src);
    if (!m) return undefined;
    return { type: "wikilink", raw: m[0], target: m[1].trim(), label: m[2]?.trim() };
  },
  renderer(token) {
    const label = token.label ? ` data-label="${escapeHtml(token.label)}"` : "";
    return `<span data-entity-link data-target="${escapeHtml(token.target)}"${label}>${escapeHtml(
      token.label ?? token.target,
    )}</span>`;
  },
};

const marked = new Marked({ gfm: true, breaks: false }, { extensions: [wikilink] });

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false });
}

// ---------------------------------------------------------------------------
// Editor JSON -> Markdown

type Mark = "bold" | "italic" | "strike";
const MARK_ORDER: Mark[] = ["bold", "italic", "strike"];
const DELIM: Record<Mark, string> = { bold: "**", italic: "*", strike: "~~" };

const marksOf = (node: JSONContent): Mark[] =>
  (node.marks ?? []).map((m) => m.type as Mark).filter((m) => MARK_ORDER.includes(m));

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([*_`~\[\]<])/g, "\\$1")
    .replace(/&(?=#?[a-zA-Z0-9]+;)/g, "&amp;");
}

function leaf(node: JSONContent): string {
  switch (node.type) {
    case "text":
      return escapeText(node.text ?? "");
    case "hardBreak":
      return "\\\n";
    case "entityLink": {
      const { target, label } = node.attrs ?? {};
      return label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`;
    }
    default:
      return "";
  }
}

/**
 * Wrap runs of marked nodes so `**a *b* c**` comes out nested instead of as
 * `**a ***b*** c**`. Whitespace is pushed outside delimiters, since
 * `** bold**` is not bold in Markdown.
 */
function inline(nodes: JSONContent[], done: Mark[] = []): string {
  let out = "";
  let i = 0;
  while (i < nodes.length) {
    const mark = MARK_ORDER.find((m) => !done.includes(m) && marksOf(nodes[i]).includes(m));
    if (!mark) {
      out += leaf(nodes[i++]);
      continue;
    }
    let j = i;
    while (j < nodes.length && marksOf(nodes[j]).includes(mark)) j++;
    const inner = inline(nodes.slice(i, j), [...done, mark]);
    const lead = /^\s*/.exec(inner)![0];
    const trail = /\s*$/.exec(inner)![0];
    const core = inner.slice(lead.length, inner.length - trail.length);
    out += core ? `${lead}${DELIM[mark]}${core}${DELIM[mark]}${trail}` : inner;
    i = j;
  }
  return out;
}

/** Escape text that would otherwise turn a paragraph into another block. */
function guardLineStart(text: string): string {
  return text
    .replace(/^(\s*)(#{1,6}\s|>|[-+]\s)/gm, (_, ws, m) => `${ws}\\${m}`)
    .replace(/^(\s*\d+)([.)]\s)/gm, "$1\\$2")
    .replace(/^(\s*)(\*\s*\*\s*\*|-{3,}|={3,})\s*$/gm, (_, ws, m) => `${ws}\\${m}`);
}

const indent = (text: string, prefix: string, first = prefix) =>
  text
    .split("\n")
    .map((line, i) => (line ? (i === 0 ? first : prefix) + line : line))
    .join("\n");

function block(node: JSONContent): string {
  const children = node.content ?? [];
  switch (node.type) {
    case "paragraph":
      return guardLineStart(inline(children));
    case "heading":
      return `${"#".repeat(node.attrs?.level ?? 1)} ${inline(children)}`;
    case "blockquote":
      return blocks(children)
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n");
    case "bulletList":
      return children.map((item) => indent(itemBlocks(item), "  ", "- ")).join("\n");
    case "orderedList": {
      const start = node.attrs?.start ?? 1;
      return children
        .map((item, i) => {
          const marker = `${start + i}. `;
          return indent(itemBlocks(item), " ".repeat(marker.length), marker);
        })
        .join("\n");
    }
    case "horizontalRule":
      return "***";
    default:
      return inline(children);
  }
}

const blocks = (nodes: JSONContent[]) => nodes.map(block).join("\n\n");

const isList = (n: JSONContent) => n.type === "bulletList" || n.type === "orderedList";

/** List items stay tight: a nested list follows its line directly. */
const itemBlocks = (item: JSONContent) =>
  (item.content ?? []).map((n, i) => (i === 0 ? "" : isList(n) ? "\n" : "\n\n") + block(n)).join("");

export function jsonToMarkdown(doc: JSONContent): string {
  const content = (doc.content ?? []).filter(
    // The editor always keeps one empty paragraph; it isn't content.
    (n, _i, all) => !(all.length === 1 && n.type === "paragraph" && !n.content?.length),
  );
  const md = blocks(content).replace(/\n{3,}/g, "\n\n").trimEnd();
  return md ? md + "\n" : "";
}
