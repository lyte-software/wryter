# Wryter

A quiet place to write, and to keep track of everyone in it. Wryter is a desktop
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
- **Raw mode** (status bar): links show as their `[[Henry Bob|shady figure]]` source,
  plain text you can edit directly. The `[[` picker still works. Stays on until you turn it off.
- **Focus mode** (Ctrl+Shift+F): hides everything but the page and dims all but the
  current paragraph. **Quick open** (Ctrl+P). Light, Sepia, Dark and Programmer themes (status bar).

## Your files are plain Markdown

A project is just a folder. Nothing is locked inside the app:

```
The Lantern Road/
  wryter.json               title + binder order
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

On phones and tablets there's no folder picker, so projects live in the app's own
documents folder and the welcome screen lists them:

- **iOS / iPadOS:** Files app > On My iPhone (or iPad) > Wryter. Copy project folders
  in or out there. The folder is included in iCloud and device backups.
- **Android:** `Android/data/co.roguewolf.wryter/files/Documents`. You can reach it
  over USB from a computer, though most phone file managers hide it.

Either way, **uninstalling the app deletes these projects**, so copy them somewhere
first.

## Install

There are no prebuilt downloads yet, so Wryter is built from source. Every platform
follows the same three steps: install the prerequisites, build, install what the build
produced. The first build takes a few minutes (Rust compiles Tauri); later ones take
seconds.

Pick your platform for prerequisites and install steps: [Linux](#linux) ·
[macOS](#macos) · [Windows](#windows).

**Building is the same everywhere** once prerequisites are in place:

```sh
git clone <this repo> wryter
cd wryter
npm install
npm run tauri build
```

Everything lands under `src-tauri/target/release/` (written `src-tauri\target\release\`
on Windows). To build one package type instead of all of them, add
`-- --bundles <type>` (types listed per platform below), or `-- --no-bundle` for just
the app binary.

### Linux

**Prerequisites**

```sh
# Node.js 22+ (check with `node --version`). Fedora's package is recent enough;
# Debian/Ubuntu's often isn't, so use https://nodejs.org there.
sudo dnf install nodejs

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# System libraries (WebKitGTK and friends)
# Fedora
sudo dnf group install c-development
sudo dnf install webkit2gtk4.1-devel openssl-devel libxdo-devel librsvg2-devel \
  libappindicator-gtk3-devel curl wget file
# Debian / Ubuntu
sudo apt install build-essential libwebkit2gtk-4.1-dev libssl-dev libxdo-dev \
  librsvg2-dev libayatana-appindicator3-dev curl wget file
```

**Build output** (in `src-tauri/target/release/`)

| File | What it is | `--bundles` |
| --- | --- | --- |
| `wryter` | The app itself; runs in place | |
| `bundle/rpm/*.rpm` | Fedora / RHEL package | `rpm` |
| `bundle/deb/*.deb` | Debian / Ubuntu package | `deb` |
| `bundle/appimage/*.AppImage` | Portable, runs on most distros | `appimage` |

The AppImage step downloads extra tools and is the one most likely to fail; if it does,
build just your distro's package.

**Install**

```sh
# Fedora
sudo dnf install ./src-tauri/target/release/bundle/rpm/*.rpm

# Debian / Ubuntu
sudo apt install ./src-tauri/target/release/bundle/deb/*.deb

# AppImage (any distro)
chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
./src-tauri/target/release/bundle/appimage/*.AppImage
```

Wryter then appears in your app launcher.

### macOS

**Prerequisites**

```sh
# Apple's compilers (a dialog pops up; click Install)
xcode-select --install

# Node.js 22+: https://nodejs.org, or with Homebrew:
brew install node

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

No other libraries are needed: macOS ships the WebKit engine Wryter uses.

**Build output** (in `src-tauri/target/release/`)

| File | What it is | `--bundles` |
| --- | --- | --- |
| `bundle/macos/Wryter.app` | The app | `app` |
| `bundle/dmg/*.dmg` | Disk image, for installing or sharing | `dmg` |

The build matches your Mac's chip (Apple Silicon or Intel). For one build that runs on
both: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`, then
`npm run tauri build -- --target universal-apple-darwin` (output moves to
`src-tauri/target/universal-apple-darwin/release/`).

**Install**: open the `.dmg` and drag Wryter into Applications, or copy the `.app`
there directly:

```sh
cp -R src-tauri/target/release/bundle/macos/Wryter.app /Applications/
```

The app isn't signed by Apple. That doesn't matter for an app you built yourself, but if
you send it to another Mac, macOS will block it the first time it opens: they need to
go to **System Settings → Privacy & Security** and click **Open Anyway**.

### Windows

**Prerequisites** (Windows 10 or 11)

1. **Microsoft C++ Build Tools**: download from
   <https://visualstudio.microsoft.com/visual-cpp-build-tools/>, and in the installer
   tick **Desktop development with C++**.
2. **WebView2**: already included in Windows 11 and up-to-date Windows 10. If it's missing,
   install the *Evergreen Bootstrapper* from
   <https://developer.microsoft.com/microsoft-edge/webview2/>.
3. **Rust**: download and run `rustup-init.exe` from <https://rustup.rs> and accept the
   defaults (the MSVC toolchain).
4. **Node.js 22+**: the LTS installer from <https://nodejs.org>.

Or, from PowerShell with winget (still tick *Desktop development with C++* when the
Build Tools installer opens):

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools Rustlang.Rustup OpenJS.NodeJS.LTS
```

Open a **new** terminal afterwards so `cargo` and `npm` are on your PATH, then build as
above.

**Build output** (in `src-tauri\target\release\`)

| File | What it is | `--bundles` |
| --- | --- | --- |
| `wryter.exe` | The app itself; runs in place | |
| `bundle\nsis\*-setup.exe` | Installer (recommended) | `nsis` |
| `bundle\msi\*.msi` | Windows Installer package | `msi` |

Building the `.msi` needs Windows' optional **VBScript** feature, which newer Windows 11
builds no longer turn on by default. If the MSI step fails, use
`npm run tauri build -- --bundles nsis`.

**Install**: double-click the `-setup.exe` (or the `.msi`) and follow the installer.
Wryter is then in the Start menu, and uninstalls from **Settings → Apps**.

The installer isn't code-signed. Installers you build yourself run normally, but on
another PC, Windows SmartScreen may show *"Windows protected your PC"*: click
**More info → Run anyway**.

### Updating

Pull the latest code, rebuild, and install the new package over the old one; your
projects are ordinary folders and aren't touched.

### Try it without installing

`npm install && npm run dev`, then open <http://localhost:1420>. This runs the same app in
the browser, but projects are kept in browser storage instead of real folders, so use the
desktop build for actual writing.

## Development

```sh
npm install
npm run dev        # browser build at http://localhost:1420 (projects stored in localStorage)
npm run tauri dev  # desktop app with hot reload (needs the prerequisites above)
npm test           # vitest: markdown round-trip, link index, link picker, UI smoke test
npm run check      # typecheck
```

Stack: Tauri 2, Preact, TypeScript, TipTap 3 (ProseMirror), zustand, marked.

## License

Wryter is open source under the [MIT License](LICENSE), a Lyte Software project.
Build it, change it, fork it, ship it. That's the point.

### The name

The licence covers the code, not the name. "Wryter" and the Wryter logo belong to
Lyte Software. If you publish a fork or a modified build, give it a different name and
icon so nobody mistakes it for the official app. Saying your fork is "based on
Wryter" is fine. The official builds in app stores are the ones published by Lyte
Software.
