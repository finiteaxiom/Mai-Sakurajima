const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createWindowManager } = require('../window-manager');

class FakeWindow {
  constructor(options) {
    this.options = options;
    this.events = new Map();
    this.destroyed = false;
    this.minimized = false;
    this.webContents = {
      id: FakeWindow.nextId++,
      sent: [],
      send: (channel, payload) => this.webContents.sent.push([channel, payload]),
      session: {
        setPermissionRequestHandler: (handler) => { this.permissionRequestHandler = handler; },
        setPermissionCheckHandler: (handler) => { this.permissionCheckHandler = handler; }
      }
    };
  }

  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
  setMenuBarVisibility() {}
  loadFile(file) { this.loadedFile = file; }
  once(name, handler) { this.events.set(name, handler); }
  on(name, handler) { this.events.set(name, handler); }
  isDestroyed() { return this.destroyed; }
  isMinimized() { return this.minimized; }
  restore() { this.minimized = false; }
  show() {}
  showInactive() {}
  focus() {}
  hide() {}
  getPosition() { return [31, 47]; }
  getBounds() { return { x: 31, y: 47 }; }
  setPosition() {}
}
FakeWindow.nextId = 1;

function createHarness() {
  const state = { main: null, chat: null, timer: null, assistant: null, tray: null };
  let stopped = 0;
  const manager = createWindowManager({
    app: { quit() {} },
    BrowserWindow: FakeWindow,
    Menu: { buildFromTemplate: (items) => ({ items, popup() {} }) },
    Tray: class { setToolTip() {} setContextMenu() {} on() {} },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    path,
    rootDirectory: '/mai',
    windowWidth: 310,
    windowHeight: 390,
    getMainWindow: () => state.main,
    setMainWindow: (window) => { state.main = window; },
    getChatWindow: () => state.chat,
    setChatWindow: (window) => { state.chat = window; },
    getTimerWindow: () => state.timer,
    setTimerWindow: (window) => { state.timer = window; },
    getAssistantWindow: () => state.assistant,
    setAssistantWindow: (window) => { state.assistant = window; },
    getTray: () => state.tray,
    setTray: (tray) => { state.tray = tray; },
    getSettings: () => ({ alwaysOnTop: true, position: null, deepseek: {} }),
    isQuitting: () => false,
    positionIsVisible: () => false,
    defaultPosition: () => ({ x: 100, y: 200 }),
    applyInvisibleOpacity() {},
    saveSettings() {},
    onChatClosed: () => { stopped += 1; },
    publicReminderState: () => ({ active: false }),
    reminderMenuLabel: () => '',
    cancelReminder() {},
    applyLoginSetting() {},
    scheduleProactiveGreeting() {},
    resetRelationshipWaiting() {},
    saveMemory() {},
    scheduleGirlfriendFollowUp() {},
    setInvisibleMode() {},
    requestQuit() {}
  });
  return { manager, state, stopped: () => stopped };
}

test('window manager creates the pet window with the existing secure preload boundary', () => {
  const { manager, state } = createHarness();
  manager.createWindow();
  assert.equal(state.main.options.width, 310);
  assert.equal(state.main.options.x, 100);
  assert.equal(state.main.options.webPreferences.contextIsolation, true);
  assert.equal(state.main.options.webPreferences.nodeIntegration, false);
  assert.equal(state.main.options.webPreferences.sandbox, true);
  assert.match(state.main.loadedFile, /renderer[\\/]index\.html$/);
});

test('window manager retains chat media permission scope and closes voice recognition', () => {
  const { manager, state, stopped } = createHarness();
  manager.openChat();
  const chat = state.chat;
  assert.equal(chat.permissionRequestHandler(chat.webContents, 'media', () => {}), undefined);
  assert.equal(chat.permissionCheckHandler(chat.webContents, 'media'), true);
  assert.equal(chat.permissionCheckHandler({ id: 999 }, 'media'), false);
  chat.events.get('closed')();
  assert.equal(state.chat, null);
  assert.equal(stopped(), 1);
});

test('pet context menu keeps common actions at the top level and groups secondary controls', () => {
  const { manager } = createHarness();
  const menu = manager.buildMenu();
  assert.deepEqual(
    menu.items.filter((item) => item.label).map((item) => item.label),
    ['和麻衣聊天…', '召唤麻衣', '互动', '状态与陪伴', '设置与管理', '暂时隐藏', '退出 Mai Sakurajima']
  );
  const interaction = menu.items.find((item) => item.label === '互动');
  const companion = menu.items.find((item) => item.label === '状态与陪伴');
  const management = menu.items.find((item) => item.label === '设置与管理');
  assert.equal(interaction.submenu[0].label, '摸摸头');
  assert.ok(companion.submenu.some((item) => item.label === '主动聊天' && item.type === 'checkbox'));
  assert.ok(management.submenu.some((item) => item.label === '模型与聊天设置…'));
});
