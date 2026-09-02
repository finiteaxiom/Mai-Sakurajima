const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.setPath('userData', path.join(__dirname, '.smoke-shared-life-user-data'));

app.whenReady().then(async () => {
  try {
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
  window.webContents.on('console-message', (_event, details) => {
    console.log(`[renderer:${details.level}] ${details.message}`);
  });
  await Promise.race([
    window.loadFile(path.join(__dirname, '..', 'renderer', 'chat.html')),
    new Promise((_, reject) => setTimeout(() => reject(new Error('chat UI load timed out')), 8000))
  ]);
  await new Promise((resolve) => setTimeout(resolve, 900));
  const state = await window.webContents.executeJavaScript(`(() => {
    document.getElementById('shared-life-button').click();
    const overlay = document.getElementById('shared-life-overlay');
    return {
      api: typeof window.maiPet,
      overlayVisible: !overlay.classList.contains('overlay--hidden'),
      activity: document.getElementById('world-activity').textContent,
      timelineCount: document.querySelectorAll('#timeline-list .hub-item').length,
      peopleCount: document.querySelectorAll('#people-list .hub-item').length,
      digestCount: document.querySelectorAll('#digests-list .hub-item').length,
      projectCount: document.querySelectorAll('#projects-list .hub-item').length,
      habitCount: document.querySelectorAll('#habits-list .hub-item').length,
      reviewCount: document.querySelectorAll('#review-list .hub-item').length,
      tabCount: document.querySelectorAll('.shared-life-tab').length,
      timelineVisible: !document.getElementById('timeline-panel').classList.contains('shared-life-panel--hidden'),
      episodeCount: document.querySelectorAll('.episode-item').length,
      topicCount: document.querySelectorAll('.topic-item').length,
      memoryCorrectionButtons: Array.from(document.querySelectorAll('.memory-correction-actions button')).map((item) => item.textContent)
    };
  })()`, true);
  console.log(JSON.stringify(state));
  if (
    state.api !== 'object'
    || !state.overlayVisible
    || !state.activity
    || state.timelineCount !== 1
    || state.peopleCount !== 1
    || state.digestCount !== 1
    || state.projectCount !== 1
    || state.habitCount !== 1
    || state.reviewCount !== 1
    || state.tabCount !== 10
    || !state.timelineVisible
    || state.episodeCount !== 1
    || state.topicCount !== 1
    || state.memoryCorrectionButtons.length !== 4
  ) {
    throw new Error(`shared-life smoke failed: ${JSON.stringify(state)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const paintedState = await window.webContents.executeJavaScript(`(() => ({
    overlayClass: document.getElementById('shared-life-overlay').className,
    overlayDisplay: getComputedStyle(document.getElementById('shared-life-overlay')).display,
    headerWidth: document.querySelector('.chat-header').scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }))()`, true);
  console.log(JSON.stringify(paintedState));
  if (paintedState.overlayDisplay === 'none' || paintedState.headerWidth > paintedState.viewportWidth) {
    throw new Error(`shared-life painted-state failed: ${JSON.stringify(paintedState)}`);
  }
  const actionState = await window.webContents.executeJavaScript(`(async () => {
    document.getElementById('agent-mode-button').click();
    document.getElementById('agent-enable-button').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const input = document.getElementById('message-input');
    input.value = '帮我分析这个任务';
    document.getElementById('composer').requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      active: document.getElementById('agent-mode-button').getAttribute('aria-selected'),
      panelVisible: !document.getElementById('agent-runtime-panel').hidden,
      messageCount: document.querySelectorAll('#messages .message').length,
      resultText: document.getElementById('messages').textContent
    };
  })()`, true);
  console.log(JSON.stringify(actionState));
  if (
    actionState.active !== 'true'
    || !actionState.panelVisible
    || actionState.messageCount < 3
    || !actionState.resultText.includes('我帮你整理好了')
  ) {
    throw new Error(`action mode smoke failed: ${JSON.stringify(actionState)}`);
  }
  const screenshotPath = path.join(os.tmpdir(), 'mai-v3-shared-life-smoke.png');
  fs.writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG());
  console.log(screenshotPath);
  window.destroy();
  app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
