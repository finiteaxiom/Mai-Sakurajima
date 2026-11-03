'use strict';
// Production Renderer and coordinator, deterministic IPC. No real user data/provider.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const output = process.env.MAI_FEEDBACK_OUTPUT || path.join(os.tmpdir(), 'mai-feedback-evidence');
if (!process.versions.electron) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-feedback-'));
  const env = { ...process.env, APPDATA: temp, MAI_FEEDBACK_ROOT: temp };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, `--user-data-dir=${temp}`],
    { env, stdio: 'inherit', timeout: 60000, windowsHide: true });
  process.exitCode = result.status ?? 1;
} else {
  const { app, BrowserWindow } = require('electron');
  assert.equal(path.resolve(app.getPath('userData')), path.resolve(process.env.MAI_FEEDBACK_ROOT));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    fs.mkdirSync(output, { recursive: true });
    let source = fs.readFileSync(path.join(__dirname, 'mock-preload.js'), 'utf8');
    source = source.replace('let failNextConfigSave = false;', `
let saveDelay=0, sendDelay=0, sendReject, cancelMode='yes', failTest=false;
const counts={save:0,send:0,test:0,cancel:0};
contextBridge.exposeInMainWorld('feedbackTest',{
  saveDelay:v=>{saveDelay=v;},sendDelay:v=>{sendDelay=v;},cancelMode:v=>{cancelMode=v;},
  failTest:()=>{failTest=true;},counts:()=>({...counts})
});
let failNextConfigSave = false;`);
    source = source.replace('saveChatConfig: async (payload) => {', 'saveChatConfig: async (payload) => { counts.save++; if(saveDelay) await new Promise(r=>setTimeout(r,saveDelay));');
    source = source.replace('sendChat: async (input) => {', 'sendChat: async (input) => { counts.send++; if(sendDelay) await new Promise((resolve,reject)=>{sendReject=reject;setTimeout(resolve,sendDelay);});');
    source = source.replace('getChatState: async () =>', `
testChatConnection:async()=>{counts.test++;if(failTest){failTest=false;throw new Error('private-provider-detail');}},
cancelChatRequest:async()=>{counts.cancel++;await new Promise(r=>setTimeout(r,250));if(cancelMode==='error')throw new Error('private-cancel-detail');if(cancelMode==='no')return {cancelled:false};sendReject?.(new Error('cancelled'));return {cancelled:true};},
getChatState: async () =>`);
    const preload = path.join(process.env.MAI_FEEDBACK_ROOT, 'preload.js');
    fs.writeFileSync(preload, source);
    const win = new BrowserWindow({ width:1180,height:820,useContentSize:true,show:false,
      webPreferences:{preload,contextIsolation:true,sandbox:true,backgroundThrottling:false} });
    const errors=[]; const checks=[];
    win.webContents.on('console-message',(_e,level,message)=>{if(level>=3) errors.push(message);});
    const run=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(error){throw new Error('Renderer step failed: '+code+'; console: '+errors.join('; '),{cause:error});}};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    async function check(name,code){assert.equal(await run(code),true,name);checks.push(name);}
    async function capture(name){await wait(160);await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());}
    await win.loadFile(path.join(__dirname,'../renderer/chat.html'));await wait(600);
    await run(`chatConfig.configured=false;showWelcomeMessage();messageInput.value='保留的开场白';void sendMessage();`);
    await check('unconfigured opens model without sending or clearing draft',`!document.getElementById('settings-panel-model').hidden && messageInput.value==='保留的开场白' && feedbackTest.counts().send===0`);
    await capture('first-connection');
    await run(`chatConfig.configured=true;openSettings('companion');customPromptInput.value='延迟保存草稿';customPromptInput.dispatchEvent(new Event('input',{bubbles:true}));feedbackTest.saveDelay(650);void saveSettings();`);
    await check('all submit paths and fields inert',`customPromptInput.inert && saveSettingsButton.inert && testConnectionButton.inert && document.getElementById('discard-settings').inert && clearKeyButton.inert`);
    await run(`document.getElementById('close-settings').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));`);
    await check('busy modal focus loop skips inert controls',`document.activeElement.id!=='close-settings' && !document.activeElement.closest('[inert]')`);
    await run(`void testConnection();void previewGreeting();void previewGirlfriendMessage();void clearApiKey();document.getElementById('discard-settings').click();window.maiSettingsView.select('model');closeSettings();openSettings('companion');customPromptInput.focus();`);
    await check('busy reopen preserves draft and cannot focus locked field',`customPromptInput.value==='延迟保存草稿' && document.activeElement!==customPromptInput && settingsStatus.textContent.includes('正在保存') && feedbackTest.counts().save===1 && feedbackTest.counts().test===0`);
    await capture('saving');await wait(700);
    await check('save unlocks with matching persisted fixture',`!customPromptInput.inert && !window.maiSettingsView.isDirty() && window.maiUiTest.savedConfig().customPrompt==='延迟保存草稿'`);
    await run(`customPromptInput.value='失败保留';customPromptInput.dispatchEvent(new Event('input',{bubbles:true}));window.maiUiTest.failNextSave();void saveSettings();closeSettings();`);await wait(700);
    await run(`openSettings('companion')`);
    await check('failed save draft survives close and reopen',`customPromptInput.value==='失败保留' && window.maiSettingsView.isDirty() && !customPromptInput.inert`);
    await run(`feedbackTest.saveDelay(0);window.maiUiTest.failNextSave();saveSettings()`);
    await check('failure has safe copy and diagnostics',`settingsStatus.textContent.includes('设置未保存') && !settingsStatus.textContent.includes('fixture:') && !!settingsStatus.querySelector('button')`);
    await capture('save-failed');
    await run(`settingsStatus.querySelector('button').click()`);
    await check('diagnostics reachable without dropping draft',`!document.getElementById('settings-panel-diagnostics').hidden && customPromptInput.value==='失败保留'`);
    await run(`feedbackTest.failTest();testConnection()`);
    await check('saved but test failed is distinct',`settingsStatus.textContent.includes('设置已保存，但后续操作未完成') && !settingsStatus.textContent.includes('private-provider') && !window.maiSettingsView.isDirty()`);
    await run(`testConnection()`);
    await check('connection success and welcome refreshed',`settingsStatus.textContent.includes('连接成功') && !document.getElementById('welcome-connect-model')`);
    await run(`closeSettings();feedbackTest.sendDelay(1100);messageInput.value='停止测试';void sendMessage();void sendMessage();`);
    await check('single request with accessible waiting state',`feedbackTest.counts().send===1 && sendButton.textContent==='停止' && document.querySelector('.message--pending').getAttribute('role')==='status'`);
    await run(`void cancelChatUiTurn();void cancelChatUiTurn()`);
    await check('cancelling is not completion',`sendButton.disabled && sendButton.textContent==='取消中…' && !notice.textContent.includes('本次回复已停止')`);
    await wait(350);
    await check('confirmed cancellation restores controls',`notice.textContent.includes('本次回复已停止') && !messageInput.disabled && !document.querySelector('.message--pending') && feedbackTest.counts().cancel===1`);
    await capture('cancelled');
    await run(`feedbackTest.cancelMode('error');feedbackTest.sendDelay(1000);messageInput.value='取消失败';void sendMessage();void cancelChatUiTurn();`);await wait(350);
    await check('cancel failure does not fake completion',`notice.textContent.includes('无法确认停止') && !notice.textContent.includes('private-cancel') && chatTurnCoordinator.getState().busy`);
    await wait(800);
    await check('original reply can finish after cancel failure',`!chatTurnCoordinator.getState().busy && messagesElement.textContent.includes('我在。')`);
    await run(`feedbackTest.cancelMode('no');feedbackTest.sendDelay(900);messageInput.value='已结束';void sendMessage();void cancelChatUiTurn();`);await wait(350);
    await check('rejected cancellation refreshes rather than claims stopped',`notice.textContent.includes('已更新对话记录') && !notice.textContent.includes('本次回复已停止')`);
    await wait(650);
    await run(`feedbackTest.sendDelay(450);window.maiUiTest.failNextChat();messageInput.value='失败的消息';void sendMessage();messageInput.value='后来输入的新草稿';`);await wait(550);
    await check('error never overwrites newer draft or exposes raw details',`messageInput.value==='后来输入的新草稿' && notice.textContent.includes('本次回复未完成') && !notice.textContent.includes('fixture:') && notice.querySelectorAll('button').length===3`);
    await capture('chat-failed');
    await run(`feedbackTest.sendDelay(0);window.maiUiTest.failNextChat();messageInput.value='可重试原文';sendMessage()`);
    await check('failed message restored without auto retry',`messageInput.value==='可重试原文'`);
    const sends=await run('feedbackTest.counts().send');
    await run(`messageInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));messageInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));`);
    assert.equal(await run('feedbackTest.counts().send'),sends);checks.push('IME and Shift+Enter do not submit');
    await run(`messageInput.value='中文多行'+String.fromCharCode(10)+'第二行';resizeInput();`);
    await check('multiline composer bounded',`messageInput.scrollHeight>30 && messageInput.getBoundingClientRect().height<=122`);
    // Existing empty-state controls only focus the real forms; no fabricated data.
    await run(`(async()=>{await openLife();document.getElementById('life-empty').classList.remove('memory-empty--hidden');document.getElementById('empty-life-add').click();})()`);
    await check('empty schedule leads to existing input',`document.activeElement===lifeTitleInput`);
    await run(`(async()=>{closeLife();await openMemory();memoryEmpty.classList.remove('memory-empty--hidden');document.getElementById('empty-memory-add').click();})()`);
    await check('empty memory leads to existing input',`document.activeElement===memoryTextInput`);
    await run(`closeMemory();loadHistory(Array.from({length:60},(_,i)=>({role:'assistant',content:'长中文段落。'.repeat(30)+' https://example.invalid/'+ 'longpath'.repeat(60)})));`);await wait(150);
    await run(`messagesElement.scrollTop=80;messagesElement.dispatchEvent(new Event('scroll'));`);
    const top=await run('messagesElement.scrollTop');
    for(let i=0;i<12;i++){await run(`messagesElement.lastElementChild.querySelector('.bubble').append('连续更新');`);await wait(20);}
    assert.ok(Math.abs(await run('messagesElement.scrollTop')-top)<3);checks.push('presentation updates preserve older reading position');
    await run(`document.getElementById('scroll-latest').click()`);
    await check('return to latest',`messagesElement.scrollHeight-messagesElement.scrollTop-messagesElement.clientHeight<5`);
    for(const theme of ['light','dark']){
      await run(`window.maiAppearance.apply({theme:'${theme}'});`);win.setContentSize(760,680);await wait(150);
      await check(`${theme} feedback actions remain enabled`,`!sendButton.disabled && !sendButton.closest('[inert]') && [...notice.querySelectorAll('button')].every(b=>!b.disabled && !b.closest('[inert]'))`);
      await check(`${theme} narrow long text has no horizontal overflow`,`document.documentElement.scrollWidth<=innerWidth && messagesElement.scrollWidth<=messagesElement.clientWidth+1`);
      await check(`${theme} error notice contrast`, `(()=>{
        const style=getComputedStyle(notice),ctx=document.createElement('canvas').getContext('2d');
        const luminance=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const c=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
        const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
      })()`);
      await capture(`reading-${theme}`);
    }
    const pet=new BrowserWindow({width:310,height:390,useContentSize:true,show:false,webPreferences:{contextIsolation:true,sandbox:true}});
    await pet.loadFile(path.join(__dirname,'../renderer/index.html'));await wait(500);
    assert.match(await pet.webContents.executeJavaScript(`document.getElementById('speech-text').textContent`),/双击.*连接模型/);checks.push('first-run pet points to chat and model');
    fs.writeFileSync(path.join(output,'first-run-pet.png'),(await pet.webContents.capturePage()).toPNG());
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:true,syntheticIPC:true,checks,errors},null,2));
    console.log(JSON.stringify({ok:true,checks:checks.length,output}));app.exit(0);
  }).catch(error=>{console.error(error);app.exit(1);});
}
