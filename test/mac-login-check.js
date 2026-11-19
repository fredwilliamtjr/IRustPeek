'use strict';

// CI (macOS): abre o app empacotado, liga "Iniciar com o
// macOS" pela API do Electron e confere o status devolvido pelo macOS.
// Uso: node test/mac-login-check.js <executável> [--expect-fail]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');

(async () => {
  const [executable, flag] = process.argv.slice(2);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'irustpeek-login-'));
  const app = await electron.launch({
    executablePath: executable,
    args: [],
    env: { ...process.env, XDG_CONFIG_HOME: userData }
  });
  const result = await app.evaluate(async ({ app }) => {
    app.setLoginItemSettings({ openAtLogin: true });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const after = app.getLoginItemSettings();
    app.setLoginItemSettings({ openAtLogin: false });
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { arch: process.arch, status: after.status, openAtLogin: after.openAtLogin, cleaned: app.getLoginItemSettings().status };
  });
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(JSON.stringify(result));
  const ok = result.status === 'enabled' && result.openAtLogin;
  if (flag === '--expect-fail') {
    console.log(ok ? 'Versão antiga registrou (bug não reproduzido aqui).' : 'Versão antiga NÃO registrou (bug reproduzido).');
    return;
  }
  if (!ok) throw new Error(`macOS não ativou o item de login: ${result.status}`);
  console.log(`PASS: item de login ativado (${result.arch})`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
