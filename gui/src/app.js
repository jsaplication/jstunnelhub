document.addEventListener('DOMContentLoaded', () => {
  const tunnelsContainer = document.getElementById('tunnels-container');

  const logTabsBar = document.getElementById('log-tabs');
  const logPanels = {};
  const logTabButtons = {};

  const modalCreate = document.getElementById('modal-create');
  const createError = document.getElementById('create-error');
  const btnSubmitCreate = document.getElementById('btn-submit-create');
  const createBtnText = document.getElementById('create-btn-text');

  const modalEdit = document.getElementById('modal-edit');
  const editError = document.getElementById('edit-error');
  const btnSubmitEdit = document.getElementById('btn-submit-edit');

  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');

  document.getElementById('btn-minimize')?.addEventListener('click', () => window.api.minimizeWindow());
  document.getElementById('btn-maximize')?.addEventListener('click', () => window.api.maximizeWindow());
  document.getElementById('btn-close')?.addEventListener('click', () => window.api.closeWindow());

  btnLogin?.addEventListener('click', async () => {
    await window.api.loginCloudflare();
    setTimeout(checkAuthStatus, 3000);
  });

  btnLogout?.addEventListener('click', async () => {
    if (confirm('Deseja encerrar a sessão? Os projetos locais serão preservados.')) {
      await window.api.logoutCloudflare();
      checkAuthStatus();
    }
  });

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    checkAuthStatus();
    loadTunnels();
  });

  document.getElementById('btn-open-create')?.addEventListener('click', () => {
    createError.classList.add('hidden');
    resetCreateProjectFields();
    modalCreate.classList.remove('hidden');
  });

  document.getElementById('btn-cancel-create')?.addEventListener('click', () => {
    modalCreate.classList.add('hidden');
  });

  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    modalEdit.classList.add('hidden');
  });

  const COMMAND_PRESETS = {
    php: [
      { label: 'PHP Servidor Embutido (php -S)', value: 'php -S localhost:{PORT}' },
      { label: 'Laravel (php artisan serve)', value: 'php artisan serve --port={PORT}' },
      { label: 'Personalizado...', value: '__custom__' }
    ],
    node: [
      { label: 'npm run dev', value: 'npm run dev' },
      { label: 'npm start', value: 'npm start' },
      { label: 'node server.js', value: 'node server.js' },
      { label: 'node index.js', value: 'node index.js' },
      { label: 'yarn dev', value: 'yarn dev' },
      { label: 'Personalizado...', value: '__custom__' }
    ],
    python: [
      { label: 'Servidor HTTP simples', value: 'python -m http.server {PORT}' },
      { label: 'Django (manage.py runserver)', value: 'python manage.py runserver {PORT}' },
      { label: 'Flask (flask run)', value: 'flask run --port {PORT}' },
      { label: 'FastAPI/Uvicorn (uvicorn main:app)', value: 'uvicorn main:app --port {PORT}' },
      { label: 'Personalizado...', value: '__custom__' }
    ],
    other: [
      { label: 'Personalizado...', value: '__custom__' }
    ]
  };

  function classifyLogLine(line) {
    if (/\[(2\d\d)\]/.test(line)) return "log-line log-ok";
    if (/\[(4\d\d|5\d\d)\]/.test(line)) return "log-line log-error";
    if (/started at|Listening on|Iniciando projeto/i.test(line)) return "log-line log-start";
    if (/error|erro|fatal/i.test(line)) return "log-line log-fatal";
    return "log-line";
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function populatePresets(prefix, type, initialCommand) {
    const select = document.getElementById(`${prefix}-cmd-preset`);
    const cmdInput = document.getElementById(`${prefix}-run-command`);
    const presets = COMMAND_PRESETS[type] || COMMAND_PRESETS.other;

    select.innerHTML = presets.map(p => `<option value="${p.value}">${p.label}</option>`).join('');

    if (initialCommand !== undefined) cmdInput.value = initialCommand;

    const match = presets.find(p => p.value === cmdInput.value);
    select.value = match ? match.value : '__custom__';
    applyPresetChoice(prefix);
  }

  function applyPresetChoice(prefix) {
    const select = document.getElementById(`${prefix}-cmd-preset`);
    const cmdInput = document.getElementById(`${prefix}-run-command`);
    if (select.value === '__custom__') {
      cmdInput.readOnly = false;
      cmdInput.classList.remove('opacity-60');
    } else {
      cmdInput.value = select.value;
      cmdInput.readOnly = true;
      cmdInput.classList.add('opacity-60');
    }
  }

  document.getElementById('create-cmd-preset')?.addEventListener('change', () => applyPresetChoice('create'));
  document.getElementById('edit-cmd-preset')?.addEventListener('change', () => applyPresetChoice('edit'));

  document.getElementById('create-project-type-select')?.addEventListener('change', (e) => {
    populatePresets('create', e.target.value, '');
  });
  document.getElementById('edit-project-type-select')?.addEventListener('change', (e) => {
    populatePresets('edit', e.target.value, '');
  });

  function resetCreateProjectFields() {
    document.getElementById('create-project-path').value = '';
    document.getElementById('create-project-type-select').value = 'other';
    populatePresets('create', 'other', '');
  }

  document.getElementById('btn-select-project-create')?.addEventListener('click', async () => {
    const result = await window.api.selectProjectFolder();
    if (result.canceled) return;

    document.getElementById('create-project-path').value = result.folderPath;
    document.getElementById('create-project-type-select').value = result.type || 'other';
    populatePresets('create', result.type || 'other', result.command || '');
  });

  document.getElementById('btn-select-project-edit')?.addEventListener('click', async () => {
    const result = await window.api.selectProjectFolder();
    if (result.canceled) return;

    document.getElementById('edit-project-path').value = result.folderPath;
    document.getElementById('edit-project-type-select').value = result.type || 'other';
    populatePresets('edit', result.type || 'other', result.command || '');
  });

  async function checkAuthStatus() {
    const dot = document.getElementById('auth-dot');
    const text = document.getElementById('auth-text');

    const auth = await window.api.checkAuth();

    if (auth.isAuthenticated) {
      dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
      text.className = 'text-emerald-400 font-medium';
      text.textContent = 'Autenticado';
      btnLogin.classList.add('hidden');
      btnLogout.classList.remove('hidden');
    } else {
      dot.className = 'w-2 h-2 rounded-full bg-red-500';
      text.className = 'text-red-400 font-medium';
      text.textContent = 'Não Conectado';
      btnLogin.classList.remove('hidden');
      btnLogout.classList.add('hidden');
    }
  }

  btnSubmitCreate?.addEventListener('click', async () => {
    const name = document.getElementById('create-name').value.trim();
    const domain = document.getElementById('create-domain').value.trim();
    const port = document.getElementById('create-port').value.trim();
    const proto = document.getElementById('create-proto').value;

    const projectPath = document.getElementById('create-project-path')?.value.trim() || '';
    const runCommand = document.getElementById('create-run-command')?.value.trim() || '';
    const projectType = document.getElementById('create-project-type-select')?.value || 'other';

    if (!name || !port || !domain) {
      createError.textContent = 'Preencha o Domínio, Subdomínio e Porta.';
      createError.classList.remove('hidden');
      return;
    }

    createBtnText.textContent = 'Criando...';
    btnSubmitCreate.disabled = true;

    const res = await window.api.createTunnel({ name, port, proto, domain, projectPath, projectType, runCommand });

    createBtnText.textContent = 'Criar';
    btnSubmitCreate.disabled = false;

    if (res.success) {
      modalCreate.classList.add('hidden');
      document.getElementById('create-name').value = '';
      resetCreateProjectFields();
      loadTunnels();
    } else {
      createError.textContent = res.error;
      createError.classList.remove('hidden');
    }
  });

  btnSubmitEdit?.addEventListener('click', async () => {
    const name = document.getElementById('edit-name').value;
    const domain = document.getElementById('edit-domain').value;
    const port = document.getElementById('edit-port').value.trim();
    const proto = document.getElementById('edit-proto').value;

    const projectPath = document.getElementById('edit-project-path')?.value.trim() || '';
    const runCommand = document.getElementById('edit-run-command')?.value.trim() || '';
    const projectType = document.getElementById('edit-project-type-select')?.value || 'other';

    if (!port) {
      editError.textContent = 'Informe a porta local.';
      editError.classList.remove('hidden');
      return;
    }

    const res = await window.api.updateTunnel({ name, domain, port, proto, projectPath, projectType, runCommand });

    if (res.success) {
      modalEdit.classList.add('hidden');
      loadTunnels();
    } else {
      editError.textContent = res.error;
      editError.classList.remove('hidden');
    }
  });

  function appendCloudflareLog(text) {
    try {
      const container = document.getElementById('loadCloudflare_here');
      if (!container) return;

      const line = document.createElement('div');
      line.innerHTML = text;
      line.className = classifyLogLine(text) + ' text-xs font-mono whitespace-pre-wrap';

      container.appendChild(line);

      while (container.children.length > 150) {
        container.removeChild(container.firstElementChild);
      }

      container.scrollTop = container.scrollHeight;
    } catch (e) {
      console.error('Erro ao adicionar log do Cloudflared:', e);
    }
  }

  window.api.onTunnelLog((data) => {
    appendCloudflareLog(data.log);
  });

  window.api.onTunnelStatusChanged?.(() => {
    loadTunnels();
  });

  function labelForType(type) {
    const map = { php: 'PHP', node: 'Node.js', python: 'Python', other: 'Outro' };
    return map[type] || '—';
  }

  function getBaseDomain(domain) {
    if (!domain) return '';

    const cleanDomain = domain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0];

    if (window.psl) {
      const parsed = window.psl.parse(cleanDomain);
      if (parsed && parsed.domain) {
        return parsed.domain;
      }
    }

    return cleanDomain;
  }

  async function loadTunnels() {
    tunnelsContainer.innerHTML = '<div class="text-xs text-gray-500">Carregando túneis...</div>';
    const tunnels = await window.api.getTunnels();
    tunnelsContainer.innerHTML = '';

    if (!tunnels || tunnels.length === 0) {
      tunnelsContainer.innerHTML = '<div class="text-xs text-gray-500">Nenhum túnel encontrado.</div>';
      return;
    }

    const groups = {};

    tunnels.forEach(t => {
      const rootDomain = getBaseDomain(t.domain);
      if (!groups[rootDomain]) {
        groups[rootDomain] = [];
      }
      groups[rootDomain].push(t);
    });

    for (const [domainName, items] of Object.entries(groups)) {
      const groupSection = document.createElement('div');
      groupSection.className = 'space-y-3 mb-6';

      const safeId = domainName.replace(/[^a-z0-9]/gi, '_');

      groupSection.innerHTML = `
        <div class="flex items-center gap-2 border-b border-gray-800 pb-2">
          <span class="text-sm font-bold text-orange-400">🌐 Domínio Principal: ${domainName}</span>
          <span class="text-xs text-gray-400">(${items.length} subdomínio(s))</span>
        </div>
        <div class="grid grid-cols-1 gap-4" id="group-${safeId}"></div>
      `;

      tunnelsContainer.appendChild(groupSection);
      const grid = groupSection.querySelector(`#group-${safeId}`);

      items.forEach(tunnel => {
        grid.appendChild(createTunnelCard(tunnel));
      });
    }
  }


  

  // function createTunnelCard(tunnel) {

  //   // 2. Se este card for o que está com as métricas abertas, já cria com a borda laranja
  //   const isActive = activeMetricsTunnel && activeMetricsTunnel === tunnel.name;

  //     card.className = `p-4 rounded-xl border-l-4 bg-gray-900/50 border ${
  //     isActive ? 'ring-2 ring-orange-500 border-orange-500' : 'border-gray-800'
  //   } ${tunnel.isOnline ? 'border-l-emerald-500' : 'border-l-gray-700'}`;

  //   const card = document.createElement('div');
  //   const fullUrl = `https://${tunnel.name}.${tunnel.domain}`;
  //   const fullUrl2 = `https://${tunnel.domain}`;
  //   const cnameTarget = `${tunnel.uuid}.cfargotunnel.com`;
  //   const project = tunnel.project;
  //   const projectBadge = project && project.projectPath
  //     ? `<p class="truncate">Projeto: <span class="text-gray-200">${labelForType(project.type)}</span> — <span class="text-gray-500">${project.projectPath}</span></p>`
  //     : `<p class="text-gray-600">Nenhum projeto vinculado</p>`;

  //   card.className = `p-4 rounded-xl border-l-4 bg-gray-900/50 border border-gray-800 ${tunnel.isOnline ? 'border-l-emerald-500' : 'border-l-gray-700'}`;
  //   card.innerHTML = `
  //     <div class="flex justify-between items-start mb-2">
  //       <div>
  //         <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
  //           tunnel.isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800 text-gray-400'
  //         }">
  //           <span class="w-1.5 h-1.5 rounded-full ${tunnel.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}"></span>
  //           ${tunnel.isOnline ? 'ONLINE' : 'OFFLINE'}
  //         </span>
          
  //       </div>
  //       <div class="flex gap-1">
  //         <button class="btn-toggle text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${tunnel.isOnline
  //             ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
  //             : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30'
  //         }">${tunnel.isOnline ? 'Stop' : 'Start'}</button>

  //         <button class="btn-edit text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300" title="Edit Tunnel">
  //             <div class="icon-btn">
  //               <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
  //                 <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14.304 4.844 2.852 2.852M7 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4.5m2.409-9.91a2.017 2.017 0 0 1 0 2.853l-6.844 6.844L8 14l.713-3.565 6.844-6.844a2.015 2.015 0 0 1 2.852 0Z"/>
  //               </svg>
  //             </div>
  //         </button>

  //         <button class="btn-copy-url text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300" title="Copy URL">
  //             <div class="icon-btn">
  //                <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
  //                 <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.213 9.787a3.391 3.391 0 0 0-4.795 0l-3.425 3.426a3.39 3.39 0 0 0 4.795 4.794l.321-.304m-.321-4.49a3.39 3.39 0 0 0 4.795 0l3.424-3.426a3.39 3.39 0 0 0-4.794-4.795l-1.028.961"/>
  //               </svg>
  //             </div>
  //         </button>

  //         <button class="btn-delete text-xs px-2 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-400" title="Delete Tunnel">
  //             <div class="icon-btn">
  //                 <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
  //                   <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"/>
  //                 </svg>
  //             </div>
  //         </button>

  //         <button class="btn-metrics text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300" title="Open metrics">
  //             <div class="icon-btn">
  //               <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
  //               <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v15a1 1 0 0 0 1 1h15M8 16l2.5-5.5 3 3L17.273 7 20 9.667"/>
  //             </svg>
  //             </div>
  //         </button>
  //       </div>
  //     </div>

  //     <div class="space-y-1.5 text-xs text-gray-400 font-mono mt-2">
  //       <h3 class="text-base font-bold text-white mt-1">${tunnel.domain}</h3>
  //       <p>Local: <span class="text-gray-200">${tunnel.proto}://localhost:${tunnel.port}</span></p>
  //       ${projectBadge}
  //       <div class="flex items-center justify-between bg-black/30 p-1.5 rounded border border-gray-800/80 mt-1">
  //         <div class="truncate mr-2">
  //           <span class="text-gray-500 text-[10px] block">UUID / CNAME TARGET:</span>
  //           <span class="text-gray-300 text-[11px]">${tunnel.uuid}</span>
  //         </div>
  //         <button class="btn-copy-uuid text-[10px] bg-gray-800 hover:bg-gray-700 text-orange-400 px-2 py-1 rounded font-sans shrink-0 font-bold">
  //           Copy CNAME
  //         </button>
  //       </div>
  //     </div>
  //   `;

  //   card.querySelector('.btn-toggle').addEventListener('click', async () => {
  //     if (tunnel.isOnline) {
  //       await window.api.stopTunnel({ name: tunnel.name, domain: tunnel.domain });
  //     } else {
  //       await window.api.startTunnel({ name: tunnel.name, domain: tunnel.domain });
  //     }
  //     loadTunnels();
  //   });

  //   // card.querySelector('.btn-copy-url').addEventListener('click', (e) => {
  //   //   navigator.clipboard.writeText(fullUrl2);
  //   //   const originalText = e.target.textContent;
  //   //   e.target.textContent = '✓ URL';
  //   //   setTimeout(() => e.target.textContent = originalText, 1500);
  //   // });

  //   card.querySelector('.btn-copy-url').addEventListener('click', (e) => {
  //     // e.currentTarget garante que estamos pegando o <button>
  //     const button = e.currentTarget; 
      
  //     navigator.clipboard.writeText(fullUrl2);
      
  //     // Salva todo o conteúdo interno (incluindo o SVG)
  //     const originalContent = button.innerHTML; 
      
  //     // Exibe a indicação de sucesso
  //     button.textContent = '✓ URL';
      
  //     // Restaura o SVG original após 1.5s
  //     setTimeout(() => {
  //       button.innerHTML = originalContent;
  //     }, 1500);
  //   });

  //   card.querySelector('.btn-copy-uuid').addEventListener('click', (e) => {
  //     navigator.clipboard.writeText(cnameTarget);
  //     const originalText = e.target.textContent;
  //     e.target.textContent = 'Copied!';
  //     setTimeout(() => e.target.textContent = originalText, 1500);
  //   });

  //   card.querySelector('.btn-edit').addEventListener('click', () => {
  //     if (tunnel.isOnline) {
  //       alert('Stop the tunnel before changing the settings.');
  //       return;
  //     }
  //     document.getElementById('edit-domain').value = tunnel.domain;
  //     document.getElementById('edit-name').value = tunnel.name;
  //     document.getElementById('edit-host-display').textContent = tunnel.domain;
  //     document.getElementById('edit-port').value = tunnel.port;
  //     document.getElementById('edit-proto').value = tunnel.proto;

  //     const p = tunnel.project;
  //     document.getElementById('edit-project-path').value = p?.projectPath || '';
  //     const type = p?.type || 'other';
  //     document.getElementById('edit-project-type-select').value = type;
  //     populatePresets('edit', type, p?.runCommand || '');

  //     editError.classList.add('hidden');
  //     modalEdit.classList.remove('hidden');
  //   });

  //   card.querySelector('.btn-delete').addEventListener('click', async () => {
  //     if (confirm(`Remover "${tunnel.name}.${tunnel.domain}"?`)) {
  //       await window.api.deleteTunnel({ name: tunnel.name, domain: tunnel.domain });
  //       loadTunnels();
  //     }
  //   });

  //   // CORREÇÃO: Adicionando async para permitir await window.api.getMetricsPort()
  //   card.querySelector('.btn-metrics').addEventListener('click', async () => {
  //     if (!tunnel.isOnline) {
  //       alert('The tunnel must be online to access the metrics.');
  //       return;
  //     }

  //     if (!tunnel.metricsPort) {
  //       alert('The metrics port for this tunnel was not found.');
  //       return;
  //     }

  //     activeMetricsTunnel = tunnel.name;

      
  //     // Remove destaque dos outros e adiciona no atual
  //     document.querySelectorAll('#tunnels-container > div').forEach(c => {
  //       c.classList.remove('ring-2', 'ring-orange-500', 'border-orange-500');
  //       c.classList.add('border-gray-800');
  //     });

  //     card.classList.remove('border-gray-800');
  //     card.classList.add('ring-2', 'ring-orange-500', 'border-orange-500');


  //     const main_api_port = await window.api.getMetricsPort();

  //     const metricsUrl = `metrics.html?metrics=${tunnel.metricsPort}&domain=${tunnel.domain}&name=${tunnel.name}&local=${tunnel.proto}://localhost:${tunnel.port}&main_api_port=${main_api_port}`;

  //     console.log(metricsUrl)
      
  //     document.querySelector("#loadmetrics_here").style.display = 'block';
  //     document.querySelector("#loadCloudflare_here").style.display = 'none';

  //     document.querySelector(".btn_cloudf").classList.remove('tab_active');
  //     document.querySelector(".btn_metrif").classList.add('tab_active');

  //     document.querySelector("#loadmetrics_here").innerHTML = `
  //       <iframe
  //           src="${metricsUrl}"
  //           style="width: 100%; height: calc(100vh - 40px); border: none;"
  //       ></iframe>
  //     `;
  //   });

  //   return card;
  // }


  let activeMetricsTunnel = null; // Mantenha esta variável declarada fora da função createTunnelCard

