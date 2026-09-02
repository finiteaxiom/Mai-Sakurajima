'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerWorkspaceCapabilityIpc } = require('../workspace-capability-ipc');

test('Workspace capability IPC stays in a separate narrow namespace', async () => {
  const handlers = new Map();
  const calls = [];
  const gateway = {
    getStatus: (sessionId) => ({ granted: false, sessionId }),
    selectWorkspace: async (sessionId) => ({ granted: true, sessionId }),
    revoke: (sessionId) => ({ granted: false, sessionId }),
    execute: async (sessionId, input) => { calls.push([sessionId, input]); return { contextId: 'ctx-1' }; }
  };
  registerWorkspaceCapabilityIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    gateway,
    assertActiveSession: (sessionId) => sessionId === 'chat-1' ? sessionId : (() => { throw Object.assign(new Error('session changed'), { code: 'workspace_context_unavailable' }); })()
  });
  assert.deepEqual([...handlers.keys()].sort(), ['workspace-capability:execute', 'workspace-capability:revoke', 'workspace-capability:select', 'workspace-capability:status']);
  assert.deepEqual(await handlers.get('workspace-capability:status')({}, { sessionId: 'chat-1' }), { ok: true, status: { granted: false, sessionId: 'chat-1' } });
  assert.equal((await handlers.get('workspace-capability:execute')({}, { sessionId: 'chat-1', operation: 'read', relativePath: 'README.md' })).execution.contextId, 'ctx-1');
  assert.deepEqual(calls, [['chat-1', { sessionId: 'chat-1', operation: 'read', relativePath: 'README.md' }]]);
  const denied = await handlers.get('workspace-capability:status')({}, { sessionId: 'old-chat' });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'WORKSPACE_CONTEXT_UNAVAILABLE');
});
