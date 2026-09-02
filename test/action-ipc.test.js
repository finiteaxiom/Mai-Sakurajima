'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerActionIpc } = require('../action-ipc');

test('Action IPC exposes a narrow action-only contract', async () => {
  const handlers = new Map();
  const manager = {
    status: () => ({ enabled: false, available: false }),
    getSession: (id) => ({ id }),
    listSessions: () => [{ id: 'action-1' }],
    execute: async (input) => {
      manager.lastExecution = input;
      input.onStarted({ id: 'action-1', status: 'running' });
      input.onEvent({ type: 'TaskStarted', taskId: 'agent-task-1' });
      input.onEvent({ type: 'ToolCompleted', payload: { result: { tool: 'create_file', ok: true, data: { path: 'Workspace/notes.md' } } } });
      return { session: { id: 'action-1', status: 'completed' } };
    },
    cancel: async (id) => ({ id, status: 'cancelled' })
  };
  const messages = [];
  const project = { id: 'project-1', name: '测试项目', workspacePath: 'D:\\workspace-a' };
  const workSession = { id: 'work-1', projectId: 'project-1', title: '新任务', messages: [] };
  const workStore = {
    snapshot: () => ({ version: 1, projects: [project], sessions: [workSession], lastOpenedProjectId: project.id }),
    getProject: (id) => id === project.id ? project : null,
    getSession: (id) => id === workSession.id ? workSession : null,
    createProject: (input) => ({ id: 'project-2', ...input, workspacePath: '' }),
    renameProject: (id, name) => ({ ...project, id, name }),
    openProject: (id) => ({ ...project, id }),
    createSession: (projectId) => ({ ...workSession, projectId }),
    renameSession: (id, title, projectId) => ({ ...workSession, id, title, projectId }),
    deleteSession: (id, projectId) => ({ id, projectId }),
    appendMessage: (sessionId, message) => { messages.push({ sessionId, ...message }); return message; }
  };
  let configuration = { enabled: false, runtime: 'mock' };
  const sent = [];
  registerActionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    actionRuntimeManager: manager,
    workStore,
    getConfiguration: () => configuration,
    saveConfiguration: (next) => { configuration = next; }
  });
  assert.ok(handlers.has('agent:get-work-data'));
  assert.ok(handlers.has('agent:create-project'));
  assert.ok(handlers.has('agent:create-work-session'));
  assert.ok(handlers.has('agent:rename-work-session'));
  assert.ok(handlers.has('agent:delete-work-session'));
  assert.ok(handlers.has('agent:list-workspace-directory'));
  assert.deepEqual(await handlers.get('agent:list-sessions')(), [{ id: 'action-1' }]);
  const sender = { isDestroyed: () => false, send: (...args) => sent.push(args) };
  const response = await handlers.get('agent:execute')({ sender }, { text: '  做个计划  ', projectId: project.id, workSessionId: workSession.id, capabilities: ['execute'] });
  assert.equal(response.session.status, 'completed');
  assert.deepEqual(sent, [
    ['agent:session-started', { id: 'action-1', status: 'running' }],
    ['agent:event', { type: 'TaskStarted', taskId: 'agent-task-1' }],
    ['agent:event', { type: 'ToolCompleted', payload: { result: { tool: 'create_file', ok: true, data: { path: 'Workspace/notes.md' } } } }]
  ]);
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant']);
  assert.deepEqual(messages[1].operationResults, [{ operation: 'create', title: '已创建', ok: true, path: 'Workspace/notes.md', sourcePath: '', destinationPath: '', kind: '', error: null }]);
  assert.equal(manager.lastExecution.projectId, project.id);
  assert.equal(manager.lastExecution.workSessionId, workSession.id);
  assert.equal(manager.lastExecution.workspacePath, 'D:\\workspace-a');
  assert.deepEqual(manager.lastExecution.capabilities, ['safe-local', 'workspace-read', 'workspace-write']);
  await handlers.get('agent:configure')({}, { enabled: true, runtime: 'anything-else' });
  assert.deepEqual(configuration, { enabled: true, runtime: 'mock' });
});
