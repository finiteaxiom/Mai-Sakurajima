const test = require('node:test');
const assert = require('node:assert/strict');
const { registerTimerIpc } = require('../timer-ipc');

test('timer IPC retains its three public channels and exact payload forwarding', () => {
  const handlers = new Map();
  const calls = [];
  registerTimerIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    publicReminderState: () => ({ active: true }),
    startReminder: (...args) => { calls.push(['start', ...args]); return { ok: true }; },
    cancelReminder: () => { calls.push(['cancel']); return { canceled: true }; }
  });

  assert.deepEqual([...handlers.keys()], ['timer:get-state', 'timer:start', 'timer:cancel']);
  assert.deepEqual(handlers.get('timer:get-state')(), { active: true });
  assert.deepEqual(handlers.get('timer:start')({}, { minutes: 25, label: '学习', mode: 'study' }), { ok: true });
  assert.deepEqual(handlers.get('timer:cancel')(), { canceled: true });
  assert.deepEqual(calls, [['start', 25, '学习', 'study'], ['cancel']]);
});
