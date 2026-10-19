'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ChatRequestService } = require('../chat-request-service');
const { createChatRequestLifecycle } = require('../chat-request-lifecycle');
const { ChatService } = require('../chat-service');
const { createChatTurnStateWriter } = require('../chat-turn-state');
const { createConversationState } = require('../conversation-state');
const { writeJsonAtomic } = require('../json-persistence');
const { createChatTurnCoordinator } = require('../renderer/chat-turn-coordinator');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function reply(content) {
  return {
    rawContent: JSON.stringify({ reply: content, memories: [], commitments: [] }),
    finishReason: 'stop',
    model: 'fake-model',
    usage: {}
  };
}

function createFakeStream({ resolveOnCancel = true, resolveOnFinish = false } = {}) {
  const done = deferred();
  const finished = deferred();
  const deltas = [];
  return {
    done: done.promise,
    finished: finished.promise,
    deltas,
    cancelled: false,
    finish(content) {
      this.finalContent = content;
      finished.resolve();
      if (resolveOnFinish) done.resolve(true);
    },
    push(delta) { deltas.push(delta); },
    cancel() {
      this.cancelled = true;
      if (resolveOnCancel) done.resolve(false);
    },
    resolveDone() { done.resolve(true); }
  };
}

function createIntegrationHarness(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-chat-turn-coordinator-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const persistedPath = path.join(directory, 'memory.json');
  let idSequence = 0;
  let memoryState = {
    activeSessionId: 'chat-a',
    sessions: [
      { id: 'chat-a', title: 'A', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', messages: [] },
      {
        id: 'chat-b', title: 'B', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
        messages: [{ id: 'b-existing', role: 'assistant', content: 'B 的既有记录', createdAt: '2026-01-02T00:00:00.000Z' }]
      }
    ]
  };
  writeJsonAtomic(persistedPath, memoryState);
  const conversationState = createConversationState({
    createSession: () => ({
      id: `chat-${++idSequence}`,
      title: '新对话',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    }),
    sessionTitleFromMessages: (messages) => messages.find((message) => message.role === 'user')?.content.slice(0, 40) || '新对话',
    maxSessions: 50,
    maxMessages: 2000
  });
  const writer = createChatTurnStateWriter({
    getMemoryState: () => memoryState,
    setMemoryState: (state) => { memoryState = state; },
    conversationState,
    createId: () => `message-${++idSequence}`,
    saveMemory: () => {}
  });
  const providerHandlers = [];
  const providerRequests = [];
  const rendererStates = [];
  const renderedView = { sessionId: '', conversation: [], nodes: [], errors: [], projectedReplies: [], metadataRefreshes: [] };
  let coordinator = null;
  let lifecycleSequence = 0;
  const lifecycle = createChatRequestLifecycle({ createId: () => `main-request-${++lifecycleSequence}` });
  const senderId = 'test-renderer';
  const sanitizeMessages = (messages) => (Array.isArray(messages) ? messages : []).map((message) => ({
    role: String(message?.role || ''),
    content: String(message?.content || '')
  }));
  const modelGateway = {
    generate: (request) => runProvider(request),
    stream: (request) => runProvider(request)
  };
  async function runProvider(request) {
    providerRequests.push(request);
    const handler = providerHandlers.shift();
    if (!handler) return reply('默认回复');
    return handler(request);
  }
  const requestService = new ChatRequestService({
    modelGateway,
    sanitizeMessages,
    buildSystemPrompt: () => '确定性测试 Prompt',
    realityContext: async () => '',
    estimateTokenCount: (value) => String(value).length,
    trimMessagesToTokenBudget: (messages) => messages,
    saveContextState: () => {},
    parseStructuredReply: (raw) => {
      const parsed = JSON.parse(raw);
      return { ...parsed, content: parsed.reply };
    },
    inferActionFromText: () => ({ action: 'wave', emotion: 'happy' }),
    emptyResponseMessage: () => 'fake provider returned no response',
    maxPromptTokens: 100000,
    maxContextMessages: 1000
  });
  const chatService = new ChatService({
    sanitizeMessages,
    directReply: async () => null,
    requestReply: (messages, options) => requestService.request(messages, options),
    noteUserReply: () => {},
    appendConversationHistory: writer.appendConversationHistory,
    applyReplyState: () => {},
    mergeCommitments: () => ({ changed: false }),
    extractExplicitMemories: () => [],
    mergeCandidateMemories: () => {},
    captureTurnState: () => structuredClone(memoryState),
    restoreTurnState: (state) => { memoryState = state; },
    saveTurnState: () => writeJsonAtomic(persistedPath, memoryState),
    broadcastLifeHubState: () => {},
    publicSessions: () => memoryState.sessions.map(({ id, title }) => ({ id, title }))
  });
  const api = {
    async sendChat(input) {
      const messages = sanitizeMessages(input?.messages);
      const sessionId = String(input?.sessionId || memoryState.activeSessionId);
      const request = lifecycle.begin({ sessionId, senderId });
      const rendererRequestId = String(input?.requestId || '');
      const onDelta = input?.voiceMode === true
        ? (delta) => {
            if (request.isCurrent()) coordinator?.handleVoiceStreamDelta({ requestId: rendererRequestId, delta });
          }
        : null;
      try {
        return await chatService.send({
          ...input,
          messages,
          sessionId,
          requestId: request.requestId,
          signal: request.signal,
          assertRequestCurrent: request.assertCurrent,
          onDelta
        });
      } catch (error) {
        if (request.status === 'cancelled' || request.signal.aborted) {
          return { cancelled: true, sessionId, requestId: request.requestId, sessions: chatService.dependencies.publicSessions() };
        }
        throw error;
      } finally {
        request.finish();
      }
    },
    async cancelChatRequest(sessionId) {
      return { cancelled: lifecycle.cancelSessionForSender(sessionId, senderId, 'cancelled') };
    },
    async getChatState() { return publicChatState(); }
  };
  function publicChatState() {
    const session = conversationState.getSession(memoryState, memoryState.activeSessionId);
    return {
      activeSessionId: memoryState.activeSessionId,
      sessions: memoryState.sessions.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })),
      messages: session ? structuredClone(session.messages) : []
    };
  }
  coordinator = createChatTurnCoordinator({
    api,
    onStateChange: (state) => rendererStates.push(state),
    onApplyChatState: (state) => {
      renderedView.sessionId = state.activeSessionId;
      renderedView.conversation = structuredClone(state.messages || []);
      renderedView.nodes = renderedView.conversation.map((message) => ({ ...message }));
    },
    onApplySessionMetadata: (state) => {
      renderedView.metadataRefreshes.push({
        sessionId: state.activeSessionId,
        sessions: structuredClone(state.sessions || [])
      });
    }
  });
  coordinator.applyChatState(publicChatState());

  function selectChatSession(sessionId) {
    const previousSessionId = memoryState.activeSessionId;
    if (previousSessionId !== sessionId) lifecycle.cancelSession(previousSessionId, 'session_switched');
    assert.ok(conversationState.activateSession(memoryState, sessionId));
    writeJsonAtomic(persistedPath, memoryState);
    coordinator.applyChatState(publicChatState());
  }

  function activateMainSession(sessionId) {
    assert.ok(conversationState.activateSession(memoryState, sessionId));
    writeJsonAtomic(persistedPath, memoryState);
  }

  function queueProvider(handler) { providerHandlers.push(handler); }

  function startRendererTurn({ content, voiceMode = false, stream = null, voiceIsCurrent = () => true, requestId = `renderer-${++idSequence}` }) {
    const turnConversation = renderedView.conversation;
    const optimisticMessage = { role: 'user', content };
    const optimisticNode = { role: 'user', content };
    const pendingNode = { role: 'pending' };
    turnConversation.push(optimisticMessage);
    renderedView.nodes.push(optimisticNode, pendingNode);
    let pendingRemoved = false;
    const removePending = () => {
      if (pendingRemoved) return;
      pendingRemoved = true;
      renderedView.nodes = renderedView.nodes.filter((node) => node !== pendingNode);
    };
    const removeOptimistic = () => {
      const index = turnConversation.indexOf(optimisticMessage);
      if (index >= 0) turnConversation.splice(index, 1);
      renderedView.nodes = renderedView.nodes.filter((node) => node !== optimisticNode);
    };
    const turn = coordinator.beginTurn({
      sessionId: coordinator.getState().sessionId,
      requestId,
      conversation: turnConversation,
      voiceIsCurrent,
      removeOptimistic,
      removePending,
      stream
    });
    assert.ok(turn, 'current Renderer should reserve the turn before sending');
    const promise = coordinator.runTurn(turn, {
      send: () => api.sendChat({
        sessionId: turn.sessionId,
        messages: turnConversation,
        voiceMode,
        requestId: turn.requestId
      }),
      onReply: (result, currentTurn) => {
        if (!currentTurn.isCurrent()) return;
        const assistant = { role: 'assistant', content: result.content };
        turnConversation.push(assistant);
        renderedView.nodes.push(assistant);
        renderedView.projectedReplies.push({ sessionId: currentTurn.sessionId, content: result.content });
      },
      onError: (error) => renderedView.errors.push(String(error?.message || error))
    });
    return { turn, promise, conversation: turnConversation, optimisticMessage, pendingNode };
  }

  return {
    api,
    chatService,
    coordinator,
    lifecycle,
    memoryState: () => memoryState,
    persistedState: () => JSON.parse(fs.readFileSync(persistedPath, 'utf8')),
    providerRequests,
    queueProvider,
    renderedView,
    rendererStates,
    selectChatSession,
    activateMainSession,
    startRendererTurn
  };
}

