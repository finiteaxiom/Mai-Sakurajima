const crypto = require('crypto');
const { evidenceAppearsInSource } = require('./memory-extractor');
const { textTokens } = require('./memory-engine');

const TIMELINE_TYPES = new Set(['episode', 'memory', 'moment', 'task', 'relationship', 'project', 'habit', 'focus', 'manual']);
const PERSON_RELATIONS = new Set([
  '妈妈', '母亲', '爸爸', '父亲', '姐姐', '妹妹', '哥哥', '弟弟', '奶奶', '爷爷',
  '外婆', '外公', '朋友', '同事', '同学', '老师', '室友', '女朋友', '男朋友',
  '妻子', '丈夫', '老婆', '老公', '伴侣', '上司', '邻居'
]);
const TEMPORAL_STATUSES = new Set(['current', 'historical', 'future', 'uncertain']);

function cleanText(value, limit = 600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function stableId(prefix, ...parts) {
  const hash = crypto.createHash('sha1').update(parts.map((part) => String(part || '')).join('\u241f')).digest('hex');
  return `${prefix}-${hash.slice(0, 20)}`;
}

function validIso(value, fallback = '') {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : fallback;
}

function localDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  return localDayKey(local);
}

function normalizeSource(value = {}) {
  return {
    sessionId: cleanText(value.sessionId || value.sourceSessionId, 120),
    messageId: cleanText(value.messageId || value.sourceMessageId, 120),
    role: value.role === 'assistant' ? 'assistant' : 'user',
    evidence: cleanText(value.evidence, 300),
    createdAt: validIso(value.createdAt || value.sourceCreatedAt)
  };
}

function normalizeTimelineEntry(value = {}, fallback = {}) {
  const source = normalizeSource(value.source || value);
  const occurredAt = validIso(
    value.occurredAt || value.eventAt || source.createdAt || value.createdAt,
    new Date().toISOString()
  );
  const originType = cleanText(value.originType || fallback.originType || value.type, 40) || 'manual';
  const originId = cleanText(value.originId || fallback.originId, 120);
  return {
    id: cleanText(value.id, 120) || stableId('timeline', originType, originId, value.title, occurredAt),
    type: TIMELINE_TYPES.has(value.type) ? value.type : (TIMELINE_TYPES.has(fallback.type) ? fallback.type : 'manual'),
    originType,
    originId,
    title: cleanText(value.title || fallback.title, 120),
    summary: cleanText(value.summary || value.content || fallback.summary, 800),
    occurredAt,
    endAt: validIso(value.endAt),
    importance: Math.max(1, Math.min(5, Math.round(Number(value.importance) || Number(fallback.importance) || 3))),
    status: ['active', 'completed', 'historical'].includes(value.status) ? value.status : (fallback.status || 'historical'),
    tags: [...new Set((Array.isArray(value.tags) ? value.tags : []).map((item) => cleanText(item, 30)).filter(Boolean))].slice(0, 12),
    personIds: [...new Set((Array.isArray(value.personIds) ? value.personIds : []).map(String))].slice(0, 20),
    source,
    pinned: value.pinned === true,
    createdAt: validIso(value.createdAt, occurredAt),
    updatedAt: validIso(value.updatedAt, occurredAt)
  };
}

function timelineFromEpisode(episode) {
  return normalizeTimelineEntry({
    id: stableId('timeline', 'episode', episode.id),
    type: 'episode',
    originType: 'episode',
    originId: episode.id,
    title: episode.title,
    summary: episode.summary,
    occurredAt: episode.sourceCreatedAt || episode.createdAt,
    importance: episode.importance,
    status: 'historical',
    tags: [episode.category, episode.emotion].filter(Boolean),
    pinned: episode.pinned === true,
    source: {
      sessionId: episode.sourceSessionId,
      messageId: episode.sourceMessageId,
      role: 'user',
      evidence: episode.evidence,
      createdAt: episode.sourceCreatedAt
    }
  });
}

