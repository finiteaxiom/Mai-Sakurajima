'use strict';

const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DEFAULT_WALLPAPER_ID = 'none';
const CUSTOM_WALLPAPER_ID = 'custom';

function publicWallpaperCatalog(customWallpaperPath = '') {
  const target = String(customWallpaperPath || '').trim();
  if (!target || !fs.existsSync(target)) return [];
  const url = pathToFileURL(target).href;
  return [{
    id: CUSTOM_WALLPAPER_ID,
    name: '本地壁纸',
    path: url,
    thumbnail: url,
    available: true
  }];
}

function normalizeWallpaperId(value, customWallpaperPath = '') {
  return value === CUSTOM_WALLPAPER_ID && publicWallpaperCatalog(customWallpaperPath).length
    ? CUSTOM_WALLPAPER_ID
    : DEFAULT_WALLPAPER_ID;
}

function publicWallpaperState(value, customWallpaperPath = '') {
  return {
    selected: normalizeWallpaperId(value, customWallpaperPath),
    defaultId: DEFAULT_WALLPAPER_ID,
    wallpapers: publicWallpaperCatalog(customWallpaperPath)
  };
}

module.exports = {
  CUSTOM_WALLPAPER_ID,
  DEFAULT_WALLPAPER_ID,
  normalizeWallpaperId,
  publicWallpaperCatalog,
  publicWallpaperState
};
