const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_NAME = 'IRustPeek';
const BOOK_FILE = 'address-book.json';
const SETTINGS_FILE = 'settings.json';
const GOOGLE_DRIVE_NAMES = ['My Drive', 'Meu Drive'];

let mainWindow = null;
let trayWindow = null;
let tray = null;
let fileWatcher = null;
let settings = null;
let addressBook = emptyBook();
let isQuitting = false;
let syncInProgress = false;
let pendingWriteToCurrentProvider = false;
let waitingForMount = false;
let mountRetryTimer = null;
const MOUNT_RETRY_MS = 10000;

function boot() {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  settings = loadSettings();
  ensureBookFile();
  loadBook();
  watchBook();
  createTray();
}

function emptyBook() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    devices: []
  };
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `device-${Date.now()}`;
}

function normalizeRustDeskId(value) {
  // RustDesk aceita: ID de 9 dígitos, ID customizado alfanumérico (letras,
  // dígitos, _ e -) e também IP direto com porta opcional (ex.: 192.168.1.50
  // ou 192.168.1.50:21118). Mantemos . e : e removemos só espaços/formatação.
  return String(value || '').replace(/[^A-Za-z0-9_.:-]/g, '');
}

function getSyncFilePath() {
  return settings.syncFilePath || defaultSyncFilePath();
}

function defaultSyncFilePath() {
  const services = cloudServiceOptions();
  const firstExisting = services.find((service) => service.available);
  const base = firstExisting ? firstExisting.path : localDataPath();
  return path.join(base, APP_NAME, BOOK_FILE);
}

function localDataPath() {
  return app.isReady() ? app.getPath('userData') : path.join(os.homedir(), APP_NAME);
}

function cloudServiceOptions() {
  const home = os.homedir();
  const cloudStorage = path.join(home, 'Library', 'CloudStorage');

  const services = [
    {
      id: 'icloud',
      label: 'iCloud Drive',
      paths: iCloudPaths(home)
    },
    {
      id: 'google-drive',
      label: 'Google Drive',
      paths: googleDrivePaths(home, cloudStorage)
    },
    {
      id: 'onedrive',
      label: 'OneDrive',
      paths: oneDrivePaths(home, cloudStorage)
    }
  ];

  return services.map((service) => {
    const existingPath = service.paths.find((candidatePath) => isWritableDirectory(candidatePath));
    return {
      id: service.id,
      label: service.label,
      available: Boolean(existingPath),
      path: existingPath || service.paths.find(Boolean) || null,
      targetFile: existingPath ? path.join(existingPath, APP_NAME, BOOK_FILE) : null
    };
  });
}

function googleDrivePaths(home, cloudStorage) {
  const paths = [];

  if (process.platform === 'darwin') {
    const googleDriveRoot = firstExistingGlob(path.join(home, 'Library', 'CloudStorage'), /^GoogleDrive-/);
    paths.push(googleDriveRoot ? googleDriveMyDrivePath(googleDriveRoot) : null);
    paths.push(path.join(home, 'Google Drive'));
  } else if (process.platform === 'win32') {
    // Google Drive para Desktop monta como unidade virtual (G:, H:, Z:, ...).
    // A subpasta raiz é localizada: "My Drive" (en) ou "Meu Drive" (pt-BR), etc.
    for (const driveRoot of windowsDriveRoots()) {
      for (const folder of GOOGLE_DRIVE_ROOT_NAMES) {
        paths.push(path.join(driveRoot, folder));
      }
    }
    // Fallback: instalações antigas que espelhavam dentro da home.
    paths.push(path.join(home, 'My Drive'));
    paths.push(path.join(home, 'Google Drive'));
  } else if (process.platform === 'linux') {
    // Não há cliente oficial do Google Drive para Linux. Primeiro o ExpanDrive
    // (~/ExpanDrive/Google Drive, ou "Google Drive 1", "Google Drive 2"... quando
    // sobra uma pasta antiga da montagem anterior); depois as pastas usuais de
    // rclone, Insync e google-drive-ocamlfuse.
    for (const root of expanDriveGoogleRoots(path.join(home, 'ExpanDrive'))) {
      paths.push(expanDriveGooglePath(root));
    }
    for (const folder of ['Google Drive', 'GoogleDrive', 'google-drive', 'gdrive']) {
      const root = path.join(home, folder);
      paths.push(googleDriveMyDrivePath(root));
    }
  }

  return compactUniquePaths(paths);
}

