const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_MOMENT_COMMENTS,
  fallbackMomentReply,
  nextMomentAt,
  normalizeMomentReplyText,
  normalizeMomentText,
  normalizeMomentsState,
  publicMoments
} = require('../moments');

test('v5 memory gets one private seed moment and a future schedule', () => {
  const now = new Date('2026-08-03T10:00:00+08:00').getTime();
  const state = normalizeMomentsState({}, 5, now);
  assert.equal(state.moments.length, 1);
  assert.equal(state.moments[0].source, 'seed');
  assert.ok(state.moments[0].content.includes('只放给你看的日常'));
  assert.ok(state.momentsMeta.nextPostAt > now);
});

test('v6 intentionally empty moments stay empty', () => {
  const now = Date.now();
  const state = normalizeMomentsState({ moments: [], momentsMeta: {} }, 6, now);
  assert.equal(state.moments.length, 0);
  assert.ok(state.momentsMeta.nextPostAt > now);
});

test('normalization keeps safe roles and caps comments', () => {
  const comments = Array.from({ length: MAX_MOMENT_COMMENTS + 8 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `回复 ${index}`,
    createdAt: new Date(1700000000000 + index).toISOString()
  }));
  comments.push({ role: 'system', content: '不应保留' });
  const state = normalizeMomentsState({
    moments: [{ content: '  一条动态  ', comments }],
    momentsMeta: { nextPostAt: Date.now() + 1000 }
  }, 6);
  assert.equal(state.moments[0].content, '一条动态');
  assert.equal(state.moments[0].comments.length, MAX_MOMENT_COMMENTS);
  assert.ok(state.moments[0].comments.every((item) => ['user', 'assistant'].includes(item.role)));
});

test('night schedule is moved to the quiet-hours boundary', () => {
  const now = new Date('2026-08-03T18:00:00+08:00').getTime();
  const scheduled = new Date(nextMomentAt(now, () => 0));
  assert.equal(scheduled.getHours(), 8);
  assert.equal(scheduled.getMinutes(), 15);
});

test('public state is copied and fallback replies are usable offline', () => {
  const stored = normalizeMomentsState({}, 5, Date.now());
  const result = publicMoments(stored);
  result.moments[0].content = 'changed';
  assert.notEqual(stored.moments[0].content, 'changed');
  assert.ok(fallbackMomentReply('今天有点累').includes('歇一会儿'));
  assert.equal(normalizeMomentText('  hello\r\nworld  '), 'hello\nworld');
});

test('assistant moment replies extract only the visible reply from structured JSON', () => {
  const raw = JSON.stringify({
    reply: '嗯，那就说好了。今晚一起看电影。',
    action: 'love',
    emotion: 'happy',
    memories: [{ content: '不应显示在评论里' }]
  });
  assert.equal(normalizeMomentReplyText(raw), '嗯，那就说好了。今晚一起看电影。');
  assert.equal(
    normalizeMomentReplyText(`\`\`\`json\n${raw}\n\`\`\``),
    '嗯，那就说好了。今晚一起看电影。'
  );
  assert.equal(normalizeMomentReplyText(JSON.stringify(raw)), '嗯，那就说好了。今晚一起看电影。');
});

test('truncated structured replies recover the complete reply field', () => {
  const truncated = '{"reply":"太好了，你还能看到我。","action":"love","memories":[{"content":"未结束';
  assert.equal(normalizeMomentReplyText(truncated), '太好了，你还能看到我。');
});

test('normalization repairs legacy assistant JSON without changing user comments', () => {
  const raw = '{"reply":"只显示这一句。","action":"wave","topics":[';
  const state = normalizeMomentsState({
    moments: [{
      content: '测试动态',
      comments: [
        { role: 'user', content: raw },
        { role: 'assistant', content: raw }
      ]
    }],
    momentsMeta: {}
  }, 12);
  assert.equal(state.moments[0].comments[0].content, raw);
  assert.equal(state.moments[0].comments[1].content, '只显示这一句。');
});
