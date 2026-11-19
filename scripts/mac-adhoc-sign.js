'use strict';

// Hook afterPack do electron-builder: assina o .app do macOS com assinatura
// ad-hoc completa (todas as arquiteturas e componentes), como o build.sh da
// versão Swift fazia. Sem isso, só a fatia arm64 sai assinada (pelo linker) e,
// em Mac Intel, o macOS recusa registrar o app como item de login.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // Build universal: as cópias por arquitetura (*-temp) precisam ficar sem
  // assinatura para o @electron/universal uni-las; assina só o app final.
  if (/-temp$/.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • assinatura ad-hoc  app=${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
