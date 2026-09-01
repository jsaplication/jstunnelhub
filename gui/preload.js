const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  loginCloudflare: () => ipcRenderer.invoke('login-cloudflare'),
  logoutCloudflare: () => ipcRenderer.invoke('logout-cloudflare'),
  getTunnels: () => ipcRenderer.invoke('get-tunnels'),
  createTunnel: (data) => ipcRenderer.invoke('create-tunnel', data),
  updateTunnel: (data) => ipcRenderer.invoke('update-tunnel', data),
  startTunnel: (data) => ipcRenderer.invoke('start-tunnel', data),
  stopTunnel: (data) => ipcRenderer.invoke('stop-tunnel', data),
  deleteTunnel: (data) => ipcRenderer.invoke('delete-tunnel', data),
  onTunnelLog: (callback) => ipcRenderer.on('tunnel-log', (_event, value) => callback(value))
});