test('switching sessions before a signal-ignoring fake provider returns cleans the old view and blocks late deltas', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerStarted = deferred();
  const providerGate = deferred();
  const stream = createFakeStream();
  harness.queueProvider(async (request) => {
    providerStarted.resolve(request);
    await providerGate.promise;
    assert.equal(request.signal.aborted, true, 'the fake provider intentionally ignores the Main abort signal');
    request.onDelta?.('A 的迟到增量');
    return reply('A 的迟到回复');
  });
  const oldTurn = harness.startRendererTurn({ content: 'A 的用户消息', voiceMode: true, stream });
  await providerStarted.promise;

  harness.selectChatSession('chat-b');
  assert.equal(stream.cancelled, true);
  assert.deepEqual(harness.renderedView.nodes.map((node) => node.content || node.role), ['B 的既有记录']);
  assert.deepEqual(harness.renderedView.conversation.map((message) => message.content), ['B 的既有记录']);

  providerGate.resolve();
  await oldTurn.promise;
  assert.deepEqual(harness.persistedState().sessions.find((session) => session.id === 'chat-a').messages, []);
  assert.deepEqual(stream.deltas, []);
  assert.deepEqual(harness.renderedView.projectedReplies, []);
  assert.equal(harness.coordinator.getState().sessionId, 'chat-b');
});

