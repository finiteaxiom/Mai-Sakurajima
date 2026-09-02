const test = require('node:test');
const assert = require('node:assert/strict');

const {
  defaultMindState,
  markUserReturned,
  normalizeMindState,
  updateMindAfterTurn
} = require('../intelligence');
const {
  applyMindTurn,
  beginRelationshipWaiting,
  clearRelationshipWaiting,
  incrementRelationshipFollowUp,
  markMindUserReturned,
  normalizeRelationship,
  normalizeRelationshipState,
  recordCompanionMessage,
  recordProactiveGreeting,
  recordProactiveReason,
  recordRelationshipUserReply,
  resetMind
} = require('../companion-state');

const MAX_FOLLOW_UPS = 999;

function createState(overrides = {}) {
  return {
    version: 16,
    mind: defaultMindState(),
    relationship: {
      waitingSince: 0,
      waitingSessionId: '',
      lastUserMessageAt: 0,
      lastCompanionMessageAt: 0,
      followUpCount: 0
    },
    facts: [{ id: 'fact-1', text: '用户喜欢咖啡' }],
    sessions: [{ id: 'session-1', messages: [] }],
    behaviorPatterns: [{ id: 'late_sleep', confidence: 0.38 }],
    ...overrides
  };
}

test('chat turn uses the existing Mind decision unchanged and starts relationship waiting', () => {
  const state = createState();
  const now = Date.parse('2026-08-20T12:00:00.000Z');
  const input = {
    userMessage: '今天工作有点累。',
    reply: { content: '先缓一缓。', emotion: 'concerned', mind: { topic: '工作' } },
    topic: '工作',
    now
  };
  const expectedMind = updateMindAfterTurn(state.mind, input);
  const expectedRelationship = {
    ...normalizeRelationshipState(state.relationship, MAX_FOLLOW_UPS),
    waitingSince: now,
    waitingSessionId: 'session-1',
    lastUserMessageAt: now,
    lastCompanionMessageAt: now,
    followUpCount: 0
  };

  beginRelationshipWaiting(state, expectedRelationship, MAX_FOLLOW_UPS);
  applyMindTurn(state, input);

  assert.deepEqual(state.mind, expectedMind);
  assert.deepEqual(state.relationship, expectedRelationship);
  assert.equal(state.mind.intimacy, defaultMindState().intimacy);
  assert.equal(state.mind.trust, defaultMindState().trust);
});

test('meaningful relationship deltas retain the existing bounded Mind calculation', () => {
  const state = createState({ mind: { ...defaultMindState(), intimacy: 99.98, trust: 99.98 } });
  const input = {
    userMessage: '你真的一直记得我说过的话。',
    reply: {
      content: '我当然会记得。',
      emotion: 'happy',
      mind: { intimacyDelta: 10, trustDelta: 10 }
    },
    now: Date.parse('2026-08-20T13:00:00.000Z')
  };
  const expected = updateMindAfterTurn(state.mind, input);

  applyMindTurn(state, input);

  assert.deepEqual(state.mind, expected);
  assert.equal(state.mind.intimacy, 100);
  assert.equal(state.mind.trust, 100);
});

test('proactive updates preserve greeting and reason behavior without touching other memory domains', () => {
  const state = createState({ mind: { ...defaultMindState(), dailyProactiveDate: '2026-08-20', dailyProactiveCount: 2 } });
  const factsBefore = structuredClone(state.facts);
  const sessionsBefore = structuredClone(state.sessions);
  const patternsBefore = structuredClone(state.behaviorPatterns);

  recordProactiveGreeting(state, Date.parse('2026-08-20T14:00:00.000Z'), '2026-08-20');
  recordProactiveReason(state, 'continue_topic');

  assert.equal(state.mind.lastProactiveAt, Date.parse('2026-08-20T14:00:00.000Z'));
  assert.equal(state.mind.dailyProactiveCount, 3);
  assert.deepEqual(state.mind.recentProactiveReasons, ['continue_topic']);
  assert.deepEqual(state.facts, factsBefore);
  assert.deepEqual(state.sessions, sessionsBefore);
  assert.deepEqual(state.behaviorPatterns, patternsBefore);
  assert.equal(state.version, 16);
});

test('girlfriend follow-up relationship updates retain waiting state and valid count bounds', () => {
  const state = createState();
  beginRelationshipWaiting(state, {
    waitingSince: 1000,
    waitingSessionId: 'session-1',
    lastCompanionMessageAt: 0,
    followUpCount: 0
  }, MAX_FOLLOW_UPS);
  recordCompanionMessage(state, 2000, MAX_FOLLOW_UPS);
  incrementRelationshipFollowUp(state, MAX_FOLLOW_UPS);
  incrementRelationshipFollowUp(state, MAX_FOLLOW_UPS);

  assert.deepEqual(state.relationship, {
    waitingSince: 1000,
    waitingSessionId: 'session-1',
    lastUserMessageAt: 0,
    lastCompanionMessageAt: 2000,
    followUpCount: 2
  });

  state.relationship.followUpCount = Number.MAX_SAFE_INTEGER;
  incrementRelationshipFollowUp(state, MAX_FOLLOW_UPS);
  assert.equal(state.relationship.followUpCount, MAX_FOLLOW_UPS);
});

test('user reply and settings-style resets preserve the existing relationship reset fields', () => {
  const state = createState({
    relationship: {
      waitingSince: 1000,
      waitingSessionId: 'session-1',
      lastUserMessageAt: 900,
      lastCompanionMessageAt: 950,
      followUpCount: 3
    }
  });
  const expectedMind = markUserReturned(state.mind, 2000);

  markMindUserReturned(state, 2000);
  recordRelationshipUserReply(state, 2000, MAX_FOLLOW_UPS);
  assert.deepEqual(state.mind, expectedMind);
  assert.deepEqual(state.relationship, {
    waitingSince: 0,
    waitingSessionId: '',
    lastUserMessageAt: 2000,
    lastCompanionMessageAt: 950,
    followUpCount: 0
  });

  beginRelationshipWaiting(state, { waitingSince: 3000, waitingSessionId: 'session-2', followUpCount: 2 }, MAX_FOLLOW_UPS);
  clearRelationshipWaiting(state, MAX_FOLLOW_UPS);
  assert.deepEqual(state.relationship, {
    waitingSince: 0,
    waitingSessionId: '',
    lastUserMessageAt: 2000,
    lastCompanionMessageAt: 950,
    followUpCount: 0
  });
});

test('boundary normalization is deterministic, preserves v16 state roots, and reset uses existing defaults', () => {
  const state = createState({
    relationship: {
      waitingSince: -1,
      waitingSessionId: 42,
      lastUserMessageAt: 'not-a-time',
      lastCompanionMessageAt: 12.5,
      followUpCount: -3
    },
    extraFutureRoot: { keep: true }
  });

  normalizeRelationship(state, MAX_FOLLOW_UPS);
  assert.deepEqual(state.relationship, {
    waitingSince: 0,
    waitingSessionId: '42',
    lastUserMessageAt: 0,
    lastCompanionMessageAt: 12.5,
    followUpCount: 0
  });
  assert.deepEqual(state.extraFutureRoot, { keep: true });
  assert.equal(state.version, 16);

  state.mind = { mood: 'happy', energy: 150, intimacy: -2, trust: 101 };
  resetMind(state);
  assert.deepEqual(state.mind, defaultMindState());
  assert.deepEqual(normalizeMindState({ energy: 150 }).energy, 100);
});
