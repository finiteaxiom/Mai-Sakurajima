'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CUSTOM_WALLPAPER_ID,
  DEFAULT_WALLPAPER_ID,
  normalizeWallpaperId,
  publicWallpaperCatalog,
  publicWallpaperState
} = require('../wallpaper-catalog');

test('public build has no bundled wallpapers and exposes only an existing local copy', () => {
  assert.deepEqual(publicWallpaperCatalog(), []);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-wallpaper-local-'));
  try {
    const local = path.join(root, 'custom-wallpaper.jpg');
    fs.writeFileSync(local, 'image');
    const catalog = publicWallpaperCatalog(local);
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].id, CUSTOM_WALLPAPER_ID);
    assert.match(catalog[0].path, /^file:\/\//);
    assert.equal(catalog[0].path, catalog[0].thumbnail);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid, corrupt, or missing selections safely fall back', () => {
  assert.equal(normalizeWallpaperId('not-a-wallpaper'), DEFAULT_WALLPAPER_ID);
  assert.equal(publicWallpaperState(null).selected, DEFAULT_WALLPAPER_ID);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-wallpaper-fallback-'));
  try {
    const local = path.join(root, 'custom-wallpaper.jpg');
    fs.writeFileSync(local, 'image');
    assert.equal(normalizeWallpaperId(CUSTOM_WALLPAPER_ID, local), CUSTOM_WALLPAPER_ID);
    assert.equal(normalizeWallpaperId(CUSTOM_WALLPAPER_ID, path.join(root, 'missing.jpg')), DEFAULT_WALLPAPER_ID);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
