'use strict';

const fs = require('fs');
const path = require('path');
const { OPERATION_TITLES, normalizeOperationResults } = require('./operation-result');
const { ensureFileBackup, readJsonFile, writeJsonAtomic } = require('../json-persistence');

const WORK_STORE_VERSION = 1;
const MAX_PROJECTS = 100;
const MAX_SESSIONS_PER_PROJECT = 300;
const MAX_MESSAGES_PER_SESSION = 2000;

function makeId(prefix, now = Date.now(), random = Math.random) {
  return `${prefix}-${Number(now).toString(36)}-${random().toString(36).slice(2, 10)}`;
}

function asIso(value, fallback = new Date().toISOString()) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function defaultWorkState() {
  return { version: WORK_STORE_VERSION, projects: [], sessions: [], lastOpenedProjectId: '' };
}

function normalizeProject(value = {}) {
  const createdAt = asIso(value.createdAt);
  return {
    id: String(value.id || '').trim().slice(0, 120),
    name: String(value.name || '未命名项目').trim().slice(0, 120) || '未命名项目',
    workspacePath: typeof value.workspacePath === 'string' ? value.workspacePath.trim().slice(0, 2000) : '',
    createdAt,
    updatedAt: asIso(value.updatedAt, createdAt),
    lastOpenedAt: asIso(value.lastOpenedAt, createdAt)
  };
}

function normalizeMessage(value = {}) {
  const role = value.role === 'assistant' ? 'assistant' : value.role === 'user' ? 'user' : '';
  const content = String(value.content || '').trim().slice(0, 12000);
  if (!role || !content) return null;
  const createdAt = asIso(value.createdAt);
  return {
    id: String(value.id || makeId('work-message')).slice(0, 120),
    role,
    content,
    createdAt,
    actionSessionId: typeof value.actionSessionId === 'string' ? value.actionSessionId.slice(0, 120) : undefined,
    status: ['completed', 'failed', 'cancelled'].includes(value.status) ? value.status : undefined,
    toolSummary: typeof value.toolSummary === 'string' ? value.toolSummary.slice(0, 500) : undefined,
    operationResults: normalizeOperationResults(value.operationResults)
  };
}

function normalizeSession(value = {}, projectIds = new Set()) {
  const projectId = String(value.projectId || '').trim().slice(0, 120);
  if (!projectIds.has(projectId)) return null;
  const createdAt = asIso(value.createdAt);
  const messages = Array.isArray(value.messages) ? value.messages.map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES_PER_SESSION) : [];
  return {
    id: String(value.id || '').trim().slice(0, 120),
    projectId,
    title: String(value.title || messages.find((item) => item.role === 'user')?.content || '新任务').trim().slice(0, 120) || '新任务',
    createdAt,
    updatedAt: asIso(value.updatedAt, createdAt),
    messages
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateWorkStateShape(value) {
  if (!isRecord(value)) {
    throw Object.assign(new Error('Work JSON 根节点必须是对象。'), { code: 'JSON_SHAPE_ERROR' });
  }
  for (const key of ['projects', 'sessions']) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (!Array.isArray(value[key])) {
      throw Object.assign(new Error(`Work JSON 的 ${key} 必须是数组。`), { code: 'JSON_SHAPE_ERROR' });
    }
    if (value[key].some((item) => !isRecord(item))) {
      throw Object.assign(new Error(`Work JSON 的 ${key} 包含无效记录。`), { code: 'JSON_SHAPE_ERROR' });
    }
  }

  for (const [index, project] of (value.projects || []).entries()) {
    if (typeof project.id !== 'string' || !project.id.trim()) {
      throw Object.assign(new Error(`Work JSON 的 projects[${index}].id 无效。`), { code: 'JSON_SHAPE_ERROR' });
    }
    if (project.name !== undefined && typeof project.name !== 'string') {
      throw Object.assign(new Error(`Work JSON 的 projects[${index}].name 必须是字符串。`), { code: 'JSON_SHAPE_ERROR' });
    }
    if (project.workspacePath !== undefined && typeof project.workspacePath !== 'string') {
      throw Object.assign(new Error(`Work JSON 的 projects[${index}].workspacePath 必须是字符串。`), { code: 'JSON_SHAPE_ERROR' });
    }
  }

  const projectIds = new Set((value.projects || []).map((project) => project.id));
  for (const [sessionIndex, session] of (value.sessions || []).entries()) {
    if (typeof session.id !== 'string' || !session.id.trim() || typeof session.projectId !== 'string' || !session.projectId.trim()) {
      throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}] 缺少有效 id 或 projectId。`), { code: 'JSON_SHAPE_ERROR' });
    }
    if (!projectIds.has(session.projectId)) {
      throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}] 引用了不存在的项目。`), { code: 'JSON_SHAPE_ERROR' });
    }
    if (session.title !== undefined && typeof session.title !== 'string') {
      throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}].title 必须是字符串。`), { code: 'JSON_SHAPE_ERROR' });
    }
    if (session.messages === undefined) continue;
    if (!Array.isArray(session.messages)) {
      throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}].messages 必须是数组。`), { code: 'JSON_SHAPE_ERROR' });
    }
    for (const [messageIndex, message] of session.messages.entries()) {
      if (!isRecord(message)) {
        throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}].messages[${messageIndex}] 必须是对象。`), { code: 'JSON_SHAPE_ERROR' });
      }
      if (!['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) {
        throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}].messages[${messageIndex}] 缺少有效 role 或 content。`), { code: 'JSON_SHAPE_ERROR' });
      }
      if (message.operationResults === undefined) continue;
      if (!Array.isArray(message.operationResults) || message.operationResults.some((result) => !isRecord(result))) {
        throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}].messages[${messageIndex}].operationResults 必须是对象数组。`), { code: 'JSON_SHAPE_ERROR' });
      }
      if (message.operationResults.some((result) => typeof result.operation !== 'string' || !Object.prototype.hasOwnProperty.call(OPERATION_TITLES, result.operation))) {
        throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}].messages[${messageIndex}].operationResults 包含无效操作。`), { code: 'JSON_SHAPE_ERROR' });
      }
      if (message.operationResults.some((result) => result.error !== undefined && result.error !== null && !isRecord(result.error))) {
        throw Object.assign(new Error(`Work JSON 的 sessions[${sessionIndex}].messages[${messageIndex}].operationResults.error 必须是对象或 null。`), { code: 'JSON_SHAPE_ERROR' });
      }
    }
  }
  return value;
}

