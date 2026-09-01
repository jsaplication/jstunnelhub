const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray = null;
let isQuitting = false;
const activeTunnels = {}; // Armazena processos ativos: { "dominio/projeto": childProcess }

// Retorna o caminho correto do cloudflared.exe (fora do .asar)
function getCloudflaredPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'cloudflared.exe')
    : path.join(__dirname, 'cloudflared.exe');
}

// Retorna o caminho base para a pasta de túneis (gravado em %AppData% no Windows quando empacotado)
function getTunnelsDir() {
  const baseDir = app.isPackaged ? app.getPath('userData') : __dirname;
  const tunnelsPath = path.join(baseDir, 'tunnels');
  if (!fs.existsSync(tunnelsPath)) {
    fs.mkdirSync(tunnelsPath, { recursive: true });
  }
  return tunnelsPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    frame: false,
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico');
  let icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir JSTunnel', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Sair e Encerrar Tudo',
      click: () => {
        isQuitting = true;
        Object.keys(activeTunnels).forEach(key => activeTunnels[key].kill());
        app.quit();
      }
    }
  ]);

  tray.setToolTip('JSTunnel - Cloudflare Manager');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();
  try { createTray(); } catch (e) { console.error(e); }
});

app.on('window-all-closed', (e) => e.preventDefault());

// IPC: Checar Autenticação (cert.pem)
ipcMain.handle('check-auth', async () => {
  const userCloudflared = path.join(process.env.USERPROFILE || process.env.HOME, '.cloudflared');
  const certPath = path.join(userCloudflared, 'cert.pem');
  return { isAuthenticated: fs.existsSync(certPath) };
});

// IPC: Login
ipcMain.handle('login-cloudflare', async () => {
  const cloudflaredPath = getCloudflaredPath();
  exec(`"${cloudflaredPath}" tunnel login`);
  return { success: true };
});

// IPC: Logout
ipcMain.handle('logout-cloudflare', async () => {
  const certPath = path.join(process.env.USERPROFILE || process.env.HOME, '.cloudflared', 'cert.pem');
  if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
  return { success: true };
});

// IPC: Listar Túneis por Domínio e Projeto
ipcMain.handle('get-tunnels', async () => {
  const tunnelsDir = getTunnelsDir();
  const list = [];
  const entries = fs.readdirSync(tunnelsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const domainFolder = entry.name;
      const domainPath = path.join(tunnelsDir, domainFolder);
      const subEntries = fs.readdirSync(domainPath, { withFileTypes: true });

      for (const sub of subEntries) {
        if (sub.isDirectory()) {
          const projectName = sub.name;
          const projectPath = path.join(domainPath, projectName);
          const configPath = path.join(projectPath, 'config.yml');

          if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            const uuidMatch = content.match(/tunnel:\s*([\w-]+)/);
            const urlMatch = content.match(/url:\s*(http|https):\/\/localhost:(\d+)/);

            const key = `${domainFolder}/${projectName}`;
            list.push({
              name: projectName,
              domain: domainFolder,
              uuid: uuidMatch ? uuidMatch[1] : 'N/A',
              port: urlMatch ? urlMatch[2] : '3000',
              proto: urlMatch ? urlMatch[1] : 'http',
              isOnline: !!activeTunnels[key]
            });
          }
        }
      }
    }
  }
  return list;
});