function createTunnelCard(tunnel) {
    // 1. Primeiro cria o elemento DOM do card
    const card = document.createElement('div');

    const fullUrl = `https://${tunnel.name}.${tunnel.domain}`;
    const fullUrl2 = `https://${tunnel.domain}`;
    const cnameTarget = `${tunnel.uuid}.cfargotunnel.com`;
    const project = tunnel.project;
    const projectBadge = project && project.projectPath
      ? `<p class="truncate">Projeto: <span class="text-gray-200">${labelForType(project.type)}</span> — <span class="text-gray-500">${project.projectPath}</span></p>`
      : `<p class="text-gray-600">Nenhum projeto vinculado</p>`;

    // 2. Verifica se este card é o que está ativo no momento
    const isActive = activeMetricsTunnel && activeMetricsTunnel === tunnel.name;

    // 3. Aplica a classe condicional considerando o estado ativo (com borda laranja)
    card.className = `p-4 rounded-xl border-l-4 bg-gray-900/50 border ${
      isActive ? 'ring-1 ring-orange-500 border-orange-500' : 'border-gray-800'
    } ${tunnel.isOnline ? 'border-l-emerald-500' : 'border-l-gray-700'}`;

    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <div>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
            tunnel.isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800 text-gray-400'
          }">
            <span class="w-1.5 h-1.5 rounded-full ${tunnel.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}"></span>
            ${tunnel.isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
          
        </div>
        <div class="flex gap-1">
          <button class="btn-toggle text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${tunnel.isOnline
              ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30'
          }">${tunnel.isOnline ? 'Stop' : 'Start'}</button>

          <button class="btn-edit text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300" title="Edit Tunnel">
              <div class="icon-btn">
                <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14.304 4.844 2.852 2.852M7 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4.5m2.409-9.91a2.017 2.017 0 0 1 0 2.853l-6.844 6.844L8 14l.713-3.565 6.844-6.844a2.015 2.015 0 0 1 2.852 0Z"/>
                </svg>
              </div>
          </button>

          <button class="btn-copy-url text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300" title="Copy URL">
              <div class="icon-btn">
                 <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.213 9.787a3.391 3.391 0 0 0-4.795 0l-3.425 3.426a3.39 3.39 0 0 0 4.795 4.794l.321-.304m-.321-4.49a3.39 3.39 0 0 0 4.795 0l3.424-3.426a3.39 3.39 0 0 0-4.794-4.795l-1.028.961"/>
                </svg>
              </div>
          </button>

          <button class="btn-delete text-xs px-2 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-400" title="Delete Tunnel">
              <div class="icon-btn">
                  <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"/>
                  </svg>
              </div>
          </button>

          <button class="btn-metrics text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300" title="Open metrics">
              <div class="icon-btn">
                <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v15a1 1 0 0 0 1 1h15M8 16l2.5-5.5 3 3L17.273 7 20 9.667"/>
              </svg>
              </div>
          </button>
        </div>
      </div>

      <div class="space-y-1.5 text-xs text-gray-400 font-mono mt-2">
        <h3 class="text-base font-bold text-white mt-1">${tunnel.domain}</h3>
        <p>Local: <span class="text-gray-200">${tunnel.proto}://localhost:${tunnel.port}</span></p>
        ${projectBadge}
        <div class="flex items-center justify-between bg-black/30 p-1.5 rounded border border-gray-800/80 mt-1">
          <div class="truncate mr-2">
            <span class="text-gray-500 text-[10px] block">UUID / CNAME TARGET:</span>
            <span class="text-gray-300 text-[11px]">${tunnel.uuid}</span>
          </div>
          <button class="btn-copy-uuid text-[10px] bg-gray-800 hover:bg-gray-700 text-orange-400 px-2 py-1 rounded font-sans shrink-0 font-bold">
            Copy CNAME
          </button>
        </div>
      </div>
    `;

    card.querySelector('.btn-toggle').addEventListener('click', async () => {
      if (tunnel.isOnline) {
        await window.api.stopTunnel({ name: tunnel.name, domain: tunnel.domain });
      } else {
        await window.api.startTunnel({ name: tunnel.name, domain: tunnel.domain });
      }
      loadTunnels();
    });

    card.querySelector('.btn-copy-url').addEventListener('click', (e) => {
      const button = e.currentTarget; 
      navigator.clipboard.writeText(fullUrl2);
      
      const originalContent = button.innerHTML; 
      button.textContent = '✓ URL';
      
      setTimeout(() => {
        button.innerHTML = originalContent;
      }, 1500);
    });

    card.querySelector('.btn-copy-uuid').addEventListener('click', (e) => {
      navigator.clipboard.writeText(cnameTarget);
      const originalText = e.target.textContent;
      e.target.textContent = 'Copied!';
      setTimeout(() => e.target.textContent = originalText, 1500);
    });

    card.querySelector('.btn-edit').addEventListener('click', () => {
      if (tunnel.isOnline) {
        alert('Stop the tunnel before changing the settings.');
        return;
      }
      document.getElementById('edit-domain').value = tunnel.domain;
      document.getElementById('edit-name').value = tunnel.name;
      document.getElementById('edit-host-display').textContent = tunnel.domain;
      document.getElementById('edit-port').value = tunnel.port;
      document.getElementById('edit-proto').value = tunnel.proto;

      const p = tunnel.project;
      document.getElementById('edit-project-path').value = p?.projectPath || '';
      const type = p?.type || 'other';
      document.getElementById('edit-project-type-select').value = type;
      populatePresets('edit', type, p?.runCommand || '');

      editError.classList.add('hidden');
      modalEdit.classList.remove('hidden');
    });

    card.querySelector('.btn-delete').addEventListener('click', async () => {
      if (confirm(`Remover "${tunnel.name}.${tunnel.domain}"?`)) {
        await window.api.deleteTunnel({ name: tunnel.name, domain: tunnel.domain });
        loadTunnels();
      }
    });

    card.querySelector('.btn-metrics').addEventListener('click', async () => {
      if (!tunnel.isOnline) {
        alert('The tunnel must be online to access the metrics.');
        return;
      }

      if (!tunnel.metricsPort) {
        alert('The metrics port for this tunnel was not found.');
        return;
      }

      activeMetricsTunnel = tunnel.name;

      // Remove destaque dos outros cards e restaura a borda padrão
      document.querySelectorAll('#tunnels-container > div').forEach(c => {
        c.classList.remove('ring-1', 'ring-orange-500', 'border-orange-500');
        c.classList.add('border-gray-800');
      });

      // Aplica o destaque no card selecionado
      card.classList.remove('border-gray-800');
      card.classList.add('ring-1', 'ring-orange-500', 'border-orange-500');

      const main_api_port = await window.api.getMetricsPort();
      const metricsUrl = `metrics.html?metrics=${tunnel.metricsPort}&domain=${tunnel.domain}&name=${tunnel.name}&local=${tunnel.proto}://localhost:${tunnel.port}&main_api_port=${main_api_port}`;

      console.log(metricsUrl);
      
      document.querySelector("#loadmetrics_here").style.display = 'block';
      document.querySelector("#loadCloudflare_here").style.display = 'none';

      document.querySelector(".btn_cloudf").classList.remove('tab_active');
      document.querySelector(".btn_metrif").classList.add('tab_active');

      document.querySelector("#loadmetrics_here").innerHTML = `
        <iframe
            src="${metricsUrl}"
            style="width: 100%; height: calc(100vh - 40px); border: none;"
        ></iframe>
      `;
    });

    return card;
}

  resetCreateProjectFields();
  checkAuthStatus();
  loadTunnels();
});

function tabs(e) {
  var uid = e.getAttribute('uid');

  if (uid === 'cloudflared') {
    document.querySelector("#loadmetrics_here").style.display = 'none';
    document.querySelector("#loadCloudflare_here").style.display = 'block';

    document.querySelector(".btn_cloudf").classList.add('tab_active');
    document.querySelector(".btn_metrif").classList.remove('tab_active');
  } else {
    document.querySelector("#loadCloudflare_here").style.display = 'none';
    document.querySelector("#loadmetrics_here").style.display = 'block';

    document.querySelector(".btn_cloudf").classList.remove('tab_active');
    document.querySelector(".btn_metrif").classList.add('tab_active');
  }
}