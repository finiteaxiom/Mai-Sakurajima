const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationState, normalizeActiveSessionId } = require('../conversation-state');

function createHarness({ maxSessions = 3, maxMessages = 2 } = {}) {
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
    maxSessions,
    maxMessages
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

test('proactive messages append to the requested session without deleting older history', () => {
  const { conversation, state } = createHarness({ maxMessages: 3 });
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

  assert.deepEqual(session.messages.map((message) => message.id), ['old', 'newer', 'proactive']);
  assert.equal(state.activeSessionId, 'session-1');
});

test('conversation history over the new-write limit remains intact and additional writes are rejected', () => {
  const { conversation, state } = createHarness();
  state.sessions = [{
    id: 'over-limit', title: '旧对话', createdAt: '', updatedAt: '',
    messages: [
      { id: 'one', role: 'user', content: '旧消息', createdAt: '' },
      { id: 'two', role: 'assistant', content: '旧回复', createdAt: '' }
    ]
  }];
  state.activeSessionId = 'over-limit';

  assert.throws(() => conversation.appendConversationTurn(state, {
    sessionId: 'missing-session',
    userMessage: { id: 'new-user', role: 'user', content: '新问题', createdAt: '' },
    assistantMessage: { id: 'new-assistant', role: 'assistant', content: '新回复', createdAt: '' },
    updatedAt: ''
  }), { code: 'CHAT_SESSION_UNAVAILABLE' });
  assert.equal(state.sessions[0].messages.length, 2);

  const tinyLimit = createConversationState({
    createSession: () => ({ id: 'new', title: '新对话', messages: [] }),
    sessionTitleFromMessages: () => '新对话',
    maxSessions: 1,
    maxMessages: 2
  });
  assert.throws(() => tinyLimit.appendConversationTurn(state, {
    sessionId: 'over-limit',
    userMessage: { id: 'new-user', role: 'user', content: '新问题', createdAt: '' },
    assistantMessage: { id: 'new-assistant', role: 'assistant', content: '新回复', createdAt: '' },
    updatedAt: ''
  }), { code: 'CHAT_HISTORY_LIMIT_REACHED' });
  assert.deepEqual(state.sessions[0].messages.map((message) => message.id), ['one', 'two']);
});

test('new conversation session is rejected instead of evicting an existing session', () => {
  const { conversation, state } = createHarness();
  state.sessions = [
    { id: 'active', title: '旧对话', messages: [{ id: 'm1', role: 'user', content: '保留' }] },
    { id: 'other', title: '另一段', messages: [{ id: 'm2', role: 'user', content: '也保留' }] }
  ];
  state.activeSessionId = 'active';
  const limited = createConversationState({
    createSession: () => ({ id: 'new', title: '新对话', messages: [] }),
    sessionTitleFromMessages: () => '新对话',
    maxSessions: 2,
    maxMessages: 10
  });

  assert.throws(() => limited.createNewSession(state), { code: 'CHAT_SESSION_LIMIT_REACHED' });
  assert.deepEqual(state.sessions.map((session) => session.id), ['active', 'other']);
});

test('Chat rejects overlong new messages while preserving historical text', () => {
  const { conversation, state } = createHarness();
  const session = conversation.ensureActiveSession(state);
  const oversized = 'x'.repeat(12001);
  assert.throws(() => conversation.assertCanAppendTurn(state, {
    sessionId: session.id,
    userMessage: { content: oversized }
  }), { code: 'CHAT_MESSAGE_TOO_LARGE' });
  assert.throws(() => conversation.appendConversationTurn(state, {
    sessionId: session.id,
    userMessage: { id: 'user', role: 'user', content: '短问题' },
    assistantMessage: { id: 'assistant', role: 'assistant', content: oversized },
    updatedAt: ''
  }), { code: 'CHAT_MESSAGE_TOO_LARGE' });
  assert.equal(session.messages.length, 0);
});
