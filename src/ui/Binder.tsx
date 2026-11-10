import { useState } from "preact/hooks";
import { actions, useStore } from "../store";
import { SECTIONS, docsIn, type Kind, type Section } from "../project/model";

export function Binder() {
  const project = useStore((s) => s.project)!;
  return (
    <nav className="binder" aria-label="Binder">
      <header className="binder-head">
        <button className="project-title" title="Close project" onClick={() => void actions.closeProject()}>
          {project.file.title}
        </button>
      </header>
      <div className="binder-sections">
        {SECTIONS.map((s) => (
          <BinderSection key={s.kind} section={s} />
        ))}
      </div>
    </nav>
  );
}

function BinderSection({ section }: { section: Section }) {
  const project = useStore((s) => s.project)!;
  const openId = useStore((s) => (s.view === "doc" ? s.openId : null));
  const outline = useStore((s) => s.view === "outline");
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const docs = docsIn(project, section.kind);

  const drop = (onto: string) => {
    if (!dragging || dragging === onto) return;
    const titles = docs.map((d) => d.title).filter((t) => t !== dragging);
    titles.splice(titles.indexOf(onto), 0, dragging);
    void actions.reorder(section.kind, titles);
    setDragging(null);
  };

  return (
    <section className="binder-section">
      <div className="section-head">
        <button className="section-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          <span className="chev">{collapsed ? "▸" : "▾"}</span>
          {section.label}
          <span className="count">{docs.length}</span>
        </button>
        {section.kind === "manuscript" && (
          <button
            className="icon-btn outline-btn"
            title="Outline (Ctrl+Shift+O)"
            aria-label="Outline"
            aria-pressed={outline}
            onClick={() => void actions.setView(outline ? "doc" : "outline")}
          >
            ☰
          </button>
        )}
        <button
          className="icon-btn"
          title={`New ${section.singular.toLowerCase()}`}
          onClick={() => void actions.createDoc(section.kind, newTitle(section.kind, docs.length))}
        >
          +
        </button>
      </div>
      {!collapsed && (
        <ul>
          {docs.map((d) => (
            <li
              key={d.id}
              draggable
              onDragStart={() => setDragging(d.title)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(d.title)}
              onDragEnd={() => setDragging(null)}
              className={[d.id === openId && "active", dragging === d.title && "dragging"].filter(Boolean).join(" ")}
            >
              <button className="doc-item" onClick={() => void actions.openDoc(d.id)} title={d.title}>
                <span className="dot" data-kind={d.kind} />
                <span className="doc-name">{d.title}</span>
                {d.meta.status ? <span className="status-pip" data-status={d.meta.status} /> : null}
              </button>
              <button
                className="icon-btn delete"
                title="Delete"
                onClick={() => {
                  if (confirm(`Delete “${d.title}”? This removes the file from disk.`)) void actions.deleteDoc(d.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function newTitle(kind: Kind, count: number): string {
  return kind === "manuscript" ? `Chapter ${count + 1}` : `New ${SECTIONS.find((s) => s.kind === kind)!.singular}`;
}
