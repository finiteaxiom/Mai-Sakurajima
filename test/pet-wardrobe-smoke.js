'use strict';
// Real wardrobe IPC, window manager, preload, renderer and disk persistence.
// Companion/model APIs are minimal fixtures; no production data or paid APIs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-wardrobe-smoke-'));
  const { spawnSync } = require('node:child_process');
  try {
    const env = { ...process.env, MAI_WARDROBE_SMOKE_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(require('electron'), [__filename, `--user-data-dir=${root}`], { env, encoding: 'utf8', timeout: 90000, windowsHide: true });
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
    if (result.status !== 0) throw result.error || new Error(`Wardrobe smoke exit ${result.status}`);
  } finally {
    if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('mai-wardrobe-smoke-')) fs.rmSync(root, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow, ipcMain, nativeImage, Menu, Tray, screen } = require('electron');
  const { registerPetWardrobeIpc } = require('../pet-wardrobe');
  const { createWindowManager } = require('../window-manager');
  const root = process.env.MAI_WARDROBE_SMOKE_ROOT;
  assert.equal(path.resolve(app.getPath('userData')), path.resolve(root));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const repo = path.resolve(__dirname, '..'), savedFile = path.join(root, 'settings.json');
    const output = process.env.MAI_WARDROBE_OUTPUT || path.join(repo, 'logs', 'wardrobe-smoke'); fs.mkdirSync(output, { recursive: true });
    let settings = { firstLaunch: false, alwaysOnTop: false, deepseek: {}, petWardrobe: { outfitId: 'original' }, marker: 'KEEP' };
    let pet, chat, timer, assistant, tray, failSave = false, failRead = false;
    const errors = [];
    app.on('web-contents-created', (_event, contents) => contents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); }));
    const noop = () => {};
    const manager = createWindowManager({ app, BrowserWindow, Menu, Tray, nativeImage, path, rootDirectory: repo, windowWidth: 310, windowHeight: 390,
      getMainWindow: () => pet, setMainWindow: v => { pet = v; }, getChatWindow: () => chat, setChatWindow: v => { chat = v; },
      getTimerWindow: () => timer, setTimerWindow: v => { timer = v; }, getAssistantWindow: () => assistant, setAssistantWindow: v => { assistant = v; },
      getTray: () => tray, setTray: v => { tray = v; }, getSettings: () => settings, isQuitting: () => true,
      positionIsVisible: position => Boolean(position), defaultPosition: () => ({ x: 40, y: 40 }), applyInvisibleOpacity: noop, saveSettings: noop,
      onChatClosed: noop, publicReminderState: () => ({ active: false }), reminderMenuLabel: () => '', cancelReminder: noop, applyLoginSetting: noop,
      scheduleProactiveGreeting: noop, resetRelationshipWaiting: noop, saveMemory: noop, scheduleGirlfriendFollowUp: noop, setInvisibleMode: noop, requestQuit: noop });
    registerPetWardrobeIpc({ ipcMain, rootDirectory: repo, nativeImage, getSettings: () => { if(failRead) throw new Error('fixture read failure'); return settings; },
      saveSettings: () => { if (failSave) throw new Error('fixture disk failure'); fs.writeFileSync(savedFile, JSON.stringify(settings)); },
      openWardrobe: manager.openWardrobe, getWindows: () => [pet, chat, manager.getWardrobeWindow()] });
    ipcMain.handle('pet:get-settings', () => settings);
    ipcMain.handle('pet:get-context', () => ({ cursor: { x: 0, y: 0 }, bounds: pet && !pet.isDestroyed() ? pet.getBounds() : { x: 40, y: 40, width: 310, height: 390 } }));
    const run = (win, code) => win.webContents.executeJavaScript(code);
    const waitFor = async (win, expression) => { for (let i = 0; i < 160; i++) { if (await run(win, expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('UI did not settle: ' + expression); };
    manager.createWindow();
    await new Promise(resolve => pet.webContents.once('did-finish-load', resolve));
    // The real native menu opens the production wardrobe window.
    manager.buildMenu().items.find(item => item.label === '衣橱与动作…').click();
    const wardrobe = manager.getWardrobeWindow();
    await new Promise(resolve => wardrobe.webContents.once('did-finish-load', resolve));
    const choose = id => run(wardrobe, `document.querySelector('[data-outfit="${id}"]').click()`);
    await waitFor(wardrobe, `document.getElementById('status').textContent.includes('预览不会')`);
    const position = pet.getBounds();
    const display=screen.getDisplayMatching(wardrobe.getBounds());
    console.log(JSON.stringify({display:{scaleFactor:display.scaleFactor,bounds:display.bounds,workArea:display.workArea},contentBounds:wardrobe.getContentBounds()}));
    // Render every shared and exclusive action with the production player.
    const catalog = require('../renderer/pet-catalog');
    for (const outfit of catalog.outfits) {
      const frames = await run(wardrobe, `(async()=>{
        const id=${JSON.stringify(outfit.id)}, asset=await MaiPetSprites.load(id);
        const actions=['idle','wave','runRight','runLeft','love','sleep','outfitPrimary','outfitSecondary'];
        const cell=document.createElement('canvas');cell.width=192;cell.height=208;
        const sheet=document.createElement('canvas');sheet.width=192*8;sheet.height=208*actions.length;
        const ctx=sheet.getContext('2d');ctx.fillStyle='#faf9f7';ctx.fillRect(0,0,sheet.width,sheet.height);
        const player=MaiPetSprites.createPlayer(cell.getContext('2d'));player.setAsset(asset);
        const results=[];
        for(const [row,name] of actions.entries()){
          const config=MaiPetCatalog.action(id,name);player.setAction(name,0,true);const samples=[];
          for(let f=0;f<8;f++){player.draw(f*config.interval+1);ctx.drawImage(cell,f*192,row*208);samples.push(cell.toDataURL());}
          results.push({name,unique:new Set(samples).size});
        }
        return {results,png:sheet.toDataURL().split(',')[1],dpr:devicePixelRatio};
      })()`);
      assert.ok(frames.results.every(action=>action.unique>1), `${outfit.id}: static action`);
      fs.writeFileSync(path.join(output,`${outfit.id}-actions.png`),Buffer.from(frames.png,'base64'));
      console.log(JSON.stringify({outfit:outfit.id,actions:frames.results,dpr:frames.dpr}));
    }
    await choose('home'); await waitFor(wardrobe, `!document.getElementById('apply').disabled`);
    await run(wardrobe, `document.getElementById('pause').click()`);
    const beforePauseSwitch=await run(wardrobe, `document.getElementById('preview').toDataURL()`);
    await choose('school'); await waitFor(wardrobe, `!document.getElementById('apply').disabled`);
    assert.notEqual(await run(wardrobe, `document.getElementById('preview').toDataURL()`),beforePauseSwitch,'paused selection must redraw');
    await run(wardrobe, `document.getElementById('pause').click()`);
    for(const theme of ['light','dark']){
      await run(wardrobe,`maiAppearance.apply({theme:'${theme}'})`);
      for(const width of [600,760]){
        wardrobe.setContentSize(width,740);
        await new Promise(resolve=>setTimeout(resolve,120));
        assert.equal(await run(wardrobe,`document.documentElement.scrollWidth<=innerWidth && document.getElementById('preview').getBoundingClientRect().width===192`),true);
        fs.writeFileSync(path.join(output,`wardrobe-${theme}-${width}.png`),(await wardrobe.webContents.capturePage()).toPNG());
      }
    }
    for (const id of ['school', 'home', 'winter']) {
      await choose(id); await waitFor(wardrobe, `!document.getElementById('apply').disabled`);
      assert.notEqual(settings.petWardrobe.outfitId, id, 'preview must not save');
      await run(wardrobe, `document.getElementById('apply').click()`);
      await waitFor(pet, `outfitId === '${id}'`);
      assert.equal(JSON.parse(fs.readFileSync(savedFile)).petWardrobe.outfitId, id);
      assert.deepEqual(pet.getBounds(), position, 'outfit must not move/resize pet');
      assert.equal(settings.marker, 'KEEP');
      await run(wardrobe, `document.getElementById('action').value='outfitPrimary';document.getElementById('action').dispatchEvent(new Event('change'))`);
      await new Promise(resolve => setTimeout(resolve, 950));
      fs.writeFileSync(path.join(output, `${id}.png`), (await wardrobe.webContents.capturePage()).toPNG());
      const contact = await run(wardrobe, `(async()=>{const asset=await MaiPetSprites.load('${id}');const sheet=document.createElement('canvas');sheet.width=192*4;sheet.height=208*8;const output=sheet.getContext('2d');output.fillStyle='#faf9f7';output.fillRect(0,0,sheet.width,sheet.height);const cell=document.createElement('canvas');cell.width=192;cell.height=208;for(let row=0;row<8;row++)for(let col=0;col<4;col++){MaiPetSprites.paint(cell.getContext('2d'),asset,row,col);output.drawImage(cell,col*192,row*208);}return sheet.toDataURL('image/png').split(',')[1]})()`);
      fs.writeFileSync(path.join(output, `${id}-frames.png`), Buffer.from(contact, 'base64'));
      const animated = await run(wardrobe, `(async()=>{const a=await MaiPetSprites.load('${id}');const c=document.createElement('canvas');c.width=192;c.height=208;const p=MaiPetSprites.createPlayer(c.getContext('2d'));p.setAsset(a);p.setAction('outfitPrimary',0,true);p.draw(0);const first=c.toDataURL();p.draw(900);return first!==c.toDataURL()})()`);
      assert.equal(animated, true);
      // Whole-image changes do not establish walking. Check the feet themselves.
      const gait = await run(wardrobe, `(async()=>{
        const asset=await MaiPetSprites.load('${id}');
        const cell=document.createElement('canvas');cell.width=192;cell.height=208;
        const ctx=cell.getContext('2d'), player=MaiPetSprites.createPlayer(ctx);
        const sheet=document.createElement('canvas');sheet.width=768;sheet.height=416;
        const output=sheet.getContext('2d');output.fillStyle='#faf9f7';output.fillRect(0,0,768,416);
        const result={};player.setAsset(asset);
        for(const [direction,name] of ['runRight','runLeft'].entries()){
          const widths=[];player.setAction(name,0,true);
          for(let frame=0;frame<4;frame++){
            player.draw(frame*150+1);output.drawImage(cell,frame*192,direction*208);
            const pixels=ctx.getImageData(0,175,192,28).data;let min=192,max=-1;
            for(let y=0;y<28;y++)for(let x=0;x<192;x++)if(pixels[(y*192+x)*4+3]>128){min=Math.min(min,x);max=Math.max(max,x);}
            widths.push(max-min+1);
          }
          result[name]=widths;
        }
        return {...result,contact:sheet.toDataURL('image/png').split(',')[1]};
      })()`);
      for (const direction of ['runRight', 'runLeft']) {
        const widths = gait[direction];
        assert.ok(widths.every(width => width > 0), `${id}/${direction}: no feet rendered`);
        assert.ok((widths[0]+widths[2]) / (widths[1]+widths[3]) > 1.25,
          `${id}/${direction}: contact/passing foot silhouettes do not alternate: ${widths}`);
      }
      fs.writeFileSync(path.join(output, `${id}-walk.png`), Buffer.from(gait.contact, 'base64'));
      console.log(JSON.stringify({outfit:id, walkingFootWidths:{right:gait.runRight,left:gait.runLeft}}));
    }
    // A queued outfit remains visually unchanged until release.
    await run(pet, `drag={pointerId:9,moved:true,startPoint:{x:0,y:0}}`);
    await choose('school'); await waitFor(wardrobe, `!document.getElementById('apply').disabled`);
    await run(wardrobe, `document.getElementById('apply').click()`);
    await waitFor(pet, `pendingOutfit==='school'`); assert.equal(await run(pet, 'outfitId'), 'winter');
    await run(pet, `finishPointer({pointerId:9})`); await waitFor(pet, `outfitId==='school'`);
    // Failed write is visible, old outfit remains selected, no broadcast.
    failSave = true; await choose('home'); await waitFor(wardrobe, `!document.getElementById('apply').disabled`);
    await run(wardrobe, `document.getElementById('apply').click()`);
    await waitFor(wardrobe, `document.getElementById('status').textContent.includes('未保存')`);
    assert.equal(settings.petWardrobe.outfitId, 'school'); assert.equal(await run(pet, 'outfitId'), 'school'); failSave = false;
    // Rehydrate from disk and reload the real pet renderer.
    settings = JSON.parse(fs.readFileSync(savedFile)); await pet.loadFile(path.join(repo, 'renderer/index.html'));
    await waitFor(pet, `outfitId==='school'`);
    await run(wardrobe, `window.maiWardrobe.set('original')`); await waitFor(pet, `outfitId==='original'`);
    // Actual image request failure disables Apply and leaves persisted choice alone.
    wardrobe.webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => callback({ cancel: details.url.endsWith('/wardrobe/home.png') }));
    await wardrobe.webContents.session.clearCache();
    await wardrobe.loadFile(path.join(repo, 'renderer/wardrobe.html'));
    await waitFor(wardrobe, `document.getElementById('status').textContent.includes('预览不会')`);
    await choose('home');
    await waitFor(wardrobe, `document.getElementById('status').textContent.includes('暂时无法加载')`);
    assert.equal(await run(wardrobe, `document.getElementById('apply').disabled`), true);
    assert.equal(settings.petWardrobe.outfitId, 'original');
    assert.equal(await run(wardrobe,`document.querySelector('[data-outfit="home"] small').textContent`),'素材不可用');
    assert.equal(await run(wardrobe,`document.getElementById('action').disabled && !document.getElementById('retry').hidden`),true);
    wardrobe.webContents.session.webRequest.onBeforeRequest(null);
    await run(wardrobe,`document.getElementById('retry').click()`);
    await waitFor(wardrobe,`!document.getElementById('apply').disabled`);
    failRead=true;
    await wardrobe.reload();
    await waitFor(wardrobe,`document.getElementById('status').textContent.includes('读取失败')`);
    assert.equal(await run(wardrobe,`document.getElementById('apply').disabled && document.getElementById('current-outfit').textContent.includes('尚未读取')`),true);
    failRead=false;
    await run(wardrobe,`document.getElementById('retry').click()`);
    await waitFor(wardrobe,`document.getElementById('current-outfit').textContent.includes('原版装扮')`);
    assert.ok(!errors.some(error => /ReferenceError|TypeError|SyntaxError/.test(error)), errors.join('\n'));
    const avatarWindow=new BrowserWindow({width:1000,height:760,show:false,webPreferences:{preload:path.join(__dirname,'mock-preload.js'),contextIsolation:true,sandbox:true}});
    await avatarWindow.loadFile(path.join(repo,'renderer/chat.html'));
    await run(avatarWindow,`for(const id of ['portrait','agent-portrait','user-avatar'])document.getElementById(id).src='data:image/png;base64,broken'`);
    await waitFor(avatarWindow,`['portrait','agent-portrait','user-avatar'].every(id=>{const image=document.getElementById(id);return image.src.endsWith('avatar-placeholder.svg')&&image.naturalWidth>0;})`);
    await new Promise(resolve=>setTimeout(resolve,200));
    fs.writeFileSync(path.join(output,'avatar-fallback.png'),(await avatarWindow.webContents.capturePage()).toPNG());
    avatarWindow.destroy();
    console.log(JSON.stringify({ ok: true, isolatedUserData: true, nativeMenu: true, productionIPC: true, threeOutfits: true, previewDoesNotSave: true, positionStable: true, animatedFrames: true, dragQueue: true, writeFailureRollback: true, diskReload: true, originalRestored: true, screenshots: output }));
    wardrobe.destroy(); pet.destroy(); app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}