function normalizeWorkState(value = {}) {
  const fallback = defaultWorkState();
  const projects = Array.isArray(value.projects) ? value.projects.map(normalizeProject).filter((item) => item.id).slice(0, MAX_PROJECTS) : [];
  const ids = new Set(projects.map((item) => item.id));
  const sessions = Array.isArray(value.sessions) ? value.sessions.map((item) => normalizeSession(item, ids)).filter(Boolean) : [];
  const lastOpenedProjectId = ids.has(String(value.lastOpenedProjectId || '')) ? String(value.lastOpenedProjectId) : '';
  return { ...fallback, projects, sessions, lastOpenedProjectId };
}

function publicProject(project) { return structuredClone(project); }
function publicSession(session) { return structuredClone(session); }

class WorkStore {
  constructor(options = {}) {
    if (!options.filePath) throw new TypeError('WorkStore requires filePath.');
    this.filePath = options.filePath;
    this.fileSystem = options.fileSystem || fs;
    this.now = options.now || (() => Date.now());
    this.random = options.random || Math.random;
    this.beforeSave = options.beforeSave || null;
    this.state = defaultWorkState();
    this.persistedState = structuredClone(this.state);
    this.loadBlockedError = null;
  }

  load() {
    // Calling load() is the explicit retry boundary. A failed retry below
    // reinstates the write block; only a completed load clears it.
    this.loadBlockedError = null;
    let loaded;
    try {
      loaded = readJsonFile(this.filePath, { fs: this.fileSystem });
      if (loaded.exists) validateWorkStateShape(loaded.value);
    } catch (error) {
      if (!['JSON_PARSE_ERROR', 'JSON_SHAPE_ERROR'].includes(error?.code)) {
        this.loadBlockedError = error;
        throw error;
      }
      try {
        this.protectUnreadableSource();
        const recovered = defaultWorkState();
        this.state = recovered;
        this.persistedState = structuredClone(recovered);
        this.save();
        return this.snapshot();
      } catch (protectionError) {
        this.loadBlockedError = protectionError;
        throw protectionError;
      }
    }

    const previousState = this.state;
    const previousPersistedState = this.persistedState;
    try {
      const normalized = loaded.exists ? normalizeWorkState(loaded.value) : defaultWorkState();
      this.state = normalized;
      this.persistedState = structuredClone(normalized);
      return this.snapshot();
    } catch (error) {
      this.state = previousState;
      this.persistedState = previousPersistedState;
      if (loaded.exists) {
        try {
          this.protectUnreadableSource();
        } catch (protectionError) {
          this.loadBlockedError = protectionError;
          throw protectionError;
        }
      }
      this.loadBlockedError = error;
      throw error;
    }
  }

  protectUnreadableSource() {
    const recoveryPath = `${this.filePath}.unreadable-${Date.now()}.backup.json`;
    return ensureFileBackup(this.filePath, recoveryPath, { fs: this.fileSystem, path });
  }

  save() {
    try {
      if (this.loadBlockedError) {
        throw Object.assign(new Error('Work 数据加载未完成，已禁止覆盖原始文件；请先修复访问或原文保护问题后重新加载。'), {
          code: 'WORK_STORE_LOAD_BLOCKED',
          cause: this.loadBlockedError
        });
      }
      this.beforeSave?.();
      let normalized;
      try {
        normalized = normalizeWorkState(this.state);
      } catch (error) {
        this.loadBlockedError = error;
        throw error;
      }
      writeJsonAtomic(this.filePath, normalized, { fs: this.fileSystem, path });
      this.state = normalized;
      this.persistedState = structuredClone(normalized);
    } catch (error) {
      this.state = structuredClone(this.persistedState);
      throw error;
    }
    return this.snapshot();
  }

