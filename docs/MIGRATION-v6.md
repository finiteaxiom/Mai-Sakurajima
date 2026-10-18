# v5 → v6 迁移与兼容记录

本文是历史与兼容性文档，不是当前模块架构说明。当前数据模型见 [MEMORY-AND-DATA.md](MEMORY-AND-DATA.md)。

## 保持稳定的用户数据边界

- 当时的 appId：`com.mai.sakurajima.desktop`
- productName：`Mai Sakurajima`
- userData：`%APPDATA%\\Mai Sakurajima`
- settings、DeepSeek API Key 的安全存储路径、Chat、记忆、朋友圈、知识、日程与备份

因此可以先退出旧版，再覆盖安装 v6。升级不得删除聊天记录、长期记忆、生活数据、知识索引、设置、API Key 或备份。

## 当前 v16 迁移行为

启动时，Main 读取 `mai-pet-memory.json` 并以当前的 `normalizeMemoryState()` 规范已知字段。只有已存储的 `version` 小于当前 Schema v16 时，才会在同一数据目录创建一次：

```text
mai-pet-memory.before-v16-from-v<旧版本>.backup.json
```

之后写出 v16。该备份文件若已经存在且字节与源文件一致，不会在重复启动时被覆盖；若同名备份与源数据不同，或无法创建/验证备份，升级会失败并保留原始 Memory 文件。旧版本低于历史阈值时，当前兼容路径会按需要重建早期 facts、shared life、life hub 与 continuity 派生数据；这不是每次启动都会运行的操作。

规范化是增量兼容：保留 sessions、facts、history、memoryCorrections、episodes、topicThreads、timeline、people、projects、habits、lifeItems、moments、`legacyAgentArchive` 和未知顶层字段；不会通过清空数据库重建用户数据。canonical key 冲突会保留原 fact id，只把非优先版本标记为 historical。

无法解析的 Memory JSON 会先按原始字节保存为 `mai-pet-memory.unreadable-*.backup.json`，之后才恢复规范空状态；Settings、Knowledge 和 Work 的损坏数据也遵循先保护原文、后恢复的顺序。保护或安全写回失败时，Mai 会中止本次启动，不会把源文件当成空数据覆盖。

## 历史演进

- **v5 → v6**：旧 Agent 会话迁入只读 `legacyAgentArchive`。它们不再出现在 UI、Prompt、模型上下文或执行流程；不会自动重放或恢复运行。
- **v14**：引入对旧 `agentSessions` 的归档兼容，并保留迁移前数据。
- **v15**：增强事实记忆的 canonical key、evidence trail、历史版本、分层召回与健康检查。
- **v16**：加入受限、证据驱动的 `behaviorPatterns` 与人格连续性相关的规范化。`mind`、`relationship`、sessions 和 assistant 的当前状态边界见数据文档，不应被理解为一次性重建数据。

运行设置中的旧 `settings.agent` 以及已退役的 outfit / affection 设置会在设置加载时移除；这不会恢复 Agent 功能。

## 备份、恢复与回滚

升级前，建议手动复制整个 `%APPDATA%\\Mai Sakurajima`。Mai 也会创建自动备份和升级前备份；v2 完整备份包括 Memory、Settings（不含 API Key）、Knowledge 索引、Work 项目/记录和自定义图片资源，Knowledge 外部源文件只保留路径引用。恢复会校验备份结构和校验值、先创建恢复前备份，再以可回滚事务提交多个数据文件。旧 v1 备份仍可读，缺少 Work 或资源字段时保留本机当前数据。恢复忽略备份内凭据并保留本机当前 API Key。

旧程序可能不认识 v16 新字段。若要回到旧版，请使用升级前备份或先复制整个数据目录；不要让不同版本同时写同一个 userData 目录。
