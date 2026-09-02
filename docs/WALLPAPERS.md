# 本地自选壁纸

Mai 的公开源码和安装包不内置壁纸图片。使用者可以在“设置 → 壁纸”中主动选择自己有权使用的 JPG 或 PNG 图片。

## 运行链路

```text
Settings（设置页）
  -> Preload: chat:choose-custom-wallpaper
  -> Main Process 打开原生文件选择器
  -> 验证文件大小、图片格式与像素数
  -> 缩放并转换为 userData/custom-wallpaper.jpg
  -> Renderer 以 cover 方式显示
```

- 源图仅允许 JPG/JPEG/PNG，最大 20 MB。
- 最大解码像素数为 4000 万；超过 3840×2160 边界的图片会等比缩小。
- 应用只持久化 `appearance.wallpaper = "custom"`，不保存用户原始路径。
- Renderer 只接收 Main Process 生成的本地副本 URL，不能指定任意文件路径。
- 点击“移除本地壁纸”会删除该副本并恢复默认背景。
- 壁纸不会进入 Chat、Work、模型请求、导出文件或 Git 仓库。

## 打包边界

`package.json` 不包含 `assets/wallpapers/**/*`。发布前必须确认 Git 跟踪文件、源码 ZIP 和 NSIS 安装包均不含用户壁纸。
