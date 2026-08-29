# ☁️ Gerenciador de Túneis Cloudflare — JStunnel

Gerenciador de túneis **Cloudflare Tunnel para Windows**, desenvolvido pela **JSaplication**, com foco em facilitar a criação e execução de múltiplos túneis de forma **isolada por projeto**.

O sistema utiliza o `cloudflared.exe` oficial da Cloudflare e automatiza a criação dos arquivos necessários para executar cada túnel.

---

## 🚀 Funcionalidades

O gerenciador possui um menu interativo com as seguintes opções:

```text
[1] Autenticar Conta (Login)
[2] Criar NOVO Tunel Isolado
[3] Iniciar Tunel
[4] Listar Tunneis da Conta
[5] Deletar Tunel
[6] Sair
```

### Recursos

* 🔐 Login da conta Cloudflare
* 🚇 Criação de novos Cloudflare Tunnels
* 📁 Cada túnel possui sua própria pasta
* 🔑 Credencial `.json` isolada por projeto
* ⚙️ Geração automática do `config.yml`
* ▶️ Geração automática de `.bat` para iniciar o túnel
* 🌐 Suporte a HTTP e HTTPS
* 📋 Listagem dos túneis da conta
* 🗑️ Exclusão do túnel e dos arquivos locais
* 🖱️ Execução com apenas dois cliques

---

# 📦 Requisitos

Antes de utilizar o gerenciador, você precisa ter:

* Windows 10 ou superior
* Uma conta Cloudflare
* Um domínio adicionado à Cloudflare
* `cloudflared.exe`

O executável utilizado pelo projeto é o `cloudflared` oficial da Cloudflare.

Código-fonte oficial:

https://github.com/cloudflare/cloudflared

---

# 📁 Estrutura do projeto

O `cloudflared.exe` deve ficar na mesma pasta do gerenciador.

Exemplo:

```text
JStunnel/
│
├── gerenciador.bat
├── cloudflared.exe
│
└── tunnels/
    │
    ├── api/
    │   ├── 8f123456-1234-1234-1234-123456789abc.json
    │   ├── config.yml
    │   └── iniciar_api.bat
    │
    ├── site/
    │   ├── 91abcdef-5678-5678-5678-abcdef123456.json
    │   ├── config.yml
    │   └── iniciar_site.bat
    │
    └── painel/
        ├── 12345678-abcd-abcd-abcd-123456789abc.json
        ├── config.yml
        └── iniciar_painel.bat
```

Cada projeto possui sua própria configuração e credencial.

Isso permite executar vários túneis independentemente.

---

# ⚙️ Instalação

## 1. Baixe o `cloudflared`

Baixe o executável oficial do Cloudflare Tunnel para Windows.

Renomeie o arquivo para:

```text
cloudflared.exe
```

Coloque-o na mesma pasta do gerenciador:

```text
JStunnel/
├── gerenciador.bat
└── cloudflared.exe
```

---

# 🔐 2. Autenticar sua conta Cloudflare

Execute:

```text
gerenciador.bat
```

No menu, selecione:

```text
[1] Autenticar Conta (Login)
```

O Cloudflare abrirá o navegador para você autorizar a conta. e o dominio escolhido

Depois da autorização, o `cloudflared` salvará as credenciais localmente.

---

# 🚇 3. Criar um novo túnel

No menu, escolha:

```text
[2] Criar NOVO Tunel Isolado
```

O sistema solicitará o nome do projeto.

Exemplo:

```text
Digite o NOME do projeto:
api
```

Depois informe a porta utilizada pelo servidor local:

```text
Digite a porta local do seu servidor:
4141
```

E o protocolo:

```text
Digite o protocolo [http/https]:
http
```

---

# 📂 Arquivos gerados

Depois da criação, o sistema criará automaticamente:

```text
tunnels/
└── api/
    ├── UUID.json
    ├── config.yml
    └── iniciar_api.bat
```

### UUID.json

É o arquivo de credenciais do túnel.

Exemplo:

```text
8f123456-1234-1234-1234-123456789abc.json
```

### config.yml

É criado automaticamente com a configuração do túnel.

Exemplo:

```yaml
tunnel: 8f123456-1234-1234-1234-123456789abc
credentials-file: C:\...\tunnels\api\8f123456-1234-1234-1234-123456789abc.json
url: http://localhost:4141
```

### iniciar_api.bat

É um executável de inicialização de um clique.

Ao executá-lo, o Cloudflare Tunnel será iniciado utilizando o `config.yml` daquele projeto.

---

# 🌐 4. Configurar o DNS

Depois de criar o túnel, o sistema exibirá o endereço:

```text
UUID.cfargotunnel.com
```

Exemplo:

```text
8f123456-1234-1234-1234-123456789abc.cfargotunnel.com
```

