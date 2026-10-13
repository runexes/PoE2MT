const { ipcMain, dialog } = require("electron");
const fs = require("fs");
const {
  OVERLAY_ID_PATTERN,
  activeLanguage,
  defaultConfig,
  getActiveConfig,
  saveConfig,
  setActiveConfig,
  validateConfig
} = require("./store");
const { guessLanguage, loadMessages, translate } = require("./i18n");
const { getStatus, startServer, stopServer, updateOverlay } = require("./overlay-server");

function overlayUrl(config, overlayId) {
  return `http://localhost:${config.port}/overlays/map/${encodeURIComponent(overlayId)}`;
}

function buildResponse() {
  const config = getActiveConfig() || defaultConfig();
  const urls = {};
  for (const overlay of config.overlays) {
    urls[overlay.id] = overlayUrl(config, overlay.id);
  }
  const status = getStatus();
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
    running: status.running,
    urls,
    error: status.error
  };
}

function registerIpcHandlers() {
  ipcMain.on("stats:update", (event, payload) => {
    if (!payload || typeof payload.text !== "string") return;
    const overlayId = String(payload.overlayId || "").trim();
    if (!OVERLAY_ID_PATTERN.test(overlayId)) return;
    updateOverlay({
      overlayId,
      text: payload.text,
      variables: payload.variables
    });
  });

  ipcMain.handle("stats:config:get", () => buildResponse());

  ipcMain.handle("i18n:get", () => {
    const language = getActiveConfig()?.language || guessLanguage();
    return { language, messages: loadMessages(language) };
  });

  ipcMain.handle("stats:config:set", async (event, candidate) => {
    const validation = validateConfig(candidate);
    if (!validation.ok) {
      return { ...buildResponse(), error: validation.error };
    }
    const previous = getActiveConfig();
    setActiveConfig(validation.config);
    saveConfig(validation.config);
    if (getStatus().running && previous && previous.port !== validation.config.port) {
      stopServer();
      await startServer(validation.config);
    }
    return buildResponse();
  });

  ipcMain.handle("stats:server:start", async () => {
    if (getStatus().running) return buildResponse();
    await startServer(getActiveConfig());
    return buildResponse();
  });

  ipcMain.handle("stats:server:stop", () => {
    stopServer();
    return buildResponse();
  });

  ipcMain.handle("logs:pick", async () => {
    const result = await dialog.showOpenDialog({
      title: translate(activeLanguage(), "dialog.openLog"),
      properties: ["openFile"],
      filters: [{ name: "Client log", extensions: ["txt", "log"] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return { path: result.filePaths[0] };
  });

  ipcMain.handle("logs:info", async (event, filePath) => {
    if (typeof filePath !== "string" || !filePath) return null;
    try {
      const stat = await fs.promises.stat(filePath);
      return { size: stat.size, mtimeMs: stat.mtimeMs };
    } catch {
      return null;
    }
  });

  ipcMain.handle("logs:read", async (event, filePath, offset, length) => {
    if (typeof filePath !== "string" || !filePath) return Buffer.alloc(0);
    const start = Number(offset);
    const wanted = Number(length);
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(wanted) || wanted <= 0) {
      return Buffer.alloc(0);
    }
    let handle = null;
    try {
      handle = await fs.promises.open(filePath, "r");
      const buffer = Buffer.alloc(wanted);
      const { bytesRead } = await handle.read(buffer, 0, wanted, start);
      return bytesRead === wanted ? buffer : buffer.subarray(0, bytesRead);
    } catch {
      return Buffer.alloc(0);
    } finally {
      if (handle) await handle.close();
    }
  });
}

module.exports = { registerIpcHandlers };