const GOOGLE_DRIVE_ROOT_NAMES = ['My Drive', 'Meu Drive', 'Mi unidad', 'Mon Drive'];

function iCloudPaths(home) {
  if (process.platform === 'darwin') {
    return [path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')];
  }
  if (process.platform === 'win32') {
    return [path.join(home, 'iCloudDrive'), path.join(home, 'iCloud Drive')];
  }
  return [];
}

function windowsDriveRoots() {
  const roots = [];
  for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(root)) roots.push(root);
    } catch {
      // ignora unidades inacessíveis
    }
  }
  return roots;
}

function oneDrivePaths(home, cloudStorage) {
  const paths = [];

  if (process.platform === 'darwin') {
    paths.push(firstExistingGlob(cloudStorage, /^OneDrive/));
    paths.push(path.join(home, 'OneDrive'));
  } else if (process.platform === 'win32') {
    paths.push(process.env.OneDrive);
    paths.push(path.join(home, 'OneDrive'));
  } else if (process.platform === 'linux') {
    // Pasta padrão do cliente "onedrive" (abraunegg) e do Insync.
    paths.push(path.join(home, 'OneDrive'));
  }

  return compactUniquePaths(paths);
}

function compactUniquePaths(paths) {
  const seen = new Set();
  const unique = [];

  for (const candidatePath of paths) {
    if (!candidatePath) continue;
    const key = path.normalize(candidatePath).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidatePath);
  }

  return unique;
}

// ExpanDrive (Linux): montagens ativas "Google Drive" ou "Google Drive N" em
// ~/ExpanDrive. Pasta não montada (sobra de uma montagem antiga) nunca conta.
// Preferência: a que já tem o catálogo; depois o menor número.
function expanDriveGoogleRoots(base) {
  let names = [];
  try {
    names = fs.readdirSync(base).filter((name) => /^Google Drive( \d+)?$/.test(name));
  } catch {
    return [];
  }
  return names
    .map((name) => {
      const root = path.join(base, name);
      const hasBook = fs.existsSync(path.join(root, APP_NAME, BOOK_FILE))
        || GOOGLE_DRIVE_NAMES.some((drive) => fs.existsSync(path.join(root, drive, APP_NAME, BOOK_FILE)));
      const number = Number((/ (\d+)$/.exec(name) || [])[1] || 0);
      return { root, mounted: isMountPoint(root), hasBook, number };
    })
    .filter((entry) => entry.mounted)
    .sort((a, b) => Number(b.hasBook) - Number(a.hasBook) || a.number - b.number)
    .map((entry) => entry.root);
}

// ExpanDrive (Linux): se a pasta IRustPeek já está na raiz da montagem, usa a
// raiz; senão, "My Drive"/"Meu Drive" quando existir; senão, a própria raiz.
function expanDriveGooglePath(root) {
  if (fs.existsSync(path.join(root, APP_NAME, BOOK_FILE))) return root;
  return googleDriveMyDrivePath(root);
}

function googleDriveMyDrivePath(root) {
  const myDrive = GOOGLE_DRIVE_NAMES
    .map((driveName) => path.join(root, driveName))
    .find((candidatePath) => fs.existsSync(candidatePath));

  return myDrive || root;
}

