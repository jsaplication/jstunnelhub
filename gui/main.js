const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const pty = require('@homebridge/node-pty-prebuilt-multiarch');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const http = require('http');

let mainWindow;
let tray = null;
let isQuitting = false;

const activeTunnels = {};   // { "dominio/nome": childProcess (cloudflared) }
const activeProjects = {};  // { "dominio/nome": childProcess (php/node/python) }


const projectLogsBuffer = {}; // { "dominio/nome": [ "log 1", "log 2" ] }
const MAX_LOG_LINES = 150;    // Quantidade máxima de linhas salvas por projeto

function pushProjectLog(key, text) {
  if (!projectLogsBuffer[key]) projectLogsBuffer[key] = [];

  const lines = text.toString().split('\n').filter(line => line.trim() !== '');
  lines.forEach(line => {
    projectLogsBuffer[key].push(`[${new Date().toLocaleTimeString()}] ${line}`);
    if (projectLogsBuffer[key].length > MAX_LOG_LINES) {
      projectLogsBuffer[key].shift(); // Remove a linha mais antiga para não estourar a memória
    }
  });
}


const logThrottle = {}; // { "dominio/nome": { buffer: [], timer: null } }

function sendLogThrottled(name, domain, text, source) {
  const key = `${domain}/${name}`;
  if (!logThrottle[key]) logThrottle[key] = { buffer: [], timer: null };

  logThrottle[key].buffer.push(text);

  if (!logThrottle[key].timer) {
    logThrottle[key].timer = setTimeout(() => {
      const combined = logThrottle[key].buffer.join('');
      sendLog(name, domain, combined, source);
      logThrottle[key].buffer = [];
      logThrottle[key].timer = null;
    }, 250);
  }
}




// const METRICS_API_PORT = 41331;
let currentMetricsApiPort = null;

function getMetricsApiPort() {
  return currentMetricsApiPort;
}

function startMetricsApi() {

  const server = http.createServer((req, res) => {

    const requestUrl = new URL(
      req.url,
      `http://${req.headers.host || '127.0.0.1'}`
    );

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. ROTA DE LOGS DO PROJETO
    if (requestUrl.pathname === '/logs') {
      const domain = requestUrl.searchParams.get('domain');
      const name = requestUrl.searchParams.get('name');

      if (!domain || !name) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Informe os parâmetros domain e name.' }));
        return;
      }

      const key = `${domain}/${name}`;

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });

      res.end(JSON.stringify({
        key: key,
        isOnline: !!activeProjects[key],
        logs: projectLogsBuffer[key] || []
      }));
      return;
    }

    // 2. ROTA DE MÉTRICAS (Só executa se a rota for exatamente /metrics)
    if (requestUrl.pathname === '/metrics') {
      const portMetric = requestUrl.searchParams.get('portametric');

      if (!portMetric) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('# cloudflared_metrics_up 0\n');
        return;
      }

      const port = Number(portMetric);

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('# cloudflared_metrics_up 0\n');
        return;
      }

      const request = http.get({
        hostname: '127.0.0.1',
        port: port,
        path: '/metrics',
        timeout: 5000
      }, (cloudflaredRes) => {

        let data = '';
        cloudflaredRes.setEncoding('utf8');

        cloudflaredRes.on('data', chunk => {
          data += chunk;
        });

        cloudflaredRes.on('end', () => {
          res.writeHead(cloudflaredRes.statusCode || 200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          });
          res.end(data);
        });

      });

      request.on('timeout', () => {
        request.destroy();
        if (!res.writableEnded) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('# cloudflared_metrics_up 0\n');
        }
      });

      request.on('error', () => {
        if (!res.writableEnded) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('# cloudflared_metrics_up 0\n');
        }
      });

      return;
    }

    // 3. SE NÃO FOR /logs NEM /metrics, RETORNA 404
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');

  });

  // Passando 0 como porta, o SO atribui uma porta aleatória disponível
  server.listen(0, '127.0.0.1', () => {
    currentMetricsApiPort = server.address().port;
    console.log(`[METRICS & LOGS API] http://127.0.0.1:${currentMetricsApiPort}`);
  });

  server.on('error', error => {
    console.error('[METRICS API]', error.message);
  });
}

