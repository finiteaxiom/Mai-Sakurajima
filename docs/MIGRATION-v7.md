# v6.1 → v7 迁移与兼容记录

v7 公开开发版在首次公开发布前将 appId 调整为 `com.mai.sakurajima.desktop`；`%APPDATA%\Mai Sakurajima`、Schema v16 与既有 Chat、Memory、Voice、Shared Life、Knowledge 和备份文件保持不变。Work 的产品数据与 Chat 数据独立：Project、Workspace 和 WorkSession 保存到 `mai-work.json`，不写入 `mai-pet-memory.json`。

首次加载设置时会增加并规范化：

```json
{
  "agent": {
    "enabled": false,
    "runtime": "mai-agent"
  }
}
```

该设置只控制可选 Action Runtime。`agent.enabled` 默认关闭；早期遗留的 `runtime: "mock"` 在加载和正式执行时规范化为 `mai-agent`，测试替身不会成为正式 Work fallback。未知旧 agent 字段不会成为可执行配置。

若旧 settings 包含历史 `agent.workspacePath`，启动时会在不覆盖既有项目的前提下迁入 `mai-work.json` 的“默认项目”或“迁移的 Work 项目”。在写回 settings 前会保留一次 `mai-pet-deepseek-settings.before-work-projects.backup.json`；保护文件不能创建或与已有副本冲突时，迁移会停止，旧 settings 不会被覆盖。Work 项目成功落盘后若 settings 清理保存失败，下次启动会识别已迁入的项目并继续清理，不会重复创建项目。项目路径不能在运行中的 Work 任务期间切换；它不被迁入 Chat、Memory、Persona 或 relationship state。

`ActionSession` 不写入 `mai-pet-memory.json`，因此不会修改、重建或污染 v16 的长期记忆、Chat sessions 或 `legacyAgentArchive`。`WorkStore` 只保留可恢复的 Work 产品记录和有边界的结果摘要，不保留文件正文、Secret、完整模型上下文或内部事件 trace。

如果 Agent 模块缺失、初始化失败或适配器不可用，Mai 仍以 Companion Runtime 正常启动；用户数据不需回滚。升级前后的备份、损坏 JSON 保留和 v5 旧 Agent 归档规则继续由 [MIGRATION-v6.md](MIGRATION-v6.md) 说明。
