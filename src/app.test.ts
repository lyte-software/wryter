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

  it("toggles focus mode with Ctrl+Shift+F", async () => {
    await openSample();
    const press = () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "F", ctrlKey: true, shiftKey: true }));
    await act(press);
    expect($(".workspace")!.classList.contains("focus")).toBe(true);
    await act(press);
    expect($(".workspace")!.classList.contains("focus")).toBe(false);
  });
});
