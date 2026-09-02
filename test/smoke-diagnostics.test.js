const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  SmokeDiagnostics,
  rendererSmokeMode,
  rendererSmokeOutput
} = require('../smoke-diagnostics');

test('renderer smoke mode only enables UI tests that need a Renderer', () => {
  assert.equal(rendererSmokeMode({ MAI_UI_SMOKE: '1' }), 'ui');
  assert.equal(rendererSmokeMode({ MAI_CLOSE_CHAT_SMOKE: '1' }), 'chat_close');
  assert.equal(rendererSmokeMode({ MAI_MIGRATION_SMOKE: '1' }), '');
  assert.equal(rendererSmokeMode({}), '');
  assert.equal(rendererSmokeOutput({ MAI_UI_SMOKE: '1', MAI_UI_SMOKE_OUTPUT: 'ui.json' }), 'ui.json');
  assert.equal(rendererSmokeOutput({ MAI_CLOSE_CHAT_SMOKE: '1', MAI_CLOSE_CHAT_SMOKE_OUTPUT: 'close.json' }), 'close.json');
});

test('diagnostics checkpoints survive a crash before the smoke result is complete', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-smoke-diagnostics-'));
  try {
    const output = path.join(root, 'result.json');
    const diagnostics = new SmokeDiagnostics({ mode: 'ui', outputPath: output });
    diagnostics.checkpoint('chat_window_created', { webContentsId: 3 });
    const pending = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(pending.ok, false);
    assert.equal(pending.incomplete, true);
    assert.equal(pending.diagnostics.phase, 'chat_window_created');
    assert.equal(pending.diagnostics.events.at(-1).detail.webContentsId, 3);

    const finished = diagnostics.finish({ ok: true, value: 7 });
    assert.equal(finished.ok, true);
    assert.equal(finished.value, 7);
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).diagnostics.phase, 'chat_window_created');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diagnostics records Renderer and child-process failures with bounded history', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-smoke-events-'));
  try {
    const output = path.join(root, 'result.json');
    const diagnostics = new SmokeDiagnostics({ mode: 'chat_close', outputPath: output });
    const appHandlers = new Map();
    diagnostics.attachApp({ on: (name, handler) => appHandlers.set(name, handler) });
    appHandlers.get('child-process-gone')({}, { type: 'GPU', reason: 'crashed', exitCode: -1 });

    const contentHandlers = new Map();
    diagnostics.attachWebContents({
      on(name, handler) { contentHandlers.set(name, handler); }
    }, 'chat');
    contentHandlers.get('render-process-gone')({}, { reason: 'launch-failed', exitCode: -2 });
    contentHandlers.get('did-fail-load')({}, -2, 'ERR_FAILED', 'file:///chat.html', true);
    const result = diagnostics.fail(new Error('window failed'));
    assert.equal(result.ok, false);
    assert.match(result.error, /window failed/);
    assert.ok(result.diagnostics.events.some((event) => event.type === 'child_process_gone'));
    assert.ok(result.diagnostics.events.some((event) => event.type === 'render_process_gone'));
    assert.ok(result.diagnostics.events.some((event) => event.type === 'did_fail_load'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('main disables hardware acceleration only for Renderer smoke modes before ready', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const disableIndex = main.indexOf('app.disableHardwareAcceleration()');
  const readyIndex = main.indexOf('app.whenReady().then');
  assert.ok(disableIndex > 0 && disableIndex < readyIndex);
  assert.match(main, /if \(rendererSmoke\) \{[\s\S]*app\.disableHardwareAcceleration\(\)/);
  assert.match(main, /if \(rendererSmoke\) \{[\s\S]*appendSwitch\('in-process-gpu'\)[\s\S]*appendSwitch\('no-sandbox'\)/);
  assert.doesNotMatch(main, /if \(!rendererSmoke\)[\s\S]*disableHardwareAcceleration/);
});
