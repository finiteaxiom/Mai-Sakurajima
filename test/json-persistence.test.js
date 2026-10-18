'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ensureFileBackup,
  preserveFileAtomically,
  readJsonFile,
  writeJsonAtomic
} = require('../json-persistence');

function withDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-json-persistence-'));
  try { return callback(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function withFsOverrides(overrides) {
  const result = Object.create(fs);
  for (const [name, value] of Object.entries(overrides)) result[name] = value;
  return result;
}

test('JSON persistence creates, replaces, and rereads files using same-directory temporary files', () => withDirectory((directory) => {
  const target = path.join(directory, 'settings.json');
  assert.equal(readJsonFile(target).exists, false);
  writeJsonAtomic(target, { first: true });
  assert.deepEqual(readJsonFile(target), { exists: true, value: { first: true } });
  writeJsonAtomic(target, { second: true });
  assert.deepEqual(readJsonFile(target), { exists: true, value: { second: true } });
  assert.deepEqual(fs.readdirSync(directory), ['settings.json']);
}));

test('JSON persistence propagates temporary-file write failures and leaves the target untouched', () => withDirectory((directory) => {
  const target = path.join(directory, 'memory.json');
  fs.writeFileSync(target, '{"keep":"original"}', 'utf8');
  const failingFs = withFsOverrides({
    writeFileSync(fd, contents, ...rest) {
      if (typeof fd === 'number') throw Object.assign(new Error('disk is full'), { code: 'ENOSPC' });
      return fs.writeFileSync(fd, contents, ...rest);
    }
  });
  assert.throws(() => writeJsonAtomic(target, { replacement: true }, { fs: failingFs }), { code: 'ENOSPC' });
  assert.equal(fs.readFileSync(target, 'utf8'), '{"keep":"original"}');
  assert.deepEqual(fs.readdirSync(directory), ['memory.json']);
}));

test('JSON persistence propagates replacement and access failures without deleting the old file', () => withDirectory((directory) => {
  const target = path.join(directory, 'settings.json');
  fs.writeFileSync(target, '{"keep":"original"}', 'utf8');
  const failingRename = withFsOverrides({
    renameSync() { throw Object.assign(new Error('replacement denied'), { code: 'EPERM' }); }
  });
  assert.throws(() => writeJsonAtomic(target, { replacement: true }, { fs: failingRename }), { code: 'EPERM' });
  assert.equal(fs.readFileSync(target, 'utf8'), '{"keep":"original"}');
  assert.deepEqual(fs.readdirSync(directory), ['settings.json']);

  const inaccessibleFs = withFsOverrides({
    openSync(filePath, flags, ...rest) {
      if (String(flags).includes('w')) throw Object.assign(new Error('access denied'), { code: 'EACCES' });
      return fs.openSync(filePath, flags, ...rest);
    }
  });
  assert.throws(() => writeJsonAtomic(target, { replacement: true }, { fs: inaccessibleFs }), { code: 'EACCES' });
  assert.equal(fs.readFileSync(target, 'utf8'), '{"keep":"original"}');
}));

test('JSON reads distinguish missing files, invalid JSON, and access failures', () => withDirectory((directory) => {
  const missing = readJsonFile(path.join(directory, 'missing.json'));
  assert.deepEqual(missing, { exists: false, value: undefined });
  const invalidPath = path.join(directory, 'invalid.json');
  fs.writeFileSync(invalidPath, '{broken', 'utf8');
  assert.throws(() => readJsonFile(invalidPath), { code: 'JSON_PARSE_ERROR' });
  const accessDeniedFs = withFsOverrides({
    readFileSync() { throw Object.assign(new Error('access denied'), { code: 'EACCES' }); }
  });
  assert.throws(() => readJsonFile(invalidPath, { fs: accessDeniedFs }), { code: 'EACCES' });
}));

test('original bytes are protected before recovery or migration writes and backup failure preserves the source', () => withDirectory((directory) => {
  const source = path.join(directory, 'memory.json');
  const recovery = path.join(directory, 'memory.unreadable.backup.json');
  const original = Buffer.from('{"unfinished": [\u0000', 'utf8');
  fs.writeFileSync(source, original);
  const failingFs = withFsOverrides({
    renameSync() { throw Object.assign(new Error('backup replacement denied'), { code: 'EPERM' }); }
  });
  assert.throws(() => preserveFileAtomically(source, recovery, { fs: failingFs }), { code: 'EPERM' });
  assert.deepEqual(fs.readFileSync(source), original);
  assert.equal(fs.existsSync(recovery), false);
  assert.deepEqual(fs.readdirSync(directory), ['memory.json']);

  const migrationBackup = path.join(directory, 'memory.before-upgrade.json');
  assert.equal(ensureFileBackup(source, migrationBackup), migrationBackup);
  assert.deepEqual(fs.readFileSync(migrationBackup), original);
  assert.deepEqual(fs.readFileSync(source), original);
  assert.equal(ensureFileBackup(source, migrationBackup), migrationBackup);
}));