function isWritableDirectory(candidatePath) {
  if (!candidatePath) return false;

  try {
    const stats = fs.statSync(candidatePath);
    if (!stats.isDirectory()) return false;
    fs.accessSync(candidatePath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function firstExistingGlob(parent, pattern) {
  try {
    if (!fs.existsSync(parent)) return null;
    const match = fs.readdirSync(parent).find((entry) => pattern.test(entry));
    return match ? path.join(parent, match) : null;
  } catch {
    return null;
  }
}

function settingsFilePath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function loadSettings() {
  const defaults = {
    syncFilePath: defaultSyncFilePath(),
    launchAtLogin: isLaunchAtLoginEnabled()
  };

  try {
    const filePath = settingsFilePath();
    if (!fs.existsSync(filePath)) {
      writeJsonAtomic(filePath, defaults);
      return defaults;
    }
    return { ...defaults, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (error) {
    console.error(`[${APP_NAME}] Failed to load settings:`, error);
    return defaults;
  }
}

function saveSettings(nextSettings = settings) {
  settings = { ...settings, ...nextSettings };
  writeJsonAtomic(settingsFilePath(), settings);
}

function ensureBookFile() {
  const syncFilePath = getSyncFilePath();

  // Linux/ExpanDrive: se a pasta salva não é uma montagem ativa (ExpanDrive
  // ainda não montou, ou montou com outro nome como "Google Drive 1"), não cria
  // nada nela — isso deixaria uma pasta local que ocupa o nome da montagem.
  const expanDriveRoot = expanDriveRootOf(syncFilePath);
  if (expanDriveRoot && !isMountPoint(expanDriveRoot)) {
    const mounted = repairedSyncFilePath(syncFilePath);
    if (mounted && path.normalize(mounted) !== path.normalize(syncFilePath)) {
      console.error(`[${APP_NAME}] ExpanDrive montado em outro caminho; usando ${mounted}`);
      saveSettings({ syncFilePath: mounted });
      ensureBookFileAt(mounted);
      setWaitingForMount(false);
      return;
    }
    setWaitingForMount(true);
    return;
  }
  setWaitingForMount(false);

  try {
    ensureBookFileAt(syncFilePath);
  } catch (error) {
    const fallbackPath = repairedSyncFilePath(syncFilePath) || defaultSyncFilePath();
    if (path.normalize(fallbackPath) === path.normalize(syncFilePath)) {
      throw error;
    }

    console.error(`[${APP_NAME}] Sync file unavailable, falling back to ${fallbackPath}:`, error);
    saveSettings({ syncFilePath: fallbackPath });
    ensureBookFileAt(fallbackPath);
  }
}

function setWaitingForMount(waiting) {
  waitingForMount = waiting;
  if (waiting && !mountRetryTimer) {
    mountRetryTimer = setInterval(() => {
      ensureBookFile();
      if (!waitingForMount) {
        loadBook();
        watchBook();
      }
    }, MOUNT_RETRY_MS);
  } else if (!waiting && mountRetryTimer) {
    clearInterval(mountRetryTimer);
    mountRetryTimer = null;
  }
}

// Raiz da montagem do ExpanDrive (~/ExpanDrive/<pasta>) que contém o arquivo, ou null.
function expanDriveRootOf(filePath) {
  if (process.platform !== 'linux' || !filePath) return null;
  const base = path.join(os.homedir(), 'ExpanDrive');
  const relative = path.relative(base, path.resolve(filePath));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return path.join(base, relative.split(path.sep)[0]);
}

// Montagem ativa: a pasta está noutro dispositivo que a pasta-mãe (FUSE do ExpanDrive).
function isMountPoint(dir) {
  try {
    return fs.statSync(dir).dev !== fs.statSync(path.dirname(dir)).dev;
  } catch {
    return false;
  }
}

function repairedSyncFilePath(filePath) {
  const providerHint = providerIdFromPath(filePath);
  if (!providerHint) return null;

  const service = cloudServiceOptions().find((item) => item.id === providerHint);
  return service?.available ? service.targetFile : null;
}

function providerIdFromPath(filePath) {
  const normalized = path.normalize(filePath || '');
  if (normalized.includes('GoogleDrive-')
    || /[\\/]Google Drive \d+[\\/]/.test(normalized)
    || ['Google Drive', 'GoogleDrive', 'google-drive', 'gdrive'].some((folder) => normalized.includes(`${path.sep}${folder}${path.sep}`))) {
    return 'google-drive';
  }
  if (normalized.includes(`${path.sep}OneDrive`)) {
    return 'onedrive';
  }
  if (normalized.includes('com~apple~CloudDocs')) {
    return 'icloud';
  }
  return null;
}

function ensureBookFileAt(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    writeJsonAtomic(filePath, emptyBook());
  }
}

function loadBook() {
  if (waitingForMount) {
    // Não lê a pasta local que está no lugar da montagem do ExpanDrive.
    addressBook = emptyBook();
    broadcastState();
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(getSyncFilePath(), 'utf8'));
    addressBook = sanitizeBook(parsed);
    pendingWriteToCurrentProvider = false;
  } catch (error) {
    console.error(`[${APP_NAME}] Failed to load address book:`, error);
    addressBook = emptyBook();
    pendingWriteToCurrentProvider = false;
  }
  broadcastState();
}

function readBookFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return sanitizeBook(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    console.error(`[${APP_NAME}] Failed to read address book:`, error);
    return null;
  }
}

function sanitizeBook(raw) {
  const now = new Date().toISOString();
  const devices = Array.isArray(raw.devices) ? raw.devices : [];

  return {
    version: 1,
    updatedAt: raw.updatedAt || now,
    devices: devices
      .map((device) => {
        const rustdeskId = normalizeRustDeskId(device.rustdeskId);
        const name = String(device.name || '').trim();
        if (!rustdeskId || !name) return null;

        return {
          id: String(device.id || slugify(name)),
          name,
          rustdeskId,
          notes: String(device.notes || ''),
          tags: Array.isArray(device.tags) ? device.tags.map(String) : parseTags(device.tags),
          createdAt: device.createdAt || now,
          updatedAt: device.updatedAt || now
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  };
}

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function saveBook(nextBook) {
  if (waitingForMount) {
    throw new Error('Aguardando o ExpanDrive montar o Google Drive. Tente de novo em alguns segundos.');
  }
  const sanitized = sanitizeBook({
    ...nextBook,
    updatedAt: new Date().toISOString()
  });
  addressBook = sanitized;
  writeJsonAtomic(getSyncFilePath(), sanitized);
  broadcastState();
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function watchBook() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }

  try {
    fileWatcher = fs.watch(getSyncFilePath(), { persistent: false }, debounce(loadBook, 250));
  } catch (error) {
    console.error(`[${APP_NAME}] Failed to watch address book:`, error);
  }
}

function debounce(fn, wait) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, wait);
  };
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip(APP_NAME);

  if (process.platform === 'linux') {
    // No Linux (Ubuntu/GNOME com AppIndicator) o ícone da bandeja é um
    // StatusNotifierItem: o clique abre o menu nativo e não há getBounds()
    // para posicionar o painel. Por isso o menu rápido vira um menu nativo.
    refreshTrayMenu();
    return;
  }

  tray.on('click', () => {
    toggleTrayWindow();
  });
  tray.on('right-click', () => {
    toggleTrayWindow();
  });
}

function trayIconSize() {
  if (process.platform === 'darwin') return 18;
  if (process.platform === 'linux') return 24;
  return 16;
}

function createTrayIcon() {
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'assets', 'StatusTemplate.png')
    : path.join(__dirname, 'assets', 'icon.png');
  const image = nativeImage.createFromPath(iconPath);

  if (!image.isEmpty()) {
    const resized = image.resize({
      width: trayIconSize(),
      height: trayIconSize()
    });
    resized.setTemplateImage(process.platform === 'darwin');
    return resized;
  }

  const fallback = imageFromSvg(appIconSvg(), { template: process.platform === 'darwin' }).resize({
    width: process.platform === 'darwin' ? 18 : 16,
    height: process.platform === 'darwin' ? 18 : 16
  });
  fallback.setTemplateImage(process.platform === 'darwin');
  return fallback;
}

function appIconSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#111827"/>
      <path d="M18 21h28a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5V26a5 5 0 0 1 5-5Z" fill="#38bdf8"/>
      <path d="M22 32h20m-8-7 8 7-8 7" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function imageFromSvg(svg, options = {}) {
  const svgData = encodeURIComponent(svg);
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svgData}`);
  image.setTemplateImage(Boolean(options.template));
  return image;
}

function menuIcon(name) {
  const icons = {
    computer: `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <path fill="#111827" d="M6 7h20a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-7v2h4v2H9v-2h4v-2H6a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Zm0 3v11h20V10H6Z"/>
      </svg>
    `,
    settings: `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <path fill="#111827" d="M14.4 3h3.2l.7 3.2c.8.2 1.5.5 2.2.9l2.8-1.8 2.3 2.3-1.8 2.8c.4.7.7 1.4.9 2.2l3.3.7v3.3l-3.3.7c-.2.8-.5 1.5-.9 2.2l1.8 2.8-2.3 2.3-2.8-1.8c-.7.4-1.4.7-2.2.9l-.7 3.3h-3.2l-.7-3.3c-.8-.2-1.5-.5-2.2-.9l-2.8 1.8-2.3-2.3 1.8-2.8c-.4-.7-.7-1.4-.9-2.2L4 16.6v-3.3l3.3-.7c.2-.8.5-1.5.9-2.2L6.4 7.6l2.3-2.3 2.8 1.8c.7-.4 1.4-.7 2.2-.9L14.4 3Zm1.6 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/>
      </svg>
    `,
    sync: `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <path fill="#111827" d="M25.5 7v7h-7l2.6-2.6A7.5 7.5 0 0 0 8.8 15H5.7A10.5 10.5 0 0 1 23.2 9.2L25.5 7Zm.8 10A10.5 10.5 0 0 1 8.8 22.8L6.5 25v-7h7l-2.6 2.6A7.5 7.5 0 0 0 23.2 17h3.1Z"/>
      </svg>
    `,
    quit: `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <path fill="#111827" d="M8 5h11v3H8v16h11v3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Zm13.5 6 5 5-5 5-2.1-2.1 1.4-1.4H13v-3h7.8l-1.4-1.4 2.1-2.1Z"/>
      </svg>
    `
  };

  return imageFromSvg(icons[name], { template: true }).resize({ width: 16, height: 16 });
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setToolTip(APP_NAME);
  if (process.platform === 'linux') {
    // O spec StatusNotifierItem exige reenviar o menu inteiro a cada mudança.
    tray.setContextMenu(Menu.buildFromTemplate(linuxTrayMenuTemplate()));
  }
}

function linuxTrayMenuTemplate() {
  const devices = addressBook.devices.map((device) => ({
    label: `${device.name}  (${device.rustdeskId})`,
    click: () => openRustDesk(device.rustdeskId)
  }));

  return [
    ...(waitingForMount
      ? [{ label: 'Aguardando o Google Drive (ExpanDrive)…', enabled: false }]
      : devices.length ? devices : [{ label: 'Nenhuma máquina cadastrada', enabled: false }]),
    { type: 'separator' },
    {
      label: syncInProgress ? 'Sincronizando…' : 'Sincronizar agora',
      enabled: !syncInProgress,
      click: () => {
        syncNow().catch((error) => dialog.showErrorBox(APP_NAME, error.message));
      }
    },
    { label: 'Configurações…', click: () => showMainWindow() },
    {
      label: 'Iniciar com o sistema',
      type: 'checkbox',
      checked: Boolean(settings?.launchAtLogin),
      click: () => toggleLaunchAtLogin()
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];
}

function createTrayWindow() {
  trayWindow = new BrowserWindow({
    width: 340,
    height: 430,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.platform === 'darwin') {
    // Keep the quick menu available in the current Space when it receives focus.
    trayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  trayWindow.loadFile(path.join(__dirname, 'tray', 'tray.html'));
  trayWindow.on('blur', () => {
    if (!trayWindow?.webContents?.isDevToolsOpened()) {
      trayWindow.hide();
    }
  });
  trayWindow.on('closed', () => {
    trayWindow = null;
  });
}

function toggleTrayWindow() {
  if (!trayWindow) createTrayWindow();

  if (trayWindow.isVisible()) {
    trayWindow.hide();
    return;
  }

  positionTrayWindow();
  trayWindow.show();
  trayWindow.focus();
  trayWindow.webContents.send('state:changed', getState());
}

function positionTrayWindow() {
  if (!tray || !trayWindow) return;

  const trayBounds = tray.getBounds();
  const windowBounds = trayWindow.getBounds();
  const display = require('electron').screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x),
    y: Math.round(trayBounds.y)
  });
  const area = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  let y = process.platform === 'darwin'
    ? Math.round(trayBounds.y + trayBounds.height + 6)
    : Math.round(trayBounds.y - windowBounds.height - 6);

  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - windowBounds.width - 8));
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - windowBounds.height - 8));

  trayWindow.setPosition(x, y, false);
}

function openRustDesk(rawId) {
  const id = normalizeRustDeskId(rawId);
  if (!id) return;
  shell.openExternal(`rustdesk://${id}`);
}

