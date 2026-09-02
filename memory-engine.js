const MAX_EVIDENCE_TRAIL = 8;

const EXACT_KEY_ALIASES = new Map([
  ['identity.occupation', 'identity.job'],
  ['identity.career', 'identity.job'],
  ['identity.profession', 'identity.job'],
  ['identity.work', 'identity.job'],
  ['identity.city', 'identity.location'],
  ['identity.residence', 'identity.location'],
  ['identity.current_location', 'identity.location'],
  ['identity.university', 'identity.school'],
  ['identity.college', 'identity.school'],
  ['identity.field', 'identity.major'],
  ['relationship.nickname', 'relationship.user_nickname'],
  ['relationship.usernickname', 'relationship.user_nickname'],
  ['relationship.preferred_name', 'relationship.user_nickname'],
  ['relationship.call_me', 'relationship.user_nickname'],
  ['preference.movies', 'preference.movie'],
  ['preference.film', 'preference.movie'],
  ['preference.films', 'preference.movie']
]);

const CATEGORY_ALIASES = new Map([
  ['profile', 'identity'],
  ['personal', 'identity'],
  ['preferences', 'preference'],
  ['relation', 'relationship'],
  ['relationships', 'relationship'],
  ['goals', 'goal'],
  ['routines', 'routine'],
  ['boundaries', 'boundary']
]);

const QUERY_CATEGORY_PATTERNS = [
  ['identity', /名字|姓名|年龄|生日|住(?:在|哪里)|地点|城市|学校|专业|工作|职业|身份/],
  ['relationship', /称呼|昵称|关系|朋友|同事|同学|家人|妈妈|爸爸|伴侣|对象/],
  ['preference', /喜欢|偏好|口味|爱好|讨厌|不喜欢|电影|咖啡|饮料|音乐|食物/],
  ['goal', /目标|计划|准备|打算|梦想|考试|完成|进度/],
  ['routine', /习惯|每天|每周|作息|经常|通常/],
  ['boundary', /边界|不能接受|不要|不希望|介意/],
  ['experience', /以前|曾经|经历|发生|过去|小时候/]
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function normalizeMemoryKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[^a-z0-9\u3400-\u9fff_.-]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80);
}

function canonicalizeMemoryKey(value) {
  const normalized = normalizeMemoryKey(value);
  if (!normalized) return '';
  if (EXACT_KEY_ALIASES.has(normalized)) return EXACT_KEY_ALIASES.get(normalized);
  const parts = normalized.split('.').filter(Boolean);
  if (!parts.length) return '';
  parts[0] = CATEGORY_ALIASES.get(parts[0]) || parts[0];
  const canonical = parts.join('.').slice(0, 80);
  return EXACT_KEY_ALIASES.get(canonical) || canonical;
}

function memoryTextKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[，。！？、,.!?\s'"“”‘’：:；;]/g, '');
}

