// Stage A observation harness: production Renderer, synthetic IPC, no provider.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const out = path.join(__dirname, 'evidence');
fs.mkdirSync(out, {recursive:true});
if (!process.versions.electron) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-stage-a-'));
  const env = {...process.env, APPDATA:temp, MAI_STAGE_A_ROOT:temp};
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require(path.join(root,'node_modules/electron')), [__filename,...process.argv.slice(2),`--user-data-dir=${temp}`], {env,stdio:'inherit',windowsHide:true});
  process.exitCode = result.status ?? 1;
} else {
  const {app,BrowserWindow,ipcMain} = require('electron');
  assert.equal(path.resolve(app.getPath('userData')),path.resolve(process.env.MAI_STAGE_A_ROOT));
  const preload = path.join(process.env.MAI_STAGE_A_ROOT,'preload.js');
  let source = fs.readFileSync(path.join(root,'test/mock-preload.js'),'utf8');
  source = source.replace("const { contextBridge }", "const { contextBridge, ipcRenderer }");
  source = source.replace('let failNextConfigSave = false;', `
let auditSendDelay=0, auditSaveDelay=0, auditReject;
contextBridge.exposeInMainWorld('maiAudit', {
  delaySend: value => { auditSendDelay=value; },
  delaySave: value => { auditSaveDelay=value; }
});
contextBridge.exposeInMainWorld('maiWardrobe', {open:()=>ipcRenderer.invoke('audit:wardrobe')});
contextBridge.exposeInMainWorld('maiDiagnostics', {snapshot:async()=>({version:'fixture',memoryMB:0,directory:'isolated-fixture',maxFiles:5,maxFileBytes:2097152,retentionDays:14,counts:{completed:0,failed:0,cancelled:0},writeFailures:0,readFailures:0,dropped:0,records:[]}),reportError:()=>{},openFolder:async()=>{},export:async()=>({cancelled:true})});
let failNextConfigSave = false;`);
  source = source.replace('saveChatConfig: async (payload) => {', 'saveChatConfig: async (payload) => { if(auditSaveDelay) await new Promise(r=>setTimeout(r,auditSaveDelay));');
  source = source.replace('sendChat: async (input) => {', 'sendChat: async (input) => { if(auditSendDelay) await new Promise((resolve,reject)=>{auditReject=reject;setTimeout(resolve,auditSendDelay);});');
  source = source.replace("getChatState: async () =>", "cancelChatRequest: async () => {await new Promise(r=>setTimeout(r,700));auditReject?.(new Error('fixture cancelled'));return {cancelled:true};},\n  getChatState: async () =>");
  fs.writeFileSync(preload, source);
  const wardrobePreload=path.join(process.env.MAI_STAGE_A_ROOT,'wardrobe.js');
  fs.writeFileSync(wardrobePreload,`const {contextBridge}=require('electron');let outfitId='original';contextBridge.exposeInMainWorld('maiWardrobe',{get:async()=>({outfitId}),set:async(id)=>{outfitId=id;return {outfitId};},onChanged:()=>()=>{}});`);
  app.disableHardwareAcceleration();
  app.whenReady().then(async()=>{
    if(process.argv.includes('--first-run')){
      const pet=new BrowserWindow({width:310,height:390,useContentSize:true,show:false,webPreferences:{contextIsolation:true,sandbox:true}});
      await pet.loadFile(path.join(root,'renderer/index.html'));
      await new Promise(r=>setTimeout(r,650));
      const state=await pet.webContents.executeJavaScript(`({speech:document.getElementById('speech-text').textContent,hint:document.getElementById('hint').textContent,fixture:!window.maiPet})`);
      assert.equal(state.fixture,true);assert.match(state.hint,/双击聊天/);assert.match(state.speech,/番茄钟/);
      fs.writeFileSync(path.join(out,'00-first-run-pet.png'),(await pet.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(out,'first-run.json'),JSON.stringify(state,null,2));console.log(JSON.stringify(state));app.exit(0);return;
    }
    let wardrobe;
    ipcMain.handle('audit:wardrobe',async()=>{
      wardrobe=new BrowserWindow({width:900,height:760,useContentSize:true,show:true,webPreferences:{preload:wardrobePreload,contextIsolation:true,sandbox:true}});
      await wardrobe.loadFile(path.join(root,'renderer/wardrobe.html'));
    });
    const win=new BrowserWindow({width:1180,height:820,useContentSize:true,show:true,title:'Mai Stage A — isolated fixture',webPreferences:{preload,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    const errors=[];
    win.webContents.on('console-message',(_e,level,msg)=>{if(level>=3) errors.push(msg);});
    const run=code=>win.webContents.executeJavaScript(code);
    const delay=ms=>new Promise(r=>setTimeout(r,ms));
    const captures=[];
    async function capture(name){await delay(150);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());captures.push(name+'.png');}
    await win.loadFile(path.join(root,'renderer/chat.html'));await delay(600);
    await run(`document.title='Mai Stage A — isolated fixture';chatConfig.configured=false;loadHistory([]);showWelcomeMessage();`);
    if(process.argv.includes('--manual')) return;
    const result={baseline:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),isolation:true,syntheticIPC:true,captures,observations:{}};
    await capture('01-unconfigured');
    await run(`document.getElementById('welcome-connect-model').click()`);await delay(100);
    assert.equal(await run(`document.getElementById('settings-panel-model').hidden`),false);
    await capture('02-model-settings');
    await run(`closeSettings();chatConfig.configured=true;window.maiAudit.delaySend(5000);messageInput.value='阶段 A：等待和取消测试';void sendMessage();`);await delay(200);
    result.observations.sending=await run(`({button:sendButton.textContent,pending:!!document.querySelector('.message--pending'),input:messageInput.value})`);
    await capture('03-sending');
    await run(`sendButton.click()`);await delay(150);
    result.observations.cancelling=await run(`({button:sendButton.textContent,disabled:sendButton.disabled})`);
    await capture('04-cancelling');await delay(900);
    result.observations.cancelled=await run(`({button:sendButton.textContent,messages:messages.textContent,input:messageInput.value,notice:notice.textContent})`);
    await capture('05-cancelled');
    await run(`window.maiAudit.delaySend(0);window.maiUiTest.failNextChat();messageInput.value='阶段 A：失败后可编辑';void sendMessage()`);await delay(250);
    result.observations.failed=await run(`({notice:notice.textContent,input:messageInput.value})`);
    assert.equal(result.observations.failed.input,'阶段 A：失败后可编辑');
    await capture('06-request-failed');
    await run(`openSettings('companion');customPromptInput.value='阶段 A：保留草稿';customPromptInput.dispatchEvent(new Event('input',{bubbles:true}));window.maiUiTest.failNextSave();void saveSettings();`);await delay(250);
    result.observations.saveFailed=await run(`({status:settingsStatus.textContent,draft:customPromptInput.value,dirty:window.maiSettingsView.isDirty()})`);
    assert.equal(result.observations.saveFailed.dirty,true);await capture('07-save-failed');
    await run(`window.maiAudit.delaySave(1000);customPromptInput.value='提交时的版本';customPromptInput.dispatchEvent(new Event('input',{bubbles:true}));void saveSettings();`);await delay(150);
    result.observations.saving=await run(`({buttonDisabled:saveSettingsButton.disabled,fieldDisabled:customPromptInput.disabled,status:settingsStatus.textContent})`);
    await capture('08-saving');
    await run(`customPromptInput.value='保存过程中继续输入的新版本';customPromptInput.dispatchEvent(new Event('input',{bubbles:true}));`);await delay(1200);
    result.observations.saveRace=await run(`({draft:customPromptInput.value,saved:window.maiUiTest.savedConfig().customPrompt,dirty:window.maiSettingsView.isDirty(),status:settingsStatus.textContent})`);
    await capture('09-save-race');
    await run(`window.maiAudit.delaySave(0);closeSettings();chatApp.classList.add('sidebar-collapsed');document.querySelectorAll('.sidebar-group')[0].open=true;`);
    await capture('10-collapsed-navigation');
    await run(`chatApp.classList.remove('sidebar-collapsed');document.querySelectorAll('.sidebar-group')[0].open=true;document.getElementById('life-button').click()`);await delay(200);await capture('11-schedule');
    await run(`document.getElementById('close-life').click();document.querySelectorAll('.sidebar-group')[1].open=true;memoryButton.click()`);await delay(200);await capture('12-memory');
    await run(`document.getElementById('close-memory').click();openSettings('diagnostics');document.getElementById('diagnostics-refresh').click()`);await delay(200);
    result.observations.diagnostics=await run(`document.getElementById('diagnostics-output').textContent`);await capture('13-diagnostics-fixture');
    await run(`closeSettings();document.querySelector('[data-mode-tab="agent"]').click()`);await delay(250);await capture('14-work');
    await run(`document.querySelector('[data-mode-tab="chat"]').click();openSettings('companion');window.maiAppearance.apply({theme:'dark'});`);await capture('15-settings-dark');
    win.setContentSize(760,680);await capture('16-settings-narrow-dark');
    await run(`closeSettings();window.maiAppearance.apply({theme:'light'});workspaceSidebarToggle.click();`);await capture('17-navigation-narrow');
    await run(`document.getElementById('sidebar-wardrobe').click()`);await delay(650);
    assert.ok(wardrobe);fs.writeFileSync(path.join(out,'18-wardrobe.png'),(await wardrobe.webContents.capturePage()).toPNG());captures.push('18-wardrobe.png');
    result.errors=errors;
    fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(result,null,2));
    assert.deepEqual(errors,[]);console.log(JSON.stringify(result));app.exit(0);
  }).catch(err=>{console.error(err);app.exit(1);});
}
