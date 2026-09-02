const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

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
  await window.loadFile(path.join(__dirname, '..', 'renderer', 'chat.html'));
  await new Promise((resolve) => setTimeout(resolve, 900));
  const state = await window.webContents.executeJavaScript(`(() => {
    const overlay = document.getElementById('voice-call-overlay');
    overlay.classList.remove('overlay--hidden');
    overlay.style.animation = 'none';
    document.getElementById('voice-call-transcript').innerHTML = [
      '<p class="voice-call-line voice-call-line--user"><strong>你：</strong><span>麻衣，今天过得怎么样？</span></p>',
      '<p class="voice-call-line voice-call-line--assistant"><strong>麻衣：</strong><span>刚结束工作，正在回去的路上。你呢，今天有没有想我？</span></p>'
    ].join('');
    document.getElementById('voice-call-status').textContent = '正在听你说话…';
    document.getElementById('voice-call-avatar').classList.add('voice-call-avatar--active');
    return {
      overlay: overlay.className,
      display: getComputedStyle(overlay).display,
      transcriptLines: document.querySelectorAll('.voice-call-line').length,
      speechVoices: window.speechSynthesis ? window.speechSynthesis.getVoices().length : -1
    };
  })()`, true);
  console.log(JSON.stringify(state));
  await new Promise((resolve) => setTimeout(resolve, 350));
  const output = path.join(__dirname, 'voice-preview.png');
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
