import { afterEach, describe, expect, it } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { App } from "./App";
import { actions, useStore } from "./store";
import { SAMPLE_TITLE } from "./sample";
import { fs } from "./fs";

/** Smoke test: the whole UI mounts and the main flows work in a DOM. */

const root = () => document.getElementById("root")!;
const $ = <T extends Element = HTMLElement>(sel: string) => root().querySelector<T>(sel);

async function until<T>(get: () => T | null | undefined, ms = 2000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await act(() => new Promise((r) => setTimeout(r, 10)));
  }
}

async function openSample() {
  document.body.innerHTML = '<div id="root"></div>';
  await act(() => render(h(App, null), root()));
  const button = [...root().querySelectorAll("button")].find((b) => b.textContent === "Open the sample project")!;
  await act(() => button.click());
  await until(() => $(".binder"));
}

afterEach(async () => {
  await act(() => render(null, root()));
  await actions.closeProject();
  actions.setFocus(false);
});

describe("app", () => {
  it("opens the sample project into the editor", async () => {
    await openSample();
    const chapter = [...root().querySelectorAll(".binder li")].find((li) => /Chapter/.test(li.textContent ?? ""))!;
    await act(() => (chapter.querySelector("button") ?? (chapter as HTMLElement)).click());
    const links = await until(() => {
      const found = root().querySelectorAll(".ProseMirror .entity-link");
      return found.length ? found : null;
    });
    expect((links[0] as HTMLElement).dataset.kind).not.toBe("missing");
  });

  it("switches theme from the status bar", async () => {
    await openSample();
    const select = await until(() => $<HTMLSelectElement>(".statusbar select"));
    select.value = "programmer";
    await act(() => void select.dispatchEvent(new Event("change", { bubbles: true })));
    expect(useStore.getState().theme).toBe("programmer");
    expect(document.documentElement.dataset.theme).toBe("programmer");
    await act(() => actions.setTheme("light"));
  });

  it("lists library projects on the welcome screen where there's no folder picker", async () => {
    await openSample();
    await act(() => actions.closeProject());
    const heading = await until(() => $(".recents h2"));
    expect(heading.textContent).toBe("Your projects");
    expect($(".recents strong")!.textContent).toBe(SAMPLE_TITLE);
    expect([...root().querySelectorAll("button")].some((b) => b.textContent === "Open folder…")).toBe(false);
  });

  it("exports the manuscript from the status bar and remembers the choices", async () => {
    await openSample();
    const open = [...root().querySelectorAll(".statusbar button")].find((b) => b.textContent === "Export…") as HTMLElement;
    await act(() => open.click());
    const dialog = await until(() => $<HTMLFormElement>("form.export"));
    const markdown = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1];
    await act(() => markdown.click());
    const author = dialog.querySelector<HTMLInputElement>(".field input")!;
    author.value = "Ana Ruiz";
    await act(() => void author.dispatchEvent(new Event("input", { bubbles: true })));
    await act(() => void dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const done = await until(() => $(".export-done"));

    const title = useStore.getState().project!.file.title;
    const path = `/browser/Exports/${title}.md`;
    expect(done.textContent).toBe(`Saved to ${path}`);
    expect(await fs.readText(path)).toMatch(/^---\ntitle: .+\nauthor: Ana Ruiz\n---\n\n# /);
    expect(useStore.getState().project!.file.export).toEqual({ format: "markdown", headings: "titles", author: "Ana Ruiz" });

    await act(() => void dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect($("form.export")).toBeNull();
  });

  it("searches the text from Ctrl+P and opens the match in the find bar", async () => {
    await openSample();
    const key = (k: string, extra: KeyboardEventInit = {}) =>
      act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: true, bubbles: true, ...extra })));
    await key("p");
    const input = await until(() => $<HTMLInputElement>(".palette input"));
    input.value = "lantern";
    await act(() => void input.dispatchEvent(new Event("input", { bubbles: true })));
    const hit = await until(() => $<HTMLElement>(".palette .text-hit"));
    expect($(".palette-heading")!.textContent).toBe("In the text");
    expect(hit.querySelector("mark")!.textContent!.toLowerCase()).toBe("lantern");
    await act(() => hit.click());

    const find = await until(() => $<HTMLInputElement>(".find-bar input"));
    expect(find.value).toBe("lantern");
    expect($(".find-count")!.textContent).toMatch(/^1 of \d+$/);
    expect(root().querySelectorAll(".ProseMirror .search-match").length).toBeGreaterThan(0);

    await act(() => void find.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect($(".find-count")!.textContent).toMatch(/^2 of /);

    await act(() => void find.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect($(".find-bar")).toBeNull();
    expect(root().querySelectorAll(".ProseMirror .search-match").length).toBe(0);

    await key("h");
    await until(() => $('.find-bar input[aria-label="Replace with"]'));
  });

  it("sets a daily goal from the status bar", async () => {
    await openSample();
    const today = [...root().querySelectorAll(".statusbar button")].find((b) => b.textContent!.startsWith("Today")) as HTMLElement;
    await act(() => today.click());
    const input = await until(() => $<HTMLInputElement>(".goals input"));
    input.value = "1,500";
    await act(() => void input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(() => void $(".goals")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect($(".goals")).toBeNull();
    await until(() => useStore.getState().project!.file.goals);
    expect(useStore.getState().project!.file.goals).toEqual({ daily: 1500 });
    expect(today.textContent).toMatch(/^Today \d[\d,]* \/ 1,500/);

    // The goal bar fills as words are added and drains as they're cut.
    const bar = await until(() => $<HTMLElement>(".goal-bar"));
    const fill = () => bar.querySelector<HTMLElement>(".goal-fill")!.style.transform;
    const chapter = useStore.getState().openId!;
    const body = useStore.getState().project!.docs[chapter].body;
    await act(() => actions.updateBody(chapter, body + "\n\n" + "word ".repeat(750)));
    expect(bar.getAttribute("aria-valuenow")).toBe("750");
    expect(fill()).toBe("scaleX(0.5)");
    await act(() => actions.updateBody(chapter, body + "\n\n" + "word ".repeat(1600)));
    expect(fill()).toBe("scaleX(1)");
    expect(bar.classList.contains("met")).toBe(true);
    await act(() => actions.updateBody(chapter, body));
    expect(fill()).toBe("scaleX(0)");

    await act(() => actions.setGoals({}));
    expect($(".goal-bar")).toBeNull();
  });

  it("plans in the outline: synopsis, status, reorder, open", async () => {
    await openSample();
    const chapters = () => [...root().querySelectorAll<HTMLElement>(".outline-title")].map((b) => b.textContent);
    await act(() => $<HTMLElement>(".outline-btn")!.click());
    await until(() => $(".outline"));
    expect($(".inspector")).toBeNull();
    const before = chapters();
    expect(before.length).toBeGreaterThan(1);

    const synopsis = $<HTMLTextAreaElement>(".outline-synopsis")!;
    synopsis.value = "Mara crosses the river.";
    await act(() => void synopsis.dispatchEvent(new Event("input", { bubbles: true })));
    // preact/compat (loaded for TipTap) listens for focusout, as React does.
    await act(() => void synopsis.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    const first = Object.values(useStore.getState().project!.docs).find((d) => d.title === before[0])!;
    expect(first.meta.synopsis).toBe("Mara crosses the river.");

    const status = $<HTMLSelectElement>(".outline-status")!;
    status.value = "revised";
    await act(() => void status.dispatchEvent(new Event("change", { bubbles: true })));
    expect(useStore.getState().project!.docs[first.id].meta.status).toBe("revised");

    // Drag the second chapter above the first.
    const rows = root().querySelectorAll<HTMLElement>(".outline li");
    await act(() => void rows[1].querySelector(".outline-num")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    await act(() => void rows[1].dispatchEvent(new Event("dragstart", { bubbles: true })));
    await act(() => void rows[0].dispatchEvent(new Event("drop", { bubbles: true })));
    expect(chapters().slice(0, 2)).toEqual([before[1], before[0]]);

    await act(() => root().querySelector<HTMLElement>(".outline-title")!.click());
    await until(() => !$(".outline") && $(".ProseMirror"));

    const toggle = () => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "O", ctrlKey: true, shiftKey: true })));
    await toggle();
    await until(() => $(".outline"));
    await toggle();
    await until(() => !$(".outline") && $(".ProseMirror"));
  });

  it("toggles focus mode with Ctrl+Shift+F", async () => {
    await openSample();
    const press = () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "F", ctrlKey: true, shiftKey: true }));
    await act(press);
    expect($(".workspace")!.classList.contains("focus")).toBe(true);
    await act(press);
    expect($(".workspace")!.classList.contains("focus")).toBe(false);
  });
});