test('switching while stream.done is pending preserves the committed old session and never projects into the new one', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerStarted = deferred();
  const stream = createFakeStream();
  harness.queueProvider(async () => {
    providerStarted.resolve();
    return reply('A 已提交的回复');
  });
  const oldTurn = harness.startRendererTurn({ content: 'A 的已提交用户消息', voiceMode: true, stream });
  await providerStarted.promise;
  await stream.finished;

  const savedA = harness.persistedState().sessions.find((session) => session.id === 'chat-a');
  assert.deepEqual(savedA.messages.map((message) => [message.role, message.content]), [
    ['user', 'A 的已提交用户消息'],
    ['assistant', 'A 已提交的回复']
  ]);
  harness.selectChatSession('chat-b');
  await oldTurn.promise;

  assert.equal(stream.cancelled, true);
  assert.deepEqual(harness.renderedView.nodes.map((node) => node.content || node.role), ['B 的既有记录']);
  assert.deepEqual(harness.renderedView.projectedReplies, []);
  assert.equal(harness.persistedState().sessions.find((session) => session.id === 'chat-a').messages.length, 2);
});

test('confirmed stop removes old optimistic context before resend and an abort-ignoring failure cannot finish the new turn', async (t) => {
  const harness = createIntegrationHarness(t);
  const firstStarted = deferred();
  const firstGate = deferred();
  const secondStarted = deferred();
  const secondGate = deferred();
  harness.queueProvider(async (request) => {
    firstStarted.resolve(request);
    await firstGate.promise;
    assert.equal(request.signal.aborted, true);
    throw new Error('late fake provider failure');
  });
  harness.queueProvider(async (request) => {
    secondStarted.resolve(request);
    await secondGate.promise;
    return reply('新一轮回复');
  });
  const firstTurn = harness.startRendererTurn({ content: '已停止的旧消息' });
  await firstStarted.promise;

  const cancellation = await harness.coordinator.cancelCurrentTurn();
  assert.equal(cancellation.cancelled, true);
  assert.deepEqual(firstTurn.conversation.map((message) => message.content), []);
  assert.deepEqual(harness.renderedView.nodes, []);

  const secondTurn = harness.startRendererTurn({ content: '停止后的新消息' });
  const secondRequest = await secondStarted.promise;
  const sentUserMessages = secondRequest.messages.filter((message) => message.role === 'user').map((message) => message.content);
  assert.deepEqual(sentUserMessages, ['停止后的新消息']);
  assert.notEqual(harness.coordinator.getState().activeTurnToken, firstTurn.turn.token);

  firstGate.resolve();
  await firstTurn.promise;
  assert.equal(harness.coordinator.getState().activeTurnToken, secondTurn.turn.token);
  assert.deepEqual(harness.renderedView.nodes.map((node) => node.content || node.role), ['停止后的新消息', 'pending']);

  secondGate.resolve();
  await secondTurn.promise;
  assert.deepEqual(harness.renderedView.projectedReplies, [{ sessionId: 'chat-a', content: '新一轮回复' }]);
  assert.equal(harness.coordinator.getState().busy, false);
  assert.equal(harness.persistedState().sessions.find((session) => session.id === 'chat-a').messages.some((message) => message.content === '已停止的旧消息'), false);
});

