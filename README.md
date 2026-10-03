# AuthorBox

A quiet place to write, and to keep track of everyone in it. AuthorBox is a desktop
writing app in the spirit of Scrivener and Obsidian: a distraction-free editor for
your manuscript, plus characters, locations and items you can link to as you write.

- **Binder:** Manuscript, Characters, Locations, Items, Notes. Drag to reorder.
- **Linking:** type `[[` while writing to link an entity, or create a new one inline.
  Links are coloured by kind. Hover one for a preview; Ctrl/Cmd-click to open it.
- **Link text is yours:** select "shady figure" and press Ctrl+K to link it to Henry Bob
  without changing the words, type `[[Henry Bob|shady figure`, or edit *Shown as* in
  any link's hover card. Saved as `[[Henry Bob|shady figure]]`.
- **Backlinks:** an entity's inspector lists every chapter it appears in, plus
  *unlinked mentions* (plain-text uses of its name or aliases) that you can link in one click.
- **Rename-safe:** renaming a character rewrites every link to them across the project.
- **Focus mode** (Ctrl+Shift+F): hides everything but the page and dims all but the
  current paragraph. **Quick open** (Ctrl+P). Light, Sepia, Dark and Programmer themes (status bar).

## Your files are plain Markdown

A project is just a folder. Nothing is locked inside the app:

```
The Lantern Road/
  authorbox.json            title + binder order
  Manuscript/Chapter 1.md
  Characters/Mara Venn.md   ---
                            aliases: [Mara]
                            summary: A lamplighter's daughter…
                            ---
                            ## Appearance …
  Locations/  Items/  Notes/
```

Links are `[[Mara Venn]]` or `[[Mara Venn|her]]`, the same syntax as Obsidian, so a
project folder also opens as an Obsidian vault.

## Install

There are no prebuilt downloads yet, so AuthorBox is built from source. It takes a few
minutes the first time (Rust compiles Tauri), and seconds after that.

### 1. Prerequisites

- **Node.js 22+** and npm: <https://nodejs.org> or your package manager.
- **Rust** (via rustup):

  ```sh
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source ~/.cargo/env
  ```

- **System libraries** for the native window (WebKitGTK and friends):

  ```sh
  # Fedora
  sudo dnf group install c-development
  sudo dnf install webkit2gtk4.1-devel openssl-devel libxdo-devel librsvg2-devel \
    libappindicator-gtk3-devel curl wget file

  # Debian / Ubuntu
  sudo apt install build-essential libwebkit2gtk-4.1-dev libssl-dev libxdo-dev \
    librsvg2-dev libayatana-appindicator3-dev curl wget file
  ```

  macOS needs only the Xcode Command Line Tools (`xcode-select --install`); Windows needs
  the Microsoft C++ Build Tools and WebView2. Details:
  <https://v2.tauri.app/start/prerequisites/>.

### 2. Build

```sh
git clone <this repo> authorbox
cd authorbox
npm install
npm run tauri build
```

Output lands in `src-tauri/target/release/`:

| File | What it is |
| --- | --- |
| `authorbox` | The app itself; runs in place |
| `bundle/rpm/*.rpm` | Fedora / RHEL package |
| `bundle/deb/*.deb` | Debian / Ubuntu package |
| `bundle/appimage/*.AppImage` | Portable, runs on most distros |

To build only what you need (the AppImage step downloads extra tools and is the one most
likely to fail): `npm run tauri build -- --bundles rpm` (or `deb`, `appimage`), or
`npm run tauri build -- --no-bundle` for just the binary.

### 3. Install

```sh
# Fedora
sudo dnf install ./src-tauri/target/release/bundle/rpm/*.rpm

# Debian / Ubuntu
sudo apt install ./src-tauri/target/release/bundle/deb/*.deb

# AppImage (any distro)
chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
./src-tauri/target/release/bundle/appimage/*.AppImage
```

AuthorBox then appears in your app launcher. To update, pull, rebuild and install again.

### Try it without installing

`npm install && npm run dev`, then open <http://localhost:1420>. This runs the same app in
the browser, but projects are kept in browser storage instead of real folders, so use the
desktop build for actual writing.

## Development

```sh
npm install
npm run dev        # browser build at http://localhost:1420 (projects stored in localStorage)
npm run tauri dev  # desktop app with hot reload (needs the prerequisites above)
npm test           # vitest: markdown round-trip, link index, link picker
npm run check      # typecheck
```

Stack: Tauri 2, React 19, TypeScript, TipTap 3 (ProseMirror), zustand, marked.
