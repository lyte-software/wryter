import { describe, expect, it } from "vitest";
import { docFromText } from "./io";
import type { Project } from "./model";
import { fold, plainText, searchProject } from "./search";

describe("plainText", () => {
  it("reads like the page: link text, no Markdown punctuation", () => {
    expect(plainText("# The Ferry\n\n[[Mara Venn|Mara]] lit the **old** *lamp* \\* & [[Harbor]].")).toBe(
      "The Ferry\n\nMara lit the old lamp * & Harbor.",
    );
    expect(plainText("> quoted\n\n- one\n1. two\n\n***\n\nTom &amp; Jerry")).toBe("quoted\n\none\ntwo\n\n\n\nTom & Jerry");
  });

  it("keeps snake_case, lone and escaped asterisks", () => {
    expect(plainText("a * b")).toBe("a * b");
    expect(plainText("snake_case and _italic_")).toBe("snake_case and italic");
    expect(plainText("5\\*3 is \\*not\\* bold")).toBe("5*3 is *not* bold");
    expect(plainText("* * *\n\n- item")).toBe("\n\nitem");
  });
});

describe("fold", () => {
  it("keeps every character's index", () => {
    expect(fold("İstanbul ÉCOLE")).toHaveLength("İstanbul ÉCOLE".length);
    expect(fold("ÉCOLE")).toBe("école");
  });
});

describe("searchProject", () => {
  const docs = [
    docFromText("Manuscript/Chapter 1.md", "The lantern swung. [[Mara Venn|Mara]] held the *lantern* high."),
    docFromText("Manuscript/Chapter 2.md", "No light here."),
    docFromText("Characters/Mara Venn.md", "---\nsummary: lantern girl\n---\n\nShe carries a Lantern."),
    docFromText("Notes/Ideas.md", "lantern lantern lantern"),
  ];
  const project: Project = {
    root: "/b",
    file: { version: 1, title: "B", order: {} },
    docs: Object.fromEntries(docs.map((d) => [d.id, d])),
  };

  it("finds words case-insensitively, manuscript first, with counts", () => {
    const hits = searchProject(project, "LANTERN");
    expect(hits.map((h) => [h.doc.title, h.count])).toEqual([
      ["Chapter 1", 2],
      ["Mara Venn", 1],
      ["Ideas", 3],
    ]);
  });

  it("matches link text and across emphasis, but not frontmatter", () => {
    expect(searchProject(project, "mara held the lantern").map((h) => h.doc.title)).toEqual(["Chapter 1"]);
    expect(searchProject(project, "girl")).toEqual([]);
  });

  it("gives the first match in context", () => {
    const [hit] = searchProject(project, "held");
    expect([hit.before, hit.match, hit.after]).toEqual(["The lantern swung. Mara ", "held", " the lantern high."]);
  });

  it("waits for two characters", () => {
    expect(searchProject(project, " l ")).toEqual([]);
  });
});
