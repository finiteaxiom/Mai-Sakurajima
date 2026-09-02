'use strict';

// Runs an Electron-only development diagnostic so it can use Mai's existing
// encrypted configuration without exposing an API key to Node or stdout.
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveElectronExecutable } = require('../test/electron-executable');

const projectRoot = path.resolve(__dirname, '..');
const electronExe = resolveElectronExecutable();
const args = path.basename(electronExe).toLowerCase() === 'electron.exe' ? [projectRoot] : [];
const useActiveSession = process.argv.includes('--active-session');
const useMessageBisect = process.argv.includes('--message-bisect');
const useMessageShapeAudit = process.argv.includes('--message-shape-audit');
const child = spawn(electronExe, args, {
  cwd: projectRoot,
  env: {
    ...process.env,
    ...(useMessageShapeAudit
      ? { MAI_DEEPSEEK_SESSION_MESSAGE_SHAPE_AUDIT: '1' }
      : useMessageBisect
      ? { MAI_DEEPSEEK_SESSION_MESSAGE_BISECT: '1' }
      : useActiveSession
      ? { MAI_DEEPSEEK_REAL_SESSION_SMOKE: '1' }
      : { MAI_DEEPSEEK_INCREMENTAL_SMOKE: '1' })
  },
  windowsHide: true,
  stdio: 'inherit'
});
child.once('error', (error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
child.once('close', (code) => {
  process.exitCode = Number.isInteger(code) ? code : 1;
});
