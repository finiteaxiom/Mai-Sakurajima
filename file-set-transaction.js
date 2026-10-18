'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readJsonFile, writeFileAtomic, writeJsonAtomic } = require('./json-persistence');

const TRANSACTION_FILE = 'mai-restore-transaction.json';
const TRANSACTION_FORMAT = 'mai-restore-transaction';

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readIfPresent(filePath, fsImpl) {
  try { return fsImpl.readFileSync(filePath); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function unlinkIfPresent(filePath, fsImpl) {
  try { fsImpl.unlinkSync(filePath); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function safeResolve(root, relativePath, pathImpl = path) {
  if (typeof relativePath !== 'string' || !relativePath || pathImpl.isAbsolute(relativePath)) {
    throw Object.assign(new Error('恢复事务包含无效路径。'), { code: 'RESTORE_JOURNAL_INVALID' });
  }
  const resolvedRoot = pathImpl.resolve(root);
  const resolved = pathImpl.resolve(resolvedRoot, relativePath);
  const relative = pathImpl.relative(resolvedRoot, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${pathImpl.sep}`) || pathImpl.isAbsolute(relative)) {
    throw Object.assign(new Error('恢复事务路径超出用户数据目录。'), { code: 'RESTORE_JOURNAL_INVALID' });
  }
  return resolved;
}

function validateTargets(root, entries, pathImpl, allowedTargets) {
  const targets = new Set();
  const allowed = Array.isArray(allowedTargets)
    ? new Set(allowedTargets.map((item) => pathImpl.resolve(item)))
    : null;
  for (const entry of entries) {
    const target = pathImpl.resolve(entry.path);
    const relative = pathImpl.relative(pathImpl.resolve(root), target);
    if (!relative || relative === '..' || relative.startsWith(`..${pathImpl.sep}`) || pathImpl.isAbsolute(relative)) {
      throw Object.assign(new Error(`恢复目标超出用户数据目录：${entry.path}`), { code: 'RESTORE_TARGET_INVALID' });
    }
    if (allowed && !allowed.has(target)) {
      throw Object.assign(new Error(`恢复目标不在允许范围内：${entry.path}`), { code: 'RESTORE_TARGET_INVALID' });
    }
    if (targets.has(target)) throw Object.assign(new Error(`恢复目标重复：${entry.path}`), { code: 'RESTORE_TARGET_INVALID' });
    targets.add(target);
  }
}

function entryPaths(root, target, transactionId, pathImpl) {
  const directory = pathImpl.dirname(target);
  const basename = pathImpl.basename(target);
  const staged = pathImpl.join(directory, `.${basename}.restore-new-${transactionId}.tmp`);
  const backup = pathImpl.join(directory, `.${basename}.restore-old-${transactionId}.bak`);
  return {
    path: pathImpl.relative(root, target),
    staged: pathImpl.relative(root, staged),
    backup: pathImpl.relative(root, backup)
  };
}

function cleanupJournalAndFiles(journalPath, entries, root, fsImpl, pathImpl) {
  unlinkIfPresent(journalPath, fsImpl);
  for (const entry of entries) {
    if (entry.staged) unlinkIfPresent(safeResolve(root, entry.staged, pathImpl), fsImpl);
    if (entry.backup) unlinkIfPresent(safeResolve(root, entry.backup, pathImpl), fsImpl);
  }
}

function rollbackEntries(root, entries, fsImpl, pathImpl) {
  const errors = [];
  for (const entry of [...entries].reverse()) {
    try {
      const target = safeResolve(root, entry.path, pathImpl);
      const current = readIfPresent(target, fsImpl);
      if (entry.existed) {
        const backup = safeResolve(root, entry.backup, pathImpl);
        const bytes = readIfPresent(backup, fsImpl);
        if (!bytes) throw Object.assign(new Error(`恢复前数据副本缺失：${backup}`), { code: 'RESTORE_ROLLBACK_SOURCE_MISSING' });
        if (!entry.originalHash || hash(bytes) !== entry.originalHash) {
          throw Object.assign(new Error(`恢复前数据副本校验失败：${backup}`), { code: 'RESTORE_ROLLBACK_SOURCE_INVALID' });
        }
        if (current && hash(current) === entry.originalHash) continue;
        if (entry.newHash ? (!current || hash(current) !== entry.newHash) : current !== null) {
          throw Object.assign(new Error(`恢复目标在回滚前发生变化，保留现有文件：${target}`), { code: 'RESTORE_ROLLBACK_CONFLICT' });
        }
        writeFileAtomic(target, bytes, { fs: fsImpl, path: pathImpl });
      } else {
        if (current && (!entry.newHash || hash(current) !== entry.newHash)) {
          throw Object.assign(new Error(`恢复目标在回滚前发生变化，保留现有文件：${target}`), { code: 'RESTORE_ROLLBACK_CONFLICT' });
        }
        if (current) unlinkIfPresent(target, fsImpl);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function validateJournal(root, journal, allowedTargets, pathImpl) {
  if (!journal || journal.format !== TRANSACTION_FORMAT || !['committing', 'committed'].includes(journal.phase) || !Array.isArray(journal.entries)) {
    throw Object.assign(new Error('恢复事务记录无效，已停止读取用户数据。'), { code: 'RESTORE_JOURNAL_INVALID' });
  }
  const allowed = new Set((allowedTargets || []).map((item) => pathImpl.resolve(item)));
  for (const entry of journal.entries) {
    const target = safeResolve(root, entry?.path, pathImpl);
    if (!allowed.has(target)) throw Object.assign(new Error(`恢复事务目标不在允许范围内：${entry.path}`), { code: 'RESTORE_JOURNAL_INVALID' });
    if (typeof entry.existed !== 'boolean') throw Object.assign(new Error('恢复事务缺少原文件状态。'), { code: 'RESTORE_JOURNAL_INVALID' });
    if (entry.existed && !/^[a-f0-9]{64}$/i.test(String(entry.originalHash || ''))) {
      throw Object.assign(new Error('恢复事务缺少有效的原文件校验值。'), { code: 'RESTORE_JOURNAL_INVALID' });
    }
    if (entry.newHash && !/^[a-f0-9]{64}$/i.test(String(entry.newHash))) {
      throw Object.assign(new Error('恢复事务的新文件校验值无效。'), { code: 'RESTORE_JOURNAL_INVALID' });
    }
    for (const relative of [entry.staged, entry.backup].filter(Boolean)) {
      const helperPath = safeResolve(root, relative, pathImpl);
      if (pathImpl.dirname(helperPath) !== pathImpl.dirname(target)) {
        throw Object.assign(new Error('恢复事务辅助文件必须与目标位于同一目录。'), { code: 'RESTORE_JOURNAL_INVALID' });
      }
    }
    if (entry.existed && !entry.backup) throw Object.assign(new Error('恢复事务缺少原文件副本路径。'), { code: 'RESTORE_JOURNAL_INVALID' });
  }
}

function recoverInterruptedFileSetTransaction(root, options = {}) {
  const fsImpl = options.fs || fs;
  const pathImpl = options.path || path;
  const journalPath = pathImpl.join(pathImpl.resolve(root), TRANSACTION_FILE);
  const loaded = readJsonFile(journalPath, { fs: fsImpl });
  if (!loaded.exists) return { recovered: false, action: 'none' };
  const journal = loaded.value;
  validateJournal(root, journal, options.allowedTargets, pathImpl);

  if (journal.phase === 'committing') {
    const errors = rollbackEntries(root, journal.entries, fsImpl, pathImpl);
    if (errors.length) {
      const error = new AggregateError(errors, '上次备份恢复未能完整回滚；保留恢复事务文件以便再次恢复。');
      error.code = 'RESTORE_ROLLBACK_FAILED';
      error.recoveryJournalPath = journalPath;
      throw error;
    }
    cleanupJournalAndFiles(journalPath, journal.entries, root, fsImpl, pathImpl);
    return { recovered: true, action: 'rolled-back' };
  }

  cleanupJournalAndFiles(journalPath, journal.entries, root, fsImpl, pathImpl);
  return { recovered: true, action: 'cleaned-committed' };
}

function commitFileSetAtomically(root, inputEntries, options = {}) {
  const fsImpl = options.fs || fs;
  const pathImpl = options.path || path;
  const resolvedRoot = pathImpl.resolve(root);
  const journalPath = pathImpl.join(resolvedRoot, TRANSACTION_FILE);
  if (readJsonFile(journalPath, { fs: fsImpl }).exists) {
    throw Object.assign(new Error('存在尚未恢复的文件提交事务。'), { code: 'RESTORE_IN_PROGRESS' });
  }
  const entries = (Array.isArray(inputEntries) ? inputEntries : []).map((entry) => ({
    path: pathImpl.resolve(entry.path),
    data: entry.data === null ? null : Buffer.from(entry.data)
  }));
  if (!entries.length) return { committed: true, cleanupWarnings: [] };
  validateTargets(resolvedRoot, entries, pathImpl, options.allowedTargets);

  const transactionId = crypto.randomBytes(12).toString('hex');
  const journalEntries = [];
  const createdHelpers = [];
  let journalWritten = false;
  try {
    for (const item of entries) {
      fsImpl.mkdirSync(pathImpl.dirname(item.path), { recursive: true });
      const existingBytes = readIfPresent(item.path, fsImpl);
      const paths = entryPaths(resolvedRoot, item.path, transactionId, pathImpl);
      const entry = {
        ...paths,
        existed: existingBytes !== null,
        originalHash: existingBytes ? hash(existingBytes) : '',
        newHash: item.data === null ? '' : hash(item.data)
      };
      if (item.data !== null) {
        const stagedPath = safeResolve(resolvedRoot, entry.staged, pathImpl);
        writeFileAtomic(stagedPath, item.data, { fs: fsImpl, path: pathImpl });
        createdHelpers.push(stagedPath);
      }
      if (existingBytes !== null) {
        const backupPath = safeResolve(resolvedRoot, entry.backup, pathImpl);
        writeFileAtomic(backupPath, existingBytes, { fs: fsImpl, path: pathImpl });
        createdHelpers.push(backupPath);
      }
      journalEntries.push(entry);
    }

    writeJsonAtomic(journalPath, {
      format: TRANSACTION_FORMAT,
      phase: 'committing',
      entries: journalEntries
    }, { fs: fsImpl, path: pathImpl });
    journalWritten = true;

    for (let index = 0; index < entries.length; index += 1) {
      const item = entries[index];
      const journalEntry = journalEntries[index];
      const currentBytes = readIfPresent(item.path, fsImpl);
      if (journalEntry.existed) {
        if (!currentBytes || hash(currentBytes) !== journalEntry.originalHash) {
          throw Object.assign(new Error(`恢复目标在提交前发生变化：${item.path}`), { code: 'RESTORE_TARGET_CHANGED' });
        }
      } else if (currentBytes) {
        throw Object.assign(new Error(`恢复目标在提交前已被其他写入创建：${item.path}`), { code: 'RESTORE_TARGET_CHANGED' });
      }

      if (item.data === null) {
        if (currentBytes) unlinkIfPresent(item.path, fsImpl);
      } else {
        fsImpl.renameSync(safeResolve(resolvedRoot, journalEntry.staged, pathImpl), item.path);
      }
    }

    writeJsonAtomic(journalPath, {
      format: TRANSACTION_FORMAT,
      phase: 'committed',
      entries: journalEntries
    }, { fs: fsImpl, path: pathImpl });

    const cleanupWarnings = [];
    try { unlinkIfPresent(journalPath, fsImpl); } catch (error) { cleanupWarnings.push(error); }
    if (!fsImpl.existsSync(journalPath)) {
      for (const entry of journalEntries) {
        for (const relative of [entry.staged, entry.backup].filter(Boolean)) {
          try { unlinkIfPresent(safeResolve(resolvedRoot, relative, pathImpl), fsImpl); } catch (error) { cleanupWarnings.push(error); }
        }
      }
    }
    return { committed: true, cleanupWarnings };
  } catch (error) {
    if (journalWritten) {
      const rollbackErrors = rollbackEntries(resolvedRoot, journalEntries, fsImpl, pathImpl);
      if (rollbackErrors.length) {
        const rollbackError = new AggregateError([error, ...rollbackErrors], '文件提交失败且自动回滚未能完成；保留恢复文件以便下次启动恢复。');
        rollbackError.code = 'RESTORE_ROLLBACK_FAILED';
        rollbackError.cause = error;
        rollbackError.recoveryJournalPath = journalPath;
        throw rollbackError;
      }
      try { cleanupJournalAndFiles(journalPath, journalEntries, resolvedRoot, fsImpl, pathImpl); } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
    } else {
      for (const helper of createdHelpers) {
        try { unlinkIfPresent(helper, fsImpl); } catch (cleanupError) {
          if (!error.cleanupError) error.cleanupError = cleanupError;
        }
      }
    }
    throw error;
  }
}

module.exports = {
  TRANSACTION_FILE,
  commitFileSetAtomically,
  recoverInterruptedFileSetTransaction
};
