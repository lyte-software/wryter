import { describe, expect, it } from "vitest";
import type { ProjectFile } from "./model";
import { localDate, parseGoal, rollToday, wordsToday } from "./goals";

const file = (today?: ProjectFile["today"]): ProjectFile => ({ version: 1, title: "B", order: {}, today });

describe("localDate", () => {
  it("uses the local calendar day", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("rollToday", () => {
  it("starts a baseline on a new day, and leaves today's alone", () => {
    expect(rollToday(file(), 500, "2026-11-09")).toEqual({ date: "2026-11-09", start: 500 });
    expect(rollToday(file({ date: "2026-11-08", start: 100 }), 500, "2026-11-09")).toEqual({ date: "2026-11-09", start: 500 });
    expect(rollToday(file({ date: "2026-11-09", start: 100 }), 500, "2026-11-09")).toBeNull();
  });
});

describe("wordsToday", () => {
  it("counts net words since the baseline, never below zero", () => {
    expect(wordsToday(file({ date: "2026-11-09", start: 100 }), 450, "2026-11-09")).toBe(350);
    expect(wordsToday(file({ date: "2026-11-09", start: 100 }), 40, "2026-11-09")).toBe(0);
    expect(wordsToday(file({ date: "2026-11-08", start: 100 }), 450, "2026-11-09")).toBe(0);
    expect(wordsToday(file(), 450, "2026-11-09")).toBe(0);
  });
});

describe("parseGoal", () => {
  it("reads friendly numbers and treats anything else as no goal", () => {
    expect(parseGoal("1,000")).toBe(1000);
    expect(parseGoal(" 80 000 ")).toBe(80000);
    expect(parseGoal("")).toBeUndefined();
    expect(parseGoal("0")).toBeUndefined();
    expect(parseGoal("-5")).toBeUndefined();
    expect(parseGoal("lots")).toBeUndefined();
  });
});
