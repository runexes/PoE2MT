export const DEFAULT_OBS_HOST = "127.0.0.1";
export const DEFAULT_OBS_PORT = 4455;
export const OBS_STORAGE_KEY = "poe2-map-tracker-obs";

const HOST_PATTERN = /^[A-Za-z0-9._:-]{1,253}$/;
const MAX_PASSWORD_LENGTH = 256;

export function sanitizeObsSettings(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const host = typeof source.host === "string" ? source.host.trim() : "";
  const port = Number(source.port);
  return {
    host: HOST_PATTERN.test(host) ? host : DEFAULT_OBS_HOST,
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_OBS_PORT,
    password: typeof source.password === "string" ? source.password.slice(0, MAX_PASSWORD_LENGTH) : "",
    autoConnect: Boolean(source.autoConnect)
  };
}

export function defaultObsSettings() {
  return sanitizeObsSettings(null);
}

function readStoredObsSettings() {
  try {
    return sanitizeObsSettings(JSON.parse(localStorage.getItem(OBS_STORAGE_KEY)));
  } catch {
    return null;
  }
}

export async function loadObsSettings() {
  if (window.statsServer?.getConfig) {
    try {
      const info = await window.statsServer.getConfig();
      if (info?.config?.obs) return sanitizeObsSettings(info.config.obs);
    } catch {
      // fall through to defaults
    }
    return defaultObsSettings();
  }
  return readStoredObsSettings() || defaultObsSettings();
}

export async function saveObsSettings(settings) {
  const clean = sanitizeObsSettings(settings);
  if (window.statsServer?.obsConfigSet) {
    try {
      await window.statsServer.obsConfigSet(clean);
    } catch {
      // OBS settings are not critical; keep the in-memory value
    }
    return clean;
  }
  try {
    localStorage.setItem(OBS_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // storage may be unavailable; settings stay session-only
  }
  return clean;
}
