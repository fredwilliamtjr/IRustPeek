let state = null;
let editingDevice = null;

const elements = {
  syncProvider: document.getElementById('sync-provider'),
  launchAtLogin: document.getElementById('launch-at-login'),
  deviceCount: document.getElementById('device-count'),
  deviceList: document.getElementById('device-list'),
  search: document.getElementById('search'),
  dialog: document.getElementById('device-dialog'),
  form: document.getElementById('device-form'),
  dialogTitle: document.getElementById('dialog-title'),
  deviceId: document.getElementById('device-id'),
  deviceName: document.getElementById('device-name'),
  rustdeskId: document.getElementById('rustdesk-id'),
  deviceTags: document.getElementById('device-tags'),
  deviceNotes: document.getElementById('device-notes'),
  deleteDevice: document.getElementById('delete-device'),
  reload: document.getElementById('reload'),
  reloadIcon: document.getElementById('reload-icon'),
  reloadLabel: document.getElementById('reload-label'),
  syncNote: document.getElementById('sync-note'),
  appVersion: document.getElementById('app-version')
};

async function init() {
  bindEvents();
  render(await window.iRustPeek.getState());
  window.iRustPeek.onStateChanged(render);
}

function bindEvents() {
  document.getElementById('new-device').addEventListener('click', () => openDeviceDialog());
  document.getElementById('reload').addEventListener('click', async () => {
    render({
      ...state,
      settings: {
        ...state.settings,
        syncInProgress: true
      }
    });
    render(await window.iRustPeek.syncNow());
  });
  elements.syncProvider.addEventListener('change', async (event) => {
    if (!event.target.value) return;
    render(await window.iRustPeek.setSyncProvider(event.target.value));
  });
  elements.launchAtLogin.addEventListener('change', async (event) => {
    render(await window.iRustPeek.setLaunchAtLogin(event.target.checked));
  });
  elements.search.addEventListener('input', () => renderDeviceList());
  document.getElementById('close-dialog').addEventListener('click', () => elements.dialog.close());
  document.getElementById('cancel-dialog').addEventListener('click', () => elements.dialog.close());
  elements.deleteDevice.addEventListener('click', async () => {
    if (!editingDevice) return;
    render(await window.iRustPeek.deleteDevice(editingDevice.id));
    elements.dialog.close();
  });
  elements.form.addEventListener('submit', saveDevice);
}

function render(nextState) {
  state = nextState;
  elements.launchAtLogin.checked = Boolean(state.settings.launchAtLogin);
  elements.appVersion.textContent = `IRustPeek ${state.settings.appVersion}`;
  renderSyncButton();
  renderSyncNote();
  renderCloudServices();
  renderDeviceList();
}

function renderSyncButton() {
  const syncing = Boolean(state.settings.syncInProgress);
  elements.reload.disabled = syncing;
  elements.reloadIcon.classList.toggle('spinning', syncing);
  elements.reloadLabel.textContent = syncing ? 'Sincronizando...' : 'Sincronizar';
}

function renderSyncNote() {
  if (state.settings.pendingWriteToCurrentProvider) {
    elements.syncNote.textContent = 'Este serviço ainda está vazio. Clique em Sincronizar para gravar nele as máquinas que estão na tela.';
    elements.syncNote.hidden = false;
    return;
  }

  elements.syncNote.textContent = '';
  elements.syncNote.hidden = true;
}

function renderCloudServices() {
  const services = state.settings.cloudServices || [];
  const selected = services.find((service) => service.selected);

  elements.syncProvider.innerHTML = '';
  for (const service of services) {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = service.available ? service.label : `${service.label} (indisponível)`;
    option.disabled = !service.available;
    option.selected = service.selected;
    elements.syncProvider.append(option);
  }

  if (!selected) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Escolha um serviço';
    option.selected = true;
    option.disabled = true;
    elements.syncProvider.prepend(option);
  }
}

function renderDeviceList() {
  const query = elements.search.value.trim().toLowerCase();
  const devices = state.book.devices.filter((device) => {
    const haystack = `${device.name} ${device.rustdeskId} ${(device.tags || []).join(' ')}`.toLowerCase();
    return haystack.includes(query);
  });

  elements.deviceCount.textContent = `${state.book.devices.length} máquina${state.book.devices.length === 1 ? '' : 's'} cadastrada${state.book.devices.length === 1 ? '' : 's'}`;
  elements.deviceList.innerHTML = '';

  if (!devices.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.book.devices.length ? 'Nenhuma máquina combina com a busca.' : 'Cadastre sua primeira máquina para ela aparecer no menu do IRustPeek.';
    elements.deviceList.append(empty);
    return;
  }

  for (const device of devices) {
    const card = document.createElement('article');
    card.className = 'device-card';

    const info = document.createElement('div');
    info.innerHTML = `
      <h3>${escapeHtml(device.name)}</h3>
      <div class="device-meta">${formatRustDeskId(device.rustdeskId)}</div>
      ${device.notes ? `<p class="muted">${escapeHtml(device.notes)}</p>` : ''}
    `;

    if (device.tags?.length) {
      const tags = document.createElement('div');
      tags.className = 'tags';
      for (const tag of device.tags) {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = tag;
        tags.append(span);
      }
      info.append(tags);
    }

    const actions = document.createElement('div');
    actions.className = 'device-actions';

    const connect = document.createElement('button');
    connect.className = 'primary';
    connect.textContent = 'Conectar';
    connect.addEventListener('click', () => window.iRustPeek.connectDevice(device.rustdeskId));

    const edit = document.createElement('button');
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => openDeviceDialog(device));

    actions.append(connect, edit);
    card.append(info, actions);
    elements.deviceList.append(card);
  }
}

function openDeviceDialog(device = null) {
  editingDevice = device;
  elements.dialogTitle.textContent = device ? 'Editar máquina' : 'Nova máquina';
  elements.deviceId.value = device?.id || '';
  elements.deviceName.value = device?.name || '';
  elements.rustdeskId.value = device?.rustdeskId || '';
  elements.deviceTags.value = (device?.tags || []).join(', ');
  elements.deviceNotes.value = device?.notes || '';
  elements.deleteDevice.style.visibility = device ? 'visible' : 'hidden';
  elements.dialog.showModal();
  elements.deviceName.focus();
}

async function saveDevice(event) {
  event.preventDefault();
  const device = {
    id: elements.deviceId.value || undefined,
    name: elements.deviceName.value,
    rustdeskId: elements.rustdeskId.value,
    tags: elements.deviceTags.value,
    notes: elements.deviceNotes.value
  };

  try {
    render(await window.iRustPeek.upsertDevice(device));
    elements.dialog.close();
  } catch (error) {
    alert(error.message || 'Não foi possível salvar.');
  }
}

function formatRustDeskId(value) {
  const raw = String(value || '');
  // Só agrupa de 3 em 3 quando é ID puramente numérico (9 dígitos).
  // IP, porta ou ID customizado alfanumérico são mostrados como estão.
  if (!/^\d+$/.test(raw)) return raw;
  return raw.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

init();
