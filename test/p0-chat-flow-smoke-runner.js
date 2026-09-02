'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveElectronExecutable } = require('./electron-executable');

const electronExe = resolveElectronExecutable(process.argv[2]);

const projectRoot = path.resolve(__dirname, '..');
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-p0-chat-flow-'));
const outputPath = path.join(testRoot, 'result.json');

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  try {
    const args = path.basename(electronExe).toLowerCase() === 'electron.exe' ? [projectRoot] : [];
    const command = `& ${quote(path.resolve(electronExe))} ${[
      ...args,
      `--user-data-dir=${testRoot}`,
      '--disable-gpu',
      '--disable-gpu-compositing'
    ].map(quote).join(' ')}`;
    await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
        cwd: projectRoot,
        env: {
          ...process.env,
          MAI_P0_CHAT_SMOKE: '1',
          MAI_P0_CHAT_SMOKE_OUTPUT: outputPath
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`P0 Chat flow smoke timed out.\n${stdout}\n${stderr}`));
      }, 30000);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`P0 Chat flow smoke exited with ${code}.\n${stdout}\n${stderr}`));
      });
    });
    const result = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(result.ok, true, result.error || JSON.stringify(result));
    assert.equal(result.runtimeMode, 'chat');
    assert.equal(result.localTimeAnswer, true);
    assert.equal(result.persistedUserMessage, true);
    assert.equal(result.stateMessages, 2);
    assert.equal(result.persistedMessages, 2);
    assert.equal(result.memoryCorrectionApplied, true);
    assert.equal(result.evidenceTrailPreserved, true);
    assert.equal(result.sameSourceDeduplicated, true);
    assert.equal(result.currentPreferenceAdded, true);
    assert.equal(result.locationChangeApplied, true);
    assert.equal(result.completedGoalArchived, true);
    assert.equal(result.pinnedManualProtected, true);
    console.log(JSON.stringify(result));
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
