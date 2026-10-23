const path = require('node:path');

// A presentation-only window: no preload, IPC, settings or user-data access.
function showStartupAnimation({ BrowserWindow, rootDirectory }) {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      width: 960, height: 540, useContentSize: true,
      frame: false, resizable: false, maximizable: false,
      show: false, backgroundColor: '#f7f5fa',
      title: 'Mai Sakurajima',
      icon: path.join(rootDirectory, 'assets', 'mai-icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    const timer = setTimeout(() => { if (!window.isDestroyed()) window.close(); }, 8000);
    window.once('closed', () => { clearTimeout(timer); resolve(); });
    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) window.show();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.loadFile(path.join(rootDirectory, 'renderer', 'startup.html')).catch(() => {
      if (!window.isDestroyed()) window.close();
    });
  });
}

module.exports = { showStartupAnimation };
