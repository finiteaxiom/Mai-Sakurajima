const MIND_MOODS = new Set([
  'calm',
  'happy',
  'curious',
  'shy',
  'concerned',
  'playful',
  'focused',
  'sleepy',
  'upset',
  'teasing',
  'annoyed',
  'affectionate',
  'tired',
  'serious',
  'embarrassed'
]);

const BEHAVIOR_PATTERN_DEFINITIONS = Object.freeze({
  late_sleep: { label: '作息常常偏晚', triggers: /熬夜|凌晨|夜里.{0,8}(?:还没睡|才睡)|(?:凌晨|夜里).{0,8}(?:两点|三点|四点)/ },
  procrastination: { label: '容易拖到最后才开始', triggers: /拖延|拖到最后|一直没开始|明天再说|晚点再做/ },
  overthinking: { label: '容易反复琢磨同一件事', triggers: /想太多|反复想|内耗|纠结了很久|一直在纠结/ },
  regular_study: { label: '持续投入学习', triggers: /(?:每天|一直|最近).{0,8}(?:学习|复习|背单词|刷题)|(?:学习|复习|背单词|刷题).{0,8}(?:第\d+天|坚持)/ },
  exercise: { label: '持续保持运动', triggers: /(?:跑步|健身|锻炼|运动).{0,12}(?:坚持|第\d+天|今天)|(?:每天|每周).{0,8}(?:跑步|健身|锻炼|运动)/ }
});

const MAX_BEHAVIOR_PATTERN_SOURCES = 8;

const RELATIONSHIP_STAGES = [
  { key: 'first_meeting', label: '初识', minimum: 0 },
  { key: 'familiar', label: '熟悉', minimum: 20 },
  { key: 'trusted', label: '信任', minimum: 45 },
  { key: 'intimate', label: '亲密', minimum: 70 },
  { key: 'devoted', label: '深度陪伴', minimum: 90 }
];

const PROACTIVE_POLICIES = {
  quiet: { intervalMinutes: 150, dailyLimit: 2 },
  low: { intervalMinutes: 90, dailyLimit: 3 },
  balanced: { intervalMinutes: 45, dailyLimit: 5 },
  high: { intervalMinutes: 20, dailyLimit: 8 }
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function cleanBehaviorEvidence(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function normalizeBehaviorPattern(value) {
  const id = Object.hasOwn(BEHAVIOR_PATTERN_DEFINITIONS, value?.id) ? value.id : '';
  if (!id) return null;
  const sources = (Array.isArray(value?.sources) ? value.sources : [])
    .map((source) => ({
      evidence: cleanBehaviorEvidence(source?.evidence),
      sourceSessionId: String(source?.sourceSessionId || '').slice(0, 120),
      sourceMessageId: String(source?.sourceMessageId || '').slice(0, 120),
      observedAt: String(source?.observedAt || '').slice(0, 40)
    }))
    .filter((source) => source.evidence && source.sourceMessageId)
    .slice(-MAX_BEHAVIOR_PATTERN_SOURCES);
  const observationCount = Math.max(sources.length, Math.round(Number(value?.observationCount) || 0));
  return {
    id,
    confidence: clamp(value?.confidence, 0, 0.92),
    observationCount,
    firstObservedAt: String(value?.firstObservedAt || sources[0]?.observedAt || '').slice(0, 40),
    lastObservedAt: String(value?.lastObservedAt || sources.at(-1)?.observedAt || '').slice(0, 40),
    sources
  };
}

function normalizeBehaviorPatterns(value) {
  const byId = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    const pattern = normalizeBehaviorPattern(item);
    if (!pattern) continue;
    const previous = byId.get(pattern.id);
    if (!previous || pattern.lastObservedAt > previous.lastObservedAt) byId.set(pattern.id, pattern);
  }
  return [...byId.values()].sort((left, right) => (
    right.confidence - left.confidence || right.lastObservedAt.localeCompare(left.lastObservedAt)
  ));
}

function extractBehaviorPatternCandidates(text) {
  const source = cleanBehaviorEvidence(text);
  if (!source) return [];
  return Object.entries(BEHAVIOR_PATTERN_DEFINITIONS)
    .filter(([, definition]) => definition.triggers.test(source))
    .map(([id]) => ({ id, evidence: source }));
}

function mergeBehaviorPatternObservations(existing, candidates, source = {}) {
  const patterns = normalizeBehaviorPatterns(existing);
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const sourceText = cleanBehaviorEvidence(source.sourceText);
  const sourceMessageId = String(source.sourceMessageId || '').slice(0, 120);
  const sourceSessionId = String(source.sourceSessionId || '').slice(0, 120);
  const observedAt = String(source.observedAt || new Date().toISOString()).slice(0, 40);
  if (!sourceText || !sourceMessageId) return patterns;

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const id = Object.hasOwn(BEHAVIOR_PATTERN_DEFINITIONS, candidate?.id) ? candidate.id : '';
    const evidence = cleanBehaviorEvidence(candidate?.evidence);
    if (!id || !evidence || !sourceText.includes(evidence)) continue;
    const current = byId.get(id) || normalizeBehaviorPattern({ id, sources: [] });
    if (current.sources.some((item) => item.sourceMessageId === sourceMessageId)) continue;
    const sources = [...current.sources, { evidence, sourceSessionId, sourceMessageId, observedAt }]
      .slice(-MAX_BEHAVIOR_PATTERN_SOURCES);
    const observationCount = Math.max(current.observationCount + 1, sources.length);
    byId.set(id, normalizeBehaviorPattern({
      ...current,
      observationCount,
      // The value rises only with distinct user messages; it is a conversational
      // cue, not a diagnosis or a score exposed to the user.
      confidence: Math.min(0.92, 0.12 + observationCount * 0.18),
      firstObservedAt: current.firstObservedAt || observedAt,
      lastObservedAt: observedAt,
      sources
    }));
  }
  return normalizeBehaviorPatterns([...byId.values()]);
}

