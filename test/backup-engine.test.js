const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createBackupBundle,
  createPortableExport,
  inspectDatabase,
  validateBackupBundle
} = require('../backup-engine');

test('full backup validates and detects tampering', () => {
  const backup = createBackupBundle({
    appVersion: '7.1.0',
    memory: { version: 9, facts: [{ id: 'f1', text: '记忆' }] },
    settings: { deepseek: { apiKeyEncrypted: 'encrypted', apiKeyPlain: 'plain', model: 'deepseek-v4-flash' } },
    knowledge: { documents: [] },
    work: { version: 1, projects: [{ id: 'project-a', workspacePath: 'C:\\workspace' }], sessions: [] },
    resources: {
      customWallpaper: { mimeType: 'image/jpeg', dataBase64: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64') },
      customAvatars: { mai: null, user: null }
    },
    createdAt: '2026-08-05T10:00:00.000Z'
  });
  assert.equal(validateBackupBundle(backup).ok, true);
  assert.equal(backup.formatVersion, 2);
  assert.equal(backup.payload.work.projects[0].workspacePath, 'C:\\workspace');
  assert.equal(backup.payload.resources.customWallpaper.mimeType, 'image/jpeg');
  assert.doesNotMatch(JSON.stringify(backup), /encrypted|plain/);
  const withoutChecksum = { ...backup, checksum: '' };
  assert.equal(validateBackupBundle(withoutChecksum).ok, false);
  backup.payload.memory.version = 8;
  assert.equal(validateBackupBundle(backup).ok, false);
});

test('legacy backup format v1 remains readable without Work or resource fields', () => {
  const crypto = require('node:crypto');
  const legacy = {
    format: 'mai-sakurajima-backup',
    formatVersion: 1,
    appVersion: '7.1.0',
    createdAt: '2026-08-05T10:00:00.000Z',
    payload: { memory: { version: 16 }, settings: {}, knowledge: { documents: [] } }
  };
  legacy.checksum = crypto.createHash('sha256').update(JSON.stringify(legacy.payload)).digest('hex');
  assert.equal(validateBackupBundle(legacy).ok, true);
});

test('portable export excludes API credentials', () => {
  const output = createPortableExport({
    memory: { version: 9 },
    settings: { deepseek: { apiKeyEncrypted: 'secret', apiKeyPlain: 'plain', model: 'deepseek-v4-flash' } },
    work: { version: 1, projects: [{ id: 'project', workspacePath: 'D:\\workspace' }], sessions: [{ id: 'session', projectId: 'project', messages: [] }] },
    resources: { customWallpaper: null, customAvatars: { mai: null, user: null } }
  });
  assert.equal(output.settings.deepseek.apiKeyEncrypted, undefined);
  assert.equal(output.settings.deepseek.apiKeyPlain, undefined);
  assert.equal(output.settings.deepseek.model, 'deepseek-v4-flash');
  assert.equal(output.formatVersion, 2);
  assert.equal(output.work.projects[0].workspacePath, 'D:\\workspace');
  assert.deepEqual(output.resources.customAvatars, { mai: null, user: null });
  assert.doesNotMatch(JSON.stringify(output), /secret|plain/);
});

test('v2 backup rejects malformed Work structure and strips credential-shaped fields recursively', () => {
  const backup = createBackupBundle({
    settings: { deepseek: { apiKey: 'plain-key', apiKeyEncrypted: 'cipher-key' }, nested: { encryptedApiKey: 'nested-cipher' } }
  });
  assert.equal(validateBackupBundle(backup).ok, true);
  assert.doesNotMatch(JSON.stringify(backup), /plain-key|cipher-key|nested-cipher/);
  const invalid = structuredClone(backup);
  delete invalid.payload.work.sessions;
  invalid.checksum = require('node:crypto').createHash('sha256').update(JSON.stringify(invalid.payload)).digest('hex');
  assert.equal(validateBackupBundle(invalid).ok, false);
});

test('database health reports missing ids and orphan sources', () => {
  const health = inspectDatabase({
    version: 9,
    sessions: [{ id: 's1', messages: [{ role: 'user', content: '你好' }] }],
    facts: [{ id: 'f1', text: '事实', sourceSessionId: 'missing' }],
    timeline: [],
    people: [],
    episodes: [],
    topicThreads: []
  }, { now: '2026-08-05T10:00:00.000Z' });
  assert.equal(health.status, 'warning');
  assert.equal(health.messagesWithoutId, 1);
  assert.equal(health.orphanFactSources, 1);
});

test('memory health detects duplicate current keys, invalid evidence, and stale uncertain facts', () => {
  const health = inspectDatabase({
    version: 15,
    sessions: [{
      id: 's1',
      messages: [{ id: 'm1', role: 'user', content: '我住在东京', createdAt: '2024-01-01T00:00:00.000Z' }]
    }],
    facts: [{
      id: 'f1', text: '用户住在东京', key: 'identity.location', category: 'identity', temporalStatus: 'current',
      evidence: '我住在大阪', source: 'conversation', sourceSessionId: 's1', sourceMessageId: 'm1',
      confidence: 0.9, updatedAt: '2024-01-01T00:00:00.000Z'
    }, {
      id: 'f2', text: '用户住在西安', key: 'identity.current_location', category: 'identity', temporalStatus: 'current',
      evidence: '我住在西安', source: 'conversation', sourceSessionId: 's1', sourceMessageId: 'missing',
      confidence: 0.9, updatedAt: '2024-01-02T00:00:00.000Z'
    }, {
      id: 'f3', text: '用户可能喜欢某种饮料', key: 'preference.unknown', category: 'preference', temporalStatus: 'uncertain',
      evidence: '我可能喜欢某种饮料', source: 'conversation', confidence: 0.3, updatedAt: '2024-01-01T00:00:00.000Z'
    }],
    timeline: [], people: [], episodes: [], topicThreads: []
  }, { now: '2026-08-15T00:00:00.000Z', memoryContextCount: 80, memoryContextTokens: 50000 });
  assert.equal(health.status, 'error');
  assert.equal(health.duplicateCurrentKeys, 1);
  assert.equal(health.conflictingCurrentFacts, 2);
  assert.equal(health.invalidFactEvidence, 1);
  assert.equal(health.orphanFactMessages, 1);
  assert.equal(health.staleUncertainFacts, 1);
  assert.equal(health.excessiveMemoryContext, true);
});
