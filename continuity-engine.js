const { evidenceAppearsInSource } = require('./memory-extractor');
const { stableId } = require('./life-hub');

const PROJECT_STATUSES = new Set(['active', 'paused', 'completed', 'archived']);
const STEP_STATUSES = new Set(['todo', 'doing', 'done']);
const HABIT_FREQUENCIES = new Set(['daily', 'weekdays', 'weekly']);
const SEARCH_TYPES = new Set([
  'all', 'conversation', 'memory', 'timeline', 'person', 'project', 'habit', 'moment', 'episode', 'topic'
]);

function cleanText(value, limit = 600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function validIso(value, fallback = '') {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : fallback;
}

function localDayKey(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localWeekKey(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = start.getDay() || 7;
  start.setDate(start.getDate() - weekday + 1);
  return localDayKey(start);
}

function normalizeSource(value = {}) {
  return {
    sessionId: cleanText(value.sessionId || value.sourceSessionId, 120),
    messageId: cleanText(value.messageId || value.sourceMessageId, 120),
    evidence: cleanText(value.evidence || value.text, 300),
    createdAt: validIso(value.createdAt || value.sourceCreatedAt),
    originId: cleanText(value.originId, 120)
  };
}

function normalizeProjectStep(value = {}, fallbackDate = new Date().toISOString()) {
  const title = cleanText(value.title, 120);
  const createdAt = validIso(value.createdAt, fallbackDate);
  const status = STEP_STATUSES.has(value.status) ? value.status : (value.completed === true ? 'done' : 'todo');
  return {
    id: cleanText(value.id, 120) || stableId('project-step', title, createdAt),
    title,
    status,
    dueAt: validIso(value.dueAt),
    completedAt: status === 'done' ? validIso(value.completedAt, validIso(value.updatedAt, createdAt)) : '',
    createdAt,
    updatedAt: validIso(value.updatedAt, createdAt)
  };
}

function projectProgress(project) {
  const steps = Array.isArray(project?.steps) ? project.steps : [];
  if (!steps.length) return project?.status === 'completed' ? 100 : 0;
  const completed = steps.filter((step) => step.status === 'done').length;
  return Math.round(completed / steps.length * 100);
}

function normalizeProject(value = {}) {
  const now = new Date().toISOString();
  const title = cleanText(value.title, 120);
  const createdAt = validIso(value.createdAt, now);
  const steps = (Array.isArray(value.steps) ? value.steps : [])
    .map((step) => normalizeProjectStep(step, createdAt))
    .filter((step) => step.title)
    .slice(0, 200);
  const status = PROJECT_STATUSES.has(value.status) ? value.status : 'active';
  const source = normalizeSource(value.source || value);
  const normalized = {
    id: cleanText(value.id, 120) || stableId('project', title, createdAt),
    title,
    outcome: cleanText(value.outcome || value.summary, 800),
    status,
    priority: Math.max(1, Math.min(5, Math.round(Number(value.priority) || 3))),
    targetAt: validIso(value.targetAt || value.dueAt),
    steps,
    source,
    manual: value.manual === true,
    lastFollowUpAt: Math.max(0, Number(value.lastFollowUpAt) || 0),
    createdAt,
    updatedAt: validIso(value.updatedAt, createdAt)
  };
  return { ...normalized, progress: projectProgress(normalized) };
}

function normalizeCheckIn(value = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || ''))
    ? String(value.date)
    : localDayKey(value.createdAt || Date.now());
  return {
    date,
    count: Math.max(1, Math.min(99, Math.round(Number(value.count) || 1))),
    note: cleanText(value.note, 160),
    createdAt: validIso(value.createdAt, new Date().toISOString())
  };
}

function periodKeyForHabit(habit, date) {
  return habit.frequency === 'weekly' ? localWeekKey(date) : localDayKey(date);
}

function habitPeriodCount(habit, now = Date.now()) {
  const key = periodKeyForHabit(habit, now);
  return (habit.checkIns || [])
    .filter((item) => periodKeyForHabit(habit, `${item.date}T12:00:00`) === key)
    .reduce((total, item) => total + item.count, 0);
}

