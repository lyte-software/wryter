import { create } from "zustand";
import { exitSuggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { actions, useStore } from "../store";
import { ENTITY_KINDS, sectionFor, type Doc, type Kind } from "../project/model";
import { namesOf } from "../project/links";
import { entityLinkKey, type EntityLinkOptions } from "./extensions";

export type LinkItem =
  | { type: "doc"; doc: Doc; matched?: string; label?: string }
  | { type: "create"; kind: Kind; title: string; label?: string };

interface MenuState {
  open: boolean;
  items: LinkItem[];
  index: number;
  rect: DOMRect | null;
  pick: ((item: LinkItem) => void) | null;
}

/** State for the `[[` popup, rendered by <LinkMenu />. */
export const useLinkMenu = create<MenuState>(() => ({ open: false, items: [], index: 0, rect: null, pick: null }));

const CREATE_KINDS: Kind[] = ["character", "location", "item"];

export function searchEntities(query: string): LinkItem[] {
  const project = useStore.getState().project;
  if (!project) return [];
  const q = query.trim().toLowerCase();
  const scored: { item: LinkItem; score: number }[] = [];

  for (const doc of Object.values(project.docs)) {
    if (!ENTITY_KINDS.includes(doc.kind)) continue;
    let best = Infinity;
    let matched: string | undefined;
    for (const [i, name] of namesOf(doc).entries()) {
      const n = name.toLowerCase();
      const score = !q ? 2 : n === q ? 0 : n.startsWith(q) ? 1 : n.includes(` ${q}`) ? 2 : n.includes(q) ? 3 : Infinity;
      if (score < best) {
        best = score;
        matched = i === 0 ? undefined : name;
      }
    }
    if (best < Infinity) scored.push({ item: { type: "doc", doc, matched }, score: best });
  }

  const items = scored
    .sort((a, b) => a.score - b.score || (a.item as { doc: Doc }).doc.title.localeCompare((b.item as { doc: Doc }).doc.title))
    .slice(0, 8)
    .map((s) => s.item);

  const exact = items.some((i) => i.type === "doc" && namesOf(i.doc).some((n) => n.toLowerCase() === q));
  if (q && !exact) {
    for (const kind of CREATE_KINDS) items.push({ type: "create", kind, title: query.trim() });
  }
  return items;
}

/** `[[Henry Bob|shady figure` searches for "Henry Bob" and shows "shady figure". */
export function splitQuery(query: string): { name: string; label?: string } {
  const bar = query.indexOf("|");
  if (bar === -1) return { name: query };
  return { name: query.slice(0, bar), label: query.slice(bar + 1).trim() || undefined };
}

/**
 * Replace `range` with a link to `item`. The link shows `item.label` if the writer
 * chose one, else the alias they matched, else the entity's title.
 */
export async function linkTo(editor: Editor, range: Range, item: LinkItem, { space = true } = {}) {
  const target = item.type === "doc" ? item.doc.title : item.title;
  const shown = item.label ?? (item.type === "doc" ? item.matched : undefined);
  const link = { type: "entityLink", attrs: { target, label: shown && shown !== target ? shown : null } };
  editor
    .chain()
    .focus()
    .insertContentAt(range, space ? [link, { type: "text", text: " " }] : [link])
    .run();
  if (item.type === "create") await actions.createDoc(item.kind, item.title, false);
}

export interface Selected {
  from: number;
  to: number;
  text: string;
}

/** The selected text, if it can become a link's label: one paragraph, no links inside. */
export function linkableSelection(state: EditorState): Selected | null {
  const { from, to, $from, $to, empty } = state.selection;
  if (empty || !$from.sameParent($to)) return null;
  let hasLink = false;
  state.doc.nodesBetween(from, to, (n) => void (hasLink ||= n.type.name === "entityLink"));
  if (hasLink) return null;
  const raw = state.doc.textBetween(from, to);
  const text = raw.trim();
  if (!text) return null;
  // Double-clicking a word often grabs its trailing space; keep that outside the link.
  return { from: from + raw.length - raw.trimStart().length, to: to - (raw.length - raw.trimEnd().length), text };
}

export const describeItem = (item: LinkItem) =>
  item.type === "doc" ? sectionFor(item.doc.kind).singular : `New ${sectionFor(item.kind).singular.toLowerCase()}`;

export const entityLinkOptions: Partial<EntityLinkOptions> = {
  kindOf(target) {
    const project = useStore.getState().project;
    if (!project) return undefined;
    const t = target.trim().toLowerCase();
    return Object.values(project.docs).find((d) => namesOf(d).some((n) => n.toLowerCase() === t))?.kind;
  },
  subscribe(onChange) {
    return useStore.subscribe((s, prev) => {
      if (s.project?.docs !== prev.project?.docs) onChange();
    });
  },
  suggestion: {
    items: ({ query }) => {
      const { name, label } = splitQuery(query);
      return searchEntities(name).map((item) => (label ? { ...item, label } : item));
    },
    command: ({ editor, range, props }) => void linkTo(editor, range, props as LinkItem),
    render: () => {
      const show = (p: SuggestionProps<LinkItem>) =>
        useLinkMenu.setState({
          open: true,
          items: p.items,
          index: 0,
          rect: p.clientRect?.() ?? null,
          pick: (item) => p.command(item),
        });
      return {
        onStart: show,
        onUpdate: show,
        onExit: () => useLinkMenu.setState({ open: false, items: [], pick: null }),
        onKeyDown({ event, view }: SuggestionKeyDownProps) {
          const s = useLinkMenu.getState();
          if (event.key === "Escape") {
            exitSuggestion(view, entityLinkKey);
            return true;
          }
          if (!s.open || !s.items.length) return false;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const step = event.key === "ArrowDown" ? 1 : -1;
            useLinkMenu.setState({ index: (s.index + step + s.items.length) % s.items.length });
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            s.pick?.(s.items[s.index]);
            return true;
          }
          return false;
        },
      };
    },
  },
};
