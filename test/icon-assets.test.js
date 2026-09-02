const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const assetsDirectory = path.join(__dirname, '..', 'assets');

test('rounded app icon PNG keeps an alpha channel for transparent corners', () => {
  const png = fs.readFileSync(path.join(assetsDirectory, 'mai-icon.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6, 'PNG must use RGBA color type');
});

test('Windows ICO contains standard small and high-DPI icon sizes', () => {
  const ico = fs.readFileSync(path.join(assetsDirectory, 'mai-icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + (index * 16);
    sizes.push(ico[offset] || 256);
    assert.equal(ico[offset + 1] || 256, ico[offset] || 256);
  }
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 20, 24, 32, 40, 48, 64, 128, 256]);
});