function habitIsDue(habit, now = Date.now()) {
  if (!habit?.active) return false;
  const day = new Date(now).getDay();
  if (habit.frequency === 'weekdays') return day >= 1 && day <= 5;
  return true;
}

function habitStreak(habit, now = Date.now()) {
  const counts = new Map();
  for (const item of habit.checkIns || []) {
    const key = periodKeyForHabit(habit, `${item.date}T12:00:00`);
    counts.set(key, (counts.get(key) || 0) + item.count);
  }
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  const maxChecks = habit.frequency === 'weekly' ? 160 : 800;
  for (let index = 0; index < maxChecks; index += 1) {
    if (habit.frequency === 'weekdays' && [0, 6].includes(cursor.getDay())) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    const key = periodKeyForHabit(habit, cursor);
    if ((counts.get(key) || 0) < habit.targetPerPeriod) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - (habit.frequency === 'weekly' ? 7 : 1));
  }
  return streak;
}

function normalizeHabit(value = {}, referenceNow = Date.now()) {
  const now = new Date().toISOString();
  const title = cleanText(value.title, 120);
  const createdAt = validIso(value.createdAt, now);
  const frequency = HABIT_FREQUENCIES.has(value.frequency) ? value.frequency : 'daily';
  const checkIns = (Array.isArray(value.checkIns) ? value.checkIns : [])
    .map(normalizeCheckIn)
    .filter((item) => item.date)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .slice(-1000);
  const reminderTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.reminderTime || ''))
    ? String(value.reminderTime)
    : '';
  const source = normalizeSource(value.source || value);
  const normalized = {
    id: cleanText(value.id, 120) || stableId('habit', title, createdAt),
    title,
    frequency,
    targetPerPeriod: Math.max(1, Math.min(21, Math.round(Number(value.targetPerPeriod) || 1))),
    reminderTime,
    active: value.active !== false,
    notes: cleanText(value.notes, 500),
    checkIns,
    source,
    manual: value.manual === true,
    lastFollowUpAt: Math.max(0, Number(value.lastFollowUpAt) || 0),
    createdAt,
    updatedAt: validIso(value.updatedAt, createdAt)
  };
  return {
    ...normalized,
    currentCount: habitPeriodCount(normalized, referenceNow),
    dueToday: habitIsDue(normalized, referenceNow),
    completedToday: habitPeriodCount(normalized, referenceNow) >= normalized.targetPerPeriod,
    streak: habitStreak(normalized, referenceNow)
  };
}

