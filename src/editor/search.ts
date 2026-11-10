/**
 * Find and replace inside the open document. Matches are case-insensitive and include the
 * text a link shows, so searching "Mara" finds `[[Mara Venn|Mara]]` too. Replacing never
 * edits inside a link: rename the linked page for that.
 */
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { fold } from "../project/search";

export interface Match {
  from: number;
  to: number;
  /** Touches a link, so replace leaves it alone. */
  inLink: boolean;
}

export function findMatches(doc: PMNode, query: string): Match[] {
  const q = fold(query);
  const out: Match[] = [];
  if (!q) return out;
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    // One entry per UTF-16 unit of what the reader sees, with the document range it came from.
    let text = "";
    const from: number[] = [];
    const to: number[] = [];
    const link: boolean[] = [];
    const add = (s: string, start: number, end: number, isLink: boolean, step: boolean) => {
      for (let i = 0; i < s.length; i++) {
        text += s[i];
        from.push(step ? start + i : start);
        to.push(step ? start + i + 1 : end);
        link.push(isLink);
      }
    };
    block.forEach((child, offset) => {
      const pos = blockPos + 1 + offset;
      if (child.isText) add(child.text!, pos, pos + child.nodeSize, false, true);
      else if (child.type.name === "entityLink") {
        const shown = String(child.attrs.label ?? child.attrs.target ?? "") || "￼";
        add(shown, pos, pos + child.nodeSize, true, false);
      } else add(child.type.name === "hardBreak" ? "\n" : "￼", pos, pos + child.nodeSize, false, false);
    });
    const folded = fold(text);
    for (let i = folded.indexOf(q); i !== -1; i = folded.indexOf(q, i + q.length)) {
      const j = i + q.length - 1;
      out.push({ from: from[i], to: to[j], inLink: link.slice(i, j + 1).some(Boolean) });
    }
    return false;
  });
  return out;
}

interface SearchState {
  query: string;
  matches: Match[];
  /** Index of the current match, or -1. */
  current: number;
  decorations: DecorationSet;
}

interface SearchMeta {
  query?: string;
  current?: number;
}

export const searchKey = new PluginKey<SearchState>("search");

function build(doc: PMNode, query: string, matches: Match[], current: number): SearchState {
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? "search-match current" : "search-match" })),
  );
  return { query, matches, current, decorations };
}

const clamp = (i: number, n: number) => (n === 0 ? -1 : Math.min(Math.max(i, 0), n - 1));

export const Search = Extension.create({
  name: "search",
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: (_, state) => build(state.doc, "", [], -1),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
            if (!meta && !tr.docChanged) return prev;
            const query = meta?.query ?? prev.query;
            const matches = findMatches(state.doc, query);
            return build(state.doc, query, matches, clamp(meta?.current ?? prev.current, matches.length));
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

export const searchState = (state: EditorState) => searchKey.getState(state)!;

/** Highlight `query` and make match `current` the current one (selected and scrolled to). */
export function setSearch(view: EditorView, query: string, current = 0) {
  view.dispatch(view.state.tr.setMeta(searchKey, { query, current }));
  if (query) goTo(view, current);
}

export function goTo(view: EditorView, index: number) {
  const { matches } = searchState(view.state);
  if (!matches.length) return;
  const i = ((index % matches.length) + matches.length) % matches.length;
  const m = matches[i];
  view.dispatch(
    view.state.tr
      .setMeta(searchKey, { current: i })
      .setSelection(TextSelection.create(view.state.doc, m.from, m.to))
      .scrollIntoView(),
  );
}

export const step = (view: EditorView, by: 1 | -1) => goTo(view, searchState(view.state).current + by);

/** Replace the current match and move on to the next. Matches inside links are skipped. */
export function replaceCurrent(view: EditorView, replacement: string) {
  const { matches, current } = searchState(view.state);
  const m = matches[current];
  if (!m) return;
  if (m.inLink) return step(view, 1);
  view.dispatch(view.state.tr.insertText(replacement, m.from, m.to));
  // Move to the first match after the new text (which may itself contain the query).
  const next = searchState(view.state).matches.findIndex((x) => x.from >= m.from + replacement.length);
  goTo(view, next === -1 ? 0 : next);
}

/** Replace every match outside a link. Returns how many were replaced. */
export function replaceAll(view: EditorView, replacement: string): number {
  const targets = searchState(view.state).matches.filter((m) => !m.inLink);
  if (!targets.length) return 0;
  const tr = view.state.tr;
  for (const m of [...targets].reverse()) tr.insertText(replacement, m.from, m.to);
  view.dispatch(tr);
  return targets.length;
}
