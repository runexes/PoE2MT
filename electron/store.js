const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { SUPPORTED_LANGUAGES, translate, guessLanguage } = require("./i18n");

const DEFAULT_PORT = 8080;
const OVERLAY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_TEMPLATE = ["Maps completed: {maps_completed}", "Deaths: {deaths}"].join("\n");
const DEFAULT_WINDOW = { width: 1248, height: 600 };

let activeConfig = null;

function defaultOverlays() {
  return [{ id: "map-1", template: DEFAULT_TEMPLATE }];
}

function defaultConfig() {
  return {
    port: DEFAULT_PORT,
    autoStart: false,
    overlayManagerOpen: false,
    language: guessLanguage(),
    overlays: defaultOverlays()
  };
}

function activeLanguage() {
  return activeConfig?.language || guessLanguage();
}

function configFile() {
  return path.join(app.getPath("userData"), "stats-server.json");
}

function windowStateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStateFile(), "utf8"));
    const width = Number(parsed.width);
    const height = Number(parsed.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width >= 320 && height >= 240) {
      return { width: Math.round(width), height: Math.round(height) };
    }
  } catch {
    return { ...DEFAULT_WINDOW };
  }
  return { ...DEFAULT_WINDOW };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getSize();
  try {
    fs.writeFileSync(windowStateFile(), JSON.stringify({ width, height }, null, 2));
  } catch {
    return;
  }
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configFile(), "utf8");
    const parsed = JSON.parse(raw);
    const validation = validateConfig(parsed);
    return validation.ok ? validation.config : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configFile(), JSON.stringify(config, null, 2));
  } catch {
    return;
  }
}

function validateConfig(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, error: translate(activeLanguage(), "config.invalid") };
  }

  const language = SUPPORTED_LANGUAGES.includes(candidate.language) ? candidate.language : activeLanguage();

  const port = Number(candidate.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { ok: false, error: translate(language, "config.portRange") };
  }

  const autoStart = Boolean(candidate.autoStart);
  const overlayManagerOpen = Boolean(candidate.overlayManagerOpen);
  const rawOverlays = Array.isArray(candidate.overlays) ? candidate.overlays : [];
  const overlays = [];
  const seen = new Set();
  for (const item of rawOverlays) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").trim();
    if (!OVERLAY_ID_PATTERN.test(id)) {
      return {
        ok: false,
        error: translate(language, "config.idInvalid", { id: id || "(empty)" })
      };
    }
    if (seen.has(id)) {
      return { ok: false, error: translate(language, "config.idDuplicate", { id }) };
    }
    seen.add(id);
    overlays.push({ id, template: String(item.template || "") });
  }

  return {
    ok: true,
    config: { port, autoStart, overlayManagerOpen, language, overlays }
  };
}

function getActiveConfig() {
  return activeConfig;
}

function setActiveConfig(config) {
  activeConfig = config;
}

module.exports = {
  DEFAULT_PORT,
  OVERLAY_ID_PATTERN,
  DEFAULT_TEMPLATE,
  defaultConfig,
  activeLanguage,
  loadWindowState,
  saveWindowState,
  loadConfig,
  saveConfig,
  validateConfig,
  getActiveConfig,
  setActiveConfig
};
