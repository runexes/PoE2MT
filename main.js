const { app, BrowserWindow, ipcMain } = require('electron')
const http = require('http')
const path = require('path')
const fs = require('fs')

const DEFAULT_PORT = 8080
const OVERLAY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/
const OVERLAY_ROUTE_PATTERN = /^\/overlays\/map\/([A-Za-z0-9._-]{1,64})$/
const OVERLAY_EVENTS_PATTERN = /^\/overlays\/map\/([A-Za-z0-9._-]{1,64})\/events$/
const DEFAULT_TEMPLATE = [
  "Maps completed: {maps_completed}",
  "Deaths: {deaths}"
].join("\n")

const DEFAULT_WINDOW = { width: 1248, height: 600 }
const HEARTBEAT_MS = 20000
const FALLBACK_LANGUAGE = "en"
const SUPPORTED_LANGUAGES = ["en", "ru"]

let activeConfig = null
let server = null
let serverRunning = false
let serverError = null
let heartbeatTimer = null
const latestByOverlay = new Map()
const clientsByOverlay = new Map()
const localeCache = new Map()

function defaultOverlays() {
  return [{ id: "map-1", template: DEFAULT_TEMPLATE }]
}

function guessLanguage() {
  try {
    const locale = String(app.getLocale() || "").toLowerCase()
    if (locale.startsWith("ru")) return "ru"
  } catch {
    return FALLBACK_LANGUAGE
  }
  return FALLBACK_LANGUAGE
}

function activeLanguage() {
  return activeConfig?.language || guessLanguage()
}

function localeFile(language) {
  return path.join(__dirname, "locales", `${language}.json`)
}

function readLocale(language) {
  if (localeCache.has(language)) return localeCache.get(language)
  let dict = {}
  try {
    dict = JSON.parse(fs.readFileSync(localeFile(language), "utf8"))
  } catch {
    dict = {}
  }
  localeCache.set(language, dict)
  return dict
}

function loadMessages(language) {
  const fallback = readLocale(FALLBACK_LANGUAGE)
  if (language === FALLBACK_LANGUAGE) return fallback
  return { ...fallback, ...readLocale(language) }
}

function translate(language, key, params) {
  const messages = loadMessages(language)
  const template = Object.prototype.hasOwnProperty.call(messages, key)
    ? messages[key]
    : key
  if (!params) return template
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  )
}

function defaultConfig() {
  return {
    port: DEFAULT_PORT,
    autoStart: false,
    overlayManagerOpen: false,
    language: guessLanguage(),
    overlays: defaultOverlays()
  }
}

function configFile() {
  return path.join(app.getPath("userData"), "stats-server.json")
}

function windowStateFile() {
  return path.join(app.getPath("userData"), "window-state.json")
}

function loadWindowState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStateFile(), "utf8"))
    const width = Number(parsed.width)
    const height = Number(parsed.height)
    if (Number.isFinite(width) && Number.isFinite(height) && width >= 320 && height >= 240) {
      return { width: Math.round(width), height: Math.round(height) }
    }
  } catch {
    return { ...DEFAULT_WINDOW }
  }
  return { ...DEFAULT_WINDOW }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return
  const [width, height] = win.getSize()
  try {
    fs.writeFileSync(windowStateFile(), JSON.stringify({ width, height }, null, 2))
  } catch {
    return
  }
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configFile(), "utf8")
    const parsed = JSON.parse(raw)
    const validation = validateConfig(parsed)
    return validation.ok ? validation.config : defaultConfig()
  } catch {
    return defaultConfig()
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configFile(), JSON.stringify(config, null, 2))
  } catch {
    return
  }
}

