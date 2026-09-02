function createPetVisibility({ getMainWindow, getSettings, saveSettings, refreshTrayMenu }) {
  let fadeTimer = null;
  let revealTimer = null;
  let hovered = false;
  let lastSyndromeGreetingAt = 0;

  function applyInvisibleOpacity() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const shouldFade = getSettings().invisibleMode === true && !hovered;
    try {
      mainWindow.setOpacity(shouldFade ? 0.16 : 1);
    } catch (error) {
      console.error('Could not update pet opacity:', error);
    }
  }

  function setInvisibleMode(enabled) {
    const settings = getSettings();
    settings.invisibleMode = Boolean(enabled);
    saveSettings();
    clearTimeout(fadeTimer);
    clearTimeout(revealTimer);
    applyInvisibleOpacity();
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pet:invisible-mode', settings.invisibleMode);
    }
    refreshTrayMenu();
    return settings.invisibleMode;
  }

  function temporarilyRevealPet(duration = 7000) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    clearTimeout(fadeTimer);
    clearTimeout(revealTimer);
    try {
      mainWindow.setOpacity(1);
    } catch {
      return;
    }
    revealTimer = setTimeout(applyInvisibleOpacity, duration);
  }

  function handlePetHover(value) {
    hovered = Boolean(value);
    clearTimeout(fadeTimer);
    if (!hovered) clearTimeout(revealTimer);
    if (!getSettings().invisibleMode) {
      applyInvisibleOpacity();
      return;
    }
    if (hovered) {
      temporarilyRevealPet(12000);
      if (Date.now() - lastSyndromeGreetingAt > 10000) {
        lastSyndromeGreetingAt = Date.now();
        getMainWindow()?.webContents.send('pet:syndrome-visible', {
          content: '太好了，你还能看到我。',
          action: 'love',
          emotion: 'shy'
        });
      }
    } else {
      fadeTimer = setTimeout(applyInvisibleOpacity, 650);
    }
  }

  function dispose() {
    clearTimeout(fadeTimer);
    clearTimeout(revealTimer);
    fadeTimer = null;
    revealTimer = null;
  }

  return { applyInvisibleOpacity, setInvisibleMode, temporarilyRevealPet, handlePetHover, dispose };
}

module.exports = { createPetVisibility };
