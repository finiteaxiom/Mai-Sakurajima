const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyActivitySample,
  answerAssistantPromise,
  assistantProactiveCue,
  buildEveningReview,
  buildMorningBriefing,
  finishFocusSession,
  markAssistantCue,
  normalizeAssistantState,
  startFocusSession
} = require('../life-assistant');

test('v11 assistant derives promise records from conversation commitments', () => {
  const state = normalizeAssistantState({}, { lifeItems: [{
    id: 'todo-1', title: '周五提交报告', dueAt: '2026-08-07T10:00:00.000Z', source: 'conversation',
    sourceMessageId: 'm1', evidence: '我周五提交报告'
  }] });
  assert.equal(state.promises.length, 1);
  assert.equal(state.promises[0].sourceMessageId, 'm1');
});

test('focus session records actual completed minutes', () => {
  const started = startFocusSession({}, { mode: 'study', label: '复习日语', minutes: 25 }, Date.parse('2026-08-06T10:00:00Z'));
  const finished = finishFocusSession(started, {}, Date.parse('2026-08-06T10:26:00Z'));
  assert.equal(finished.currentFocus, null);
  assert.equal(finished.focusSessions[0].actualMinutes, 26);
  assert.equal(finished.focusSessions[0].mode, 'study');
});

test('foreground samples aggregate locally without window content', () => {
  const first = applyActivitySample({}, { processName: 'Code' }, Date.parse('2026-08-06T10:00:00Z'));
  const second = applyActivitySample(first, { processName: 'chrome' }, Date.parse('2026-08-06T10:00:30Z'));
  assert.equal(second.appUsage.current.label, 'Google Chrome');
  assert.equal(second.appUsage.days[0].apps[0].label, 'Visual Studio Code');
  assert.equal(second.appUsage.days[0].apps[0].seconds, 30);
  assert.equal(Object.hasOwn(second.appUsage.current, 'title'), false);
});

test('morning briefing and evening review are deterministic local summaries', () => {
  const now = Date.parse('2026-08-06T08:30:00+08:00');
  const morning = buildMorningBriefing({
    lifeItems: [{ title: '上课', dueAt: '2026-08-06T09:00:00+08:00', completed: false }],
    projects: [{ title: '通过 N2', status: 'active', progress: 20 }],
    habits: [{ title: '背单词', active: true, dueToday: true, completedToday: false }]
  }, now);
  const evening = buildEveningReview({ assistant: {}, lifeItems: [], habits: [] }, now);
  assert.match(morning.content, /上课/);
  assert.match(morning.content, /通过 N2/);
  assert.match(evening.content, /专注了 0 分钟/);
});

test('briefing and promise cues use a ledger to prevent repeated prompting', () => {
  const now = Date.parse('2026-08-06T08:30:00+08:00');
  const cue = assistantProactiveCue({}, { settings: { morningEnabled: true, morningTime: '08:00' } }, now);
  assert.equal(cue.reason, 'morning_briefing');
  const delivered = markAssistantCue({}, cue, now);
  assert.equal(assistantProactiveCue(delivered, { settings: { morningEnabled: true, morningTime: '08:00' } }, now), null);
});

test('answering a promise changes only the selected assistant promise with existing response rules', () => {
  const state = {
    version: 1,
    promises: [
      { id: 'promise-1', title: '提交报告', sourceItemId: 'life-1', status: 'open', lastResponse: '', updatedAt: '2026-08-20T00:00:00.000Z' },
      { id: 'promise-2', title: '背单词', status: 'open', lastResponse: '', updatedAt: '2026-08-20T00:00:00.000Z' }
    ],
    focusSessions: [],
    extraFutureField: { keep: true }
  };
  const result = answerAssistantPromise(state, 'promise-1', 'done', Date.parse('2026-08-20T08:00:00.000Z'));

  assert.equal(result.promise.status, 'completed');
  assert.equal(result.promise.lastResponse, 'done');
  assert.equal(result.promise.updatedAt, '2026-08-20T08:00:00.000Z');
  assert.equal(result.state.promises[1], state.promises[1]);
  assert.deepEqual(result.state.extraFutureField, { keep: true });
  assert.equal(state.promises[0].status, 'open');

  const fallback = answerAssistantPromise(state, 'promise-2', 'unexpected', Date.parse('2026-08-20T08:00:00.000Z'));
  assert.equal(fallback.promise.status, 'open');
  assert.equal(fallback.promise.lastResponse, 'later');
  assert.equal(answerAssistantPromise(state, 'missing', 'done').promise, null);
});

test('opt-in activity tracking can trigger one privacy-safe long-session cue', () => {
  const now = Date.parse('2026-08-06T15:00:00+08:00');
  const state = normalizeAssistantState({
    appUsage: { current: { app: 'code', label: 'Visual Studio Code', category: 'work', startedAt: new Date(now - 100 * 60000).toISOString() } }
  });
  const cue = assistantProactiveCue(state, {
    settings: { morningEnabled: false, eveningEnabled: false, activityTrackingEnabled: true }
  }, now);
  assert.equal(cue.reason, 'long_work_session');
  assert.equal(cue.app.label, 'Visual Studio Code');
});
