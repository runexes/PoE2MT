# Contributing

Thanks for your interest in improving PoE 2 Map Tracker. This guide covers how to set up the project, the conventions we use, and how to get a change merged.

## Requirements

- Node.js >= 22.12 (see `.nvmrc`; `nvm use` will pick it up)
- npm

## Setup

```bash
git clone https://github.com/runexes/PoE2MT.git
cd PoE2MT
npm install
```

## Common commands

```bash
npm start            # build the renderer and launch Electron
npm run build        # build the renderer bundle only (src/bundle.js)
npm run build:watch  # rebuild the bundle on change
npm run lint         # ESLint over src/ and electron/
npm run format       # Prettier write
npm run format:check # verify formatting (no writes)
npm test             # node:test unit tests
```

The `Makefile` exposes the same commands.

## Project layout

- `electron/` — main process (CommonJS): window, config store, overlay HTTP server, IPC, preload.
- `src/` — renderer (ES modules, bundled by esbuild): `core/`, `data/`, `log/`, `ui/`.
- `i18n/` — translations shared by the renderer and the overlay server.
- `tests/` — `node:test` unit tests.

## Code style

- Formatting is handled by Prettier (`.prettierrc.json`). Run `npm run format` before committing.
- Linting is handled by ESLint (`eslint.config.mjs`). Run `npm run lint`.
- Keep the renderer modules free of direct Electron APIs; go through `window.statsServer` (see `electron/preload.js`).

## Tests

Add unit tests for pure logic (especially in `src/core/utils.js`). Run them with `npm test`.

## Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add X
fix: correct Y
chore: update Z
docs: describe W
```

## Pull requests

Before opening a PR, make sure:

- `npm run lint`, `npm run format:check`, `npm test` and `npm run build` all pass.
- The change is focused; unrelated refactors go in their own PR.
- User-facing changes are noted in `CHANGELOG.md` under `Unreleased`.

Fill in the pull request template and describe the motivation behind the change.

## Reporting bugs and requesting features

Use the GitHub issue templates. For security issues, follow [`SECURITY.md`](SECURITY.md) instead of opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
