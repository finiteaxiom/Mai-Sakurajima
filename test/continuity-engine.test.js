const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMemoryReviewQueue,
  continuityContext,
  continuityProactiveCue,
  deriveContinuityState,
  mergeProjectCandidates,
  normalizeHabit,
  normalizeProject,
  searchContinuity
} = require('../continuity-engine');

test('v9 goal and routine memories migrate into projects and habits without losing evidence', () => {
  const state = deriveContinuityState({
    facts: [
      { id: 'g1', text: '用户计划今年通过日语 N2', category: 'goal', importance: 5, evidence: '我计划今年通过日语 N2', sourceSessionId: 's1', sourceMessageId: 'm1' },
      { id: 'r1', text: '用户每天背二十个单词', category: 'routine', importance: 4, evidence: '我每天背二十个单词', sourceSessionId: 's1', sourceMessageId: 'm2' }
    ]
  });
  assert.equal(state.projects.length, 1);
  assert.equal(state.habits.length, 1);
  assert.equal(state.projects[0].source.messageId, 'm1');
  assert.equal(state.habits[0].frequency, 'daily');
});

test('project candidate needs verbatim user evidence', () => {
  const accepted = mergeProjectCandidates([], [{ title: '准备 N2', evidence: '我要准备 N2' }], {
    sourceText: '我要准备 N2，今年认真学。', sessionId: 's1', messageId: 'm1'
  });
  const rejected = mergeProjectCandidates([], [{ title: '准备雅思', evidence: '我要准备雅思' }], {
    sourceText: '我要准备 N2，今年认真学。'
  });
  assert.equal(accepted.projects.length, 1);
  assert.equal(rejected.projects.length, 0);
});

test('a project extracted in the same message as a goal memory is not duplicated', () => {
  const state = deriveContinuityState({
    projects: [{ id: 'p1', title: '准备 N2', outcome: '通过考试', source: { messageId: 'm1' } }],
    facts: [{ id: 'f1', text: '用户计划准备 N2', category: 'goal', sourceMessageId: 'm1' }]
  });
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].source.originId, 'f1');
});

test('derived projects follow memory corrections and disappear with deleted source memories', () => {
  const initial = deriveContinuityState({
    facts: [{ id: 'f1', text: '用户计划准备日语 N2', category: 'goal', importance: 4, updatedAt: '2026-08-05T10:00:00.000Z' }]
  });
  const corrected = deriveContinuityState({
    projects: initial.projects,
    facts: [{ id: 'f1', text: '用户计划准备日语 N1', category: 'goal', importance: 5, updatedAt: '2026-08-06T10:00:00.000Z' }]
  });
  const removed = deriveContinuityState({ projects: corrected.projects, facts: [] });
  assert.equal(corrected.projects[0].title, '准备日语 N1');
  assert.equal(corrected.projects[0].priority, 5);
  assert.equal(removed.projects.length, 0);
});

test('habit check-ins calculate current completion and streak', () => {
  const referenceNow = new Date('2026-08-06T12:00:00+08:00').getTime();
  const habit = normalizeHabit({
    title: '背单词', frequency: 'daily', targetPerPeriod: 1,
    checkIns: [
      { date: '2026-08-04', count: 1 },
      { date: '2026-08-05', count: 1 },
      { date: '2026-08-06', count: 1 }
    ]
  }, referenceNow);
  assert.equal(habit.completedToday, true);
  assert.ok(habit.streak >= 3);
});

test('global search returns cross-domain results with source pointers', () => {
  const results = searchContinuity({
    sessions: [{ id: 's1', title: '学习', messages: [{ id: 'm1', role: 'user', content: '我正在准备日语 N2', createdAt: '2026-08-06T10:00:00.000Z' }] }],
    facts: [{ id: 'f1', text: '用户喜欢草莓蛋糕', importance: 4 }],
    projects: [{ id: 'p1', title: '通过日语 N2', outcome: '今年通过考试', priority: 5 }]
  }, '日语 N2');
  assert.ok(results.some((item) => item.type === 'conversation' && item.source.messageId === 'm1'));
  assert.ok(results.some((item) => item.type === 'project'));
});

test('review queue identifies unverified, uncertain and conflicting memories', () => {
  const reviews = buildMemoryReviewQueue([
    { id: 'a', text: '用户喜欢咖啡', key: 'preference.drink', source: 'conversation', confidence: 0.7, evidence: '我喜欢咖啡', temporalStatus: 'current' },
    { id: 'b', text: '用户不喜欢咖啡', key: 'preference.drink', source: 'conversation', confidence: 0.95, evidence: '我不喜欢咖啡', temporalStatus: 'current' },
    { id: 'c', text: '用户可能住在上海', source: 'conversation', confidence: 0.8, evidence: '可能住在上海', temporalStatus: 'uncertain' }
  ]);
  assert.ok(reviews.some((item) => item.severity === 4));
  assert.ok(reviews.some((item) => item.factId === 'c'));
});

test('continuity context and proactive cue expose unfinished work without claiming completion', () => {
  const project = normalizeProject({ title: '交论文', targetAt: '2026-08-06T08:00:00.000Z', status: 'active' });
  const state = { projects: [project], habits: [] };
  const context = continuityContext(state, new Date('2026-08-06T10:00:00.000Z').getTime());
  const cue = continuityProactiveCue(state, new Date('2026-08-06T10:00:00.000Z').getTime());
  assert.match(context, /交论文/);
  assert.equal(cue.reason, 'project_overdue');
});

test('prompt continuity context selects the relevant project and omits unrelated active work', () => {
  const state = {
    projects: [
      normalizeProject({ title: '准备日语 N2', outcome: '通过 N2 考试', priority: 5, status: 'active' }),
      normalizeProject({ title: '整理旧照片', outcome: '完成相册', priority: 5, status: 'active' })
    ],
    habits: []
  };
  const context = continuityContext(state, Date.now(), {
    messages: [{ role: 'user', content: '我的 N2 目标进展怎么样？' }]
  });
  assert.match(context, /准备日语 N2/);
  assert.doesNotMatch(context, /整理旧照片/);
});