test('session switch invalidates a pending cancellation acknowledgement without restoring old controls', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerGate = deferred();
  const providerStarted = deferred();
  const cancelGate = deferred();
  const cancelStarted = deferred();
  harness.queueProvider(async () => {
    providerStarted.resolve();
    await providerGate.promise;
    return reply('不应显示的旧回复');
  });
  const originalCancel = harness.api.cancelChatRequest;
  harness.api.cancelChatRequest = async (sessionId) => {
    cancelStarted.resolve();
    await cancelGate.promise;
    return originalCancel(sessionId);
  };
  const oldTurn = harness.startRendererTurn({ content: '旧消息' });
  await providerStarted.promise;
  const cancelResultPromise = harness.coordinator.cancelCurrentTurn();
  await cancelStarted.promise;

  harness.selectChatSession('chat-b');
  const statesAfterSwitch = harness.rendererStates.length;
  cancelGate.resolve();
  await cancelResultPromise;
  providerGate.resolve();
  await oldTurn.promise;

  assert.equal(harness.coordinator.getState().sessionId, 'chat-b');
  assert.equal(harness.coordinator.getState().busy, false);
  assert.deepEqual(harness.renderedView.nodes.map((node) => node.content || node.role), ['B 的既有记录']);
  assert.deepEqual(harness.renderedView.projectedReplies, []);
  assert.equal(harness.rendererStates.length, statesAfterSwitch, 'late cancel completion must not republish state');
});

