'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveElectronExecutable } = require('./electron-executable');

const electronExe = resolveElectronExecutable(process.argv[2]);
const projectRoot = path.resolve(__dirname, '..');
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-restore-protection-'));
const userData = path.join(testRoot, 'user-data');
const backupPath = path.join(testRoot, 'restore-input.json');

function runElectron(mode, outputPath) {
  const appArguments = path.basename(electronExe).toLowerCase() === 'electron.exe'
    ? [projectRoot]
    : [];
  const result = spawnSync(electronExe, [
    ...appArguments,
    `--user-data-dir=${userData}`,
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--in-process-gpu',
    '--no-sandbox'
  ], {
    cwd: testRoot,
    encoding: 'utf8',
    timeout: 90000,
    windowsHide: false,
    env: {
      ...process.env,
      MAI_RESTORE_PROTECTION_SMOKE: mode === 'protection' ? '1' : '',
      MAI_RESTORE_PROTECTION_OUTPUT: mode === 'protection' ? outputPath : '',
      MAI_RESTORE_PROTECTION_BACKUP: mode === 'protection' ? backupPath : '',
      MAI_RESTORE_RECOVERY_SMOKE: mode === 'recovery' ? '1' : '',
      MAI_RESTORE_RECOVERY_OUTPUT: mode === 'recovery' ? outputPath : ''
    }
  });
  if (result.error) throw result.error;
  const report = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || ''}\n${JSON.stringify(report)}`);
  assert.ok(report, `${mode} smoke did not create a report`);
  assert.equal(report.ok, true, report.error || JSON.stringify(report));
  return report;
}

try {
  const protection = runElectron('protection', path.join(testRoot, 'protection.json'));
  assert.equal(protection.gateState, 'restore-rollback-failed');
  assert.equal(protection.ordinaryRollbackStayedWritable, true);
  assert.equal(protection.pendingAssetWriteBlocked, true);
  assert.equal(protection.backgroundRefreshBlocked, true);
  assert.equal(protection.backgroundSchedulersStopped, true);
  assert.equal(protection.shutdownSaveBlocked, true);
  assert.equal(protection.actualBeforeQuitBlocked, true);
  assert.equal(protection.targetBytesStableAfterBlockedWrites, true);
  assert.equal(protection.journalAndOriginalsRetained, true);
  assert.ok(protection.userNotice.includes('已暂停所有本地数据写入'));

  const recovery = runElectron('recovery', path.join(testRoot, 'recovery.json'));
  assert.equal(recovery.gateState, 'ready');
  assert.equal(recovery.recovery?.action, 'rolled-back');
  assert.equal(recovery.journalRemaining, false);

  for (const original of protection.baselineBeforeProtectedFailure) {
    const target = path.join(userData, original.name);
    if (original.base64 === null) {
      assert.equal(fs.existsSync(target), false, `${original.name} should remain absent after restart recovery`);
    } else {
      assert.deepEqual(fs.readFileSync(target), Buffer.from(original.base64, 'base64'), `${original.name} should match pre-restore bytes`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    ordinaryRollbackStayedWritable: protection.ordinaryRollbackStayedWritable,
    rollbackFailureBlockedWrites: protection.blockedErrors,
    pendingAssetWriteBlocked: protection.pendingAssetWriteBlocked,
    shutdownSaveBlocked: protection.shutdownSaveBlocked,
    restartRecovery: recovery.recovery,
    restoredOriginalTargets: protection.baselineBeforeProtectedFailure.length
  }));
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
