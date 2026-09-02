const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const smokeUserData = path.join(__dirname, '.moments-smoke-user-data');
fs.mkdirSync(smokeUserData, { recursive: true });
app.setPath('userData', smokeUserData);
app.setPath('sessionData', smokeUserData);
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 460,
    height: 680,
    show: true,
    backgroundColor: '#17121b',
    webPreferences: {
      preload: path.join(__dirname, 'mock-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.webContents.on('console-message', (_event, details) => {
    console.log(`[renderer:${details.level}] ${details.message}`);
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`preload-error ${preloadPath}:`, error);
  });
  await window.loadFile(path.join(__dirname, '..', 'renderer', 'chat.html'));
  await new Promise((resolve) => setTimeout(resolve, 800));
  const state = await window.webContents.executeJavaScript(`(async () => {
    const button = document.getElementById('moments-button');
    button.click();
    for (let attempt = 0; attempt < 30 && !document.querySelector('.moment-card'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const overlay = document.getElementById('moments-overlay');
    overlay.style.animation = 'none';
    overlay.style.position = 'absolute';
    overlay.style.backdropFilter = 'none';
    return {
      readyState: document.readyState,
      api: typeof window.maiPet,
      overlay: document.getElementById('moments-overlay').className,
      cards: document.querySelectorAll('.moment-card').length,
      assistantReply: document.querySelector('.moment-comment--assistant span')?.textContent || '',
      rawJsonVisible: document.getElementById('moments-list').textContent.includes('"action"')
    };
  })()`, true);
  if (state.assistantReply !== '当然买了，不过要看你什么时候来陪我一起吃。你今晚有空吗？' || state.rawJsonVisible) {
    throw new Error(`Moment reply JSON leaked into the UI: ${JSON.stringify(state)}`);
  }
  console.log(JSON.stringify(state));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const paintedState = await window.webContents.executeJavaScript(`(() => {
    const overlay = document.getElementById('moments-overlay');
    const card = overlay.querySelector('.moments-card');
    return {
      overlayClass: overlay.className,
      display: getComputedStyle(overlay).display,
      visibility: getComputedStyle(overlay).visibility,
      opacity: getComputedStyle(overlay).opacity,
      zIndex: getComputedStyle(overlay).zIndex,
      rect: overlay.getBoundingClientRect().toJSON(),
      cardRect: card.getBoundingClientRect().toJSON()
    };
  })()`, true);
  console.log(JSON.stringify(paintedState));
  const output = path.join(__dirname, 'moments-preview.png');
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
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
