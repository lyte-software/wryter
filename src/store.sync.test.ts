import { afterEach, describe, expect, it } from "vitest";
import { fs, join } from "./fs";
import { actions, flushAll, useStore } from "./store";
import { PROJECT_FILE } from "./project/model";

/** Edits made to project files by other apps while the project is open. */

let n = 0;
const state = useStore.getState;
const CH1 = "Manuscript/Chapter 1.md";

async function open() {
  const title = `Sync ${++n}`;
  await actions.newProject("/browser", title);
  const root = join("/browser", title);
  expect(state().project?.root).toBe(root);
  return { root, path: (id: string) => join(root, id) };
}

afterEach(async () => {
  await actions.closeProject();
});

describe("outside edits", () => {
  it("are loaded into docs with nothing unsaved", async () => {
    const { path } = await open();
    const rev = state().rev[CH1] ?? 0;
    await fs.writeText(path(CH1), "Written in Obsidian.\n");
    await actions.syncFromDisk([path(CH1)]);
    expect(state().project!.docs[CH1].body).toBe("Written in Obsidian.\n");
    expect(state().rev[CH1]).toBe(rev + 1);
  });

  it("pick up new and deleted files on a full rescan", async () => {
    const { path } = await open();
    await fs.writeText(path("Characters/Mara.md"), "---\naliases: [Mara]\n---\n\nA lamplighter.\n");
    await fs.remove(path(CH1));
    await actions.syncFromDisk();
    const docs = state().project!.docs;
    expect(docs["Characters/Mara.md"].meta.aliases).toEqual(["Mara"]);
    expect(docs[CH1]).toBeUndefined();
    expect(state().openId).toBeNull();
  });

  it("pick up a retitled project", async () => {
    const { path } = await open();
    const file = JSON.parse(await fs.readText(path(PROJECT_FILE)));
    await fs.writeText(path(PROJECT_FILE), JSON.stringify({ ...file, title: "Renamed" }));
    await actions.syncFromDisk([path(PROJECT_FILE)]);
    expect(state().project!.file.title).toBe("Renamed");
  });

  it("leave our own saves alone", async () => {
    const { path } = await open();
    actions.updateBody(CH1, "Mine.");
    await flushAll();
    const rev = state().rev[CH1] ?? 0;
    await actions.syncFromDisk([path(CH1)]);
    expect(state().rev[CH1] ?? 0).toBe(rev);
    expect(state().conflicts).toEqual({});
  });
});

describe("a doc changed on disk while it has unsaved edits", () => {
  it("becomes a conflict instead of being overwritten, either way it's noticed", async () => {
    const { path } = await open();
    await fs.writeText(path(CH1), "Theirs.\n");
    actions.updateBody(CH1, "Mine.");
    // Noticed by the save itself, before any sync ran.
    await flushAll();
    expect(state().conflicts).toEqual({ [CH1]: "Theirs.\n" });
    expect(await fs.readText(path(CH1))).toBe("Theirs.\n");

    // Further typing stays in memory and doesn't save.
    actions.updateBody(CH1, "Mine, more.");
    await flushAll();
    expect(await fs.readText(path(CH1))).toBe("Theirs.\n");
    expect(state().project!.docs[CH1].body).toBe("Mine, more.");
  });

  it("is noticed by a sync too", async () => {
    const { path } = await open();
    actions.updateBody(CH1, "Mine.");
    await fs.writeText(path(CH1), "Theirs.\n");
    await actions.syncFromDisk([path(CH1)]);
    expect(state().conflicts).toEqual({ [CH1]: "Theirs.\n" });
    expect(state().project!.docs[CH1].body).toBe("Mine.");
  });

  it("can keep mine", async () => {
    const { path } = await open();
    await fs.writeText(path(CH1), "Theirs.\n");
    actions.updateBody(CH1, "Mine.");
    await flushAll();
    await actions.resolveConflict(CH1, "mine");
    expect(state().conflicts).toEqual({});
    expect(await fs.readText(path(CH1))).toBe("Mine.\n");
    expect(state().save).toBe("saved");
  });

  it("can take the other version", async () => {
    const { path } = await open();
    await fs.writeText(path(CH1), "Theirs.\n");
    actions.updateBody(CH1, "Mine.");
    await flushAll();
    const rev = state().rev[CH1] ?? 0;
    await actions.resolveConflict(CH1, "disk");
    expect(state().conflicts).toEqual({});
    expect(state().project!.docs[CH1].body).toBe("Theirs.\n");
    expect(state().rev[CH1]).toBe(rev + 1);
    // Back to normal: new edits save again.
    actions.updateBody(CH1, "Merged.");
    await flushAll();
    expect(await fs.readText(path(CH1))).toBe("Merged.\n");
  });
});

describe("a file deleted on disk while it has unsaved edits", () => {
  it("stays open and is written back on save", async () => {
    const { path } = await open();
    actions.updateBody(CH1, "Keep me.");
    await fs.remove(path(CH1));
    await actions.syncFromDisk([path(CH1)]);
    expect(state().project!.docs[CH1]).toBeDefined();
    await flushAll();
    expect(await fs.readText(path(CH1))).toBe("Keep me.\n");
  });
});
