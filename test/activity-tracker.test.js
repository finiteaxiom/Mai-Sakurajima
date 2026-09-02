const test = require('node:test');
const assert = require('node:assert/strict');
const { FOREGROUND_SCRIPT, parseForegroundResult } = require('../activity-tracker');

test('foreground parser tolerates PowerShell noise', () => {
  const parsed = parseForegroundResult('warning\r\n{"processName":"Code","pid":123}\r\n');
  assert.deepEqual(parsed, { processName: 'Code', pid: 123 });
});

test('foreground script collects process identity but not window title', () => {
  assert.match(FOREGROUND_SCRIPT, /ProcessName/);
  assert.doesNotMatch(FOREGROUND_SCRIPT, /MainWindowTitle/);
});