function syncNow() {
  syncInProgress = true;
  broadcastState();

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (pendingWriteToCurrentProvider) {
          saveBook(addressBook);
          pendingWriteToCurrentProvider = false;
        } else {
          loadBook();
        }
        syncInProgress = false;
        broadcastState();
        resolve(getState());
      } catch (error) {
        console.error(`[${APP_NAME}] Failed to sync address book:`, error);
        syncInProgress = false;
        broadcastState();
        reject(new Error('Não foi possível sincronizar. Verifique se a pasta escolhida permite gravação.'));
      }
    }, 700);
  });
}

function showMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    if (process.platform === 'darwin') app.focus({ steal: true });
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1040,
    height: 700,
    minWidth: 920,
    minHeight: 620,
    title: APP_NAME,
    show: false,
    skipTaskbar: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.platform === 'darwin') app.focus({ steal: true });
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function broadcastState() {
  if (process.platform === 'linux') refreshTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:changed', getState());
  }
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.webContents.send('state:changed', getState());
  }
}

function getState() {
  const currentSyncFile = getSyncFilePath();
  const cloudServices = cloudServiceOptions().map((service) => ({
    ...service,
    selected: Boolean(service.targetFile && path.normalize(service.targetFile) === path.normalize(currentSyncFile))
  }));

  return {
    book: addressBook,
    settings: {
      appVersion: app.getVersion(),
      syncFilePath: currentSyncFile,
      launchAtLogin: settings.launchAtLogin,
      syncInProgress,
      pendingWriteToCurrentProvider,
      cloudServices
    }
  };
}