function validateConfig(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, error: translate(activeLanguage(), "config.invalid") }
  }

  const language = SUPPORTED_LANGUAGES.includes(candidate.language)
    ? candidate.language
    : activeLanguage()

  const port = Number(candidate.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { ok: false, error: translate(language, "config.portRange") }
  }

  const autoStart = Boolean(candidate.autoStart)
  const overlayManagerOpen = Boolean(candidate.overlayManagerOpen)
  const rawOverlays = Array.isArray(candidate.overlays) ? candidate.overlays : []
  const overlays = []
  const seen = new Set()
  for (const item of rawOverlays) {
    if (!item || typeof item !== "object") continue
    const id = String(item.id || "").trim()
    if (!OVERLAY_ID_PATTERN.test(id)) {
      return {
        ok: false,
        error: translate(language, "config.idInvalid", { id: id || "(empty)" })
      }
    }
    if (seen.has(id)) {
      return { ok: false, error: translate(language, "config.idDuplicate", { id }) }
    }
    seen.add(id)
    overlays.push({ id, template: String(item.template || "") })
  }

  return {
    ok: true,
    config: { port, autoStart, overlayManagerOpen, language, overlays }
  }
}

function overlayUrl(config, overlayId) {
  return `http://localhost:${config.port}/overlays/map/${encodeURIComponent(
    overlayId
  )}`
}

