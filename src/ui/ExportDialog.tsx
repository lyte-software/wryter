import { useMemo, useState } from "preact/hooks";
import { actions, useStore } from "../store";
import { exportSettings, manuscript } from "../export/compile";
import type { ChapterHeadings, ExportFormat, ExportSettings } from "../project/model";

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "docx", label: "Word document", hint: "Standard manuscript format, for editors and agents." },
  { id: "markdown", label: "Markdown", hint: "One plain text file. Works with Pandoc for ebooks." },
  { id: "html", label: "Web page", hint: "Read it in a browser, or print it to PDF." },
];

/** Compile the manuscript into one file. */
export function ExportDialog() {
  const project = useStore((s) => s.project)!;
  const [settings, setSettings] = useState<ExportSettings>(() => exportSettings(project));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const m = useMemo(() => manuscript(project, settings), [project, settings]);
  const update = (patch: Partial<ExportSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setResult(null);
  };
  const close = () => actions.setExportOpen(false);

  const run = async () => {
    setBusy(true);
    try {
      const path = await actions.exportManuscript({ ...settings, author: settings.author.trim() });
      if (path) setResult({ ok: true, message: `Saved to ${path}` });
    } catch (err) {
      setResult({ ok: false, message: `Couldn't export: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="palette export"
        aria-label="Export manuscript"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault(); // so focus mode doesn't also take this Escape
          close();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <h2>Export manuscript</h2>

        <fieldset className="formats">
          {FORMATS.map((f) => (
            <label key={f.id} className={settings.format === f.id ? "active" : undefined}>
              <input type="radio" name="format" checked={settings.format === f.id} onChange={() => update({ format: f.id })} />
              <span>
                <strong>{f.label}</strong>
                <span className="hint">{f.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span>Chapter headings</span>
          <select value={settings.headings} onChange={(e) => update({ headings: e.currentTarget.value as ChapterHeadings })}>
            <option value="titles">Chapter titles from the binder</option>
            <option value="numbers">Chapter 1, Chapter 2…</option>
            <option value="none">None, just start a new page</option>
          </select>
        </label>

        <label className="field">
          <span>Author</span>
          <input value={settings.author} placeholder="For the title page" onInput={(e) => update({ author: e.currentTarget.value })} />
        </label>

        {result && <p className={result.ok ? "export-done" : "export-error"}>{result.message}</p>}

        <footer>
          <span className="hint">
            {m.chapters.length} {m.chapters.length === 1 ? "chapter" : "chapters"} · {m.words.toLocaleString()} words
          </span>
          <button type="button" className="small-btn" onClick={close}>
            {result?.ok ? "Done" : "Cancel"}
          </button>
          <button type="submit" className="small-btn primary" disabled={busy || !m.chapters.length}>
            {busy ? "Exporting…" : "Export…"}
          </button>
        </footer>
      </form>
    </div>
  );
}