function upsertDevice(device) {
  const now = new Date().toISOString();
  const rustdeskId = normalizeRustDeskId(device.rustdeskId);
  const name = String(device.name || '').trim();

  if (!name || !rustdeskId) {
    throw new Error('Nome e ID do RustDesk são obrigatórios.');
  }

  const id = device.id || slugify(name);
  const existing = addressBook.devices.find((item) => item.id === id);
  const nextDevice = {
    id,
    name,
    rustdeskId,
    notes: String(device.notes || ''),
    tags: Array.isArray(device.tags) ? device.tags : parseTags(device.tags),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  const devices = addressBook.devices.filter((item) => item.id !== id);
  devices.push(nextDevice);
  saveBook({ ...addressBook, devices });
}

function deleteDevice(id) {
  saveBook({
    ...addressBook,
    devices: addressBook.devices.filter((device) => device.id !== id)
  });
}

async function chooseSyncFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha a pasta sincronizada',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || !result.filePaths[0]) return getState();
  setSyncFilePath(path.join(result.filePaths[0], APP_NAME, BOOK_FILE));
  return getState();
}

function setSyncFilePath(filePath) {
  saveSettings({ syncFilePath: filePath });
  ensureBookFile();
  loadBook();
  watchBook();
}

function setSyncProvider(providerId) {
  const service = cloudServiceOptions().find((item) => item.id === providerId);
  if (!service || !service.available || !service.targetFile) {
    throw new Error('Serviço de sincronização indisponível.');
  }

  saveSettings({ syncFilePath: service.targetFile });
  const providerBook = readBookFromFile(service.targetFile);

  if (providerBook && providerBook.devices.length > 0) {
    addressBook = providerBook;
    pendingWriteToCurrentProvider = false;
  } else {
    pendingWriteToCurrentProvider = true;
  }

  watchBook();
  broadcastState();
}

