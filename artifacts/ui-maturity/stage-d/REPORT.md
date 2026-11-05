# 阶段 D 验证报告

日期：2026-11-05。基线：`5d5a939f8f371d853e6dd58d9227e2bfde32994b`。

## 实现

- 新增 [展示规范](../../../docs/CHARACTER-DISPLAY.md)，分开记录头像、桌宠、衣橱缩略图与动作预览的尺寸和裁切规则。
- 衣橱大预览从宽窗 240×260、窄窗 192×208 统一到 192×208 CSS px，保持内部 canvas 原尺寸。桌宠仍为既有 240×260 CSS px，不改变窗口大小和位置。
- 当前穿着与正在预览分别标注；加载时隐藏旧画面但保留占位，动作按钮随加载状态禁用。暂停后切换服装或动作立即显示新首帧。
- 当前穿着读取失败时明确显示未知并禁止保存，提供重试；素材失败提示不再被 refresh 覆盖，重试后恢复缩略图与预览。
- 增加头像缺失/解码失败的中性 SVG 回退，不改用户设置或本地图片，不添加外部头像依赖。Chat、Work、消息、朋友圈、通话和生活陪伴头像复用该处理。
- 人物 PNG、JSON 坐标、动作目录和播放器未改动；原版与三套 Q 版素材保留。Live2D 制作未恢复。

## 执行与隔离

从暂存区导出候选目录验证，不混入工作区既有 package.json、测试清理、README 或历史文档改动。候选使用本机依赖联接和隔离 APPDATA；衣橱 smoke 另外创建临时 userData 与实际设置文件。未调用真实模型或修改正式数据。

| 命令 | 结果 |
| --- | --- |
| `npm.cmd test` | 345 项通过；迁移、恢复保护与 P0 Chat flow smoke 通过，见 `business-tests.txt` |
| `node test/pet-wardrobe-smoke.js` | 通过，见 `wardrobe-smoke.txt`；真实窗口管理 / preload / IPC / PNG / JSON / 磁盘设置组合 |
| `node test/ui-redesign-smoke.js` | 通过，见 `ui-smoke.txt` 与 `regression/`；Chat / Work、设置、头像入口、焦点与多尺寸回归 |
| `node test/packaged-ui-smoke-runner.js node_modules/electron/dist/electron.exe` | 通过；开启保存失败检查，见 `main-smoke.txt`；属于源码 Electron 运行 |
| `node test/packaged-chat-close-smoke-runner.js node_modules/electron/dist/electron.exe` | 通过；窗口销毁与释放，见 `close-smoke.txt` |

衣橱检查包含：预览不保存、三套应用、原版恢复、窗口 bounds 不变、拖动期间排队、保存失败回滚、磁盘重载、实际图片请求失败及重试、当前状态读取失败及重试、暂停切换、浅/深色 600/760 内容宽度无横向溢出、三个头像实际解码失败后加载回退。日志中的 `fixture disk failure` / `fixture read failure` 是故障注入的预期输出。

## 视觉与动作证据

本机 Electron screen 实测 `scaleFactor=1.5`，显示器 DIP bounds 为 1707×1067，工作区 1707×1019；Renderer DPR 为 1.5。衣橱初始内容 bounds 为 746×743，另检查 600×740 与 760×740。没有用修改 viewport 冒充不同系统 DPI；未获取独立物理显示模式，因此不将 DIP 换算值作为物理分辨率证据。

- `screenshots/wardrobe-{light,dark}-{600,760}.png`：自然尺寸 UI、当前/预览分离、明暗对比与完整操作入口。
- `screenshots/avatar-fallback.png`：损坏头像回退；已等待重绘后截图。
- `screenshots/{original,school,home,winter}-actions.png`：真实播放器推进时间生成的接触表。八行依次为待机、挥手、右行、左行、摸头回应、困倦、专属一、专属二；每行八个采样。逐一复核了发夹、眼睛、脚底与道具姿态，没有因为画布大小改变而裁掉角色。
- `screenshots/{school,home,winter}-walk.png`：左右各四帧，检查跨步、屈膝经过、反腿跨步、另一腿经过。脚部宽度分别为校服 `[93,25,96,26]`、居家 `[107,35,116,35]`、冬装 `[96,29,101,33]`，左右一致。接触表确认腿部轮廓交替，不仅是全图哈希不同。
- 原版接触表左右行走为八个不同姿态，腿部摆动与脚尖方向可见。校服读书/领结、居家喝茶/伸展、冬装围巾/暖手以及原版学习/发呆均保留原动作。

自动化推进时间和接触表阅读验证播放路径与姿态；未声称进行手动原生鼠标操作或新一轮用户审美验收。有限帧素材仍有固有姿态和线条差异，预览缩小不能重新生成眼睛细节，也不代表四套比例被重新统一。

## 后续与 Git 范围

多屏、100% / 125% 等其他系统 DPI、原生人工操作、真实语音与 NSIS 安装升级留待阶段 E。本轮没有安装包。原有无关工作保留；候选路径 `.local.txt` 不提交。提交及远程 SHA 在最终回复与 Git 历史核对。
