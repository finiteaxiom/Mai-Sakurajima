'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { registerPetWardrobeIpc } = require('../pet-wardrobe');
const catalog = require('../renderer/pet-catalog');
const fs = require('node:fs');

function harness({ failSave = false, missingImage = false } = {}) {
  const handlers = new Map(), messages = [];
  let settings = { petWardrobe: { outfitId: 'school' }, unrelated: { untouched: true } }, saves = 0;
  const frame = { url: pathToFileURL(path.resolve(__dirname, '../renderer/wardrobe.html')).href };
  const sender = { mainFrame: frame, send: (...args) => messages.push(args) };
  const event = { sender, senderFrame: frame };
  registerPetWardrobeIpc({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, rootDirectory: path.resolve(__dirname, '..'),
    nativeImage: { createFromPath: () => ({ isEmpty: () => missingImage }) },
    getSettings: () => settings, saveSettings: () => { if (failSave) throw new Error('disk full'); saves++; },
    openWardrobe: () => {}, getWindows: () => [{ isDestroyed: () => false, webContents: sender }]
  });
  return { call: (name, id, caller = event) => handlers.get(`wardrobe:${name}`)(caller, id), event, messages, settings: () => settings, saves: () => saves };
}
test('wardrobe only permits known outfit IDs and does not accept paths or objects', () => {
  const h = harness();
  for (const id of ['../secrets', 'file:///tmp/image.png', {}, null, '__proto__']) assert.throws(() => h.call('set', id));
  assert.equal(h.saves(), 0); assert.equal(h.messages.length, 0);
});
test('wardrobe rejects subframes and other webContents', () => {
  const h = harness();
  assert.throws(() => h.call('set', 'original', { ...h.event, senderFrame: { ...h.event.senderFrame } }));
  assert.throws(() => h.call('get', null, { ...h.event, sender: { mainFrame: h.event.senderFrame } }));
});
test('wardrobe saves before broadcasting and preserves unrelated settings', () => {
  const h = harness();
  assert.deepEqual(h.call('set', 'original'), { outfitId: 'original' });
  assert.equal(h.saves(), 1);
  assert.deepEqual(h.settings().unrelated, { untouched: true });
  assert.deepEqual(h.messages, [['wardrobe:changed', { outfitId: 'original' }]]);
});
test('missing assets and failed persistence leave current outfit unchanged', () => {
  for (const options of [{ missingImage: true }, { failSave: true }]) {
    const h = harness(options);
    assert.throws(() => h.call('set', 'original'));
    assert.equal(h.call('get').outfitId, 'school');
    assert.equal(h.messages.length, 0);
  }
});
test('all new outfit actions refer to valid atlas coordinates and preserve outfit on legacy states', () => {
  for (const id of ['school', 'home', 'winter']) {
    for (const name of ['idle', 'wave', 'love', 'sleep', 'lifted', 'land', 'runLeft', 'runRight', 'study', 'work', 'snack', 'outfitPrimary', 'outfitSecondary']) {
      const config = catalog.action(id, name);
      assert.ok(config.row >= 0 && config.row < 8);
      assert.ok([...config.frames, ...config.loop, ...config.exit].every(frame => frame >= 0 && frame < 4));
    }
  }
  assert.equal(catalog.normalize('retired'), 'original');
});

test('packaged wardrobe assets have matching image dimensions and in-bounds frame coordinates', () => {
  const config = require('../package.json');
  assert.ok(config.build.files.includes('pet-wardrobe.js'));
  assert.ok(config.build.files.includes('renderer/**/*'));
  for (const outfit of catalog.outfits.filter(outfit => outfit.id !== 'original')) {
    const file = path.resolve(__dirname, '../renderer', outfit.src);
    const png = fs.readFileSync(file), metadata = JSON.parse(fs.readFileSync(file.replace(/\.png$/, '.json')));
    assert.equal(metadata.imageWidth, png.readUInt32BE(16));
    assert.equal(metadata.imageHeight, png.readUInt32BE(20));
    assert.equal(metadata.frames.length, 32);
    assert.ok(metadata.standingHeight > 0);
    const walkFile = file.replace(/\.png$/, '-walk.png');
    const walkPng = fs.readFileSync(walkFile);
    const walk = JSON.parse(fs.readFileSync(walkFile.replace(/\.png$/, '.json')));
    assert.equal(walk.frames.length, 4);
    assert.equal(walk.imageWidth, walkPng.readUInt32BE(16));
    assert.equal(walk.imageHeight, walkPng.readUInt32BE(20));
    for (const frame of walk.frames) {
      assert.ok(frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0);
      assert.ok(frame.x + frame.width <= walk.imageWidth && frame.y + frame.height <= walk.imageHeight);
    }
    for (const frame of metadata.frames) {
      assert.ok(frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0);
      assert.ok(frame.x + frame.width <= metadata.imageWidth && frame.y + frame.height <= metadata.imageHeight);
      assert.ok(frame.anchorX >= frame.x && frame.anchorX <= frame.x + frame.width);
    }
  }
});