test('hangup and redial isolate generations, streams, and late replies', async (t) => {
  const harness = createIntegrationHarness(t);
  const firstGate = deferred();
  const firstStarted = deferred();
  const secondStarted = deferred();
  const secondGate = deferred();
  const firstStream = createFakeStream();
  const secondStream = createFakeStream({ resolveOnFinish: true });
  let voiceGeneration = 1;
  let voiceActive = true;
  harness.queueProvider(async (request) => {
    firstStarted.resolve(request);
    await firstGate.promise;
    request.onDelta?.('旧通话迟到增量');
    return reply('旧通话迟到回复');
  });
  harness.queueProvider(async (request) => {
    secondStarted.resolve(request);
    await secondGate.promise;
    return reply('新通话回复');
  });
  const firstTurn = harness.startRendererTurn({
    content: '旧通话消息',
    voiceMode: true,
    stream: firstStream,
    voiceIsCurrent: () => voiceActive && voiceGeneration === 1,
    requestId: 'voice-old'
  });
  await firstStarted.promise;

  voiceActive = false;
  voiceGeneration += 1;
  const cancelled = await harness.coordinator.cancelCurrentTurn();
  assert.equal(cancelled.cancelled, true);
  voiceActive = true;
  voiceGeneration += 1;
  const secondTurn = harness.startRendererTurn({
    content: '新通话消息',
    voiceMode: true,
    stream: secondStream,
    voiceIsCurrent: () => voiceActive && voiceGeneration === 3,
    requestId: 'voice-new'
  });
  await secondStarted.promise;

  firstGate.resolve();
  await firstTurn.promise;
  assert.deepEqual(firstStream.deltas, []);
  assert.equal(harness.coordinator.getState().activeTurnToken, secondTurn.turn.token);
  assert.equal(harness.coordinator.getVoiceStream(), secondStream);

  secondGate.resolve();
  await secondTurn.promise;
  assert.deepEqual(harness.renderedView.projectedReplies, [{ sessionId: 'chat-a', content: '新通话回复' }]);
  assert.equal(harness.coordinator.getState().busy, false);
});

test('dispose is idempotent and late cancel, state, reply, and stream completions cannot write the view', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerGate = deferred();
  const providerStarted = deferred();
  const getStateGate = deferred();
  const getStateStarted = deferred();
  const stream = createFakeStream({ resolveOnCancel: false });
  const originalCancel = harness.api.cancelChatRequest;
  harness.api.cancelChatRequest = async () => ({ cancelled: false });
  harness.api.getChatState = async () => {
    getStateStarted.resolve();
    return getStateGate.promise;
  };
  harness.queueProvider(async () => {
    providerStarted.resolve();
    await providerGate.promise;
    return reply('dispose 后迟到的回复');
  });
  let detachCount = 0;
  harness.coordinator.addDisposer(() => { detachCount += 1; });
  const turn = harness.startRendererTurn({ content: 'dispose 测试消息', voiceMode: true, stream });
  await providerStarted.promise;
  const cancel = harness.coordinator.cancelCurrentTurn();
  await getStateStarted.promise;

  const stateCountBeforeDispose = harness.rendererStates.length;
  assert.equal(harness.coordinator.dispose(), true);
  assert.equal(harness.coordinator.dispose(), false);
  assert.equal(detachCount, 1);
  assert.deepEqual(harness.renderedView.nodes, [], 'dispose synchronously clears its own optimistic and pending UI nodes');
  getStateGate.resolve({ activeSessionId: 'chat-a', sessions: [], messages: [{ role: 'assistant', content: '迟到状态' }] });
  providerGate.resolve();
  await Promise.all([cancel, turn.promise]);

  assert.deepEqual(harness.renderedView.nodes, []);
  assert.deepEqual(harness.renderedView.projectedReplies, []);
  assert.equal(harness.rendererStates.length, stateCountBeforeDispose, 'dispose blocks late state/control callbacks');
  assert.equal(stream.cancelled, true);
  assert.equal(harness.coordinator.getState().disposed, true);
  harness.api.cancelChatRequest = originalCancel;
});

