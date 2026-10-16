const http = require("http");
const fs = require("fs");
const path = require("path");
const { translate } = require("./i18n");
const { activeLanguage, isValidOverlayId } = require("./store");

const OVERLAY_HTML = fs.readFileSync(path.join(__dirname, "overlay.html"), "utf8");

const OVERLAY_ROUTE_PATTERN = /^\/overlays\/map\/([^/]+)$/;
const OVERLAY_EVENTS_PATTERN = /^\/overlays\/map\/([^/]+)\/events$/;
const HEARTBEAT_MS = 20000;

let server = null;
let serverRunning = false;
let serverError = null;
let heartbeatTimer = null;

const latestByOverlay = new Map();
const clientsByOverlay = new Map();

function overlayHtml(overlayId) {
  const language = activeLanguage();
  const eventsUrl = `/overlays/map/${encodeURIComponent(overlayId)}/events`;
  return OVERLAY_HTML.replaceAll("{{lang}}", language)
    .replaceAll("{{title}}", translate(language, "overlay.pageTitle"))
    .replaceAll("{{eventsUrl}}", JSON.stringify(eventsUrl));
}

function sendEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function decodeOverlayId(segment) {
  let decoded;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return isValidOverlayId(decoded) ? decoded : null;
}

function broadcast(overlayId) {
  const payload = latestByOverlay.get(overlayId);
  if (!payload) return;
  const clients = clientsByOverlay.get(overlayId);
  if (!clients) return;
  for (const res of clients) {
    try {
      sendEvent(res, payload);
    } catch {
      clients.delete(res);
    }
  }
}

function handleRequest(req, res) {
  const requestPath = new URL(req.url, "http://127.0.0.1").pathname;

  if (req.method !== "GET") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const pageMatch = requestPath.match(OVERLAY_ROUTE_PATTERN);
  const pageId = pageMatch ? decodeOverlayId(pageMatch[1]) : null;
  if (pageId) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(overlayHtml(pageId));
    return;
  }

  const eventsMatch = requestPath.match(OVERLAY_EVENTS_PATTERN);
  const overlayId = eventsMatch ? decodeOverlayId(eventsMatch[1]) : null;
  if (overlayId) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write("retry: 2000\n\n");
    const latest = latestByOverlay.get(overlayId);
    if (latest) sendEvent(res, latest);
    let clients = clientsByOverlay.get(overlayId);
    if (!clients) {
      clients = new Set();
      clientsByOverlay.set(overlayId, clients);
    }
    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
      if (!clients.size) clientsByOverlay.delete(overlayId);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function describeError(error, language) {
  if (!error) return translate(language, "server.unknownError");
  if (error.code === "EADDRINUSE") return translate(language, "server.portInUse");
  if (error.code === "EACCES") return translate(language, "server.permission");
  return error.message || String(error);
}

function startServer(config) {
  return new Promise((resolve) => {
    const candidate = http.createServer(handleRequest);
    candidate.on("error", (error) => {
      serverRunning = false;
      serverError = describeError(error, config.language);
      resolve({ ok: false, error: serverError });
    });
    candidate.listen(config.port, "127.0.0.1", () => {
      server = candidate;
      serverRunning = true;
      serverError = null;
      startHeartbeat();
      resolve({ ok: true });
    });
  });
}

function stopServer() {
  stopHeartbeat();
  for (const clients of clientsByOverlay.values()) {
    for (const res of clients) {
      try {
        res.end();
      } catch {
        continue;
      }
    }
  }
  clientsByOverlay.clear();
  if (server) {
    try {
      server.close();
    } catch {
      server = null;
    }
    server = null;
  }
  serverRunning = false;
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    for (const clients of clientsByOverlay.values()) {
      for (const res of clients) {
        try {
          res.write(": keep-alive\n\n");
        } catch {
          clients.delete(res);
        }
      }
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function updateOverlay(payload) {
  latestByOverlay.set(payload.overlayId, {
    text: payload.text,
    variables: payload.variables || {},
    updatedAt: Date.now()
  });
  broadcast(payload.overlayId);
}

function getStatus() {
  return { running: serverRunning, error: serverError };
}

module.exports = {
  startServer,
  stopServer,
  updateOverlay,
  getStatus
};
