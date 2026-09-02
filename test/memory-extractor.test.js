const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evidenceAppearsInSource,
  extractExplicitMemoryCandidates
} = require('../memory-extractor');

test('extracts explicit identity and preference with verbatim evidence', () => {
  const source = '我叫小林。我最喜欢喝拿铁。';
  const memories = extractExplicitMemoryCandidates(source);
  const name = memories.find((item) => item.key === 'identity.name');
  const preference = memories.find((item) => item.category === 'preference');
  assert.equal(name.text, '用户的名字是小林');
  assert.equal(preference.text, '用户喜欢拿铁');
  assert.ok(evidenceAppearsInSource(name.evidence, source));
  assert.ok(evidenceAppearsInSource(preference.evidence, source));
});

test('like and dislike of the same item use one semantic key for conflict updates', () => {
  const liked = extractExplicitMemoryCandidates('我喜欢香菜。')[0];
  const disliked = extractExplicitMemoryCandidates('我讨厌香菜。')[0];
  assert.equal(liked.key, disliked.key);
  assert.notEqual(liked.text, disliked.text);
});

test('explicit remember request is retained at highest importance', () => {
  const memories = extractExplicitMemoryCandidates('你一定要记住：我每年十月都会回老家。');
  const explicit = memories.find((item) => item.importance === 5);
  assert.ok(explicit);
  assert.ok(evidenceAppearsInSource(explicit.evidence, '你一定要记住：我每年十月都会回老家。'));
});

test('evidence validation rejects assistant inventions', () => {
  assert.equal(evidenceAppearsInSource('我住在上海', '我今天有点累'), false);
  assert.equal(evidenceAppearsInSource('我今天有点累', '我今天有点累'), true);
});

test('previous preference and current preference are extracted as separate temporal facts', () => {
  const memories = extractExplicitMemoryCandidates('我以前喜欢拿铁，现在更喜欢美式。');
  const latte = memories.find((item) => item.key === 'preference.item.拿铁');
  const americano = memories.find((item) => item.key === 'preference.item.美式');
  assert.equal(latte.temporalStatus, 'historical');
  assert.equal(americano.temporalStatus, 'current');
  assert.equal(latte.explicitCorrection, true);
});

test('current dislike replaces the same preference slot instead of creating a near-duplicate key', () => {
  const liked = extractExplicitMemoryCandidates('我喜欢喝拿铁。')
    .find((item) => item.category === 'preference');
  const changed = extractExplicitMemoryCandidates('我现在不怎么喝拿铁了，更喜欢美式。');
  const latte = changed.find((item) => item.key === liked.key);
  assert.ok(latte);
  assert.match(latte.text, /不怎么喜欢拿铁/);
  assert.equal(latte.explicitCorrection, true);
});

test('explicit correction signal attaches to the corrected location statement', () => {
  const memories = extractExplicitMemoryCandidates('不是这个，我之前说错了，我现在搬到东京了。');
  const location = memories.find((item) => item.key === 'identity.location');
  assert.equal(location.text, '用户现在住在东京');
  assert.equal(location.explicitCorrection, true);
  assert.equal(location.temporalStatus, 'current');
});

test('future exam goal and completed exam reuse one semantic key', () => {
  const planned = extractExplicitMemoryCandidates('我准备今年考 N2。')
    .find((item) => item.category === 'goal');
  const completed = extractExplicitMemoryCandidates('N2 已经考完了。')
    .find((item) => item.category === 'goal');
  assert.equal(planned.key, completed.key);
  assert.equal(planned.temporalStatus, 'future');
  assert.equal(completed.temporalStatus, 'historical');
  assert.match(completed.effect, /完成/);
});

test('temporary mood and activity do not become long-term facts', () => {
  assert.deepEqual(extractExplicitMemoryCandidates('我今天有点困。'), []);
  assert.deepEqual(extractExplicitMemoryCandidates('我现在去洗澡。'), []);
  assert.deepEqual(extractExplicitMemoryCandidates('我刚吃完饭。'), []);
});

test('one user message can extract multiple independent facts', () => {
  const memories = extractExplicitMemoryCandidates('我叫小林。我的生日是十月三日。我喜欢咖啡。');
  assert.ok(memories.some((item) => item.key === 'identity.name'));
  assert.ok(memories.some((item) => item.key === 'identity.birthday'));
  assert.ok(memories.some((item) => item.category === 'preference'));
});