function toggleLaunchAtLogin() {
  const enabled = !settings.launchAtLogin;
  setLaunchAtLogin(enabled);
  broadcastState();
}

function setLaunchAtLogin(enabled) {
  if (process.platform === 'linux') {
    setLinuxAutostart(Boolean(enabled));
  } else {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true
    });
  }
  saveSettings({ launchAtLogin: Boolean(enabled) });
}

function isLaunchAtLoginEnabled() {
  if (process.platform === 'linux') {
    return fs.existsSync(linuxAutostartFile());
  }
  return app.getLoginItemSettings().openAtLogin;
}

// app.setLoginItemSettings não existe no Linux: o padrão freedesktop é um
// arquivo .desktop em ~/.config/autostart (GNOME, KDE, XFCE, Cinnamon...).
function linuxAutostartFile() {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'autostart', 'irustpeek.desktop');
}

function linuxExecutablePath() {
  // AppImage: process.execPath aponta para o ponto de montagem temporário;
  // o caminho estável do arquivo vem na variável APPIMAGE.
  return process.env.APPIMAGE || process.execPath;
}

function setLinuxAutostart(enabled) {
  const file = linuxAutostartFile();
  if (!enabled) {
    fs.rmSync(file, { force: true });
    return;
  }

  // Escapes da especificação Desktop Entry para argumentos entre aspas.
  const exec = linuxExecutablePath().replace(/(["`$\\])/g, '\\$1').replace(/%/g, '%%');
  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${APP_NAME}`,
    'Comment=Agenda sincronizável de endereços RustDesk',
    `Exec="${exec}"`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, entry, 'utf8');
}

app.whenReady().then(boot);

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

ipcMain.handle('state:get', () => getState());
ipcMain.handle('device:upsert', (_event, device) => {
  upsertDevice(device);
  return getState();
});
ipcMain.handle('device:delete', (_event, id) => {
  deleteDevice(id);
  return getState();
});
ipcMain.handle('device:connect', (_event, rustdeskId) => openRustDesk(rustdeskId));
ipcMain.handle('sync:reload', () => {
  loadBook();
  return getState();
});
ipcMain.handle('sync:choose-folder', chooseSyncFolder);
ipcMain.handle('sync:set-file', (_event, filePath) => {
  setSyncFilePath(filePath);
  return getState();
});
ipcMain.handle('sync:set-provider', (_event, providerId) => {
  setSyncProvider(providerId);
  return getState();
});
ipcMain.handle('sync:now', () => syncNow());
ipcMain.handle('launch:set', (_event, enabled) => {
  setLaunchAtLogin(Boolean(enabled));
  return getState();
});
ipcMain.handle('tray:sync-now', () => syncNow());
ipcMain.handle('tray:open-settings', () => {
  showMainWindow();
  if (trayWindow) trayWindow.hide();
  return getState();
});
ipcMain.handle('tray:hide', () => {
  if (trayWindow) trayWindow.hide();
});
ipcMain.handle('app:quit', () => {
  isQuitting = true;
  app.quit();
});
