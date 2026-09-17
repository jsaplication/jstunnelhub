// const { contextBridge, ipcRenderer } = require('electron');

// contextBridge.exposeInMainWorld('api', {
//   minimizeWindow: () => ipcRenderer.send('window-minimize'),
//   maximizeWindow: () => ipcRenderer.send('window-maximize'),
//   closeWindow: () => ipcRenderer.send('window-close'),
//   checkAuth: () => ipcRenderer.invoke('check-auth'),
//   loginCloudflare: () => ipcRenderer.invoke('login-cloudflare'),
//   logoutCloudflare: () => ipcRenderer.invoke('logout-cloudflare'),
//   getTunnels: () => ipcRenderer.invoke('get-tunnels'),
//   createTunnel: (data) => ipcRenderer.invoke('create-tunnel', data),
//   updateTunnel: (data) => ipcRenderer.invoke('update-tunnel', data),
//   startTunnel: (data) => ipcRenderer.invoke('start-tunnel', data),
//   stopTunnel: (data) => ipcRenderer.invoke('stop-tunnel', data),
//   deleteTunnel: (data) => ipcRenderer.invoke('delete-tunnel', data),

//   // Novo: seleção de pasta do projeto + detecção automática do tipo
//   selectProjectFolder: () => ipcRenderer.invoke('select-project-folder'),

//   onTunnelLog: (callback) => ipcRenderer.on('tunnel-log', (_event, value) => callback(value))
// });


const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
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

  // Novo: seleção de pasta do projeto + detecção automática do tipo
  selectProjectFolder: () => ipcRenderer.invoke('select-project-folder'),
  getMetricsPort: () => ipcRenderer.invoke('get-metrics-port'),
  // Corrigido: o main.js emite no canal 'jstunnelhub-log' (função sendLog),
  // e não 'tunnel-log' como estava aqui antes — por isso os logs nunca chegavam.
  onTunnelLog: (callback) => ipcRenderer.on('jstunnelhub-log', (_event, value) => callback(value)),

  // Novo: avisa o front quando um túnel muda de status (online/offline),
  // inclusive quando sobe sozinho no auto-start ao abrir o app.
  onTunnelStatusChanged: (callback) => ipcRenderer.on('tunnel-status-changed', (_event, value) => callback(value))

  
});