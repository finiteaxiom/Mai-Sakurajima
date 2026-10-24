'use strict';
// Production diagnostics IPC/logger/UI with synthetic Chat APIs and isolated userData.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-diag-smoke-'));
  const { spawnSync } = require('node:child_process');
  try {
    const env = { ...process.env, MAI_DIAGNOSTIC_SMOKE_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
    const r = spawnSync(require('electron'), [__filename, `--user-data-dir=${root}`], { env, encoding:'utf8', timeout:60000, windowsHide:true });
    process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
    if(r.status !== 0) throw r.error || new Error(`diagnostics smoke exit ${r.status}`);
  } finally { fs.rmSync(root, {recursive:true,force:true}); }
} else {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const { RuntimeDiagnostics } = require('../runtime-diagnostics');
  const { registerDiagnosticsIpc } = require('../diagnostics-ipc');
  const root = process.env.MAI_DIAGNOSTIC_SMOKE_ROOT;
  assert.equal(path.resolve(app.getPath('userData')), path.resolve(root));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const logger = new RuntimeDiagnostics({ directory:path.join(root,'logs','runtime') });
    try { await logger.span('ipc','chat:send',()=> logger.span('model','generate',async()=>{throw Object.assign(new Error('SECRET_PROMPT'),{code:'request_timeout'});})); } catch {}
    let opened = '', cancelExport = false;
    const exportPath=path.join(root,'diagnostics.json');
    registerDiagnosticsIpc({ ipcMain, app, diagnostics:logger, rendererDirectory:path.join(__dirname,'../renderer'),
      shell:{openPath:async p=>{opened=p;return '';}}, dialog:{showSaveDialog:async()=> cancelExport ? {canceled:true} : {filePath:exportPath}} });
    const preload=path.join(root,'preload.cjs');
    fs.writeFileSync(preload, `require(${JSON.stringify(path.join(__dirname,'mock-preload.js'))});\nconst {contextBridge,ipcRenderer}=require('electron');\ncontextBridge.exposeInMainWorld('maiDiagnostics',{snapshot:()=>ipcRenderer.invoke('diagnostics:snapshot'),openFolder:()=>ipcRenderer.invoke('diagnostics:open-folder'),export:()=>ipcRenderer.invoke('diagnostics:export'),reportError:kind=>ipcRenderer.send('diagnostics:renderer-error',kind)});`);
    const win=new BrowserWindow({width:1180,height:850,show:false,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:false}});
    await win.loadFile(path.join(__dirname,'../renderer/chat.html'));
    const run=code=>win.webContents.executeJavaScript(code);
    const waitFor=async expression=>{for(let i=0;i<80;i++){if(await run(expression))return; await new Promise(r=>setTimeout(r,50));} throw new Error('UI did not settle: '+expression);};
    await run(`document.getElementById('settings-button').click(); document.getElementById('diagnostics-refresh').click();`);
    await waitFor(`document.getElementById('diagnostics-output').textContent.includes('request_timeout')`);
    assert.ok((await run(`document.getElementById('diagnostics-output').textContent`)).includes(logger.directory));
    await run(`document.getElementById('diagnostics-folder').click()`); await waitFor(`!document.getElementById('diagnostics-folder').disabled`); assert.equal(opened,logger.directory);
    await run(`document.getElementById('diagnostics-export').click()`); await waitFor(`!document.getElementById('diagnostics-export').disabled`);
    const exported=fs.readFileSync(exportPath,'utf8'); assert.doesNotMatch(exported,/SECRET_PROMPT/); assert.equal(JSON.parse(exported).directory,undefined);
    cancelExport=true; await run(`document.getElementById('diagnostics-export').click()`); await waitFor(`document.getElementById('diagnostics-output').textContent.includes('已取消导出')`);
    await run(`document.getElementById('diagnostics-refresh').click()`); await waitFor(`document.getElementById('diagnostics-output').textContent.includes('request_timeout')`);
    assert.equal(await run(`getComputedStyle(document.getElementById('diagnostics-output')).whiteSpace`),'pre-wrap');
    console.log(JSON.stringify({ok:true,isolatedUserData:true,realDiagnosticsIPC:true,uiRefresh:true,export:true,cancelExport:true,folderTarget:true,chatAndDialogs:'synthetic fixtures; no paid API or production user data'}));
    win.destroy(); app.exit(0);
  }).catch(e=>{console.error(e); app.exit(1);});
}
