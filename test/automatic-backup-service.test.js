const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAutomaticBackupService } = require('../automatic-backup-service');
const { createBackupBundle } = require('../backup-engine');

function createHarness(maxAutomaticBackups = 2) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-automatic-backups-'));
  let timestamp = Date.now();
  const service = createAutomaticBackupService({
    app: { getPath: () => root },
    fs,
    path,
    createBackupBundle: (snapshot) => ({ format: 'test-backup', snapshot }),
    getBackupSnapshot: () => ({ appVersion: '6.1.0', memory: { version: 16 }, settings: {}, knowledge: {} }),
    maxAutomaticBackups,
    now: () => (timestamp += 1)
  });
  return { root, service };
}

test('automatic backup service writes snapshots atomically and retains existing backups', () => {
  const { root, service } = createHarness();
  try {
    service.createAutomaticBackup('daily');
    service.createAutomaticBackup('before-repair');
    service.createAutomaticBackup('before-restore');
    const backups = service.listAutomaticBackups();
    assert.equal(backups.length, 3);
    assert.ok(backups.every((item) => item.name.startsWith('mai-backup-')));
    assert.equal(fs.readdirSync(path.join(root, 'backups')).some((name) => name.endsWith('.tmp')), false);
    const saved = JSON.parse(fs.readFileSync(backups[0].path, 'utf8'));
    assert.equal(saved.snapshot.memory.version, 16);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('automatic backup write failures propagate and never leave a successful-looking backup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-automatic-backup-failure-'));
  const failingFs = Object.create(fs);
  failingFs.renameSync = () => { throw Object.assign(new Error('replacement denied'), { code: 'EPERM' }); };
  const service = createAutomaticBackupService({
    app: { getPath: () => root },
    fs: failingFs,
    path,
    createBackupBundle: (snapshot) => ({ snapshot }),
    getBackupSnapshot: () => ({ memory: { version: 16 } }),
    maxAutomaticBackups: 12,
    now: () => Date.now()
  });
  try {
    assert.throws(() => service.createAutomaticBackup('daily'), { code: 'EPERM' });
    assert.equal(fs.existsSync(path.join(root, 'backups')), true);
    assert.deepEqual(fs.readdirSync(path.join(root, 'backups')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('automatic backup service does not duplicate a fresh daily backup', () => {
  const { root, service } = createHarness();
  try {
    const created = service.createAutomaticBackup('daily');
    const latest = service.ensureDailyAutomaticBackup();
    assert.equal(latest.path, created.path);
    assert.equal(service.listAutomaticBackups().length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('automatic backup uses the complete current snapshot while excluding local credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-automatic-full-backup-'));
  const service = createAutomaticBackupService({
    app: { getPath: () => root },
    fs,
    path,
    createBackupBundle,
    getBackupSnapshot: () => ({
      memory: { version: 16 },
      settings: { deepseek: { apiKeyPlain: 'fake-plain-key', apiKeyEncrypted: 'fake-cipher-key' } },
      knowledge: { version: 1, documents: [{ id: 'doc', sourcePath: 'Z:\\source.pdf', chunks: [] }] },
      work: { version: 1, projects: [{ id: 'project', workspacePath: 'D:\\workspace' }], sessions: [{ id: 'session', projectId: 'project', messages: [] }] },
      resources: { customWallpaper: null, customAvatars: { mai: null, user: null } }
    })
  });
  try {
    const created = service.createAutomaticBackup('daily');
    const text = fs.readFileSync(created.path, 'utf8');
    const bundle = JSON.parse(text);
    assert.doesNotMatch(text, /fake-plain-key|fake-cipher-key/);
    assert.equal(bundle.formatVersion, 2);
    assert.equal(bundle.payload.work.projects[0].workspacePath, 'D:\\workspace');
    assert.equal(bundle.payload.knowledge.documents[0].sourcePath, 'Z:\\source.pdf');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('automatic backup preserves a prior file when the clock returns the same timestamp', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-automatic-backup-collision-'));
  let version = 1;
  const service = createAutomaticBackupService({
    app: { getPath: () => root },
    fs,
    path,
    createBackupBundle: (snapshot) => ({ snapshot }),
    getBackupSnapshot: () => ({ version }),
    now: () => 1792320000000
  });
  try {
    const first = service.createAutomaticBackup('before-restore');
    version = 2;
    const second = service.createAutomaticBackup('before-restore');
    assert.notEqual(first.path, second.path);
    assert.equal(JSON.parse(fs.readFileSync(first.path, 'utf8')).snapshot.version, 1);
    assert.equal(JSON.parse(fs.readFileSync(second.path, 'utf8')).snapshot.version, 2);
    assert.equal(service.listAutomaticBackups().length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