function timelineFromMoment(moment) {
  return normalizeTimelineEntry({
    id: stableId('timeline', 'moment', moment.id),
    type: 'moment',
    originType: 'moment',
    originId: moment.id,
    title: '麻衣发布了一条私人动态',
    summary: moment.content,
    occurredAt: moment.createdAt,
    importance: 2,
    status: 'historical',
    tags: ['朋友圈'],
    source: { role: 'assistant', createdAt: moment.createdAt }
  });
}

function timelineFromLifeItem(item) {
  return normalizeTimelineEntry({
    id: stableId('timeline', 'life-item', item.id),
    type: 'task',
    originType: 'life-item',
    originId: item.id,
    title: item.title,
    summary: item.note || `${item.kind || '事项'} · ${item.completed ? '已经完成' : '等待完成'}`,
    occurredAt: item.dueAt || item.createdAt,
    importance: item.kind === 'anniversary' ? 5 : 3,
    status: item.completed ? 'completed' : 'active',
    tags: [item.kind].filter(Boolean),
    source: { role: 'user', createdAt: item.createdAt }
  });
}

function timelineFromMemory(fact) {
  const temporal = normalizeTemporalMetadata(fact, fact.sourceCreatedAt || fact.createdAt);
  return normalizeTimelineEntry({
    id: stableId('timeline', 'memory', fact.id),
    type: 'memory',
    originType: 'memory',
    originId: fact.id,
    title: fact.category === 'goal' ? '记录了一项目标' : '形成了一条重要记忆',
    summary: fact.text,
    occurredAt: temporal.validFrom || fact.sourceCreatedAt || fact.createdAt,
    endAt: temporal.validTo,
    importance: fact.importance,
    status: temporal.status === 'current' || temporal.status === 'future' ? 'active' : 'historical',
    tags: [fact.category, temporal.status].filter(Boolean),
    pinned: fact.pinned === true,
    source: {
      sessionId: fact.sourceSessionId,
      messageId: fact.sourceMessageId,
      role: 'user',
      evidence: fact.evidence,
      createdAt: fact.sourceCreatedAt
    }
  });
}

function timelineFromPerson(person) {
  const evidence = Array.isArray(person.evidence) ? person.evidence[0] : null;
  return normalizeTimelineEntry({
    id: stableId('timeline', 'person', person.id),
    type: 'relationship',
    originType: 'person',
    originId: person.id,
    title: `记住了${person.name}与你的关系`,
    summary: `${person.name}是你的${person.relation}${person.notes ? `；${person.notes}` : ''}`,
    occurredAt: person.firstSeenAt || person.createdAt,
    importance: ['伴侣', '妻子', '丈夫', '老婆', '老公', '女朋友', '男朋友'].includes(person.relation) ? 5 : 3,
    status: 'active',
    tags: ['人物关系', person.relation],
    source: {
      sessionId: evidence?.sessionId,
      messageId: evidence?.messageId,
      role: 'user',
      evidence: evidence?.text,
      createdAt: evidence?.createdAt || person.firstSeenAt
    }
  });
}

function timelineFromProject(project) {
  return normalizeTimelineEntry({
    id: stableId('timeline', 'project', project.id),
    type: 'project',
    originType: 'project',
    originId: project.id,
    title: project.title,
    summary: project.outcome || `${project.progress || 0}% · ${project.status || 'active'}`,
    occurredAt: project.targetAt || project.createdAt,
    importance: project.priority,
    status: project.status === 'completed' ? 'completed' : project.status === 'active' ? 'active' : 'historical',
    tags: ['项目', project.status].filter(Boolean),
    source: project.source
  });
}

function timelineFromHabit(habit) {
  return normalizeTimelineEntry({
    id: stableId('timeline', 'habit', habit.id),
    type: 'habit',
    originType: 'habit',
    originId: habit.id,
    title: `开始追踪习惯：${habit.title}`,
    summary: habit.notes || `${habit.frequency || 'daily'} · 每期 ${habit.targetPerPeriod || 1} 次`,
    occurredAt: habit.createdAt,
    importance: 3,
    status: habit.active === false ? 'historical' : 'active',
    tags: ['习惯', habit.frequency].filter(Boolean),
    source: habit.source
  });
}