Agora entre no painel da Cloudflare:

**DNS → Registros → Adicionar registro**

Crie um registro:

```text
Tipo: CNAME
Nome: api
Destino: UUID.cfargotunnel.com
Proxy: Ativado
```

Por exemplo:

```text
api.seudominio.com.br
        ↓
8f123456-1234-1234-1234-123456789abc.cfargotunnel.com
```

Depois disso:

```text
https://api.seudominio.com.br
```

será direcionado para:

```text
http://localhost:4141
```

---

# ▶️ 5. Iniciar um túnel

No gerenciador, selecione:

```text
[3] Iniciar Tunel
```

Informe o nome do projeto:

```text
api
```

O sistema encontrará automaticamente:

```text
tunnels/api/config.yml
```

e executará o túnel.

Também é possível iniciar diretamente pelo arquivo:

```text
tunnels/api/iniciar_api.bat
```

---

# 📋 6. Listar túneis

Selecione:

```text
[4] Listar Tunneis da Conta
```

O gerenciador executará:

```bash
cloudflared tunnel list
```

e mostrará os túneis existentes na conta Cloudflare.

---

# 🗑️ 7. Deletar um túnel

Selecione:

```text
[5] Deletar Tunel
```

Informe o nome do projeto.

Exemplo:

```text
api
```

O sistema irá:

1. Limpar o túnel na Cloudflare
2. Excluir o túnel da conta
3. Excluir a pasta local do projeto
4. Excluir os arquivos de configuração

A pasta:

```text
tunnels/api/
```

será removida.

> ⚠️ **Atenção:** essa operação é destrutiva. Os arquivos locais do projeto também serão apagados.

---

# 🔒 Isolamento dos projetos

Uma das principais características do JStunnel é o isolamento por pasta.

Por exemplo:

```text
tunnels/
├── api/
├── site/
├── painel/
└── servidor/
```

Cada projeto possui:

```text
config.yml
UUID.json
iniciar_PROJETO.bat
```

Isso evita que a configuração de um projeto interfira diretamente na configuração de outro.

---

# 💻 Exemplo completo

Suponha que você tenha uma API rodando localmente:

```text
localhost:4141
```

Você cria o projeto:

```text
api
```

O gerenciador poderá gerar:

```text
tunnels/
└── api/
    ├── 8f123456-1234-1234-1234-123456789abc.json
    ├── config.yml
    └── iniciar_api.bat
```

O `config.yml` apontará para:

```text
http://localhost:4141
```

No Cloudflare DNS:

```text
api.seudominio.com.br
        ↓
UUID.cfargotunnel.com
```

Resultado:

```text
Internet
   ↓
Cloudflare
   ↓
Cloudflare Tunnel
   ↓
localhost:4141
   ↓
Sua API
```

---

# 🔄 Vários projetos simultaneamente

É possível ter vários serviços diferentes:

```text
api.seudominio.com.br
        ↓
localhost:4141

painel.seudominio.com.br
        ↓
localhost:3000

site.seudominio.com.br
        ↓
localhost:8080
```

Cada um pode possuir seu próprio túnel:

```text
tunnels/
├── api/
├── painel/
└── site/
```

E cada projeto pode ser iniciado através do seu próprio `.bat`.

---

# 🛠️ Tecnologias

O projeto utiliza:

* Windows Batch (`.bat`)
* Cloudflare Tunnel
* `cloudflared`
* YAML
* JSON

---

# 🔗 Links

### JSaplication

https://jsaplication.com.br

### JStunnel

https://jsaplication.github.com/jstunnel

### Cloudflared

https://github.com/cloudflare/cloudflared

---

# ⚠️ Segurança

Os arquivos `.json` gerados pelo Cloudflare contêm **credenciais do túnel**.

Não compartilhe esses arquivos publicamente.

Evite enviar:

```text
*.json
```

para repositórios públicos.

Também não publique suas credenciais em:

* GitHub
* Discord
* Fóruns
* Sites
* Prints
* Logs públicos

Se uma credencial for exposta, recomenda-se revogar/rotacionar o túnel afetado.

---

# 📄 Licença

Este projeto utiliza o `cloudflared`, desenvolvido pela Cloudflare.

Consulte o repositório oficial para informações sobre licença e código-fonte:

https://github.com/cloudflare/cloudflared

O gerenciador JStunnel é desenvolvido pela **JSaplication**.

---

# 👨‍💻 Desenvolvido por

**JSaplication**

Soluções em desenvolvimento de aplicações, sistemas, automação, tecnologia e software.

🌐 https://jsaplication.com.br

---

## ⭐ JStunnel

Uma maneira simples de organizar e executar seus **Cloudflare Tunnels no Windows**, mantendo cada projeto separado e pronto para iniciar com um clique.