function deriveContinuityState(state = {}) {
  const facts = Array.isArray(state.facts) ? state.facts : [];
  const factIds = new Set(facts.map((fact) => String(fact.id)));
  const projects = (Array.isArray(state.projects) ? state.projects : [])
    .map(normalizeProject)
    .filter((item) => item.manual || !item.source?.originId || factIds.has(String(item.source.originId)))
    .filter((item) => item.title);
  const habits = (Array.isArray(state.habits) ? state.habits : [])
    .map(normalizeHabit)
    .filter((item) => item.manual || !item.source?.originId || factIds.has(String(item.source.originId)))
    .filter((item) => item.title);
  for (const project of projects) {
    if (project.manual || !project.source?.originId) continue;
    const fact = facts.find((item) => String(item.id) === String(project.source.originId));
    if (!fact) continue;
    project.title = cleanText(fact.text.replace(/^用户(?:计划|希望|想要|打算)?/, ''), 80) || project.title;
    project.outcome = fact.text;
    project.priority = Math.max(project.priority, Math.max(1, Math.min(5, Number(fact.importance) || 3)));
    project.targetAt = fact.validTo || project.targetAt;
    project.updatedAt = fact.updatedAt || project.updatedAt;
  }
  for (const habit of habits) {
    if (habit.manual || !habit.source?.originId) continue;
    const fact = facts.find((item) => String(item.id) === String(habit.source.originId));
    if (!fact) continue;
    habit.title = cleanText(fact.text.replace(/^用户(?:习惯|每天|每周)?/, ''), 80) || habit.title;
    habit.notes = fact.text;
    habit.updatedAt = fact.updatedAt || habit.updatedAt;
  }
  const projectOriginIds = new Set(projects.map((item) => item.source?.originId).filter(Boolean));
  const habitOriginIds = new Set(habits.map((item) => item.source?.originId).filter(Boolean));
  const dismissedProjectOrigins = new Set((state.continuityMeta?.dismissedProjectOrigins || []).map(String));
  const dismissedHabitOrigins = new Set((state.continuityMeta?.dismissedHabitOrigins || []).map(String));
  for (const fact of facts) {
    if (fact.category === 'goal' && !projectOriginIds.has(fact.id) && !dismissedProjectOrigins.has(String(fact.id))) {
      const derived = normalizeProject({
        id: stableId('project', 'memory', fact.id),
        title: cleanText(fact.text.replace(/^用户(?:计划|希望|想要|打算)?/, ''), 80) || '长期目标',
        outcome: fact.text,
        priority: fact.importance,
        status: fact.temporalStatus === 'historical' ? 'archived' : 'active',
        targetAt: fact.validTo,
        source: {
          sessionId: fact.sourceSessionId,
          messageId: fact.sourceMessageId,
          evidence: fact.evidence,
          createdAt: fact.sourceCreatedAt,
          originId: fact.id
        },
        createdAt: fact.createdAt,
        updatedAt: fact.updatedAt
      });
      const matchingProject = projects.find((item) => (
        (fact.sourceMessageId && item.source?.messageId === fact.sourceMessageId)
        || item.title.toLocaleLowerCase('zh-CN') === derived.title.toLocaleLowerCase('zh-CN')
      ));
      if (matchingProject) matchingProject.source.originId = fact.id;
      else projects.push(derived);
      projectOriginIds.add(fact.id);
    }
    if (fact.category === 'routine' && !habitOriginIds.has(fact.id) && !dismissedHabitOrigins.has(String(fact.id))) {
      const derived = normalizeHabit({
        id: stableId('habit', 'memory', fact.id),
        title: cleanText(fact.text.replace(/^用户(?:习惯|每天|每周)?/, ''), 80) || '生活习惯',
        frequency: /每周/.test(fact.text) ? 'weekly' : /工作日/.test(fact.text) ? 'weekdays' : 'daily',
        notes: fact.text,
        source: {
          sessionId: fact.sourceSessionId,
          messageId: fact.sourceMessageId,
          evidence: fact.evidence,
          createdAt: fact.sourceCreatedAt,
          originId: fact.id
        },
        createdAt: fact.createdAt,
        updatedAt: fact.updatedAt
      });
      const matchingHabit = habits.find((item) => (
        (fact.sourceMessageId && item.source?.messageId === fact.sourceMessageId)
        || item.title.toLocaleLowerCase('zh-CN') === derived.title.toLocaleLowerCase('zh-CN')
      ));
      if (matchingHabit) matchingHabit.source.originId = fact.id;
      else habits.push(derived);
      habitOriginIds.add(fact.id);
    }
  }
  return {
    projects: projects.map(normalizeProject).slice(0, 500),
    habits: habits.map(normalizeHabit).slice(0, 300)
  };
}

function mergeProjectCandidates(existing, candidates, options = {}) {
  const projects = (Array.isArray(existing) ? existing : []).map(normalizeProject);
  const sourceText = cleanText(options.sourceText, 12000);
  const now = validIso(options.createdAt, new Date().toISOString());
  const stats = { added: 0, updated: 0, skipped: 0 };
  for (const raw of (Array.isArray(candidates) ? candidates : []).slice(0, 6)) {
    const evidence = cleanText(raw?.evidence, 300);
    if (!raw?.manual && (!evidence || !sourceText || !evidenceAppearsInSource(evidence, sourceText))) {
      stats.skipped += 1;
      continue;
    }
    const candidate = normalizeProject({
      ...raw,
      source: {
        sessionId: options.sessionId,
        messageId: options.messageId,
        evidence,
        createdAt: now
      },
      manual: raw?.manual === true,
      createdAt: now,
      updatedAt: now
    });
    if (candidate.title.length < 2) {
      stats.skipped += 1;
      continue;
    }
    const titleKey = candidate.title.toLocaleLowerCase('zh-CN');
    const match = projects.find((item) => item.title.toLocaleLowerCase('zh-CN') === titleKey);
    if (match) {
      match.outcome = candidate.outcome || match.outcome;
      match.priority = Math.max(match.priority, candidate.priority);
      match.targetAt = candidate.targetAt || match.targetAt;
      match.status = candidate.status;
      match.source = candidate.source.evidence ? candidate.source : match.source;
      match.updatedAt = now;
      stats.updated += 1;
    } else {
      projects.unshift(candidate);
      stats.added += 1;
    }
  }
  return { projects: projects.map(normalizeProject).slice(0, 500), stats };
}