function selectRelevantBehaviorPatterns(patterns, latestUserText) {
  const text = cleanBehaviorEvidence(latestUserText);
  const directlyMentioned = new Set(extractBehaviorPatternCandidates(text).map((item) => item.id));
  if (/早睡|睡得早|十点前|十一点前/.test(text)) directlyMentioned.add('late_sleep');
  if (/提前完成|没再拖|已经动手|开始做了/.test(text)) directlyMentioned.add('procrastination');
  if (/想开了|不再纠结|不再内耗/.test(text)) directlyMentioned.add('overthinking');
  return normalizeBehaviorPatterns(patterns)
    .filter((pattern) => pattern.confidence >= 0.38 && directlyMentioned.has(pattern.id))
    .slice(0, 2);
}

function defaultMindState() {
  return {
    mood: 'calm',
    energy: 72,
    intimacy: 32,
    trust: 45,
    activeTopic: '',
    pendingQuestion: '',
    pendingQuestionAt: 0,
    lastUserMessageAt: 0,
    lastAssistantMessageAt: 0,
    lastProactiveAt: 0,
    dailyProactiveDate: '',
    dailyProactiveCount: 0,
    interactionCount: 0,
    recentProactiveReasons: []
  };
}

function normalizeMindState(value) {
  const defaults = defaultMindState();
  return {
    mood: MIND_MOODS.has(value?.mood) ? value.mood : defaults.mood,
    energy: clamp(value?.energy ?? defaults.energy, 0, 100),
    intimacy: clamp(value?.intimacy ?? defaults.intimacy, 0, 100),
    trust: clamp(value?.trust ?? defaults.trust, 0, 100),
    activeTopic: String(value?.activeTopic || '').trim().slice(0, 100),
    pendingQuestion: String(value?.pendingQuestion || '').trim().slice(0, 180),
    pendingQuestionAt: Math.max(0, Number(value?.pendingQuestionAt) || 0),
    lastUserMessageAt: Math.max(0, Number(value?.lastUserMessageAt) || 0),
    lastAssistantMessageAt: Math.max(0, Number(value?.lastAssistantMessageAt) || 0),
    lastProactiveAt: Math.max(0, Number(value?.lastProactiveAt) || 0),
    dailyProactiveDate: String(value?.dailyProactiveDate || '').slice(0, 10),
    dailyProactiveCount: clamp(Math.round(Number(value?.dailyProactiveCount) || 0), 0, 999),
    interactionCount: Math.max(0, Math.round(Number(value?.interactionCount) || 0)),
    recentProactiveReasons: Array.isArray(value?.recentProactiveReasons)
      ? value.recentProactiveReasons.map(String).slice(-8)
      : []
  };
}

