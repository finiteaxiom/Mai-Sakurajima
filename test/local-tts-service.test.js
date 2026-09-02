const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  REQUIRED_MODEL_FILES,
  coreInstallationReady,
  externalVoiceEngineDirectory,
  installationPaths,
  installationReady,
  parseEngineLine,
  publicInstallError
} = require('../local-tts-service');

test('packaged app resolves local voice files from app.asar.unpacked', () => {
  const source = path.join('C:', 'app', 'resources', 'app.asar');
  const resolved = externalVoiceEngineDirectory(source);
  assert.match(resolved.replace(/\\/g, '/'), /app\.asar\.unpacked\/voice-engine$/);
});

test('enhanced local voice distinguishes the reusable base model from the emotion upgrade', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-local-voice-'));
  try {
    const paths = installationPaths(root);
    fs.mkdirSync(path.dirname(paths.python), { recursive: true });
    fs.mkdirSync(paths.model, { recursive: true });
    fs.writeFileSync(paths.python, 'python');
    fs.writeFileSync(paths.marker, '{}');
    assert.equal(installationReady(root), false);
    for (const file of REQUIRED_MODEL_FILES) {
      fs.writeFileSync(path.join(paths.model, file), file);
    }
    assert.equal(coreInstallationReady(root), true);
    assert.equal(installationReady(root), false);
    fs.mkdirSync(paths.instructModel, { recursive: true });
    for (const file of REQUIRED_MODEL_FILES) {
      fs.writeFileSync(path.join(paths.instructModel, file), file);
    }
    fs.mkdirSync(paths.senseVoiceModel, { recursive: true });
    fs.writeFileSync(path.join(paths.senseVoiceModel, 'config.yaml'), 'model: sensevoice');
    fs.writeFileSync(path.join(paths.senseVoiceModel, 'model.pt'), 'model');
    assert.equal(installationReady(root), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('engine protocol ignores log noise and parses JSON messages', () => {
  assert.equal(parseEngineLine('loading model...'), null);
  assert.deepEqual(parseEngineLine('{"type":"ready","cuda":true}'), {
    type: 'ready',
    cuda: true
  });
});

test('installer errors are converted to actionable Chinese messages', () => {
  assert.match(publicInstallError(new Error('ENOSPC')), /16 GB/);
  assert.match(publicInstallError(new Error('DISK_SPACE_LOW')), /16 GB/);
  assert.match(publicInstallError(new Error('network connection failed')), /检查网络/);
});