  snapshot() {
    return {
      version: WORK_STORE_VERSION,
      projects: this.state.projects.map(publicProject),
      sessions: this.state.sessions.map(publicSession),
      lastOpenedProjectId: this.state.lastOpenedProjectId
    };
  }

  adoptPersistedState(value) {
    try {
      validateWorkStateShape(value);
      const normalized = normalizeWorkState(value);
      const persisted = structuredClone(normalized);
      this.state = normalized;
      this.persistedState = persisted;
      return this.snapshot();
    } catch (error) {
      this.loadBlockedError = error;
      throw error;
    }
  }

  getProject(id) { const project = this.state.projects.find((item) => item.id === String(id || '')); return project ? publicProject(project) : null; }
  getSession(id) { const session = this.state.sessions.find((item) => item.id === String(id || '')); return session ? publicSession(session) : null; }
  sessionsForProject(projectId) { return this.state.sessions.filter((item) => item.projectId === String(projectId || '')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(publicSession); }

  createProject(input = {}) {
    if (this.state.projects.length >= MAX_PROJECTS) throw new Error('Work 项目数量已达到安全上限。');
    const timestamp = new Date(this.now()).toISOString();
    const project = normalizeProject({ id: makeId('work-project', this.now(), this.random), name: input.name, workspacePath: input.workspacePath, createdAt: timestamp, updatedAt: timestamp, lastOpenedAt: timestamp });
    this.state.projects.push(project);
    this.state.lastOpenedProjectId = project.id;
    this.save();
    return publicProject(project);
  }

  renameProject(id, name) {
    const project = this.state.projects.find((item) => item.id === String(id || ''));
    if (!project) throw new Error('Work 项目不存在。');
    project.name = String(name || '').trim().slice(0, 120) || project.name;
    project.updatedAt = new Date(this.now()).toISOString();
    this.save();
    return publicProject(project);
  }

  openProject(id) {
    const project = this.state.projects.find((item) => item.id === String(id || ''));
    if (!project) throw new Error('Work 项目不存在。');
    const timestamp = new Date(this.now()).toISOString();
    project.lastOpenedAt = timestamp; project.updatedAt = timestamp;
    this.state.lastOpenedProjectId = project.id;
    this.save();
    return publicProject(project);
  }

  setProjectWorkspace(id, workspacePath) {
    const project = this.state.projects.find((item) => item.id === String(id || ''));
    if (!project) throw new Error('Work 项目不存在。');
    project.workspacePath = typeof workspacePath === 'string' ? workspacePath.trim().slice(0, 2000) : '';
    project.updatedAt = new Date(this.now()).toISOString();
    this.save();
    return publicProject(project);
  }

  createSession(projectId, input = {}) {
    if (!this.getProject(projectId)) throw new Error('请先选择一个 Work 项目。');
    if (this.sessionsForProject(projectId).length >= MAX_SESSIONS_PER_PROJECT) throw new Error('此项目的 Work 记录已达到安全上限。');
    const timestamp = new Date(this.now()).toISOString();
    const session = normalizeSession({ id: makeId('work-session', this.now(), this.random), projectId, title: input.title || '新任务', createdAt: timestamp, updatedAt: timestamp, messages: [] }, new Set(this.state.projects.map((item) => item.id)));
    this.state.sessions.push(session);
    this.openProject(projectId);
    return publicSession(session);
  }

  renameSession(id, name, expectedProjectId = '') {
    const session = this.state.sessions.find((item) => item.id === String(id || ''));
    if (!session || (expectedProjectId && session.projectId !== String(expectedProjectId))) throw new Error('Work 记录不存在。');
    session.title = String(name || '').trim().slice(0, 120) || session.title;
    session.updatedAt = new Date(this.now()).toISOString();
    this.save();
    return publicSession(session);
  }

  deleteSession(id, expectedProjectId = '') {
    const index = this.state.sessions.findIndex((item) => item.id === String(id || ''));
    const session = index >= 0 ? this.state.sessions[index] : null;
    if (!session || (expectedProjectId && session.projectId !== String(expectedProjectId))) throw new Error('Work 记录不存在。');
    this.state.sessions.splice(index, 1);
    this.save();
    return { id: session.id, projectId: session.projectId };
  }

  appendMessage(sessionId, input = {}) {
    const session = this.state.sessions.find((item) => item.id === String(sessionId || ''));
    if (!session) throw new Error('Work 记录不存在。');
    const message = normalizeMessage({ ...input, id: makeId('work-message', this.now(), this.random), createdAt: input.createdAt || new Date(this.now()).toISOString() });
    if (!message) throw new Error('Work 消息无效。');
    session.messages.push(message);
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    if (message.role === 'user' && (session.title === '新任务' || !session.title)) session.title = message.content.slice(0, 120);
    session.updatedAt = new Date(this.now()).toISOString();
    this.openProject(session.projectId);
    return structuredClone(message);
  }
}

module.exports = { WORK_STORE_VERSION, WorkStore, defaultWorkState, normalizeWorkState, validateWorkStateShape };
