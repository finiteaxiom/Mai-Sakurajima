const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-startup-smoke-'));
  env.MAI_STARTUP_TEST_DIR = directory;
  const result = require('node:child_process').spawnSync(require('electron'),
    [__filename, `--user-data-dir=${directory}`], { env, encoding: 'utf8', timeout: 30000, windowsHide: true });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  process.exitCode = result.status === 0 ? 0 : 1;
} else {
  const { app, BrowserWindow } = require('electron');
  const { showStartupAnimation } = require('../startup-animation');
  app.disableHardwareAcceleration();
  app.on('window-all-closed', () => {});
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    for (const scenario of ['ended', 'skip', 'escape', 'error', 'timeout', 'missing-page']) {
      const started = Date.now();
      const done = showStartupAnimation({ BrowserWindow,
        rootDirectory: scenario === 'missing-page' ? process.env.MAI_STARTUP_TEST_DIR : path.resolve(__dirname, '..') });
      const window = BrowserWindow.getAllWindows()[0];
      if (scenario !== 'missing-page') {
        await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
        const run = code => window.webContents.executeJavaScript(code);
        if (scenario === 'ended') {
          await delay(900);
          const state = await run(`({time:document.querySelector('video').currentTime,duration:document.querySelector('video').duration,error:document.querySelector('video').error})`);
          assert.ok(state.time > 0 && state.time < 3, JSON.stringify(state));
          assert.equal(state.duration, 3);
          assert.equal(state.error, null);
          fs.writeFileSync(path.join(process.env.MAI_STARTUP_TEST_DIR, 'startup.png'), (await window.webContents.capturePage()).toPNG());
        } else if (scenario === 'skip') {
          await run(`document.getElementById('skip-startup').click()`);
        } else if (scenario === 'escape') {
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
        } else if (scenario === 'error') {
          await run(`document.querySelector('video').src='media/missing.mp4'`);
        } else {
          await run(`document.querySelector('video').pause()`);
        }
      }
      await done;
      assert.ok(window.isDestroyed());
      const elapsed = Date.now() - started;
      if (scenario === 'ended') assert.ok(elapsed >= 2900 && elapsed < 7000, String(elapsed));
      if (scenario === 'timeout') assert.ok(elapsed >= 7900 && elapsed < 10000, String(elapsed));
      console.log(`PASS startup ${scenario}: ${elapsed}ms`);
    }
    console.log(`Screenshot: ${path.join(process.env.MAI_STARTUP_TEST_DIR, 'startup.png')}`);
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}
