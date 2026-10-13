const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { loadConfig, loadWindowState, saveWindowState, setActiveConfig } = require("./store");
const { startServer, stopServer } = require("./overlay-server");
const { registerIpcHandlers } = require("./ipc");

let shuttingDown = false;

function handleSigint() {
  if (shuttingDown) return;
  shuttingDown = true;
  stopServer();
  try {
    fs.writeSync(1, "\nBye\n");
  } catch {}
  process.exit(0);
}

function createWindow() {
  const windowState = loadWindowState();
  const win = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  let resizeTimer = null;
  win.on("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => saveWindowState(win), 300);
  });
  win.on("close", () => {
    clearTimeout(resizeTimer);
    saveWindowState(win);
  });

  win.loadFile(path.join(__dirname, "..", "src", "index.html"));
}

registerIpcHandlers();

app.whenReady().then(async () => {
  const config = loadConfig();
  setActiveConfig(config);
  if (config.autoStart) {
    await startServer(config);
  }
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigint);
  createWindow();
});

app.on("before-quit", stopServer);

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") app.quit();
});
