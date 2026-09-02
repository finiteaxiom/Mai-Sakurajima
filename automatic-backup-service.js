function createAutomaticBackupService({
  app,
  fs,
  path,
  createBackupBundle,
  getBackupSnapshot,
  maxAutomaticBackups,
  now = () => Date.now()
}) {
  function backupDirectory() {
    return path.join(app.getPath('userData'), 'backups');
  }

  function safeFileTimestamp(value = now()) {
    return new Date(value).toISOString().replace(/[:.]/g, '-');
  }

  function writeJsonAtomic(filePath, value) {
    const target = path.resolve(filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
    fs.copyFileSync(temporary, target);
    fs.unlinkSync(temporary);
  }

  function listAutomaticBackups() {
    const directory = backupDirectory();
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
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
    const filePath = path.join(backupDirectory(), `mai-backup-${safeFileTimestamp()}-${cleanReason}.json`);
    writeJsonAtomic(filePath, createBackupBundle(getBackupSnapshot()));
    const backups = listAutomaticBackups();
    for (const item of backups.slice(maxAutomaticBackups)) {
      if (path.dirname(path.resolve(item.path)) === path.resolve(backupDirectory())) {
        fs.unlinkSync(item.path);
      }
    }
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
