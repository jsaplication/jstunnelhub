# JSTunnel

> **JSTunnel** é uma aplicação desktop em versão **Beta** desenvolvida para facilitar a criação e o gerenciamento de túneis utilizando o **Cloudflare Tunnel (cloudflared)**.

A aplicação busca simplificar o processo de configuração dos túneis, evitando a necessidade de executar manualmente diversos comandos no terminal.

---

## 🚀 Versão

**JSTunnel Desktop — Beta**

> ⚠️ Esta é uma versão Beta. Alguns recursos podem estar em desenvolvimento ou sofrer alterações nas próximas versões.

---

## 📋 Requisitos

Antes de iniciar o projeto, certifique-se de ter instalado:

* [Node.js](https://nodejs.org/)
* npm
* Windows
* Conta na Cloudflare
* Um domínio configurado na Cloudflare

Além disso, é necessário possuir o executável:

```text
cloudflared.exe
```

---

## 📥 Instalação

### 1. Baixe o Cloudflared

Baixe o `cloudflared.exe` diretamente pelo site oficial da Cloudflare.

Após o download, coloque o arquivo dentro da pasta:

```text
GUI/
```

A estrutura deverá ficar semelhante a:

```text
JSTunnel/
│
├── GUI/
│   ├── cloudflared.exe
│   ├── ...
│
├── package.json
├── ...
└── README.md
```

---

### 2. Instale as dependências

Abra o terminal na pasta do projeto e execute:

```bash
npm install
```

O npm irá instalar todas as dependências necessárias para executar e compilar o JSTunnel.

---

## ▶️ Executando em modo de desenvolvimento

Para iniciar o JSTunnel durante o desenvolvimento, execute:

```bash
npm start
```

Isso abrirá a aplicação desktop utilizando os arquivos atuais do projeto.

---

## 📦 Gerando o executável

Para gerar a build do JSTunnel, execute:

```bash
npm run dist
```

O processo irá compilar a aplicação e gerar os arquivos necessários para distribuição.

Dependendo da configuração do projeto, os arquivos gerados poderão incluir:

* Executável do JSTunnel
* Instalador para Windows
* Arquivos necessários para execução da aplicação

Normalmente, os arquivos de saída ficam dentro da pasta:

```text
dist/
```

---

## ☁️ Cloudflare Tunnel

O JSTunnel utiliza o `cloudflared` para criar e executar túneis da Cloudflare.

O objetivo é facilitar operações como:

* Criar túneis
* Configurar túneis
* Gerenciar configurações
* Executar túneis localmente
* Associar domínios/subdomínios
* Facilitar a exposição de serviços locais através da Cloudflare

---

## 🛠️ Tecnologias

O projeto utiliza tecnologias como:

* **Electron**
* **Node.js**
* **JavaScript**
* **Cloudflare Tunnel**
* **cloudflared**
* **npm**

---

## ⚠️ Status do projeto

O **JSTunnel está atualmente em versão Beta**.

Novos recursos, melhorias de interface, correções e otimizações serão adicionados ao longo do desenvolvimento.

---

## 📌 Observação

O `cloudflared.exe` **não deve ser incluído no repositório caso o projeto tenha alguma restrição de distribuição relacionada ao executável**.

Recomenda-se baixar sempre uma versão atualizada diretamente dos canais oficiais da Cloudflare.

---

## 👨‍💻 Desenvolvimento

Projeto desenvolvido pela **JSaplication**.

**JSTunnel — Simplificando o gerenciamento de Cloudflare Tunnels no Windows.**
