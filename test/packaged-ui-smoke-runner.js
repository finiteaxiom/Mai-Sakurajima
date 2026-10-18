'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const executable = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!executable || !fs.existsSync(executable)) {
  throw new Error('Usage: node test/packaged-ui-smoke-runner.js <Mai Sakurajima.exe>');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-v600-ui-'));
const userData = path.join(root, 'user-data');
const verifySettingsSaveFailure = process.env.MAI_UI_SAVE_ERROR_SMOKE === '1';
const settingsPath = path.join(userData, 'mai-pet-deepseek-settings.json');

if (verifySettingsSaveFailure) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ firstLaunch: false }, null, 2), 'utf8');
}

function runUiSmoke(output) {
  const appArguments = path.basename(executable).toLowerCase() === 'electron.exe'
    ? [path.resolve(__dirname, '..')]
    : [];
  const processResult = spawnSync(executable, [
    ...appArguments,
    `--user-data-dir=${userData}`,
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--in-process-gpu',
    '--no-sandbox'
  ], {
    cwd: root,
    encoding: 'utf8',
    // The nested Chat, wallpaper and two avatar readiness checks can each
    // legitimately wait for their own bounded asynchronous resource load.
    timeout: 60000,
    windowsHide: false,
    env: {
      ...process.env,
      MAI_UI_SMOKE: '1',
      MAI_UI_SMOKE_OUTPUT: output
    }
  });
  if (processResult.error) throw processResult.error;
  const result = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  assert.equal(processResult.status, 0, `${processResult.stdout}\n${processResult.stderr}\n${JSON.stringify(result)}`);
  assert.ok(result, 'UI smoke did not create a result file');
  assert.equal(result.ok, true, result.error || JSON.stringify(result));
  if (verifySettingsSaveFailure) {
    assert.deepEqual(result.settingsSaveError, {
      message: 'Smoke-injected settings replacement failure.',
      errorStyle: true,
      persistedBytesUnchanged: true,
      settingsStateRolledBack: true
    });
  }
  return result;
}

try {
  const first = runUiSmoke(path.join(root, 'ui-result-first.json'));
  assert.equal(first.chat.selectedWallpaper, '');
  assert.equal(first.chat.selectedMaiAvatar, '');
  assert.equal(first.chat.selectedUserAvatar, '');
  const result = runUiSmoke(path.join(root, 'ui-result-restart.json'));
  assert.equal(result.version, '7.1.0');
  assert.equal(result.product, 'Mai desktop companion');
  assert.ok(result.chat.location.length > 0);
  assert.equal(result.chat.hasConversationList, true);
  assert.equal(result.chat.hasMemoryNavigation, true);
  assert.equal(result.chat.hasMomentsNavigation, true);
  assert.equal(result.chat.hasVoiceNavigation, true);
  assert.equal(result.chat.hasCompanionContext, true);
  assert.equal(result.chat.hasWorkspaceSwitcher, true);
  assert.equal(result.chat.hasActionWorkspace, true);
  assert.equal(result.chat.hasProjectTaskGrouping, true);
  assert.equal(result.chat.hasAgentRuntime, true);
  assert.equal(result.chat.hasAgentLanguage, false);
  assert.equal(result.chat.avatarCount, 0);
  assert.equal(result.chat.hasLocalAvatarControls, true);
  assert.equal(result.chat.selectedMaiAvatar, '');
  assert.equal(result.chat.selectedUserAvatar, '');
  assert.equal(result.chat.maiAvatarPath, '../assets/mai-profile.png');
  assert.equal(result.chat.userAvatarPath, '../assets/mai-icon.png');
  assert.equal(result.chat.wallpaperCount, 0);
  assert.equal(result.chat.selectedWallpaper, '');
  assert.equal(result.chat.hasLocalWallpaperControls, true);
  assert.equal(result.chat.wallpaperSize, 'cover');
  assert.deepEqual(result.companionInspector.closed, {
    toggleVisible: true,
    expanded: 'false',
    contextHidden: 'true',
    contextPosition: 'fixed'
  });
  assert.deepEqual(result.companionInspector.open, {
    expanded: 'true',
    open: true,
    contextHidden: 'false',
    scrimHidden: false,
    contextVisible: true
  });
  assert.equal(result.companionInspector.afterScrim, true);
  assert.equal(result.companionInspector.afterEscape, true);
  assert.equal(result.actionWorkspace.selected, 'agent');
  assert.equal(result.actionWorkspace.label, 'Work');
  assert.equal(result.actionWorkspace.sidebarVisible, true);
  assert.equal(result.actionWorkspace.contextPresent, true);
  assert.equal(result.actionWorkspace.historySearchHidden, true);
  assert.equal(result.actionWorkspace.companionHidden, true);
  assert.equal(result.actionWorkspace.projectTaskGrouping, true);
  assert.equal(result.actionWorkspace.avatarShared, true);
  assert.ok(result.actionWorkspace.sidebarWidth >= 200);
  assert.equal(result.actionWorkspace.sidebarToggleHidden, true);
  assert.deepEqual(result.workInspector.narrow.closed, {
    toggleVisible: true,
    expanded: 'false',
    contextHidden: 'true',
    contextPosition: 'fixed',
    workspaceSelectorCount: 1
  });
  assert.deepEqual(result.workInspector.narrow.open, {
    expanded: 'true',
    open: true,
    contextHidden: 'false',
    scrimHidden: false,
    scrimClear: true,
    selectorVisible: true,
    selectorClickable: true
  });
  assert.equal(result.workInspector.narrow.afterScrim, true);
  assert.equal(result.workInspector.narrow.afterEscape, true);
  assert.equal(result.workInspector.narrow.afterChatSwitch, true);
  assert.deepEqual(result.workInspector.wide, {
    toggleVisible: false,
    open: false,
    contextHidden: 'false',
    contextPosition: 'static'
  });
  assert.ok(result.chat.viewportWidth >= 1000);
  console.log(JSON.stringify(result));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
