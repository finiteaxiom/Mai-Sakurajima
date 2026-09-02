const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const executable = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!executable || !fs.existsSync(executable)) {
  throw new Error('Usage: node test/packaged-chat-close-smoke-runner.js <Mai Sakurajima.exe>');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-v5120-close-'));
const output = path.join(root, 'close-result.json');
try {
  const appArguments = path.basename(executable).toLowerCase() === 'electron.exe'
    ? [path.resolve(__dirname, '..')]
    : [];
  const processResult = spawnSync(executable, [
    ...appArguments,
    `--user-data-dir=${path.join(root, 'user-data')}`,
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--in-process-gpu',
    '--no-sandbox'
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: false,
    env: {
      ...process.env,
      MAI_CLOSE_CHAT_SMOKE: '1',
      MAI_CLOSE_CHAT_SMOKE_OUTPUT: output
    }
  });
  if (processResult.error) throw processResult.error;
  const result = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  assert.equal(processResult.status, 0, `${processResult.stdout}\n${processResult.stderr}\n${JSON.stringify(result)}`);
  assert.ok(result, 'Chat close smoke did not create a result file.');
  assert.equal(result.ok, true, result.uncaughtError || JSON.stringify(result));
  assert.equal(result.chatWindowReleased, true);
  assert.equal(result.windowDestroyed, true);
  assert.equal(result.uncaughtError, '');
  assert.ok(Number.isInteger(result.capturedWebContentsId));
  console.log(JSON.stringify(result));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
