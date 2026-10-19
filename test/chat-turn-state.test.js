'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChatService } = require('../chat-service');
const { createChatTurnStateWriter } = require('../chat-turn-state');
const { defaultMindState } = require('../intelligence');
const { defaultWorldState } = require('../world-engine');
const { createConversationState } = require('../conversation-state');
const { writeJsonAtomic } = require('../json-persistence');

function baseMemory() {
  return {
    version: 16,
    sessions: [{ id: 'chat-1', title: '新对话', createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', messages: [] }],
    activeSessionId: 'chat-1',
    facts: [], memoryCorrections: [], mind: defaultMindState(), relationship: {}, behaviorPatterns: [],
    episodes: [], topicThreads: [], people: [], projects: [], habits: [], lifeItems: [],
    world: defaultWorldState(), timeline: [], memoryDigests: [], assistant: { focusSessions: [] }
  };
}

function createWriter(state, persistPath, fileSystem = fs) {
  let persistedState = structuredClone(state.value);
  const conversationState = createConversationState({
    createSession: () => ({ id: 'chat-new', title: '新对话', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] }),
    sessionTitleFromMessages: (messages) => messages.find((item) => item.role === 'user')?.content || '新对话',
    maxSessions: 20,
    maxMessages: 200
  });
  const saveMemory = () => {
    try {
      writeJsonAtomic(persistPath, state.value, { fs: fileSystem });
      persistedState = structuredClone(state.value);
    } catch (error) {
      state.value = structuredClone(persistedState);
      throw error;
    }
  };
  const writer = createChatTurnStateWriter({
    getMemoryState: () => state.value,
    setMemoryState: (value) => { state.value = value; },
    conversationState,
    createId: (prefix) => `${prefix}-generated`,
    maxContactCount: 20,
    maxEpisodes: 100,
    maxTopicThreads: 100,
    maxPeople: 100,
    maxProjects: 100,
    maxHabits: 100,
    now: () => Date.parse('2026-10-18T00:00:01.000Z'),
    saveMemory,
    broadcastSharedLifeState: () => {},
    scheduleGirlfriendFollowUp: () => {}
  });
  return {
    ...writer,
    captureTurnState: () => structuredClone(state.value),
    restoreTurnState: (snapshot) => { state.value = snapshot; },
    saveTurnState: saveMemory
  };
}

function createChatHarness(writer, reply) {
  const messages = [];
  const service = new ChatService({
    sanitizeMessages: (value) => value,
    directReply: async () => null,
    requestReply: async () => reply,
    noteUserReply: () => {},
    appendConversationHistory: writer.appendConversationHistory,
    applyReplyState: writer.applyReplyState,
    mergeCommitments: () => {},
    extractExplicitMemories: () => [],
    mergeCandidateMemories: () => {},
    captureTurnState: writer.captureTurnState,
    restoreTurnState: writer.restoreTurnState,
    saveTurnState: writer.saveTurnState,
    broadcastLifeHubState: () => {},
    publicSessions: () => [],
    deliverReply: (value) => messages.push(value)
  });
  return { service, messages };
}

async function withHarness(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-chat-turn-state-'));
  try {
    const persistPath = path.join(directory, 'memory.json');
    const state = { value: baseMemory() };
    const writer = createWriter(state, persistPath);
    return await callback({ directory, persistPath, state, writer });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('Workspace Chat appends the real conversation but rejects every model-derived persistent candidate', async () => withHarness(async ({ persistPath, state, writer }) => {
  const marker = 'WORKSPACE_FILE_ONLY_SENTINEL_7F3A';
  const beforeMind = structuredClone(state.value.mind);
  const reply = {
    content: '我已经看完了。',
    memories: [{ text: marker, evidence: marker, category: 'experience' }],
    episodes: [{ title: marker, summary: marker, evidence: marker }],
    topics: [{ title: marker, summary: marker }],
    people: [{ name: marker, relation: '朋友', notes: marker, evidence: marker }],
    projects: [{ title: marker, summary: marker, evidence: marker }],
    habits: [{ title: marker, summary: marker, evidence: marker }],
    commitments: [{ title: marker, evidence: marker, dueAt: '2026-10-20T00:00:00.000Z' }],
    mind: { topic: marker, pendingQuestion: marker, mood: 'sad', energy: 0, intimacyDelta: 99, trustDelta: 99 }
  };
  const { service } = createChatHarness(writer, reply);
  await service.send({
    messages: [{ id: 'user-1', role: 'user', content: '请查看这个文件' }],
    sessionId: 'chat-1',
    workspaceContext: { operation: 'read', payload: { content: 'untrusted file context' } }
  });

  const persisted = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
  const longTerm = { ...persisted };
  delete longTerm.sessions;
  assert.equal(JSON.stringify(longTerm).includes(marker), false);
  assert.equal(JSON.stringify(persisted.mind).includes(marker), false);
  assert.deepEqual(persisted.mind, beforeMind);
  assert.equal(persisted.sessions[0].messages.length, 2);
  assert.equal(persisted.sessions[0].messages[0].content, '请查看这个文件');
  assert.equal(persisted.sessions[0].messages[1].content, '我已经看完了。');
  assert.equal(persisted.sessions[0].messages.every((message) => message.contextSource === 'workspace'), true);
  assert.equal(state.value.relationship.waitingSessionId, 'chat-1');
}));

test('ordinary Chat still applies real user-evidence-derived state candidates', async () => withHarness(async ({ persistPath, state, writer }) => {
  const { extractExplicitMemoryCandidates } = require('../memory-extractor');
  const candidates = extractExplicitMemoryCandidates('我最喜欢草莓蛋糕。');
  const calls = [];
  const service = new ChatService({
    sanitizeMessages: (value) => value,
    directReply: async () => null,
    requestReply: async () => ({ content: '我记住了。', memories: candidates, commitments: [] }),
    noteUserReply: () => {},
    appendConversationHistory: writer.appendConversationHistory,
    applyReplyState: async ({ messages, reply, session, workspaceContext }) => {
      calls.push({ messages, reply, session, workspaceContext });
      return writer.applyReplyState({ messages, reply, session, workspaceContext });
    },
    mergeCommitments: () => {},
    extractExplicitMemories: extractExplicitMemoryCandidates,
    mergeCandidateMemories: (values, source) => calls.push({ values, source }),
    captureTurnState: writer.captureTurnState,
    restoreTurnState: writer.restoreTurnState,
    saveTurnState: writer.saveTurnState,
    broadcastLifeHubState: () => {},
    publicSessions: () => []
  });

  await service.send({ messages: [{ role: 'user', content: '我最喜欢草莓蛋糕。' }], sessionId: 'chat-1' });
  const persisted = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].workspaceContext, null);
  assert.ok(calls[1].values.length > 0);
  assert.equal(calls[1].source.sourceText, '我最喜欢草莓蛋糕。');
  assert.equal(calls[1].source.sourceMessageId, persisted.sessions[0].messages[0].id);
  assert.equal(calls[1].values.some((item) => item.evidence && '我最喜欢草莓蛋糕。'.includes(item.evidence)), true);
}));

test('failed Main-style memory persistence rejects the Chat turn, restores committed state, and does not deliver success', async () => withHarness(async ({ persistPath, state }) => {
  const initialState = structuredClone(state.value);
  writeJsonAtomic(persistPath, state.value);
  const diskBytes = fs.readFileSync(persistPath);
  const deniedFs = Object.create(fs);
  deniedFs.renameSync = () => { throw Object.assign(new Error('disk replacement denied'), { code: 'EPERM' }); };
  const writer = createWriter(state, persistPath, deniedFs);
  const { service, messages: delivered } = createChatHarness(writer, { content: '这句不能显示为已发送。', memories: [], commitments: [] });

  await assert.rejects(service.send({
    messages: [{ role: 'user', content: '请记住本轮，但磁盘不可写。' }],
    sessionId: 'chat-1'
  }), { code: 'EPERM' });
  assert.deepEqual(fs.readFileSync(persistPath), diskBytes);
  assert.deepEqual(state.value, initialState);
  assert.deepEqual(delivered, []);
}));
