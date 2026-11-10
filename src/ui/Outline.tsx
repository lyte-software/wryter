import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { actions, useStore } from "../store";
import { docsIn, wordCount, type Doc, type Status } from "../project/model";

const STATUSES: { id: Status; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "revised", label: "Revised" },
  { id: "final", label: "Final" },
];

/** Every chapter on one page, for planning: synopsis, status and length, in binder order. */
export function Outline() {
  const project = useStore((s) => s.project)!;
  const chapters = docsIn(project, "manuscript");
  const [dragging, setDragging] = useState<string | null>(null);
  // Rows only become draggable when pressed outside the synopsis and controls, so text selection still works.
  const [armed, setArmed] = useState<string | null>(null);
  const counts = useMemo(() => new Map(chapters.map((d) => [d.id, wordCount(d.body)])), [project.docs]);
  const total = chapters.reduce((n, d) => n + (counts.get(d.id) ?? 0), 0);
  const byStatus = STATUSES.map((s) => ({ ...s, n: chapters.filter((d) => d.meta.status === s.id).length })).filter((s) => s.n);

  const drop = (onto: string) => {
    if (!dragging || dragging === onto) return;
    const titles = chapters.map((d) => d.title).filter((t) => t !== dragging);
    titles.splice(titles.indexOf(onto), 0, dragging);
    void actions.reorder("manuscript", titles);
    setDragging(null);
  };

  return (
    <div className="editor-scroll">
      <div className="outline">
        <header className="outline-head">
          <h1>{project.file.title}</h1>
          <p className="hint">
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} · {total.toLocaleString()} words
            {byStatus.map((s) => ` · ${s.n} ${s.label.toLowerCase()}`).join("")}
          </p>
        </header>
        <ol>
          {chapters.map((doc, i) => (
            <li
              key={doc.id}
              draggable={armed === doc.id}
              onMouseDown={(e) => setArmed((e.target as HTMLElement).closest("textarea, select, button") ? null : doc.id)}
              onDragStart={() => setDragging(doc.title)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(doc.title)}
              onDragEnd={() => {
                setDragging(null);
                setArmed(null);
              }}
              className={dragging === doc.title ? "dragging" : undefined}
            >
              <Row doc={doc} n={i + 1} words={counts.get(doc.id) ?? 0} />
            </li>
          ))}
        </ol>
        <button className="small-btn" onClick={() => void actions.createDoc("manuscript", `Chapter ${chapters.length + 1}`, false)}>
          + New chapter
        </button>
      </div>
    </div>
  );
}

function Row({ doc, n, words }: { doc: Doc; n: number; words: number }) {
  return (
    <article className="outline-row">
      <span className="outline-num">{n}</span>
      <div className="outline-main">
        <div className="outline-line">
          <button className="outline-title" title="Open" onClick={() => void actions.openDoc(doc.id)}>
            {doc.title}
          </button>
          <select
            className="outline-status"
            data-status={doc.meta.status ?? ""}
            aria-label={`Status of ${doc.title}`}
            value={doc.meta.status ?? ""}
            onChange={(e) => actions.updateMeta(doc.id, { status: (e.currentTarget.value || undefined) as Status | undefined })}
          >
            <option value="">No status</option>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="outline-words">{words.toLocaleString()} words</span>
        </div>
        <Synopsis doc={doc} />
      </div>
    </article>
  );
}

/** Edit in place; grows with its text and saves when you leave it. */
function Synopsis({ doc }: { doc: Doc }) {
  const saved = String(doc.meta.synopsis ?? "");
  const [value, setValue] = useState(saved);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(saved), [saved]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={area}
      rows={1}
      className="outline-synopsis"
      placeholder="Add a synopsis…"
      aria-label={`Synopsis of ${doc.title}`}
      value={value}
      onInput={(e) => setValue(e.currentTarget.value)}
      onBlur={() => value.trim() !== saved && actions.updateMeta(doc.id, { synopsis: value.trim() || undefined })}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setValue(saved);
          requestAnimationFrame(() => e.currentTarget?.blur());
        }
      }}
    />
  );
}
