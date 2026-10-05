import { useEffect, useState } from "preact/hooks";
import { APP_NAME } from "../brand";
import { fs, isTauri } from "../fs";
import { listProjects } from "../project/io";
import { actions, useStore } from "../store";

/** Where a new project goes: a folder the user picks, or the library where there's no picker. */
const destination = (prompt: string) => (fs.canPickFolder ? fs.pickFolder(prompt) : fs.library());

export function Welcome() {
  const { recents, error } = useStore();
  const [title, setTitle] = useState("");
  const [library, setLibrary] = useState<{ root: string; title: string }[]>([]);

  useEffect(() => {
    void fs.library().then(async (dir) => dir && setLibrary(await listProjects(fs, dir)));
  }, []);

  const create = async () => {
    const parent = await destination("Where should the project folder go?");
    if (parent) await actions.newProject(parent, title || "Untitled Project");
  };

  const open = async () => {
    const root = await fs.pickFolder(`Open a ${APP_NAME} project folder`);
    if (root) await actions.openProject(root);
  };

  const sample = async () => {
    const parent = await destination("Where should the sample project go?");
    if (parent) await actions.openSample(parent);
  };

  return (
    <main className="welcome">
      <div className="welcome-card">
        <h1>{APP_NAME}</h1>
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
          {fs.canPickFolder && <button onClick={() => void open()}>Open folder…</button>}
          <button onClick={() => void sample()}>Open the sample project</button>
        </div>

        {error && <p className="error">{error}</p>}

        {!fs.canPickFolder ? (
          library.length > 0 && (
            <section className="recents">
              <h2>Your projects</h2>
              <ul>
                {library.map((p) => (
                  <li key={p.root}>
                    <button className="recent" onClick={() => void actions.openProject(p.root)}>
                      <strong>{p.title}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        ) : (
          recents.length > 0 && (
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
          )
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
