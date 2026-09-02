const assert = require('node:assert/strict');
const test = require('node:test');

const {
  extractEpisodeCandidates,
  memoryCandidateIsBlocked,
  mergeEpisodes,
  normalizeMemoryCorrection,
  selectEpisodeContext,
  updateTopicThreads
} = require('../shared-life');

test('significant user events become evidence-backed episodes', () => {
  const source = '我今天终于通过驾照考试了，特别开心！';
  const candidates = extractEpisodeCandidates(source);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].category, 'achievement');
  const merged = mergeEpisodes([], candidates, { sourceText: source, sourceSessionId: 's1' });
  assert.equal(merged.stats.added, 1);
  assert.equal(merged.episodes[0].evidence, source);
});

test('episode merge rejects evidence that is absent from the user message', () => {
  const merged = mergeEpisodes([], [{
    title: '获得录取',
    summary: '用户获得了录取通知。',
    category: 'achievement',
    evidence: '我拿到了录取通知'
  }], { sourceText: '今天天气不错' });
  assert.equal(merged.stats.added, 0);
  assert.equal(merged.stats.skipped, 1);
});

test('related episodes are ranked before unrelated recent events', () => {
  const episodes = [
    { id: 'a', title: '通过驾照考试', summary: '用户通过驾照考试', evidence: '我通过驾照考试', importance: 5, sourceCreatedAt: '2026-08-01T10:00:00+08:00' },
    { id: 'b', title: '看完电影', summary: '用户看完一部电影', evidence: '我看完电影', importance: 3, sourceCreatedAt: '2026-08-04T10:00:00+08:00' }
  ];
  const selected = selectEpisodeContext(episodes, [{ role: 'user', content: '还记得我的驾照考试吗？' }], { limit: 2 });
  assert.equal(selected[0].id, 'a');
});

test('pending questions create a thread and a user answer advances it', () => {
  const first = updateTopicThreads([], {
    userText: '我明天要去面试。',
    sourceSessionId: 's1',
    now: 1000,
    reply: { mind: { topic: '明天的面试', pendingQuestion: '你准备得怎么样了？' } }
  });
  assert.equal(first.topics.length, 1);
  assert.equal(first.topics[0].status, 'waiting');
  const second = updateTopicThreads(first.topics, {
    userText: '已经准备得差不多了。',
    sourceSessionId: 's1',
    now: 2000,
    reply: { mind: { topic: '明天的面试', pendingQuestion: '' } }
  });
  assert.equal(second.topics[0].pendingQuestion, '');
  assert.equal(second.topics[0].lastUserResponseAt, 2000);
});

test('rejected memory keys remain blocked from automatic extraction', () => {
  const correction = normalizeMemoryCorrection({ targetKey: 'preference.drink', targetText: '用户喜欢咖啡' });
  assert.equal(memoryCandidateIsBlocked({ key: 'preference.drink', text: '用户喜欢拿铁' }, [correction]), true);
  assert.equal(memoryCandidateIsBlocked({ key: 'identity.job', text: '用户是学生' }, [correction]), false);
});
