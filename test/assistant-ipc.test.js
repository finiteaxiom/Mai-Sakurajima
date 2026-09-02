const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAssistantIpc } = require('../assistant-ipc');

function createHarness() {
  const handlers = new Map();
  const calls = [];
  registerAssistantIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    publicAssistantState: () => ({ today: 'briefing' }),
    updateAssistantSettings: (input) => { calls.push(['settings', input]); return { ok: true }; },
    createAssistantBriefing: (type) => { calls.push(['briefing', type]); return { type }; },
    answerPromise: (id, response) => { calls.push(['answer', id, response]); return { id, response }; },
    startFocus: (input) => { calls.push(['focus', input]); return { started: true }; }
  });
  return { handlers, calls };
}

test('assistant IPC registers the existing five public channels', () => {
  const { handlers } = createHarness();
  assert.deepEqual([...handlers.keys()], [
    'assistant:get-state',
    'assistant:save-settings',
    'assistant:create-briefing',
    'assistant:answer-promise',
    'assistant:start-focus'
  ]);
});

test('assistant IPC forwards existing payloads and response shapes unchanged', () => {
  const { handlers, calls } = createHarness();
  assert.deepEqual(handlers.get('assistant:get-state')(), { today: 'briefing' });
  assert.deepEqual(handlers.get('assistant:save-settings')({}, { enabled: true }), { ok: true });
  assert.deepEqual(handlers.get('assistant:create-briefing')({}, 'evening'), { type: 'evening' });
  assert.deepEqual(handlers.get('assistant:answer-promise')({}, 'p1', 'done'), { id: 'p1', response: 'done' });
  assert.deepEqual(handlers.get('assistant:start-focus')({}, { minutes: 25 }), { started: true });
  assert.deepEqual(calls, [
    ['settings', { enabled: true }],
    ['briefing', 'evening'],
    ['answer', 'p1', 'done'],
    ['focus', { minutes: 25 }]
  ]);
});
