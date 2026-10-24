'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { fileURLToPath } = require('node:url');
function registerDiagnosticsIpc({ ipcMain, app, shell, dialog, diagnostics, rendererDirectory }) {
  const trusted = event => {
    try {
      return event.senderFrame === event.sender.mainFrame && fileURLToPath(event.senderFrame.url) === path.join(rendererDirectory, 'chat.html');
    } catch { return false; }
  };
  const handle = (name, handler) => ipcMain.handle(`diagnostics:${name}`, async event => {
    if (!trusted(event)) throw new Error('诊断入口不可用。');
    return handler();
  });
  handle('snapshot', async () => ({ ...await diagnostics.snapshot(), version: app.getVersion(), memoryMB: Math.round(process.memoryUsage().rss / 1048576) }));
  handle('open-folder', async () => {
    const { directory } = await diagnostics.snapshot();
    await fs.mkdir(directory, { recursive: true });
    if (await shell.openPath(directory)) throw new Error('无法打开日志目录。');
    return { ok: true };
  });
  handle('export', async () => {
    const selected = await dialog.showSaveDialog({ title: '导出脱敏诊断（不含聊天正文或密钥）', defaultPath: 'mai-diagnostics.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (selected.canceled || !selected.filePath) return { cancelled: true };
    const snapshot = await diagnostics.snapshot();
    const { directory, ...safe } = snapshot;
    try { await fs.writeFile(selected.filePath, JSON.stringify({ version: app.getVersion(), ...safe }, null, 2), 'utf8'); }
    catch { throw new Error('诊断导出失败，请选择可写位置。'); }
    return { ok: true };
  });
  const limits = new WeakMap();
  ipcMain.on('diagnostics:renderer-error', (event, kind) => {
    if (!trusted(event) || !['script-error','unhandled-rejection'].includes(kind)) return;
    const old = limits.get(event.sender) || { time: Date.now(), count: 0 };
    if (Date.now() - old.time > 60000) { old.time = Date.now(); old.count = 0; }
    limits.set(event.sender, old);
    if (old.count++ < 10) diagnostics.record('renderer', kind, 'failed');
  });
}
module.exports = { registerDiagnosticsIpc };
