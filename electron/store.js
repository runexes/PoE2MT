const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { SUPPORTED_LANGUAGES, translate, guessLanguage } = require("./i18n");

const DEFAULT_PORT = 8080;
const OVERLAY_ID_MAX_LENGTH = 64;
const OVERLAY_ID_FORBIDDEN_PATTERN = /[/\\]/;
const DEFAULT_TEMPLATE = ["Maps completed: {maps_completed}", "Deaths: {deaths}"].join("\n");
const DEFAULT_WINDOW = { width: 1248, height: 600 };

const DEFAULT_OBS_HOST = "127.0.0.1";
const DEFAULT_OBS_PORT = 4455;
const OBS_HOST_PATTERN = /^[A-Za-z0-9._:-]{1,253}$/;
const OBS_MAX_PASSWORD_LENGTH = 256;

let activeConfig = null;

function isValidOverlayId(value) {
  const id = String(value);
  if (!id || id === "." || id === "..") return false;
  if (id.length > OVERLAY_ID_MAX_LENGTH) return false;
  if (OVERLAY_ID_FORBIDDEN_PATTERN.test(id)) return false;
  for (const char of id) {
    const code = char.codePointAt(0);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

function defaultOverlays() {
  return [{ id: "map-1", template: DEFAULT_TEMPLATE }];
}

function defaultObsConfig() {
  return { host: DEFAULT_OBS_HOST, port: DEFAULT_OBS_PORT, password: "", autoConnect: false };
}

function sanitizeObsConfig(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const host = typeof source.host === "string" ? source.host.trim() : "";
  const port = Number(source.port);
  return {
    host: OBS_HOST_PATTERN.test(host) ? host : DEFAULT_OBS_HOST,
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_OBS_PORT,
    password: typeof source.password === "string" ? source.password.slice(0, OBS_MAX_PASSWORD_LENGTH) : "",
    autoConnect: Boolean(source.autoConnect)
  };
}

function defaultConfig() {
  return {
    port: DEFAULT_PORT,
    autoStart: false,
    overlayManagerOpen: false,
    language: guessLanguage(),
    overlays: defaultOverlays(),
    obs: defaultObsConfig()
  };
}

function activeLanguage() {
  return activeConfig?.language || guessLanguage();
}

function activeObsConfig() {
  return sanitizeObsConfig(activeConfig?.obs);
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
    if (!isValidOverlayId(id)) {
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
    config: {
      port,
      autoStart,
      overlayManagerOpen,
      language,
      overlays,
      obs: candidate.obs === undefined ? activeObsConfig() : sanitizeObsConfig(candidate.obs)
    }
  };
}

function setObsConfig(candidate) {
  const config = { ...(activeConfig || defaultConfig()), obs: sanitizeObsConfig(candidate) };
  activeConfig = config;
  saveConfig(config);
  return config.obs;
}

function getActiveConfig() {
  return activeConfig;
}

function setActiveConfig(config) {
  activeConfig = config;
}

module.exports = {
  DEFAULT_PORT,
  isValidOverlayId,
  DEFAULT_TEMPLATE,
  defaultConfig,
  activeLanguage,
  activeObsConfig,
  setObsConfig,
  loadWindowState,
  saveWindowState,
  loadConfig,
  saveConfig,
  validateConfig,
  getActiveConfig,
  setActiveConfig
};
