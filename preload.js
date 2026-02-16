const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pty', {
  spawn(id, opts = {}) {
    return ipcRenderer.invoke('pty:spawn', { id, ...opts });
  },
  write(id, data) {
    ipcRenderer.send('pty:write', { id, data });
  },
  resize(id, cols, rows) {
    ipcRenderer.send('pty:resize', { id, cols, rows });
  },
  kill(id) {
    ipcRenderer.send('pty:kill', { id });
  },
  onData(id, callback) {
    const channel = `pty:data:${id}`;
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onExit(id, callback) {
    const channel = `pty:exit:${id}`;
    const listener = () => callback();
    ipcRenderer.once(channel, listener);
  },
});
