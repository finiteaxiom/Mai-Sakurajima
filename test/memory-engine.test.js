const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_EVIDENCE_TRAIL,
  appendEvidenceTrail,
  canonicalizeMemoryKey,
  normalizeEvidenceTrail,
  rankMemories,
  resolveCanonicalFactConflicts,
  selectMemoryContext
} = require('../memory-engine');

function fact(id, text, overrides = {}) {
  return {
    id,
    text,
    key: `other.${id}`,
    category: 'other',
    importance: 2,
    confidence: 0.8,
    temporalStatus: 'current',
    source: 'conversation',
    confirmationCount: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  };
}

test('canonicalizes common semantic-key aliases without collapsing unrelated dynamic keys', () => {
  assert.equal(canonicalizeMemoryKey('identity.occupation'), 'identity.job');
  assert.equal(canonicalizeMemoryKey('identity.career'), 'identity.job');
  assert.equal(canonicalizeMemoryKey('preference.movies'), 'preference.movie');
  assert.equal(canonicalizeMemoryKey('preference.film'), 'preference.movie');
  assert.equal(canonicalizeMemoryKey('relationship.nickname'), 'relationship.user_nickname');
  assert.notEqual(
    canonicalizeMemoryKey('preference.item.拿铁'),
    canonicalizeMemoryKey('preference.item.美式')
  );
});

test('v15 conflict normalization preserves every fact but leaves only one current fact per canonical key', () => {
  const facts = [
    fact('old', '用户的职业是设计师', { key: 'identity.occupation', category: 'identity', updatedAt: '2025-01-01T00:00:00.000Z' }),
    fact('new', '用户的工作是工程师', { key: 'identity.job', category: 'identity', updatedAt: '2026-01-01T00:00:00.000Z' })
  ];
  const normalized = resolveCanonicalFactConflicts(facts);
  assert.deepEqual(new Set(normalized.map((item) => item.id)), new Set(['old', 'new']));
  assert.equal(normalized.filter((item) => item.temporalStatus === 'current').length, 1);
  assert.equal(normalized.find((item) => item.id === 'new').temporalStatus, 'current');
  assert.equal(normalized.find((item) => item.id === 'old').temporalStatus, 'historical');
});

test('dynamic retrieval favors an old relevant coffee fact over many unrelated recent facts', () => {
  const distractors = Array.from({ length: 140 }, (_, index) => fact(
    `noise-${index}`,
    `用户最近记录的无关生活片段 ${index}`,
    { updatedAt: `2026-08-14T${String(index % 24).padStart(2, '0')}:00:00.000Z` }
  ));
  const coffee = fact('coffee', '用户喜欢浅烘焙手冲咖啡', {
    key: 'preference.coffee',
    category: 'preference',
    importance: 4,
    confidence: 0.98,
    evidence: '我喜欢浅烘焙手冲咖啡',
    updatedAt: '2024-01-01T00:00:00.000Z'
  });
  const selected = selectMemoryContext([...distractors, coffee], [
    { role: 'user', content: '我以前说过自己喜欢哪种咖啡？' }
  ], { totalLimit: 24, coreLimit: 6, relevantLimit: 16, recentLimit: 2, now: Date.parse('2026-08-15T00:00:00.000Z') });
  assert.equal(selected[0].id, 'coffee');
  assert.ok(selected.length <= 24);
  assert.ok(selected.some((item) => item.id === 'coffee'));
});

test('pinned core stays available while uncertain and historical variants do not outrank current truth', () => {
  const facts = [
    fact('pinned', '用户希望被称呼为小林', {
      key: 'relationship.user_nickname', category: 'relationship', importance: 5, pinned: true, source: 'manual', confidence: 1
    }),
    fact('current', '用户现在住在东京', {
      key: 'identity.location', category: 'identity', importance: 4, confidence: 0.98, updatedAt: '2026-08-01T00:00:00.000Z'
    }),
    fact('historical', '用户以前住在西安', {
      key: 'identity.previous_location', category: 'identity', importance: 4, confidence: 0.99, temporalStatus: 'historical', updatedAt: '2026-08-14T00:00:00.000Z'
    }),
    fact('uncertain', '用户可能住在大阪', {
      key: 'identity.possible_location', category: 'identity', importance: 5, confidence: 0.35, temporalStatus: 'uncertain', updatedAt: '2026-08-15T00:00:00.000Z'
    })
  ];
  const ranked = rankMemories(facts, [{ role: 'user', content: '我现在住在哪里？' }], 4, Date.parse('2026-08-15T00:00:00.000Z'));
  assert.ok(ranked.indexOf(facts[1]) < ranked.indexOf(facts[2]));
  assert.ok(ranked.indexOf(facts[1]) < ranked.indexOf(facts[3]));
  const selected = selectMemoryContext(facts, [{ role: 'user', content: '聊聊今天的安排' }], { totalLimit: 8 });
  assert.ok(selected.some((item) => item.id === 'pinned'));
});

test('retrieval ranking ignores legacy useCount rich-get-richer feedback', () => {
  const relevant = fact('relevant', '用户喜欢喝美式咖啡', { category: 'preference', key: 'preference.item.美式', useCount: 0 });
  const popularNoise = fact('popular', '用户养过一盆绿植', { category: 'experience', key: 'experience.plant', useCount: 100000 });
  const ranked = rankMemories([popularNoise, relevant], [{ role: 'user', content: '我喜欢喝什么咖啡？' }], 2);
  assert.equal(ranked[0].id, 'relevant');
});

test('named people and goals receive category-aware retrieval instead of recent noise', () => {
  const facts = [
    fact('friend', '小林是用户准备日语考试的朋友', {
      key: 'relationship.person.小林', category: 'relationship', importance: 4, evidence: '我的朋友小林也在准备考试'
    }),
    fact('goal', '用户准备通过日语 N2 考试', {
      key: 'goal.exam.n2', category: 'goal', importance: 5, evidence: '我准备今年考 N2'
    }),
    ...Array.from({ length: 60 }, (_, index) => fact(`recent-${index}`, `用户最近的无关记录 ${index}`, {
      updatedAt: '2026-08-15T00:00:00.000Z'
    }))
  ];
  const friendResult = selectMemoryContext(facts, [{ role: 'user', content: '我之前提到的朋友小林怎么样了？' }], { totalLimit: 12 });
  const goalResult = selectMemoryContext(facts, [{ role: 'user', content: '我的 N2 目标现在是什么？' }], { totalLimit: 12 });
  assert.equal(friendResult[0].id, 'friend');
  assert.equal(goalResult[0].id, 'goal');
});

test('evidence trail keeps distinct user sources, deduplicates one message, and stays bounded', () => {
  let trail = normalizeEvidenceTrail([], {
    evidence: '我喜欢美式', sourceSessionId: 's1', sourceMessageId: 'm1', sourceCreatedAt: '2026-01-01T00:00:00.000Z'
  });
  const duplicate = appendEvidenceTrail(trail, {
    evidence: '我喜欢美式', sourceSessionId: 's1', sourceMessageId: 'm1', sourceCreatedAt: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(duplicate.added, false);
  trail = duplicate.trail;
  for (let index = 2; index <= 12; index += 1) {
    trail = appendEvidenceTrail(trail, {
      evidence: `第 ${index} 次确认我喜欢美式`, sourceSessionId: 's1', sourceMessageId: `m${index}`
    }).trail;
  }
  assert.equal(trail.length, MAX_EVIDENCE_TRAIL);
  assert.equal(trail.at(-1).sourceMessageId, 'm12');
});
