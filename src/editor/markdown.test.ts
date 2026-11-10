import { describe, expect, it } from "vitest";
import { generateJSON } from "@tiptap/core";
import { baseExtensions } from "./extensions";
import { jsonToMarkdown, linkifyText, markdownToHtml } from "./markdown";

const extensions = baseExtensions();
const roundTrip = (md: string) => jsonToMarkdown(generateJSON(markdownToHtml(md), extensions));

describe("markdown round trip", () => {
  const cases: Record<string, string> = {
    paragraphs: "The road was dark.\n\nMara lit the lantern.\n",
    headings: "# Part One\n\n## The Crossing\n\nText.\n",
    emphasis: "She was **very** *tired* and ~~angry~~ calm.\n",
    nested: "**bold *and italic* text**\n",
    "entity links": "[[Mara Venn]] met [[Old Tom|the ferryman]] at [[Greywater]].\n",
    "link inside emphasis": "*Only [[Mara Venn]] knew.*\n",
    quote: "> I will not go back.\n>\n> Not ever.\n",
    "bullet list": "- salt\n- rope\n- the lantern\n",
    "ordered list": "1. first\n2. second\n",
    "nested list": "- outer\n  - inner\n- next\n",
    "scene break": "End of scene.\n\n***\n\nNext scene.\n",
    "hard break": "Line one\\\nline two\n",
    "special characters": "Price: 5 \\* 3 \\[sic\\] a\\_b \\<tag> &amp;amp; \\`tick\\`\n",
    "line-start lookalikes": "\\# not a heading\n\n\\- not a list\n\n1\\. not a list either\n",
    empty: "",
  };

  for (const [name, md] of Object.entries(cases)) {
    it(name, () => expect(roundTrip(md)).toBe(md));
  }

  it("is stable after normalising hand-written markdown", () => {
    const messy = "Some _underscored_ text\nwrapped across lines.\n\n\n\n* star list\n";
    const once = roundTrip(messy);
    expect(once).toBe("Some *underscored* text wrapped across lines.\n\n- star list\n");
    expect(roundTrip(once)).toBe(once);
  });

  it("keeps whitespace outside emphasis delimiters", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: " bold ", marks: [{ type: "bold" }] },
            { type: "text", text: "b" },
          ],
        },
      ],
    };
    expect(jsonToMarkdown(json)).toBe("a **bold** b\n");
  });

  it("parses links into entity nodes", () => {
    const json = generateJSON(markdownToHtml("Hi [[Mara Venn|Mara]]."), extensions);
    expect(json.content[0].content[1]).toEqual({
      type: "entityLink",
      attrs: { target: "Mara Venn", label: "Mara" },
    });
  });
});

describe("raw mode", () => {
  const rawExtensions = baseExtensions({ raw: true });
  const rawRoundTrip = (md: string) =>
    jsonToMarkdown(linkifyText(generateJSON(markdownToHtml(md, { raw: true }), rawExtensions)));

  it("shows links as plain [[...]] text", () => {
    const json = generateJSON(markdownToHtml("Hi [[Mara Venn|Mara]].", { raw: true }), rawExtensions);
    expect(json.content[0].content).toEqual([{ type: "text", text: "Hi [[Mara Venn|Mara]]." }]);
  });

  const cases: Record<string, string> = {
    "entity links": "[[Mara Venn]] met [[Old Tom|the ferryman]] at [[Greywater]].\n",
    "link inside emphasis": "*Only [[Mara Venn]] knew.*\n",
    "special characters": "Price: 5 \\* 3 \\[sic\\] a\\_b \\<tag> &amp;amp; \\`tick\\`\n",
  };
  for (const [name, md] of Object.entries(cases)) {
    it(`round-trips ${name}`, () => expect(rawRoundTrip(md)).toBe(md));
  }

  it("saves typed links as links and tidies them", () => {
    const json = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "See [[ Mara | Mara ]] and [[half" }] }],
    };
    expect(jsonToMarkdown(linkifyText(json))).toBe("See [[Mara]] and \\[\\[half\n");
  });
});
