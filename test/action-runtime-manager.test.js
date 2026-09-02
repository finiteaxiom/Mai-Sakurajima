'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ActionRuntimeManager } = require('../agent/action-runtime-manager');
const { MockActionRuntime } = require('../agent/mock-action-runtime');

function createManager(configuration = { enabled: true, runtime: 'mock' }, delayMs = 0) {
  return new ActionRuntimeManager({ getConfiguration: () => configuration })
    .register(new MockActionRuntime({ delayMs }));
}

test('Action runtime executes a structured Mock result in an isolated session', async () => {
  const manager = createManager();
  const response = await manager.execute({ text: '帮我分析这个任务' });

  assert.equal(response.session.status, 'completed');
  assert.equal(response.session.request.text, '帮我分析这个任务');
  assert.equal(response.session.result.success, true);
  assert.equal(response.session.result.steps.length, 2);
  assert.match(response.presentation.content, /整理成一个可执行的起点/);
  assert.equal(response.session.request.capabilities, undefined);
});

test('disabled or unavailable Action Runtime never throws into Companion callers', async () => {
  const disabled = createManager({ enabled: false, runtime: 'mock' });
  await assert.rejects(disabled.execute({ text: '测试' }), { code: 'action_runtime_disabled' });

  const unavailable = createManager({ enabled: true, runtime: 'missing' });
  await assert.rejects(unavailable.execute({ text: '测试' }), { code: 'action_runtime_unavailable' });
});

test('Action Runtime captures execution failure in its own session', async () => {
  const manager = createManager();
  const response = await manager.execute({ text: '[mock-fail] 模拟失败' });
  assert.equal(response.session.status, 'failed');
  assert.equal(response.session.error.code, 'mock_execution_failed');
  assert.equal(response.session.result, null);
});

test('Action Runtime exposes its own task list without reading Companion state', async () => {
  const manager = createManager();
  await manager.execute({ text: '第一项任务' });
  await manager.execute({ text: '第二项任务' });

  const sessions = manager.listSessions();
  assert.equal(sessions.length, 2);
  assert.deepEqual(new Set(sessions.map((session) => session.request.text)), new Set(['第一项任务', '第二项任务']));
  assert.equal(Object.hasOwn(sessions[0], 'capabilities'), false);
});

test('Action Runtime cancellation updates only the action session lifecycle', async () => {
  const manager = createManager({ enabled: true, runtime: 'mock' }, 100);
  let sessionId = '';
  const pending = manager.execute({ text: '取消我', onStarted: (session) => { sessionId = session.id; } });
  assert.ok(sessionId);
  await manager.cancel(sessionId);
  const response = await pending;
  assert.equal(response.session.status, 'cancelled');
  assert.equal(response.session.error.code, 'action_cancelled');
});