function timelineFromFocusSession(session) {
  return normalizeTimelineEntry({
    id: stableId('timeline', 'focus', session.id),
    type: 'focus',
    originType: 'focus',
    originId: session.id,
    title: `完成专注：${session.label}`,
    summary: `${session.actualMinutes || session.plannedMinutes || 0} 分钟 · ${session.mode || 'custom'}`,
    occurredAt: session.endedAt || session.startedAt,
    importance: session.actualMinutes >= 45 ? 4 : 2,
    status: session.status === 'completed' ? 'completed' : 'historical',
    tags: ['专注', session.mode].filter(Boolean)
  });
}

function rebuildTimeline(state = {}, options = {}) {
  const existing = (Array.isArray(state.timeline) ? state.timeline : [])
    .map((item) => normalizeTimelineEntry(item))
    .filter((item) => item.title && item.originType === 'manual');
  const derived = [
    ...(Array.isArray(state.episodes) ? state.episodes : []).map(timelineFromEpisode),
    ...(Array.isArray(state.moments) ? state.moments : []).map(timelineFromMoment),
    ...(Array.isArray(state.lifeItems) ? state.lifeItems : []).map(timelineFromLifeItem),
    ...(Array.isArray(state.people) ? state.people : []).map(timelineFromPerson),
    ...(Array.isArray(state.projects) ? state.projects : []).map(timelineFromProject),
    ...(Array.isArray(state.habits) ? state.habits : []).map(timelineFromHabit),
    ...(Array.isArray(state.assistant?.focusSessions) ? state.assistant.focusSessions : [])
      .filter((session) => session.status === 'completed')
      .map(timelineFromFocusSession),
    ...(Array.isArray(state.facts) ? state.facts : [])
      .filter((fact) => fact.pinned === true || Number(fact.importance) >= 5 || ['experience', 'goal', 'relationship'].includes(fact.category))
      .map(timelineFromMemory)
  ];
  const byId = new Map();
  for (const item of [...existing, ...derived]) {
    if (!item.title) continue;
    const previous = byId.get(item.id);
    byId.set(item.id, previous?.originType === 'manual' ? previous : item);
  }
  return Array.from(byId.values())
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || String(right.occurredAt).localeCompare(String(left.occurredAt)))
    .slice(0, Math.max(100, Number(options.max) || 5000));
}

function personKey(name) {
  return cleanText(name, 80).toLocaleLowerCase('zh-CN').replace(/[\s·・.,，。'"“”‘’]/g, '');
}

function normalizePerson(value = {}, fallback = {}) {
  const name = cleanText(value.name || fallback.name, 80);
  const relation = cleanText(value.relation || fallback.relation, 40);
  const evidenceItems = Array.isArray(value.evidence) ? value.evidence : value.evidence ? [value.evidence] : [];
  const evidence = evidenceItems.map((item) => ({
    text: cleanText(item?.text || item, 300),
    sessionId: cleanText(item?.sessionId || item?.sourceSessionId, 120),
    messageId: cleanText(item?.messageId || item?.sourceMessageId, 120),
    createdAt: validIso(item?.createdAt || item?.sourceCreatedAt)
  })).filter((item) => item.text).slice(-20);
  return {
    id: cleanText(value.id || fallback.id, 120) || stableId('person', personKey(name), relation),
    name,
    relation,
    aliases: [...new Set((Array.isArray(value.aliases) ? value.aliases : []).map((item) => cleanText(item, 40)).filter(Boolean))].slice(0, 12),
    notes: cleanText(value.notes || fallback.notes, 600),
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || Number(fallback.confidence) || 0.85)),
    manual: value.manual === true,
    evidence,
    firstSeenAt: validIso(value.firstSeenAt || fallback.firstSeenAt || evidence[0]?.createdAt, new Date().toISOString()),
    lastSeenAt: validIso(value.lastSeenAt || fallback.lastSeenAt || evidence.at(-1)?.createdAt, new Date().toISOString()),
    createdAt: validIso(value.createdAt || fallback.createdAt, new Date().toISOString()),
    updatedAt: validIso(value.updatedAt || fallback.updatedAt, new Date().toISOString())
  };
}