test('same-session full hydration invalidates an active view turn and blocks its late provider reply', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerStarted = deferred();
  const providerGate = deferred();
  harness.queueProvider(async (request) => {
    providerStarted.resolve(request);
    await providerGate.promise;
    return reply('同会话刷新后的迟到回复');
  });
  const turn = harness.startRendererTurn({ content: '刷新前的乐观消息' });
  const request = await providerStarted.promise;
  const generationBefore = harness.coordinator.getState().viewGeneration;

  harness.coordinator.applyChatState(harness.api.getChatState ? await harness.api.getChatState() : {});
  assert.ok(harness.coordinator.getState().viewGeneration > generationBefore);
  assert.equal(request.signal.aborted, true);
  assert.deepEqual(harness.renderedView.conversation, []);
  assert.deepEqual(harness.renderedView.nodes, []);

  providerGate.resolve();
  await turn.promise;
  assert.deepEqual(harness.persistedState().sessions.find((session) => session.id === 'chat-a').messages, []);
  assert.deepEqual(harness.renderedView.projectedReplies, []);
  assert.equal(harness.coordinator.getState().busy, false);
});

test('same-session hydration while stream completion is pending keeps the persisted reply exactly once', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerStarted = deferred();
  const stream = createFakeStream({ resolveOnCancel: false });
  harness.queueProvider(async () => {
    providerStarted.resolve();
    return reply('同会话刷新已提交的回复');
  });
  const turn = harness.startRendererTurn({ content: '已经提交的用户消息', voiceMode: true, stream });
  await providerStarted.promise;
  await stream.finished;

  harness.coordinator.applyChatState(await harness.api.getChatState());
  assert.deepEqual(harness.renderedView.conversation.map((message) => [message.role, message.content]), [
    ['user', '已经提交的用户消息'],
    ['assistant', '同会话刷新已提交的回复']
  ]);
  assert.equal(stream.cancelled, true);
  stream.resolveDone();
  await turn.promise;

  assert.deepEqual(harness.renderedView.projectedReplies, []);
  assert.equal(harness.renderedView.conversation.filter((message) => message.content === '同会话刷新已提交的回复').length, 1);
  assert.equal(harness.persistedState().sessions.find((session) => session.id === 'chat-a').messages.length, 2);
});

test('a late same-session getChatState completion cannot replace a newer full hydration', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerStarted = deferred();
  const stateStarted = deferred();
  const staleStateGate = deferred();
  harness.queueProvider(async () => {
    providerStarted.resolve();
    return reply('Main 已完成但 Renderer 已换视图的回复');
  });
  let cancelCount = 0;
  harness.api.cancelChatRequest = async () => {
    cancelCount += 1;
    return { cancelled: false };
  };
  harness.api.getChatState = async () => {
    stateStarted.resolve();
    return staleStateGate.promise;
  };
  const oldTurn = harness.startRendererTurn({ content: '取消状态刷新期间的旧消息' });
  await providerStarted.promise;
  const cancellation = harness.coordinator.cancelCurrentTurn();
  await stateStarted.promise;

  harness.coordinator.applyChatState({
    activeSessionId: 'chat-a',
    sessions: [{ id: 'chat-a', title: 'authoritative view' }],
    messages: [{ role: 'assistant', content: '较新的完整视图' }]
  });
  const viewAfterHydration = structuredClone(harness.renderedView.conversation);
  staleStateGate.resolve({
    activeSessionId: 'chat-a',
    sessions: [{ id: 'chat-a', title: 'stale view' }],
    messages: [{ role: 'assistant', content: '迟到的 getChatState' }]
  });
  const cancellationResult = await cancellation;
  await oldTurn.promise;

  assert.equal(cancellationResult.stale, true);
  assert.equal(cancelCount, 2, 'the replacement view also asks Main to cancel any remaining request');
  assert.deepEqual(harness.renderedView.conversation, viewAfterHydration);
  assert.deepEqual(harness.renderedView.nodes.map((node) => node.content), ['较新的完整视图']);
  assert.equal(harness.renderedView.projectedReplies.length, 0);
});

