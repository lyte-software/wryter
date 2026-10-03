import { useState } from "preact/hooks";
import { fs, isTauri } from "../fs";
import { actions, useStore } from "../store";

/** Browser builds keep projects in localStorage under this pseudo-folder. */
const BROWSER_ROOT = "/browser";

export function Welcome() {
  const { recents, error } = useStore();
  const [title, setTitle] = useState("");

  const create = async () => {
    const parent = isTauri ? await fs.pickFolder("Where should the project folder go?") : BROWSER_ROOT;
    if (parent) await actions.newProject(parent, title || "Untitled Project");
  };

  const open = async () => {
    const root = await fs.pickFolder("Open an AuthorBox project folder");
    if (root) await actions.openProject(root);
  };

  const sample = async () => {
    const parent = isTauri ? await fs.pickFolder("Where should the sample project go?") : BROWSER_ROOT;
    if (parent) await actions.openSample(parent);
  };

  return (
    <main className="welcome">
      <div className="welcome-card">
        <h1>AuthorBox</h1>
        <p className="tagline">A quiet place to write, and to keep track of everyone in it.</p>

        <form
          className="new-project"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input placeholder="Name your project" value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
          <button type="submit" className="primary">
            New project
          </button>
        </form>

        <div className="welcome-actions">
          {isTauri && <button onClick={() => void open()}>Open folder…</button>}
          <button onClick={() => void sample()}>Open the sample project</button>
        </div>

        {error && <p className="error">{error}</p>}

        {recents.length > 0 && (
          <section className="recents">
            <h2>Recent</h2>
            <ul>
              {recents.map((r) => (
                <li key={r.root}>
                  <button className="recent" onClick={() => void actions.openProject(r.root)}>
                    <strong>{r.title}</strong>
                    <span>{r.root}</span>
                  </button>
                  <button className="icon-btn" title="Remove from list" onClick={() => actions.forgetRecent(r.root)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isTauri && (
          <p className="note">
            Running in the browser: projects are stored in this browser only. The desktop app reads and writes real
            Markdown folders.
          </p>
        )}
      </div>
    </main>
  );
}
