# 本地自选头像

Mai 的公开源码和安装包不内置第三方头像素材。使用者可以分别点击麻衣头像或用户头像，主动选择自己有权使用的 JPG 或 PNG 图片。

## 运行边界

- 源图最大 10 MB、2000 万像素；超过 1024×1024 边界时会等比缩小。
- Main Process 将图片转换为 JPEG，并分别保存为 `userData/custom-avatar-mai.jpg` 或 `userData/custom-avatar-user.jpg`。
- 设置只持久化 `custom` 状态，不保存用户原始文件路径。
- Renderer 只能接收 Main Process 生成的本地副本 URL，不能指定任意文件路径。
- 恢复默认头像会删除对应本地副本。
- 头像不会进入 Chat、Work、模型请求、导出文件或 Git 仓库。

## 打包边界

`package.json` 不包含 `assets/avatars/**/*`。发布前必须确认 Git 跟踪文件、源码 ZIP 和 NSIS 安装包均不含第三方头像目录。
