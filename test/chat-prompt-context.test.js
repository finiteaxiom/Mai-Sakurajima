'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatPromptContext } = require('../chat-prompt-context');
const { defaultMindState } = require('../intelligence');
const { defaultWorldState } = require('../world-engine');

const INSTANT = Date.parse('2026-10-19T12:00:00.000Z');

function createPromptState() {
  return {
    facts: [{
      id: 'fact-coffee',
      text: '用户喜欢喝咖啡',
      key: 'preference.drink',
      category: 'preference',
      importance: 5,
      pinned: true,
      source: 'manual',
      confidence: 1,
      evidence: '我喜欢喝咖啡',
      sourceCreatedAt: '2026-10-18T12:00:00.000Z',
      temporalStatus: 'current',
      retrievalCount: 0,
      lastRetrievedAt: ''
    }],
    episodes: [{
      id: 'episode-exam',
      title: '通过考试',
      summary: '用户通过了考试',
      category: 'achievement',
      importance: 5,
      pinned: false,
      evidence: '我通过考试了',
      sourceCreatedAt: '2026-10-18T12:00:00.000Z',
      recallCount: 0,
      lastRecalledAt: ''
    }],
    sessions: [],
    topicThreads: [],
    world: defaultWorldState(INSTANT),
    mind: defaultMindState(INSTANT),
    behaviorPatterns: [],
    lifeItems: [],
    projects: [],
    habits: [],
    people: [],
    memoryDigests: [],
    reality: { weather: null }
  };
}

function createContextHarness() {
  let state = createPromptState();
  let dataGeneration = 3;
  const settings = {
    deepseek: {
      memoryEnabled: true,
      personality: 'classic',
      girlfriendModeEnabled: false,
      customPrompt: ''
    }
  };
  const context = createChatPromptContext({
    getMemoryState: () => state,
    getSettings: () => settings,
    isDataWritable: () => true,
    getDataGeneration: () => dataGeneration,
    now: () => INSTANT,
    memoryCategories: ['identity', 'preference', 'relationship', 'goal', 'routine', 'experience', 'boundary', 'other'],
    petActions: ['idle', 'wave', 'jump', 'love', 'angry', 'sleep', 'lazy', 'study', 'work', 'snack'],
    petEmotions: ['neutral', 'happy', 'curious', 'shy', 'concerned', 'angry', 'sleepy', 'focused']
  });
  return {
    context,
    getState: () => state,
    settings,
    setState: (value) => { state = value; },
    advanceGeneration: () => { dataGeneration += 1; }
  };
}

test('Prompt rendering is read-only and its final render plan commits retrieval metadata once', () => {
  const harness = createContextHarness();
  const before = structuredClone(harness.getState());
  const messages = [{ role: 'user', content: '我喜欢喝咖啡，也想聊聊通过考试的事。' }];
  const discarded = harness.context.renderSystemPrompt(true, messages, '', '', 'chat-a');
  const final = harness.context.renderSystemPrompt(true, messages, '', '', 'chat-a');

  assert.deepEqual(harness.getState(), before, 'rendering does not mutate shared state');
  assert.deepEqual(final.sections.map(({ name }) => name), [
    'core_system',
    'persona_guidance',
    'personality_profile',
    'structured_reply_contract',
    'world_state',
    'mind_state',
    'memory_context',
    'episode_context',
    'current_time'
  ]);
  assert.match(final.text, /用户喜欢喝咖啡/);
  assert.match(final.text, /我通过考试了/);
  assert.deepEqual(final.contextMutation.factIds, ['fact-coffee']);
  assert.deepEqual(final.contextMutation.episodeIds, ['episode-exam']);

  assert.equal(harness.context.commitRenderedContext(final.contextMutation), true);
  assert.equal(harness.getState().facts[0].retrievalCount, 1);
  assert.equal(harness.getState().facts[0].lastRetrievedAt, new Date(INSTANT).toISOString());
  assert.equal(harness.getState().episodes[0].recallCount, 1);
  assert.equal(harness.getState().episodes[0].lastRecalledAt, new Date(INSTANT).toISOString());
  assert.deepEqual(harness.getState().world, discarded.contextMutation.worldState);
  assert.equal(harness.context.commitRenderedContext(final.contextMutation), false, 'a plan cannot be committed twice');
});

test('a stale Prompt render cannot commit after the persisted product state is replaced', () => {
  const harness = createContextHarness();
  const rendered = harness.context.renderSystemPrompt(true, [{ role: 'user', content: '咖啡和考试' }]);
  harness.setState(createPromptState());
  harness.advanceGeneration();

  assert.throws(() => harness.context.commitRenderedContext(rendered.contextMutation), {
    code: 'CHAT_CONTEXT_STATE_STALE'
  });
  assert.equal(harness.getState().facts[0].retrievalCount, 0);
  assert.equal(harness.getState().episodes[0].recallCount, 0);
});
