const test = require('node:test');
const assert = require('node:assert/strict');

const { ChatService } = require('../chat-service');

function createHarness(overrides = {}) {
  const calls = [];
  const session = {
    id: 'chat-1',
    messages: [
      { id: 'user-1', role: 'user', content: '记住我喜欢咖啡', createdAt: '2026-08-13T02:00:00.000Z' },
      { id: 'assistant-1', role: 'assistant', content: '好。', createdAt: '2026-08-13T02:00:01.000Z' }
    ]
  };
  const dependencies = {
    sanitizeMessages(messages) {
      calls.push('sanitize');
      return messages;
    },
    directReply: async () => null,
    requestReply: async (_messages, options) => {
      calls.push(['request', options]);
      return {
        content: '好。',
        action: 'wave',
        emotion: 'happy',
        memories: [{ text: '用户喜欢咖啡', evidence: '我喜欢咖啡' }],
        commitments: []
      };
    },
    noteUserReply() {
      calls.push('note-user-reply');
    },
    appendConversationHistory() {
      calls.push('append-history');
      return session;
    },
    applyReplyState(input) {
      calls.push(['apply-reply-state', input]);
    },
    mergeCommitments(_items, source) {
      calls.push(['merge-commitments', source]);
    },
    extractExplicitMemories(text) {
      calls.push(['extract-memory', text]);
      return [{ text: '用户喜欢咖啡', evidence: '喜欢咖啡' }];
    },
    mergeCandidateMemories(items, source) {
      calls.push(['merge-memories', items, source]);
    },
    captureTurnState() { calls.push('capture-turn-state'); return {}; },
    restoreTurnState() { calls.push('restore-turn-state'); },
    saveTurnState() { calls.push('save-turn-state'); },
    broadcastLifeHubState() {
      calls.push('broadcast-life-hub');
    },
    publicSessions() {
      return [{ id: session.id }];
    },
    deliverReply(reply) {
      calls.push(['deliver-reply', reply]);
    },
    ...overrides
  };
  return { service: new ChatService(dependencies), calls, session };
}

test('Chat service owns the complete ordinary Chat turn without Agent state', async () => {
  const { service, calls } = createHarness();
  const result = await service.send({
    messages: [{ role: 'user', content: '记住我喜欢咖啡' }],
    sessionId: 'chat-1'
  });

  assert.equal(result.runtimeMode, 'chat');
  assert.equal(result.sessionId, 'chat-1');
  assert.equal(result.lastRun, null);
  assert.equal(result.taskState, null);
  assert.deepEqual(result.sessions, [{ id: 'chat-1' }]);
  assert.deepEqual(calls.slice(0, 4).map((entry) => Array.isArray(entry) ? entry[0] : entry), [
    'sanitize',
    'request',
    'capture-turn-state',
    'note-user-reply'
  ]);
  assert.ok(calls.indexOf('save-turn-state') < calls.findIndex((entry) => Array.isArray(entry) && entry[0] === 'deliver-reply'));
  assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === 'merge-memories'));
  assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === 'deliver-reply'));
});

test('Chat service preserves local replies and never contacts the model', async () => {
  let modelCalls = 0;
  const { service } = createHarness({
    directReply: async () => ({
      content: '现在是十点。',
      action: 'wave',
      emotion: 'happy',
      memories: [],
      commitments: [],
      localTimeAnswer: true
    }),
    requestReply: async () => {
      modelCalls += 1;
      throw new Error('model should not be called');
    }
  });

  const result = await service.send({ messages: [{ role: 'user', content: '现在几点？' }] });
  assert.equal(result.localTimeAnswer, true);
  assert.equal(modelCalls, 0);
});

test('Chat service forwards voice streaming options while keeping Chat semantics', async () => {
  let requestOptions;
  const onDelta = () => {};
  const voiceProfile = { description: '语气平静' };
  const { service } = createHarness({
    requestReply: async (_messages, options) => {
      requestOptions = options;
      return { content: '我在听。', memories: [], commitments: [] };
    }
  });

  const result = await service.send({
    messages: [{ role: 'user', content: '喂？' }],
    voiceMode: true,
    voiceProfile,
    onDelta,
    responseInstruction: '自然地说话。'
  });
  assert.equal(requestOptions.maxTokens, 360);
  assert.equal(requestOptions.onDelta, onDelta);
  assert.equal(requestOptions.structured, true);
  assert.equal(result.voiceMode, true);
  assert.equal(result.voiceProfile, voiceProfile);
  assert.equal(result.runtimeMode, 'chat');
});

test('Chat service forwards internal request diagnostics without changing Chat behavior', async () => {
  let requestOptions;
  const diagnostic = {
    turnId: 'turn-7',
    requestId: 'turn-7-main',
    requestPurpose: 'chat_response',
    caller: 'ChatService.send'
  };
  const { service } = createHarness({
    requestReply: async (_messages, options) => {
      requestOptions = options;
      return { content: '我在。', memories: [], commitments: [] };
    }
  });
  await service.send({ messages: [{ role: 'user', content: '在吗？' }], diagnostic });
  assert.deepEqual(requestOptions.diagnostic, diagnostic);
  assert.equal(requestOptions.structured, true);
});

test('Chat service keeps Workspace context ephemeral and skips long-term memory writes', async () => {
  const workspaceContext = { operation: 'read', payload: { kind: 'workspace_file', relativePath: 'README.md', content: 'untrusted' } };
  const { service, calls } = createHarness();
  await service.send({ messages: [{ role: 'user', content: '看看 README' }], workspaceContext });
  const request = calls.find((entry) => Array.isArray(entry) && entry[0] === 'request');
  assert.equal(request[1].workspaceContext, workspaceContext);
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === 'merge-memories'), false);
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === 'merge-commitments'), false);
  assert.ok(calls.includes('append-history'));
});

test('Chat service does not persist a fabricated assistant reply after model failure', async () => {
  let appended = false;
  const { service } = createHarness({
    requestReply: async () => {
      throw new Error('network failed');
    },
    appendConversationHistory() {
      appended = true;
    }
  });

  await assert.rejects(
    service.send({ messages: [{ role: 'user', content: '你好' }] }),
    /network failed/
  );
  assert.equal(appended, false);
});

test('Chat service rejects a stale completion before conversation or domain state writes', async () => {
  const controller = new AbortController();
  const reason = Object.assign(new Error('request canceled'), { code: 'CHAT_REQUEST_CANCELLED' });
  let resolveRequest;
  let writes = 0;
  const { service } = createHarness({
    requestReply: () => new Promise((resolve) => { resolveRequest = resolve; }),
    appendConversationHistory() { writes += 1; },
    noteUserReply() { writes += 1; },
    applyReplyState() { writes += 1; },
    mergeCommitments() { writes += 1; },
    mergeCandidateMemories() { writes += 1; },
    saveTurnState() { writes += 1; }
  });
  const pending = service.send({
    messages: [{ role: 'user', content: '请回答' }],
    sessionId: 'chat-1',
    signal: controller.signal,
    assertRequestCurrent() {
      if (controller.signal.aborted) throw controller.signal.reason;
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(reason);
  resolveRequest({ content: '这句晚到回复不能保存。', memories: [], commitments: [] });
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(writes, 0);
});

test('Chat service rejects missing application dependencies at composition time', () => {
  assert.throws(() => new ChatService(), /sanitizeMessages/);
});
