'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeOperationResults } = require('./operation-result');

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
    this.now = options.now || (() => Date.now());
    this.random = options.random || Math.random;
    this.state = defaultWorkState();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return this.state;
      this.state = normalizeWorkState(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch {
      try {
        if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, `${this.filePath}.unreadable-${Date.now()}.backup.json`);
      } catch { /* Keep the original error non-fatal. */ }
      this.state = defaultWorkState();
    }
    return this.snapshot();
  }

  save() {
    const normalized = normalizeWorkState(this.state);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2), 'utf8');
    fs.renameSync(temporary, this.filePath);
    this.state = normalized;
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

module.exports = { WORK_STORE_VERSION, WorkStore, defaultWorkState, normalizeWorkState };