function migrateMindState(value, storedVersion = 0) {
  const normalized = normalizeMindState(value);
  if (Number(storedVersion || 0) >= 5) {
    return normalized;
  }
  const defaults = defaultMindState();
  return normalizeMindState({
    ...normalized,
    mood: defaults.mood,
    energy: defaults.energy,
    intimacy: defaults.intimacy
  });
}

function relationshipStage(intimacy) {
  const score = clamp(intimacy, 0, 100);
  return RELATIONSHIP_STAGES
    .slice()
    .reverse()
    .find((stage) => score >= stage.minimum) || RELATIONSHIP_STAGES[0];
}

function extractQuestion(content) {
  const text = String(content || '').trim();
  const matches = text.match(/[^。！？!?\n]{2,180}[？?]/g);
  return matches?.at(-1)?.trim().slice(0, 180) || '';
}

function inferMindMood(reply) {
  const requested = reply?.mind?.mood;
  if (MIND_MOODS.has(requested)) {
    return requested;
  }
  const emotionMap = {
    happy: 'happy',
    shy: 'shy',
    concerned: 'concerned',
    angry: 'upset',
    sleepy: 'sleepy',
    focused: 'focused',
    neutral: 'calm'
  };
  return emotionMap[reply?.emotion] || 'calm';
}

function updateMindAfterTurn(currentMind, input = {}) {
  const mind = normalizeMindState(currentMind);
  const now = Number(input.now) || Date.now();
  const meta = input.reply?.mind || {};
  const hour = new Date(now).getHours();
  const naturalEnergyDelta = hour >= 3 && hour < 6 ? -0.1 : hour >= 7 && hour < 11 ? 0.05 : 0;
  const requestedIntimacyDelta = Number(meta.intimacyDelta);
  const requestedTrustDelta = Number(meta.trustDelta);
  const requestedEnergyDelta = Number(meta.energyDelta);
  const intimacyDelta = Number.isFinite(requestedIntimacyDelta)
    ? clamp(requestedIntimacyDelta * 0.04, -0.18, 0.08)
    : 0;
  const trustDelta = Number.isFinite(requestedTrustDelta)
    ? clamp(requestedTrustDelta * 0.04, -0.14, 0.07)
    : 0;
  const energyDelta = Number.isFinite(requestedEnergyDelta)
    ? clamp(requestedEnergyDelta * 0.15, -1.5, 1.5)
    : naturalEnergyDelta;
  const pendingQuestion = String(
    meta.pendingQuestion || extractQuestion(input.reply?.content)
  ).trim().slice(0, 180);
  const topic = String(meta.topic || input.topic || mind.activeTopic)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

  return normalizeMindState({
    ...mind,
    mood: inferMindMood(input.reply),
    energy: mind.energy + energyDelta,
    intimacy: mind.intimacy + intimacyDelta,
    trust: mind.trust + trustDelta,
    activeTopic: topic,
    pendingQuestion,
    pendingQuestionAt: pendingQuestion ? now : 0,
    lastUserMessageAt: input.userMessage ? now : mind.lastUserMessageAt,
    lastAssistantMessageAt: now,
    interactionCount: mind.interactionCount + (input.userMessage ? 1 : 0)
  });
}

