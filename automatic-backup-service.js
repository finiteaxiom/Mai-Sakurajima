'use strict';

const { writeJsonAtomic: persistJsonAtomic } = require('./json-persistence');

function createAutomaticBackupService({
  app,
  fs,
  path,
  createBackupBundle,
  getBackupSnapshot,
  now = () => Date.now()
}) {
  let collisionSequence = 0;
  function backupDirectory() {
    return path.join(app.getPath('userData'), 'backups');
  }

  function safeFileTimestamp(value = now()) {
    return new Date(value).toISOString().replace(/[:.]/g, '-');
  }

  function writeJsonAtomic(filePath, value) {
    return persistJsonAtomic(filePath, value, { fs, path });
  }

  function listAutomaticBackups() {
    const directory = backupDirectory();
    let names;
    try { names = fs.readdirSync(directory); } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    return names
      .filter((name) => /^mai-backup-.*\.json$/i.test(name))
      .map((name) => {
        const filePath = path.join(directory, name);
        const stat = fs.statSync(filePath);
        return { name, path: filePath, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  function createAutomaticBackup(reason = 'automatic') {
    const cleanReason = String(reason || 'automatic').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 32) || 'automatic';
    const baseName = `mai-backup-${safeFileTimestamp()}-${cleanReason}`;
    let filePath = path.join(backupDirectory(), `${baseName}.json`);
    while (fs.existsSync(filePath)) {
      collisionSequence += 1;
      filePath = path.join(backupDirectory(), `${baseName}-${collisionSequence}.json`);
    }
    writeJsonAtomic(filePath, createBackupBundle(getBackupSnapshot()));
    return { name: path.basename(filePath), path: filePath, size: fs.statSync(filePath).size };
  }

  function ensureDailyAutomaticBackup() {
    const latest = listAutomaticBackups()[0];
    if (!latest || now() - new Date(latest.createdAt).getTime() >= 24 * 60 * 60 * 1000) {
      return createAutomaticBackup('daily');
    }
    return latest;
  }

  return {
    safeFileTimestamp,
    writeJsonAtomic,
    listAutomaticBackups,
    createAutomaticBackup,
    ensureDailyAutomaticBackup
  };
}

module.exports = { createAutomaticBackupService };
