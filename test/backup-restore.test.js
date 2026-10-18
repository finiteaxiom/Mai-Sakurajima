'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createBackupBundle,
  prepareBackupRestore,
  validateBackupBundle
} = require('../backup-engine');
const { commitFileSetAtomically } = require('../file-set-transaction');
const { readJsonFile, writeJsonAtomic } = require('../json-persistence');
const { WorkStore, normalizeWorkState } = require('../work/work-store');

function makeLegacyBundle(payload) {
  const bundle = {
    format: 'mai-sakurajima-backup',
    formatVersion: 1,
    appVersion: '7.1.0',
    createdAt: '2026-08-05T10:00:00.000Z',
    payload
  };
  bundle.checksum = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return bundle;
}

test('v2 backup restore plan round-trips Work sessions, workspace bindings, and resources', () => {
  const source = {
    memory: { version: 16, sessions: [{ id: 'chat-a', messages: [] }] },
    settings: { deepseek: { apiKeyPlain: 'backup-plain', apiKeyEncrypted: 'backup-cipher', model: 'deepseek-v4-flash' } },
    knowledge: { version: 1, documents: [{ id: 'doc-a', sourcePath: 'Z:\\source.pdf', chunks: [{ text: 'indexed data' }] }] },
    work: {
      version: 1,
      projects: [{ id: 'project-a', name: '课程资料', workspacePath: 'D:\\workspace-a', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', lastOpenedAt: '2026-08-01T00:00:00.000Z' }],
      sessions: [{ id: 'session-a', projectId: 'project-a', title: '资料整理', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', messages: [{ role: 'user', content: '整理课程资料' }] }],
      lastOpenedProjectId: 'project-a'
    },
    resources: {
      customWallpaper: { mimeType: 'image/jpeg', dataBase64: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0xd9]).toString('base64') },
      customAvatars: { mai: { mimeType: 'image/jpeg', dataBase64: Buffer.from([0xff, 0xd8, 0x01, 0xd9]).toString('base64') }, user: null }
    }
  };
  const bundle = createBackupBundle(source);
  const current = {
    memory: { version: 16 },
    settings: { deepseek: { apiKeyEncrypted: 'local-cipher', apiKeyPlain: '' }, appearance: { wallpaper: 'custom', avatars: { mai: 'custom' } } },
    knowledge: {},
    work: { version: 1, projects: [], sessions: [], lastOpenedProjectId: '' },
    resources: { customWallpaper: null, customAvatars: { mai: null, user: null } }
  };

  const plan = prepareBackupRestore(bundle, current);
  assert.equal(validateBackupBundle(bundle).ok, true);
  assert.equal(plan.work.projects[0].workspacePath, 'D:\\workspace-a');
  assert.equal(plan.work.sessions[0].messages[0].content, '整理课程资料');
  assert.equal(plan.resources.customWallpaper.dataBase64, source.resources.customWallpaper.dataBase64);
  assert.equal(plan.resources.customAvatars.mai.dataBase64, source.resources.customAvatars.mai.dataBase64);
  assert.equal(plan.settings.deepseek.apiKeyEncrypted, 'local-cipher');
  assert.equal(plan.settings.deepseek.apiKeyPlain, '');
  assert.equal(plan.credentialsMissing, false);
  assert.doesNotMatch(JSON.stringify(plan), /backup-plain|backup-cipher/);

  const restoredWork = normalizeWorkState(plan.work);
  assert.deepEqual(restoredWork.projects[0].workspacePath, 'D:\\workspace-a');
  assert.deepEqual(restoredWork.sessions[0].messages[0].content, '整理课程资料');
});

test('legacy restore keeps current Work and custom resources and never imports old credentials', () => {
  const current = {
    memory: { version: 16, facts: [{ id: 'current' }] },
    settings: { deepseek: { apiKeyPlain: '', apiKeyEncrypted: '' } },
    knowledge: { documents: [{ id: 'current-doc' }] },
    work: { version: 1, projects: [{ id: 'current-project' }], sessions: [] },
    resources: { customWallpaper: { mimeType: 'image/jpeg', dataBase64: 'Y3VycmVudA==' }, customAvatars: { mai: null, user: null } }
  };
  const bundle = makeLegacyBundle({
    memory: { version: 16, facts: [{ id: 'old' }] },
    settings: { deepseek: { apiKeyPlain: 'old-plain', apiKeyEncrypted: 'old-cipher' } },
    knowledge: { documents: [{ id: 'old-doc' }] }
  });
  const plan = prepareBackupRestore(bundle, current);

  assert.equal(plan.memory.facts[0].id, 'old');
  assert.equal(plan.knowledge.documents[0].id, 'old-doc');
  assert.deepEqual(plan.work, current.work);
  assert.deepEqual(plan.resources, current.resources);
  assert.equal(plan.settings.deepseek.apiKeyPlain, '');
  assert.equal(plan.settings.deepseek.apiKeyEncrypted, '');
  assert.equal(plan.credentialsMissing, true);
});

test('invalid backups fail before producing a restore plan', () => {
  const bundle = makeLegacyBundle({ memory: { version: 16 }, settings: {} });
  bundle.payload.memory.version = 17;
  assert.throws(() => prepareBackupRestore(bundle, {}), /校验值不一致/);
});

test('v2 backup files can be committed and reopened with Work data, external references, and local credentials intact', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-backup-restore-integration-'));
  try {
    const files = {
      memory: path.join(directory, 'mai-pet-memory.json'),
      settings: path.join(directory, 'mai-pet-deepseek-settings.json'),
      knowledge: path.join(directory, 'mai-knowledge-index.json'),
      work: path.join(directory, 'mai-work.json'),
      wallpaper: path.join(directory, 'custom-wallpaper.jpg'),
      maiAvatar: path.join(directory, 'custom-avatar-mai.jpg'),
      userAvatar: path.join(directory, 'custom-avatar-user.jpg')
    };
    const current = {
      memory: { version: 16, facts: [{ id: 'current' }] },
      settings: { firstLaunch: false, deepseek: { apiKeyEncrypted: 'local-cipher', apiKeyPlain: '' } },
      knowledge: { version: 1, documents: [{ id: 'current-document', sourcePath: 'C:\\reference.pdf' }] },
      work: { version: 1, projects: [], sessions: [], lastOpenedProjectId: '' },
      resources: { customWallpaper: null, customAvatars: { mai: null, user: null } }
    };
    Object.entries(current).forEach(([key, value]) => {
      if (key === 'resources') return;
      writeJsonAtomic(files[key], value);
    });
    const resourceBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0xd9]);
    const source = {
      memory: { version: 16, facts: [{ id: 'restored' }] },
      settings: { firstLaunch: false, deepseek: { apiKeyPlain: 'backup-plain', apiKeyEncrypted: 'backup-cipher' } },
      knowledge: { version: 1, documents: [{ id: 'document-a', sourcePath: 'Z:\\reference.pdf', chunks: [{ text: 'indexed chunk' }] }] },
      work: {
        version: 1,
        projects: [{ id: 'project-a', name: '学习', workspacePath: 'D:\\workspace', createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', lastOpenedAt: '2026-10-18T00:00:00.000Z' }],
        sessions: [{ id: 'session-a', projectId: 'project-a', title: '复习', createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', messages: [{ role: 'user', content: '整理复习资料' }] }],
        lastOpenedProjectId: 'project-a'
      },
      resources: {
        customWallpaper: { mimeType: 'image/jpeg', dataBase64: resourceBytes.toString('base64') },
        customAvatars: {
          mai: { mimeType: 'image/jpeg', dataBase64: resourceBytes.toString('base64') },
          user: { mimeType: 'image/jpeg', dataBase64: resourceBytes.toString('base64') }
        }
      }
    };
    const bundle = createBackupBundle(source);
    assert.doesNotMatch(JSON.stringify(bundle), /backup-plain|backup-cipher/);
    const beforeInvalidRestore = Object.fromEntries(['memory', 'settings', 'knowledge', 'work']
      .map((key) => [key, fs.readFileSync(files[key])]));
    const tamperedBundle = structuredClone(bundle);
    tamperedBundle.payload.memory.facts[0].id = 'tampered-after-checksum';
    assert.throws(() => prepareBackupRestore(tamperedBundle, current), /校验值不一致/);
    for (const key of Object.keys(beforeInvalidRestore)) {
      assert.deepEqual(fs.readFileSync(files[key]), beforeInvalidRestore[key]);
    }
    const plan = prepareBackupRestore(bundle, current);
    const targets = Object.values(files);
    const bytes = (value) => value ? Buffer.from(value.dataBase64, 'base64') : null;
    commitFileSetAtomically(directory, [
      { path: files.memory, data: Buffer.from(JSON.stringify(plan.memory)) },
      { path: files.settings, data: Buffer.from(JSON.stringify(plan.settings)) },
      { path: files.knowledge, data: Buffer.from(JSON.stringify(plan.knowledge)) },
      { path: files.work, data: Buffer.from(JSON.stringify(plan.work)) },
      { path: files.wallpaper, data: bytes(plan.resources.customWallpaper) },
      { path: files.maiAvatar, data: bytes(plan.resources.customAvatars.mai) },
      { path: files.userAvatar, data: bytes(plan.resources.customAvatars.user) }
    ], { allowedTargets: targets });

    const work = new WorkStore({ filePath: files.work });
    work.load();
    assert.equal(work.getProject('project-a').workspacePath, 'D:\\workspace');
    assert.equal(work.getSession('session-a').messages[0].content, '整理复习资料');
    assert.equal(readJsonFile(files.settings).value.deepseek.apiKeyEncrypted, 'local-cipher');
    assert.equal(readJsonFile(files.knowledge).value.documents[0].sourcePath, 'Z:\\reference.pdf');
    assert.equal(readJsonFile(files.memory).value.facts[0].id, 'restored');
    for (const resourcePath of [files.wallpaper, files.maiAvatar, files.userAvatar]) {
      assert.deepEqual(fs.readFileSync(resourcePath), resourceBytes);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