function textTokens(value) {
  const normalized = String(value || '').toLocaleLowerCase('zh-CN');
  const tokens = new Set();
  const latinWords = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
  latinWords.forEach((word) => tokens.add(word));
  const chineseRuns = normalized.match(/[\u3400-\u9fff]+/g) || [];
  for (const run of chineseRuns) {
    if (run.length <= 2) {
      tokens.add(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.add(run.slice(index, index + 2));
    }
  }
  return tokens;
}

function tokenSimilarity(leftValue, rightValue) {
  const left = textTokens(leftValue);
  const right = textTokens(rightValue);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function factPriority(fact) {
  return (fact?.pinned === true ? 100 : 0)
    + (fact?.source === 'manual' ? 50 : 0)
    + (fact?.temporalStatus === 'current' ? 25 : 0)
    + clamp(fact?.confidence, 0, 1) * 10
    + clamp(fact?.importance, 1, 5);
}

function findMemoryMatch(facts, candidate, textKey = memoryTextKey(candidate?.text)) {
  const candidateKey = canonicalizeMemoryKey(candidate?.key);
  if (candidateKey) {
    const keyed = (Array.isArray(facts) ? facts : [])
      .filter((fact) => canonicalizeMemoryKey(fact.key) === candidateKey)
      .sort((left, right) => (
        factPriority(right) - factPriority(left)
        || String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
      ))[0];
    if (keyed) return keyed;
  }

  const exact = (Array.isArray(facts) ? facts : []).find((fact) => {
    const existingTextKey = String(fact._textKey || memoryTextKey(fact.text));
    return existingTextKey === textKey
      || (textKey.length >= 12 && existingTextKey.length >= 12
        && (existingTextKey.includes(textKey) || textKey.includes(existingTextKey)));
  });
  if (exact) return exact;

  const category = String(candidate?.category || 'other');
  return (Array.isArray(facts) ? facts : []).find((fact) => (
    fact.category === category
    && tokenSimilarity(fact.text, candidate?.text) >= 0.9
  ));
}

function normalizeEvidenceItem(value = {}, fallback = {}) {
  const evidence = String(value.evidence || value.text || fallback.evidence || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  if (!evidence) return null;
  return {
    evidence,
    sourceSessionId: String(value.sourceSessionId || value.sessionId || fallback.sourceSessionId || '').slice(0, 120),
    sourceMessageId: String(value.sourceMessageId || value.messageId || fallback.sourceMessageId || '').slice(0, 120),
    sourceCreatedAt: value.sourceCreatedAt || value.createdAt || fallback.sourceCreatedAt || '',
    recordedAt: value.recordedAt || fallback.recordedAt || value.sourceCreatedAt || value.createdAt || ''
  };
}

function evidenceIdentity(item) {
  if (item.sourceMessageId) return `message:${item.sourceSessionId}:${item.sourceMessageId}`;
  return `evidence:${memoryTextKey(item.evidence)}:${item.sourceCreatedAt || ''}`;
}

function normalizeEvidenceTrail(value, fallback = {}) {
  const source = Array.isArray(value) ? value : [];
  const items = source.map((item) => normalizeEvidenceItem(item)).filter(Boolean);
  const fallbackItem = normalizeEvidenceItem(fallback);
  if (fallbackItem && !items.length) items.push(fallbackItem);
  const unique = new Map();
  for (const item of items) unique.set(evidenceIdentity(item), item);
  return Array.from(unique.values()).slice(-MAX_EVIDENCE_TRAIL);
}

function appendEvidenceTrail(trail, value) {
  const item = normalizeEvidenceItem(value);
  const current = normalizeEvidenceTrail(trail);
  if (!item) return { trail: current, added: false };
  const identity = evidenceIdentity(item);
  const added = !current.some((entry) => evidenceIdentity(entry) === identity);
  if (!added) return { trail: current, added: false };
  return { trail: [...current, item].slice(-MAX_EVIDENCE_TRAIL), added: true };
}

function queryProfile(messages) {
  const source = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .slice(-8);
  const weightedTokens = new Map();
  for (let index = 0; index < source.length; index += 1) {
    const message = source[index];
    const distance = source.length - 1 - index;
    const weight = message.role === 'user'
      ? distance === 0 ? 5 : Math.max(1.25, 3.5 - distance * 0.45)
      : Math.max(0.35, 1.1 - distance * 0.2);
    for (const token of textTokens(message.content)) {
      weightedTokens.set(token, Math.max(weightedTokens.get(token) || 0, weight));
    }
  }
  const latestUser = [...source].reverse().find((message) => message.role === 'user')?.content || '';
  const categories = new Set();
  for (const [category, pattern] of QUERY_CATEGORY_PATTERNS) {
    if (pattern.test(latestUser)) categories.add(category);
  }
  const keyHints = new Set();
  if (/工作|职业/.test(latestUser)) keyHints.add('identity.job');
  if (/住(?:在|哪里)|地点|城市|搬到/.test(latestUser)) keyHints.add('identity.location');
  if (/名字|姓名/.test(latestUser)) keyHints.add('identity.name');
  if (/生日/.test(latestUser)) keyHints.add('identity.birthday');
  if (/称呼|昵称|叫我/.test(latestUser)) keyHints.add('relationship.user_nickname');
  return {
    categories,
    historicalIntent: /以前|曾经|过去|原来|当时|历史|之前/.test(latestUser),
    keyHints,
    latestUser,
    weightedTokens
  };
}

function memorySearchText(fact) {
  return [
    fact?.text,
    canonicalizeMemoryKey(fact?.key).replace(/[._-]+/g, ' '),
    fact?.category,
    fact?.evidence,
    ...(Array.isArray(fact?.history) ? fact.history.flatMap((entry) => [entry?.text, entry?.evidence]) : [])
  ].filter(Boolean).join(' ');
}

function memoryRelevanceScore(fact, profile, now) {
  const memoryTokens = textTokens(memorySearchText(fact));
  let relevance = 0;
  for (const [token, weight] of profile.weightedTokens) {
    if (memoryTokens.has(token)) relevance += weight;
  }
  const canonicalKey = canonicalizeMemoryKey(fact?.key);
  const semanticKeyBonus = profile.keyHints.has(canonicalKey) ? 28 : 0;
  const categoryBonus = profile.categories.has(fact?.category) ? 8 : 0;
  const importance = clamp(fact?.importance || 1, 1, 5);
  const pinnedBonus = fact?.pinned === true ? 20 : 0;
  const coreBonus = ['identity', 'relationship', 'boundary'].includes(fact?.category) ? 4 : 0;
  const confidence = clamp(fact?.confidence ?? (fact?.source === 'manual' ? 1 : 0.75), 0, 1);
  const confidenceBonus = confidence * 6;
  const confirmationBonus = Math.min(3, Math.log2(Math.max(1, Number(fact?.confirmationCount) || 1)));
  const temporal = fact?.temporalStatus || 'current';
  const temporalAdjustment = temporal === 'current'
    ? 6
    : temporal === 'future'
      ? 2
      : temporal === 'historical'
        ? profile.historicalIntent ? -1 : -14
        : -9;
  const updatedAt = new Date(fact?.updatedAt || fact?.createdAt || 0).getTime();
  const ageDays = Number.isFinite(updatedAt) && updatedAt > 0
    ? Math.max(0, (now - updatedAt) / 86400000)
    : 365;
  const recency = Math.max(0, 2.5 - Math.log10(ageDays + 1));
  return relevance * 5 + semanticKeyBonus + categoryBonus + importance * 1.4
    + pinnedBonus + coreBonus + confidenceBonus + confirmationBonus + temporalAdjustment + recency;
}

function rankMemoryEntries(facts, messages, now = Date.now()) {
  const profile = queryProfile(messages);
  return (Array.isArray(facts) ? facts : [])
    .map((fact) => ({ fact, score: memoryRelevanceScore(fact, profile, now) }))
    .sort((left, right) => (
      right.score - left.score
      || factPriority(right.fact) - factPriority(left.fact)
      || String(right.fact.updatedAt || '').localeCompare(String(left.fact.updatedAt || ''))
    ));
}

function rankMemories(facts, messages, limit = 36, now = Date.now()) {
  return rankMemoryEntries(facts, messages, now)
    .slice(0, Math.max(1, limit))
    .map(({ fact }) => fact);
}

function isCoreMemory(fact) {
  if (fact?.pinned === true) return true;
  if (fact?.temporalStatus && fact.temporalStatus !== 'current'
    && !(fact.category === 'goal' && fact.temporalStatus === 'future')) return false;
  if (!['identity', 'relationship', 'boundary', 'goal'].includes(fact?.category)) return false;
  return (fact?.source === 'manual' || Number(fact?.confidence) >= 0.92)
    && Number(fact?.importance || 0) >= 4;
}

function resolveCanonicalFactConflicts(facts) {
  const result = Array.isArray(facts) ? facts : [];
  const currentByKey = new Map();
  for (const fact of result) {
    const key = canonicalizeMemoryKey(fact?.key);
    if (!key || (fact?.temporalStatus || 'current') !== 'current') continue;
    if (!currentByKey.has(key)) currentByKey.set(key, []);
    currentByKey.get(key).push(fact);
  }
  for (const entries of currentByKey.values()) {
    if (entries.length <= 1) continue;
    const sorted = entries.slice().sort((left, right) => (
      factPriority(right) - factPriority(left)
      || String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
    ));
    const winner = sorted[0];
    for (const previous of sorted.slice(1)) {
      previous.temporalStatus = 'historical';
      previous.validTo = previous.validTo || winner.updatedAt || new Date().toISOString();
    }
  }
  return result;
}

function selectMemoryContext(facts, messages, options = {}) {
  const allFacts = Array.isArray(facts) ? facts : [];
  const totalLimit = Math.max(8, Number(options.totalLimit) || 32);
  const coreLimit = Math.max(4, Number(options.coreLimit) || 10);
  const relevantLimit = Math.max(4, Number(options.relevantLimit) || 20);
  const recentLimit = Math.max(0, Number(options.recentLimit) || 3);
  const minimumRelevantScore = Number(options.minimumRelevantScore) || 18;
  const profile = queryProfile(messages);
  const ranked = rankMemoryEntries(allFacts, messages, Number(options.now) || Date.now());
  const scoreById = new Map(ranked.map((item) => [item.fact.id, item.score]));
  const selected = [];
  const selectedIds = new Set();
  const selectedCurrentKeys = new Set();
  const append = (items, limit = Infinity) => {
    let added = 0;
    for (const fact of items) {
      if (selected.length >= totalLimit || added >= limit || selectedIds.has(fact.id)) continue;
      const key = canonicalizeMemoryKey(fact.key);
      if (key && fact.temporalStatus === 'current' && selectedCurrentKeys.has(key)) continue;
      selected.push(fact);
      selectedIds.add(fact.id);
      if (key && fact.temporalStatus === 'current') selectedCurrentKeys.add(key);
      added += 1;
    }
  };

  const core = allFacts
    .filter(isCoreMemory)
    .sort((left, right) => (
      factPriority(right) - factPriority(left)
      || String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
    ));
  append(core, coreLimit);

  const relevant = ranked
    .filter(({ fact, score }) => (
      score >= minimumRelevantScore
      && (fact.temporalStatus !== 'historical' || profile.historicalIntent || score >= 40)
    ))
    .map(({ fact }) => fact);
  append(relevant, relevantLimit);

  const contextualRecent = allFacts
    .filter((fact) => (
      (fact.temporalStatus || 'current') === 'current'
      && Number(fact.confidence ?? 0.75) >= 0.7
      && Number(fact.importance || 0) >= 3
      && (scoreById.get(fact.id) || 0) >= minimumRelevantScore - 4
    ))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  append(contextualRecent, recentLimit);
  append(relevant);
  return selected.slice(0, totalLimit);
}

module.exports = {
  MAX_EVIDENCE_TRAIL,
  appendEvidenceTrail,
  canonicalizeMemoryKey,
  findMemoryMatch,
  memoryRelevanceScore,
  memoryTextKey,
  normalizeEvidenceTrail,
  normalizeMemoryKey,
  rankMemories,
  resolveCanonicalFactConflicts,
  selectMemoryContext,
  textTokens,
  tokenSimilarity
};
