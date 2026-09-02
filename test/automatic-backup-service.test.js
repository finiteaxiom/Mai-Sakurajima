const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAutomaticBackupService } = require('../automatic-backup-service');

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

test('automatic backup service writes snapshots atomically and enforces its retention limit', () => {
  const { root, service } = createHarness();
  try {
    service.createAutomaticBackup('daily');
    service.createAutomaticBackup('before-repair');
    service.createAutomaticBackup('before-restore');
    const backups = service.listAutomaticBackups();
    assert.equal(backups.length, 2);
    assert.ok(backups.every((item) => item.name.startsWith('mai-backup-')));
    assert.equal(fs.readdirSync(path.join(root, 'backups')).some((name) => name.endsWith('.tmp')), false);
    const saved = JSON.parse(fs.readFileSync(backups[0].path, 'utf8'));
    assert.equal(saved.snapshot.memory.version, 16);
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
