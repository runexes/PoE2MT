# PoE 2 Map Tracker

Electron desktop tracker for Path of Exile 2 map runs.

The app reads `Client.txt`, detects area changes, groups runs by location, counts repeated runs, tracks map duration, and updates while the game keeps writing to the log. It can also serve custom stream overlays over HTTP so tools like OBS can display live stats.

## How to use

1. Launch the app (`npm start`, or the packaged build).
2. Pick a start date, then click `Open Client.txt`.
3. Select the game's `Client.txt` log file.
4. Wait for the full scan to finish.
5. Keep the app open while playing to update runs in realtime.

Parsed data is stored locally and restored on the next launch, so you do not start from scratch unless you click `Clear`.

### Stream overlays

Open `Stream Overlay` from the top bar to manage overlays. Each overlay gets a local URL (for example `http://localhost:8080/overlays/map/map-1`) that you can add as a browser source in OBS. The overlay page updates live over Server-Sent Events.

## Log file location

The file is named:

```text
Client.txt
```

Common standalone install path:

```text
C:\Program Files\Grinding Gear Games\Path of Exile 2\logs\Client.txt
```

or, on some systems:

```text
C:\Program Files (x86)\Grinding Gear Games\Path of Exile 2\logs\Client.txt
```

Common Steam install path:

```text
C:\Program Files (x86)\Steam\steamapps\common\Path of Exile 2\logs\Client.txt
```

If Steam is installed on another drive or library folder, open that Steam library and look for:

```text
steamapps\common\Path of Exile 2\logs\Client.txt
```

## Development

Requires Node.js and npm.

```bash
npm install      # install dependencies

npm start        # build the renderer bundle and launch Electron
npm run build    # build the renderer bundle only (src/bundle.js)
npm run build:watch  # rebuild the bundle on change (pair with a restarted Electron)

npm run lint     # ESLint over src/ and electron/
npm run format   # Prettier --write over the project
npm run format:check  # verify formatting (no writes)
npm test         # node:test unit tests

npm run pack     # unpacked build (electron-builder --dir)
npm run dist:win # Windows installer
npm run dist:mac # macOS dmg
```

The `Makefile` exposes the same commands: `make start`, `make dev`, `make build`, `make lint`, `make format`, `make format-check`, `make test`, `make pack`, `make dist-win`, `make dist-mac`.

> `npm start` and all `dist*`/`pack` targets run the renderer build first, so `src/bundle.js` is always up to date.

## Project layout

```text
electron/            main process (CommonJS)
  main.js            app lifecycle and window
  store.js           config + window-state persistence and validation
  i18n.js            locale loading and translate()
  overlay-server.js  HTTP + SSE overlay server
  ipc.js             ipcMain handlers
  preload.js         contextBridge API (window.statsServer)

src/                 renderer (ES modules, bundled by esbuild)
  app.js             bootstrap, event wiring, init
  core/              constants, state, utils, dom, i18n
  data/              locations.data, classification
  log/               file-source, file-picker, handle-store, scanner, parser
  ui/                overlays, render, summary, table, labels

i18n/                en.json, ru.json
tests/               node:test unit tests
```

## Notes

- The app only reads the selected log file.
- Map completion time is calculated from entering an area until the next area transition.
- Location metadata lives in `src/locations.data.js`.
- Translations live in `i18n/` and are shared by the renderer and the overlay server.
