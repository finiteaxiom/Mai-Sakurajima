const crypto = require('crypto');
const { canonicalizeMemoryKey, memoryTextKey } = require('./memory-engine');
const { evidenceAppearsInSource } = require('./memory-extractor');

const BACKUP_FORMAT = 'mai-sakurajima-backup';
const BACKUP_FORMAT_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function createBackupBundle(input = {}) {
  const payload = {
    memory: clone(input.memory || {}),
    settings: clone(input.settings || {}),
    knowledge: clone(input.knowledge || {})
  };
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: String(input.appVersion || ''),
    createdAt: new Date(input.createdAt || Date.now()).toISOString(),
    checksum: checksum(payload),
    payload
  };
}

function validateBackupBundle(value) {
  const errors = [];
  if (!value || typeof value !== 'object') errors.push('备份文件不是有效对象');
  if (value?.format !== BACKUP_FORMAT) errors.push('不是 Mai Sakurajima 完整备份');
  if (Number(value?.formatVersion) !== BACKUP_FORMAT_VERSION) errors.push('备份格式版本不受支持');
  if (!value?.payload?.memory || typeof value.payload.memory !== 'object') errors.push('缺少记忆数据库');
  if (!value?.payload?.settings || typeof value.payload.settings !== 'object') errors.push('缺少设置数据');
  if (!/^[a-f0-9]{64}$/i.test(String(value?.checksum || ''))) errors.push('备份缺少有效校验值');
  else if (value?.payload && checksum(value.payload) !== value.checksum) errors.push('备份校验值不一致，文件可能损坏');
  return { ok: errors.length === 0, errors };
}

function settingsWithoutSecrets(settings) {
  const value = clone(settings || {});
  if (value.deepseek) {
    delete value.deepseek.apiKeyEncrypted;
    delete value.deepseek.apiKeyPlain;
  }
  return value;
}

function createPortableExport(input = {}) {
  return {
    format: 'mai-sakurajima-export',
    formatVersion: 1,
    appVersion: String(input.appVersion || ''),
    createdAt: new Date(input.createdAt || Date.now()).toISOString(),
    privacy: 'API Key and encrypted credentials are excluded.',
    memory: clone(input.memory || {}),
    settings: settingsWithoutSecrets(input.settings),
    knowledge: clone(input.knowledge || {})
  };
}

