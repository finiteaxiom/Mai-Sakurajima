'use strict';

const { workspaceErrorDetails } = require('./agent/workspace-error');

function registerWorkspaceCapabilityIpc({ ipcMain, gateway, assertActiveSession }) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new TypeError('Workspace capability IPC requires ipcMain.handle().');
  if (!gateway || typeof gateway.getStatus !== 'function') throw new TypeError('Workspace capability IPC requires a gateway.');
  if (typeof assertActiveSession !== 'function') throw new TypeError('Workspace capability IPC requires assertActiveSession().');

  const session = (input) => assertActiveSession(String(input?.sessionId || ''));
  const run = async (callback) => {
    try { return await callback(); }
    catch (error) { return { ok: false, error: workspaceErrorDetails(error) }; }
  };

  ipcMain.handle('workspace-capability:status', (_event, input) => run(async () => ({ ok: true, status: gateway.getStatus(session(input)) })));
  ipcMain.handle('workspace-capability:select', (_event, input) => run(async () => ({ ok: true, status: await gateway.selectWorkspace(session(input)) })));
  ipcMain.handle('workspace-capability:revoke', (_event, input) => run(async () => ({ ok: true, status: gateway.revoke(session(input)) })));
  ipcMain.handle('workspace-capability:execute', (_event, input) => run(async () => ({ ok: true, execution: await gateway.execute(session(input), input) })));
}

module.exports = { registerWorkspaceCapabilityIpc };
