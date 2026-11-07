'use strict';
// Code-owned neutral brand mark; no external portrait or image input.
const fs = require('node:fs');
const path = require('node:path');
if (!process.versions.electron) {
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], {env, stdio:'inherit', windowsHide:true});
  process.exitCode = result.status ?? 1;
} else {
  const {app, BrowserWindow} = require('electron');
  app.whenReady().then(async () => {
    const win = new BrowserWindow({show:false, webPreferences:{sandbox:true}});
    await win.loadURL('data:text/html,<html></html>');
    const sizes=[16,20,24,32,40,48,64,128,256,512];
    const data = await win.webContents.executeJavaScript(`(${JSON.stringify(sizes)}.map(size=>{
      const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.scale(size/256,size/256);
      x.fillStyle='#70578e';x.beginPath();x.roundRect(0,0,256,256,56);x.fill();
      x.strokeStyle='#ffffff';x.lineWidth=22;x.lineCap='round';x.lineJoin='round';
      x.beginPath();x.moveTo(68,185);x.lineTo(68,71);x.lineTo(128,143);x.lineTo(188,71);x.lineTo(188,185);x.stroke();
      return c.toDataURL('image/png').split(',')[1];}))`);
    const images=data.map(item=>Buffer.from(item,'base64'));
    const png=images.pop(), root=path.resolve(__dirname,'../assets');
    for(const name of ['mai-icon.png','mai-profile.png'])fs.writeFileSync(path.join(root,name),png);
    const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
    let offset=header.length;
    images.forEach((buffer,i)=>{const p=6+i*16;header[p]=header[p+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buffer.length,p+8);header.writeUInt32LE(offset,p+12);offset+=buffer.length;});
    fs.writeFileSync(path.join(root,'mai-icon.ico'),Buffer.concat([header,...images]));
    win.destroy();app.quit();
  }).catch(error=>{console.error(error);app.exit(1);});
}
