# Release builds

Scripts that turn the repo into store-ready builds. Each one installs deps, runs the
type check and tests, builds, and drops the result in `build/out/<version>/<platform>/`.

| Script | Runs on | Produces |
| --- | --- | --- |
| `local.sh` | either | Your own copy: builds and installs into `~/Applications/Wryter` (plus an app-menu launcher on Linux) |
| `release.sh` | either | Everything this machine can build (Linux: linux, windows, android. Mac: macos, ios) |
| `linux.sh` | Linux | `.deb`, `.rpm`, `.AppImage` |
| `windows.sh` | Linux or Mac | NSIS `.exe` installer, cross-compiled and unsigned |
| `android.sh` | Linux or Mac | Signed `.aab` for Play, signed `.apk` for sideloading. `--upload` sends the `.aab` to Play |
| `macos.sh` | Mac | Notarized universal `.dmg` (`--dmg`) and Mac App Store `.pkg` (`--appstore`). `--upload` sends the `.pkg` |
| `ios.sh` | Mac | App Store `.ipa`. `--upload` sends it to App Store Connect, where it shows up in TestFlight |
| `version.sh` | either | Prints or bumps the version (`patch`, `minor`, `major` or `x.y.z`) |

A typical release:

```sh
build/version.sh patch          # stores reject a version they've already seen
git commit -am "Release $(build/version.sh)"
build/release.sh --upload       # on the Linux box: linux, windows, android
build/release.sh --upload       # then on the Mac: macos, ios
```

Uploads go out as drafts / TestFlight builds. Nothing reaches users until you press
the button in Play Console or App Store Connect.

## Secrets

Copy `.env.example` to `.env` and fill it in. `.env` and `out/` are gitignored. Keep the
keystore, the `.p8` key and the Play JSON outside the repo, and back up the Android
keystore somewhere safe. If you lose it you have to go through Play's upload key reset.

## One-time setup: Android

1. **NDK.** Android Studio > SDK Manager > SDK Tools > NDK (Side by side), or
   `~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager 'ndk;28.2.13676358'`.
2. **JDK 17 or 21.** The script picks one from `/usr/lib/jvm` on its own, because
   Gradle tends to reject the newest JDK. Set `JAVA_HOME` in `.env` to override.
3. **Upload key.** Run the `keytool` command from `.env.example`. With Play App Signing
   (the default for new apps), Google holds the real signing key and this is only the
   key you upload with.
4. **Create the app in Play Console** with package name `co.roguewolf.wryter`. The
   very first `.aab` has to be uploaded by hand in the console. After that the API works.
5. **Service account for uploads.** In Google Cloud Console, create a service account
   in any project, enable the "Google Play Android Developer API", and download a JSON
   key. Then in Play Console > Users and permissions, invite the service account's
   email and give it release permissions for Wryter.

## One-time setup: Apple

All of this is on [developer.apple.com](https://developer.apple.com/account) unless noted.

1. **App ID.** Identifiers > register `co.roguewolf.wryter`. One explicit App ID
   covers both iOS and macOS.
2. **App Store Connect records.** In App Store Connect, create an app for iOS and add
   the macOS platform to it (or make two apps, if you'd rather price them separately).
3. **API key.** App Store Connect > Users and Access > Integrations > App Store Connect
   API. Create a key with the App Manager role and download the `.p8` (you only get to
   download it once). Keep the filename Apple gives it.
4. **Certificates** (Certificates > +, or Xcode > Settings > Accounts > Manage
   Certificates). Install all of them in the Mac's login keychain:
   - *Developer ID Application*, for the notarized `.dmg`
   - *Apple Distribution*, to sign the Mac App Store app
   - *Mac Installer Distribution*, to sign the `.pkg` (it shows up in the keychain as
     "3rd Party Mac Developer Installer")

   `security find-identity -v` lists the exact names to paste into `.env`.
5. **Mac App Store provisioning profile.** Profiles > + > Mac App Store Connect, for the
   App ID above. Download it and point `MAS_PROVISION_PROFILE` at it.
6. **iOS signing** is automatic. Xcode creates what it needs for `APPLE_TEAM_ID`, using
   the API key or the account signed in to Xcode.

## Windows

`windows.sh` cross-compiles, so you don't need a Windows machine. The one-time tools are
listed at the top of the script. Two caveats:

- Tauri calls cross-compiling experimental. Test the installer in a Windows VM before
  you ship it.
- The installer is unsigned. It installs, but SmartScreen warns people first. Signing
  needs a code-signing certificate (Azure Trusted Signing is the cheapest route at the
  moment). The Microsoft Store will take the `.exe` as a Win32 app submission, but it
  also wants it signed.

## Generated projects

`android.sh` and `ios.sh` run `tauri android init` / `tauri ios init` the first time,
which creates `src-tauri/gen/android` and `src-tauri/gen/apple`. Both are gitignored right
now, so they're regenerated on a fresh clone. That's fine until you need to hand-edit
something in them (iOS Info.plist permissions, Android manifest tweaks). At that point,
narrow the `.gitignore` entry to `src-tauri/gen/schemas` and commit them.

## Known gaps in the app itself

The builds work. These are the things that will stop the store builds from being
*good*:

- **Mac App Store sandbox.** The sandboxed build can only open folders the user picks
  during the current session. Reopening the last project on launch needs
  security-scoped bookmarks, which the app doesn't save yet.
- **Mobile layout.** The binder, editor and inspector are still a desktop three-column
  layout. Phones need drawers or sheets and a keyboard-aware editor.
- **Mobile storage is app-private.** Projects live in the app's documents folder
  (`fs.library()`), visible in the iOS Files app but tucked away in `Android/data` on
  Android, and deleted on uninstall. Letting Android users pick a real shared folder
  (for Syncthing or an Obsidian vault) needs a small native plugin for the Storage
  Access Framework, since Tauri's dialog plugin has no folder picker on mobile.
