const test = require('node:test');
const assert = require('node:assert/strict');
const { createPetVisibility } = require('../pet-visibility');

function createHarness(invisibleMode = true) {
  const settings = { invisibleMode };
  const calls = [];
  const mainWindow = {
    isDestroyed: () => false,
    setOpacity: (value) => calls.push(['opacity', value]),
    webContents: { send: (channel, payload) => calls.push(['send', channel, payload]) }
  };
  const visibility = createPetVisibility({
    getMainWindow: () => mainWindow,
    getSettings: () => settings,
    saveSettings: () => calls.push(['save']),
    refreshTrayMenu: () => calls.push(['menu'])
  });
  return { settings, calls, visibility };
}

test('pet visibility preserves opacity and invisible-mode IPC side effects', () => {
  const { settings, calls, visibility } = createHarness(true);
  visibility.applyInvisibleOpacity();
  assert.equal(visibility.setInvisibleMode(false), false);
  assert.equal(settings.invisibleMode, false);
  assert.deepEqual(calls, [
    ['opacity', 0.16],
    ['save'],
    ['opacity', 1],
    ['send', 'pet:invisible-mode', false],
    ['menu']
  ]);
  visibility.dispose();
});

test('pet visibility preserves the syndrome greeting when the user hovers', () => {
  const { calls, visibility } = createHarness(true);
  visibility.handlePetHover(true);
  assert.deepEqual(calls, [
    ['opacity', 1],
    ['send', 'pet:syndrome-visible', {
      content: '太好了，你还能看到我。',
      action: 'love',
      emotion: 'shy'
    }]
  ]);
  visibility.dispose();
});
