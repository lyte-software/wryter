import { afterEach, describe, expect, it } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { App } from "./App";
import { actions, useStore } from "./store";

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

  it("toggles focus mode with Ctrl+Shift+F", async () => {
    await openSample();
    const press = () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "F", ctrlKey: true, shiftKey: true }));
    await act(press);
    expect($(".workspace")!.classList.contains("focus")).toBe(true);
    await act(press);
    expect($(".workspace")!.classList.contains("focus")).toBe(false);
  });
});
