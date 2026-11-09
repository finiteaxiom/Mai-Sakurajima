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
