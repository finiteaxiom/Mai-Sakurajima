const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationState, normalizeActiveSessionId } = require('../conversation-state');

function createHarness() {
  let nextId = 0;
  const conversation = createConversationState({
    createSession: () => ({
      id: `chat-${++nextId}`,
      title: '新对话',
      createdAt: `2026-08-20T00:00:0${nextId}.000Z`,
      updatedAt: `2026-08-20T00:00:0${nextId}.000Z`,
      messages: []
    }),
    sessionTitleFromMessages: (messages) => messages.find((message) => message.role === 'user')?.content || '新对话',
    maxSessions: 3,
    maxMessages: 2
  });
  const state = {
    version: 16,
    sessions: [],
    activeSessionId: '',
    facts: [{ id: 'fact-1', text: '用户喜欢咖啡' }],
    mind: { mood: 'calm' }
  };
  return { conversation, state };
}

test('empty state and the first Chat turn create one active session', () => {
  const { conversation, state } = createHarness();
  const created = conversation.ensureActiveSession(state);
  const result = conversation.appendConversationTurn(state, {
    sessionId: created.id,
    userMessage: { id: 'u1', role: 'user', content: '你好', createdAt: '2026-08-20T01:00:00.000Z' },
    assistantMessage: { id: 'a1', role: 'assistant', content: '你好。', createdAt: '2026-08-20T01:00:01.000Z' },
    updatedAt: '2026-08-20T01:00:01.000Z'
  });

  assert.equal(state.sessions.length, 1);
  assert.equal(state.activeSessionId, created.id);
  assert.equal(result.session.messages.length, 2);
  assert.equal(result.storedUserMessage.id, 'u1');
});

test('Chat appends to the requested active session without changing other state roots', () => {
  const { conversation, state } = createHarness();
  state.sessions = [
    { id: 'active', title: '旧对话', createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z', messages: [] },
    { id: 'other', title: '其他', createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z', messages: [] }
  ];
  state.activeSessionId = 'active';
  const factsBefore = structuredClone(state.facts);
  const mindBefore = structuredClone(state.mind);

  conversation.appendConversationTurn(state, {
    sessionId: 'active',
    userMessage: { id: 'u1', role: 'user', content: '继续聊', createdAt: '2026-08-20T01:00:00.000Z' },
    assistantMessage: { id: 'a1', role: 'assistant', content: '好。', createdAt: '2026-08-20T01:00:01.000Z' },
    updatedAt: '2026-08-20T01:00:01.000Z'
  });

  assert.deepEqual(state.sessions.find((session) => session.id === 'active').messages.map((message) => message.id), ['u1', 'a1']);
  assert.deepEqual(state.sessions.find((session) => session.id === 'other').messages, []);
  assert.deepEqual(state.facts, factsBefore);
  assert.deepEqual(state.mind, mindBefore);
});

test('new, select, rename, delete-current and delete-noncurrent preserve session behavior', () => {
  const { conversation, state } = createHarness();
  const first = conversation.createNewSession(state);
  assert.equal(first.created, true);
  assert.equal(conversation.createNewSession(state).created, false);
  first.session.messages.push({ id: 'u1', role: 'user', content: '第一段', createdAt: '2026-08-20T01:00:00.000Z' });
  const second = conversation.createNewSession(state).session;
  conversation.renameSession(state, first.session.id, '第一段已命名', '2026-08-20T01:00:02.000Z');
  conversation.activateSession(state, first.session.id);
  assert.equal(state.activeSessionId, first.session.id);
  assert.equal(first.session.title, '第一段已命名');

  conversation.deleteSession(state, second.id);
  assert.equal(state.activeSessionId, first.session.id);
  assert.equal(state.sessions.length, 1);

  conversation.deleteSession(state, first.session.id);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.activeSessionId, state.sessions[0].id);
});

test('active-session normalization handles invalid ids and restored compatible sessions deterministically', () => {
  const restoredSessions = [
    { id: 'restored-1', title: '旧版对话', messages: [{ id: 'm1', role: 'user', content: '保留', createdAt: '2026-08-01T00:00:00.000Z' }] },
    { id: 'restored-2', title: '第二段', messages: [] }
  ];
  assert.equal(normalizeActiveSessionId(restoredSessions, 'restored-2'), 'restored-2');
  assert.equal(normalizeActiveSessionId(restoredSessions, 'missing'), 'restored-1');
  assert.equal(normalizeActiveSessionId([], 'missing'), '');

  const { conversation, state } = createHarness();
  state.sessions = structuredClone(restoredSessions);
  state.activeSessionId = normalizeActiveSessionId(state.sessions, 'missing');
  const active = conversation.getSession(state);
  assert.equal(active.id, 'restored-1');
  assert.equal(state.sessions[0].messages[0].content, '保留');
  assert.equal(state.version, 16);
});

test('proactive messages append to the requested session and retain the message limit', () => {
  const { conversation, state } = createHarness();
  state.sessions = [{ id: 'session-1', title: '对话', createdAt: '', updatedAt: '', messages: [
    { id: 'old', role: 'assistant', content: '旧消息', createdAt: '2026-08-20T00:00:00.000Z' },
    { id: 'newer', role: 'user', content: '新消息', createdAt: '2026-08-20T00:01:00.000Z' }
  ] }];
  state.activeSessionId = 'session-1';
  const session = conversation.appendProactiveMessage(state, {
    sessionId: 'session-1',
    message: { id: 'proactive', role: 'assistant', content: '我来看看你。', createdAt: '2026-08-20T00:02:00.000Z' },
    updatedAt: '2026-08-20T00:02:00.000Z'
  });

  assert.deepEqual(session.messages.map((message) => message.id), ['newer', 'proactive']);
  assert.equal(state.activeSessionId, 'session-1');
});
