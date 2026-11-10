import { afterEach, describe, expect, it, vi } from "vitest";
import { fs, join } from "./fs";
import { actions, flushAll, useStore } from "./store";
import { PROJECT_FILE } from "./project/model";
import { manuscriptWords, wordsToday } from "./project/goals";

const state = useStore.getState;
const CH1 = "Manuscript/Chapter 1.md";
let n = 0;

async function open() {
  const title = `Goals ${++n}`;
  await actions.newProject("/browser", title);
  return join("/browser", title);
}
const today = () => wordsToday(state().project!.file, manuscriptWords(state().project!));
const onDisk = async (root: string) => JSON.parse(await fs.readText(join(root, PROJECT_FILE)));

afterEach(async () => {
  await actions.closeProject();
  vi.useRealTimers();
});

describe("words today", () => {
  it("counts from the day's starting point, saved in the project file", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 9, 9, 0) });
    const root = await open();
    actions.updateBody(CH1, "One two three.");
    await flushAll();
    expect(today()).toBe(3);
    expect((await onDisk(root)).today).toEqual({ date: "2026-11-09", start: 0 });
  });

  it("starts over the next day, counting that day's first edit", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 9, 23, 59) });
    const root = await open();
    actions.updateBody(CH1, "One two three.");
    vi.setSystemTime(new Date(2026, 10, 10, 0, 5));
    actions.updateBody(CH1, "One two three. Four five.");
    await flushAll();
    expect(today()).toBe(2);
    expect((await onDisk(root)).today).toEqual({ date: "2026-11-10", start: 3 });
  });

  it("ignores edits to characters and notes", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 9, 9, 0) });
    await open();
    const doc = await actions.createDoc("character", "Mara");
    actions.updateBody(doc!.id, "A lamplighter's daughter from the coast.");
    expect(today()).toBe(0);
  });
});

describe("goals", () => {
  it("are saved to the project file and cleared when empty", async () => {
    const root = await open();
    await actions.setGoals({ daily: 1000, total: 80000 });
    expect((await onDisk(root)).goals).toEqual({ daily: 1000, total: 80000 });
    await actions.setGoals({ daily: 500 });
    expect((await onDisk(root)).goals).toEqual({ daily: 500 });
    await actions.setGoals({});
    expect((await onDisk(root)).goals).toBeUndefined();
  });
});
