'use strict';

const crypto = require('node:crypto');
const defaultFs = require('node:fs');
const defaultPath = require('node:path');

function createTemporaryPath(target, fsImpl, pathImpl) {
  const basename = pathImpl.basename(target);
  const nonce = crypto.randomBytes(8).toString('hex');
  return pathImpl.join(pathImpl.dirname(target), `.${basename}.${process.pid}.${nonce}.tmp`);
}

function readBytesIfPresent(filePath, fsImpl) {
  try {
    return fsImpl.readFileSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function writeFileAtomic(filePath, data, options = {}) {
  const fsImpl = options.fs || defaultFs;
  const pathImpl = options.path || defaultPath;
  const target = pathImpl.resolve(filePath);
  const directory = pathImpl.dirname(target);
  fsImpl.mkdirSync(directory, { recursive: true });
  const temporary = createTemporaryPath(target, fsImpl, pathImpl);
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let descriptor = null;
  let committed = false;
  let primaryError = null;

  try {
    descriptor = fsImpl.openSync(temporary, 'wx');
    fsImpl.writeFileSync(descriptor, buffer);
    fsImpl.fsyncSync(descriptor);
    fsImpl.closeSync(descriptor);
    descriptor = null;

    // Node's Windows implementation uses a same-volume replace operation for
    // rename. Never remove the existing target to work around a failed replace.
    fsImpl.renameSync(temporary, target);
    committed = true;
    return target;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (descriptor !== null) {
      try { fsImpl.closeSync(descriptor); } catch (closeError) {
        if (!primaryError) throw closeError;
      }
    }
    if (!committed) {
      try { fsImpl.unlinkSync(temporary); } catch (cleanupError) {
        if (cleanupError?.code !== 'ENOENT' && primaryError) primaryError.cleanupError = cleanupError;
        else if (cleanupError?.code !== 'ENOENT') throw cleanupError;
      }
    }
  }
}

function writeJsonAtomic(filePath, value, options = {}) {
  const contents = JSON.stringify(value, null, 2);
  if (contents === undefined) throw new TypeError('JSON value cannot be serialized.');
  return writeFileAtomic(filePath, Buffer.from(contents, 'utf8'), options);
}

function readJsonFile(filePath, options = {}) {
  const fsImpl = options.fs || defaultFs;
  let bytes;
  try {
    bytes = fsImpl.readFileSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, value: undefined };
    throw error;
  }
  try {
    return { exists: true, value: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    const parseError = new Error(`无法解析 JSON 文件：${filePath}`, { cause: error });
    parseError.code = 'JSON_PARSE_ERROR';
    parseError.filePath = filePath;
    throw parseError;
  }
}

function preserveFileAtomically(sourcePath, backupPath, options = {}) {
  const fsImpl = options.fs || defaultFs;
  const existingBackup = readBytesIfPresent(backupPath, fsImpl);
  const source = fsImpl.readFileSync(sourcePath);
  if (existingBackup) {
    if (existingBackup.equals(source)) return backupPath;
    const error = new Error(`保护文件已存在但内容与源文件不一致：${backupPath}`);
    error.code = 'BACKUP_CONFLICT';
    error.filePath = backupPath;
    throw error;
  }
  writeFileAtomic(backupPath, source, options);
  return backupPath;
}

function ensureFileBackup(sourcePath, backupPath, options = {}) {
  return preserveFileAtomically(sourcePath, backupPath, options);
}

module.exports = {
  ensureFileBackup,
  preserveFileAtomically,
  readJsonFile,
  writeFileAtomic,
  writeJsonAtomic
};

const { runtimeDiagnostics } = require('./runtime-diagnostics');
module.exports.ensureFileBackup = (...args) => runtimeDiagnostics.span('persistence', 'ensure-file-backup', () => ensureFileBackup(...args));
module.exports.preserveFileAtomically = (...args) => runtimeDiagnostics.span('persistence', 'preserve-file-atomically', () => preserveFileAtomically(...args));
module.exports.readJsonFile = (...args) => runtimeDiagnostics.span('persistence', 'read-json-file', () => readJsonFile(...args));
module.exports.writeFileAtomic = (...args) => runtimeDiagnostics.span('persistence', 'write-file-atomic', () => writeFileAtomic(...args));
module.exports.writeJsonAtomic = (...args) => runtimeDiagnostics.span('persistence', 'write-json-atomic', () => writeJsonAtomic(...args));
