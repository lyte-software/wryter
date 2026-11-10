import { useMemo } from "preact/hooks";
import { actions, THEMES, useStore, type Theme } from "../store";
import { wordCount, type Doc } from "../project/model";

export function StatusBar({ doc }: { doc: Doc | null }) {
  const project = useStore((s) => s.project)!;
  const { save, error, focus, raw, theme, conflicts } = useStore();
  const conflicted = Object.keys(conflicts);
  const total = useMemo(
    () => Object.values(project.docs).reduce((n, d) => n + (d.kind === "manuscript" ? wordCount(d.body) : 0), 0),
    [project.docs],
  );
  const words = doc ? wordCount(doc.body) : 0;

  return (
    <footer className="statusbar">
      <span>{doc ? `${words.toLocaleString()} words` : ""}</span>
      <span className="muted">Manuscript {total.toLocaleString()}</span>
      <span className="spacer" />
      {conflicted.length ? (
        <button className="save save-error" title="Open the file that changed" onClick={() => void actions.openDoc(conflicted[0])}>
          Changed on disk{conflicted.length > 1 ? ` (${conflicted.length})` : ""}
        </button>
      ) : (
        <span className={`save save-${save}`} title={error ?? undefined}>
          {save === "saving" ? "Saving…" : save === "error" ? "Save failed" : "Saved"}
        </span>
      )}
      <button onClick={() => actions.setQuickOpen(true)} title="Quick open (Ctrl+P)">
        Go to…
      </button>
      <button onClick={() => actions.setExportOpen(true)} title="Export the manuscript (Ctrl+E)">
        Export…
      </button>
      <select value={theme} onChange={(e) => actions.setTheme(e.currentTarget.value as Theme)} title="Theme" aria-label="Theme">
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button onClick={() => actions.setRaw(!raw)} title="Show links as [[Name|Text]]" aria-pressed={raw}>
        Raw
      </button>
      <button onClick={() => actions.setFocus(!focus)} title="Focus mode (Ctrl+Shift+F)">
        Focus
      </button>
    </footer>
  );
}
