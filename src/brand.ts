/**
 * The app's name, from brand.json at the repo root. Code should use these rather
 * than spelling the name out, so a rename is one file plus `npm run brand`.
 */
import brand from "../brand.json";

export const APP_NAME: string = brand.name;
export const APP_SLUG: string = brand.slug;
/** Slugs the app shipped under before, newest first. Their data is still picked up. */
export const FORMER_SLUGS: readonly string[] = brand.formerSlugs;

/**
 * A localStorage key under the app's prefix. If only a former name's key exists,
 * its value moves over, so preferences survive a rename.
 */
export function storageKey(key: string): string {
  const current = `${APP_SLUG}:${key}`;
  try {
    if (localStorage.getItem(current) === null) {
      for (const slug of FORMER_SLUGS) {
        const old = localStorage.getItem(`${slug}:${key}`);
        if (old === null) continue;
        localStorage.setItem(current, old);
        localStorage.removeItem(`${slug}:${key}`);
        break;
      }
    }
  } catch {
    // Blocked storage: callers already cope with reads and writes failing.
  }
  return current;
}
