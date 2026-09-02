const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 460,
    height: 760,
    show: false,
    backgroundColor: '#17121b',
    webPreferences: {
      preload: path.join(__dirname, 'mock-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'renderer', 'chat.html'));
  await new Promise((resolve) => setTimeout(resolve, 900));
  const state = await window.webContents.executeJavaScript(`(async () => {
    document.getElementById('settings-button').click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const panel = document.querySelector('.voice-settings-panel');
    panel.scrollIntoView({ block: 'center' });
    return {
      settingsOpen: !document.getElementById('settings-overlay').classList.contains('overlay--hidden'),
      engine: document.getElementById('voice-engine').value,
      localTitle: document.getElementById('local-voice-title').textContent,
      installButton: document.getElementById('install-local-voice').textContent
    };
  })()`, true);
  console.log(JSON.stringify(state));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const output = path.join(__dirname, 'local-voice-settings-preview.png');
  window.webContents.debugger.attach('1.3');
  const screenshot = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  window.webContents.debugger.detach();
  fs.writeFileSync(output, Buffer.from(screenshot.data, 'base64'));
  console.log(output);
  window.destroy();
  app.quit();
});
