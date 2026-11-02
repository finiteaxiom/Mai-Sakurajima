const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
if(!process.versions.electron){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mai-stage-a-design-'));const env={...process.env,APPDATA:root};delete env.ELECTRON_RUN_AS_NODE;
 const r=require('node:child_process').spawnSync(require('../../../node_modules/electron'),[__filename,`--user-data-dir=${root}`],{env,stdio:'inherit',windowsHide:true});process.exitCode=r.status??1;
}else{
 const {app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();
 app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1180,height:820,useContentSize:true,show:false,webPreferences:{contextIsolation:true,sandbox:true}});const errors=[];w.webContents.on('console-message',(_e,l,m)=>{if(l>=3)errors.push(m)});
 await w.loadFile(path.join(__dirname,'states.html'));const run=c=>w.webContents.executeJavaScript(c);const report={ok:false,checks:[],errors};
 for(const theme of ['light','dark'])for(const [width,height] of [[1180,820],[760,680]]){
 w.setContentSize(width,height);await run(`document.getElementById('theme').value='${theme}';document.getElementById('theme').dispatchEvent(new Event('change'))`);
 for(const scene of await run(`scenes.map(s=>s[0])`)){
 await run(`show('${scene}')`);await new Promise(r=>setTimeout(r,35));
 assert.equal(await run(`document.documentElement.scrollWidth<=innerWidth`),true,`${theme}/${width}/${scene}`);
 assert.equal(await run(`!!document.getElementById('screen').textContent.trim() && document.querySelectorAll('[aria-current]').length===1`),true);
 report.checks.push({theme,width,height,scene});
 }
 await run(`show('save-failed')`);await new Promise(r=>setTimeout(r,180));await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);fs.writeFileSync(path.join(__dirname,'evidence',`proposal-${theme}-${width}.png`),(await w.webContents.capturePage()).toPNG());
 }
 await run(`show('waiting');document.getElementById('primary').click()`);assert.equal(await run(`selected`),'cancelling');
 await run(`show('save-failed');document.getElementById('diagnostics').click()`);assert.match(await run(`document.getElementById('interaction').textContent`),/脱敏诊断/);
 await run(`document.getElementById('primary').click()`);assert.equal(await run(`selected`),'saved');
 assert.deepEqual(errors,[]);report.ok=true;report.interactions=true;fs.writeFileSync(path.join(__dirname,'design-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,scenarios:report.checks.length,interactions:true,errors}));app.exit(0);
 }).catch(e=>{console.error(e);app.exit(1)});
}