function extractPersonCandidates(value) {
  const source = cleanText(value, 12000);
  if (!source) return [];
  const relations = Array.from(PERSON_RELATIONS).sort((a, b) => b.length - a.length).join('|');
  const results = [];
  const statements = source.split(/(?<=[。！？!?])|\n+/).map((item) => cleanText(item, 300)).filter(Boolean);
  for (const statement of statements) {
    let match = statement.match(new RegExp(`我(?:的)?(${relations})(?:叫|名叫|名字是|是)[，,\\s]*([^，。！？!?]{1,24})`));
    if (match) results.push({ name: cleanText(match[2], 40), relation: match[1], evidence: statement, confidence: 0.97 });
    match = statement.match(new RegExp(`([^，。！？!?]{1,16})(?:是我(?:的)?)(${relations})`));
    if (match && !/^(他|她|这个人|那个人)$/.test(match[1].trim())) {
      results.push({ name: cleanText(match[1], 40), relation: match[2], evidence: statement, confidence: 0.94 });
    }
    match = statement.match(new RegExp(`我(?:的)?(${relations})(?=今天|昨天|最近|刚才|说|觉得|希望|要|会|在|去|来|给|让我)`));
    if (match) results.push({ name: match[1], relation: match[1], evidence: statement, confidence: 0.86 });
  }
  const unique = new Map();
  for (const item of results) {
    const key = `${personKey(item.name)}:${item.relation}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return Array.from(unique.values()).slice(0, 12);
}

function mergePeople(existing, candidates, options = {}) {
  const now = validIso(options.createdAt, new Date().toISOString());
  const sourceText = cleanText(options.sourceText, 12000);
  const result = (Array.isArray(existing) ? existing : []).map((item) => normalizePerson(item));
  const stats = { added: 0, updated: 0, skipped: 0 };
  for (const raw of (Array.isArray(candidates) ? candidates : []).slice(0, 20)) {
    const evidence = cleanText(raw?.evidence, 300);
    const candidate = normalizePerson({
      ...raw,
      evidence: evidence ? [{
        text: evidence,
        sessionId: options.sessionId,
        messageId: options.messageId,
        createdAt: now
      }] : [],
      firstSeenAt: now,
      lastSeenAt: now
    });
    if (!candidate.name || !candidate.relation || !PERSON_RELATIONS.has(candidate.relation)) {
      stats.skipped += 1;
      continue;
    }
    if (sourceText && !evidenceAppearsInSource(evidence, sourceText)) {
      stats.skipped += 1;
      continue;
    }
    if (!sourceText && options.allowWithoutEvidence !== true && !candidate.manual) {
      stats.skipped += 1;
      continue;
    }
    const match = result.find((item) => (
      personKey(item.name) === personKey(candidate.name)
      || item.aliases.some((alias) => personKey(alias) === personKey(candidate.name))
    ));
    if (match) {
      match.relation = candidate.relation || match.relation;
      match.notes = candidate.notes || match.notes;
      match.confidence = Math.max(match.confidence, candidate.confidence);
      match.evidence = [...match.evidence, ...candidate.evidence].slice(-20);
      match.firstSeenAt = [match.firstSeenAt, candidate.firstSeenAt].filter(Boolean).sort()[0] || now;
      match.lastSeenAt = now;
      match.updatedAt = now;
      stats.updated += 1;
    } else {
      result.push(candidate);
      stats.added += 1;
    }
  }
  result.sort((left, right) => Number(right.manual) - Number(left.manual) || String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)));
  return { people: result.slice(0, Math.max(50, Number(options.max) || 1000)), stats };
}

function rebuildPeopleFromSessions(existing, sessions, options = {}) {
  let people = (Array.isArray(existing) ? existing : []).map((item) => normalizePerson(item));
  const stats = { messages: 0, candidates: 0, added: 0, updated: 0, skipped: 0 };
  for (const session of Array.isArray(sessions) ? sessions : []) {
    for (const message of Array.isArray(session.messages) ? session.messages : []) {
      if (message.role !== 'user') continue;
      stats.messages += 1;
      const candidates = extractPersonCandidates(message.content);
      stats.candidates += candidates.length;
      const merged = mergePeople(people, candidates, {
        sourceText: message.content,
        sessionId: session.id,
        messageId: message.id,
        createdAt: message.createdAt,
        max: options.max
      });
      people = merged.people;
      stats.added += merged.stats.added;
      stats.updated += merged.stats.updated;
      stats.skipped += merged.stats.skipped;
    }
  }
  return { people, stats };
}

function inferTemporalMetadata(text, createdAt = new Date().toISOString(), input = {}) {
  const value = cleanText(text, 1200);
  let status = TEMPORAL_STATUSES.has(input.status || input.temporalStatus)
    ? (input.status || input.temporalStatus)
    : 'current';
  if (/以前|曾经|过去|小时候|原来|那时候/.test(value)) status = 'historical';
  else if (/以后|将来|未来|准备|计划|打算|希望有一天/.test(value)) status = 'future';
  else if (/可能|也许|不确定|好像/.test(value)) status = 'uncertain';
  const causal = value.match(/因为(.{2,90}?)(?:(?:，|,)?所以|，|,)(.{2,120})/);
  const cause = cleanText(input.cause || causal?.[1], 240);
  const effect = cleanText(input.effect || causal?.[2], 240);
  return {
    status,
    validFrom: validIso(input.validFrom, status === 'historical' ? '' : validIso(createdAt)),
    validTo: validIso(input.validTo),
    cause,
    effect
  };
}

function normalizeTemporalMetadata(value = {}, createdAt = '') {
  return inferTemporalMetadata(value.text || value.evidence, createdAt || value.sourceCreatedAt || value.createdAt, {
    status: value.temporalStatus || value.temporal?.status,
    validFrom: value.validFrom || value.temporal?.validFrom,
    validTo: value.validTo || value.temporal?.validTo,
    cause: value.cause || value.temporal?.cause,
    effect: value.effect || value.temporal?.effect
  });
}

function normalizeDigest(value = {}) {
  const period = value.period === 'week' ? 'week' : 'day';
  const key = cleanText(value.key, 20);
  return {
    id: cleanText(value.id, 120) || stableId('digest', period, key),
    period,
    key,
    title: cleanText(value.title, 100),
    content: cleanText(value.content, 1600),
    entryIds: [...new Set((Array.isArray(value.entryIds) ? value.entryIds : []).map(String))].slice(0, 100),
    createdAt: validIso(value.createdAt, new Date().toISOString()),
    updatedAt: validIso(value.updatedAt, new Date().toISOString())
  };
}

function digestTitle(period, key) {
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return period === 'week'
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日这一周`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function buildDigests(timeline, existing = []) {
  const groups = { day: new Map(), week: new Map() };
  for (const entry of Array.isArray(timeline) ? timeline : []) {
    const normalized = normalizeTimelineEntry(entry);
    const day = localDayKey(normalized.occurredAt);
    const week = weekKey(normalized.occurredAt);
    if (!day || !week) continue;
    if (!groups.day.has(day)) groups.day.set(day, []);
    if (!groups.week.has(week)) groups.week.set(week, []);
    groups.day.get(day).push(normalized);
    groups.week.get(week).push(normalized);
  }
  const result = [];
  for (const period of ['day', 'week']) {
    for (const [key, entries] of groups[period]) {
      entries.sort((left, right) => Number(right.importance) - Number(left.importance) || String(left.occurredAt).localeCompare(String(right.occurredAt)));
      const highlighted = entries.slice(0, period === 'day' ? 6 : 10);
      const content = highlighted.map((item) => item.title).join('；');
      result.push(normalizeDigest({
        id: stableId('digest', period, key),
        period,
        key,
        title: digestTitle(period, key),
        content: `${entries.length} 件被记录的事情：${content}${entries.length > highlighted.length ? `；还有 ${entries.length - highlighted.length} 件` : ''}`,
        entryIds: entries.map((item) => item.id),
        createdAt: entries.at(-1)?.occurredAt,
        updatedAt: new Date().toISOString()
      }));
    }
  }
  const manual = (Array.isArray(existing) ? existing : []).map(normalizeDigest).filter((item) => !item.key);
  return [...manual, ...result]
    .sort((left, right) => String(right.key).localeCompare(String(left.key)) || (left.period === 'day' ? -1 : 1))
    .slice(0, 1200);
}

function contextOverlap(queryTokens, value) {
  const candidateTokens = textTokens(value);
  let count = 0;
  for (const token of queryTokens) if (candidateTokens.has(token)) count += 1;
  return count;
}

function lifeHubContext(state = {}, options = {}) {
  const query = (Array.isArray(options.messages) ? options.messages : [])
    .slice(-8)
    .map((message) => message?.content)
    .join(' ');
  const queryTokens = textTokens(query);
  const excludedTexts = (Array.isArray(options.excludedTexts) ? options.excludedTexts : [])
    .map((value) => cleanText(value, 500))
    .filter(Boolean);
  const isDuplicate = (value) => excludedTexts.some((text) => (
    text.length >= 4 && (String(value).includes(text) || text.includes(String(value)))
  ));
  const people = (Array.isArray(state.people) ? state.people : [])
    .map((person) => ({ person, score: contextOverlap(queryTokens, `${person.name} ${person.relation} ${person.notes}`) }))
    .filter(({ person, score }) => score > 0 && !isDuplicate(`${person.name} ${person.relation} ${person.notes}`))
    .sort((left, right) => right.score - left.score || String(right.person.lastSeenAt || '').localeCompare(String(left.person.lastSeenAt || '')))
    .slice(0, 6)
    .map(({ person }) => person);
  const digests = (Array.isArray(state.memoryDigests) ? state.memoryDigests : [])
    .map((digest) => ({ digest, score: contextOverlap(queryTokens, `${digest.title} ${digest.content}`) }))
    .filter(({ digest, score }) => score > 0 && !isDuplicate(digest.content))
    .sort((left, right) => right.score - left.score || String(right.digest.updatedAt || '').localeCompare(String(left.digest.updatedAt || '')))
    .slice(0, 2)
    .map(({ digest }) => digest);
  if (!people.length && !digests.length) return '';
  const lines = ['\n以下是本机生活中枢中已经核实或可追溯的信息：'];
  if (people.length) {
    lines.push('人物关系：');
    for (const person of people) lines.push(`- ${person.name}：用户的${person.relation}${person.notes ? `；${person.notes}` : ''}`);
  }
  if (digests.length) {
    lines.push('近期生活摘要：');
    for (const digest of digests) lines.push(`- ${digest.title}：${digest.content}`);
  }
  lines.push('这些内容用于维持连续性；若与用户本轮明确说法冲突，以用户本轮说法为准，不要把摘要扩写成未发生的细节。');
  return lines.join('\n');
}

module.exports = {
  PERSON_RELATIONS,
  TEMPORAL_STATUSES,
  TIMELINE_TYPES,
  buildDigests,
  cleanText,
  extractPersonCandidates,
  inferTemporalMetadata,
  lifeHubContext,
  localDayKey,
  mergePeople,
  normalizeDigest,
  normalizePerson,
  normalizeTemporalMetadata,
  normalizeTimelineEntry,
  rebuildPeopleFromSessions,
  rebuildTimeline,
  stableId,
  weekKey
};