function mergeHabitCandidates(existing, candidates, options = {}) {
  const habits = (Array.isArray(existing) ? existing : []).map(normalizeHabit);
  const sourceText = cleanText(options.sourceText, 12000);
  const now = validIso(options.createdAt, new Date().toISOString());
  const stats = { added: 0, updated: 0, skipped: 0 };
  for (const raw of (Array.isArray(candidates) ? candidates : []).slice(0, 6)) {
    const evidence = cleanText(raw?.evidence, 300);
    if (!raw?.manual && (!evidence || !sourceText || !evidenceAppearsInSource(evidence, sourceText))) {
      stats.skipped += 1;
      continue;
    }
    const candidate = normalizeHabit({
      ...raw,
      source: {
        sessionId: options.sessionId,
        messageId: options.messageId,
        evidence,
        createdAt: now
      },
      manual: raw?.manual === true,
      createdAt: now,
      updatedAt: now
    });
    if (candidate.title.length < 2) {
      stats.skipped += 1;
      continue;
    }
    const titleKey = candidate.title.toLocaleLowerCase('zh-CN');
    const match = habits.find((item) => item.title.toLocaleLowerCase('zh-CN') === titleKey);
    if (match) {
      match.frequency = candidate.frequency;
      match.targetPerPeriod = candidate.targetPerPeriod;
      match.reminderTime = candidate.reminderTime || match.reminderTime;
      match.notes = candidate.notes || match.notes;
      match.active = candidate.active;
      match.source = candidate.source.evidence ? candidate.source : match.source;
      match.updatedAt = now;
      stats.updated += 1;
    } else {
      habits.unshift(candidate);
      stats.added += 1;
    }
  }
  return { habits: habits.map(normalizeHabit).slice(0, 300), stats };
}

function tokenize(value) {
  const text = cleanText(value, 20000).toLocaleLowerCase('zh-CN');
  const tokens = new Set(text.match(/[a-z0-9][a-z0-9_.-]+/g) || []);
  for (const run of text.match(/[\u3400-\u9fff]+/g) || []) {
    if (run.length <= 2) tokens.add(run);
    else for (let index = 0; index < run.length - 1; index += 1) tokens.add(run.slice(index, index + 2));
  }
  return tokens;
}

function searchScore(query, text, updatedAt, importance = 2) {
  const normalizedQuery = cleanText(query, 300).toLocaleLowerCase('zh-CN');
  const normalizedText = cleanText(text, 4000).toLocaleLowerCase('zh-CN');
  const queryTokens = tokenize(normalizedQuery);
  const textTokens = tokenize(normalizedText);
  let overlap = 0;
  for (const token of queryTokens) if (textTokens.has(token)) overlap += 1;
  const exact = normalizedText.includes(normalizedQuery) ? 40 : 0;
  const coverage = queryTokens.size ? overlap / queryTokens.size * 30 : 0;
  const date = new Date(updatedAt || 0).getTime();
  const ageDays = Number.isFinite(date) && date > 0 ? Math.max(0, (Date.now() - date) / 86400000) : 3650;
  const recency = Math.max(0, 8 - Math.log10(ageDays + 1) * 3);
  return exact + coverage + overlap * 2 + Math.max(1, Number(importance) || 1) + recency;
}