// IPC: Criar Túnel Isolado
ipcMain.handle('create-tunnel', async (event, { name, port, proto, domain }) => {
  const domainFolder = domain || 'geral';
  const tunnelsDir = getTunnelsDir();
  const projectDir = path.join(tunnelsDir, domainFolder, name);
  const cloudflaredPath = getCloudflaredPath();
  const userCloudflared = path.join(process.env.USERPROFILE || process.env.HOME, '.cloudflared');

  if (fs.existsSync(projectDir)) {
    return { success: false, error: `O projeto "${name}" já existe dentro de "${domainFolder}".` };
  }

  return new Promise((resolve) => {
    exec(`"${cloudflaredPath}" tunnel create ${name}`, (error, stdout, stderr) => {
      const output = stdout + stderr;
      if (error || output.toLowerCase().includes('already exists')) {
        return resolve({ success: false, error: `O túnel "${name}" já existe na sua conta Cloudflare.` });
      }

      const uuidMatch = output.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
      if (!uuidMatch) return resolve({ success: false, error: 'Erro ao capturar o UUID do túnel.' });

      const uuid = uuidMatch[0];
      fs.mkdirSync(projectDir, { recursive: true });

      // Copia o arquivo .json para a pasta isolada do projeto
      const srcJson = path.join(userCloudflared, `${uuid}.json`);
      const destJson = path.join(projectDir, `${uuid}.json`);
      if (fs.existsSync(srcJson)) {
        fs.copyFileSync(srcJson, destJson);
      }

      // Salva o config.yml
      const formattedJson = destJson.replace(/\\/g, '/');
      const configContent = `tunnel: ${uuid}\ncredentials-file: ${formattedJson}\nurl: ${proto || 'http'}://localhost:${port}`;
      fs.writeFileSync(path.join(projectDir, 'config.yml'), configContent);

      resolve({ success: true, uuid });
    });
  });
});

// IPC: Editar Porta / Protocolo
ipcMain.handle('update-tunnel', async (event, { name, domain, port, proto }) => {
  const configPath = path.join(getTunnelsDir(), domain, name, 'config.yml');
  if (!fs.existsSync(configPath)) return { success: false, error: 'Configuração não encontrada.' };

  try {
    let content = fs.readFileSync(configPath, 'utf8');
    content = content.replace(/url:\s*(http|https):\/\/localhost:\d+/, `url: ${proto}://localhost:${port}`);
    fs.writeFileSync(configPath, content);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Iniciar Processo Isolado
ipcMain.handle('start-tunnel', (event, { name, domain }) => {
  const key = `${domain}/${name}`;
  const configPath = path.join(getTunnelsDir(), domain, name, 'config.yml');
  const cloudflaredPath = getCloudflaredPath();

  if (!fs.existsSync(configPath)) return { success: false, error: 'Configuração não encontrada.' };
  if (activeTunnels[key]) return { success: false, error: 'Túnel já está em execução.' };

  // Porta de métrica dinâmica
  const metricsPort = Math.floor(Math.random() * (60000 - 20000 + 1)) + 20000;

  const childProcess = spawn(cloudflaredPath, [
    'tunnel',
    '--config', configPath,
    '--metrics', `127.0.0.1:${metricsPort}`,
    'run'
  ]);

  activeTunnels[key] = childProcess;

  childProcess.stderr.on('data', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel-log', { name, domain, log: data.toString() });
    }
  });

  childProcess.on('close', () => {
    delete activeTunnels[key];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel-status-changed', { name, domain, isOnline: false });
    }
  });

  return { success: true };
});

// IPC: Parar Processo
ipcMain.handle('stop-tunnel', (event, { name, domain }) => {
  const key = `${domain}/${name}`;
  if (activeTunnels[key]) {
    activeTunnels[key].kill();
    delete activeTunnels[key];
    return { success: true };
  }
  return { success: false };
});

// IPC: Deletar Projeto e Apagar Pasta
ipcMain.handle('delete-tunnel', async (event, { name, domain }) => {
  const key = `${domain}/${name}`;
  const projectDir = path.join(getTunnelsDir(), domain, name);
  const cloudflaredPath = getCloudflaredPath();

  if (activeTunnels[key]) {
    activeTunnels[key].kill();
    delete activeTunnels[key];
  }

  return new Promise((resolve) => {
    exec(`"${cloudflaredPath}" tunnel delete -f ${name}`, () => {
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      resolve({ success: true });
    });
  });
});

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-close', () => mainWindow.hide());