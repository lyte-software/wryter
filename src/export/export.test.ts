import { describe, expect, it } from "vitest";
import { docFromText } from "../project/io";
import type { Project } from "../project/model";
import { approxWords, compile, manuscript, toHtml, toMarkdown } from "./compile";
import { crc32 } from "./zip";

function project(): Project {
  const docs = [
    docFromText("Manuscript/Arrival.md", "---\nsynopsis: Mara comes home\n---\n\n[[Mara Venn|Mara]] walked to the [[Harbor]] & waited.\n\n***\n\nThe *lamp* was **lit**."),
    docFromText("Manuscript/Departure.md", "> A quote.\n\n- one\n- two\n\nTom said \\[[not a link]]."),
    docFromText("Characters/Mara Venn.md", "Secret character notes."),
  ];
  return {
    root: "/p/Book",
    file: { version: 1, title: "The Lantern Road", order: { Manuscript: ["Arrival", "Departure"] } },
    docs: Object.fromEntries(docs.map((d) => [d.id, d])),
  };
}

/** Read the entries of a stored (uncompressed) zip. */
function unzip(data: Uint8Array): Record<string, string> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const name = dec.decode(data.subarray(at + 30, at + 30 + nameLen));
    const body = data.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    expect(crc32(body)).toBe(crc);
    out[name] = dec.decode(body);
    at += 30 + nameLen + size;
  }
  return out;
}

describe("manuscript", () => {
  it("takes chapters in binder order and leaves entities out", () => {
    const m = manuscript(project(), { headings: "titles", author: " Ana Ruiz " });
    expect(m.chapters.map((c) => c.heading)).toEqual(["Arrival", "Departure"]);
    expect(m.author).toBe("Ana Ruiz");
    expect(m.chapters.some((c) => c.body.includes("Secret"))).toBe(false);
  });

  it("numbers or drops headings", () => {
    expect(manuscript(project(), { headings: "numbers", author: "" }).chapters.map((c) => c.heading)).toEqual(["Chapter 1", "Chapter 2"]);
    expect(manuscript(project(), { headings: "none", author: "" }).chapters.map((c) => c.heading)).toEqual([null, null]);
  });
});

describe("approxWords", () => {
  it("rounds like a title page", () => {
    expect(approxWords(12)).toBe("about 100 words");
    expect(approxWords(4321)).toBe("about 4,300 words");
    expect(approxWords(81_600)).toBe("about 82,000 words");
  });
});

describe("markdown export", () => {
  it("has a Pandoc title block, chapter headings and flattened links", () => {
    const md = toMarkdown(manuscript(project(), { headings: "titles", author: "Ana Ruiz" }));
    expect(md).toMatch(/^---\ntitle: The Lantern Road\nauthor: Ana Ruiz\n---\n\n# Arrival\n\nMara walked to the Harbor & waited\./);
    expect(md).toContain("# Departure");
    expect(md).toContain("\\[[not a link]]"); // escaped brackets aren't links
    expect(md).not.toContain("[[Mara");
    expect(md).not.toContain("synopsis");
  });

  it("separates chapters with a break when there are no headings", () => {
    const md = toMarkdown(manuscript(project(), { headings: "none", author: "" }));
    expect(md).not.toContain("author:");
    expect(md).not.toContain("# ");
    expect(md.split("***").length).toBe(3); // the scene break plus one between chapters
  });
});

describe("html export", () => {
  it("is a standalone page with the links as plain words", () => {
    const html = toHtml(manuscript(project(), { headings: "titles", author: "Ana & Co" }));
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>The Lantern Road</title>");
    expect(html).toContain("<p>by Ana &amp; Co</p>");
    expect(html).toContain("<h1>Arrival</h1>");
    expect(html).toContain("<p>Mara walked to the Harbor &amp; waited.</p>");
    expect(html).not.toContain("data-entity-link");
  });
});

describe("docx export", () => {
  const files = unzip(compile(project(), { format: "docx", headings: "titles", author: "Ana Ruiz" }).data);
  const doc = files["word/document.xml"];

  it("is a complete package of well-formed XML", () => {
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/core.xml",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/header1.xml",
      "word/styles.xml",
    ]);
    for (const [name, text] of Object.entries(files)) {
      const parsed = new DOMParser().parseFromString(text, "application/xml");
      expect(parsed.getElementsByTagName("parsererror").length, name).toBe(0);
    }
  });

  it("has a title page, chapter headings, scene breaks and formatting", () => {
    expect(doc).toContain(">The Lantern Road<");
    expect(doc).toContain(">by Ana Ruiz<");
    expect(doc).toContain(">about 100 words<");
    expect(doc).toMatch(/<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Arrival</);
    expect(doc).toContain("Mara walked to the Harbor &amp; waited.");
    expect(doc).toMatch(/<w:pStyle w:val="SceneBreak"\/><\/w:pPr><w:r><w:t xml:space="preserve">#</);
    expect(doc).toContain('<w:rPr><w:i/></w:rPr><w:t xml:space="preserve">lamp<');
    expect(doc).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">lit<');
    expect(doc).toContain('<w:pStyle w:val="Quote"/>');
    expect(doc).toContain(">•<");
    expect(doc).toContain("Tom said [[not a link]].");
    expect(doc).not.toContain("Secret");
    expect(files["word/header1.xml"]).toContain("Ruiz / THE LANTERN ROAD / ");
  });

  it("starts chapters on a new page even without headings", () => {
    const d = unzip(compile(project(), { format: "docx", headings: "none", author: "" }).data)["word/document.xml"];
    expect(d).not.toContain('w:val="Heading1"');
    expect(d.match(/<w:pageBreakBefore\/>/g)?.length).toBe(2);
  });

  it("is named after the project", () => {
    expect(compile(project(), { format: "docx", headings: "titles", author: "" }).name).toBe("The Lantern Road.docx");
    expect(compile(project(), { format: "markdown", headings: "titles", author: "" }).name).toBe("The Lantern Road.md");
  });
});
