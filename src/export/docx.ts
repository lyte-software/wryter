/**
 * Word export in standard manuscript format: 12pt Times New Roman, double spaced,
 * indented paragraphs, 1" margins, a title page with the word count, each chapter on
 * a new page, "#" for scene breaks, and an "Author / TITLE / page" header.
 */
import type { Token, Tokens } from "marked";
import { markdownTokens } from "../editor/markdown";
import { approxWords, type Manuscript } from "./compile";
import { zip } from "./zip";

interface Run {
  text?: string;
  br?: boolean;
  tab?: boolean;
  b?: boolean;
  i?: boolean;
  s?: boolean;
}

interface Para {
  style: string;
  runs: Run[];
  /** Extra paragraph properties, as raw XML. */
  props?: string;
}

const xml = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Marked leaves HTML entities in text as written; Word wants the characters. */
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

type Fmt = Pick<Run, "b" | "i" | "s">;

function runs(tokens: Token[] | undefined, fmt: Fmt = {}): Run[] {
  const out: Run[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "strong":
        out.push(...runs((t as Tokens.Strong).tokens, { ...fmt, b: true }));
        break;
      case "em":
        out.push(...runs((t as Tokens.Em).tokens, { ...fmt, i: true }));
        break;
      case "del":
        out.push(...runs((t as Tokens.Del).tokens, { ...fmt, s: true }));
        break;
      case "br":
        out.push({ br: true });
        break;
      case "wikilink":
        out.push({ ...fmt, text: (t.label ?? t.target) as string });
        break;
      case "escape":
        out.push({ ...fmt, text: (t as Tokens.Escape).text });
        break;
      case "image":
        out.push({ ...fmt, text: (t as Tokens.Image).text });
        break;
      default:
        // text, plus anything written by another app (links, code spans, inline HTML): keep the words.
        if ("tokens" in t && t.tokens?.length) out.push(...runs(t.tokens, fmt));
        else if ("text" in t) out.push({ ...fmt, text: decode(String(t.text)) });
    }
  }
  return out;
}

function blocks(tokens: Token[], style = "Normal", level = 0): Para[] {
  const out: Para[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "space":
        break;
      case "heading":
        // Chapter headings are Heading 1; headings inside a chapter sit below them.
        out.push({ style: `Heading${Math.min((t as Tokens.Heading).depth + 1, 3)}`, runs: runs((t as Tokens.Heading).tokens) });
        break;
      case "blockquote":
        out.push(...blocks((t as Tokens.Blockquote).tokens, "Quote", level));
        break;
      case "hr":
        out.push({ style: "SceneBreak", runs: [{ text: "#" }] });
        break;
      case "list": {
        const list = t as Tokens.List;
        const start = Number(list.start) || 1;
        list.items.forEach((item, i) => {
          const marker = list.ordered ? `${start + i}.` : "•";
          const inner = blocks(item.tokens, "List", level + 1);
          const indent = `<w:ind w:left="${720 * (level + 1)}" w:hanging="360"/>`;
          inner.forEach((p, j) => {
            if (p.style !== "List") return;
            p.props ??= indent;
            if (j === 0) p.runs.unshift({ text: marker }, { tab: true });
          });
          out.push(...inner);
        });
        break;
      }
      default: {
        // paragraph, text (tight list items), or a block another app wrote (code, HTML).
        const r = "tokens" in t && t.tokens?.length ? runs(t.tokens) : "text" in t ? [{ text: decode(String(t.text)) }] : [];
        if (r.length) out.push({ style, runs: r });
      }
    }
  }
  return out;
}

