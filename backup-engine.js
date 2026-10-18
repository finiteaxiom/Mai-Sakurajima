const crypto = require('crypto');
const { canonicalizeMemoryKey, memoryTextKey } = require('./memory-engine');
const { evidenceAppearsInSource } = require('./memory-extractor');

const BACKUP_FORMAT = 'mai-sakurajima-backup';
const BACKUP_FORMAT_VERSION = 2;
const MAX_BACKUP_WALLPAPER_BYTES = 20 * 1024 * 1024;
const MAX_BACKUP_AVATAR_BYTES = 10 * 1024 * 1024;

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function createBackupBundle(input = {}) {
  const payload = {
    memory: clone(input.memory || {}),
    settings: settingsWithoutSecrets(input.settings),
    knowledge: clone(input.knowledge || { version: 1, libraries: [], documents: [], lastIndexedAt: '', lastRefreshAt: '' }),
    work: clone(input.work || { version: 1, projects: [], sessions: [], lastOpenedProjectId: '' }),
    resources: normalizeBackupResources(input.resources)
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
  const formatVersion = Number(value?.formatVersion);
  if (![1, BACKUP_FORMAT_VERSION].includes(formatVersion)) errors.push('备份格式版本不受支持');
  if (!value?.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) errors.push('备份数据结构无效');
  if (!value?.payload?.memory || typeof value.payload.memory !== 'object' || Array.isArray(value.payload.memory)) errors.push('缺少记忆数据库');
  if (!value?.payload?.settings || typeof value.payload.settings !== 'object' || Array.isArray(value.payload.settings)) errors.push('缺少设置数据');
  if (formatVersion === BACKUP_FORMAT_VERSION) {
    if (!value?.payload?.knowledge || typeof value.payload.knowledge !== 'object' || Array.isArray(value.payload.knowledge)
      || !Array.isArray(value.payload.knowledge.documents)) errors.push('知识索引结构无效');
    const work = value?.payload?.work;
    if (!work || typeof work !== 'object' || Array.isArray(work) || !Array.isArray(work.projects) || !Array.isArray(work.sessions)) {
      errors.push('Work 数据结构无效');
    } else {
      const projectIds = new Set(work.projects.map((project) => String(project?.id || '')));
      if (work.projects.some((project) => !project || typeof project !== 'object' || !String(project.id || '').trim())) errors.push('Work 项目结构无效');
      if (work.sessions.some((session) => (
        !session || typeof session !== 'object' || !String(session.id || '').trim()
        || !projectIds.has(String(session.projectId || '')) || !Array.isArray(session.messages)
      ))) errors.push('Work 会话结构无效');
    }
    const resourceErrors = validateBackupResources(value?.payload?.resources);
    errors.push(...resourceErrors);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(value?.checksum || ''))) errors.push('备份缺少有效校验值');
  else if (value?.payload && checksum(value.payload) !== value.checksum) errors.push('备份校验值不一致，文件可能损坏');
  return { ok: errors.length === 0, errors };
}

function settingsWithoutSecrets(settings) {
  const strip = (value) => {
    if (Array.isArray(value)) return value.map(strip);
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (/(?:api[\s_-]?key|encryptedapikey)/i.test(key)) continue;
      result[key] = strip(item);
    }
    return result;
  };
  return strip(clone(settings || {}));
}

function normalizeBackupResources(resources = {}) {
  const value = resources && typeof resources === 'object' ? resources : {};
  const avatars = value.customAvatars && typeof value.customAvatars === 'object' ? value.customAvatars : {};
  return {
    customWallpaper: value.customWallpaper || null,
    customAvatars: {
      mai: avatars.mai || null,
      user: avatars.user || null
    }
  };
}

function validateResourceFile(value, maxBytes, label) {
  if (value === null) return [];
  if (!value || typeof value !== 'object' || value.mimeType !== 'image/jpeg' || typeof value.dataBase64 !== 'string') {
    return [`${label}资源结构无效`];
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.dataBase64)) {
    return [`${label}资源编码无效`];
  }
  const bytes = Buffer.from(value.dataBase64, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== value.dataBase64
    || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return [`${label}资源大小或编码无效`];
  }
  return [];
}

function validateBackupResources(resources) {
  const errors = [];
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return ['备份资源结构无效'];
  if (!resources.customAvatars || typeof resources.customAvatars !== 'object' || Array.isArray(resources.customAvatars)) {
    errors.push('自定义头像结构无效');
  }
  errors.push(...validateResourceFile(resources.customWallpaper, MAX_BACKUP_WALLPAPER_BYTES, '壁纸'));
  errors.push(...validateResourceFile(resources.customAvatars?.mai, MAX_BACKUP_AVATAR_BYTES, '麻衣头像'));
  errors.push(...validateResourceFile(resources.customAvatars?.user, MAX_BACKUP_AVATAR_BYTES, '用户头像'));
  return errors;
}

function settingsForRestore(currentSettings = {}, restoredSettings = {}) {
  const current = clone(currentSettings || {});
  const incoming = settingsWithoutSecrets(restoredSettings);
  const result = { ...current, ...incoming };
  for (const key of ['deepseek', 'voice', 'assistant', 'appearance', 'model']) {
    result[key] = { ...(current[key] || {}), ...(incoming[key] || {}) };
  }
  result.appearance.avatars = {
    ...(current.appearance?.avatars || {}),
    ...(incoming.appearance?.avatars || {})
  };
  result.deepseek.apiKeyPlain = String(current.deepseek?.apiKeyPlain || '');
  result.deepseek.apiKeyEncrypted = String(current.deepseek?.apiKeyEncrypted || '');
  return result;
}

function prepareBackupRestore(bundle, current = {}) {
  const validation = validateBackupBundle(bundle);
  if (!validation.ok) throw new Error(validation.errors.join('；'));
  const payload = bundle.payload;
  const isCurrentFormat = Number(bundle.formatVersion) >= BACKUP_FORMAT_VERSION;
  const work = isCurrentFormat && Object.prototype.hasOwnProperty.call(payload, 'work') ? clone(payload.work) : clone(current.work || {});
  const resources = isCurrentFormat && Object.prototype.hasOwnProperty.call(payload, 'resources') ? clone(payload.resources) : clone(current.resources || {});
  const settings = settingsForRestore(current.settings, payload.settings);
  const hasCredential = Boolean(settings.deepseek.apiKeyPlain || settings.deepseek.apiKeyEncrypted);
  return {
    memory: clone(payload.memory),
    settings,
    knowledge: Object.prototype.hasOwnProperty.call(payload, 'knowledge') ? clone(payload.knowledge) : clone(current.knowledge || {}),
    work,
    resources,
    credentialsMissing: !hasCredential,
    formatVersion: Number(bundle.formatVersion)
  };
}

function createPortableExport(input = {}) {
  return {
    format: 'mai-sakurajima-export',
    formatVersion: 2,
    appVersion: String(input.appVersion || ''),
    createdAt: new Date(input.createdAt || Date.now()).toISOString(),
    privacy: 'API Key and encrypted credentials are excluded.',
    memory: clone(input.memory || {}),
    settings: settingsWithoutSecrets(input.settings),
    knowledge: clone(input.knowledge || { version: 1, libraries: [], documents: [], lastIndexedAt: '', lastRefreshAt: '' }),
    work: clone(input.work || { version: 1, projects: [], sessions: [], lastOpenedProjectId: '' }),
    resources: normalizeBackupResources(input.resources)
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
  prepareBackupRestore,
  settingsForRestore,
  settingsWithoutSecrets,
  validateBackupBundle
};
