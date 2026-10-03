import { useEffect } from "preact/hooks";
import { actions, useStore } from "./store";
import { Editor } from "./editor/Editor";
import { Binder } from "./ui/Binder";
import { Inspector } from "./ui/Inspector";
import { StatusBar } from "./ui/StatusBar";
import { QuickOpen } from "./ui/QuickOpen";
import { Welcome } from "./ui/Welcome";

export function App() {
  const { project, openId, focus, theme, quickOpen } = useStore();
  const doc = project && openId ? project.docs[openId] ?? null : null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        actions.setFocus(!useStore.getState().focus);
      } else if (mod && e.key.toLowerCase() === "p" && useStore.getState().project) {
        e.preventDefault();
        actions.setQuickOpen(true);
      } else if (e.key === "Escape" && !e.defaultPrevented && useStore.getState().focus && !useStore.getState().quickOpen) {
        // defaultPrevented: a popup or field already used this Escape to close or cancel.
        actions.setFocus(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!project) return <Welcome />;

  return (
    <div className={`workspace${focus ? " focus" : ""}`}>
      <Binder />
      <main className="center">
        {doc ? (
          <Editor doc={doc} />
        ) : (
          <div className="empty-state">Pick something from the binder, or press Ctrl+P.</div>
        )}
        <StatusBar doc={doc} />
      </main>
      {doc && <Inspector doc={doc} />}
      {quickOpen && <QuickOpen />}
    </div>
  );
}
