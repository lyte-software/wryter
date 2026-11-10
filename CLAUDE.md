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
  (rename, link-all, an edit made in another app); the editor remounts on it and drops
  stale pending edits. `known` holds the exact text last read or written per file:
  a save refuses to overwrite a file that no longer matches it (that becomes a
  `conflicts` entry), and the folder watcher / window-focus sync (`project/sync.ts`)
  uses it to tell outside edits from our own writes. Write files through `writeKnown`.
- `src/editor/`: TipTap setup (`extensions.ts`: `EntityLink` node + `[[` suggestion),
  `linkMenu.ts` (picker state/search), `search.ts` (find/replace plugin: decorations,
  matches include link labels, replace skips links), `Editor.tsx` (+ `FindBar`).
  Project-wide text search is `project/search.ts`, shown in QuickOpen; the find bar's
  state is `find` in the store, so a search result can open a doc pre-searched.
- `src/export/`: compiling the manuscript (`compile.ts`: chapters, Markdown, HTML;
  `docx.ts`: Word in standard manuscript format, from marked's tokens; `zip.ts`: a
  stored-only zip writer, so no compression dependency). Pure, unit-tested. Export
  choices persist in `wryter.json` under `export`. A new block or mark in the editor
  needs a case in `docx.ts` too.
- `src/ui/`: Binder, Inspector, StatusBar (+ goals popover), QuickOpen, Welcome,
  ExportDialog, Outline. The centre column is `view` in the store: the open doc or
  the outline.
- `src-tauri/`: minimal shell; fs + dialog plugins. FS scope is `$HOME/**`
  (`capabilities/default.json`).

## Commands

Tests: `preact/compat` is loaded (TipTap needs it), so `onBlur` / `onFocus` listen
for `focusout` / `focusin`. Dispatch those in UI tests, not `blur`.

`npm test`, `npm run check`, `npm run brand` (after editing `brand.json`), `npm run dev`
(browser), `npm run tauri dev` (desktop; needs Rust + webkit2gtk4.1-devel; see README).
