import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { baseExtensions } from "./extensions";
import { jsonToMarkdown, markdownToHtml } from "./markdown";
import { replaceAll, replaceCurrent, Search, searchState, setSearch, step } from "./search";

// Destroyed after each test, or ProseMirror's DOM observer timer can fire after jsdom is gone.
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function editorFor(md: string) {
  const editor = new Editor({ extensions: [...baseExtensions(), Search], content: markdownToHtml(md) });
  editors.push(editor);
  return editor;
}
const md = (editor: Editor) => jsonToMarkdown(editor.getJSON());
const selected = (editor: Editor) => editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);

describe("find in the document", () => {
  it("highlights every match, including link text, and steps through them", () => {
    const editor = editorFor("Mara saw *MARA*.\n\n[[Mara Venn|Mara]] waved.\n");
    setSearch(editor.view, "mara");
    const { matches, current } = searchState(editor.state);
    expect(matches.map((m) => m.inLink)).toEqual([false, false, true]);
    expect(current).toBe(0);
    expect(selected(editor)).toBe("Mara");
    expect(editor.view.dom.querySelectorAll(".search-match").length).toBe(3);

    step(editor.view, 1);
    expect(searchState(editor.state).current).toBe(1);
    step(editor.view, 1);
    step(editor.view, 1);
    expect(searchState(editor.state).current).toBe(0); // wraps around
    step(editor.view, -1);
    expect(searchState(editor.state).current).toBe(2);
  });

  it("starts on a given match and clears with an empty query", () => {
    const editor = editorFor("one two one two one\n");
    setSearch(editor.view, "one", 2);
    expect(searchState(editor.state).current).toBe(2);
    setSearch(editor.view, "");
    expect(searchState(editor.state).matches).toEqual([]);
    expect(editor.view.dom.querySelectorAll(".search-match").length).toBe(0);
  });

  it("keeps up as the text changes", () => {
    const editor = editorFor("cat\n");
    setSearch(editor.view, "cat");
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " cat");
    expect(searchState(editor.state).matches.length).toBe(2);
  });
});

describe("replace", () => {
  it("replaces all, keeping formatting and leaving links alone", () => {
    const editor = editorFor("Mara saw *Mara*.\n\n[[Mara Venn|Mara]] waved.\n");
    setSearch(editor.view, "mara");
    expect(replaceAll(editor.view, "Nell")).toBe(2);
    expect(md(editor)).toBe("Nell saw *Nell*.\n\n[[Mara Venn|Mara]] waved.\n");
  });

  it("replaces one at a time, even when the new text contains the query", () => {
    const editor = editorFor("Mara and Mara\n");
    setSearch(editor.view, "mara");
    replaceCurrent(editor.view, "Marah");
    expect(md(editor)).toBe("Marah and Mara\n");
    expect(searchState(editor.state).current).toBe(1); // moved past "Marah"
    replaceCurrent(editor.view, "Marah");
    expect(md(editor)).toBe("Marah and Marah\n");
  });

  it("skips a link match instead of editing it", () => {
    const editor = editorFor("[[Mara Venn|Mara]] and Mara\n");
    setSearch(editor.view, "mara");
    replaceCurrent(editor.view, "Nell");
    expect(md(editor)).toBe("[[Mara Venn|Mara]] and Mara\n");
    expect(searchState(editor.state).current).toBe(1);
  });
});
