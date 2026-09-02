const assert = require('node:assert/strict');
const test = require('node:test');

const {
  estimateTokenCount,
  selectHistoricalTurns,
  trimMessagesToTokenBudget,
  truncateToTokenBudget
} = require('../context-engine');

test('current conversation keeps far more than the old 24-message window', () => {
  const messages = Array.from({ length: 120 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `第 ${index + 1} 条消息：这是用于上下文回放的稳定内容。`
  }));
  const result = trimMessagesToTokenBudget(messages, {
    tokenBudget: 100000,
    messageLimit: 1600
  });
  assert.equal(result.length, 120);
  assert.match(result[0].content, /第 1 条消息/);
  assert.match(result.at(-1).content, /第 120 条消息/);
});

test('token trimming always preserves the latest user turn', () => {
  const messages = [
    { role: 'user', content: '旧内容'.repeat(3000) },
    { role: 'assistant', content: '旧回复'.repeat(3000) },
    { role: 'user', content: '这是现在最重要的问题，请不要丢失。' }
  ];
  const result = trimMessagesToTokenBudget(messages, {
    tokenBudget: 1200,
    messageLimit: 1600,
    maxMessageTokens: 900
  });
  assert.equal(result.at(-1).role, 'user');
  assert.match(result.at(-1).content, /现在最重要的问题/);
  assert.ok(estimateTokenCount(JSON.stringify(result)) < 1400);
});

test('historical recall prefers relevant user-authored turns and excludes current session', () => {
  const sessions = [
    {
      id: 'current',
      title: '当前',
      messages: [{ role: 'user', content: '我喜欢咖啡', createdAt: '2026-08-04T09:00:00+08:00' }]
    },
    {
      id: 'coffee',
      title: '咖啡口味',
      messages: [
        { role: 'user', content: '我喜欢浅烘焙的手冲咖啡', createdAt: '2026-08-01T09:00:00+08:00' },
        { role: 'assistant', content: '我记住了', createdAt: '2026-08-01T09:00:01+08:00' }
      ]
    },
    {
      id: 'movie',
      title: '电影',
      messages: [{ role: 'user', content: '昨晚看了一部电影', createdAt: '2026-08-03T09:00:00+08:00' }]
    }
  ];
  const turns = selectHistoricalTurns(
    sessions,
    [{ role: 'user', content: '我以前说过喜欢哪种咖啡？' }],
    { excludedSessionId: 'current', limit: 4, tokenBudget: 10000 }
  );
  assert.equal(turns[0].sessionId, 'coffee');
  assert.ok(turns.every((turn) => turn.sessionId !== 'current'));
});

test('text truncation obeys the approximate token budget', () => {
  const result = truncateToTokenBudget('这是一段很长的中文内容。'.repeat(100), 100);
  assert.ok(estimateTokenCount(result) <= 105);
  assert.match(result, /…$/);
});

test('historical recall is a fallback and skips evidence already covered by structured memory', () => {
  const sessions = [{
    id: 'old',
    title: '咖啡',
    messages: [
      { role: 'user', content: '我喜欢浅烘焙手冲咖啡', createdAt: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', content: '记住了', createdAt: '2026-01-01T00:00:01.000Z' }
    ]
  }];
  const turns = selectHistoricalTurns(sessions, [{ role: 'user', content: '我喜欢哪种咖啡？' }], {
    excludedEvidence: ['我喜欢浅烘焙手冲咖啡'],
    limit: 12,
    tokenBudget: 12000
  });
  assert.deepEqual(turns, []);
});

test('a generic keyword does not recall a large unrelated history tail', () => {
  const sessions = Array.from({ length: 100 }, (_, index) => ({
    id: `s${index}`,
    title: `旧对话 ${index}`,
    messages: [{ role: 'user', content: `这是第 ${index} 次普通聊天`, createdAt: '2026-08-01T00:00:00.000Z' }]
  }));
  const turns = selectHistoricalTurns(sessions, [{ role: 'user', content: '我们现在聊点别的吧' }], {
    limit: 12,
    tokenBudget: 12000
  });
  assert.equal(turns.length, 0);
});
