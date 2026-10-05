import { describe, expect, it } from "vitest";
import { createMemoryFS } from "../fs/memory";
import { FORMER_PROJECT_FILES, PROJECT_FILE } from "./model";
import { createProject, isProject, listProjects, loadProject } from "./io";

describe("listProjects", () => {
  it("finds project folders and reads their titles", async () => {
    const fs = createMemoryFS();
    await createProject(fs, "/lib/zeta", "Zeta Saga");
    await createProject(fs, "/lib/alpha", "Alpha Draft");
    await fs.writeText("/lib/notes/readme.md", "not a project");
    await fs.writeText("/lib/loose.md", "a file, not a folder");

    expect(await listProjects(fs, "/lib")).toEqual([
      { root: "/lib/alpha", title: "Alpha Draft" },
      { root: "/lib/zeta", title: "Zeta Saga" },
    ]);
  });

  it("falls back to the folder name when the project file is unreadable", async () => {
    const fs = createMemoryFS();
    await fs.writeText(`/lib/Broken/${PROJECT_FILE}`, "{ not json");
    expect(await listProjects(fs, "/lib")).toEqual([{ root: "/lib/Broken", title: "Broken" }]);
  });

  it("returns nothing for a library that doesn't exist yet", async () => {
    expect(await listProjects(createMemoryFS(), "/nowhere")).toEqual([]);
  });
});

describe("projects saved under a former app name", () => {
  const former = FORMER_PROJECT_FILES[0];

  it("are listed and recognised", async () => {
    const fs = createMemoryFS();
    await fs.writeText(`/lib/Old/${former}`, JSON.stringify({ version: 1, title: "Old Book", order: {} }));
    expect(await isProject(fs, "/lib/Old")).toBe(true);
    expect(await listProjects(fs, "/lib")).toEqual([{ root: "/lib/Old", title: "Old Book" }]);
  });

  it("get their project file renamed when opened", async () => {
    const fs = createMemoryFS();
    await fs.writeText(`/lib/Old/${former}`, JSON.stringify({ version: 1, title: "Old Book", order: {} }));
    const project = await loadProject(fs, "/lib/Old");
    expect(project.file.title).toBe("Old Book");
    expect(await fs.exists(`/lib/Old/${PROJECT_FILE}`)).toBe(true);
    expect(await fs.exists(`/lib/Old/${former}`)).toBe(false);
  });
});
