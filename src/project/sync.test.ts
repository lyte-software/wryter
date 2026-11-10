import { describe, expect, it } from "vitest";
import { createMemoryFS } from "../fs/memory";
import { PROJECT_FILE, type Project } from "./model";
import { docFromText } from "./io";
import { readDisk, reconcile, relativeId } from "./sync";

describe("relativeId", () => {
  it("maps tracked files to ids and ignores everything else", () => {
    expect(relativeId("/p/Book", "/p/Book/Characters/Mara.md")).toBe("Characters/Mara.md");
    expect(relativeId("/p/Book/", "/p/Book/Manuscript/Chapter 1.md")).toBe("Manuscript/Chapter 1.md");
    expect(relativeId("/p/Book", `/p/Book/${PROJECT_FILE}`)).toBe(PROJECT_FILE);
    expect(relativeId("C:/p/Book", "C:\\p\\Book\\Items\\Lamp.md")).toBe("Items/Lamp.md");
    expect(relativeId("/p/Book", "/p/Book/.obsidian/workspace.json")).toBeNull();
    expect(relativeId("/p/Book", "/p/Book/Characters/notes.txt")).toBeNull();
    expect(relativeId("/p/Book", "/p/Book/Characters/Sub/Deep.md")).toBeNull();
    expect(relativeId("/p/Book", "/p/Book/Random/Thing.md")).toBeNull();
    expect(relativeId("/p/Book", "/p/Bookshelf/Characters/Mara.md")).toBeNull();
  });
});

describe("readDisk", () => {
  it("reads files and reports missing ones as null", async () => {
    const fs = createMemoryFS();
    await fs.writeText("/b/Characters/Mara.md", "hi");
    const disk = await readDisk(fs, "/b", ["Characters/Mara.md", "Characters/Gone.md"]);
    expect(disk.get("Characters/Mara.md")).toBe("hi");
    expect(disk.get("Characters/Gone.md")).toBeNull();
  });
});

describe("reconcile", () => {
  const mara = docFromText("Characters/Mara.md", "Old");
  const ch1 = docFromText("Manuscript/Chapter 1.md", "Draft");
  const project: Project = {
    root: "/b",
    file: { version: 1, title: "B", order: {} },
    docs: { [mara.id]: mara, [ch1.id]: ch1 },
  };
  const known = new Map([
    [mara.id, "Old"],
    [ch1.id, "Draft"],
  ]);
  const clean = () => false;

  it("ignores files that match what we last read or wrote", () => {
    const r = reconcile(project, known, new Map([[mara.id, "Old"]]), clean);
    expect(r).toEqual({ changed: [], removed: [], conflicts: {} });
  });

  it("takes outside edits to clean docs", () => {
    const r = reconcile(project, known, new Map([[mara.id, "---\nsummary: Brave\n---\n\nNew"]]), clean);
    expect(r.changed).toEqual([{ ...mara, meta: { summary: "Brave" }, body: "New" }]);
  });

  it("turns outside edits to docs with unsaved edits into conflicts", () => {
    const r = reconcile(project, known, new Map([[ch1.id, "Theirs"]]), (id) => id === ch1.id);
    expect(r.changed).toEqual([]);
    expect(r.conflicts).toEqual({ [ch1.id]: "Theirs" });
  });

  it("adds new files and drops deleted ones, unless they have unsaved edits", () => {
    const disk = new Map<string, string | null>([
      ["Locations/Harbor.md", "Salt"],
      [mara.id, null],
      [ch1.id, null],
    ]);
    const r = reconcile(project, known, disk, (id) => id === ch1.id);
    expect(r.changed.map((d) => [d.id, d.kind, d.title])).toEqual([["Locations/Harbor.md", "location", "Harbor"]]);
    expect(r.removed).toEqual([mara.id]);
  });
});