// ---------------------------------------------------------------
// PATHS
// ---------------------------------------------------------------
function getCloudflaredPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'cloudflared.exe')
    : path.join(__dirname, 'cloudflared.exe');
}

function getTunnelsDir() {
  const baseDir = app.isPackaged ? app.getPath('userData') : __dirname;
  const tunnelsPath = path.join(baseDir, 'tunnels');
  if (!fs.existsSync(tunnelsPath)) {
    fs.mkdirSync(tunnelsPath, { recursive: true });
  }
  return tunnelsPath;
}

function getStateFilePath() {
  return path.join(getTunnelsDir(), 'state.json');
}

// ---------------------------------------------------------------
// STATE (quais túneis estavam online -> usado pro auto-start)
// ---------------------------------------------------------------
function loadState() {
  const statePath = getStateFilePath();
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(getStateFilePath(), JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Erro ao salvar state.json', e);
  }
}

function setTunnelState(key, isOnline) {
  const state = loadState();
  if (isOnline) {
    state[key] = true;
  } else {
    delete state[key];
  }
  saveState(state);
}

// ---------------------------------------------------------------
// DETECÇÃO DE TIPO DE PROJETO
// ---------------------------------------------------------------
function detectProjectType(folderPath) {
  let files = [];
  try {
    files = fs.readdirSync(folderPath);
  } catch (e) {
    return { type: 'other', command: '' };
  }

  // Node.js
  if (files.includes('package.json')) {
    let scripts = {};
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(folderPath, 'package.json'), 'utf8'));
      scripts = pkg.scripts || {};
    } catch (e) { /* ignora json quebrado */ }

    let command = 'npm start';
    if (scripts.dev) command = 'npm run dev';
    else if (scripts.start) command = 'npm start';

    return { type: 'node', command };
  }

  // PHP
  const hasPhpFiles = files.some(f => f.toLowerCase().endsWith('.php'));
  if (files.includes('composer.json') || hasPhpFiles) {
    return { type: 'php', command: 'php -S localhost:{PORT}' };
  }

  // Python
  const hasPyFiles = files.some(f => f.toLowerCase().endsWith('.py'));
  if (files.includes('manage.py')) {
    return { type: 'python', command: 'python manage.py runserver {PORT}' };
  }
  if (files.includes('requirements.txt') || hasPyFiles) {
    return { type: 'python', command: 'python -m http.server {PORT}' };
  }

  return { type: 'other', command: '' };
}

// ---------------------------------------------------------------
// PROJECT CONFIG (project.json salvo dentro da pasta do domínio)
// ---------------------------------------------------------------
function getProjectConfigPath(domain) {
  return path.join(getTunnelsDir(), domain, 'project.json');
}

function readProjectConfig(domain) {
  const p = getProjectConfigPath(domain);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeProjectConfig(domain, data) {
  const p = getProjectConfigPath(domain);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------
// JANELA / TRAY
// ---------------------------------------------------------------
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

  // mainWindow.webContents.openDevTools({
  //   mode: "detach"
  // });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico');
  let icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir JSTunnelHub', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Sair e Encerrar Tudo',
      click: () => {
        isQuitting = true;
        Object.keys(activeTunnels).forEach(key => {
          activeTunnels[key].process.kill();
        });
        Object.keys(activeProjects).forEach(key => activeProjects[key].kill());
        app.quit();
      }
    }
  ]);

  tray.setToolTip('JSTunnelHub');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow.show());
}

// ---------------------------------------------------------------
// START/STOP internos (reaproveitados pelo IPC e pelo auto-start)
// ---------------------------------------------------------------
function sendLog(name, domain, log, source = 'tunnel') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('jstunnelhub-log', { name, domain, log, source });
  }
}

function stripAnsi(str) {
  return str
    // remove sequências CSI (cursor, cores, limpar tela, etc)
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    // remove sequências OSC completas (título da janela: ESC ] ... BEL ou ESC ] ... ESC \)
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    // remove qualquer ESC solto que tenha sobrado
    .replace(/\x1b/g, '')
    // remove carriage return solto
    .replace(/\r/g, '');
}

