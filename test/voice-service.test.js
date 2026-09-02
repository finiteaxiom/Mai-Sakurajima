const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  externalScriptsDirectory,
  normalizeCulture,
  parseJsonOutput,
  publicVoiceError
} = require('../voice-service');

test('voice culture accepts normal locale identifiers and rejects command input', () => {
  assert.equal(normalizeCulture('zh-CN'), 'zh-CN');
  assert.equal(normalizeCulture('en-US'), 'en-US');
  assert.equal(normalizeCulture('zh-CN; Remove-Item'), 'zh-CN');
});

test('PowerShell JSON parser tolerates host output and BOM', () => {
  const parsed = parseJsonOutput('\uFEFFhost message\r\n{"ok":true,"text":"你好"}\r\n');
  assert.deepEqual(parsed, { ok: true, text: '你好' });
});

test('voice errors are converted to actionable Chinese messages', () => {
  assert.match(publicVoiceError({ code: 'microphone_unavailable' }), /麦克风/);
  assert.match(publicVoiceError({ code: 'recognizer_unavailable' }), /中文语音识别/);
});

test('packaged app resolves PowerShell scripts from app.asar.unpacked', () => {
  const source = path.join('C:', 'app', 'resources', 'app.asar');
  const resolved = externalScriptsDirectory(source);
  assert.match(resolved.replace(/\\/g, '/'), /app\.asar\.unpacked\/voice$/);
});

test('recognition script keeps the UTF-8 BOM required by Windows PowerShell 5.1', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'voice', 'recognize.ps1'));
  assert.deepEqual([...script.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});
