'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  commitFileSetAtomically,
  recoverInterruptedFileSetTransaction
} = require('../file-set-transaction');

function withDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-file-transaction-'));
  try { return callback(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('file-set restore commits replacements, additions, and deletions together', () => withDirectory((directory) => {
  const first = path.join(directory, 'memory.json');
  const second = path.join(directory, 'knowledge.json');
  const third = path.join(directory, 'work.json');
  fs.writeFileSync(first, 'old-memory');
  fs.writeFileSync(second, 'old-knowledge');

  commitFileSetAtomically(directory, [
    { path: first, data: Buffer.from('new-memory') },
    { path: second, data: null },
    { path: third, data: Buffer.from('new-work') }
  ]);

  assert.equal(fs.readFileSync(first, 'utf8'), 'new-memory');
  assert.equal(fs.existsSync(second), false);
  assert.equal(fs.readFileSync(third, 'utf8'), 'new-work');
  assert.deepEqual(fs.readdirSync(directory).sort(), ['memory.json', 'work.json']);
}));

test('a mid-commit failure rolls every already-written file back and does not report success', () => withDirectory((directory) => {
  const first = path.join(directory, 'memory.json');
  const second = path.join(directory, 'settings.json');
  const third = path.join(directory, 'work.json');
  fs.writeFileSync(first, 'old-memory');
  fs.writeFileSync(second, 'old-settings');
  let failOnce = true;
  const failingFs = Object.create(fs);
  failingFs.renameSync = (source, target) => {
    if (target === second && String(source).includes('restore-new') && failOnce) {
      failOnce = false;
      throw Object.assign(new Error('replacement denied'), { code: 'EPERM' });
    }
    return fs.renameSync(source, target);
  };

  assert.throws(() => commitFileSetAtomically(directory, [
    { path: first, data: Buffer.from('new-memory') },
    { path: second, data: Buffer.from('new-settings') },
    { path: third, data: Buffer.from('new-work') }
  ], { fs: failingFs }), { code: 'EPERM' });
  assert.equal(fs.readFileSync(first, 'utf8'), 'old-memory');
  assert.equal(fs.readFileSync(second, 'utf8'), 'old-settings');
  assert.equal(fs.existsSync(third), false);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['memory.json', 'settings.json']);
}));

test('an interrupted restore journal is rolled back before data loading', () => withDirectory((directory) => {
  const first = path.join(directory, 'memory.json');
  const second = path.join(directory, 'settings.json');
  fs.writeFileSync(first, 'new-memory');
  const backupPath = path.join(directory, '.settings.restore-old-test.bak');
  fs.writeFileSync(backupPath, 'original-settings');
  const journalPath = path.join(directory, 'mai-restore-transaction.json');
  fs.writeFileSync(journalPath, JSON.stringify({
    format: 'mai-restore-transaction',
    phase: 'committing',
    entries: [
      { path: 'memory.json', existed: false, staged: '', backup: '', newHash: require('node:crypto').createHash('sha256').update('new-memory').digest('hex') },
      { path: 'settings.json', existed: true, staged: '', backup: path.basename(backupPath), newHash: '', originalHash: require('node:crypto').createHash('sha256').update('original-settings').digest('hex') }
    ]
  }));

  recoverInterruptedFileSetTransaction(directory, { allowedTargets: [first, second] });
  assert.equal(fs.existsSync(first), false);
  assert.equal(fs.readFileSync(second, 'utf8'), 'original-settings');
  assert.equal(fs.existsSync(journalPath), false);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['settings.json']);
}));

test('recovery refuses to restore a corrupted original snapshot and keeps its journal for manual recovery', () => withDirectory((directory) => {
  const target = path.join(directory, 'settings.json');
  const backup = path.join(directory, '.settings.restore-old-test.bak');
  const journalPath = path.join(directory, 'mai-restore-transaction.json');
  fs.writeFileSync(target, 'new-settings');
  fs.writeFileSync(backup, 'corrupt-snapshot');
  fs.writeFileSync(journalPath, JSON.stringify({
    format: 'mai-restore-transaction',
    phase: 'committing',
    entries: [{
      path: 'settings.json',
      existed: true,
      staged: '',
      backup: path.basename(backup),
      originalHash: require('node:crypto').createHash('sha256').update('original-settings').digest('hex'),
      newHash: require('node:crypto').createHash('sha256').update('new-settings').digest('hex')
    }]
  }));

  assert.throws(() => recoverInterruptedFileSetTransaction(directory, { allowedTargets: [target] }), { code: 'RESTORE_ROLLBACK_FAILED' });
  assert.equal(fs.readFileSync(target, 'utf8'), 'new-settings');
  assert.equal(fs.existsSync(journalPath), true);
  assert.equal(fs.existsSync(backup), true);
}));
