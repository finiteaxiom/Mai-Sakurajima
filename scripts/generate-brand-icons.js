// 从已确认的兔头原稿导出应用 PNG 与 Windows 多尺寸 ICO，供构建使用。
'use strict';
// Preserve the approved artwork; only resize and encode. User avatars are untouched.
const fs = require('node:fs');
const path = require('node:path');
if (!process.versions.electron) {
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], {env, stdio:'inherit', windowsHide:true});
  process.exitCode = result.status ?? 1;
} else {
  const {app, nativeImage} = require('electron');
  app.whenReady().then(async () => {
    const root=path.resolve(__dirname,'../assets');
    const source=nativeImage.createFromPath(path.join(root,'branding','mai-rabbit-approved.png'));
    const sourceSize=source.getSize();
    if(source.isEmpty() || sourceSize.width!==sourceSize.height || sourceSize.width<512) {
      throw new Error('Approved icon source must be a square PNG of at least 512 pixels.');
    }
    const sizes=[16,20,24,32,40,48,64,128,256,512];
    const images=sizes.map(size=>source.resize({width:size,height:size,quality:'best'}).toPNG());
    fs.writeFileSync(path.join(root,'mai-icon.png'),images.pop());
    const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
    let offset=header.length;
    images.forEach((buffer,i)=>{const p=6+i*16;header[p]=header[p+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buffer.length,p+8);header.writeUInt32LE(offset,p+12);offset+=buffer.length;});
    fs.writeFileSync(path.join(root,'mai-icon.ico'),Buffer.concat([header,...images]));
    console.log('Generated mai-icon.png (512px) and mai-icon.ico (16–256px) from approved rabbit artwork.');
    app.quit();
  }).catch(error=>{console.error(error);app.exit(1);});
}
