'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function loadRendererVoiceTurn(sandbox) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.js'), 'utf8');
  const start = source.indexOf('async function sendVoiceCallTurn(');
  const end = source.indexOf('\nasync function runVoiceCall(', start);
  assert.ok(start >= 0 && end > start, 'the production voice turn function should be present');
  vm.runInNewContext(`${source.slice(start, end)}\nthis.sendVoiceCallTurn = sendVoiceCallTurn;`, sandbox);
  return sandbox.sendVoiceCallTurn;
}

function loadRendererFunction(sandbox, startMarker, endMarker, exportName) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.js'), 'utf8');
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${exportName} should be present in the Renderer source`);
  vm.runInNewContext(`${source.slice(start, end)}\nthis.${exportName} = ${exportName};`, sandbox);
  return sandbox[exportName];
}

test('a voice reply completing after stream cancellation cannot write into the newly selected Chat session', async () => {
  const conversationA = [];
  const conversationB = [{ role: 'assistant', content: 'B 的当前记录' }];
  const rendered = [];
  const voiceLines = [];
  let moodUpdates = 0;
  let refreshes = 0;
  let streamFinished = false;
  let streamCancelled = false;
  let resolveStreamDone;
  const streamDone = new Promise((resolve) => { resolveStreamDone = resolve; });
  const stream = {
    done: streamDone,
    finish() { streamFinished = true; },
    cancel() {
      streamCancelled = true;
      resolveStreamDone();
    }
  };
  let sandbox;
  sandbox = {
    activeRuntimeSessionId: 'session-a',
    activeChatUiTurnToken: '',
    activeChatUiTurnSessionId: '',
    activeVoiceStream: null,
    conversation: conversationA,
    sending: false,
    voiceCallActive: true,
    voiceCallGeneration: 7,
    voiceCallSpeakerMuted: false,
    chatConfig: { memoryEnabled: true },
    api: {
      sendChat: async () => ({
        content: 'A 的迟到回复',
        emotion: 'happy',
        sessionId: 'session-a',
        createdAt: '2026-10-19T00:00:00.000Z',
        sessions: []
      })
    },
    createVoiceStreamController: () => stream,
    addMessage(role, content) {
      const entry = { sessionId: sandbox.activeRuntimeSessionId, role, content };
      rendered.push(entry);
      return { remove() { entry.removed = true; } };
    },
    addPendingMessage() { return { remove() {} }; },
    beginChatUiTurn(sessionId) {
      sandbox.activeChatUiTurnToken = 'turn-a';
      sandbox.activeChatUiTurnSessionId = sessionId;
      sandbox.sending = true;
      return 'turn-a';
    },
    finishChatUiTurn(token) {
      if (sandbox.activeChatUiTurnToken !== token) return;
      sandbox.activeChatUiTurnToken = '';
      sandbox.activeChatUiTurnSessionId = '';
      sandbox.sending = false;
    },
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
  const sendVoiceCallTurn = loadRendererVoiceTurn(sandbox);
  const pendingTurn = sendVoiceCallTurn('A 的语音消息', 7, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(streamFinished, true, 'the turn should be waiting for the delayed voice stream');

  // Match applyChatState while stream.done is pending.
  sandbox.activeRuntimeSessionId = 'session-b';
  sandbox.activeChatUiTurnToken = '';
  sandbox.activeChatUiTurnSessionId = '';
  sandbox.sending = false;
  sandbox.conversation = conversationB;
  sandbox.activeVoiceStream?.cancel();
  sandbox.activeVoiceStream = null;
  await pendingTurn;

  assert.equal(streamCancelled, true);
  assert.deepEqual(conversationA.map((message) => message.content), ['A 的语音消息']);
  assert.deepEqual(conversationB.map((message) => message.content), ['B 的当前记录']);
  assert.equal(sandbox.conversation, conversationB);
  assert.deepEqual(rendered.map((message) => [message.sessionId, message.role, message.content]), [
    ['session-a', 'user', 'A 的语音消息']
  ]);
  assert.equal(moodUpdates, 0);
  assert.equal(refreshes, 0);
  assert.deepEqual(voiceLines, []);
});

test('stopping a Chat turn cancels Main work and restores the composer after acknowledgement', async () => {
  const cancelCalls = [];
  let streamCancelled = false;
  const sandbox = {
    chatUiTurnSequence: 1,
    activeChatUiTurnToken: 'turn-a',
    activeChatUiTurnSessionId: 'session-a',
    chatCancellationPending: false,
    chatCancellationSessionId: '',
    activeRuntimeSessionId: 'session-a',
    activeVoiceStream: { cancel() { streamCancelled = true; } },
    sending: true,
    messageInput: { disabled: true },
    sendButton: { disabled: false, setAttribute() {}, textContent: '' },
    api: {
      async cancelChatRequest(sessionId) {
        cancelCalls.push(sessionId);
        return { cancelled: true };
      }
    },
    showNotice() {},
    errorText: (error) => String(error?.message || error)
  };
  const cancelChatUiTurn = loadRendererFunction(
    sandbox,
    'function beginChatUiTurn(',
    '\nasync function sendMessage(',
    'cancelChatUiTurn'
  );
  await cancelChatUiTurn();

  assert.deepEqual(cancelCalls, ['session-a']);
  assert.equal(streamCancelled, true);
  assert.equal(sandbox.activeChatUiTurnToken, '');
  assert.equal(sandbox.chatCancellationPending, false);
  assert.equal(sandbox.sending, false);
  assert.equal(sandbox.messageInput.disabled, false);
  assert.equal(sandbox.sendButton.disabled, false);
  assert.equal(sandbox.sendButton.textContent, '发送');
});

test('hanging up a voice call cancels its pending Main-owned Chat turn', () => {
  let cancelCalls = 0;
  let streamCancelled = false;
  let voiceState = '';
  const sandbox = {
    voiceCallActive: true,
    voiceCallGeneration: 8,
    voiceCallDurationTimer: 4,
    activeChatUiTurnToken: 'turn-a',
    activeChatUiTurnSessionId: 'session-a',
    activeVoiceStream: { cancel() { streamCancelled = true; } },
    api: { stopVoiceListening: () => Promise.resolve() },
    cancelChatUiTurn: () => { cancelCalls += 1; return Promise.resolve(); },
    clearInterval() {},
    stopSpeaking() {},
    disposeCallMicrophoneMonitor() {},
    setVoiceCallState: (state) => { voiceState = state; },
    voiceCallOverlay: { classList: { contains: () => false, add() {} } },
    messageInput: { focus() {} }
  };
  const endVoiceCall = loadRendererFunction(
    sandbox,
    'function endVoiceCall()',
    '\nasync function toggleVoiceCallMic(',
    'endVoiceCall'
  );
  endVoiceCall();

  assert.equal(cancelCalls, 1);
  assert.equal(streamCancelled, true);
  assert.equal(sandbox.voiceCallActive, false);
  assert.equal(sandbox.voiceCallGeneration, 9);
  assert.equal(voiceState, '通话已结束');
});
