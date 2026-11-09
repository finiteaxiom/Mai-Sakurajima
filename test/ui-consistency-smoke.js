'use strict';
// Real Renderer modules with isolated, synthetic IPC. No real documents, timers or model calls.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const output = process.env.MAI_CONSISTENCY_OUTPUT || path.join(os.tmpdir(), 'mai-consistency');
if (!process.versions.electron) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-consistency-'));
  const env = {...process.env, APPDATA:root, MAI_CONSISTENCY_ROOT:root}; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, `--user-data-dir=${root}`], {env,stdio:'inherit',timeout:90000,windowsHide:true});
  process.exitCode = result.status ?? 1;
} else {
  const {app,BrowserWindow} = require('electron');
  assert.equal(path.resolve(app.getPath('userData')),path.resolve(process.env.MAI_CONSISTENCY_ROOT));
  app.disableHardwareAcceleration();
  app.whenReady().then(async()=>{
    fs.mkdirSync(output,{recursive:true});
    let source = fs.readFileSync(path.join(__dirname,'mock-preload.js'),'utf8');
    source = source.replace('const now =', `
let timerFixture={active:false,endAt:0}, failTimer=false, timerCalls=0;
const knowledgeFixture={libraries:[{id:'local',name:'本地资料',privacy:'local'},{id:'locked',name:'私人资料',privacy:'locked'}],documents:[{id:'doc',title:'示例笔记',libraryId:'local',status:'ready',characterCount:12}],summary:{documents:1,libraries:2}};
contextBridge.exposeInMainWorld('consistencyTest',{failTimer:()=>{failTimer=true;},timerCalls:()=>timerCalls});
contextBridge.exposeInMainWorld('maiDiagnostics',{snapshot:async()=>({version:'fixture',memoryMB:1,directory:'isolated',maxFiles:5,maxFileBytes:2097152,retentionDays:14,counts:{completed:0,failed:0,cancelled:0},records:[]}),reportError:()=>{},openFolder:async()=>{},export:async()=>({cancelled:true})});
const now =`);
    source=source.replace('getKnowledgeState: async () => ({ libraries: [], documents: [], stats: {} }),', 'getKnowledgeState: async () => knowledgeFixture, refreshKnowledge:async()=>({state:knowledgeFixture}), updateKnowledgeDocument:async(id,patch)=>{await new Promise(r=>setTimeout(r,80));Object.assign(knowledgeFixture.documents.find(d=>d.id===id),patch);return knowledgeFixture;},');
    source=source.replace("getTimerState: async () => ({ active: false, remainingMs: 0, label: '番茄钟', mode: 'study' }),", `getTimerState:async()=>timerFixture,
startTimer:async payload=>{timerCalls++;await new Promise(r=>setTimeout(r,900));if(failTimer){failTimer=false;throw new Error('测试计时失败');}return timerFixture={active:true,endAt:Date.now()+payload.minutes*60000,label:payload.label,mode:payload.mode};},
cancelTimer:async()=>{timerCalls++;await new Promise(r=>setTimeout(r,900));if(failTimer){failTimer=false;throw new Error('测试取消失败');}return timerFixture={active:false,endAt:0};},`);
    const preload=path.join(process.env.MAI_CONSISTENCY_ROOT,'preload.js');fs.writeFileSync(preload,source);
    const errors=[],checks=[],screenshots=[];
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    async function make(page,width=1180,height=820){const win=new BrowserWindow({width,height,useContentSize:true,show:false,webPreferences:{preload,contextIsolation:true,sandbox:true,backgroundThrottling:false}});win.webContents.on('console-message',(_e,l,m)=>{if(l>=3)errors.push(`${page}: ${m}`)});await win.loadFile(path.join(__dirname,`../renderer/${page}.html`));await wait(450);return win;}
    const run=(win,code)=>win.webContents.executeJavaScript(code,true);
    async function check(win,name,code){assert.equal(await run(win,code),true,name);checks.push(name);}
    async function capture(win,name){await wait(150);await run(win,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());screenshots.push(name+'.png');}
    async function theme(win,value){await run(win,`window.maiAppearance.apply({theme:'${value}',motion:'off'});`);await wait(100);}
    async function contrast(win,name,selector){await check(win,name,`(()=>{const el=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(el),ctx=document.createElement('canvas').getContext('2d');const lum=v=>{ctx.fillStyle=v;ctx.fillRect(0,0,1,1);const c=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const a=lum(s.color),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;})()`);}
    const chat=await make('chat');
    for(const t of ['light','dark']){
      await theme(chat,t);
      await run(chat,`chatApp.classList.add('sidebar-collapsed');document.querySelectorAll('.sidebar-group').forEach(g=>g.open=true)`);
      await check(chat,`${t} compact groups readable and children concealed`,`[...document.querySelectorAll('.sidebar-group')].every(g=>getComputedStyle(g.querySelector('summary')).whiteSpace==='nowrap' && g.querySelector('div').getClientRects().length===0)`);
      await capture(chat,`navigation-${t}`);
      for(let i=0;i<2;i++){
        await run(chat,`chatApp.classList.add('sidebar-collapsed');document.querySelectorAll('.sidebar-group summary')[${i}].click()`);
        await check(chat,`${t} group ${i} expands full navigation`,`!chatApp.classList.contains('sidebar-collapsed') && document.querySelectorAll('.sidebar-group')[${i}].open`);
      }
      const pages=[['memory-button','memory-overlay','close-memory'],['life-button','life-overlay','close-life'],['shared-life-button','shared-life-overlay','close-shared-life'],['moments-button','moments-overlay','close-moments']];
      for(const [button,overlay,close] of pages){
        await run(chat,`document.getElementById('${button}').focus();document.getElementById('${button}').click()`);await wait(150);
        await check(chat,`${t} ${overlay} owns focus`,`document.getElementById('${overlay}').contains(document.activeElement) && chatApp.inert`);
        await capture(chat,`${overlay}-${t}`);
        await run(chat,`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await wait(40);
        await check(chat,`${t} ${overlay} restores opener`,`document.getElementById('${overlay}').inert && document.activeElement===document.getElementById('${button}')`);
      }
      await run(chat,`openSettings('model')`);await capture(chat,`model-settings-${t}`);
      await run(chat,`window.maiSettingsView.select('diagnostics');document.getElementById('diagnostics-refresh').click()`);await wait(80);await capture(chat,`diagnostics-${t}`);
      await check(chat,`${t} diagnostics readable`,`document.getElementById('diagnostics-output').textContent.includes('fixture')`);
      await run(chat,`closeSettings();document.querySelector('[data-mode-tab="agent"]').click()`);await wait(100);
      await run(chat,`document.getElementById('work-inspector-toggle').click()`);await wait(100);await capture(chat,`work-explorer-${t}`);
      await check(chat,`${t} Work drawer focus`,`document.getElementById('action-context').contains(document.activeElement)`);
      await run(chat,`document.getElementById('work-details-tab').click()`);await capture(chat,`work-details-${t}`);
      await run(chat,`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));document.querySelector('[data-mode-tab="chat"]').click()`);
    }
    // Avatar selection intentionally replaces Settings; closing releases both hidden surfaces.
    await run(chat,`openSettings('appearance');document.getElementById('user-avatar-button').click()`);await wait(100);
    await check(chat,'avatar above settings owns focus',`avatarPickerOverlay.contains(document.activeElement) && settingsOverlay.inert`);
    await run(chat,`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await wait(60);
    await check(chat,'avatar close releases main and keeps hidden settings inert',`settingsOverlay.classList.contains('overlay--hidden') && settingsOverlay.inert && avatarPickerOverlay.inert && !chatApp.inert`);
    await run(chat,`closeSettings()`);
    const assistant=await make('assistant');
    for(const t of ['light','dark']){
      await theme(assistant,t);
      for(const tab of ['today','calendar','focus','promises','usage','knowledge','settings']){
        await run(assistant,`document.querySelector('[data-tab="${tab}"]').click()`);await wait(60);
        await check(assistant,`${t} assistant ${tab} layout`,`document.querySelector('[data-tab="${tab}"]').getAttribute('aria-current')==='page' && document.documentElement.scrollWidth<=innerWidth`);
        await capture(assistant,`assistant-${tab}-${t}`);
      }
      await contrast(assistant,`${t} assistant primary contrast`,'#assistant-settings-form .button--primary');
      await check(assistant,`${t} knowledge text uses theme colors`,`(()=>{const meta=getComputedStyle(document.querySelector('#document-list .item-meta')), summary=getComputedStyle(document.querySelector('.editor-details summary')); const probe=document.createElement('span');document.body.appendChild(probe);probe.style.color='var(--mai-text-secondary)';const secondary=getComputedStyle(probe).color;probe.style.color='var(--mai-accent)';const accent=getComputedStyle(probe).color;probe.remove();return meta.color===secondary && summary.color===accent;})()`);
      await run(assistant,`selectTab('knowledge');document.querySelector('#document-list button').focus();document.querySelector('#document-list button').click()`);await wait(60);
      await check(assistant,`${t} real knowledge item opens modal`,`document.querySelectorAll('#document-list .item-card').length===1 && document.querySelector('.app-shell').inert && !document.getElementById('knowledge-move-dialog').inert`);
      await run(assistant,`document.querySelector('#knowledge-move-form button[type="submit"]').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`);
      await check(assistant,`${t} move dialog Tab wraps`,`document.activeElement.id==='knowledge-move-close'`);
      await run(assistant,`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}))`);
      await check(assistant,`${t} move dialog Shift Tab wraps`,`document.activeElement.matches('#knowledge-move-form button[type="submit"]')`);
      await capture(assistant,`knowledge-move-${t}`);
      await contrast(assistant,`${t} move close contrast`,'#knowledge-move-close');
      await check(assistant,`${t} move description readable`,`getComputedStyle(document.getElementById('knowledge-move-description')).color===getComputedStyle(document.querySelector('#document-list .item-meta')).color`);
      await run(assistant,`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await wait(80);
      await check(assistant,`${t} move cancel restores focus`,`document.getElementById('knowledge-move-dialog').inert && !document.querySelector('.app-shell').inert && document.activeElement===document.querySelector('#document-list button')`);
      await run(assistant,`document.querySelector('#document-list button').click()`);await wait(60);
      await run(assistant,`var select=document.getElementById('knowledge-move-select');select.value=select.value==='local'?'locked':'local';document.querySelector('#knowledge-move-form button[type="submit"]').click()`);await wait(200);
      await check(assistant,`${t} successful move restores rebuilt button`,`document.getElementById('knowledge-move-dialog').inert && document.activeElement===document.querySelector('#document-list button') && !document.activeElement.disabled`);
    }
    const timer=await make('timer',520,700);
    for(const t of ['light','dark']){await theme(timer,t);await contrast(timer,`${t} timer primary contrast`,'#start-button');await capture(timer,`timer-idle-${t}`);}
    await run(timer,`document.getElementById('start-button').click()`);await wait(620);
    await check(timer,'timer render tick cannot reenable pending operation',`document.getElementById('start-button').disabled && document.getElementById('cancel-button').disabled && [...document.querySelectorAll('#presets button')].every(b=>b.disabled) && consistencyTest.timerCalls()===1`);
    await capture(timer,'timer-starting');await wait(400);
    await check(timer,'active timer locks preset and fields',`document.getElementById('cancel-button').disabled===false && document.getElementById('minutes').disabled && [...document.querySelectorAll('#presets button')].every(b=>b.disabled)`);
    await run(timer,`consistencyTest.failTimer();document.getElementById('cancel-button').click()`);await wait(620);
    await check(timer,'pending cancel stays locked across tick',`document.getElementById('cancel-button').disabled`);await wait(400);
    await check(timer,'cancel failure preserves active timer',`!document.getElementById('cancel-button').disabled && document.getElementById('start-button').disabled && document.getElementById('notice').textContent.includes('测试取消失败')`);
    await capture(timer,'timer-failed');await run(timer,`document.getElementById('cancel-button').click()`);await wait(1000);
    await check(timer,'cancel success restores selection',`!document.getElementById('start-button').disabled && document.querySelectorAll('#presets button[aria-pressed="true"]').length===1`);
    await run(timer,`consistencyTest.failTimer();document.getElementById('start-button').click()`);await wait(1000);
    await check(timer,'start failure restores controls',`!document.getElementById('start-button').disabled && !document.getElementById('minutes').disabled`);
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:true,syntheticIPC:true,checks,screenshots,errors},null,2));console.log(JSON.stringify({ok:true,checks:checks.length,output}));app.exit(0);
  }).catch(e=>{console.error(e);app.exit(1)});
}
