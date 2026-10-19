function createWindowManager({
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  path,
  rootDirectory,
  windowWidth,
  windowHeight,
  getMainWindow,
  setMainWindow,
  getChatWindow,
  setChatWindow,
  getTimerWindow,
  setTimerWindow,
  getAssistantWindow,
  setAssistantWindow,
  getTray,
  setTray,
  getSettings,
  isQuitting,
  positionIsVisible,
  defaultPosition,
  applyInvisibleOpacity,
  saveSettings,
  onChatClosed,
  publicReminderState,
  reminderMenuLabel,
  cancelReminder,
  applyLoginSetting,
  scheduleProactiveGreeting,
  resetRelationshipWaiting,
  saveMemory,
  scheduleGirlfriendFollowUp,
  setInvisibleMode,
  requestQuit
}) {
  const assetPath = (...parts) => path.join(rootDirectory, ...parts);
  const createWebPreferences = () => ({
    preload: assetPath('preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  });

  function createWindow() {
    const settings = getSettings();
    const storedPosition = positionIsVisible(settings.position) ? settings.position : defaultPosition();
    const mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: storedPosition.x,
      y: storedPosition.y,
      transparent: true,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: settings.alwaysOnTop,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      title: 'Mai Sakurajima',
      icon: assetPath('assets', 'mai-icon.png'),
      webPreferences: createWebPreferences()
    });
    setMainWindow(mainWindow);

    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(assetPath('renderer', 'index.html'));
    mainWindow.once('ready-to-show', () => {
      mainWindow.showInactive();
      applyInvisibleOpacity();
      mainWindow.webContents.send('pet:action', process.argv.includes('--startup') ? 'wake' : 'hello');
    });
    mainWindow.on('close', (event) => {
      if (!isQuitting()) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
    mainWindow.on('moved', persistPosition);
  }

  function openChat(showSettings = false, showLife = false) {
    let chatWindow = getChatWindow();
    if (chatWindow && !chatWindow.isDestroyed()) {
      if (chatWindow.isMinimized()) chatWindow.restore();
      chatWindow.show();
      chatWindow.focus();
      if (showSettings) chatWindow.webContents.send('chat:show-settings');
      if (showLife) chatWindow.webContents.send('chat:show-life');
      return;
    }
    chatWindow = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 900,
      minHeight: 640,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      title: 'Mai Sakurajima · 陪伴与对话',
      icon: assetPath('assets', 'mai-icon.png'),
      webPreferences: createWebPreferences()
    });
    setChatWindow(chatWindow);
    const chatWebContentsId = chatWindow.webContents.id;

    const chatSession = chatWindow.webContents.session;
    chatSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const currentChat = getChatWindow();
      const isCurrentChat = currentChat
        && !currentChat.isDestroyed()
        && webContents.id === currentChat.webContents.id;
      callback(permission === 'media' && isCurrentChat);
    });
    chatSession.setPermissionCheckHandler((webContents, permission) => {
      const currentChat = getChatWindow();
      return permission === 'media'
        && Boolean(currentChat)
        && !currentChat.isDestroyed()
        && webContents?.id === currentChat.webContents.id;
    });
    chatWindow.setMenuBarVisibility(false);
    chatWindow.loadFile(assetPath('renderer', 'chat.html'));
    chatWindow.once('ready-to-show', () => {
      if (process.env.MAI_CLOSE_CHAT_SMOKE === '1') {
        chatWindow?.hide();
        return;
      }
      chatWindow?.show();
      if (showSettings) chatWindow?.webContents.send('chat:show-settings');
      if (showLife) chatWindow?.webContents.send('chat:show-life');
    });
    chatWindow.on('closed', () => {
      onChatClosed(chatWebContentsId);
      setChatWindow(null);
    });
  }

  function openTimerWindow() {
    let timerWindow = getTimerWindow();
    if (timerWindow && !timerWindow.isDestroyed()) {
      if (timerWindow.isMinimized()) timerWindow.restore();
      timerWindow.show();
      timerWindow.focus();
      timerWindow.webContents.send('timer:state', publicReminderState());
      return;
    }
    timerWindow = new BrowserWindow({
      width: 520,
      height: 700,
      minWidth: 440,
      minHeight: 620,
      resizable: true,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      title: '麻衣的番茄钟',
      icon: assetPath('assets', 'mai-icon.png'),
      webPreferences: createWebPreferences()
    });
    setTimerWindow(timerWindow);
    timerWindow.setMenuBarVisibility(false);
    timerWindow.loadFile(assetPath('renderer', 'timer.html'));
    timerWindow.once('ready-to-show', () => timerWindow?.show());
    timerWindow.on('closed', () => setTimerWindow(null));
  }

  function openAssistantWindow(initialTab = 'today') {
    let assistantWindow = getAssistantWindow();
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      if (assistantWindow.isMinimized()) assistantWindow.restore();
      assistantWindow.show();
      assistantWindow.focus();
      assistantWindow.webContents.send('assistant:select-tab', initialTab);
      return;
    }
    assistantWindow = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 900,
      minHeight: 640,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      title: '麻衣的现实生活与知识库',
      icon: assetPath('assets', 'mai-icon.png'),
      webPreferences: createWebPreferences()
    });
    setAssistantWindow(assistantWindow);
    assistantWindow.setMenuBarVisibility(false);
    assistantWindow.loadFile(assetPath('renderer', 'assistant.html'));
    assistantWindow.once('ready-to-show', () => {
      assistantWindow?.show();
      assistantWindow?.webContents.send('assistant:select-tab', initialTab);
    });
    assistantWindow.on('closed', () => setAssistantWindow(null));
  }

  function persistPosition() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    getSettings().position = { x, y };
    saveSettings();
  }

  function showPet(action = 'hello') {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!positionIsVisible({ x: mainWindow.getBounds().x, y: mainWindow.getBounds().y })) {
      const position = defaultPosition();
      mainWindow.setPosition(position.x, position.y);
    }
    mainWindow.showInactive();
    mainWindow.setAlwaysOnTop(getSettings().alwaysOnTop, 'screen-saver');
    applyInvisibleOpacity();
    mainWindow.webContents.send('pet:action', action);
  }

  function sendAction(action) {
    showPet(action);
  }

  function actionMenuItems() {
    return [
      { label: '摸摸头', click: () => sendAction('pet') },
      { type: 'separator' },
      { label: '让她偷懒一会儿', click: () => sendAction('lazy') },
      { label: '让她睡一会儿', click: () => sendAction('sleep') },
      { label: '给她吃零食', click: () => sendAction('snack') },
      { label: '一起学习', click: () => sendAction('study') },
      { label: '一起认真工作', click: () => sendAction('work') }
    ];
  }

  function buildMenu() {
    const settings = getSettings();
    const reminderItems = publicReminderState().active
      ? [
          { label: reminderMenuLabel(), enabled: false },
          { label: '取消当前提醒', click: cancelReminder }
        ]
      : [];
    return Menu.buildFromTemplate([
      { label: '和麻衣聊天…', click: () => openChat(false) },
      { label: '召唤麻衣', click: () => showPet('hello') },
      { type: 'separator' },
      { label: '互动', submenu: actionMenuItems() },
      {
        label: '状态与陪伴',
        submenu: [
          {
            label: '始终置顶', type: 'checkbox', checked: settings.alwaysOnTop,
            click: (item) => {
              settings.alwaysOnTop = item.checked;
              getMainWindow()?.setAlwaysOnTop(item.checked, 'screen-saver');
              saveSettings();
              refreshTrayMenu();
            }
          },
          {
            label: '主动聊天', type: 'checkbox', checked: settings.deepseek.proactiveGreetingEnabled !== false,
            click: (item) => {
              settings.deepseek.proactiveGreetingEnabled = item.checked;
              saveSettings();
              scheduleProactiveGreeting(true);
              refreshTrayMenu();
            }
          },
          {
            label: '女友陪伴模式', type: 'checkbox', checked: settings.deepseek.girlfriendModeEnabled === true,
            click: (item) => {
              settings.deepseek.girlfriendModeEnabled = item.checked;
              saveSettings();
              if (!item.checked) {
                resetRelationshipWaiting();
                saveMemory();
              }
              scheduleProactiveGreeting(true);
              scheduleGirlfriendFollowUp();
              refreshTrayMenu();
            }
          },
          { label: '青春期综合征模式', type: 'checkbox', checked: settings.invisibleMode === true, click: (item) => setInvisibleMode(item.checked) },
          { type: 'separator' },
          {
            label: '重置到右下角', click: () => {
              const position = defaultPosition();
              getMainWindow()?.setPosition(position.x, position.y);
              persistPosition();
              showPet('jump');
            }
          }
        ]
      },
      {
        label: '设置与管理',
        submenu: [
          { label: '共同生活与资料库…', click: () => openAssistantWindow('today') },
          { label: '共同生活面板…', click: () => openChat(false, true) },
          { label: '设置提醒 / 番茄钟…', click: openTimerWindow },
          ...reminderItems,
          { type: 'separator' },
          { label: '模型与聊天设置…', click: () => openChat(true) },
          {
            label: '开机自动召唤', type: 'checkbox', checked: settings.openAtLogin,
            click: (item) => {
              applyLoginSetting(item.checked);
              refreshTrayMenu();
            }
          }
        ]
      },
      { type: 'separator' },
      { label: '暂时隐藏', click: () => getMainWindow()?.hide() },
      { type: 'separator' },
      { label: '退出 Mai Sakurajima', click: requestQuit }
    ]);
  }

  function refreshTrayMenu() {
    getTray()?.setContextMenu(buildMenu());
  }

  function createTrayImage() {
    let trayImage = nativeImage.createFromPath(assetPath('assets', 'mai-icon.png'));
    if (!trayImage.isEmpty()) trayImage = trayImage.resize({ width: 32, height: 32, quality: 'best' });
    return trayImage;
  }

  function createTray() {
    const tray = new Tray(createTrayImage());
    setTray(tray);
    tray.setToolTip('Mai Sakurajima · 她一直在陪着你');
    refreshTrayMenu();
    tray.on('click', () => showPet('hello'));
    tray.on('double-click', () => showPet('jump'));
  }

  return {
    createWindow,
    openChat,
    openTimerWindow,
    openAssistantWindow,
    persistPosition,
    showPet,
    buildMenu,
    refreshTrayMenu,
    createTray
  };
}

module.exports = { createWindowManager };