function startProjectProcess(name, domain, projectConfig) {
  const key = `${domain}/${name}`;
  if (!projectConfig || !projectConfig.projectPath || !projectConfig.runCommand) return;
  if (activeProjects[key]) return;

  const port = projectConfig.port || '3000';
  const command = projectConfig.runCommand.replace(/{PORT}/g, port);

  projectLogsBuffer[key] = [];

  const initialMsg = `Iniciando projeto (${projectConfig.type}): ${command}`;
  sendLog(name, domain, initialMsg, 'project');
  pushProjectLog(key, initialMsg);

  const launch = () => {
    const child = pty.spawn('cmd.exe', ['/c', command], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: projectConfig.projectPath,
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    activeProjects[key] = child;

    child.onData((data) => {
      const text = stripAnsi(data.toString());
      pushProjectLog(key, text);
      sendLogThrottled(name, domain, text, 'project');
    });

    child.onExit(({ exitCode }) => {
      delete activeProjects[key];
      const exitMsg = `Processo do projeto encerrado (code ${exitCode}).`;
      pushProjectLog(key, exitMsg);
      sendLog(name, domain, exitMsg, 'project');
    });
  };

  // Se for Windows, podemos matar quem estiver usando a porta antes de subir
  if (process.platform === 'win32') {
    exec(`for /f "tokens=5" %a in ('netstat -a -n -o ^| findstr :${port}') do taskkill /f /pid %a`, () => {
      // Independente se achou alguém ou não na porta, prossegue e inicia
      launch();
    });
  } else {
    launch();
  }
}


function stopProjectProcess(name, domain) {
  const key = `${domain}/${name}`;
  if (activeProjects[key]) {
    const child = activeProjects[key];

    if (process.platform === 'win32') {
      // Mata a árvore de processos no Windows pelo PID
      exec(`taskkill /pid ${child.pid} /f /t`, (err) => {
        // Se falhar o taskkill por PID, tenta derrubar pelo comando genérico ou ignora
      });
    } else {
      child.kill('SIGKILL');
    }

    delete activeProjects[key];
  }
}

function startTunnelInternal(name, domain) {
  return new Promise((resolve) => {
    const key = `${domain}/${name}`;
    // Estrutura nova: tunnels/<domain>/config.yml (sem subpasta com o "name")
    const configPath = path.join(getTunnelsDir(), domain, 'config.yml');
    const cloudflaredPath = getCloudflaredPath();

    if (!fs.existsSync(configPath)) return resolve({ success: false, error: 'Configuração não encontrada.' });
    if (activeTunnels[key]) return resolve({ success: false, error: 'Túnel já está em execução.' });

    // Sobe o processo do projeto (php/node/python) antes do túnel, se configurado
    const projectConfig = readProjectConfig(domain);
    if (projectConfig && projectConfig.runCommand) {
      startProjectProcess(name, domain, projectConfig);
    }

    const metricsPort = Math.floor(Math.random() * (60000 - 20000 + 1)) + 20000;

    const childProcess = spawn(cloudflaredPath, [
      'tunnel',
      '--config', configPath,
      '--metrics', `127.0.0.1:${metricsPort}`,
      'run'
    ]);

    activeTunnels[key] = {
      process: childProcess,
      metricsPort: metricsPort
    };

    setTunnelState(key, true);

    // Avisa o front-end que este túnel ficou online
    // (sem isso, o card só atualiza quando você clica em Atualizar)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel-status-changed', { name, domain, isOnline: true });
    }

    childProcess.stderr.on('data', (data) => sendLog(name, domain, data.toString(), 'tunnel'));

    childProcess.on('close', () => {
      delete activeTunnels[key];
      setTunnelState(key, false);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tunnel-status-changed', { name, domain, isOnline: false });
      }
    });

    resolve({ success: true });
  });
}

// function stopTunnelInternal(name, domain) {
//   const key = `${domain}/${name}`;
//   let stopped = false;
//   if (activeTunnels[key]) {
//     activeTunnels[key].process.kill();
//     delete activeTunnels[key];
//     stopped = true;
//   }
//   stopProjectProcess(name, domain);
//   setTunnelState(key, false);
//   return stopped;
// }


