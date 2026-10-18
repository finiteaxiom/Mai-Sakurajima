const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const packageJson = require('../package.json');
const { initializeStorage, MEMORY_FILE, SETTINGS_FILE } = require('../storage');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('v7.1 keeps the stable app identity and packages companion plus optional action runtime', () => {
  assert.equal(packageJson.version, '7.1.0');
  assert.equal(packageJson.build.appId, 'com.mai.sakurajima.desktop');
  assert.equal(packageJson.build.productName, 'Mai Sakurajima');
  for (const runtimeModule of [
    'window-manager.js',
    'voice-ipc.js',
    'assistant-ipc.js',
    'timer-ipc.js',
    'pet-visibility.js',
    'automatic-backup-service.js',
    'json-persistence.js',
    'file-set-transaction.js',
    'api-key-storage.js',
    'chat-turn-state.js',
    'companion-state.js',
    'conversation-state.js',
    'chat-service.js',
    'chat-request-service.js',
    'chat-history-boundary.js',
    'model-gateway.js',
    'model-provider-registry.js',
    'local-model-provider.js',
    'deepseek-provider.js',
    'deepseek-incremental-smoke.js',
    'smoke-diagnostics.js',
    'wallpaper-catalog.js',
    'avatar-catalog.js'
  ]) {
    assert.ok(packageJson.build.files.includes(runtimeModule), `${runtimeModule} must be packaged`);
  }
  assert.equal(packageJson.build.files.includes('assets/wallpapers/**/*'), false);
  assert.equal(packageJson.build.files.includes('assets/avatars/**/*'), false);
  assert.ok(packageJson.build.files.includes('action-ipc.js'));
  assert.ok(packageJson.build.files.includes('agent/**/*'));
  assert.equal(packageJson.scripts['dist:portable'], undefined);
  assert.deepEqual(packageJson.build.win.target.map((target) => target.target), ['nsis']);
});

test('initializing v7 never overwrites an existing memory database or settings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-upgrade-test-'));
  try {
    const stableDirectory = path.join(root, 'Mai Sakurajima');
    fs.mkdirSync(stableDirectory, { recursive: true });
    const memoryText = JSON.stringify({ version: 6, facts: [{ id: 'keep-me', text: '必须保留的记忆' }] });
    const settingsText = JSON.stringify({ deepseek: { personality: 'open' } });
    fs.writeFileSync(path.join(stableDirectory, MEMORY_FILE), memoryText, 'utf8');
    fs.writeFileSync(path.join(stableDirectory, SETTINGS_FILE), settingsText, 'utf8');
    const app = {
      getPath(name) {
        if (name === 'appData') return root;
        if (name === 'userData') return path.join(root, 'Mai Sakurajima');
        throw new Error(`unexpected path: ${name}`);
      },
      setPath(name, value) {
        assert.equal(name, 'userData');
        assert.equal(value, stableDirectory);
      }
    };
    const storage = initializeStorage(app, []);
    assert.equal(storage.userDataDirectory, stableDirectory);
    assert.equal(fs.readFileSync(storage.memoryPath, 'utf8'), memoryText);
    assert.equal(fs.readFileSync(storage.settingsPath, 'utf8'), settingsText);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('v7 preserves old task archives while loading Action Runtime as an optional subsystem', () => {
  assert.match(mainSource, /const actionRuntimeModules = \(\(\) =>/);
  assert.match(mainSource, /Action Runtime is unavailable; Companion Runtime will continue normally/);
  assert.match(mainSource, /enabled: false/);
  assert.match(mainSource, /function normalizeLegacyAgentArchive\(stored\)/);
  assert.match(mainSource, /legacyAgentArchive/);
  const chatServiceSource = fs.readFileSync(path.join(__dirname, '..', 'chat-service.js'), 'utf8');
  const memorySource = fs.readFileSync(path.join(__dirname, '..', 'memory-engine.js'), 'utf8');
  assert.doesNotMatch(chatServiceSource, /action-runtime|agent\//i);
  assert.doesNotMatch(memorySource, /action-runtime|agent\//i);
});