function collectSearchDocuments(state = {}) {
  const documents = [];
  for (const session of Array.isArray(state.sessions) ? state.sessions : []) {
    for (const message of Array.isArray(session.messages) ? session.messages : []) {
      documents.push({
        id: `conversation:${session.id}:${message.id}`,
        type: 'conversation',
        title: `${message.role === 'user' ? '你' : '麻衣'} · ${session.title || '历史对话'}`,
        text: message.content,
        updatedAt: message.createdAt,
        importance: message.role === 'user' ? 3 : 1,
        source: { sessionId: session.id, messageId: message.id, evidence: message.content, createdAt: message.createdAt }
      });
    }
  }
  for (const fact of Array.isArray(state.facts) ? state.facts : []) documents.push({
    id: `memory:${fact.id}`, type: 'memory', title: '长期记忆', text: fact.text,
    updatedAt: fact.updatedAt, importance: fact.importance,
    source: normalizeSource(fact)
  });
  for (const item of Array.isArray(state.timeline) ? state.timeline : []) documents.push({
    id: `timeline:${item.id}`, type: 'timeline', title: item.title, text: item.summary,
    updatedAt: item.occurredAt, importance: item.importance, source: normalizeSource(item.source)
  });
  for (const person of Array.isArray(state.people) ? state.people : []) documents.push({
    id: `person:${person.id}`, type: 'person', title: `${person.name} · ${person.relation}`, text: person.notes,
    updatedAt: person.updatedAt || person.lastSeenAt, importance: person.manual ? 5 : 3,
    source: normalizeSource(person.evidence?.at(-1))
  });
  for (const project of Array.isArray(state.projects) ? state.projects : []) documents.push({
    id: `project:${project.id}`, type: 'project', title: project.title,
    text: [project.outcome, ...(project.steps || []).map((step) => step.title)].filter(Boolean).join('；'),
    updatedAt: project.updatedAt, importance: project.priority, source: normalizeSource(project.source)
  });
  for (const habit of Array.isArray(state.habits) ? state.habits : []) documents.push({
    id: `habit:${habit.id}`, type: 'habit', title: habit.title, text: habit.notes,
    updatedAt: habit.updatedAt, importance: habit.active ? 3 : 1, source: normalizeSource(habit.source)
  });
  for (const moment of Array.isArray(state.moments) ? state.moments : []) documents.push({
    id: `moment:${moment.id}`, type: 'moment', title: '私人朋友圈', text: moment.content,
    updatedAt: moment.createdAt, importance: 2, source: { createdAt: moment.createdAt }
  });
  for (const episode of Array.isArray(state.episodes) ? state.episodes : []) documents.push({
    id: `episode:${episode.id}`, type: 'episode', title: episode.title, text: episode.summary,
    updatedAt: episode.sourceCreatedAt || episode.createdAt, importance: episode.importance,
    source: normalizeSource(episode)
  });
  for (const topic of Array.isArray(state.topicThreads) ? state.topicThreads : []) documents.push({
    id: `topic:${topic.id}`, type: 'topic', title: topic.title, text: `${topic.summary || ''} ${topic.pendingQuestion || ''}`,
    updatedAt: topic.updatedAt, importance: ['active', 'waiting'].includes(topic.status) ? 4 : 1,
    source: normalizeSource(topic)
  });
  return documents;
}

function searchContinuity(state, query, options = {}) {
  const normalizedQuery = cleanText(query, 300);
  if (!normalizedQuery) return [];
  const type = SEARCH_TYPES.has(options.type) ? options.type : 'all';
  return collectSearchDocuments(state)
    .filter((document) => type === 'all' || document.type === type)
    .map((document) => ({
      ...document,
      score: searchScore(normalizedQuery, `${document.title} ${document.text}`, document.updatedAt, document.importance)
    }))
    .filter((document) => document.score >= 8)
    .sort((left, right) => right.score - left.score || String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, Math.max(1, Math.min(200, Number(options.limit) || 60)))
    .map((document) => ({
      id: document.id,
      type: document.type,
      title: document.title,
      snippet: cleanText(document.text, 500),
      updatedAt: document.updatedAt,
      score: Math.round(document.score * 10) / 10,
      source: document.source
    }));
}