test('a cancel refresh that hydrates another Main session settles its operation and isolates the old reply', async (t) => {
  const harness = createIntegrationHarness(t);
  harness.queueProvider(async () => reply('A 已提交的旧回复'));
  const mainResult = await harness.api.sendChat({
    sessionId: 'chat-a',
    messages: [{ role: 'user', content: 'A 已提交的用户消息' }]
  });
  assert.deepEqual(harness.persistedState().sessions.find((session) => session.id === 'chat-a').messages.map((message) => message.content), [
    'A 已提交的用户消息',
    'A 已提交的旧回复'
  ]);
  harness.activateMainSession('chat-b');

  const oldConversation = harness.renderedView.conversation;
  const optimisticMessage = { role: 'user', content: 'Renderer A 的乐观消息' };
  const optimisticNode = { role: 'user', content: optimisticMessage.content };
  const pendingNode = { role: 'pending' };
  oldConversation.push(optimisticMessage);
  harness.renderedView.nodes.push(optimisticNode, pendingNode);
  const oldTurn = harness.coordinator.beginTurn({
    sessionId: 'chat-a',
    removeOptimistic: () => {
      const index = oldConversation.indexOf(optimisticMessage);
      if (index >= 0) oldConversation.splice(index, 1);
      harness.renderedView.nodes = harness.renderedView.nodes.filter((node) => node !== optimisticNode);
    },
    removePending: () => {
      harness.renderedView.nodes = harness.renderedView.nodes.filter((node) => node !== pendingNode);
    }
  });
  assert.ok(oldTurn);
  let projectedOldReplies = 0;
  const oldRendererRun = harness.coordinator.runTurn(oldTurn, {
    send: () => Promise.resolve(mainResult),
    onReply: () => { projectedOldReplies += 1; }
  });

  const cancellation = await harness.coordinator.cancelCurrentTurn();
  await oldRendererRun;

  assert.equal(cancellation.cancelled, false, 'Main has already finished the original request');
  assert.equal(harness.coordinator.getState().sessionId, 'chat-b');
  assert.equal(harness.coordinator.getState().busy, false);
  assert.equal(harness.coordinator.getState().cancellationPending, false);
  assert.equal(projectedOldReplies, 0);
  assert.deepEqual(harness.renderedView.nodes.map((node) => node.content || node.role), ['B 的既有记录']);
  assert.deepEqual(harness.persistedState().sessions.find((session) => session.id === 'chat-b').messages.map((message) => message.content), ['B 的既有记录']);

  const nextTurn = harness.coordinator.beginTurn({ sessionId: 'chat-b' });
  assert.ok(nextTurn, 'the hydrated session can immediately reserve a new Renderer turn');
  harness.coordinator.dispose();
});

test('cancel IPC failure remains visible and lets the original Main request finish as text', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerStarted = deferred();
  const providerGate = deferred();
  const errors = [];
  harness.queueProvider(async (request) => {
    providerStarted.resolve(request);
    await providerGate.promise;
    assert.equal(request.signal.aborted, false);
    return reply('取消失败后继续完成的回复');
  });
  harness.api.cancelChatRequest = async () => { throw new Error('cancel IPC failed'); };
  const turn = harness.startRendererTurn({ content: '继续运行的用户消息', voiceMode: true, stream: createFakeStream() });
  await providerStarted.promise;

  const cancellation = await harness.coordinator.cancelCurrentTurn({ onError: (error) => errors.push(error.message) });
  assert.equal(cancellation.cancelled, false);
  assert.deepEqual(errors, ['cancel IPC failed']);
  assert.equal(harness.coordinator.getState().activeTurnToken, turn.turn.token);
  assert.equal(harness.coordinator.getState().busy, true);
  assert.equal(harness.renderedView.nodes.some((node) => node.role === 'pending'), true);

  providerGate.resolve();
  await turn.promise;
  assert.deepEqual(harness.renderedView.projectedReplies, [{ sessionId: 'chat-a', content: '取消失败后继续完成的回复' }]);
  assert.equal(harness.coordinator.getState().busy, false);
});

