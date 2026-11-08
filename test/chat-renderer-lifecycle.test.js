'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatTurnCoordinator } = require('../renderer/chat-turn-coordinator');

function loadRendererFunction(sandbox, startMarker, endMarker, exportName) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.js'), 'utf8');
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${exportName} should be present in the Renderer source`);
  vm.runInNewContext(`${source.slice(start, end)}\nthis.${exportName} = ${exportName};`, sandbox);
  return sandbox[exportName];
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

for (const outcome of ['recognized', 'cancelled', 'failed']) {
  test(`single-shot voice input ${outcome} releases capture and never starts another listen`, async () => {
    let listens = 0;
    let disposed = 0;
    const sent = [];
    const notices = [];
    const classes = new Set();
    const sandbox = {
      voiceInputListening: false,
      chatTurnCoordinator: { getState: () => ({ busy: false }) },
      chatConfig: { configured: true },
      voiceCapabilities: { available: true },
      voiceConfig: () => ({ culture: 'zh-CN' }),
      voiceInputButton: { classList: { add: x => classes.add(x), remove: x => classes.delete(x) } },
      showNotice: message => notices.push(message), hideNotice() {},
      ensureVoiceInputMonitor: async () => ({}), beginVoiceCapture() {},
      finishVoiceCapture: () => ({ vocalTone: 'calm' }),
      enrichVoiceProfile: async capture => capture,
      disposeVoiceInputMonitor: () => { disposed += 1; },
      api: { listenVoice: async () => {
        listens += 1;
        if (outcome === 'failed') throw new Error('recognition failed');
        return outcome === 'cancelled' ? { canceled: true } : { text: '单次输入' };
      } },
      messageInput: { value: '' }, resizeInput() {},
      sendMessage: async options => sent.push({ text: sandbox.messageInput.value, voiceMode: options.voiceMode }),
      errorText: error => error.message
    };
    const input = loadRendererFunction(sandbox, 'async function startVoiceInput()', '\nfunction setMindMeter(', 'startVoiceInput');
    await input();
    assert.equal(listens, 1);
    assert.equal(disposed, 1);
    assert.equal(sandbox.voiceInputListening, false);
    assert.equal(classes.size, 0);
    assert.equal(sandbox.voiceInputButton.disabled, false);
    assert.deepEqual(sent, outcome === 'recognized' ? [{ text: '单次输入', voiceMode: true }] : []);
    if (outcome === 'failed') assert.equal(notices.at(-1), 'recognition failed');
  });
}

test('the Chat page loads the scoped turn coordinator before chat.js', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.html'), 'utf8');
  const coordinatorIndex = source.indexOf('<script src="chat-turn-coordinator.js"></script>');
  const chatIndex = source.indexOf('<script src="chat.js"></script>');
  assert.ok(coordinatorIndex >= 0 && chatIndex > coordinatorIndex);
  const coordinator = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat-turn-coordinator.js'), 'utf8');
  assert.match(coordinator, /^\(function attachChatTurnCoordinator\(\) \{/);
});

test('stopping a Renderer Chat turn uses coordinator confirmation and restores controls', async () => {
  const cancelCalls = [];
  const api = {
    async cancelChatRequest(sessionId) {
      cancelCalls.push(sessionId);
      return { cancelled: true };
    }
  };
  const coordinator = createChatTurnCoordinator({ api });
  coordinator.applyChatState({ activeSessionId: 'session-a', messages: [] });
  const turn = coordinator.beginTurn({ sessionId: 'session-a' });
  const sandbox = {
    chatTurnCoordinator: coordinator,
    showNotice() {},
    hideNotice() {},
    errorText: (error) => String(error?.message || error)
  };
  const cancelChatUiTurn = loadRendererFunction(
    sandbox,
    'async function cancelChatUiTurn()',
    '\nasync function sendMessage(',
    'cancelChatUiTurn'
  );
  await cancelChatUiTurn();

  assert.deepEqual(cancelCalls, ['session-a']);
  assert.equal(coordinator.getState().busy, false);
  assert.equal(coordinator.getState().activeTurnToken, '');
  coordinator.dispose();
});

test('late auto-read failures use the captured view identity after the turn releases the composer', async () => {
  const notices = [];
  const speechPromises = [createDeferred(), createDeferred(), createDeferred(), createDeferred()];
  const speechCalls = [];
  let responseNumber = 0;
  const sandbox = {
    api: {
      async sendChat() {
        responseNumber += 1;
        return {
          content: `回复 ${responseNumber}`,
          createdAt: '2026-10-19T00:00:00.000Z',
          sessions: []
        };
      }
    },
    conversation: [],
    chatConfig: { configured: true, memoryEnabled: false },
    selectedRuntimeMode: 'chat',
    messageInput: { value: '第一条消息', disabled: false },
    MAX_RENDER_CONTEXT_MESSAGES: 100,
    activeChatSessionId: () => sandbox.chatTurnCoordinator.getState().sessionId,
    addMessage(role, content) {
      const entry = { role, content, removed: false };
      return { remove() { entry.removed = true; } };
    },
    addPendingMessage() { return { remove() {} }; },
    removeOptimisticMessage(target, message) {
      const index = target.indexOf(message);
      if (index >= 0) target.splice(index, 1);
    },
    workspaceIntentFromChat: () => null,
    hideNotice() {},
    showNotice: (message) => notices.push(message),
    resizeInput() {},
    voiceConfig: () => ({ autoReadReplies: true }),
    speakText: () => {
      const speech = speechPromises.shift();
      speechCalls.push(speech);
      return speech.promise;
    },
    setMood() {},
    refreshMemories() {},
    refreshLifeState() {},
    renderHistory() {},
    renderCompanionWorkspace() {},
    errorText: (error) => String(error?.message || error)
  };
  const coordinator = createChatTurnCoordinator({
    api: sandbox.api,
    onStateChange: (state) => {
      sandbox.messageInput.disabled = state.busy;
    },
    onApplyChatState: (state) => { sandbox.conversation = state.messages || []; }
  });
  sandbox.chatTurnCoordinator = coordinator;
  coordinator.applyChatState({ activeSessionId: 'session-a', messages: [] });
  const sendMessage = loadRendererFunction(
    sandbox,
    'async function sendMessage(',
    '\nasync function saveSettings(',
    'sendMessage'
  );

  await sendMessage();
  assert.equal(coordinator.getState().busy, false, 'the composer must be free while local speech continues');
  speechCalls[0].reject(new Error('late speech failure'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(notices, ['late speech failure']);

  notices.length = 0;
  sandbox.messageInput.value = '第二条消息';
  await sendMessage();
  const oldReplySpeech = speechCalls[1];
  sandbox.messageInput.value = '第三条消息';
  await sendMessage();
  oldReplySpeech.reject(new Error('failure from an older turn'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(notices, [], 'a newer turn invalidates the previous reply speech error');

  const replySpeechBeforeSwitch = speechCalls[2];
  coordinator.applyChatState({ activeSessionId: 'session-b', messages: [] });
  replySpeechBeforeSwitch.reject(new Error('failure from the previous session'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(notices, [], 'a session change invalidates the previous reply speech error');

  coordinator.applyChatState({ activeSessionId: 'session-a', messages: [] });
  sandbox.messageInput.value = '第四条消息';
  await sendMessage();
  const replySpeechBeforeDispose = speechCalls[3];
  coordinator.dispose();
  replySpeechBeforeDispose.reject(new Error('failure after dispose'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(notices, [], 'dispose invalidates late speech errors');
});
