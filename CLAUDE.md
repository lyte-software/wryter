# Wryter

Desktop writing app (Scrivener / Notion / Obsidian territory): a clean, focus-friendly
editor plus linkable characters / locations / items. Tauri 2 + Preact + TypeScript +
TipTap 3. Read `README.md` for the feature list and on-disk format.

## Principles

- **Files are the source of truth.** A project is a folder of Markdown files with YAML
  frontmatter (`src/project/model.ts` documents the layout). Never add state that only
  lives in the app; if it matters, it goes in frontmatter or `wryter.json`.
- **Markdown must round-trip.** Anything the editor can produce must survive
  `jsonToMarkdown` → `markdownToHtml` unchanged. Adding a TipTap node or mark means
  extending both directions in `src/editor/markdown.ts` *and* a case in
  `markdown.test.ts`. StarterKit's code, codeBlock, link and underline are disabled
  on purpose: prose only.
- **Links are Obsidian-compatible:** `[[Title]]` / `[[Title|label]]`, resolved
  case-insensitively against filenames and `aliases`.
- **Quiet UI.** Colour is reserved for entity kinds (`--character`, `--location`,
  `--item`, `--note` in `styles.css`). New chrome should hide in focus mode.

## The name

The app's name lives in one place: `brand.json` (display name, slug, bundle
identifier, former slugs). Code reads it through `src/brand.ts` (`APP_NAME`,
`APP_SLUG`, `storageKey()`), build scripts through `app_name` / `app_slug` /
`identifier` in `build/lib.sh`. Never hardcode the name in code.

The project file is `<slug>.json`. Projects and localStorage prefs saved under a slug
in `formerSlugs` still load and are migrated to the current name on open.

To rename: move the current slug into `formerSlugs`, set the new name, slug and
identifier, run `npm run brand` (syncs package.json, tauri.conf.json, Cargo.toml,
Cargo.lock, index.html), then update the prose in the READMEs. `src/brand.test.ts`
fails if the synced files drift. The Rust lib is `app_lib` on purpose, so it never
needs renaming. Changing the identifier makes it a new app to the stores and moves
the mobile library folder, so only do that before release.

## Layout

- `src/fs/`: `FS` interface; `tauri.ts` (real files) and `memory.ts` (localStorage, used
  by `npm run dev` in a browser and in tests). Picked in `fs/index.ts`. Where there's no
  folder picker (`canPickFolder` false: Android, iOS, browser), projects live in
  `fs.library()` instead; never assume a picker exists.
- `src/project/`: pure logic, no UI: model, frontmatter, io, `links.ts` (index,
  backlinks, unlinked mentions, rename rewriting). Unit-tested.
- `src/store.ts`: zustand store + `actions`. All writes go through here (debounced
  autosave per doc). `rev[id]` is bumped when a doc's body changes outside the editor
  (rename, link-all); the editor remounts on it and drops stale pending edits.
- `src/editor/`: TipTap setup (`extensions.ts`: `EntityLink` node + `[[` suggestion),
  `linkMenu.ts` (picker state/search), `Editor.tsx`.
- `src/ui/`: Binder, Inspector, StatusBar, QuickOpen, Welcome.
- `src-tauri/`: minimal shell; fs + dialog plugins. FS scope is `$HOME/**`
  (`capabilities/default.json`).

## Commands

`npm test`, `npm run check`, `npm run brand` (after editing `brand.json`), `npm run dev`
(browser), `npm run tauri dev` (desktop; needs Rust + webkit2gtk4.1-devel; see README).
