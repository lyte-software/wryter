import { describe, expect, it } from "vitest";
import { splitFrontmatter, joinFrontmatter } from "./frontmatter";
import { buildIndex, linkMentions, retargetLinks, unlinkedMentions } from "./links";
import type { Doc, Kind, Project } from "./model";
import { docsIn, wordCount } from "./model";

function doc(kind: Kind, dir: string, title: string, body: string, meta = {}): Doc {
  return { id: `${dir}/${title}.md`, kind, title, body, meta };
}

function project(...docs: Doc[]): Project {
  return {
    root: "/p",
    file: { version: 1, title: "T", order: {} },
    docs: Object.fromEntries(docs.map((d) => [d.id, d])),
  };
}

const mara = doc("character", "Characters", "Mara Venn", "A ferrier.", { aliases: ["Mara"] });
const greywater = doc("location", "Locations", "Greywater", "A drowned town.");
const ch1 = doc("manuscript", "Manuscript", "Chapter 1", "[[Mara]] reached [[greywater]]. [[Mara Venn]] slept. [[Nobody]]");
const ch2 = doc("manuscript", "Manuscript", "Chapter 2", "Mara Venn woke in Greywater. Mara ate. Marabou birds.");

describe("link index", () => {
  const p = project(mara, greywater, ch1, ch2);
  const index = buildIndex(p);

  it("resolves titles and aliases case-insensitively", () => {
    expect(index.outlinks.get(ch1.id)!.map((d) => d.title)).toEqual(["Mara Venn", "Greywater"]);
  });

  it("counts backlinks per source", () => {
    expect(index.backlinks.get(mara.id)).toMatchObject([{ source: ch1, count: 2 }]);
  });

  it("reports unresolved targets", () => {
    expect(index.unresolved.get(ch1.id)).toEqual(["Nobody"]);
  });

  it("finds unlinked mentions on word boundaries only", () => {
    const mentions = unlinkedMentions(p, mara);
    expect(mentions.map((m) => [m.source.title, m.count])).toEqual([["Chapter 2", 2]]);
  });

  it("links mentions, labelling aliases", () => {
    expect(linkMentions(ch2.body, mara)).toBe(
      "[[Mara Venn]] woke in Greywater. [[Mara Venn|Mara]] ate. Marabou birds.",
    );
    expect(linkMentions("[[Mara Venn]] and Mara", mara)).toBe("[[Mara Venn]] and [[Mara Venn|Mara]]");
  });
});

describe("retargetLinks", () => {
  it("renames bare links and keeps labels", () => {
    expect(retargetLinks("[[mara venn]], [[Mara Venn|her]], [[Other]]", "Mara Venn", "Mara Coll")).toBe(
      "[[Mara Coll]], [[Mara Coll|her]], [[Other]]",
    );
  });
});

describe("frontmatter", () => {
  it("round-trips meta and body", () => {
    const text = joinFrontmatter({ aliases: ["Mara"], summary: "A ferrier." }, "Body text.");
    expect(text).toBe("---\naliases:\n  - Mara\nsummary: A ferrier.\n---\n\nBody text.\n");
    expect(splitFrontmatter(text)).toEqual({ meta: { aliases: ["Mara"], summary: "A ferrier." }, body: "Body text.\n" });
  });

  it("omits empty frontmatter", () => {
    expect(joinFrontmatter({ summary: "", aliases: [] }, "Hi")).toBe("Hi\n");
  });

  it("leaves malformed yaml in the body", () => {
    const text = "---\n: : bad\n  - [\n---\nBody";
    expect(splitFrontmatter(text).body).toBe(text);
  });
});

describe("model helpers", () => {
  it("orders binder docs by saved order, then alphabetically", () => {
    const p = project(ch2, ch1, doc("manuscript", "Manuscript", "Aside", ""));
    p.file.order.Manuscript = ["Chapter 2", "Chapter 1"];
    expect(docsIn(p, "manuscript").map((d) => d.title)).toEqual(["Chapter 2", "Chapter 1", "Aside"]);
  });

  it("counts words, using link labels", () => {
    expect(wordCount("**Mara** met [[Old Tom|the ferryman]] — at *dusk*.\n\n***")).toBe(6);
  });
});

describe("excerpt", () => {
  it("does not cut links in half", async () => {
    const { excerpt } = await import("./links");
    const md = "x".repeat(50) + " She set [[The Brass Lantern|the lantern]] down. " + "y".repeat(80);
    const text = excerpt(md, 50, 20);
    expect(text).not.toContain("[[");
    expect(text).toContain("the lantern");
  });
});
