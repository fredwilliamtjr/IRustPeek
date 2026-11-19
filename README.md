<div align="center">
  <img src="docs/icon.png" width="160" alt="IRustPeek icon">

  <h1>IRustPeek</h1>

  <p><strong>Uma agenda simples e sincronizável para abrir máquinas do RustDesk com um clique.</strong></p>
  <p>Sem conta paga, sem planilha solta, sem decorar ID de máquina.</p>

  <p>
    <img src="https://img.shields.io/badge/macOS-12.0%2B-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS 12+">
    <img src="https://img.shields.io/badge/Windows-10%2B-0078D4?style=flat-square&logo=windows&logoColor=white" alt="Windows 10+">
    <img src="https://img.shields.io/badge/Ubuntu-22.04%2B-E95420?style=flat-square&logo=ubuntu&logoColor=white" alt="Ubuntu 22.04+">
    <img src="https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 33">
    <img src="https://img.shields.io/badge/Universal-x64%20%2B%20arm64-555555?style=flat-square" alt="Universal macOS">
    <img src="https://img.shields.io/badge/status-alpha-orange?style=flat-square" alt="alpha">
  </p>
</div>

---

## 🧭 O problema

RustDesk e TeamViewer continuam ótimos para acesso remoto, mas as contas gratuitas ficaram limitadas demais para uma necessidade básica: manter uma lista pequena de máquinas próprias, sincronizada entre computadores, e abrir uma conexão rapidamente.

Pra quem cuida de três, quatro ou cinco máquinas pessoais, a falta de uma agenda vira fricção boba: copiar ID em nota, lembrar qual Mac é qual, abrir o RustDesk manualmente, conferir número, clicar, repetir.

## ✨ A solução

IRustPeek é uma agenda discreta para RustDesk. Ele fica na barra de menu do macOS, no system tray do Windows ou na área de indicadores do Ubuntu; ao clicar no ícone, mostra suas máquinas salvas. Um clique na máquina chama `rustdesk://<id>` e abre o RustDesk direto na conexão certa.

O app não tenta substituir o RustDesk. Ele só entrega a camada que ficou faltando: uma lista simples, sincronizável e rápida.

## 🎯 Features

- 🖥️ **Agenda de máquinas** — nome amigável, ID do RustDesk, tags e notas
- ⚡ **Abrir com um clique** — chama o protocolo `rustdesk://<id>` direto pelo sistema
- 🪟 **Menu rápido** — painel bonito no ícone da barra com lista, sincronização e saída
- ⚙️ **Janela de configurações** — cadastro, edição, busca e escolha do serviço de sync
- ☁️ **Sincronização por arquivo** — iCloud Drive, Google Drive ou OneDrive, sem OAuth
- 🔁 **Fluxo seguro ao trocar de serviço** — se o novo destino estiver vazio, mantém a lista em tela e grava só quando você clicar em sincronizar
- 🚀 **Iniciar com o sistema** — toggle para abrir junto com macOS, Windows ou Linux
- 🐧 **Linux** — AppImage e pacote `.deb` (x64 e arm64); no Ubuntu o ícone fica nos indicadores do painel superior
- 🍎 **macOS universal** — build para Intel (`x86_64`) e Apple Silicon (`arm64`)
- 🪶 **Ícone nativo no macOS** — Dock/Finder colorido, menu bar em template icon adaptado ao tema

## ⚙️ Como usar

1. Abra o IRustPeek
2. Clique em **Configurações** pelo ícone perto do relógio
3. Escolha o serviço de sincronização: **iCloud Drive**, **Google Drive** ou **OneDrive**
4. Cadastre suas máquinas com nome e ID do RustDesk
5. Clique no ícone da barra e escolha uma máquina para conectar

O IRustPeek grava um arquivo `IRustPeek/address-book.json` dentro do serviço escolhido. A sincronização real é feita pelo app de nuvem que já está instalado no sistema.

> **Requisito do protocolo `rustdesk://`.** O clique em "Conectar" só funciona com o **RustDesk instalado**, que é quem registra o esquema de URL `rustdesk://`. No macOS isso é automático após a primeira execução do RustDesk; no Windows e no Linux (`.deb` do RustDesk) o instalador registra o handler.

## 📦 Instalação

