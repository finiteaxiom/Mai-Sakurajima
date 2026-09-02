const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractBehaviorPatternCandidates,
  mergeBehaviorPatternObservations,
  normalizeBehaviorPatterns,
  selectRelevantBehaviorPatterns,
  updateMindAfterTurn,
  defaultMindState
} = require('../intelligence');
const { BASE_SYSTEM_PROMPT, buildPersonaGuidance } = require('../persona');

function observe(patterns, text, messageId) {
  return mergeBehaviorPatternObservations(
    patterns,
    extractBehaviorPatternCandidates(text),
    {
      sourceText: text,
      sourceSessionId: 'session-1',
      sourceMessageId: messageId,
      observedAt: `2026-08-${String(Number(messageId.slice(1)) + 10).padStart(2, '0')}T20:00:00.000Z`
    }
  );
}

test('persona regression 1: repeated late sleep becomes a sourced, gradual behavior cue', () => {
  let patterns = observe([], '又熬夜到凌晨两点了。', 'm1');
  patterns = observe(patterns, '我夜里三点才睡，明天又要起不来。', 'm2');
  const lateSleep = patterns.find((item) => item.id === 'late_sleep');
  assert.equal(lateSleep.observationCount, 2);
  assert.ok(lateSleep.confidence >= 0.38);
  assert.equal(selectRelevantBehaviorPatterns(patterns, '今晚我十点就准备早睡。')[0].id, 'late_sleep');
});

test('persona regression 2: procrastination requires an explicit user observation', () => {
  const patterns = observe([], '我又把报告拖到最后一天才开始写。', 'm1');
  assert.equal(patterns[0].id, 'procrastination');
  assert.deepEqual(extractBehaviorPatternCandidates('我觉得今天的天气不错。'), []);
});

test('persona regression 3: difficult achievements invite restrained recognition, not flattery', () => {
  const guidance = buildPersonaGuidance();
  assert.match(guidance, /不甜腻/);
  assert.match(guidance, /不把复杂问题缩成角色台词/);
});

test('persona regression 4: disagreement preserves independent judgment', () => {
  assert.match(BASE_SYSTEM_PROMPT, /可以清楚不同意/);
  assert.match(buildPersonaGuidance(), /不要用迎合来换取好感/);
});

test('persona regression 5: low mood receives concrete concern instead of assistant scripts', () => {
  const guidance = buildPersonaGuidance();
  assert.match(BASE_SYSTEM_PROMPT, /记得、观察、追问与具体反应/);
  assert.match(BASE_SYSTEM_PROMPT, /默认助手套话/);
});

test('persona regression 6: teasing remains restrained rather than a repeated tsundere tic', () => {
  const guidance = buildPersonaGuidance();
  assert.match(guidance, /轻微调侃/);
  assert.match(guidance, /不要高频复读固定口癖/);
});

test('persona regression 7: serious questions retain full reasoning quality', () => {
  assert.match(buildPersonaGuidance(), /不降低分析、学习、技术或决策问题上的推理质量/);
});

test('persona regression 8: relationship state does not grow merely because a user returned', () => {
  const mind = defaultMindState();
  const afterOrdinaryTurn = updateMindAfterTurn(mind, {
    userMessage: '今天工作有点累。',
    reply: { content: '先缓一缓。', mind: {} },
    now: Date.parse('2026-08-20T12:00:00.000Z')
  });
  assert.equal(afterOrdinaryTurn.intimacy, mind.intimacy);
  assert.equal(afterOrdinaryTurn.trust, mind.trust);
});

test('persona regression 9: an existing fact is handled through memory continuity rules', () => {
  const guidance = buildPersonaGuidance();
  assert.match(guidance, /自然表现出知道它/);
  assert.match(guidance, /绝不编造没有来源的共同经历/);
});

test('persona regression 10: improved behavior is treated as a relevant contrast, not a diagnosis', () => {
  const patterns = normalizeBehaviorPatterns([{
    id: 'late_sleep', confidence: 0.66, observationCount: 3,
    sources: [{ evidence: '又熬夜到凌晨两点', sourceMessageId: 'm1', observedAt: '2026-08-18T02:00:00.000Z' }]
  }]);
  const selected = selectRelevantBehaviorPatterns(patterns, '今天十点前就准备睡了。');
  const guidance = buildPersonaGuidance({ behaviorPatterns: [{ ...selected[0], label: '作息常常偏晚' }] });
  assert.equal(selected[0].id, 'late_sleep');
  assert.match(guidance, /不要报出模式名称、次数或内部置信度/);
  assert.match(guidance, /不要给用户贴心理标签/);
});

test('behavior observations deduplicate a single source message and only keep known patterns', () => {
  const once = observe([], '我最近总是想太多，反复内耗。', 'm1');
  const duplicate = observe(once, '我最近总是想太多，反复内耗。', 'm1');
  assert.equal(duplicate[0].observationCount, 1);
  assert.equal(normalizeBehaviorPatterns([{ id: 'unknown', confidence: 1 }]).length, 0);
});
