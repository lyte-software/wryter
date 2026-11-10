import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import { Focus, Placeholder } from "@tiptap/extensions";
import { APP_NAME } from "../brand";
import { actions, useStore } from "../store";
import { resolverFor } from "../project/links";
import { sectionFor, type Doc } from "../project/model";
import { baseExtensions } from "./extensions";
import { replaceAll, replaceCurrent, Search, searchState, setSearch, step } from "./search";
import { jsonToMarkdown, linkifyText, markdownToHtml } from "./markdown";
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
  const raw = useStore((s) => s.raw);
  // Remount when the doc changes underneath us (rename, link-all, ...) or the view mode flips.
  return (
    <>
      <ConflictBanner id={doc.id} />
      <DocEditor key={`${doc.id}#${rev}${raw ? "#raw" : ""}`} doc={doc} rev={rev} raw={raw} />
    </>
  );
}

/** Shown when another app changed this file while it had edits not yet saved. */
function ConflictBanner({ id }: { id: string }) {
  const conflicted = useStore((s) => id in s.conflicts);
  if (!conflicted) return null;
  return (
    <div className="conflict" role="alert">
      <span>This file was changed outside {APP_NAME} while you were editing it. Saving is paused until you pick a version.</span>
      <span className="conflict-actions">
        <button className="small-btn" onClick={() => void actions.resolveConflict(id, "disk")}>
          Use the other version
        </button>
        <button className="small-btn" onClick={() => void actions.resolveConflict(id, "mine")}>
          Keep mine
        </button>
      </span>
    </div>
  );
}

function DocEditor({ doc, rev, raw }: { doc: Doc; rev: number; raw: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [picking, setPicking] = useState<(Selected & { left: number; top: number }) | null>(null);
  const placeholder = doc.kind === "manuscript" ? "Begin writing…  Type [[ to link a character, place or item." : "Describe…";

  const editor = useEditor({
    extensions: [
      ...baseExtensions({ ...entityLinkOptions, raw }),
      Placeholder.configure({ placeholder }),
      Focus.configure({ mode: "deepest" }),
      Search,
    ],
    content: markdownToHtml(doc.body, { raw }),
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
    actions.updateBody(doc.id, jsonToMarkdown(raw ? linkifyText(json) : json));
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
      {editor && <FindBar editor={editor} />}
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

/** Ctrl+F / Ctrl+H: find and replace in this doc. The query lives in the store. */
function FindBar({ editor }: { editor: TiptapEditor }) {
  const find = useStore((s) => s.find);
  const [, rerender] = useState(0);
  const [replacement, setReplacement] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => rerender((n) => n + 1);
    editor.on("transaction", update);
    return () => void editor.off("transaction", update);
  }, [editor]);

  // Highlight whenever the query changes (typing, or a project search result).
  const open = find !== null;
  useEffect(() => {
    if (!editor.isDestroyed) setSearch(editor.view, find?.query ?? "", find?.start ?? 0);
    setDone(null);
  }, [editor, open, find?.query, find?.start]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [find?.seq]);

  if (!find || editor.isDestroyed) return null;
  const { matches, current } = searchState(editor.state);
  const inLinks = matches.filter((m) => m.inLink).length;
  const view = editor.view;
  const close = (e: { preventDefault(): void }) => {
    e.preventDefault(); // so focus mode doesn't also take this Escape
    actions.closeFind();
    editor.commands.focus();
  };

  return (
    <div className="find-dock">
      <div className="find-bar" role="search">
        <div className="find-row">
          <input
            ref={input}
            placeholder="Find"
            aria-label="Find"
            value={find.query}
            onInput={(e) => actions.setFindQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") step(view, e.shiftKey ? -1 : 1);
              if (e.key === "Escape") close(e);
            }}
          />
          <span className="find-count">{find.query ? (matches.length ? `${current + 1} of ${matches.length}` : "No matches") : ""}</span>
          <button title="Previous (Shift+Enter)" aria-label="Previous match" onClick={() => step(view, -1)} disabled={!matches.length}>
            ↑
          </button>
          <button title="Next (Enter)" aria-label="Next match" onClick={() => step(view, 1)} disabled={!matches.length}>
            ↓
          </button>
          <button title="Replace (Ctrl+H)" aria-pressed={find.replace} onClick={() => actions.openFind({ replace: !find.replace })}>
            Replace
          </button>
          <button title="Close (Esc)" aria-label="Close find" onClick={close}>
            ×
          </button>
        </div>
        {find.replace && (
          <div className="find-row">
            <input
              placeholder="Replace with"
              aria-label="Replace with"
              value={replacement}
              onInput={(e) => setReplacement(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") replaceCurrent(view, replacement);
                if (e.key === "Escape") close(e);
              }}
            />
            <button onClick={() => replaceCurrent(view, replacement)} disabled={!matches.length}>
              Replace
            </button>
            <button
              onClick={() => {
                const n = replaceAll(view, replacement);
                setDone(`Replaced ${n}`);
              }}
              disabled={matches.length === inLinks}
            >
              All
            </button>
            <span className="find-count" title="Rename the linked page to change these">
              {done ?? (inLinks ? `${inLinks} in links, left as they are` : "")}
            </span>
          </div>
        )}
      </div>
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
      onInput={(e) => setValue(e.currentTarget.value)}
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
      } else if ((e.target as HTMLElement).closest?.(".hover-card")) {
        // Crossing the gap from link to card started a hide; reaching the card cancels it.
        clearTimeout(hideTimer.current);
      } else {
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
        onInput={(e) => setValue(e.currentTarget.value)}
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
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

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
        ref={input}
        value={query}
        placeholder={`Link “${selected.text}” to…`}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
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
