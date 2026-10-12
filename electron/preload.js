const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('statsServer', {
  publish: (payload) => ipcRenderer.send('stats:update', payload),
  getConfig: () => ipcRenderer.invoke('stats:config:get'),
  configSet: (config) => ipcRenderer.invoke('stats:config:set', config),
  serverStart: () => ipcRenderer.invoke('stats:server:start'),
  serverStop: () => ipcRenderer.invoke('stats:server:stop'),
  i18nGet: () => ipcRenderer.invoke('i18n:get')
})