'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkStore } = require('../work/work-store');

function withStore(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-work-store-'));
  try { return callback(path.join(root, 'mai-work.json')); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('WorkStore persists project-owned workspace and WorkSession messages', () => withStore((filePath) => {
  const store = new WorkStore({ filePath });
  store.load();
  const project = store.createProject({ name: '课程资料', workspacePath: 'D:\\workspace-a' });
  const session = store.createSession(project.id);
  store.appendMessage(session.id, { role: 'user', content: '看看有哪些文件' });
  store.appendMessage(session.id, { role: 'assistant', content: '里面有 a.txt。', actionSessionId: 'action-1', status: 'completed', toolSummary: '列出 1 项。', operationResults: [{ operation: 'create', title: '已创建', ok: true, path: 'Workspace/a.txt' }] });

  const restored = new WorkStore({ filePath });
  restored.load();
  assert.equal(restored.getProject(project.id).workspacePath, 'D:\\workspace-a');
  const persistedSession = restored.getSession(session.id);
  assert.equal(persistedSession.projectId, project.id);
  assert.deepEqual(persistedSession.messages.map((item) => item.content), ['看看有哪些文件', '里面有 a.txt。']);
  assert.deepEqual(persistedSession.messages[1].operationResults, [{ operation: 'create', title: '已创建', ok: true, path: 'Workspace/a.txt', sourcePath: '', destinationPath: '', kind: '', error: null }]);
  assert.equal(persistedSession.title, '看看有哪些文件');
}));

test('WorkStore keeps project workspaces isolated', () => withStore((filePath) => {
  const store = new WorkStore({ filePath });
  const a = store.createProject({ name: 'A', workspacePath: 'D:\\workspace-a' });
  const b = store.createProject({ name: 'B', workspacePath: 'D:\\workspace-b' });
  const sessionA = store.createSession(a.id);
  const sessionB = store.createSession(b.id);
  assert.equal(store.getSession(sessionA.id).projectId, a.id);
  assert.equal(store.getSession(sessionB.id).projectId, b.id);
  assert.notEqual(store.getProject(a.id).workspacePath, store.getProject(b.id).workspacePath);
}));

test('WorkStore renames and deletes a WorkSession only within its owning project', () => withStore((filePath) => {
  const store = new WorkStore({ filePath });
  const a = store.createProject({ name: 'A' });
  const b = store.createProject({ name: 'B' });
  const session = store.createSession(a.id, { title: '旧名称' });
  assert.equal(store.renameSession(session.id, '新名称', a.id).title, '新名称');
  assert.throws(() => store.deleteSession(session.id, b.id), /不存在/);
  assert.deepEqual(store.deleteSession(session.id, a.id), { id: session.id, projectId: a.id });
  assert.equal(store.getSession(session.id), null);
}));

test('WorkStore preserves corrupt source before falling back to an empty safe state', () => withStore((filePath) => {
  const corrupt = '{ broken';
  fs.writeFileSync(filePath, corrupt, 'utf8');
  const store = new WorkStore({ filePath });
  const state = store.load();
  assert.deepEqual(state.projects, []);
  const backupName = fs.readdirSync(path.dirname(filePath)).find((name) => name.startsWith('mai-work.json.unreadable-'));
  assert.ok(backupName);
  assert.equal(fs.readFileSync(path.join(path.dirname(filePath), backupName), 'utf8'), corrupt);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')).projects, []);
}));

test('WorkStore protects parse errors and invalid JSON structures before restoring defaults', () => withStore((filePath) => {
  const corruptValues = [
    '{ broken',
    '[]',
    'null',
    '"not work data"',
    '{"projects":{},"sessions":[]}',
    '{"projects":[],"sessions":null}',
    JSON.stringify({ projects: [{ id: 'p', name: 'Original' }], sessions: [{ id: 's', projectId: 'p', messages: [null] }] }),
    JSON.stringify({ projects: [{ id: 'p', name: 'Original' }], sessions: [{ id: 's', projectId: 'p', messages: {} }] }),
    JSON.stringify({ projects: [{ id: 'p', name: 'Original' }], sessions: [{ id: 's', projectId: 'p', messages: [{ role: 'user', content: 'x', operationResults: {} }] }] }),
    JSON.stringify({ projects: [{ id: 'p', name: 'Original' }], sessions: [{ id: 's', projectId: 'p', messages: [{ role: 'user', content: 'x', operationResults: [null] }] }] })
  ];
  for (const [index, corrupt] of corruptValues.entries()) {
    const caseDirectory = path.join(path.dirname(filePath), `case-${index}`);
    fs.mkdirSync(caseDirectory);
    const caseFilePath = path.join(caseDirectory, 'mai-work.json');
    fs.writeFileSync(caseFilePath, corrupt, 'utf8');
    const store = new WorkStore({ filePath: caseFilePath });
    assert.deepEqual(store.load().projects, [], `expected safe recovery for ${corrupt}`);
    const backupName = fs.readdirSync(caseDirectory).find((name) => name.startsWith('mai-work.json.unreadable-'));
    assert.ok(backupName, `missing original backup for ${corrupt}`);
    assert.equal(fs.readFileSync(path.join(caseDirectory, backupName), 'utf8'), corrupt);
    assert.deepEqual(JSON.parse(fs.readFileSync(caseFilePath, 'utf8')), {
      version: 1,
      projects: [],
      sessions: [],
      lastOpenedProjectId: ''
    });
  }
}));

test('WorkStore accepts legacy objects with omitted optional collections', () => withStore((filePath) => {
  fs.writeFileSync(filePath, JSON.stringify({
    projects: [{ id: 'legacy-project', name: '旧项目' }],
    sessions: [{ id: 'legacy-session', projectId: 'legacy-project', title: '旧记录' }]
  }), 'utf8');
  const store = new WorkStore({ filePath });
  const state = store.load();
  assert.equal(state.projects[0].id, 'legacy-project');
  assert.deepEqual(state.sessions, [{
    id: 'legacy-session',
    projectId: 'legacy-project',
    title: '旧记录',
    createdAt: state.sessions[0].createdAt,
    updatedAt: state.sessions[0].updatedAt,
    messages: []
  }]);
  assert.equal(fs.readdirSync(path.dirname(filePath)).length, 1);
}));

test('WorkStore does not replace nested-corrupt source when protection fails, then reloads repaired data', () => withStore((filePath) => {
  const corrupt = Buffer.from(JSON.stringify({
    projects: [{ id: 'keep-project', name: '保留项目' }],
    sessions: [{ id: 'keep-session', projectId: 'keep-project', messages: [null] }]
  }));
  fs.writeFileSync(filePath, corrupt);
  let failBackup = true;
  const failingFs = Object.create(fs);
  failingFs.renameSync = (...args) => {
    if (failBackup) throw Object.assign(new Error('backup denied'), { code: 'EACCES' });
    return fs.renameSync(...args);
  };
  const store = new WorkStore({ filePath, fileSystem: failingFs });
  assert.throws(() => store.load(), { code: 'EACCES' });
  assert.deepEqual(fs.readFileSync(filePath), corrupt);
  assert.throws(() => store.save(), { code: 'WORK_STORE_LOAD_BLOCKED' });
  assert.throws(() => store.createProject({ name: '不得覆盖原文件' }), { code: 'WORK_STORE_LOAD_BLOCKED' });
  store.adoptPersistedState({ projects: [{ id: 'not-a-reload', name: '不解除保护' }], sessions: [] });
  assert.throws(() => store.createProject({ name: '状态采纳不是重载' }), { code: 'WORK_STORE_LOAD_BLOCKED' });
  assert.deepEqual(fs.readFileSync(filePath), corrupt);
  assert.deepEqual(fs.readdirSync(path.dirname(filePath)), [path.basename(filePath)]);

  const repaired = {
    projects: [{ id: 'keep-project', name: '保留项目' }],
    sessions: [{ id: 'keep-session', projectId: 'keep-project', messages: [{ role: 'user', content: '修复后的消息' }] }]
  };
  fs.writeFileSync(filePath, JSON.stringify(repaired));
  failBackup = false;
  assert.equal(store.load().sessions[0].messages[0].content, '修复后的消息');
  const created = store.createProject({ name: '重载后可写' });
  assert.equal(store.getProject(created.id).name, '重载后可写');
  assert.ok(JSON.parse(fs.readFileSync(filePath, 'utf8')).projects.some((project) => project.id === created.id));
}));

test('WorkStore propagates access failures without treating them as missing data', () => withStore((filePath) => {
  const original = JSON.stringify({ version: 1, projects: [{ id: 'keep' }], sessions: [] });
  fs.writeFileSync(filePath, original);
  let failRead = true;
  const inaccessibleFs = Object.create(fs);
  inaccessibleFs.readFileSync = (...args) => {
    if (failRead) throw Object.assign(new Error('access denied'), { code: 'EACCES' });
    return fs.readFileSync(...args);
  };
  const store = new WorkStore({ filePath, fileSystem: inaccessibleFs });
  assert.throws(() => store.load(), { code: 'EACCES' });
  assert.throws(() => store.createProject({ name: '访问失败后不得覆盖' }), { code: 'WORK_STORE_LOAD_BLOCKED' });
  assert.equal(fs.readFileSync(filePath, 'utf8'), original);
  assert.equal(fs.existsSync(filePath), true);
  assert.deepEqual(fs.readdirSync(path.dirname(filePath)), [path.basename(filePath)]);
  failRead = false;
  assert.equal(store.load().projects[0].id, 'keep');
  assert.equal(store.createProject({ name: '访问恢复后可写' }).name, '访问恢复后可写');
}));

test('WorkStore protects the source and blocks writes when normalization throws until a successful reload', () => withStore((filePath) => {
  const original = Buffer.from(JSON.stringify({ projects: [{ id: 'normalizable', name: '保留项目' }], sessions: [] }));
  fs.writeFileSync(filePath, original);
  const store = new WorkStore({ filePath });
  const NativeDate = global.Date;
  global.Date = class FailingDate extends NativeDate {
    constructor(...args) {
      throw new Error('injected Work normalization failure');
    }
  };
  try {
    assert.throws(() => store.load(), /injected Work normalization failure/);
  } finally {
    global.Date = NativeDate;
  }
  assert.deepEqual(fs.readFileSync(filePath), original);
  const backupName = fs.readdirSync(path.dirname(filePath)).find((name) => name.startsWith('mai-work.json.unreadable-'));
  assert.ok(backupName);
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(filePath), backupName)), original);
  assert.throws(() => store.createProject({ name: '归一化失败后不得写入' }), { code: 'WORK_STORE_LOAD_BLOCKED' });
  assert.deepEqual(fs.readFileSync(filePath), original);

  assert.equal(store.load().projects[0].id, 'normalizable');
  assert.equal(store.createProject({ name: '重载后恢复写入' }).name, '重载后恢复写入');
}));

test('WorkStore reports failed saves and rolls memory back to the last persisted snapshot', () => withStore((filePath) => {
  const initial = new WorkStore({ filePath });
  const project = initial.createProject({ name: '保留名称', workspacePath: 'D:\\workspace' });
  const savedBytes = fs.readFileSync(filePath);
  const failingFs = Object.create(fs);
  failingFs.renameSync = () => { throw Object.assign(new Error('replacement denied'), { code: 'EPERM' }); };
  const store = new WorkStore({ filePath, fileSystem: failingFs });
  store.load();
  assert.throws(() => store.renameProject(project.id, '未保存名称'), { code: 'EPERM' });
  assert.equal(store.getProject(project.id).name, '保留名称');
  assert.deepEqual(fs.readFileSync(filePath), savedBytes);
  assert.deepEqual(fs.readdirSync(path.dirname(filePath)), [path.basename(filePath)]);
}));