function buildMemoryReviewQueue(facts, now = Date.now()) {
  const queue = [];
  const byKey = new Map();
  for (const fact of Array.isArray(facts) ? facts : []) {
    if (fact.key) {
      if (!byKey.has(fact.key)) byKey.set(fact.key, []);
      byKey.get(fact.key).push(fact);
    }
    const ageDays = Math.max(0, (now - new Date(fact.updatedAt || fact.createdAt || now).getTime()) / 86400000);
    let reason = '';
    let severity = 1;
    if (fact.source !== 'manual' && !fact.evidence) {
      reason = '这条旧记忆缺少可定位的用户原话';
      severity = 3;
    } else if (fact.temporalStatus === 'uncertain') {
      reason = '时间或状态仍不确定';
      severity = 2;
    } else if (fact.source !== 'manual' && Number(fact.confidence) < 0.9) {
      reason = `可信度只有 ${Math.round((Number(fact.confidence) || 0) * 100)}%`;
      severity = 2;
    } else if (['preference', 'goal', 'routine', 'other'].includes(fact.category) && fact.temporalStatus === 'current' && ageDays >= 365) {
      reason = '这条当前状态已经超过一年没有确认';
      severity = 1;
    }
    if (reason) queue.push({ id: `review:${fact.id}`, factId: fact.id, reason, severity, fact });
  }
  for (const [key, entries] of byKey) {
    const distinct = new Set(entries.map((item) => cleanText(item.text).toLocaleLowerCase('zh-CN')));
    if (entries.length <= 1 || distinct.size <= 1) continue;
    for (const fact of entries) {
      if (queue.some((item) => item.factId === fact.id && item.severity >= 4)) continue;
      queue.push({ id: `conflict:${key}:${fact.id}`, factId: fact.id, reason: `同一属性“${key}”存在多个不同版本`, severity: 4, fact });
    }
  }
  return queue
    .sort((left, right) => right.severity - left.severity || String(right.fact.updatedAt).localeCompare(String(left.fact.updatedAt)))
    .slice(0, 500);
}

function continuityContext(state = {}, now = Date.now(), options = {}) {
  const query = (Array.isArray(options.messages) ? options.messages : [])
    .slice(-8)
    .map((message) => message?.content)
    .join(' ');
  const excludedTexts = (Array.isArray(options.excludedTexts) ? options.excludedTexts : [])
    .map((value) => cleanText(value, 500))
    .filter(Boolean);
  const isDuplicate = (value) => excludedTexts.some((text) => (
    text.length >= 4 && (String(value).includes(text) || text.includes(String(value)))
  ));
  const queryTokens = tokenize(query);
  const hasQueryOverlap = (value) => {
    if (!query) return true;
    const candidateTokens = tokenize(value);
    for (const token of queryTokens) if (candidateTokens.has(token)) return true;
    return false;
  };
  const projects = (Array.isArray(state.projects) ? state.projects : [])
    .map(normalizeProject)
    .filter((item) => item.status === 'active')
    .map((item) => ({
      item,
      score: query ? searchScore(query, `${item.title} ${item.outcome} ${item.steps.map((step) => step.title).join(' ')}`, item.updatedAt, item.priority) : item.priority
    }))
    .filter(({ item, score }) => (!query || (score >= 8
      && hasQueryOverlap(`${item.title} ${item.outcome} ${item.steps.map((step) => step.title).join(' ')}`)))
      && !isDuplicate(`${item.title} ${item.outcome} ${item.source?.evidence || ''}`))
    .sort((left, right) => right.score - left.score || right.item.priority - left.item.priority)
    .slice(0, 6)
    .map(({ item }) => item);
  const habits = (Array.isArray(state.habits) ? state.habits : [])
    .map((item) => normalizeHabit(item, now))
    .filter((item) => item.active)
    .map((item) => ({
      item,
      score: query ? searchScore(query, `${item.title} ${item.frequency} ${item.source?.evidence || ''}`, item.updatedAt, 3) : 3
    }))
    .filter(({ item, score }) => (!query || (score >= 8
      && hasQueryOverlap(`${item.title} ${item.frequency} ${item.source?.evidence || ''}`)))
      && !isDuplicate(`${item.title} ${item.source?.evidence || ''}`))
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map(({ item }) => item);
  if (!projects.length && !habits.length) return '';
  const lines = ['\n以下是用户在本机连续性中心里明确保存的项目与习惯：'];
  if (projects.length) {
    lines.push('进行中的项目：');
    for (const project of projects) {
      const nextStep = project.steps.find((step) => step.status !== 'done');
      lines.push(`- ${project.title}（${project.progress}%）${project.targetAt ? `，目标时间 ${project.targetAt}` : ''}${nextStep ? `；下一步：${nextStep.title}` : ''}`);
    }
  }
  if (habits.length) {
    lines.push('正在追踪的习惯：');
    for (const habit of habits) {
      lines.push(`- ${habit.title}（${habit.frequency}，本期 ${habit.currentCount}/${habit.targetPerPeriod}，连续 ${habit.streak} 期）`);
    }
  }
  lines.push('只在话题相关时自然使用这些信息；不能把未完成说成已完成，也不要在用户没有询问时逐项汇报。');
  return lines.join('\n');
}

