# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project is a fork of [PoE2MT](https://github.com/igodspy/PoE2MT) by igodspy.
Entries below cover changes made in this fork; the original project history is kept in its own repository.

## [Unreleased]

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

[Unreleased]: https://github.com/runexes/PoE2MT/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/runexes/PoE2MT/releases/tag/v0.1.0
