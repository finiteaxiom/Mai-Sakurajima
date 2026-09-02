const test = require('node:test');
const assert = require('node:assert/strict');
const { registerVoiceIpc } = require('../voice-ipc');

function createHarness() {
  const handlers = new Map();
  const calls = [];
  registerVoiceIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    voiceService: {
      getCapabilities: async () => ({ recognition: true }),
      recognize: (input) => { calls.push(['recognize', input]); return { text: '听见了' }; },
      stopRecognition: () => { calls.push(['stop']); return true; }
    },
    localTtsService: {
      status: () => ({ installed: true }),
      install: () => ({ started: true }),
      cancelInstall: () => true,
      synthesize: (input) => { calls.push(['synthesize', input]); return { audioBase64: 'abc' }; },
      analyzeAudio: (input) => { calls.push(['analyze', input]); return { durationSeconds: 1 }; }
    },
    getVoiceSettings: () => ({ rate: 1.1, culture: 'zh-CN' })
  });
  return { handlers, calls };
}

test('voice IPC registers the existing eight public channels', () => {
  const { handlers } = createHarness();
  assert.deepEqual([...handlers.keys()], [
    'voice:get-capabilities',
    'voice:get-local-status',
    'voice:install-local',
    'voice:cancel-local-install',
    'voice:synthesize',
    'voice:analyze-audio',
    'voice:listen',
    'voice:stop-listening'
  ]);
});

test('voice IPC preserves setting fallbacks and response shapes', async () => {
  const { handlers, calls } = createHarness();
  assert.deepEqual(await handlers.get('voice:get-capabilities')(), {
    recognition: true,
    localTts: { installed: true }
  });
  assert.deepEqual(await handlers.get('voice:cancel-local-install')(), { canceled: true });
  assert.deepEqual(await handlers.get('voice:synthesize')({}, { text: '你好', emotion: 'calm' }), {
    audioBase64: 'abc'
  });
  assert.deepEqual(await handlers.get('voice:listen')({}, { timeoutSeconds: 12 }), { text: '听见了' });
  assert.deepEqual(await handlers.get('voice:stop-listening')(), { stopped: true });
  assert.deepEqual(calls, [
    ['synthesize', { text: '你好', rate: 1.1, emotion: 'calm', instruction: undefined }],
    ['recognize', { culture: 'zh-CN', timeoutSeconds: 12 }],
    ['stop']
  ]);
});
