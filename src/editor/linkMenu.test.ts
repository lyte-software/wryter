import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseExtensions } from "./extensions";
import { jsonToMarkdown, markdownToHtml } from "./markdown";
import { linkableSelection, linkTo, splitQuery } from "./linkMenu";
import type { Doc } from "../project/model";

const henry = { id: "c1", kind: "character", title: "Henry Bob", body: "", meta: {} } as unknown as Doc;

// Destroyed after each test, or ProseMirror's DOM observer timer can fire after jsdom is gone.
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function editorWith(md: string) {
  const editor = new Editor({ extensions: baseExtensions(), content: markdownToHtml(md) });
  editors.push(editor);
  return editor;
}

/** Select the first occurrence of `text` (plus `extra` trailing chars). */
function select(editor: Editor, text: string, extra = 0) {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from === -1 && node.isText && node.text!.includes(text)) from = pos + node.text!.indexOf(text);
  });
  const sel = TextSelection.create(editor.state.doc, from, from + text.length + extra);
  editor.view.dispatch(editor.state.tr.setSelection(sel));
}

const markdown = (editor: Editor) => jsonToMarkdown(editor.getJSON());

describe("splitQuery", () => {
  it("searches the target and keeps the label", () => {
    expect(splitQuery("Henry|shady figure")).toEqual({ name: "Henry", label: "shady figure" });
    expect(splitQuery("Henry")).toEqual({ name: "Henry" });
    expect(splitQuery("Henry| ")).toEqual({ name: "Henry", label: undefined });
  });
});

describe("linking selected text", () => {
  it("keeps the selected words as the link text", async () => {
    const editor = editorWith("A shady figure walked around the corner.\n");
    select(editor, "shady figure");
    const selected = linkableSelection(editor.state)!;
    expect(selected.text).toBe("shady figure");
    await linkTo(editor, selected, { type: "doc", doc: henry, label: selected.text }, { space: false });
    expect(markdown(editor)).toBe("A [[Henry Bob|shady figure]] walked around the corner.\n");
  });

  it("leaves a trailing space outside the link", () => {
    const editor = editorWith("A shady figure walked.\n");
    select(editor, "shady figure", 1);
    expect(linkableSelection(editor.state)).toMatchObject({ text: "shady figure" });
    const { from, to } = linkableSelection(editor.state)!;
    expect(editor.state.doc.textBetween(from, to)).toBe("shady figure");
  });

  it("drops the label when it matches the title", async () => {
    const editor = editorWith("Then Henry Bob left.\n");
    select(editor, "Henry Bob");
    const selected = linkableSelection(editor.state)!;
    await linkTo(editor, selected, { type: "doc", doc: henry, label: selected.text }, { space: false });
    expect(markdown(editor)).toBe("Then [[Henry Bob]] left.\n");
  });

  it("refuses selections that contain a link or span paragraphs", () => {
    const linked = editorWith("Ask [[Henry Bob]] now.\n");
    const all = TextSelection.create(linked.state.doc, 1, linked.state.doc.content.size - 1);
    linked.view.dispatch(linked.state.tr.setSelection(all));
    expect(linkableSelection(linked.state)).toBeNull();

    const twoParas = editorWith("One.\n\nTwo.\n");
    const across = TextSelection.create(twoParas.state.doc, 2, twoParas.state.doc.content.size - 2);
    twoParas.view.dispatch(twoParas.state.tr.setSelection(across));
    expect(linkableSelection(twoParas.state)).toBeNull();
  });
});
