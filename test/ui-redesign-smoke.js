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
    await checkContrast(['.message--user .bubble','.message--assistant .bubble','.message-time','#send-button','#connection-label']);
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
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await delay();
    assert.equal(await run(`document.querySelector('.chat-app').inert`),false);
    assert.equal(await run(`document.activeElement.id`),'settings-button');
    await run(`document.querySelector('[data-mode-tab="agent"]').click()`); await delay(500);
    for (const size of [[900,640],[1180,820],[1440,900]]) { await geometry('work',...size); await capture(`work-${size[0]}`); }
    await run(`document.querySelector('[data-workspace-path="README.md"]')?.click()`); await delay();
    // Use the actual entry rendered by the existing Explorer and its existing preview IPC.
    await run(`Array.from(document.querySelectorAll('.workspace-explorer__entry')).find(e=>e.textContent.includes('README.md')).click()`); await delay();
    assert.equal(await run(`document.getElementById('workspace-preview-overlay').hidden`),false);
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
    assert.deepEqual(errors, []);
    const report = { ok:true, userDataIsolated:true, checks, contrast, screenshots, longHistory:500, focusAndRapidToggle:true, reducedMotion:true, errors };
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    window.destroy(); app.exit(0);
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
