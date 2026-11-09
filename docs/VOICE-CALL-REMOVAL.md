# 全部语音功能移除与备份

2026-11-08：用户在实时通话移除后明确选择继续移除全部语音功能。本说明取代先前保留单次输入、朗读的范围。

## 当前边界

- Chat 和 Work 均使用文字输入。输入框麦克风、通话、自动朗读、声音分析、语音设置、引擎安装及试听入口均已移除。
- Main 不再创建语音服务或注册 `voice:*` IPC；Preload 不再暴露语音 API。Chat 不接收或返回语音专用参数，旧参数不能启用语音或改变文字请求的 token 预算。
- `voice/`、`voice-engine/`（含第三方源码）、语音服务模块、专用测试和语音设置截图从工作区及构建清单移除。
- 窗口不再允许媒体权限。桌宠的文字气泡、聊天取消、会话隔离、长期记忆和 Work 保持原有所有权。
- appId、userData、存储 Schema、API Key、聊天历史与记忆不变。旧 settings 的 voice 字段仅作为不启用的兼容数据保存，不下发 Renderer，保存其他设置也不会改写该字段。
- 不删除工作区之外用户已安装的模型或个人数据。该旧模型目录不再被应用访问。

## 本机备份

备份根目录：`D:\Projects\Mai-voice`，不属于运行时依赖，也不进入安装包。

- `source-before-removal-d039000.zip`、`reference/`：第一次移除前的完整受追踪源码及关键文件。
- `workspace-archive/`、`moved-files.json`：第一次归档的 534 个历史文件，已核对哈希。
- `active-full-removal.txt` 指向本次完整移除的快照目录。其中 `working-tracked-before.zip` 保留修改前的实际受追踪文件，`head-before.zip` 保留提交基线，`preexisting.patch` 记录其他既有改动。
- 本次快照目录的 `removed/` 保存实际移出的全部专用文件和许可证，`removed-manifest.json` 记录逐文件 SHA-256；验证输出与截图也保存在该目录。

历史 UI 报告保留当时结果，旧语音截图已移入备份，不再代表当前产品能力。恢复任何语音功能都必须重新评审生命周期、权限、IPC、数据与 UI，不能直接覆盖当前 Main、Preload 或 Renderer。

## 验证

2026-11-09 完成验证：隔离提交候选与实际工作区的 `npm.cmd test` 均为 322 项通过，迁移、恢复保护和 P0 Chat flow 通过。隔离候选的布局 smoke、31 项操作反馈、68 项页面一致性、真实 Main/Preload 启动、窗口关闭及设置保存失败 smoke 均通过。保存与重启测试确认旧 voice 数据保持原值且不暴露给 Renderer，已检查聊天与设置截图。测试使用隔离数据；真实模型和安装包验收未执行。结果与截图见本次备份目录。
