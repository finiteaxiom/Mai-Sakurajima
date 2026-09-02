const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDigests,
  extractPersonCandidates,
  inferTemporalMetadata,
  mergePeople,
  rebuildTimeline
} = require('../life-hub');

test('relationship graph extracts named relatives with verbatim evidence', () => {
  const text = '我的朋友叫小林，她最近也在准备考试。';
  const candidates = extractPersonCandidates(text);
  assert.equal(candidates[0].name, '小林');
  assert.equal(candidates[0].relation, '朋友');
  const merged = mergePeople([], candidates, {
    sourceText: text,
    sessionId: 'session-1',
    messageId: 'message-1',
    createdAt: '2026-08-05T10:00:00.000Z'
  });
  assert.equal(merged.people.length, 1);
  assert.equal(merged.people[0].evidence[0].messageId, 'message-1');
});

test('relationship graph rejects invented evidence', () => {
  const merged = mergePeople([], [{ name: '小林', relation: '朋友', evidence: '我的朋友叫小林' }], {
    sourceText: '我今天在准备考试。'
  });
  assert.equal(merged.people.length, 0);
  assert.equal(merged.stats.skipped, 1);
});

test('temporal memory distinguishes past, future and causal statements', () => {
  assert.equal(inferTemporalMetadata('我以前不喝咖啡').status, 'historical');
  assert.equal(inferTemporalMetadata('我以后打算每天跑步').status, 'future');
  const causal = inferTemporalMetadata('因为最近睡得太少，所以白天总是很困');
  assert.equal(causal.cause, '最近睡得太少');
  assert.equal(causal.effect, '白天总是很困');
});

test('timeline unifies episodes, memories, moments, tasks and relationships without duplicates', () => {
  const state = {
    episodes: [{ id: 'e1', title: '通过考试', summary: '用户通过了考试', importance: 5, sourceCreatedAt: '2026-08-05T10:00:00.000Z', evidence: '我通过考试了' }],
    facts: [{ id: 'f1', text: '用户计划学习日语', category: 'goal', importance: 5, sourceCreatedAt: '2026-08-04T10:00:00.000Z' }],
    moments: [{ id: 'm1', content: '今天的晚风很好。', createdAt: '2026-08-03T10:00:00.000Z' }],
    lifeItems: [{ id: 'l1', title: '提交作业', dueAt: '2026-08-06T10:00:00.000Z', completed: false }],
    people: [{ id: 'p1', name: '小林', relation: '朋友', firstSeenAt: '2026-08-02T10:00:00.000Z', manual: true }]
  };
  const first = rebuildTimeline(state);
  const second = rebuildTimeline({ ...state, timeline: first });
  assert.equal(first.length, 5);
  assert.equal(second.length, 5);
  assert.equal(new Set(second.map((item) => item.id)).size, 5);
  assert.ok(second.some((item) => item.type === 'relationship'));
});

test('daily and weekly digests are deterministic and trace timeline entries', () => {
  const timeline = [
    { id: 'a', type: 'episode', title: '通过考试', summary: '完成目标', occurredAt: '2026-08-05T10:00:00.000Z', importance: 5 },
    { id: 'b', type: 'task', title: '提交作业', summary: '按时完成', occurredAt: '2026-08-05T12:00:00.000Z', importance: 4 }
  ];
  const digests = buildDigests(timeline);
  const daily = digests.find((item) => item.period === 'day');
  const weekly = digests.find((item) => item.period === 'week');
  assert.deepEqual(daily.entryIds.sort(), ['a', 'b']);
  assert.match(daily.content, /通过考试/);
  assert.ok(weekly);
});
