import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { actions, useStore } from "../store";
import { namesOf } from "../project/links";
import { sectionFor } from "../project/model";
import { searchProject } from "../project/search";

/** Ctrl+P: jump to any document by title or alias, or find words anywhere in the project. */
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
  const hits = useMemo(() => searchProject(project, query), [project, query]);
  const titles = hits.length ? results.slice(0, 6) : results;
  const total = titles.length + hits.length;
  const choose = (i: number) => {
    if (i < titles.length) void actions.openDoc(titles[i].id);
    else if (hits[i - titles.length]) void actions.openSearchResult(hits[i - titles.length].doc.id, query.trim());
  };

  const close = () => actions.setQuickOpen(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => document.querySelector(".palette li.active")?.scrollIntoView?.({ block: "nearest" }), [index]);

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          placeholder="Go to a chapter, character or place, or search the text…"
          value={query}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, total - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter") choose(index);
          }}
        />
        <ul>
          {titles.map((d, i) => (
            <li key={d.id} className={i === index ? "active" : undefined} onMouseEnter={() => setIndex(i)} onClick={() => choose(i)}>
              <span className="dot" data-kind={d.kind} />
              {d.title}
              <span className="link-menu-kind">{sectionFor(d.kind).singular}</span>
            </li>
          ))}
          {hits.length > 0 && <li className="palette-heading">In the text</li>}
          {hits.map((hit, j) => {
            const i = titles.length + j;
            return (
              <li
                key={`text:${hit.doc.id}`}
                className={`text-hit${i === index ? " active" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(i)}
              >
                <span className="text-hit-head">
                  <span className="dot" data-kind={hit.doc.kind} />
                  {hit.doc.title}
                  <span className="link-menu-kind">{hit.count === 1 ? "1 match" : `${hit.count} matches`}</span>
                </span>
                <span className="text-hit-excerpt">
                  {hit.before}
                  <mark>{hit.match}</mark>
                  {hit.after}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
