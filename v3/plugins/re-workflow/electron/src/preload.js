const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveLog:    (text)    => ipcRenderer.invoke('save-log', text),
  getVersion: ()        => ipcRenderer.invoke('get-version'),
});

contextBridge.exposeInMainWorld('claudeFlow', {
  memoryStore:    (key, data, namespace) => ipcRenderer.invoke('cf-memory-store', { key, namespace, data }),
  memoryRetrieve: (key, namespace)       => ipcRenderer.invoke('cf-memory-retrieve', { key, namespace }),
  memoryList:     (namespace)            => ipcRenderer.invoke('cf-memory-list', { namespace }),
  hook:           (type, payload)        => ipcRenderer.invoke('cf-hook', { type, payload }),
});