function stopTunnelInternal(name, domain) {
  const key = `${domain}/${name}`;
  let stopped = false;
  
  // Garantir que o estado seja persistence como FALSE imediatamente no arquivo state.json
  setTunnelState(key, false);

  if (activeTunnels[key]) {
    activeTunnels[key].process.kill();
    delete activeTunnels[key];
    stopped = true;
  }

  stopProjectProcess(name, domain);
  return stopped;
}

// Ao abrir o app: religa automaticamente os túneis que estavam online
// da última vez (útil pra quando o PC desliga/liga sozinho).
async function autoStartPersistedTunnels() {
  const state = loadState();
  const keys = Object.keys(state).filter(k => state[k]);
  for (const key of keys) {
    const [domain, name] = key.split('/');
    sendLog(name, domain, '[SISTEMA] Auto-iniciando túnel salvo do último estado...', 'tunnel');
    await startTunnelInternal(name, domain);
  }
}

app.whenReady().then(async () => {
  createWindow();

  // Inicia a API de métricas
  startMetricsApi();

  try { createTray(); } catch (e) { console.error(e); }

  mainWindow.webContents.once('did-finish-load', () => {
    autoStartPersistedTunnels();
  });
});

app.on('window-all-closed', (e) => e.preventDefault());

// ---------------------------------------------------------------
// IPC: AUTENTICAÇÃO
// ---------------------------------------------------------------
ipcMain.handle('check-auth', async () => {
  const userCloudflared = path.join(process.env.USERPROFILE || process.env.HOME, '.cloudflared');
  const certPath = path.join(userCloudflared, 'cert.pem');
  return { isAuthenticated: fs.existsSync(certPath) };
});

ipcMain.handle('login-cloudflare', async () => {
  const cloudflaredPath = getCloudflaredPath();
  exec(`"${cloudflaredPath}" tunnel login`);
  return { success: true };
});

ipcMain.handle('logout-cloudflare', async () => {
  const certPath = path.join(process.env.USERPROFILE || process.env.HOME, '.cloudflared', 'cert.pem');
  if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
  return { success: true };
});

// ---------------------------------------------------------------
// IPC: SELEÇÃO DE PASTA DE PROJETO
// ---------------------------------------------------------------
ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecione a pasta do projeto (PHP, Node ou Python)'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const folderPath = result.filePaths[0];
  const detected = detectProjectType(folderPath);

  return { canceled: false, folderPath, ...detected };
});

// ---------------------------------------------------------------
// IPC: LISTAR TÚNEIS
// Estrutura nova: tunnels/<domain>/config.yml (+ UUID.json + project.json)
// ---------------------------------------------------------------
ipcMain.handle('get-tunnels', async () => {
  const tunnelsDir = getTunnelsDir();
  const list = [];

  const entries = fs.readdirSync(tunnelsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const domainFolder = entry.name;
    const domainPath = path.join(tunnelsDir, domainFolder);

    // Config direto dentro da pasta do domínio (sem subpasta "name")
    const configPath = path.join(domainPath, 'config.yml');
    if (!fs.existsSync(configPath)) continue;

    const content = fs.readFileSync(configPath, 'utf8');

    const uuidMatch = content.match(/tunnel:\s*([\w-]+)/);
    const urlMatch = content.match(/url:\s*(http|https):\/\/localhost:(\d+)/);

    const projectConfig = readProjectConfig(domainFolder);

    // O "name" agora vem do project.json (salvo na criação do túnel).
    // Se não existir por algum motivo, cai de volta para o nome do domínio.
    const projectName = (projectConfig && projectConfig.name) || domainFolder;

    const key = `${domainFolder}/${projectName}`;

    const tunnelInfo = activeTunnels[key];

    list.push({
      name: projectName,
      domain: domainFolder,

      uuid: uuidMatch
        ? uuidMatch[1]
        : 'N/A',

      port: urlMatch
        ? urlMatch[2]
        : '3000',

      proto: urlMatch
        ? urlMatch[1]
        : 'http',

      // Status do Cloudflared
      isOnline: !!tunnelInfo,

      // Porta exclusiva do /metrics
      metricsPort: tunnelInfo
        ? tunnelInfo.metricsPort
        : null,

      // Status do projeto PHP/Node/Python
      isProjectOnline: !!activeProjects[key],

      // Configuração salva
      project: projectConfig || null
    });
  }

  return list;
});

