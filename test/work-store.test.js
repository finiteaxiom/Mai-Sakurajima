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
  fs.writeFileSync(filePath, '{ broken', 'utf8');
  const store = new WorkStore({ filePath });
  const state = store.load();
  assert.deepEqual(state.projects, []);
  assert.ok(fs.readdirSync(path.dirname(filePath)).some((name) => name.startsWith('mai-work.json.unreadable-')));
}));