function continuityProactiveCue(state = {}, now = Date.now()) {
  const projects = (Array.isArray(state.projects) ? state.projects : []).map(normalizeProject);
  const overdue = projects.find((item) => (
    item.status === 'active'
    && item.targetAt
    && new Date(item.targetAt).getTime() < now
    && now - item.lastFollowUpAt >= 24 * 60 * 60 * 1000
  ));
  if (overdue) return { reason: 'project_overdue', project: overdue };
  const upcoming = projects.find((item) => {
    const target = new Date(item.targetAt || 0).getTime();
    return item.status === 'active' && target >= now && target - now <= 48 * 60 * 60 * 1000
      && now - item.lastFollowUpAt >= 24 * 60 * 60 * 1000;
  });
  if (upcoming) return { reason: 'project_upcoming', project: upcoming };
  const current = new Date(now);
  const hour = current.getHours();
  const currentMinutes = hour * 60 + current.getMinutes();
  if (hour >= 23) return null;
  const habit = (Array.isArray(state.habits) ? state.habits : [])
    .map((item) => normalizeHabit(item, now))
    .find((item) => {
      const [reminderHour, reminderMinute] = item.reminderTime
        ? item.reminderTime.split(':').map(Number)
        : [18, 0];
      const reminderMinutes = reminderHour * 60 + reminderMinute;
      return item.active && item.dueToday && !item.completedToday
        && currentMinutes >= reminderMinutes
        && now - item.lastFollowUpAt >= 20 * 60 * 60 * 1000;
    });
  return habit ? { reason: 'habit_check_in', habit } : null;
}

function publicContinuityState(state = {}, now = Date.now()) {
  const projects = (Array.isArray(state.projects) ? state.projects : []).map(normalizeProject)
    .sort((left, right) => Number(left.status !== 'active') - Number(right.status !== 'active') || right.priority - left.priority || String(right.updatedAt).localeCompare(String(left.updatedAt)));
  const habits = (Array.isArray(state.habits) ? state.habits : []).map((item) => normalizeHabit(item, now))
    .sort((left, right) => Number(right.active) - Number(left.active) || String(right.updatedAt).localeCompare(String(left.updatedAt)));
  const reviews = buildMemoryReviewQueue(state.facts, now);
  return {
    projects,
    habits,
    reviews,
    summary: {
      activeProjects: projects.filter((item) => item.status === 'active').length,
      dueHabits: habits.filter((item) => item.active && item.dueToday && !item.completedToday).length,
      reviewItems: reviews.length,
      searchableItems: collectSearchDocuments({ ...state, projects, habits }).length
    }
  };
}

module.exports = {
  HABIT_FREQUENCIES,
  PROJECT_STATUSES,
  SEARCH_TYPES,
  STEP_STATUSES,
  buildMemoryReviewQueue,
  collectSearchDocuments,
  continuityContext,
  continuityProactiveCue,
  deriveContinuityState,
  habitIsDue,
  habitPeriodCount,
  habitStreak,
  localDayKey,
  mergeHabitCandidates,
  mergeProjectCandidates,
  normalizeHabit,
  normalizeProject,
  normalizeProjectStep,
  projectProgress,
  publicContinuityState,
  searchContinuity
};