// ---------------------------------------------------------------
// IPC: CRIAR TÚNEL
// Estrutura nova: tunnels/<domain>/config.yml (+ UUID.json + project.json)
// ---------------------------------------------------------------
ipcMain.handle('create-tunnel', async (event, { name, port, proto, domain, projectPath, projectType, runCommand }) => {
  const domainFolder = domain || 'geral';
  const tunnelsDir = getTunnelsDir();

  // Somente a pasta do domínio (sem subpasta com o "name")
  const projectDir = path.join(tunnelsDir, domainFolder);

  const cloudflaredPath = getCloudflaredPath();
  const userCloudflared = path.join(process.env.USERPROFILE || process.env.HOME, '.cloudflared');

  if (fs.existsSync(projectDir)) {
    return { success: false, error: `O domínio "${domainFolder}" já possui uma configuração.` };
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

      const srcJson = path.join(userCloudflared, `${uuid}.json`);
      const destJson = path.join(projectDir, `${uuid}.json`);
      if (fs.existsSync(srcJson)) {
        fs.copyFileSync(srcJson, destJson);
      }

      const formattedJson = destJson.replace(/\\/g, '/');
      const configContent = `tunnel: ${uuid}\ncredentials-file: ${formattedJson}\nurl: ${proto || 'http'}://localhost:${port}`;
      fs.writeFileSync(path.join(projectDir, 'config.yml'), configContent);

      // Salva a configuração do projeto (pasta, tipo, comando, e o "name" do túnel,
      // já que agora ele não é mais representado por uma pasta)
      writeProjectConfig(domainFolder, {
        name,
        projectPath: projectPath || '',
        type: projectType || 'other',
        runCommand: runCommand || '',
        port
      });

      resolve({ success: true, uuid });
    });
  });
});

// ---------------------------------------------------------------
// IPC: EDITAR TÚNEL (porta/protocolo/projeto)
// ---------------------------------------------------------------
ipcMain.handle('update-tunnel', async (event, { name, domain, port, proto, projectPath, projectType, runCommand }) => {
  const configPath = path.join(getTunnelsDir(), domain, 'config.yml');
  if (!fs.existsSync(configPath)) return { success: false, error: 'Configuração não encontrada.' };

  try {
    let content = fs.readFileSync(configPath, 'utf8');
    content = content.replace(/url:\s*(http|https):\/\/localhost:\d+/, `url: ${proto}://localhost:${port}`);
    fs.writeFileSync(configPath, content);

    // Atualiza (ou cria) a configuração do projeto, preservando o "name"
    const existing = readProjectConfig(domain) || {};
    writeProjectConfig(domain, {
      name: name !== undefined ? name : (existing.name || domain),
      projectPath: projectPath !== undefined ? projectPath : (existing.projectPath || ''),
      type: projectType !== undefined ? projectType : (existing.type || 'other'),
      runCommand: runCommand !== undefined ? runCommand : (existing.runCommand || ''),
      port
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------------------------------------------------------------
// IPC: INICIAR / PARAR
// ---------------------------------------------------------------
ipcMain.handle('start-tunnel', (event, { name, domain }) => startTunnelInternal(name, domain));

ipcMain.handle('stop-tunnel', (event, { name, domain }) => {
  const ok = stopTunnelInternal(name, domain);
  return { success: ok };
});




// ---------------------------------------------------------------
// IPC: DELETAR
// ---------------------------------------------------------------
ipcMain.handle('delete-tunnel', async (event, { name, domain }) => {
  const key = `${domain}/${name}`;
  // Apaga a pasta inteira do domínio (config.yml + UUID.json + project.json)
  const projectDir = path.join(getTunnelsDir(), domain);
  const cloudflaredPath = getCloudflaredPath();

  stopTunnelInternal(name, domain);

  return new Promise((resolve) => {
    exec(`"${cloudflaredPath}" tunnel delete -f ${name}`, () => {
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      const state = loadState();
      delete state[key];
      saveState(state);
      resolve({ success: true });
    });
  });
});

ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  mainWindow.hide();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});


// No seu arquivo do processo principal (main.js)
ipcMain.handle('get-metrics-port', () => {
  return getMetricsApiPort();
});