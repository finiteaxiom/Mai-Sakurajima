'use strict';

const { WorkspaceFileService } = require('./agent/workspace-file-service');
const { workspaceErrorDetails } = require('./agent/workspace-error');
const { operationResultFromToolResult } = require('./work/operation-result');

function waitForApproval(callback, approval) {
  const signal = approval?.signal;
  if (signal?.aborted) return Promise.resolve({ approved: false, reason: 'cancelled' });
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted); resolve(value); };
    const aborted = () => done({ approved: false, reason: 'cancelled' });
    const timer = setTimeout(() => done({ approved: false, reason: 'timeout' }), 60_000);
    signal?.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => callback(approval)).then((value) => done(value), () => done({ approved: false, reason: 'unavailable' }));
  });
}

function requireProject(workStore, projectId) {
  const project = workStore.getProject(projectId);
  if (!project) throw new Error('请先选择一个 Work 项目。');
  return project;
}

function registerActionIpc({ ipcMain, actionRuntimeManager, workStore, getConfiguration, saveConfiguration, selectWorkspace, requestApproval, createWorkspaceFileService }) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new TypeError('Action IPC requires ipcMain.handle().');
  if (!actionRuntimeManager || typeof actionRuntimeManager.execute !== 'function') throw new TypeError('Action IPC requires an action runtime manager.');
  if (!workStore || typeof workStore.snapshot !== 'function') throw new TypeError('Action IPC requires a WorkStore.');
  if (typeof getConfiguration !== 'function' || typeof saveConfiguration !== 'function') throw new TypeError('Action IPC requires configuration callbacks.');
  const workspaceForProject = (project) => (typeof createWorkspaceFileService === 'function'
    ? createWorkspaceFileService(project)
    : new WorkspaceFileService({ getWorkspacePath: () => project.workspacePath }));

  ipcMain.handle('agent:get-status', () => actionRuntimeManager.status());
  ipcMain.handle('agent:get-session', (_event, sessionId) => actionRuntimeManager.getSession(sessionId));
  ipcMain.handle('agent:list-sessions', () => actionRuntimeManager.listSessions());
  ipcMain.handle('agent:get-work-data', () => workStore.snapshot());
  ipcMain.handle('agent:create-project', (_event, input) => workStore.createProject({ name: input?.name }));
  ipcMain.handle('agent:rename-project', (_event, input) => workStore.renameProject(input?.projectId, input?.name));
  ipcMain.handle('agent:open-project', (_event, projectId) => workStore.openProject(projectId));
  ipcMain.handle('agent:create-work-session', (_event, input) => workStore.createSession(input?.projectId, { title: input?.title }));
  ipcMain.handle('agent:get-work-session', (_event, sessionId) => workStore.getSession(sessionId));
  ipcMain.handle('agent:rename-work-session', (_event, input) => workStore.renameSession(input?.workSessionId, input?.title, input?.projectId));
  ipcMain.handle('agent:delete-work-session', (_event, input) => workStore.deleteSession(input?.workSessionId, input?.projectId));
  ipcMain.handle('agent:execute', async (event, input) => {
    const project = requireProject(workStore, input?.projectId);
    const workSession = input?.workSessionId ? workStore.getSession(input.workSessionId) : workStore.createSession(project.id);
    if (!workSession || workSession.projectId !== project.id) throw new Error('Work 记录不属于当前项目。');
    const text = String(input?.text || '').trim().slice(0, 6000);
    if (!text) throw new Error('请先告诉我需要处理什么。');
    workStore.appendMessage(workSession.id, { role: 'user', content: text });
    const operationResults = [];
    let workspaceSelection = '';
    if (project.workspacePath && typeof input?.workspaceSelection === 'string' && input.workspaceSelection.trim()) {
      try { workspaceSelection = (await workspaceForProject(project).getPathInfo(input.workspaceSelection)).relativePath; } catch { workspaceSelection = ''; }
    }
    try {
      const response = await actionRuntimeManager.execute({
        text,
        projectId: project.id,
        workSessionId: workSession.id,
        workspacePath: project.workspacePath,
        workspaceSelection,
        capabilities: ['safe-local', ...(project.workspacePath ? ['workspace-read', 'workspace-write'] : [])],
        requestApproval: (approval) => requestApproval ? waitForApproval((value) => requestApproval(event, value), approval) : Promise.resolve({ approved: false, reason: 'unavailable' }),
        onStarted: (session) => { if (!event.sender.isDestroyed()) event.sender.send('agent:session-started', session); },
        onEvent: (agentEvent) => {
          const operationResult = agentEvent?.type === 'ToolCompleted' ? operationResultFromToolResult(agentEvent?.payload?.result) : null;
          if (operationResult) operationResults.push(operationResult);
          if (!event.sender.isDestroyed()) event.sender.send('agent:event', agentEvent);
        }
      });
      workStore.appendMessage(workSession.id, {
        role: 'assistant', content: response?.presentation?.content || '这次行动没有返回内容。',
        actionSessionId: response?.session?.id, status: response?.session?.status, toolSummary: response?.session?.result?.summary, operationResults
      });
      return { ...response, workSession: workStore.getSession(workSession.id) };
    } catch (error) {
      workStore.appendMessage(workSession.id, { role: 'assistant', content: String(error?.message || '行动执行失败。'), status: 'failed' });
      throw error;
    }
  });
  ipcMain.handle('agent:cancel', (_event, sessionId) => actionRuntimeManager.cancel(sessionId));
  ipcMain.handle('agent:get-workspace', (_event, projectId) => {
    const project = requireProject(workStore, projectId);
    return { configured: Boolean(project.workspacePath), path: project.workspacePath, projectId: project.id };
  });
  ipcMain.handle('agent:list-workspace-directory', async (_event, input) => {
    const project = requireProject(workStore, input?.projectId);
    try { return await workspaceForProject(project).listDirectory(input?.path || '.'); }
    catch (error) {
      const details = workspaceErrorDetails(error);
      console.warn('[Work Workspace] list failed:', details.code, details.developerMessage);
      throw Object.assign(new Error(details.userMessage), { code: details.code });
    }
  });
  ipcMain.handle('agent:preview-workspace-file', async (_event, input) => {
    const project = requireProject(workStore, input?.projectId);
    try { return { ok: true, data: await workspaceForProject(project).readPreview(input?.path || '') }; }
    catch (error) {
      const details = workspaceErrorDetails(error);
      console.warn('[Work Workspace] preview failed:', details.code, details.developerMessage);
      return { ok: false, error: { code: details.code, userMessage: details.userMessage, retryable: details.retryable } };
    }
  });
  ipcMain.handle('agent:select-workspace', async (_event, projectId) => {
    if (actionRuntimeManager.status().activeSessionId) throw new Error('Work 任务运行期间不能更换 Workspace。');
    const project = requireProject(workStore, projectId);
    if (typeof selectWorkspace !== 'function') throw new Error('当前无法选择 Workspace。');
    return selectWorkspace(project);
  });
  ipcMain.handle('agent:configure', (_event, input) => {
    const current = getConfiguration();
    saveConfiguration({
      ...current,
      enabled: input?.enabled === true,
      runtime: current.runtime
    });
    return actionRuntimeManager.status();
  });
}

module.exports = { registerActionIpc, waitForApproval };
