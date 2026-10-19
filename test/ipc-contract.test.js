'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadPreloadContract() {
  const invokes = [];
  const sends = [];
  const listeners = new Map();
  let exposed = null;
  const electronMock = {
    contextBridge: {
      exposeInMainWorld(name, api) {
        assert.equal(name, 'maiPet');
        exposed = api;
      }
    },
    ipcRenderer: {
      invoke(channel, ...args) {
        invokes.push({ channel, args });
        return Promise.resolve({ channel, args });
      },
      send(channel, ...args) {
        sends.push({ channel, args });
      },
      on(channel, listener) {
        listeners.set(channel, listener);
      },
      removeListener(channel, listener) {
        if (listeners.get(channel) === listener) listeners.delete(channel);
      }
    }
  };
  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'electron') return electronMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const preloadPath = path.join(__dirname, '..', 'preload.js');
    delete require.cache[require.resolve(preloadPath)];
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
  }
  return { api: exposed, invokes, sends, listeners };
}

test('preload exposes separate companion Chat and narrow Action contracts', async () => {
  const { api, invokes } = loadPreloadContract();
  const payload = { runtimeMode: 'chat', sessionId: 'session-1', messages: [{ role: 'user', content: 'hello' }] };
  await api.sendChat(payload);
  await api.cancelChatRequest('session-1');
  await api.getChatState();
  await api.selectChatSession('session-2');
  await api.renameChatSession('session-2', 'renamed');
  await api.setWallpaper('custom');
  await api.chooseCustomWallpaper();
  await api.clearCustomWallpaper();
  await api.chooseCustomAvatar('mai');
  await api.clearCustomAvatar('user');
  await api.getActionStatus();
  await api.configureAction({ enabled: true });
  await api.executeAction({ text: '做个计划' });
  await api.previewActionWorkspaceFile({ projectId: 'project-1', path: 'README.md' });
  await api.getChatWorkspaceCapability({ sessionId: 'session-1' });
  await api.selectChatWorkspaceCapability({ sessionId: 'session-1' });
  await api.executeChatWorkspaceCapability({ sessionId: 'session-1', operation: 'read', relativePath: 'README.md' });
  await api.revokeChatWorkspaceCapability({ sessionId: 'session-1' });
  assert.deepEqual(invokes, [
    { channel: 'chat:send', args: [payload] },
    { channel: 'chat:cancel-current-request', args: ['session-1'] },
    { channel: 'chat:get-state', args: [] },
    { channel: 'chat:select-session', args: ['session-2'] },
    { channel: 'chat:rename-session', args: ['session-2', 'renamed'] },
    { channel: 'chat:set-wallpaper', args: ['custom'] },
    { channel: 'chat:choose-custom-wallpaper', args: [] },
    { channel: 'chat:clear-custom-wallpaper', args: [] },
    { channel: 'chat:choose-custom-avatar', args: ['mai'] },
    { channel: 'chat:clear-custom-avatar', args: ['user'] },
    { channel: 'agent:get-status', args: [] },
    { channel: 'agent:configure', args: [{ enabled: true }] },
    { channel: 'agent:execute', args: [{ text: '做个计划' }] },
    { channel: 'agent:preview-workspace-file', args: [{ projectId: 'project-1', path: 'README.md' }] },
    { channel: 'workspace-capability:status', args: [{ sessionId: 'session-1' }] },
    { channel: 'workspace-capability:select', args: [{ sessionId: 'session-1' }] },
    { channel: 'workspace-capability:execute', args: [{ sessionId: 'session-1', operation: 'read', relativePath: 'README.md' }] },
    { channel: 'workspace-capability:revoke', args: [{ sessionId: 'session-1' }] }
  ]);
  assert.equal(typeof api.cancelAction, 'function');
  assert.equal(api.respondAgentApproval, undefined);
});

test('preload event subscriptions forward voice and Agent payloads and can detach listeners', () => {
  const { api, listeners } = loadPreloadContract();
  const received = [];
  const detachVoice = api.onVoiceStreamDelta((payload) => received.push(['voice', payload]));
  listeners.get('chat:voice-stream-delta')({}, { delta: 'hi' });
  assert.deepEqual(received, [
    ['voice', { delta: 'hi' }]
  ]);
  detachVoice();
  assert.equal(listeners.has('chat:voice-stream-delta'), false);
  assert.equal(typeof api.onActionSessionStarted, 'function');
  const detachAgent = api.onAgentEvent((payload) => received.push(['agent', payload]));
  listeners.get('agent:event')({}, { type: 'TaskStarted', taskId: 'task-1' });
  assert.deepEqual(received.at(-1), ['agent', { type: 'TaskStarted', taskId: 'task-1' }]);
  detachAgent();
  assert.equal(listeners.has('agent:event'), false);
});
