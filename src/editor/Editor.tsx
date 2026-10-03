import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import { Focus, Placeholder } from "@tiptap/extensions";
import { actions, useStore } from "../store";
import { resolverFor } from "../project/links";
import { sectionFor, type Doc } from "../project/model";
import { baseExtensions } from "./extensions";
import { jsonToMarkdown, markdownToHtml } from "./markdown";
import {
  describeItem,
  entityLinkOptions,
  linkableSelection,
  linkTo,
  searchEntities,
  useLinkMenu,
  type LinkItem,
  type Selected,
} from "./linkMenu";

const SERIALIZE_DELAY = 250;

export function Editor({ doc }: { doc: Doc }) {
  const rev = useStore((s) => s.rev[doc.id] ?? 0);
  // Remount when the doc changes underneath us (rename, link-all, ...).
  return <DocEditor key={`${doc.id}#${rev}`} doc={doc} rev={rev} />;
}

function DocEditor({ doc, rev }: { doc: Doc; rev: number }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [picking, setPicking] = useState<(Selected & { left: number; top: number }) | null>(null);
  const placeholder = doc.kind === "manuscript" ? "Begin writing…  Type [[ to link a character, place or item." : "Describe…";

  const editor = useEditor({
    extensions: [
      ...baseExtensions(entityLinkOptions),
      Placeholder.configure({ placeholder }),
      Focus.configure({ mode: "deepest" }),
    ],
    content: markdownToHtml(doc.body),
    autofocus: doc.kind === "manuscript" ? "end" : false,
    editorProps: {
      attributes: { class: "prose", spellcheck: "true" },
      handleKeyDown: (view, event) => {
        if (!((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "k")) return false;
        event.preventDefault();
        if (view.state.selection.empty) {
          // Nothing selected: start a link here, same as typing [[.
          view.dispatch(view.state.tr.insertText("[["));
          return true;
        }
        const selected = linkableSelection(view.state);
        if (selected) {
          const start = view.coordsAtPos(selected.from);
          setPicking({ ...selected, left: start.left, top: view.coordsAtPos(selected.to).bottom + 6 });
        }
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(editor.getJSON()), SERIALIZE_DELAY);
    },
  });

  const commit = (json: ReturnType<NonNullable<typeof editor>["getJSON"]>) => {
    timer.current = undefined;
    // If the doc was rewritten externally since we mounted, our copy is stale.
    if ((useStore.getState().rev[doc.id] ?? 0) !== rev) return;
    actions.updateBody(doc.id, jsonToMarkdown(json));
  };

  useEffect(
    () => () => {
      if (timer.current && editor) {
        clearTimeout(timer.current);
        commit(editor.getJSON());
      }
    },
    [editor],
  );

  return (
    <div className="editor-scroll">
      <article className="page">
        <TitleField doc={doc} />
        <div className="editor-body">
          <EditorContent editor={editor} />
          {editor && <HoverCard editor={editor} />}
        </div>
      </article>
      <LinkMenu />
      {editor && picking && <SelectionPicker editor={editor} selected={picking} onClose={() => setPicking(null)} />}
    </div>
  );
}

function TitleField({ doc }: { doc: Doc }) {
  const [value, setValue] = useState(doc.title);
  useEffect(() => setValue(doc.title), [doc.title]);
  const commit = () => {
    if (value.trim() && value !== doc.title) void actions.renameDoc(doc.id, value);
    else setValue(doc.title);
  };
  return (
    <input
      className="doc-title"
      value={value}
      aria-label="Title"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          e.preventDefault();
          setValue(doc.title);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

/** Preview of a linked entity when hovering a link; Ctrl/Cmd-click opens it. */
function HoverCard({ editor }: { editor: TiptapEditor }) {
  const project = useStore((s) => s.project);
  const [hover, setHover] = useState<{ target: string; el: HTMLElement; rect: DOMRect } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resolve = useMemo(() => (project ? resolverFor(project) : () => undefined), [project]);

  useEffect(() => {
    const over = (e: MouseEvent) => {
      // Hold still while the writer is typing in the card.
      if (document.activeElement?.closest(".hover-card")) return;
      const el = (e.target as HTMLElement).closest?.(".ProseMirror .entity-link") as HTMLElement | null;
      if (el) {
        clearTimeout(hideTimer.current);
        setHover({ target: el.dataset.target ?? "", el, rect: el.getBoundingClientRect() });
      } else if (!(e.target as HTMLElement).closest?.(".hover-card")) {
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setHover(null), 200);
      }
    };
    const click = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.(".ProseMirror .entity-link") as HTMLElement | null;
      if (!el || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const target = resolve(el.dataset.target ?? "");
      if (target) void actions.openDoc(target.id);
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("click", click, true);
      clearTimeout(hideTimer.current);
    };
  }, [resolve]);

  if (!hover) return null;
  const target = resolve(hover.target);
  const style = { left: Math.min(hover.rect.left, window.innerWidth - 340), top: hover.rect.bottom + 6 };

  if (!target) {
    return (
      <div className="hover-card" style={style}>
        <div className="hover-kind" data-kind="missing">Not created yet</div>
        <div className="hover-title">{hover.target}</div>
        <LabelField editor={editor} el={hover.el} />
        <div className="hover-actions">
          {(["character", "location", "item"] as const).map((kind) => (
            <button key={kind} onClick={() => void actions.createDoc(kind, hover.target, false).then(() => setHover(null))}>
              + {sectionFor(kind).singular}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const summary = target.meta.summary ?? target.meta.synopsis;
  return (
    <div className="hover-card" style={style}>
      <div className="hover-kind" data-kind={target.kind}>
        {sectionFor(target.kind).singular}
      </div>
      <div className="hover-title">{target.title}</div>
      {summary ? <p className="hover-summary">{String(summary)}</p> : null}
      <LabelField editor={editor} el={hover.el} />
      <div className="hover-actions">
        <button onClick={() => void actions.openDoc(target.id)}>Open</button>
        <span className="hint">or Ctrl-click the link</span>
      </div>
    </div>
  );
}

/** Where `el` (a link's node view) sits in the document, if it's still there. */
function linkPos(editor: TiptapEditor, el: HTMLElement): number | null {
  if (!el.isConnected) return null;
  const pos = editor.view.posAtDOM(el, 0);
  // posAtDOM on a leaf node view can land just inside it rather than before it.
  for (const p of [pos, pos - 1]) if (editor.state.doc.nodeAt(p)?.type.name === "entityLink") return p;
  return null;
}

/** "Shown as": the link's own text, independent of what it points at. */
function LabelField({ editor, el }: { editor: TiptapEditor; el: HTMLElement }) {
  const pos = linkPos(editor, el);
  const node = pos === null ? null : editor.state.doc.nodeAt(pos);
  const current: string = node?.attrs.label ?? "";
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current, el]);
  if (pos === null || !node) return null;

  const commit = () => {
    const at = linkPos(editor, el);
    const link = at === null ? null : editor.state.doc.nodeAt(at);
    if (at === null || !link) return;
    const text = value.trim();
    const label = text && text !== link.attrs.target ? text : null;
    if (label !== (link.attrs.label ?? null)) {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(at, undefined, { ...link.attrs, label }));
    }
  };

  return (
    <label className="hover-label">
      <span className="hint">Shown as</span>
      <input
        value={value}
        placeholder={node.attrs.target}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            e.preventDefault();
            setValue(current);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
      />
    </label>
  );
}

function LinkMenuItems({ items, index, onPick, onHover }: {
  items: LinkItem[];
  index: number;
  onPick: (item: LinkItem) => void;
  onHover: (index: number) => void;
}) {
  return items.map((item, i) => (
    <li
      key={item.type === "doc" ? item.doc.id : `new-${item.kind}`}
      role="option"
      aria-selected={i === index}
      className={i === index ? "active" : undefined}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(item);
      }}
      onMouseEnter={() => onHover(i)}
    >
      <span className="dot" data-kind={item.type === "doc" ? item.doc.kind : item.kind} />
      <span className="link-menu-title">
        {item.type === "doc" ? item.doc.title : `“${item.title}”`}
        {item.label ? <em> as “{item.label}”</em> : item.type === "doc" && item.matched ? <em> · {item.matched}</em> : null}
      </span>
      <span className="link-menu-kind">{describeItem(item)}</span>
    </li>
  ));
}

function LinkMenu() {
  const { open, items, index, rect, pick } = useLinkMenu();
  if (!open || !rect || !items.length) return null;
  return (
    <ul className="link-menu" role="listbox" style={{ left: rect.left, top: rect.bottom + 6 }}>
      <LinkMenuItems
        items={items}
        index={index}
        onPick={(item) => pick?.(item)}
        onHover={(i) => useLinkMenu.setState({ index: i })}
      />
    </ul>
  );
}

/** Ctrl+K on selected text: pick what it links to; the selected words stay as the link text. */
function SelectionPicker({ editor, selected, onClose }: {
  editor: TiptapEditor;
  selected: Selected & { left: number; top: number };
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const items = useMemo(() => searchEntities(query), [query]);

  const pick = (item: LinkItem) => {
    onClose();
    void linkTo(editor, selected, { ...item, label: selected.text }, { space: false });
  };
  const cancel = () => {
    onClose();
    editor.commands.focus();
  };

  return (
    <div className="link-menu link-picker" style={{ left: selected.left, top: selected.top }}>
      <input
        autoFocus
        value={query}
        placeholder={`Link “${selected.text}” to…`}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onBlur={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (items.length) setIndex((index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
          } else if ((e.key === "Enter" || e.key === "Tab") && items[index]) {
            e.preventDefault();
            pick(items[index]);
          }
        }}
      />
      {items.length ? (
        <ul role="listbox">
          <LinkMenuItems items={items} index={index} onPick={pick} onHover={setIndex} />
        </ul>
      ) : null}
    </div>
  );
}
