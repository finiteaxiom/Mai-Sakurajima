'use strict';
// Real local Renderer + synthetic preload; never loads production main.js or a Provider.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const output = process.env.MAI_UI_REDESIGN_OUTPUT || path.join(os.tmpdir(), 'mai-ui-redesign');
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-redesign-'));
  try {
    const env = { ...process.env, MAI_UI_TEST_ROOT: userData };
    delete env.ELECTRON_RUN_AS_NODE;
    const crypto = require('node:crypto');
    const realRoot = path.join(process.env.APPDATA, 'Mai Sakurajima');
    const protectedFiles = ['mai-pet-deepseek-settings.json', 'mai-pet-memory.json', 'mai-work.json', 'mai-knowledge-index.json', 'custom-wallpaper.jpg', 'custom-avatar-mai.jpg', 'custom-avatar-user.jpg'];
    const hashes = () => protectedFiles.map(name => {
      const file = path.join(realRoot, name);
      return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
    });
    const before = hashes();
    const result = spawnSync(require('electron'), [__filename, `--user-data-dir=${userData}`], {
      env, encoding: 'utf8', timeout: 90000, windowsHide: true
    });
    process.stdout.write(result.stdout || '');
    if (result.status !== 0) throw result.error || new Error(result.stderr || `Smoke exit ${result.status}`);
    assert.deepEqual(hashes(), before, 'Formal product data must remain byte-identical');
    console.log('Protected production data: unchanged (7 known persistence/resource paths).');
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
} else {
  const { app, BrowserWindow } = require('electron');
  const { initializeStorage } = require('../storage');
  assert.ok(process.env.MAI_UI_TEST_ROOT);
  assert.equal(path.resolve(app.getPath('userData')), path.resolve(process.env.MAI_UI_TEST_ROOT));
  assert.equal(initializeStorage(app).userDataDirectory, app.getPath('userData'));
  app.disableHardwareAcceleration();
  const delay = (ms = 280) => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    fs.mkdirSync(output, { recursive: true });
    const window = new BrowserWindow({ width: 1180, height: 820, useContentSize: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false }
    });
    const errors = [];
    window.webContents.on('console-message', (_e, level, message) => { if (level >= 3) { errors.push(message); console.error(message); } });
    const run = code => window.webContents.executeJavaScript(code, true);
    window.showInactive();
    await window.loadFile(path.join(__dirname, '../renderer/chat.html'));
    await delay(600);
    const brokenReply = '{"reply":"我在。","memories":["private-metadata"],"mind":';
    await run(`loadHistory([{role:'assistant',content:${JSON.stringify(brokenReply)}},{role:'user',content:${JSON.stringify(brokenReply)}}]);`);
    assert.deepEqual(await run(`Array.from(document.querySelectorAll('.bubble')).map(el => el.textContent)`), ['我在。', brokenReply]);
    assert.equal(await run(`document.querySelector('.sidebar-account') === null && document.getElementById('composer').contains(document.getElementById('voice-call-button')) && document.getElementById('settings-overlay').contains(document.getElementById('user-avatar-button'))`),true);
    await run(`window.maiAppearance.apply({theme:'light'}); loadHistory([
      {role:'user',content:'今天有一点累。',createdAt:'2026-10-21T12:14:00Z'},
      {role:'assistant',content:'辛苦了，学弟。\\n先休息一下吧，今天想和我聊些什么？',createdAt:'2026-10-21T12:15:00Z'},
      {role:'user',content:'陪我待一会儿就好。',createdAt:'2026-10-21T12:16:00Z'},
      {role:'assistant',content:'嗯，我在。',createdAt:'2026-10-21T12:16:30Z'}]);`);
    const screenshots = [];
    const checks = [];
    const contrast = [];
    async function capture(name) {
      await delay(); await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`); await delay(120); const file = path.join(output, `${name}.png`);
      fs.writeFileSync(file, (await window.webContents.capturePage()).toPNG()); screenshots.push(file);
    }
    async function geometry(mode, width, height) {
      window.setContentSize(width, height); await delay();
      const result = await run(`(() => {
        const input = document.getElementById('composer').getBoundingClientRect();
        const messages = document.getElementById('messages');
        const sidebar = document.querySelector('.chat-header').getBoundingClientRect();
        return {mode:${JSON.stringify(mode)},width:innerWidth,height:innerHeight,
          composerVisible:input.top>=0 && input.bottom<=innerHeight && input.width>250,
          noHorizontalOverflow:messages.scrollWidth<=messages.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth,
          sidebarWidth:sidebar.width, inputTop:input.top, messageHeight:messages.clientHeight};
      })()`);
      assert.ok(result.composerVisible, JSON.stringify(result)); assert.ok(result.noHorizontalOverflow, JSON.stringify(result));
      assert.ok(result.messageHeight > 180, JSON.stringify(result)); checks.push(result);
    }
    async function checkContrast(selectors) {
      const ratios = await run(`(${function (selectors) {
        // Chromium serializes color-mix as color(srgb ...), not always rgb(0..255).
        const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgba = value => {
          context.clearRect(0,0,1,1); context.fillStyle = value; context.fillRect(0,0,1,1);
          const pixel = [...context.getImageData(0,0,1,1).data];
          return [...pixel.slice(0,3),pixel[3]/255];
        };
        const blend = (front, back) => front.slice(0,3).map((v,i) => v*(front[3]??1)+back[i]*(1-(front[3]??1)));
        function background(node) {
          if (!node) return [255,255,255];
          return blend(rgba(getComputedStyle(node).backgroundColor),background(node.parentElement));
        }
        const luminance = rgb => rgb.map(v => v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        return selectors.map(selector => {
          const el = document.querySelector(selector); if (!el || !el.getClientRects().length) return {selector,skipped:true};
          const bg=background(el), fg=blend(rgba(getComputedStyle(el).color),bg);
          const a=luminance(bg),b=luminance(fg);
          return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        });
      }.toString()})(${JSON.stringify(selectors)})`);
      for (const result of ratios) if (!result.skipped) assert.ok(result.ratio >= 4.5, JSON.stringify(result));
      contrast.push(...ratios);
    }
    for (const size of [[900,640],[1180,820],[1440,900]]) { await geometry('chat',...size); await capture(`chat-${size[0]}`); }
    await checkContrast(['.message--user .bubble','.message--assistant .bubble','.message-time','#send-button']);
    await run(`document.getElementById('companion-inspector-toggle').click()`); await delay();
    assert.equal(await run(`document.getElementById('companion-context').contains(document.activeElement)`),true);
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await delay();
    assert.equal(await run(`document.activeElement.id`),'companion-inspector-toggle');
    // Long history uses one batch and never replays entry animations on hydration.
    await run(`loadHistory(Array.from({length:500},(_,i)=>({role:i%2?'assistant':'user',content:'合成历史 '+i+'：保留阅读位置，测试长内容。'.repeat(4)})))`);
    assert.equal(await run(`document.querySelectorAll('.message--new').length`),0);
    await run(`messagesElement.scrollTop=240; messagesElement.dispatchEvent(new Event('scroll'));`);
    await run(`addMessage('assistant','阅读期间到达的新消息');`); await delay();
    assert.equal(await run(`messagesElement.scrollTop`),240);
    assert.equal(await run(`document.getElementById('scroll-latest').hidden`),false);
    await run(`document.getElementById('scroll-latest').click()`); await delay();
    assert.equal(await run(`document.getElementById('scroll-latest').hidden`),true);
    // Modal focus, rapid open/close and Escape close exactly one layer.
    await run(`for(let i=0;i<12;i++){document.getElementById('settings-button').click();document.getElementById('close-settings').click()} document.getElementById('settings-button').click()`); await delay();
    assert.equal(await run(`document.getElementById('settings-overlay').contains(document.activeElement)`),true);
    await capture('settings-light');
    // Exercise the real settings bindings with an isolated persistence fixture.
    for (const section of ['appearance','companion','voice','model','data','diagnostics']) {
      await run(`document.querySelector('[data-settings-section="${section}"]').click()`);
      assert.equal(await run(`document.querySelectorAll('.settings-panel:not([hidden])').length`),1);
      assert.equal(await run(`document.getElementById('settings-panel-${section}').getBoundingClientRect().width>100`),true);
    }
    await run(`window.maiSettingsView.select('companion');customPromptInput.value='保留分类草稿';customPromptInput.dispatchEvent(new Event('input',{bubbles:true}));window.maiSettingsView.select('model');`);
    assert.equal(await run(`customPromptInput.value`),'保留分类草稿');
    await run(`closeSettings();openSettings('companion')`); await delay();
    assert.equal(await run(`customPromptInput.value`),'保留分类草稿');
    await run(`window.maiUiTest.failNextSave();saveSettings()`);
    assert.equal(await run(`customPromptInput.value`),'保留分类草稿');
    assert.equal(await run(`window.maiSettingsView.isDirty() && settingsStatus.classList.contains('settings-status--error')`),true);
    await run(`saveSettings()`);
    assert.equal(await run(`window.maiSettingsView.isDirty()`),false);
    assert.equal(await run(`window.maiUiTest.savedConfig().customPrompt`),'保留分类草稿');
    await run(`window.maiSettingsView.select('appearance');appearanceThemeInput.value='dark';appearanceThemeInput.dispatchEvent(new Event('change',{bubbles:true}));closeSettings()`);
    assert.equal(await run(`document.documentElement.dataset.maiTheme`),'auto');
    await run(`openSettings('appearance');document.getElementById('discard-settings').click()`);
    assert.equal(await run(`appearanceThemeInput.value`),'auto');
    for (const [width,height] of [[900,640],[760,680],[1180,820]]) {
      window.setContentSize(width,height); await delay();
      assert.equal(await run(`(()=>{const r=saveSettingsButton.getBoundingClientRect();return r.width>0&&r.bottom<=innerHeight&&r.left>=0&&document.documentElement.scrollWidth<=innerWidth})()`),true);
      await capture(`settings-product-${width}`);
    }
    await run(`closeSettings()`); window.setContentSize(760,680); await delay();
    assert.equal(await run(`document.querySelector('.chat-header').getClientRects().length`),0);
    await run(`workspaceSidebarToggle.click();document.querySelectorAll('.sidebar-group')[1].open=true`); await delay();
    assert.equal(await run(`memoryButton.getBoundingClientRect().width>0 && !memoryButton.closest('[inert]')`),true);
    assert.equal(await run(`getComputedStyle(memoryButton,'::after').display!=='none' && settingsButton.getBoundingClientRect().bottom<=innerHeight`),true);
    await capture('chat-narrow-navigation');
    await run(`memoryButton.click()`); await delay();
    assert.equal(await run(`chatApp.classList.contains('small-sidebar-open')`),false);
    assert.equal(await run(`memoryOverlay.contains(document.activeElement)`),true);
    await run(`document.getElementById('close-memory').click()`); window.setContentSize(1180,820); await delay();
    await run(`closeSettings();chatConfig.configured=false;showWelcomeMessage();document.getElementById('welcome-connect-model').click()`); await delay();
    assert.equal(await run(`document.getElementById('settings-panel-model').hidden`),false);
    await capture('first-connection-settings');
    await run(`chatConfig.configured=true;closeSettings();loadHistory([]);window.maiUiTest.failNextChat();messageInput.value='发送失败保留的文本';sendMessage()`);
    assert.equal(await run(`messageInput.value`),'发送失败保留的文本');
    assert.equal(await run(`!!document.querySelector('#notice .notice-recover')`),true);
    assert.equal(await run(`document.querySelectorAll('.message--pending').length`),0);
    await capture('chat-recovery');
    await run(`hideNotice();messageInput.value='';resizeInput();loadHistory([{role:'user',content:'今天有一点累。'},{role:'assistant',content:'辛苦了，先休息一下吧。'}]);closeSettings();settingsButton.click();window.maiSettingsView.select('appearance')`); await delay();
    assert.equal(await run(`!!document.getElementById('voice-engine').value && !!document.getElementById('local-voice-title').textContent && !!document.getElementById('install-local-voice').textContent`),true);
    assert.equal(await run(`!!document.getElementById('choose-custom-wallpaper') && !!document.getElementById('clear-custom-wallpaper') && document.querySelectorAll('#wallpaper-grid .wallpaper-option').length === chatConfig.wallpapers.length`),true);
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await delay();
    assert.equal(await run(`document.querySelector('.chat-app').inert`),false);
    assert.equal(await run(`document.activeElement.id`),'settings-button');
    await run(`document.getElementById('mai-avatar-button').click()`); await delay();
    assert.equal(await run(`document.getElementById('avatar-picker-overlay').contains(document.activeElement) && !!document.getElementById('choose-custom-avatar') && !!document.getElementById('clear-custom-avatar')`),true);
    assert.equal(await run(`document.querySelectorAll('.avatar-option').length`),0);
    await capture('avatar-picker');
    await run(`document.getElementById('close-avatar-picker').click()`); await delay();
    await run(`document.querySelector('[data-mode-tab="agent"]').click()`); await delay(500);
    for (const size of [[900,640],[1180,820],[1440,900]]) { await geometry('work',...size); await capture(`work-${size[0]}`); }
    await run(`document.querySelector('[data-workspace-path="README.md"]')?.click()`); await delay();
    // Use the actual entry rendered by the existing Explorer and its existing preview IPC.
    await run(`Array.from(document.querySelectorAll('.workspace-explorer__entry')).find(e=>e.textContent.includes('README.md')).click()`); await delay();
    assert.equal(await run(`document.getElementById('workspace-preview-overlay').hidden`),false);
    assert.match(await run(`document.getElementById('workspace-preview-content').textContent`), /Local preview\./);
    assert.ok(await run(`document.querySelectorAll('.work-operation-result').length`) >= 1);
    await capture('file-preview');
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await delay();
    assert.equal(await run(`document.getElementById('workspace-preview-overlay').hidden`),true);
    await run(`document.getElementById('work-details-tab').click()`); await delay();
    assert.equal(await run(`document.getElementById('work-files-panel').hidden`),true);
    await run(`document.getElementById('work-files-tab').click(); chatConfig.appearance = window.maiAppearance.apply({theme:'dark'})`);
    await capture('work-dark');
    await checkContrast(['.agent-session-item--active strong','.agent-session-item--active small','.workspace-explorer__name','#send-button']);
    await run(`document.querySelector('[data-mode-tab="chat"]').click()`); await delay();
    assert.equal(await run(`selectedRuntimeMode`),'chat');
    await capture('chat-dark');
    await checkContrast(['.message--user .bubble','.message--assistant .bubble','.message-time','#send-button']);
    for (const [button,overlay,close] of [['settings-button','settings-overlay','close-settings'],['memory-button','memory-overlay','close-memory'],['shared-life-button','shared-life-overlay','close-shared-life'],['life-button','life-overlay','close-life'],['moments-button','moments-overlay','close-moments'],['history-button','history-sidebar','close-history']]) {
      await run(`document.getElementById('${button}').click()`); await delay();
      assert.equal(await run(`document.getElementById('${overlay}').contains(document.activeElement)`),true,overlay);
      assert.equal(await run(`document.documentElement.dataset.maiTheme`),'dark');
      if (overlay === 'moments-overlay') {
        assert.equal(await run(`document.querySelector('.moment-comment--assistant span')?.textContent`),'当然买了，不过要看你什么时候来陪我一起吃。你今晚有空吗？');
        assert.equal(await run(`document.getElementById('moments-list').textContent.includes('"action"')`),false);
      }
      if (overlay === 'shared-life-overlay') {
        for (const selector of ['#timeline-list .hub-item','#people-list .hub-item','#digests-list .hub-item','#projects-list .hub-item','#habits-list .hub-item','#review-list .hub-item','.episode-item','.topic-item']) {
          assert.equal(await run(`document.querySelectorAll(${JSON.stringify(selector)}).length`),1,selector);
        }
        assert.equal(await run(`document.querySelectorAll('.memory-correction-actions button').length`),4);
        assert.equal(await run(`!document.getElementById('projects-panel').classList.contains('shared-life-panel--hidden')`),true);
        await run(`document.getElementById('timeline-tab').click()`);
        assert.equal(await run(`!!document.getElementById('world-activity').textContent && !document.getElementById('timeline-panel').classList.contains('shared-life-panel--hidden')`),true);
      }
      await capture(`${overlay}-dark`);
      await run(`document.getElementById('${close}').click()`); await delay();
    }
    // Font/density settings at the minimum viewport, with a synthetic high-contrast wallpaper.
    await run(`window.maiAppearance.apply({theme:'light',uiScale:110,chatDensity:'relaxed',glassIntensity:'clear',transparency:58});document.getElementById('wallpaper-layer').style.backgroundImage='repeating-linear-gradient(45deg, black 0 20px, white 20px 40px)'`);
    await geometry('chat-large-text-wallpaper',900,640);
    await checkContrast(['.message--assistant .bubble','.message-time','#send-button']);
    await capture('chat-wallpaper-scale110');
    for (const motion of ['off','reduced']) {
      await run(`window.maiAppearance.apply({theme:'light',motion:'${motion}'});addMessage('assistant','动效偏好检查')`);
      assert.equal(await run(`getComputedStyle(document.querySelector('.message--new')).animationName`),'none');
    }
    // OS preference wins even if full was selected.
    await window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await run(`window.maiAppearance.apply({theme:'light',motion:'full'})`);
    assert.equal(await run(`getComputedStyle(document.querySelector('.message--new')).animationName`),'none');
    window.webContents.debugger.detach();
    // Presentation fixture only: no microphone, speech engine or real call is started.
    await run(`document.getElementById('voice-call-overlay').classList.remove('overlay--hidden'); document.getElementById('voice-call-status').textContent='语音界面测试';`); await delay();
    assert.equal(await run(`document.getElementById('voice-call-overlay').contains(document.activeElement) && getComputedStyle(document.getElementById('voice-call-overlay')).display !== 'none'`),true);
    await capture('voice-presentation');
    await run(`document.getElementById('end-voice-call').click()`); await delay();
    // Preserve the standalone windows previously covered by smoke-light-theme-ui.
    for (const [page,width,height,selector] of [['assistant',1180,820,'.feature-card'],['timer',520,700,'.countdown-card']]) {
      const auxiliary = new BrowserWindow({width,height,useContentSize:true,show:false,webPreferences:{preload:path.join(__dirname,'mock-preload.js'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
      auxiliary.webContents.on('console-message', (_e,level,message) => { if(level>=3) errors.push(message); });
      auxiliary.showInactive();
      await auxiliary.loadFile(path.join(__dirname, `../renderer/${page}.html`)); await delay(600);
      const visible = await auxiliary.webContents.executeJavaScript(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); return !!el && el.getBoundingClientRect().width>0 && document.documentElement.scrollWidth<=innerWidth; })()`);
      assert.equal(visible,true,page);
      const file=path.join(output,`${page}.png`); fs.writeFileSync(file,(await auxiliary.webContents.capturePage()).toPNG()); screenshots.push(file);
      auxiliary.destroy();
    }
    assert.deepEqual(errors, []);
    const report = { ok:true, userDataIsolated:true, checks, contrast, screenshots, longHistory:500, focusAndRapidToggle:true, reducedMotion:true,
      settingsCategories:true, draftAcrossCategoriesAndReopen:true, saveFailureRetainsDraft:true, savedFixtureVerified:true,
      appearancePreviewReverted:true, saveFooterVisible:true, narrowNavigation:true, firstConnectionEntry:true, failedChatDraftRecovered:true, errors };
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    window.destroy(); app.exit(0);
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