function markUserReturned(currentMind, now = Date.now()) {
  const mind = normalizeMindState(currentMind);
  return normalizeMindState({
    ...mind,
    pendingQuestion: '',
    pendingQuestionAt: 0,
    lastUserMessageAt: now,
    energy: mind.energy + 0.2
  });
}

function localDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function quietHoursRemaining(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 7 * 60 + 30) {
    return 0;
  }
  const next = new Date(now);
  next.setHours(7, 30, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

function normalizeLifeItem(item) {
  const dueAt = new Date(item?.dueAt || 0).getTime();
  const recurring = ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(item?.recurring)
    ? item.recurring
    : 'none';
  return {
    id: String(item?.id || ''),
    title: String(item?.title || '').replace(/\s+/g, ' ').trim().slice(0, 100),
    kind: ['todo', 'appointment', 'anniversary'].includes(item?.kind)
      ? item.kind
      : 'todo',
    dueAt: Number.isFinite(dueAt) && dueAt > 0 ? new Date(dueAt).toISOString() : '',
    recurring,
    completed: item?.completed === true,
    source: item?.source === 'conversation' ? 'conversation' : 'manual',
    priority: Math.max(1, Math.min(5, Math.round(Number(item?.priority) || 3))),
    notes: String(item?.notes || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    promise: item?.promise === true || item?.source === 'conversation',
    sourceSessionId: String(item?.sourceSessionId || '').slice(0, 120),
    sourceMessageId: String(item?.sourceMessageId || '').slice(0, 120),
    evidence: String(item?.evidence || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString(),
    lastRemindedAt: Math.max(0, Number(item?.lastRemindedAt) || 0)
  };
}

function effectiveDueAt(item, now = new Date()) {
  const original = new Date(item?.dueAt || 0);
  if (Number.isNaN(original.getTime())) {
    return 0;
  }
  if (item.recurring === 'none') {
    return original.getTime();
  }
  const occurrence = new Date(now);
  occurrence.setHours(original.getHours(), original.getMinutes(), 0, 0);
  if (item.recurring === 'daily') {
    if (occurrence.getTime() < now.getTime() - 86400000) occurrence.setDate(occurrence.getDate() + 1);
  } else if (item.recurring === 'weekly') {
    occurrence.setDate(occurrence.getDate() + ((original.getDay() - occurrence.getDay() + 7) % 7));
    if (occurrence.getTime() < now.getTime() - 86400000) occurrence.setDate(occurrence.getDate() + 7);
  } else if (item.recurring === 'monthly') {
    occurrence.setDate(Math.min(original.getDate(), new Date(occurrence.getFullYear(), occurrence.getMonth() + 1, 0).getDate()));
    if (occurrence.getTime() < now.getTime() - 86400000) {
      occurrence.setMonth(occurrence.getMonth() + 1, 1);
      occurrence.setDate(Math.min(original.getDate(), new Date(occurrence.getFullYear(), occurrence.getMonth() + 1, 0).getDate()));
    }
  } else {
    occurrence.setMonth(original.getMonth(), original.getDate());
    if (occurrence.getTime() < now.getTime() - 86400000) occurrence.setFullYear(occurrence.getFullYear() + 1);
  }
  return occurrence.getTime();
}

function dueLifeDecision(items, nowMs) {
  const candidates = (Array.isArray(items) ? items : [])
    .filter((item) => !item.completed || item.recurring === 'yearly')
    .map((item) => ({ item, dueAt: effectiveDueAt(item, new Date(nowMs)) }))
    .filter(({ dueAt }) => dueAt > 0)
    .sort((left, right) => left.dueAt - right.dueAt);

  for (const candidate of candidates) {
    const delta = candidate.dueAt - nowMs;
    const sinceReminder = nowMs - (Number(candidate.item.lastRemindedAt) || 0);
    if (delta >= 0 && delta <= 60 * 60 * 1000 && sinceReminder > 45 * 60 * 1000) {
      return { reason: 'upcoming_life_item', item: candidate.item, dueAt: candidate.dueAt };
    }
    if (
      delta < 0
      && delta >= -24 * 60 * 60 * 1000
      && sinceReminder > 2 * 60 * 60 * 1000
    ) {
      return { reason: 'overdue_life_item', item: candidate.item, dueAt: candidate.dueAt };
    }
  }
  return null;
}

function decideProactive(input = {}) {
  const now = new Date(input.now || Date.now());
  const nowMs = now.getTime();
  const quietRemaining = quietHoursRemaining(now);
  if (quietRemaining > 0 && input.force !== true) {
    return { shouldSpeak: false, nextCheckMs: quietRemaining, reason: 'quiet_hours' };
  }

  const dueDecision = dueLifeDecision(input.items, nowMs);
  if (dueDecision) {
    return { shouldSpeak: true, ...dueDecision };
  }

  if (input.force === true) {
    return { shouldSpeak: true, reason: 'manual_preview' };
  }
  const mind = normalizeMindState(input.mind);
  const legacyPolicy = PROACTIVE_POLICIES[input.frequency] || PROACTIVE_POLICIES.balanced;
  const policy = {
    intervalMinutes: clamp(
      Math.round(Number(input.intervalMinutes) || legacyPolicy.intervalMinutes),
      1,
      10080
    ),
    dailyLimit: clamp(
      Math.round(Number(input.dailyLimit) || legacyPolicy.dailyLimit),
      1,
      999
    )
  };
  const today = localDateKey(now);
  const dailyCount = mind.dailyProactiveDate === today ? mind.dailyProactiveCount : 0;
  if (dailyCount >= policy.dailyLimit) {
    return { shouldSpeak: false, nextCheckMs: 30 * 60 * 1000, reason: 'daily_limit' };
  }

  const baseActivity = Math.max(
    mind.lastUserMessageAt,
    mind.lastAssistantMessageAt,
    mind.lastProactiveAt,
    Number(input.appStartedAt) || 0
  );
  const silenceMs = Math.max(0, nowMs - baseActivity);
  const intervalMs = policy.intervalMinutes * 60 * 1000;
  if (silenceMs < intervalMs) {
    return {
      shouldSpeak: false,
      nextCheckMs: Math.max(60 * 1000, intervalMs - silenceMs),
      reason: 'waiting'
    };
  }

  if (mind.pendingQuestion && mind.pendingQuestionAt > 0) {
    return { shouldSpeak: true, reason: 'pending_question', pendingQuestion: mind.pendingQuestion };
  }
  if (mind.activeTopic) {
    return { shouldSpeak: true, reason: 'continue_topic', topic: mind.activeTopic };
  }
  if (!mind.lastUserMessageAt) {
    return { shouldSpeak: true, reason: 'first_greeting' };
  }
  return { shouldSpeak: true, reason: 'caring_check_in' };
}

function weatherDescription(code) {
  const descriptions = {
    0: '晴朗',
    1: '大体晴朗',
    2: '局部多云',
    3: '阴天',
    45: '有雾',
    48: '雾凇',
    51: '小毛毛雨',
    53: '毛毛雨',
    55: '较强毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    80: '阵雨',
    81: '较强阵雨',
    82: '强阵雨',
    95: '雷暴',
    96: '雷暴伴小冰雹',
    99: '雷暴伴冰雹'
  };
  return descriptions[Number(code)] || '天气状况未知';
}

module.exports = {
  BEHAVIOR_PATTERN_DEFINITIONS,
  MIND_MOODS,
  PROACTIVE_POLICIES,
  decideProactive,
  defaultMindState,
  extractBehaviorPatternCandidates,
  effectiveDueAt,
  extractQuestion,
  localDateKey,
  markUserReturned,
  mergeBehaviorPatternObservations,
  normalizeBehaviorPattern,
  normalizeBehaviorPatterns,
  migrateMindState,
  normalizeLifeItem,
  normalizeMindState,
  quietHoursRemaining,
  relationshipStage,
  selectRelevantBehaviorPatterns,
  updateMindAfterTurn,
  weatherDescription
};
