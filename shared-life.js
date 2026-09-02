const { estimateTokenCount } = require('./context-engine');
const { evidenceAppearsInSource } = require('./memory-extractor');
const { canonicalizeMemoryKey } = require('./memory-engine');

const EPISODE_CATEGORIES = new Set([
  'milestone', 'emotion', 'relationship', 'achievement', 'setback', 'health', 'daily', 'other'
]);
const TOPIC_STATUSES = new Set(['active', 'waiting', 'resolved', 'paused']);

function cleanText(value, limit = 600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function textKey(value) {
  return cleanText(value, 1000)
    .toLocaleLowerCase('zh-CN')
    .replace(/[，。！？、,.!?\s'"“”‘’：:；;]/g, '')
    .slice(0, 160);
}

function terms(value) {
  const normalized = cleanText(value, 3000).toLocaleLowerCase('zh-CN');
  const result = new Set(normalized.match(/[a-z0-9][a-z0-9_-]{1,}|[\u3400-\u9fff]{2}/g) || []);
  for (const run of normalized.match(/[\u3400-\u9fff]{3,}/g) || []) {
    for (let index = 0; index < run.length - 1; index += 1) result.add(run.slice(index, index + 2));
  }
  return result;
}

function overlap(leftValue, rightValue) {
  const left = terms(leftValue);
  const right = terms(rightValue);
  if (!left.size || !right.size) return 0;
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count / Math.max(1, Math.min(left.size, right.size));
}

function episodeCategory(text) {
  if (/第一次|纪念|在一起|告白|恋爱|约会|和好/.test(text)) return 'relationship';
  if (/通过|成功|完成|拿到|获得|终于|毕业|录取|升职/.test(text)) return 'achievement';
  if (/失败|没通过|被拒|失去|分手|吵架|搞砸/.test(text)) return 'setback';
  if (/生病|发烧|住院|手术|失眠|身体|康复/.test(text)) return 'health';
  if (/开心|难过|焦虑|害怕|委屈|感动|幸福|压力/.test(text)) return 'emotion';
  if (/生日|周年|重要|决定|开始|结束/.test(text)) return 'milestone';
  return 'daily';
}

function episodeTitle(text) {
  const normalized = cleanText(text, 120).replace(/^(今天|昨天|刚刚|刚才|最近)[，,：:\s]*/, '');
  return normalized.length > 30 ? `${normalized.slice(0, 30)}…` : normalized;
}

function extractEpisodeCandidates(value) {
  const source = cleanText(value, 12000);
  if (!source) return [];
  const statements = source
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((item) => cleanText(item, 300))
    .filter((item) => item.length >= 5);
  const strongPattern = /第一次|终于|成功|失败|通过|录取|毕业|升职|离职|分手|告白|在一起|吵架|和好|生病|发烧|住院|手术|康复|生日|周年|决定了|完成了|发生了|特别开心|很难过|非常焦虑|压力很大|记住这一天/;
  return statements
    .filter((statement) => strongPattern.test(statement))
    .map((statement) => ({
      title: episodeTitle(statement),
      summary: `用户说：${statement}`,
      category: episodeCategory(statement),
      emotion: /开心|成功|通过|录取|幸福|感动/.test(statement)
        ? 'positive'
        : /难过|失败|焦虑|害怕|生病|吵架|分手/.test(statement)
          ? 'negative'
          : 'mixed',
      importance: /第一次|终于|录取|毕业|升职|分手|告白|在一起|住院|手术|生日|周年/.test(statement) ? 5 : 4,
      evidence: statement,
      confidence: 0.98
    }))
    .slice(0, 4);
}

function normalizeEpisode(value, fallback = {}) {
  const now = new Date().toISOString();
  const evidence = cleanText(value?.evidence || fallback.evidence, 300);
  const summary = cleanText(value?.summary || value?.text || fallback.summary, 600);
  return {
    id: String(value?.id || fallback.id || makeId('episode')).slice(0, 120),
    title: cleanText(value?.title || fallback.title || episodeTitle(summary), 100),
    summary,
    category: EPISODE_CATEGORIES.has(value?.category) ? value.category : (fallback.category || 'other'),
    emotion: ['positive', 'negative', 'mixed', 'neutral'].includes(value?.emotion) ? value.emotion : (fallback.emotion || 'neutral'),
    importance: Math.max(1, Math.min(5, Math.round(Number(value?.importance) || Number(fallback.importance) || 3))),
    pinned: value?.pinned === true || fallback.pinned === true,
    evidence,
    confidence: Math.max(0, Math.min(1, Number(value?.confidence) || Number(fallback.confidence) || 0.8)),
    sourceSessionId: String(value?.sourceSessionId || fallback.sourceSessionId || '').slice(0, 120),
    sourceMessageId: String(value?.sourceMessageId || fallback.sourceMessageId || '').slice(0, 120),
    sourceCreatedAt: value?.sourceCreatedAt || fallback.sourceCreatedAt || now,
    recallCount: Math.max(0, Number(value?.recallCount) || 0),
    lastRecalledAt: value?.lastRecalledAt || '',
    createdAt: value?.createdAt || fallback.createdAt || now,
    updatedAt: value?.updatedAt || fallback.updatedAt || now
  };
}

function mergeEpisodes(existing, candidates, options = {}) {
  const sourceText = cleanText(options.sourceText, 12000);
  const now = options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const max = Math.max(1, Number(options.max) || 2000);
  const result = (Array.isArray(existing) ? existing : []).map((item) => normalizeEpisode(item));
  const stats = { added: 0, updated: 0, skipped: 0 };
  for (const raw of (Array.isArray(candidates) ? candidates : []).slice(0, 8)) {
    const candidate = normalizeEpisode(raw, {
      sourceSessionId: options.sourceSessionId,
      sourceMessageId: options.sourceMessageId,
      sourceCreatedAt: options.sourceCreatedAt || now
    });
    if (candidate.title.length < 3 || candidate.summary.length < 5) {
      stats.skipped += 1;
      continue;
    }
    if (sourceText && !evidenceAppearsInSource(candidate.evidence, sourceText)) {
      stats.skipped += 1;
      continue;
    }
    if (!sourceText && options.allowWithoutEvidence !== true) {
      stats.skipped += 1;
      continue;
    }
    const match = result.find((item) => (
      (candidate.evidence && textKey(item.evidence) === textKey(candidate.evidence))
      || overlap(`${item.title} ${item.summary}`, `${candidate.title} ${candidate.summary}`) >= 0.78
    ));
    if (match) {
      match.title = candidate.title || match.title;
      match.summary = candidate.summary.length >= match.summary.length ? candidate.summary : match.summary;
      match.category = candidate.category;
      match.emotion = candidate.emotion;
      match.importance = Math.max(match.importance, candidate.importance);
      match.confidence = Math.max(match.confidence, candidate.confidence);
      match.evidence = candidate.evidence || match.evidence;
      match.sourceSessionId = candidate.sourceSessionId || match.sourceSessionId;
      match.sourceMessageId = candidate.sourceMessageId || match.sourceMessageId;
      match.sourceCreatedAt = candidate.sourceCreatedAt || match.sourceCreatedAt;
      match.updatedAt = now;
      stats.updated += 1;
    } else {
      result.push({ ...candidate, createdAt: now, updatedAt: now });
      stats.added += 1;
    }
  }
  result.sort((left, right) => (
    Number(right.pinned) - Number(left.pinned)
    || String(right.sourceCreatedAt).localeCompare(String(left.sourceCreatedAt))
  ));
  return { episodes: result.slice(0, max), stats };
}

function selectEpisodeContext(episodes, messages, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 12);
  const tokenBudget = Math.max(1000, Number(options.tokenBudget) || 10000);
  const query = (Array.isArray(messages) ? messages : []).slice(-8).map((item) => item?.content).join(' ');
  const excludedEvidence = (Array.isArray(options.excludedEvidence) ? options.excludedEvidence : [])
    .map((value) => cleanText(value, 300))
    .filter(Boolean);
  const now = Number(options.now) || Date.now();
  const ranked = (Array.isArray(episodes) ? episodes : [])
    .map((episode) => {
      const timestamp = new Date(episode.sourceCreatedAt || episode.createdAt || 0).getTime();
      const ageDays = timestamp > 0 ? Math.max(0, (now - timestamp) / 86400000) : 365;
      const relevance = overlap(query, `${episode.title} ${episode.summary} ${episode.evidence}`);
      const score = relevance * 40 + Number(episode.importance || 1) * 3
        + (episode.pinned ? 25 : 0) + Math.max(0, 8 - Math.log10(ageDays + 1) * 3);
      const duplicatesFact = excludedEvidence.some((evidence) => (
        evidence.length >= 4
        && (episode.evidence.includes(evidence) || evidence.includes(episode.evidence))
      ));
      return { episode, score, relevance, duplicatesFact };
    })
    .filter((item) => !item.duplicatesFact && (item.episode.pinned || item.relevance >= 0.08))
    .sort((left, right) => right.score - left.score);
  const selected = [];
  let used = 0;
  for (const item of ranked) {
    if (selected.length >= limit) break;
    const cost = estimateTokenCount(`${item.episode.title} ${item.episode.summary} ${item.episode.evidence}`) + 20;
    if (used + cost > tokenBudget) continue;
    selected.push(item.episode);
    used += cost;
  }
  return selected;
}

function normalizeTopic(value, fallback = {}) {
  const now = new Date().toISOString();
  return {
    id: String(value?.id || fallback.id || makeId('topic')).slice(0, 120),
    key: textKey(value?.key || fallback.key || value?.title || fallback.title),
    title: cleanText(value?.title || fallback.title, 100),
    summary: cleanText(value?.summary || fallback.summary, 500),
    status: TOPIC_STATUSES.has(value?.status) ? value.status : (fallback.status || 'active'),
    pendingQuestion: cleanText(value?.pendingQuestion || fallback.pendingQuestion, 240),
    evidence: cleanText(value?.evidence || fallback.evidence, 300),
    sourceSessionId: String(value?.sourceSessionId || fallback.sourceSessionId || '').slice(0, 120),
    nextFollowUpAt: Math.max(0, Number(value?.nextFollowUpAt) || Number(fallback.nextFollowUpAt) || 0),
    followUpCount: Math.max(0, Number(value?.followUpCount) || 0),
    lastUserResponseAt: Math.max(0, Number(value?.lastUserResponseAt) || 0),
    createdAt: value?.createdAt || fallback.createdAt || now,
    updatedAt: value?.updatedAt || fallback.updatedAt || now,
    resolvedAt: value?.resolvedAt || ''
  };
}

function topicMatch(items, candidate) {
  return items.find((item) => (
    (candidate.key && item.key === candidate.key)
    || overlap(`${item.title} ${item.summary}`, `${candidate.title} ${candidate.summary}`) >= 0.55
  ));
}

function updateTopicThreads(existing, input = {}) {
  const nowMs = Number(input.now) || Date.now();
  const now = new Date(nowMs).toISOString();
  const userText = cleanText(input.userText, 12000);
  const result = (Array.isArray(existing) ? existing : []).map((item) => normalizeTopic(item));
  const stats = { added: 0, updated: 0, resolved: 0, skipped: 0 };
  const open = result.filter((item) => ['active', 'waiting'].includes(item.status));
  if (userText && /(?:这件事|这个话题)?(?:已经)?(?:解决|完成|结束)了|不用再问|别再提|先不聊这个/.test(userText)) {
    const target = open
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .find((item) => overlap(userText, `${item.title} ${item.summary}`) > 0 || open.length === 1);
    if (target) {
      target.status = /先不聊/.test(userText) ? 'paused' : 'resolved';
      target.pendingQuestion = '';
      target.nextFollowUpAt = 0;
      target.resolvedAt = now;
      target.updatedAt = now;
      stats.resolved += 1;
    }
  }
  if (userText) {
    const responding = open
      .filter((item) => item.pendingQuestion)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
    if (responding) {
      responding.lastUserResponseAt = nowMs;
      responding.status = 'active';
      responding.pendingQuestion = '';
      responding.nextFollowUpAt = 0;
      responding.updatedAt = now;
    }
  }
  const candidates = Array.isArray(input.candidates) ? input.candidates.slice(0, 6) : [];
  if (input.reply?.mind?.pendingQuestion) {
    candidates.unshift({
      title: input.reply.mind.topic || episodeTitle(userText) || '刚才的话题',
      summary: userText ? `围绕用户刚才说的“${cleanText(userText, 180)}”继续关心。` : '等待用户回答麻衣刚才提出的问题。',
      status: input.reply.mind.pendingQuestion ? 'waiting' : 'active',
      pendingQuestion: input.reply.mind.pendingQuestion || '',
      evidence: userText
    });
  }
  for (const raw of candidates) {
    const candidate = normalizeTopic(raw, {
      sourceSessionId: input.sourceSessionId,
      nextFollowUpAt: raw?.pendingQuestion ? nowMs + 6 * 60 * 60 * 1000 : 0
    });
    if (!candidate.title || (!candidate.summary && !candidate.pendingQuestion)) {
      stats.skipped += 1;
      continue;
    }
    if (userText && candidate.evidence && !evidenceAppearsInSource(candidate.evidence, userText)) {
      stats.skipped += 1;
      continue;
    }
    const match = topicMatch(result.filter((item) => item.status !== 'resolved'), candidate);
    if (match) {
      match.title = candidate.title || match.title;
      match.summary = candidate.summary || match.summary;
      match.status = candidate.status;
      match.pendingQuestion = candidate.pendingQuestion;
      match.evidence = candidate.evidence || match.evidence;
      match.sourceSessionId = candidate.sourceSessionId || match.sourceSessionId;
      match.nextFollowUpAt = candidate.pendingQuestion ? (candidate.nextFollowUpAt || nowMs + 21600000) : 0;
      match.updatedAt = now;
      match.resolvedAt = '';
      stats.updated += 1;
    } else {
      result.push({ ...candidate, createdAt: now, updatedAt: now });
      stats.added += 1;
    }
  }
  result.sort((left, right) => (
    Number(['active', 'waiting'].includes(right.status)) - Number(['active', 'waiting'].includes(left.status))
    || String(right.updatedAt).localeCompare(String(left.updatedAt))
  ));
  return { topics: result.slice(0, Math.max(1, Number(input.max) || 500)), stats };
}

function selectTopicContext(topics, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 6);
  const query = (Array.isArray(options.messages) ? options.messages : [])
    .slice(-6)
    .map((message) => message?.content)
    .join(' ');
  return (Array.isArray(topics) ? topics : [])
    .filter((item) => ['active', 'waiting'].includes(item.status))
    .map((item) => ({
      item,
      relevance: query ? overlap(query, `${item.title} ${item.summary} ${item.evidence}`) : 0
    }))
    .sort((left, right) => (
      right.relevance - left.relevance
      || Number(Boolean(right.item.pendingQuestion)) - Number(Boolean(left.item.pendingQuestion))
      || String(right.item.updatedAt).localeCompare(String(left.item.updatedAt))
    ))
    .slice(0, limit)
    .map(({ item }) => item);
}

function normalizeMemoryCorrection(value) {
  return {
    id: String(value?.id || makeId('memory-correction')).slice(0, 120),
    targetKey: canonicalizeMemoryKey(value?.targetKey),
    targetTextKey: textKey(value?.targetTextKey || value?.targetText),
    evidence: cleanText(value?.evidence, 300),
    note: cleanText(value?.note, 300),
    createdAt: value?.createdAt || new Date().toISOString()
  };
}

function memoryCandidateIsBlocked(candidate, corrections) {
  const key = canonicalizeMemoryKey(candidate?.key);
  const candidateTextKey = textKey(candidate?.text);
  return (Array.isArray(corrections) ? corrections : []).some((raw) => {
    const item = normalizeMemoryCorrection(raw);
    return (key && item.targetKey && key === item.targetKey)
      || (candidateTextKey && item.targetTextKey && candidateTextKey === item.targetTextKey);
  });
}

module.exports = {
  EPISODE_CATEGORIES,
  TOPIC_STATUSES,
  cleanText,
  extractEpisodeCandidates,
  memoryCandidateIsBlocked,
  mergeEpisodes,
  normalizeEpisode,
  normalizeMemoryCorrection,
  normalizeTopic,
  selectEpisodeContext,
  selectTopicContext,
  textKey,
  updateTopicThreads
};
