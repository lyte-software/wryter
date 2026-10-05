import { afterEach, describe, expect, it } from "vitest";
import brand from "../brand.json";
import html from "../index.html?raw";
import pkg from "../package.json";
import cargo from "../src-tauri/Cargo.toml?raw";
import conf from "../src-tauri/tauri.conf.json";
import { APP_SLUG, FORMER_SLUGS, storageKey } from "./brand";

describe("brand.json", () => {
  // If one of these fails, run `npm run brand`.
  it("is copied into the config files that can't import it", () => {
    expect(pkg.name).toBe(brand.slug);
    expect(conf.productName).toBe(brand.name);
    expect(conf.identifier).toBe(brand.identifier);
    for (const w of conf.app.windows) expect(w.title).toBe(brand.name);

    expect(cargo).toMatch(new RegExp(`\\[package\\]\\nname = "${brand.slug}"\\n`));
    expect(html).toContain(`<title>${brand.name}</title>`);
  });

  it("doesn't list the current slug as a former one", () => {
    expect(FORMER_SLUGS).not.toContain(APP_SLUG);
  });
});

describe("storageKey", () => {
  afterEach(() => localStorage.clear());

  it("moves a value saved under a former name", () => {
    localStorage.setItem(`${FORMER_SLUGS[0]}:theme`, '"dark"');
    expect(localStorage.getItem(storageKey("theme"))).toBe('"dark"');
    expect(localStorage.getItem(`${FORMER_SLUGS[0]}:theme`)).toBeNull();
  });

  it("leaves a current value alone", () => {
    localStorage.setItem(`${APP_SLUG}:theme`, '"light"');
    localStorage.setItem(`${FORMER_SLUGS[0]}:theme`, '"dark"');
    expect(localStorage.getItem(storageKey("theme"))).toBe('"light"');
  });
});
