import { useMemo, useState } from "react";
import { actions, useStore } from "../store";
import { namesOf } from "../project/links";
import { sectionFor } from "../project/model";

/** Ctrl+P: jump to any document by title or alias. */
export function QuickOpen() {
  const project = useStore((s) => s.project)!;
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(project.docs)
      .map((doc) => {
        const names = namesOf(doc).map((n) => n.toLowerCase());
        const score = !q ? 1 : names.some((n) => n.startsWith(q)) ? 0 : names.some((n) => n.includes(q)) ? 1 : -1;
        return { doc, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || a.doc.title.localeCompare(b.doc.title))
      .slice(0, 12)
      .map((r) => r.doc);
  }, [project.docs, query]);

  const close = () => actions.setQuickOpen(false);

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Go to chapter, character, place…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, results.length - 1));
            if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
            if (e.key === "Enter" && results[index]) void actions.openDoc(results[index].id);
          }}
        />
        <ul>
          {results.map((d, i) => (
            <li key={d.id} className={i === index ? "active" : undefined} onMouseEnter={() => setIndex(i)} onClick={() => void actions.openDoc(d.id)}>
              <span className="dot" data-kind={d.kind} />
              {d.title}
              <span className="link-menu-kind">{sectionFor(d.kind).singular}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
