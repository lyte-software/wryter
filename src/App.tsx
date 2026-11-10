import { useEffect } from "preact/hooks";
import { actions, useStore } from "./store";
import { Editor } from "./editor/Editor";
import { Binder } from "./ui/Binder";
import { Inspector } from "./ui/Inspector";
import { StatusBar } from "./ui/StatusBar";
import { QuickOpen } from "./ui/QuickOpen";
import { ExportDialog } from "./ui/ExportDialog";
import { Outline } from "./ui/Outline";
import { Welcome } from "./ui/Welcome";

export function App() {
  const { project, openId, focus, theme, quickOpen, exportOpen, view } = useStore();
  const outline = view === "outline";
  const doc = project && openId && !outline ? project.docs[openId] ?? null : null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "o" && useStore.getState().project) {
        e.preventDefault();
        void actions.setView(useStore.getState().view === "outline" ? "doc" : "outline");
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        actions.setFocus(!useStore.getState().focus);
      } else if (mod && e.key.toLowerCase() === "p" && useStore.getState().project) {
        e.preventDefault();
        actions.setQuickOpen(true);
      } else if (mod && !e.shiftKey && (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "h") && useStore.getState().openId && useStore.getState().view === "doc") {
        e.preventDefault();
        // Start from the selected words, when they're in the page and on one line.
        const inPage = document.activeElement?.closest(".ProseMirror");
        const picked = inPage ? (window.getSelection()?.toString().trim() ?? "") : "";
        actions.openFind({
          query: picked && !picked.includes("\n") && picked.length <= 100 ? picked : undefined,
          replace: e.key.toLowerCase() === "h" ? true : undefined,
        });
      } else if (mod && e.key.toLowerCase() === "e" && !e.shiftKey && useStore.getState().project) {
        e.preventDefault();
        actions.setExportOpen(true);
      } else if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        useStore.getState().focus &&
        !useStore.getState().quickOpen &&
        !useStore.getState().exportOpen
      ) {
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
        {outline ? (
          <Outline />
        ) : doc ? (
          <Editor doc={doc} />
        ) : (
          <div className="empty-state">Pick something from the binder, or press Ctrl+P.</div>
        )}
        <StatusBar doc={doc} />
      </main>
      {doc && <Inspector doc={doc} />}
      {quickOpen && <QuickOpen />}
      {exportOpen && <ExportDialog />}
    </div>
  );
}
