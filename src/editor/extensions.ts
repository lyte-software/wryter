import { Node, mergeAttributes, nodeInputRule, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";

export interface EntityLinkOptions {
  /** Popup wiring for the `[[` picker; omitted in tests / static rendering. */
  suggestion?: Omit<SuggestionOptions, "editor">;
  /** Called by the node view to colour a link by what it points at. */
  kindOf?: (target: string) => string | undefined;
  /** Lets node views re-colour when the project changes. Returns an unsubscribe. */
  subscribe?: (onChange: () => void) => () => void;
  /** Raw mode: links stay as typed `[[...]]` text, so nothing converts them to nodes. */
  raw?: boolean;
}

export const entityLinkKey = new PluginKey("entityLinkSuggestion");

/**
 * An inline, atomic reference to a character / location / item / note.
 * Serialised as `[[target]]` or `[[target|label]]`.
 */
export const EntityLink = Node.create<EntityLinkOptions>({
  name: "entityLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {};
  },

  addAttributes() {
    return {
      target: { default: "", parseHTML: (el) => el.getAttribute("data-target") ?? el.textContent ?? "" },
      label: { default: null, parseHTML: (el) => el.getAttribute("data-label") },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-entity-link]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs: Record<string, string> = { "data-entity-link": "", "data-target": node.attrs.target };
    if (node.attrs.label) attrs["data-label"] = node.attrs.label;
    return ["span", mergeAttributes(HTMLAttributes, attrs, { class: "entity-link" }), node.attrs.label ?? node.attrs.target];
  },

  renderText({ node }) {
    return node.attrs.label ?? node.attrs.target;
  },

  addNodeView() {
    const { kindOf, subscribe } = this.options;
    return ({ node: initial }) => {
      let node = initial;
      const dom = document.createElement("span");
      dom.className = "entity-link";
      dom.setAttribute("data-entity-link", "");
      const paint = () => {
        dom.dataset.target = node.attrs.target;
        dom.dataset.kind = kindOf?.(node.attrs.target) ?? "missing";
        dom.textContent = node.attrs.label ?? node.attrs.target;
      };
      paint();
      const unsubscribe = subscribe?.(paint);
      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          paint();
          return true;
        },
        destroy: () => unsubscribe?.(),
      };
    };
  },

  addInputRules() {
    if (this.options.raw) return [];
    // Typing a complete `[[Name]]` or `[[Name|label]]` by hand converts it too.
    return [
      nodeInputRule({
        find: /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]$/,
        type: this.type,
        getAttributes: (m) => ({ target: m[1].trim(), label: m[2]?.trim() ?? null }),
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { suggestion } = this.options;
    if (!suggestion) return [];
    return [
      Suggestion({
        pluginKey: entityLinkKey,
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: null,
        // A closed `[[...]]` is finished; without this the match runs on past it in raw text.
        allow: ({ state, range }) => !state.doc.textBetween(range.from, range.to).includes("]]"),
        ...suggestion,
        editor: this.editor,
      }),
    ];
  },
});

export function baseExtensions(entity: Partial<EntityLinkOptions> = {}): Extensions {
  return [
    StarterKit.configure({
      // Prose, not code — and nothing that Markdown can't hold.
      code: false,
      codeBlock: false,
      link: false,
      underline: false,
      heading: { levels: [1, 2, 3] },
    }),
    EntityLink.configure(entity),
  ];
}
