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

function createStream({ resolveOnCancel = true } = {}) {
  let resolveDone;
  const stream = {
    done: new Promise((resolve) => { resolveDone = resolve; }),
    cancelled: false,
    finished: false,
    finish() { stream.finished = true; },
    cancel() {
      stream.cancelled = true;
      if (resolveOnCancel) resolveDone();
    },
    resolveDone() { resolveDone(); }
  };
  return stream;
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

test('the Chat page loads the scoped turn coordinator before chat.js', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.html'), 'utf8');
  const coordinatorIndex = source.indexOf('<script src="chat-turn-coordinator.js"></script>');
  const chatIndex = source.indexOf('<script src="chat.js"></script>');
  assert.ok(coordinatorIndex >= 0 && chatIndex > coordinatorIndex);
  const coordinator = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat-turn-coordinator.js'), 'utf8');
  assert.match(coordinator, /^\(function attachChatTurnCoordinator\(\) \{/);
});

test('a voice reply completing after same-session replacement cannot overwrite the current Chat view', async () => {
  const conversationA = [];
  const conversationB = [{ role: 'assistant', content: 'B 的当前记录' }];
  const rendered = [];
  const voiceLines = [];
  let moodUpdates = 0;
  let refreshes = 0;
  const stream = createStream({ resolveOnCancel: false });
  let sandbox;
  const api = {
    sendChat: async () => ({
      content: 'A 的迟到回复',
      emotion: 'happy',
      sessionId: 'session-a',
      createdAt: '2026-10-19T00:00:00.000Z',
      sessions: []
    }),
    cancelChatRequest: async () => ({ cancelled: false })
  };
  const coordinator = createChatTurnCoordinator({
    api,
    onApplyChatState: (state) => {
      sandbox.conversation = state.messages;
    }
  });
  sandbox = {
    chatTurnCoordinator: coordinator,
    activeChatSessionId: () => coordinator.getState().sessionId,
    conversation: conversationA,
    voiceCallActive: true,
    voiceCallGeneration: 7,
    voiceCallSpeakerMuted: false,
    chatConfig: { memoryEnabled: true },
    api,
    createVoiceStreamController: () => stream,
    addMessage(role, content) {
      const entry = { sessionId: coordinator.getState().sessionId, role, content, removed: false };
      rendered.push(entry);
      return { remove() { entry.removed = true; } };
    },
    addPendingMessage() { return { remove() {} }; },
    removeOptimisticMessage(target, message) {
      const index = target.indexOf(message);
      if (index >= 0) target.splice(index, 1);
    },
    setMood() { moodUpdates += 1; },
    renderHistory() {},
    refreshMemories() { refreshes += 1; },
    refreshLifeState() { refreshes += 1; },
    addVoiceCallLine(role, content) { voiceLines.push({ role, content }); }
  };
  coordinator.applyChatState({ activeSessionId: 'session-a', messages: conversationA });
  const sendVoiceCallTurn = loadRendererFunction(
    sandbox,
    'async function sendVoiceCallTurn(',
    '\nasync function runVoiceCall(',
    'sendVoiceCallTurn'
  );
  const pendingTurn = sendVoiceCallTurn('A 的语音消息', 7, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stream.finished, true, 'the production voice turn should be waiting for stream completion');

  coordinator.applyChatState({ activeSessionId: 'session-a', messages: conversationB });
  stream.resolveDone();
  await pendingTurn;

  assert.equal(stream.cancelled, true);
  assert.deepEqual(conversationA, []);
  assert.deepEqual(sandbox.conversation, conversationB);
  assert.equal(rendered.some((message) => message.role === 'assistant'), false);
  assert.equal(moodUpdates, 0);
  assert.equal(refreshes, 0);
  assert.deepEqual(voiceLines, []);
  coordinator.dispose();
});

test('stopping a Renderer Chat turn uses coordinator confirmation and restores controls', async () => {
  const cancelCalls = [];
  const stream = createStream();
  const api = {
    async cancelChatRequest(sessionId) {
      cancelCalls.push(sessionId);
      return { cancelled: true };
    }
  };
  const coordinator = createChatTurnCoordinator({ api });
  coordinator.applyChatState({ activeSessionId: 'session-a', messages: [] });
  const turn = coordinator.beginTurn({ sessionId: 'session-a' });
  turn.setVoiceStream(stream);
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
  assert.equal(stream.cancelled, true);
  assert.equal(coordinator.getState().busy, false);
  assert.equal(coordinator.getState().activeTurnToken, '');
  coordinator.dispose();
});

test('hanging up a voice call cancels its pending Main-owned Chat turn', async () => {
  let voiceState = '';
  const stream = createStream();
  const api = {
    cancelChatRequest: async () => ({ cancelled: true }),
    stopVoiceListening: () => Promise.resolve()
  };
  const coordinator = createChatTurnCoordinator({ api });
  coordinator.applyChatState({ activeSessionId: 'session-a', messages: [] });
  const turn = coordinator.beginTurn({ sessionId: 'session-a' });
  turn.setVoiceStream(stream);
  const sandbox = {
    chatTurnCoordinator: coordinator,
    voiceCallActive: true,
    voiceCallGeneration: 8,
    voiceCallDurationTimer: 4,
    api,
    clearInterval() {},
    stopSpeaking() {},
    disposeCallMicrophoneMonitor() {},
    setVoiceCallState: (state) => { voiceState = state; },
    voiceCallOverlay: { classList: { contains: () => false, add() {} } },
    messageInput: { focus() {} },
    errorText: (error) => String(error?.message || error),
    showNotice() {}
  };
  const endVoiceCall = loadRendererFunction(
    sandbox,
    'function endVoiceCall()',
    '\nasync function toggleVoiceCallMic(',
    'endVoiceCall'
  );
  endVoiceCall();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(stream.cancelled, true);
  assert.equal(sandbox.voiceCallActive, false);
  assert.equal(sandbox.voiceCallGeneration, 9);
  assert.equal(voiceState, '通话已结束');
  assert.equal(coordinator.getState().busy, false);
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
    messageInput: { value: '第一条消息', disabled: false },
    sending: false,
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
      sandbox.sending = state.busy;
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
