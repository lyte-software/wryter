import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { actions, THEMES, useStore, type Theme } from "../store";
import { wordCount, type Doc } from "../project/model";
import { manuscriptWords, parseGoal, wordsToday } from "../project/goals";

const n = (x: number) => x.toLocaleString();

export function StatusBar({ doc }: { doc: Doc | null }) {
  const project = useStore((s) => s.project)!;
  const { save, error, focus, raw, theme, conflicts } = useStore();
  const conflicted = Object.keys(conflicts);
  const total = useMemo(() => manuscriptWords(project), [project.docs]);
  const today = wordsToday(project.file, total);
  const { daily, total: goal } = project.file.goals ?? {};
  const words = doc ? wordCount(doc.body) : 0;
  const [goalsOpen, setGoalsOpen] = useState(false);

  return (
    <>
      {daily ? <GoalBar today={today} daily={daily} /> : null}
      <footer className="statusbar">
        <span>{doc ? `${n(words)} words` : ""}</span>
        <span className="goals-anchor">
          <button
            className={daily && today >= daily ? "goal-met" : "muted"}
            title={daily ? "Words today. Click to change your goals." : "Words today. Click to set a daily goal."}
            onClick={() => setGoalsOpen(!goalsOpen)}
          >
            Today {n(today)}
            {daily ? ` / ${n(daily)}` : ""}
            {daily && today >= daily ? " ✓" : ""}
          </button>
          <button className={goal && total >= goal ? "goal-met" : "muted"} title="Manuscript words" onClick={() => setGoalsOpen(!goalsOpen)}>
            Manuscript {n(total)}
            {goal ? ` / ${n(goal)}` : ""}
          </button>
          {goalsOpen && <GoalsPopover onClose={() => setGoalsOpen(false)} />}
        </span>
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
    </>
  );
}

/**
 * A hairline above the status bar that fills toward today's goal and drains as words
 * are cut. It stays (dimmed) in focus mode, when the status bar itself fades away.
 */
function GoalBar({ today, daily }: { today: number; daily: number }) {
  const progress = Math.min(today / daily, 1);
  const label = `${n(today)} of ${n(daily)} words today (${Math.floor((today / daily) * 100)}%)`;
  return (
    <div
      className={`goal-bar${progress >= 1 ? " met" : ""}`}
      role="progressbar"
      aria-label="Today's word goal"
      aria-valuemin={0}
      aria-valuemax={daily}
      aria-valuenow={Math.min(today, daily)}
      aria-valuetext={label}
      title={label}
    >
      <span className="goal-fill" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

/** Set the daily and manuscript word goals. Saved however it closes, except Escape; empty clears a goal. */
function GoalsPopover({ onClose }: { onClose: () => void }) {
  const goals = useStore((s) => s.project!.file.goals) ?? {};
  const [daily, setDaily] = useState(goals.daily ? String(goals.daily) : "");
  const [total, setTotal] = useState(goals.total ? String(goals.total) : "");
  const box = useRef<HTMLFormElement>(null);
  const latest = useRef({ daily, total, cancelled: false });
  latest.current = { ...latest.current, daily, total };

  useEffect(() => {
    box.current?.querySelector("input")?.focus();
    const outside = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // The status bar buttons toggle it themselves.
      if (!box.current?.contains(t) && !t.closest(".goals-anchor")) onClose();
    };
    document.addEventListener("mousedown", outside);
    return () => {
      document.removeEventListener("mousedown", outside);
      const { daily, total, cancelled } = latest.current;
      if (!cancelled) void actions.setGoals({ daily: parseGoal(daily), total: parseGoal(total) });
    };
  }, []);

  return (
    <form
      ref={box}
      className="goals"
      aria-label="Word goals"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault(); // so focus mode doesn't also take this Escape
        latest.current.cancelled = true;
        onClose();
      }}
    >
      <label className="field">
        <span>Daily goal</span>
        <input inputMode="numeric" placeholder="e.g. 1,000" value={daily} onInput={(e) => setDaily(e.currentTarget.value)} />
      </label>
      <label className="field">
        <span>Manuscript goal</span>
        <input inputMode="numeric" placeholder="e.g. 80,000" value={total} onInput={(e) => setTotal(e.currentTarget.value)} />
      </label>
      <p className="hint">Today counts the words you've added to the manuscript since the day began. Leave a box empty for no goal.</p>
      <button type="submit" className="small-btn">
        Done
      </button>
    </form>
  );
}