function overlayHtml(overlayId) {
  const eventsUrl = `/overlays/map/${encodeURIComponent(overlayId)}/events`
  return [
    "<!doctype html>",
    `<html lang="${activeLanguage()}">`,
    "<head>",
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${translate(activeLanguage(), "overlay.pageTitle")}</title>`,
    "<style>",
    "html, body { margin: 0; padding: 0; background: transparent; }",
    'body { font-family: "Cascadia Mono", Consolas, "Courier New", monospace; }',
    "#stats { margin: 0; padding: 16px 20px; color: #f4f7ee; font-size: 34px; line-height: 1.35; font-weight: 700; white-space: pre-wrap; overflow-wrap: anywhere; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85); }",
    "</style>",
    "</head>",
    "<body>",
    '<div id="stats"></div>',
    "<script>",
    "(function () {",
    '  var container = document.getElementById("stats")',
    `  var source = new EventSource(${JSON.stringify(eventsUrl)})`,
    "  source.onmessage = function (event) {",
    "    try {",
    '      var data = JSON.parse(event.data)',
    '      container.textContent = data && typeof data.text === "string" ? data.text : ""',
    "    } catch (error) {",
    '      container.textContent = ""',
    "    }",
    "  }",
    "})()",
    "</script>",
    "</body>",
    "</html>",
    ""
  ].join("\n")
}

function sendEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcast(overlayId) {
  const payload = latestByOverlay.get(overlayId)
  if (!payload) return
  const clients = clientsByOverlay.get(overlayId)
  if (!clients) return
  for (const res of clients) {
    try {
      sendEvent(res, payload)
    } catch {
      clients.delete(res)
    }
  }
}

function handleRequest(req, res) {
  const requestPath = new URL(req.url, "http://127.0.0.1").pathname

  if (req.method !== "GET") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("Not found")
    return
  }

  const pageMatch = requestPath.match(OVERLAY_ROUTE_PATTERN)
  if (pageMatch) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    })
    res.end(overlayHtml(pageMatch[1]))
    return
  }

  const eventsMatch = requestPath.match(OVERLAY_EVENTS_PATTERN)
  if (eventsMatch) {
    const overlayId = eventsMatch[1]
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    })
    res.write("retry: 2000\n\n")
    const latest = latestByOverlay.get(overlayId)
    if (latest) sendEvent(res, latest)
    let clients = clientsByOverlay.get(overlayId)
    if (!clients) {
      clients = new Set()
      clientsByOverlay.set(overlayId, clients)
    }
    clients.add(res)
    req.on("close", () => {
      clients.delete(res)
      if (!clients.size) clientsByOverlay.delete(overlayId)
    })
    return
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
  res.end("Not found")
}

function startServer(config) {
  return new Promise((resolve) => {
    const candidate = http.createServer(handleRequest)
    candidate.on("error", (error) => {
      serverRunning = false
      serverError = describeError(error, config.language)
      resolve({ ok: false, error: serverError })
    })
    candidate.listen(config.port, "127.0.0.1", () => {
      server = candidate
      serverRunning = true
      serverError = null
      startHeartbeat()
      resolve({ ok: true })
    })
  })
}

function stopServer() {
  stopHeartbeat()
  for (const clients of clientsByOverlay.values()) {
    for (const res of clients) {
      try {
        res.end()
      } catch {
        continue
      }
    }
  }
  clientsByOverlay.clear()
  if (server) {
    try {
      server.close()
    } catch {
      server = null
    }
    server = null
  }
  serverRunning = false
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    for (const clients of clientsByOverlay.values()) {
      for (const res of clients) {
        try {
          res.write(": keep-alive\n\n")
        } catch {
          clients.delete(res)
        }
      }
    }
  }, HEARTBEAT_MS)
}

function stopHeartbeat() {
  if (!heartbeatTimer) return
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

function describeError(error, language) {
  if (!error) return translate(language, "server.unknownError")
  if (error.code === "EADDRINUSE") return translate(language, "server.portInUse")
  if (error.code === "EACCES") return translate(language, "server.permission")
  return error.message || String(error)
}

function buildResponse() {
  const config = activeConfig || defaultConfig()
  const urls = {}
  for (const overlay of config.overlays) {
    urls[overlay.id] = overlayUrl(config, overlay.id)
  }
  return {
    config: {
      port: config.port,
      autoStart: config.autoStart,
      overlayManagerOpen: Boolean(config.overlayManagerOpen),
      language: config.language,
      overlays: config.overlays.map((overlay) => ({
        id: overlay.id,
        template: overlay.template
      }))
    },
    running: serverRunning,
    urls,
    error: serverError
  }
}

const createWindow = () => {
  const windowState = loadWindowState()
  const win = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  })

  let resizeTimer = null
  win.on("resize", () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => saveWindowState(win), 300)
  })
  win.on("close", () => {
    clearTimeout(resizeTimer)
    saveWindowState(win)
  })

  win.loadFile("index.html")
}

ipcMain.on("stats:update", (event, payload) => {
  if (!payload || typeof payload.text !== "string") return
  const overlayId = String(payload.overlayId || "").trim()
  if (!OVERLAY_ID_PATTERN.test(overlayId)) return
  latestByOverlay.set(overlayId, {
    text: payload.text,
    variables: payload.variables || {},
    updatedAt: Date.now()
  })
  broadcast(overlayId)
})

ipcMain.handle("stats:config:get", () => buildResponse())

ipcMain.handle("i18n:get", () => {
  const language = activeConfig?.language || guessLanguage()
  return { language, messages: loadMessages(language) }
})

ipcMain.handle("stats:config:set", async (event, candidate) => {
  const validation = validateConfig(candidate)
  if (!validation.ok) {
    return { ...buildResponse(), error: validation.error }
  }
  const previous = activeConfig
  activeConfig = validation.config
  saveConfig(activeConfig)
  if (serverRunning && previous && previous.port !== activeConfig.port) {
    stopServer()
    await startServer(activeConfig)
  }
  return buildResponse()
})

ipcMain.handle("stats:server:start", async () => {
  if (serverRunning) return buildResponse()
  await startServer(activeConfig)
  return buildResponse()
})

ipcMain.handle("stats:server:stop", () => {
  stopServer()
  return buildResponse()
})

app.whenReady().then(async () => {
  activeConfig = loadConfig()
  if (activeConfig.autoStart) {
    await startServer(activeConfig)
  }
  process.on("SIGINT", handleSigint)
  process.on("SIGTERM", handleSigint)
  createWindow()
})

app.on("before-quit", stopServer)

app.on("window-all-closed", () => {
  stopServer()
  if (process.platform !== "darwin") app.quit()
})

let shuttingDown = false

function handleSigint() {
  if (shuttingDown) return
  shuttingDown = true
  stopServer()
  try {
    fs.writeSync(1, "\nBye\n")
  } catch {}
  process.exit(0)
}