function inspectDatabase(memory = {}, options = {}) {
  const sessions = Array.isArray(memory.sessions) ? memory.sessions : [];
  const facts = Array.isArray(memory.facts) ? memory.facts : [];
  const timeline = Array.isArray(memory.timeline) ? memory.timeline : [];
  const people = Array.isArray(memory.people) ? memory.people : [];
  const episodes = Array.isArray(memory.episodes) ? memory.episodes : [];
  const topics = Array.isArray(memory.topicThreads) ? memory.topicThreads : [];
  const projects = Array.isArray(memory.projects) ? memory.projects : [];
  const habits = Array.isArray(memory.habits) ? memory.habits : [];
  const promises = Array.isArray(memory.assistant?.promises) ? memory.assistant.promises : [];
  const focusSessions = Array.isArray(memory.assistant?.focusSessions) ? memory.assistant.focusSessions : [];
  const messageIds = new Set();
  const messagesById = new Map();
  const duplicateMessageIds = new Set();
  const sessionIds = new Set(sessions.map((session) => String(session.id || '')));
  let messages = 0;
  let messagesWithoutId = 0;
  let invalidMessages = 0;
  for (const session of sessions) {
    for (const message of Array.isArray(session.messages) ? session.messages : []) {
      messages += 1;
      if (!message?.id) messagesWithoutId += 1;
      else if (messageIds.has(message.id)) duplicateMessageIds.add(message.id);
      else {
        messageIds.add(message.id);
        messagesById.set(String(message.id), message);
      }
      if (!['user', 'assistant'].includes(message?.role) || !String(message?.content || '').trim()) invalidMessages += 1;
    }
  }
  const orphanFactSources = facts.filter((fact) => fact.sourceSessionId && !sessionIds.has(String(fact.sourceSessionId))).length;
  const orphanFactMessages = facts.filter((fact) => (
    fact.sourceMessageId && !messageIds.has(String(fact.sourceMessageId))
  )).length;
  const invalidFactEvidence = facts.filter((fact) => {
    if (fact.source === 'manual') return false;
    const evidence = String(fact.evidence || '').trim();
    if (!evidence) return true;
    if (!fact.sourceMessageId) return false;
    const sourceMessage = messagesById.get(String(fact.sourceMessageId));
    return Boolean(sourceMessage) && !evidenceAppearsInSource(evidence, sourceMessage.content);
  }).length;
  const duplicateFactGroups = new Map();
  const currentFactsByKey = new Map();
  for (const fact of facts) {
    const textKey = memoryTextKey(fact.text);
    if (textKey) {
      if (!duplicateFactGroups.has(textKey)) duplicateFactGroups.set(textKey, []);
      duplicateFactGroups.get(textKey).push(fact);
    }
    const key = canonicalizeMemoryKey(fact.key);
    if (key && (fact.temporalStatus || 'current') === 'current') {
      if (!currentFactsByKey.has(key)) currentFactsByKey.set(key, []);
      currentFactsByKey.get(key).push(fact);
    }
  }
  const duplicateFacts = Array.from(duplicateFactGroups.values())
    .filter((items) => items.length > 1)
    .reduce((total, items) => total + items.length - 1, 0);
  const duplicateCurrentKeys = Array.from(currentFactsByKey.values())
    .filter((items) => items.length > 1).length;
  const conflictingCurrentFacts = Array.from(currentFactsByKey.values())
    .filter((items) => new Set(items.map((fact) => memoryTextKey(fact.text))).size > 1)
    .reduce((total, items) => total + items.length, 0);
  const nowMs = new Date(options.now || Date.now()).getTime();
  const staleUncertainFacts = facts.filter((fact) => {
    if (fact.temporalStatus !== 'uncertain' || Number(fact.confidence) >= 0.55) return false;
    const timestamp = new Date(fact.lastConfirmedAt || fact.updatedAt || fact.createdAt || 0).getTime();
    return !Number.isFinite(timestamp) || nowMs - timestamp >= 180 * 86400000;
  }).length;
  const memoryContextCount = Math.max(0, Number(options.memoryContextCount) || 0);
  const memoryContextTokens = Math.max(0, Number(options.memoryContextTokens) || 0);
  const excessiveMemoryContext = memoryContextCount > 40 || memoryContextTokens > 16000;
  const duplicateTimelineIds = timeline.length - new Set(timeline.map((item) => String(item.id || ''))).size;
  const peopleWithoutEvidence = people.filter((person) => !person.manual && !(Array.isArray(person.evidence) && person.evidence.length)).length;
  const invalidDates = timeline.filter((item) => Number.isNaN(new Date(item.occurredAt).getTime())).length;
  const duplicateProjectIds = projects.length - new Set(projects.map((item) => String(item.id || ''))).size;
  const duplicateHabitIds = habits.length - new Set(habits.map((item) => String(item.id || ''))).size;
  const invalidProjectSteps = projects.reduce((total, project) => (
    total + (Array.isArray(project.steps) ? project.steps : []).filter((step) => !step?.id || !String(step?.title || '').trim()).length
  ), 0);
  const duplicatePromiseIds = promises.length - new Set(promises.map((item) => String(item.id || ''))).size;
  const invalidFocusSessions = focusSessions.filter((item) => !item?.id || !item?.startedAt || !String(item?.label || '').trim()).length;
  const errors = [];
  const warnings = [];
  if (invalidMessages) errors.push(`${invalidMessages} 条聊天消息结构无效`);
  if (duplicateMessageIds.size) errors.push(`${duplicateMessageIds.size} 个聊天消息 ID 重复`);
  if (duplicateTimelineIds > 0) errors.push(`${duplicateTimelineIds} 个时间线 ID 重复`);
  if (invalidDates > 0) errors.push(`${invalidDates} 条时间线日期无效`);
  if (duplicateProjectIds > 0) errors.push(`${duplicateProjectIds} 个项目 ID 重复`);
  if (duplicateHabitIds > 0) errors.push(`${duplicateHabitIds} 个习惯 ID 重复`);
  if (duplicatePromiseIds > 0) errors.push(`${duplicatePromiseIds} 个承诺 ID 重复`);
  if (messagesWithoutId > 0) warnings.push(`${messagesWithoutId} 条旧消息尚无稳定 ID`);
  if (orphanFactSources > 0) warnings.push(`${orphanFactSources} 条记忆的原始会话已被删除`);
  if (orphanFactMessages > 0) warnings.push(`${orphanFactMessages} 条记忆的原始消息无法定位`);
  if (invalidFactEvidence > 0) warnings.push(`${invalidFactEvidence} 条记忆缺少有效的用户原话证据`);
  if (duplicateFacts > 0) warnings.push(`${duplicateFacts} 条事实记忆文本重复`);
  if (duplicateCurrentKeys > 0) errors.push(`${duplicateCurrentKeys} 个语义键存在多条 current 事实`);
  if (conflictingCurrentFacts > 0) errors.push(`${conflictingCurrentFacts} 条 current 事实相互冲突`);
  if (staleUncertainFacts > 0) warnings.push(`${staleUncertainFacts} 条低可信 uncertain 记忆已长期未确认`);
  if (facts.length > 5000) warnings.push(`事实记忆数量异常增长到 ${facts.length} 条`);
  if (excessiveMemoryContext) warnings.push(`本次记忆上下文过大（${memoryContextCount} 条 / ${memoryContextTokens} tokens）`);
  if (peopleWithoutEvidence > 0) warnings.push(`${peopleWithoutEvidence} 个人物关系缺少原话证据`);
  if (invalidProjectSteps > 0) warnings.push(`${invalidProjectSteps} 个项目步骤结构不完整`);
  if (invalidFocusSessions > 0) warnings.push(`${invalidFocusSessions} 条专注记录结构不完整`);
  const bytes = Buffer.byteLength(JSON.stringify(memory), 'utf8');
  if (bytes > 25 * 1024 * 1024) warnings.push('记忆数据库已超过 25 MB，建议导出并整理旧对话');
  return {
    status: errors.length ? 'error' : warnings.length ? 'warning' : 'healthy',
    checkedAt: new Date(options.now || Date.now()).toISOString(),
    errors,
    warnings,
    counts: {
      facts: facts.length,
      sessions: sessions.length,
      messages,
      timeline: timeline.length,
      people: people.length,
      episodes: episodes.length,
      topics: topics.length,
      projects: projects.length,
      habits: habits.length,
      promises: promises.length,
      focusSessions: focusSessions.length
    },
    bytes,
    messagesWithoutId,
    duplicateMessageIds: duplicateMessageIds.size,
    orphanFactSources,
    orphanFactMessages,
    invalidFactEvidence,
    duplicateFacts,
    duplicateCurrentKeys,
    conflictingCurrentFacts,
    staleUncertainFacts,
    excessiveMemoryContext,
    duplicateTimelineIds,
    peopleWithoutEvidence,
    invalidDates,
    duplicateProjectIds,
    duplicateHabitIds,
    invalidProjectSteps,
    duplicatePromiseIds,
    invalidFocusSessions
  };
}

module.exports = {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  createBackupBundle,
  createPortableExport,
  inspectDatabase,
  settingsWithoutSecrets,
  validateBackupBundle
};