Baixe o pacote da sua plataforma na página de [Releases](https://github.com/fredwilliamtjr/IRustPeek/releases):

| Plataforma | Arquivo |
|---|---|
| macOS (Intel e Apple Silicon) | `IRustPeek-<versão>-universal.dmg` — mova o `IRustPeek.app` para **Aplicativos** |
| Windows 10/11 | `IRustPeek.Setup.<versão>.exe` (instalador) ou `IRustPeek.<versão>.exe` (portátil) |
| Ubuntu/Debian | `IRustPeek-<versão>-amd64.deb` (ou `-arm64.deb`) |
| Outras distros Linux | `IRustPeek-<versão>-x86_64.AppImage` (ou `-arm64.AppImage`) |

**Ubuntu — `.deb`:**

```bash
sudo apt install ./IRustPeek-<versão>-amd64.deb
```

Depois abra **IRustPeek** pelo menu de aplicativos. O ícone aparece nos indicadores do painel superior; clique nele para ver as máquinas, sincronizar, abrir as configurações ou sair.

**Linux — AppImage:**

```bash
chmod +x IRustPeek-<versão>-x86_64.AppImage
./IRustPeek-<versão>-x86_64.AppImage
```

No Ubuntu 22.04+ o AppImage precisa do `libfuse2` (`sudo apt install libfuse2`, ou `libfuse2t64` no 24.04). Se preferir não instalar, rode com `--appimage-extract-and-run`.

> **Linux — ícone na barra.** O Ubuntu já vem com a extensão *AppIndicator* ativa. No GNOME puro (Fedora, Debian GNOME), instale e ative a extensão **AppIndicator and KStatusNotifierItem Support** para o ícone aparecer.

> **macOS — liberar o app na primeira abertura.** Como o app não é notarizado pela Apple, ao baixá-lo da internet o macOS pode bloquear com a mensagem *"não foi possível verificar se está livre de malware"*. Depois de mover o app para a pasta **Aplicativos**, rode no Terminal:
>
> ```bash
> xattr -dr com.apple.quarantine "/Applications/IRustPeek.app"
> ```
>
> Pronto — agora é só abrir normalmente. Alternativa pela interface: **Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim**.

## 🧱 Arquitetura

```
IRustPeek/
├── src/
│   ├── main.js              # Processo principal Electron, tray, sync e janela
│   ├── preload.js           # Ponte segura IPC para renderer/tray
│   ├── renderer/            # Janela de configurações
│   ├── tray/                # Painel rápido da barra/menu
│   └── assets/              # Ícone colorido + template icon macOS
├── scripts/
│   └── generate_icon.swift  # Gera icon.icns, icon.png e StatusTemplate.png
├── build/                   # Assets usados pelo electron-builder
└── docs/                    # Imagens do README
```

| Componente | Responsabilidade |
|---|---|
| `main.js` | Tray, janelas, seleção de provedor, leitura/gravação do catálogo e abertura do RustDesk |
| `renderer/` | Tela de configuração: máquinas, busca, edição, sync e launch at login |
| `tray/` | Menu rápido customizado, com lista de máquinas, sincronização e sair |
| `preload.js` | API segura exposta para as telas via `contextBridge` |
| `generate_icon.swift` | Geração dos assets de ícone para Dock/Finder e menu bar |

## 🔁 Sincronização

A escolha do serviço é intencionalmente simples:

- **iCloud Drive** no macOS
- **Google Drive** quando a pasta local do Drive existe
- **OneDrive** quando a pasta local do OneDrive existe

No Linux não há cliente oficial do Google Drive. O IRustPeek reconhece a montagem do **ExpanDrive** (`~/ExpanDrive/Google Drive`, ou `Google Drive 1`, `Google Drive 2`... quando o ExpanDrive renomeia a montagem; só pastas montadas de verdade contam e, se o ExpanDrive ainda não montou ao iniciar, o app espera) e as pastas usuais de rclone, Insync e google-drive-ocamlfuse (`~/Google Drive`, `~/GoogleDrive`, `~/google-drive`, `~/gdrive`), além de `~/OneDrive` do cliente `onedrive`. A sincronização em si é feita por esse cliente; se o Mac alterar a lista, clique em **Sincronizar agora** para reler o arquivo.

Se o serviço escolhido já tiver máquinas, o IRustPeek carrega essa lista. Se estiver vazio, ele mantém a lista atual em tela e só grava no novo serviço quando você clicar em **Sincronizar**.

## Formato do arquivo

```json
{
  "version": 1,
  "updatedAt": "2026-05-30T18:00:00.000Z",
  "devices": [
    {
      "id": "mac-mini-casa",
      "name": "Mac mini casa",
      "rustdeskId": "123456789",
      "notes": "",
      "tags": ["casa", "mac"],
      "createdAt": "2026-05-30T18:00:00.000Z",
      "updatedAt": "2026-05-30T18:00:00.000Z"
    }
  ]
}
```

## 🔨 Build a partir do código

Requisitos:

- Node.js 20+
- npm

```bash
git clone https://github.com/fredwilliamtjr/IRustPeek.git
cd IRustPeek
npm install
npm start
```

Build de teste macOS, sem DMG:

```bash
npm run build:mac:dir
```

Build universal macOS:

```bash
npm run build:mac:universal
```

O app universal sai em:

```text
release/mac-universal/IRustPeek.app
```

Build Linux (AppImage + `.deb`) — rode num Linux, ou deixe o GitHub Actions gerar:

```bash
npm run build:linux
```

O workflow `.github/workflows/release.yml` compila macOS, Windows e Linux a cada push em `claude/**` e, numa tag `v*`, publica uma pre-release com todos os pacotes e o `SHA256SUMS.txt`.

## 🔒 Segurança

- O IRustPeek guarda apenas IDs do RustDesk, nomes, notas e tags
- Senhas de acesso desacompanhado devem ficar no RustDesk ou num cofre dedicado
- Não há login em iCloud/Google/OneDrive; o app usa apenas as pastas locais já sincronizadas
- A gravação do catálogo usa escrita atômica para reduzir risco de corromper o JSON

## 🗺️ Roadmap

- [x] Tray/menu com lista de máquinas
- [x] Cadastro, edição e remoção
- [x] Sincronização por iCloud Drive, Google Drive e OneDrive
- [x] Launch at login
- [x] Ícone próprio + template icon macOS
- [x] Build macOS universal
- [ ] Busca rápida no menu
- [ ] Importar/exportar CSV
- [ ] Detecção melhor de conflitos
- [ ] Cofre nativo para senhas opcionais
- [x] Instalador Windows
- [x] Pacotes Linux (AppImage e `.deb`)
- [ ] Assinatura/notarização macOS

## 📄 Licença

TBD

---

<div align="center">
  <sub>Feito com ☕ por <a href="https://github.com/fredwilliamtjr">@fredwilliamtjr</a></sub>
</div>
