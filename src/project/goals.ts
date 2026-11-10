/** Word goals. "Today" is net words added to the manuscript since the day's first open or edit. */
import { wordCount, type Project, type ProjectFile } from "./model";

export const manuscriptWords = (project: Project) =>
  Object.values(project.docs).reduce((n, d) => n + (d.kind === "manuscript" ? wordCount(d.body) : 0), 0);

/** The local calendar date, e.g. "2026-11-09". */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A new baseline when the day has changed (or there's none yet), otherwise null. */
export function rollToday(file: ProjectFile, total: number, date = localDate()): ProjectFile["today"] | null {
  return file.today?.date === date ? null : { date, start: total };
}

/** Words written today; cutting more than you wrote shows as 0, not a negative. */
export function wordsToday(file: ProjectFile, total: number, date = localDate()): number {
  return file.today?.date === date ? Math.max(0, total - file.today.start) : 0;
}

/** A goal from user input: a positive whole number, or undefined to clear it. */
export function parseGoal(input: string): number | undefined {
  const n = Math.round(Number(input.replace(/[,\s_]/g, "")));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
