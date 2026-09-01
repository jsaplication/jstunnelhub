document.addEventListener('DOMContentLoaded', () => {
  const tunnelsContainer = document.getElementById('tunnels-container');
  const terminalLogs = document.getElementById('terminal-logs');
  const activeLogTarget = document.getElementById('active-log-target');

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
  document.getElementById('btn-close')?.addEventListener('click', () => window.api.closeWindow());

  btnLogin?.addEventListener('click', async () => {
    appendLog('[SISTEMA] Solicitando login...');
    await window.api.loginCloudflare();
    setTimeout(checkAuthStatus, 3000);
  });

  btnLogout?.addEventListener('click', async () => {
    if (confirm('Deseja encerrar a sessão? Os projetos locais serão preservados.')) {
      await window.api.logoutCloudflare();
      appendLog('[SISTEMA] Sessão encerrada.');
      checkAuthStatus();
    }
  });

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    checkAuthStatus();
    loadTunnels();
  });

  document.getElementById('btn-open-create')?.addEventListener('click', () => {
    createError.classList.add('hidden');
    modalCreate.classList.remove('hidden');
  });

  document.getElementById('btn-cancel-create')?.addEventListener('click', () => {
    modalCreate.classList.add('hidden');
  });

  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    modalEdit.classList.add('hidden');
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

    if (!name || !port || !domain) {
      createError.textContent = 'Preencha o Domínio, Subdomínio e Porta.';
      createError.classList.remove('hidden');
      return;
    }

    createBtnText.textContent = 'Criando...';
    btnSubmitCreate.disabled = true;

    const res = await window.api.createTunnel({ name, port, proto, domain });

    createBtnText.textContent = 'Criar';
    btnSubmitCreate.disabled = false;

    if (res.success) {
      modalCreate.classList.add('hidden');
      document.getElementById('create-name').value = '';
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

    if (!port) {
      editError.textContent = 'Informe a porta local.';
      editError.classList.remove('hidden');
      return;
    }

    const res = await window.api.updateTunnel({ name, domain, port, proto });

    if (res.success) {
      modalEdit.classList.add('hidden');
      loadTunnels();
    } else {
      editError.textContent = res.error;
      editError.classList.remove('hidden');
    }
  });

  window.api.onTunnelLog((data) => {
    appendLog(`[${data.domain}/${data.name}] ${data.log}`);
  });

  function appendLog(text) {
    const line = document.createElement('div');
    line.textContent = text;
    terminalLogs.appendChild(line);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
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
      if (!groups[t.domain]) groups[t.domain] = [];
      groups[t.domain].push(t);
    });

    for (const [domainName, items] of Object.entries(groups)) {
      const groupSection = document.createElement('div');
      groupSection.className = 'space-y-3';
      
      groupSection.innerHTML = `
        <div class="flex items-center gap-2 border-b border-gray-800 pb-2">
          <span class="text-sm font-bold text-orange-400">🌐 Domínio: ${domainName}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="group-${domainName.replace(/[^a-z0-9]/gi, '_')}"></div>
      `;

      tunnelsContainer.appendChild(groupSection);
      const grid = groupSection.querySelector('div:nth-child(2)');

      items.forEach(tunnel => {
        grid.appendChild(createTunnelCard(tunnel));
      });
    }
  }

  function createTunnelCard(tunnel) {
    const card = document.createElement('div');
    const fullUrl = `https://${tunnel.name}.${tunnel.domain}`;
    const cnameTarget = `${tunnel.uuid}.cfargotunnel.com`;

    card.className = `p-4 rounded-xl border-l-4 bg-gray-900/50 border border-gray-800 ${
      tunnel.isOnline ? 'border-l-emerald-500' : 'border-l-gray-700'
    }`;

    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <div>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
            tunnel.isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800 text-gray-400'
          }">
            <span class="w-1.5 h-1.5 rounded-full ${tunnel.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}"></span>
            ${tunnel.isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
          <h3 class="text-base font-bold text-white mt-1">${tunnel.name}.${tunnel.domain}</h3>
        </div>
        <div class="flex gap-1">
          <button class="btn-toggle text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
            tunnel.isOnline 
              ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30' 
              : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30'
          }">${tunnel.isOnline ? 'Parar' : 'Iniciar'}</button>
          <button class="btn-edit text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300" title="Editar Porta">✏️</button>
          <button class="btn-copy-url text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300" title="Copiar URL Pública">📋 URL</button>
          <button class="btn-delete text-xs px-2 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-400" title="Excluir">🗑️</button>
        </div>
      </div>

      <div class="space-y-1.5 text-xs text-gray-400 font-mono mt-2">
        <p>Local: <span class="text-gray-200">${tunnel.proto}://localhost:${tunnel.port}</span></p>
        <div class="flex items-center justify-between bg-black/30 p-1.5 rounded border border-gray-800/80 mt-1">
          <div class="truncate mr-2">
            <span class="text-gray-500 text-[10px] block">UUID / CNAME TARGET:</span>
            <span class="text-gray-300 text-[11px]">${tunnel.uuid}</span>
          </div>
          <button class="btn-copy-uuid text-[10px] bg-gray-800 hover:bg-gray-700 text-orange-400 px-2 py-1 rounded font-sans shrink-0 font-bold">
            Copiar CNAME
          </button>
        </div>
      </div>
    `;

    card.querySelector('.btn-toggle').addEventListener('click', async () => {
      activeLogTarget.textContent = `[${tunnel.domain}/${tunnel.name}]`;
      if (tunnel.isOnline) {
        await window.api.stopTunnel({ name: tunnel.name, domain: tunnel.domain });
      } else {
        appendLog(`[SISTEMA] Iniciando processo para ${tunnel.name}.${tunnel.domain}...`);
        await window.api.startTunnel({ name: tunnel.name, domain: tunnel.domain });
      }
      loadTunnels();
    });

    card.querySelector('.btn-copy-url').addEventListener('click', (e) => {
      navigator.clipboard.writeText(fullUrl);
      const originalText = e.target.textContent;
      e.target.textContent = '✓ URL';
      setTimeout(() => e.target.textContent = originalText, 1500);
    });

    card.querySelector('.btn-copy-uuid').addEventListener('click', (e) => {
      navigator.clipboard.writeText(cnameTarget);
      const originalText = e.target.textContent;
      e.target.textContent = 'Copiado!';
      setTimeout(() => e.target.textContent = originalText, 1500);
    });

    card.querySelector('.btn-edit').addEventListener('click', () => {
      if (tunnel.isOnline) {
        alert('Pare o túnel antes de alterar as configurações de porta.');
        return;
      }
      document.getElementById('edit-domain').value = tunnel.domain;
      document.getElementById('edit-name').value = tunnel.name;
      document.getElementById('edit-host-display').textContent = fullUrl;
      document.getElementById('edit-port').value = tunnel.port;
      document.getElementById('edit-proto').value = tunnel.proto;
      editError.classList.add('hidden');
      modalEdit.classList.remove('hidden');
    });

    card.querySelector('.btn-delete').addEventListener('click', async () => {
      if (confirm(`Remover "${tunnel.name}.${tunnel.domain}"?`)) {
        await window.api.deleteTunnel({ name: tunnel.name, domain: tunnel.domain });
        loadTunnels();
      }
    });

    return card;
  }

  checkAuthStatus();
  loadTunnels();
});