test('a late cancel IPC failure after a session switch is silent and cannot revive the old turn', async (t) => {
  const harness = createIntegrationHarness(t);
  const providerGate = deferred();
  const providerStarted = deferred();
  const cancelStarted = deferred();
  const cancelGate = deferred();
  const errors = [];
  harness.queueProvider(async () => {
    providerStarted.resolve();
    await providerGate.promise;
    return reply('不应投影的旧会话回复');
  });
  harness.api.cancelChatRequest = async () => {
    cancelStarted.resolve();
    return cancelGate.promise;
  };
  const oldTurn = harness.startRendererTurn({ content: '旧会话消息' });
  await providerStarted.promise;
  const cancellation = harness.coordinator.cancelCurrentTurn({ onError: (error) => errors.push(error.message) });
  await cancelStarted.promise;

  harness.selectChatSession('chat-b');
  cancelGate.reject(new Error('late old-session cancellation failure'));
  await cancellation;
  providerGate.resolve();
  await oldTurn.promise;

  assert.deepEqual(errors, []);
  assert.equal(harness.coordinator.getState().sessionId, 'chat-b');
  assert.equal(harness.coordinator.getState().busy, false);
  assert.deepEqual(harness.renderedView.nodes.map((node) => node.content || node.role), ['B 的既有记录']);
  assert.deepEqual(harness.renderedView.projectedReplies, []);
});

test('metadata-only greeting refresh cannot rehydrate over a newer Chat or Voice turn', async (t) => {
  const harness = createIntegrationHarness(t);
  const metadataGate = deferred();
  const refresh = harness.coordinator.refreshSessionMetadata(() => metadataGate.promise);
  const providerStarted = deferred();
  const providerGate = deferred();
  harness.queueProvider(async () => {
    providerStarted.resolve();
    await providerGate.promise;
    return reply('新一轮回复');
  });
  const newTurn = harness.startRendererTurn({ content: '新 Chat 轮次' });
  await providerStarted.promise;

  metadataGate.resolve(await harness.api.getChatState());
  assert.equal(await refresh, false);
  assert.deepEqual(harness.renderedView.metadataRefreshes, []);
  assert.deepEqual(harness.renderedView.conversation.map((message) => message.content), ['新 Chat 轮次']);

  providerGate.resolve();
  await newTurn.promise;
  const identity = harness.coordinator.getState();
  const metadataOnly = await harness.coordinator.refreshSessionMetadata(async () => ({
    ...await harness.api.getChatState(),
    sessions: [{ id: 'chat-a', title: 'metadata-only title' }]
  }));
  assert.equal(metadataOnly, true);
  assert.equal(harness.renderedView.sessionId, 'chat-a');
  assert.deepEqual(harness.renderedView.conversation.map((message) => message.content), ['新 Chat 轮次', '新一轮回复']);
  assert.equal(harness.renderedView.metadataRefreshes.length, 1);
  assert.equal(harness.coordinator.isViewCurrent(identity), true);
});

test('stale and disposed turn handles fail closed before invoking send', async (t) => {
  const harness = createIntegrationHarness(t);
  let sendCount = 0;
  const old = harness.coordinator.beginTurn({ sessionId: 'chat-a' });
  assert.ok(old);
  harness.coordinator.applyChatState(await harness.api.getChatState());
  assert.equal(await harness.coordinator.runTurn(old, { send: async () => { sendCount += 1; } }), null);

  const current = harness.coordinator.beginTurn({ sessionId: 'chat-a' });
  assert.ok(current);
  harness.coordinator.dispose();
  assert.equal(await harness.coordinator.runTurn(current, { send: async () => { sendCount += 1; } }), null);
  assert.equal(sendCount, 0);
});