function runXml(r: Run): string {
  if (r.br) return "<w:r><w:br/></w:r>";
  if (r.tab) return "<w:r><w:tab/></w:r>";
  const props = (r.b ? "<w:b/>" : "") + (r.i ? "<w:i/>" : "") + (r.s ? "<w:strike/>" : "");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(r.text ?? "")}</w:t></w:r>`;
}

/** Join neighbouring runs with the same formatting, as Word itself would. */
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    const text = (x: Run) => x.text !== undefined && !x.br && !x.tab;
    if (last && text(last) && text(r) && !last.b === !r.b && !last.i === !r.i && !last.s === !r.s) {
      out[out.length - 1] = { ...last, text: last.text! + r.text! };
    } else out.push(r);
  }
  return out;
}

const paraXml = (p: Para) =>
  `<w:p><w:pPr><w:pStyle w:val="${p.style}"/>${p.props ?? ""}</w:pPr>${merge(p.runs).map(runXml).join("")}</w:p>`;

function body(m: Manuscript): string {
  const paras: Para[] = [
    // Title page: author and word count on the first line, title a third of the way down.
    { style: "TitleInfo", runs: [{ text: m.author }, { tab: true }, { text: approxWords(m.words) }] },
    { style: "Title", runs: [{ text: m.title }] },
  ];
  if (m.author) paras.push({ style: "Byline", runs: [{ text: `by ${m.author}` }] });

  for (const ch of m.chapters) {
    const inner = blocks(markdownTokens(ch.body));
    if (ch.heading !== null) {
      paras.push({ style: "Heading1", runs: [{ text: ch.heading }] }, ...inner);
    } else if (inner.length) {
      inner[0].props = (inner[0].props ?? "") + "<w:pageBreakBefore/>";
      paras.push(...inner);
    }
  }
  return paras.map(paraXml).join("\n");
}

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const DECL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;

function documentXml(m: Manuscript): string {
  return `${DECL}<w:document ${NS}><w:body>
${body(m)}
<w:sectPr>
<w:headerReference w:type="default" r:id="rIdHeader"/>
<w:pgSz w:w="12240" w:h="15840"/>
<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
<w:titlePg/>
</w:sectPr>
</w:body></w:document>`;
}

function headerXml(m: Manuscript): string {
  const surname = m.author.split(/\s+/).filter(Boolean).pop();
  const label = [surname, m.title.toUpperCase()].filter(Boolean).join(" / ") + " / ";
  return `${DECL}<w:hdr ${NS}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr>${runXml({ text: label })}<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>`;
}

const style = (id: string, name: string, pPr: string, rPr = "", extra = "") =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${extra}<w:pPr>${pPr}</w:pPr>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`;

const NO_INDENT = `<w:ind w:firstLine="0"/>`;
const CENTER = `<w:jc w:val="center"/>${NO_INDENT}`;

const STYLES = `${DECL}<w:styles ${NS}>
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="720"/></w:pPr></w:style>
${style("Heading1", "heading 1", `<w:keepNext/><w:pageBreakBefore/><w:spacing w:before="2880" w:after="480"/>${CENTER}<w:outlineLvl w:val="0"/>`, "", `<w:next w:val="Normal"/><w:qFormat/>`)}
${style("Heading2", "heading 2", `<w:keepNext/>${CENTER}<w:outlineLvl w:val="1"/>`, "<w:b/>", `<w:next w:val="Normal"/><w:qFormat/>`)}
${style("Heading3", "heading 3", `<w:keepNext/>${CENTER}<w:outlineLvl w:val="2"/>`, "<w:i/>", `<w:next w:val="Normal"/><w:qFormat/>`)}
${style("Title", "Title", `<w:spacing w:before="4320"/>${CENTER}`, "", "<w:qFormat/>")}
${style("Byline", "Byline", CENTER)}
${style("TitleInfo", "Title Page Info", `<w:spacing w:line="240" w:lineRule="auto"/><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>${NO_INDENT}`)}
${style("SceneBreak", "Scene Break", `<w:keepNext/>${CENTER}`)}
${style("Quote", "Quote", `<w:ind w:left="720" w:right="720" w:firstLine="0"/>`)}
${style("List", "List Paragraph", `<w:ind w:left="720" w:hanging="360"/>`)}
${style("Header", "header", `<w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="right"/>${NO_INDENT}`)}
</w:styles>`;

const CONTENT_TYPES = `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const DOC_RELS = `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

const coreXml = (m: Manuscript) => `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${xml(m.title)}</dc:title>${m.author ? `<dc:creator>${xml(m.author)}</dc:creator>` : ""}
</cp:coreProperties>`;

export function toDocx(m: Manuscript): Uint8Array {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["docProps/core.xml", coreXml(m)],
    ["word/document.xml", documentXml(m)],
    ["word/_rels/document.xml.rels", DOC_RELS],
    ["word/styles.xml", STYLES],
    ["word/header1.xml", headerXml(m)],
  ]);
}
