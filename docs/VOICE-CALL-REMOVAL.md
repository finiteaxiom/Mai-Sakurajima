# 实时语音通话移除与备份

2026-11-08：按用户决定移除实时语音通话，归档旧实现。单次语音输入、语气分析、回复朗读和语音设置继续保留。

## 当前边界

- Chat 页面没有通话按钮、通话面板、持续收听循环或通话分句播放队列。
- Main / Preload 不再发送或订阅 `chat:voice-stream-delta`；Chat 轮次协调器只管理请求、取消与视图身份。
- 单次输入仍走 `voice:listen`，得到文本后使用既有 Chat 调用链；收到最终回复后朗读，不自动重新开始收听。
- `voice-service.js`、`voice-ipc.js`、`local-tts-service.js`、`voice-emotion.js`、`voice/` 和 `voice-engine/` 是单次输入与朗读的共享依赖，继续参与构建。不能因名称含 voice 而移动它们。
- 不修改 appId、userData、存储 Schema、既有语音设置、API Key、聊天历史、记忆或备份；不卸载用户本机的语音模型。

## 备份与历史记录

本机备份目录：`D:\Projects\Mai-voice`，不属于 Mai 运行时依赖，也不进入安装包。

- `source-before-removal-d039000.zip`：移除前提交 `d039000` 的完整受追踪源码快照，包含共享依赖、配置、许可证及测试。
- `reference/`：便于阅读的旧通话实现与测试；只用于对照，不应直接覆盖当前工作区。
- `workspace-archive/`：从工作区移走的旧通话截图、旧 Chat HTML 及 `logs/publish-candidate-20261027` 历史候选源码快照。整份历史候选一同归档，以免只移动其通话文件导致快照不完整。
- `moved-files.json`：移动前后逐文件校验记录。

阶段 A–E 的历史验收报告保持原文，其中 `voice-presentation.png` 等路径表示当时的证据位置。相应文件现位于上述 `workspace-archive/` 下的同名相对路径；历史通话检查不代表当前产品仍有此能力。Git 历史也保留原记录。

旧通话专用 `test/smoke-voice-ui.js` 退出当前测试目录。语音设置、单次输入、朗读、Chat 取消和会话隔离的测试继续保留。

## 验证范围

已在隔离目录验证暂存候选源码：`npm.cmd test` 的 342 项测试及迁移、恢复保护、P0 Chat smoke 均通过；`test/ui-redesign-smoke.js`、`test/ui-feedback-smoke.js`（31 项检查）、`test/packaged-ui-smoke-runner.js`（开发 Electron）与 `test/packaged-chat-close-smoke-runner.js`（开发 Electron）均通过。UI 检查确认通话入口已移除、单次语音输入保留，生产数据的 7 个受保护路径未改变。归档的 534 个文件已逐个核对 SHA-256。验证日志与截图保存在备份目录的 `verification/` 下。真实模型、麦克风、扬声器和重新安装包验收未执行。

日后恢复需重新评审通话生命周期与数据边界，不能把整个旧 `main.js`、`preload.js` 或 `renderer/chat.js` 复制回现有版本。
