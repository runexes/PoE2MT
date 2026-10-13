const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('statsServer', {
  publish: (payload) => ipcRenderer.send('stats:update', payload),
  getConfig: () => ipcRenderer.invoke('stats:config:get'),
  configSet: (config) => ipcRenderer.invoke('stats:config:set', config),
  serverStart: () => ipcRenderer.invoke('stats:server:start'),
  serverStop: () => ipcRenderer.invoke('stats:server:stop'),
  i18nGet: () => ipcRenderer.invoke('i18n:get'),
  pickLogFile: () => ipcRenderer.invoke('logs:pick'),
  logInfo: (filePath) => ipcRenderer.invoke('logs:info', filePath),
  logRead: (filePath, offset, length) => ipcRenderer.invoke('logs:read', filePath, offset, length)
})