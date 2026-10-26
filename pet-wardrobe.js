'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');
const catalog = require('./renderer/pet-catalog');

function registerPetWardrobeIpc({ ipcMain, rootDirectory, nativeImage, getSettings, saveSettings, openWardrobe, getWindows, refreshMenu = () => {} }) {
  const allowed = new Set(['index.html', 'chat.html', 'wardrobe.html'].map(name => path.join(rootDirectory, 'renderer', name)));
  const trusted = event => {
    try {
      return event.senderFrame === event.sender.mainFrame
        && getWindows().some(win => win && !win.isDestroyed() && win.webContents === event.sender)
        && allowed.has(fileURLToPath(event.senderFrame.url));
    } catch { return false; }
  };
  const snapshot = () => ({ outfitId: catalog.normalize(getSettings().petWardrobe?.outfitId) });
  const handle = (name, fn) => ipcMain.handle(`wardrobe:${name}`, (event, ...args) => {
    if (!trusted(event)) throw new Error('衣橱入口不可用');
    return fn(...args);
  });
  handle('open', () => { openWardrobe(); return { ok: true }; });
  handle('get', snapshot);
  handle('set', id => {
    const outfit = catalog.get(id);
    if (!outfit) throw new Error('请选择有效的服装');
    const file = path.resolve(rootDirectory, 'renderer', outfit.src);
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) throw new Error('服装素材不可用，已保留当前装扮');
    if (id !== 'original') {
      const metadata = JSON.parse(fs.readFileSync(file.replace(/\.png$/, '.json'), 'utf8'));
      const size = image.getSize();
      if (metadata.imageWidth !== size.width || metadata.imageHeight !== size.height || metadata.frames?.length !== 32) {
        throw new Error('服装坐标不可用，已保留当前装扮');
      }
      const walkFile = file.replace(/\.png$/, '-walk.png');
      const walkImage = nativeImage.createFromPath(walkFile);
      const walkMetadata = JSON.parse(fs.readFileSync(walkFile.replace(/\.png$/, '.json'), 'utf8'));
      const walkSize = walkImage.getSize();
      if (walkImage.isEmpty() || walkMetadata.frames?.length !== 4 || walkMetadata.imageWidth !== walkSize.width || walkMetadata.imageHeight !== walkSize.height) {
        throw new Error('行走素材不可用，已保留当前装扮');
      }
    }
    const previous = getSettings().petWardrobe;
    getSettings().petWardrobe = { outfitId: id };
    try { saveSettings(); } catch (error) { getSettings().petWardrobe = previous; throw error; }
    const state = snapshot();
    for (const win of getWindows()) {
      if (win && !win.isDestroyed()) win.webContents.send('wardrobe:changed', state);
    }
    refreshMenu();
    return state;
  });
}
module.exports = { registerPetWardrobeIpc };
