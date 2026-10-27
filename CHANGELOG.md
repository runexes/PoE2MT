# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project is a fork of [PoE2MT](https://github.com/igodspy/PoE2MT) by igodspy.
Entries below cover changes made in this fork; the original project history is kept in its own repository.

## [0.2.2] - 2026-10-28

### Added

- Boss records: `Client.txt` lines for The Trialmaster ("my service is finally over") and The Raven ("Stupid rat! What have you done? Get out!") are now recorded as boss records, with localized names.
- Top bar now shows the current version and a link to the changelog.

### Changed

- Build output is now minified: `npm run build` passes `--minify` to esbuild; the GitHub Pages workflow minifies CSS.
- Prettier targets `**/*.js` only; `.prettierignore` updated accordingly.
- Persisted state version bumped to `2.0.2`, triggering a one-time full re-scan of the log after upgrade.

### Security

- Dependency updates via `npm audit fix`.

## [0.2.1] - 2026-10-18

### Added

- "Where to find Client.txt" hint section on the first-launch screen.

## [0.2.0] - 2026-10-16

Bring back browser usage and add an OBS WebSocket overlay transport.

### Added

- OBS WebSocket (`obs-websocket` v5) overlay sink: rendered overlay text is pushed into OBS Text sources named after the overlay id. Works in both the Electron build and the browser.
- OBS connection panel with host, port, password, connect-on-launch and live connection status.
- Browser usage restored: `npm run serve` (and `make serve`) starts a local static server so the app runs without Electron.
- GitHub Pages workflow that builds the browser app and deploys it on `v*` tags.
- File access permission is re-requested on the next user gesture in the browser when it cannot be restored silently.

### Changed

- Overlay ids may now contain spaces and non-ASCII characters, since they also name the OBS source. Validation is shared by the renderer, the config store and the overlay HTTP routes.
- The overlay manager is available without Electron and persists its state to `localStorage`.
- The settings section is mode-specific: Electron shows the HTTP overlay server settings, the browser shows the OBS WebSocket settings.
- Localization falls back to bundled JSON when the Electron bridge is unavailable.
- README documents browser usage, the OBS sink and the file-access permission caveat.

### Fixed

- Renaming an overlay id to a value with spaces or non-ASCII characters silently reverted to `map-1`. Invalid ids are now rejected with a visible inline message.

## [0.1.0] - 2026-10-13

First release of the Electron desktop fork.

### Added

- Electron desktop application, replacing the browser-only page.
- Native `Client.txt` selection and streaming reads through the Electron API, supporting system-locked files and large logs.
- Custom stream overlays served over HTTP with live updates via Server-Sent Events (SSE), usable as OBS browser sources.
- English and Russian localization shared by the renderer and the overlay server.
- `electron-builder` packaging targets for Windows (NSIS) and macOS (DMG).
- `node:test` unit tests, ESLint and Prettier tooling.

### Changed

- Split the monolithic renderer into modules under `src/` (`core`, `data`, `log`, `ui`), with the Electron main process under `electron/`.
- Renderer is bundled with esbuild into `src/bundle.js`.
- Overlay markup extracted to `electron/overlay.html` and filled from dynamic placeholders.
- `formatDuration` now respects the selected locale.
- Renderer entry point renamed back to `src/app.js`.

### Removed

- Browser and `file://` usage; the app now requires Electron.

[0.2.2]: https://github.com/runexes/PoE2MT/releases/tag/v0.2.2
[0.2.1]: https://github.com/runexes/PoE2MT/releases/tag/v0.2.1
[0.2.0]: https://github.com/runexes/PoE2MT/releases/tag/v0.2.0
[0.1.0]: https://github.com/runexes/PoE2MT/releases/tag/v0.1.0
