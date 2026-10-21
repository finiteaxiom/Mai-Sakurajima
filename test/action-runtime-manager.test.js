'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ActionRuntimeManager } = require('../agent/action-runtime-manager');
const { createActionSession } = require('../agent/action-session');
const { MockActionRuntime } = require('../agent/mock-action-runtime');
const { WorkStore } = require('../work/work-store');
const { createConversationState } = require('../conversation-state');
const { writeJsonAtomic } = require('../json-persistence');

function createManager(configuration = { enabled: true, runtime: 'mock' }, delayMs = 0) {
  return new ActionRuntimeManager({ getConfiguration: () => configuration })
    .register(new MockActionRuntime({ delayMs }));
}

function createFastManager() {
  let sessionSequence = 0;
  let clock = Date.parse('2026-10-20T00:00:00.000Z');
  const manager = new ActionRuntimeManager({
    getConfiguration: () => ({ enabled: true, runtime: 'fast-fixture' }),
    now: () => ++clock,
    createSession: (input, createOptions) => createActionSession({
      ...input,
      id: `fixture-action-${++sessionSequence}`
    }, createOptions)
  });
  manager.register({
    id: 'fast-fixture',
    metadata: { available: true },
    async execute(request, context) {
      context.onEvent({ type: 'TaskStarted', sessionId: context.sessionId, taskId: `task-${context.sessionId}` });
      if (request.text === 'fail') {
        throw Object.assign(new Error('fixture failure'), { code: 'fixture_failure' });
      }
      if (request.text === 'wait-for-cancel') {
        await new Promise((resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
        });
      }
      return { summary: `finished ${request.text}` };
    }
  });
  return manager;
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

test('terminal ActionSession retention is bounded and preserves current result, events, failures, and cancellation', async () => {
  const manager = createFastManager();
  let firstId = '';
  let newestId = '';
  let startedId = '';
  const eventSessionIds = [];

  for (let index = 0; index < 500; index += 1) {
    const response = await manager.execute({ text: `completed-${index}` });
    if (index === 0) firstId = response.session.id;
  }

  const failed = await manager.execute({ text: 'fail' });
  assert.equal(failed.session.status, 'failed');
  assert.equal(failed.session.error.code, 'fixture_failure');
  assert.equal(manager.sessions.size, 500);
  assert.equal(manager.getSession(firstId), null, 'the oldest terminal id expires with the documented unknown-id null result');
  assert.equal(await manager.cancel(firstId), null);
  assert.equal(manager.getSession(failed.session.id).status, 'failed');

  const pending = manager.execute({
    text: 'wait-for-cancel',
    onStarted: (session) => { startedId = session.id; },
    onEvent: (event) => { eventSessionIds.push(event.sessionId); }
  });
  assert.ok(startedId);
  assert.equal(manager.getSession(startedId).status, 'running');
  assert.equal(manager.controllers.has(startedId), true);
  assert.equal(manager.sessions.size, 501, 'running entries may temporarily sit outside the terminal retention count');
  assert.equal(manager.listSessions().some((session) => session.id === startedId), true);
  const pressureTerminal = createActionSession({ id: 'fixture-terminal-pressure' });
  pressureTerminal.status = 'completed';
  manager.sessions.set(pressureTerminal.id, pressureTerminal);
  manager.recordTerminalSession(pressureTerminal.id);
  manager.pruneTerminalSessions();
  assert.equal(manager.getSession(startedId).status, 'running', 'cache pressure cannot evict a controller-owned running session');
  assert.equal(manager.controllers.has(startedId), true);

  await manager.cancel(startedId);
  const cancelled = await pending;
  assert.equal(cancelled.session.status, 'cancelled');
  assert.equal(cancelled.session.id, startedId);
  assert.equal(manager.getSession(startedId).status, 'cancelled');
  assert.equal(manager.listSessions().some((session) => session.id === startedId), true);
  assert.deepEqual(eventSessionIds, [startedId], 'runtime events keep the active session association');
  assert.equal(manager.getSession(failed.session.id).status, 'failed');
  assert.equal(manager.sessions.size, 500);
  assert.equal(manager.controllers.size, 0);

  const latest = await manager.execute({
    text: 'current-result',
    onStarted: (session) => { newestId = session.id; startedId = session.id; },
    onEvent: (event) => { eventSessionIds.push(event.sessionId); }
  });
  assert.equal(latest.session.status, 'completed');
  assert.equal(latest.session.id, newestId);
  assert.deepEqual(eventSessionIds.at(-1), newestId);
  assert.equal(manager.getSession(newestId).result.summary, 'finished current-result');
  assert.equal(manager.listSessions().some((session) => session.id === newestId), true,
    'the current completed id remains available for Renderer confirmation');
  assert.equal(manager.sessions.size, 500);
  assert.ok(latest.session.result);
});

test('ActionSession pruning leaves actual WorkStore and Chat history persistence bytes unchanged', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-action-cache-isolation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const workPath = path.join(directory, 'mai-work.json');
  const chatPath = path.join(directory, 'mai-pet-memory.json');
  const workStore = new WorkStore({ filePath: workPath });
  workStore.load();
  const project = workStore.createProject({ name: 'fixture project' });
  const workSession = workStore.createSession(project.id, { title: 'fixture work history' });
  workStore.appendMessage(workSession.id, { role: 'user', content: 'synthetic work message' });

  const conversationState = createConversationState({
    createSession: () => ({ id: 'fixture-chat-session', title: 'fixture chat', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', messages: [] }),
    sessionTitleFromMessages: () => 'fixture chat',
    maxSessions: 200,
    maxMessages: 2000,
    maxMessageChars: 12000
  });
  const chatState = {
    sessions: [{ id: 'fixture-chat-session', title: 'fixture chat', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', messages: [] }],
    activeSessionId: 'fixture-chat-session'
  };
  conversationState.appendConversationTurn(chatState, {
    sessionId: 'fixture-chat-session',
    userMessage: { id: 'chat-user', role: 'user', content: 'synthetic user history' },
    assistantMessage: { id: 'chat-assistant', role: 'assistant', content: 'synthetic assistant history' },
    updatedAt: '2026-10-20T00:00:01.000Z'
  });
  writeJsonAtomic(chatPath, chatState);

  const originalWorkBytes = fs.readFileSync(workPath);
  const originalChatBytes = fs.readFileSync(chatPath);
  const originalWorkCounts = {
    projects: workStore.snapshot().projects.length,
    sessions: workStore.snapshot().sessions.length,
    messages: workStore.getSession(workSession.id).messages.length
  };
  const originalChatCounts = {
    sessions: chatState.sessions.length,
    messages: chatState.sessions.reduce((total, session) => total + session.messages.length, 0)
  };

  const manager = createFastManager();
  for (let index = 0; index < 505; index += 1) {
    const result = await manager.execute({ text: `cache-only-${index}` });
    assert.equal(result.session.status, 'completed');
  }

  assert.deepEqual(fs.readFileSync(workPath), originalWorkBytes);
  assert.deepEqual(fs.readFileSync(chatPath), originalChatBytes);
  assert.deepEqual({
    projects: workStore.snapshot().projects.length,
    sessions: workStore.snapshot().sessions.length,
    messages: workStore.getSession(workSession.id).messages.length
  }, originalWorkCounts);
  assert.deepEqual({
    sessions: chatState.sessions.length,
    messages: chatState.sessions.reduce((total, session) => total + session.messages.length, 0)
  }, originalChatCounts);
  assert.equal(manager.sessions.size, 500);
});
