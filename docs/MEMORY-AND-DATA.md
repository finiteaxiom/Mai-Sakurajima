# Memory 与数据

本文说明 Mai 当前的数据模型、持久化边界和 state ownership（状态所有权）。系统整体结构见 [ARCHITECTURE.md](ARCHITECTURE.md)，聊天中这些数据何时被读取和更新见 [CHAT.md](CHAT.md)，跨版本历史见 [MIGRATION-v6.md](MIGRATION-v6.md)。

## 三类概念

- **Persistent Data（持久化数据）**：退出后仍保留的 JSON 数据、知识索引、备份与安全存储的 Secret。
- **Runtime State（运行时状态）**：窗口引用、timer、进行中的网络请求、语音/导入进度、缓存和服务实例；它们不等同于用户记忆，重启后不会从 `memoryState` 恢复。
- **State Owner（状态所有者）**：定义一个共享可变子域正常 mutation 的模块。调用者仍可负责 save、broadcast 和 scheduling（调度）；Owner 不因而接管所有副作用。

Reader（读取方）可以消费公开状态或上下文。Writer（写入方）必须经过 Owner 的公开边界，或在尚未形成边界的旧编排路径中由 Main 明确负责；读取不等于拥有写入权。

`ActionSession` 是独立的运行时状态：它保存行动请求、状态、结果、错误，以及未来可能出现的工具日志。它不属于 `memoryState`，不得写入 Chat sessions、长期 facts、Shared Life、Mind 或 Persona Prompt。若某次行动将来值得记住，必须另行经过明确的用户确认或记忆提炼决策。

## 存储位置与 Schema

应用 appId 为 `com.mai.sakurajima.desktop`，数据目录为 `%APPDATA%\\Mai Sakurajima`。主要文件为：

| 数据 | 存储与保护 |
|---|---|
| `memoryState` | `mai-pet-memory.json`，当前 Schema v16 |
| `settings` | `mai-pet-deepseek-settings.json`；DeepSeek API Key 优先使用 Electron `safeStorage` 加密 |
| `knowledgeState` | `mai-knowledge-index.json` |
| Work Project / WorkSession | `mai-work.json`；由 `work/work-store.js` 独立原子写入，不与 Chat sessions 混存 |
| 自定义资源 | userData 中的自定义壁纸与麻衣/用户头像 JPEG |
| 自动备份 | `backups/mai-backup-*.json`，由 `automatic-backup-service.js` 原子写入；不会自动删除已有备份 |

`json-persistence.js` 在目标同目录创建独占临时文件，写入并同步后直接替换目标；替换失败时保留旧目标、清理临时文件并向调用者抛错，不先删除目标。Memory、Settings、Knowledge 和 Work 保存失败时，Main/WorkStore 回滚内存快照并将错误返回调用方。缺失文件、JSON 解析错误和访问错误分别处理；访问或写入错误会停止安全加载，不会被当作空数据。

Memory、Settings、Knowledge 与 Work 文件 JSON 损坏时，Mai 先用原始字节创建 `.unreadable-*.backup.json`，成功保护后才可写入规范空状态；保护或恢复写入失败会中止启动并保留源文件。Memory Schema 升级前的 `.before-v16-from-v<旧版本>.backup.json` 也必须先成功创建；同名备份内容冲突或创建失败时不提交升级。WorkStore 的损坏恢复遵循相同规则。

`WorkStore` 保存项目名称、每个项目显式选择的 Workspace、WorkSession 的用户消息、最终回复、终态与最小操作结果；不保存文件正文、完整内部 Event trace、reasoning content、Secret 或完整模型 Context。加载时要求根节点为对象；`projects`、`sessions` 可以在旧数据中缺失，但只要存在就必须是对象数组；旧会话也可省略 `messages`，消息可省略 `operationResults`。存在的消息和操作结果必须满足对应的对象、数组及必需字段结构，避免归一化静默过滤坏记录。解析错误与已识别结构错误会先保护原始字节，再恢复默认状态；若原文保护或恢复写入失败，该实例会拒绝后续 mutation。归一化异常会先尝试保护原文件，随后锁住该实例；访问错误单独传播。任一加载失败后，后续保存保持阻断，直到一次显式 `load()` 成功，避免调用方捕获错误后覆盖源文件。

## `memoryState` 主要结构

```text
memoryState (Schema v16)
  ├─ sessions / activeSessionId
  ├─ facts / memoryCorrections / behaviorPatterns
  ├─ mind / relationship / world
  ├─ episodes / topicThreads / timeline / people / memoryDigests
  ├─ projects / habits / continuityMeta
  ├─ lifeItems / assistant
  ├─ moments / momentsMeta
  ├─ sharedLifeMeta / hubMeta / memoryMeta
  ├─ reality.weather
  └─ legacyAgentArchive
```

### Conversation

`sessions` 保存会话标题、创建/更新时间和用户/助手消息；`activeSessionId` 指向当前会话。`legacyAgentArchive` 仅保存 v5 旧 Agent 会话的只读兼容归档，不进入 Renderer、Prompt、模型上下文或执行流程。

Chat 新写入最多 200 段会话，每段最多新增到 2000 条消息，单条新消息最多 12000 个字符；会话或消息超限时 Main 会在模型请求前拒绝新的 Chat turn。Work 每个项目最多新建 300 段记录，每段最多新增到 2000 条消息，并在启动 Action Runtime 前为用户消息和最终回复预留两个位置；单条新 Work 消息最多 12000 个字符。上述上限只约束新写入，不会在加载、归一化或保存时删除超限旧记录；历史正文也不会因新消息字符上限而被截短。模型 Prompt 与 Renderer 当前上下文仍可按预算使用较短的消息窗口，持久历史完整保留。

### Long-term memory 与共同生活

- `facts` 是带 category、canonical key、置信度、来源、时间状态和有限 evidence trail 的长期事实；同一 key 的当前事实冲突会被规范化为一条 current，其余保留为 historical。
- `memoryCorrections` 记录用户对记忆的更正、驳回或保护规则。
- `episodes`、`topicThreads`、`timeline`、`people` 与 `memoryDigests` 保存共同事件、待续话题、时间线、人物和摘要。它们不是原始聊天记录的替代品。
- `projects`、`habits` 与 `continuityMeta` 保存跨会话的计划/习惯连续性；`lifeItems` 保存用户明确添加或对话中提取的生活事项与承诺。
- `moments`、`momentsMeta` 保存私人朋友圈内容、评论与发帖时间。

### Persona continuity

- `mind` 保存麻衣的持续情绪和关系语境，例如 mood、energy、intimacy、trust、activeTopic 与 pendingQuestion。普通聊天次数、夜晚或暧昧用语不会自动推高关系；关系变化必须来自受限的明确事件。
- `relationship` 保存主动消息与女友跟进所需的等待/计数信息，例如 waiting session、最近用户/陪伴消息时间和 follow-up count。它与 `mind` 相关，但不是同一个字段。
- `behaviorPatterns` 是受限、可追溯的行为线索摘要，而不是心理画像或另一套关系系统。当前仅允许 `late_sleep`、`procrastination`、`overthinking`、`regular_study`、`exercise`；每条线索需要来自独立、可定位的用户消息，最多保留 8 条来源。只有本轮话题直接相关时才进入 Persona Prompt，且不会向用户展示内部标签、分数或计数。

### Assistant 与现实状态

`assistant` 包含 Promise、专注记录、当前专注、获授权的前台应用聚合使用、晨间/晚间简报、Mai plan 与主动提醒台账。前台应用感知默认关闭，只保存进程名称和聚合时长，不保存窗口标题、键盘输入、截图、网页或文档正文。

`world` 维护可用于陪伴语境的本地世界状态；`reality.weather` 是按设置启用的天气缓存。它们都属于持久化数据，不是 Provider 返回的模型状态。

## State ownership 与合法 writer

| 子域 | Owner / 正常 mutation boundary | Reader | 保存、广播与调度 |
|---|---|---|---|
| `sessions`、`activeSessionId` | `conversation-state.js`：查找、创建、选择、删除、重命名、追加消息和 active id 合法化 | Chat、历史 UI、主动消息、迁移规范化 | Main / ChatService 调用后保存并广播 |
| `mind`、`relationship` | `companion-state.js`：正常化、turn 更新、关系等待与主动消息记录 | Prompt、关系 UI、主动消息 | Chat、主动消息与设置编排决定副作用 |
| `assistant` | `life-assistant.js`：默认值、normalization、focus、briefing、app usage、cue ledger、Promise 回应 | 生活助手 UI、Prompt、主动消息 | Main 保留 life item 联动、保存、广播、timer |
| `settings` | Main settings 流程，API Key 经 `safeStorage` 路径处理 | Renderer 的公开设置、Provider、窗口 | Main 保存并通知窗口 |
| `knowledgeState` | Main 知识资料流程，使用 `knowledge-engine.js` / `knowledge-importer.js` | 知识 UI、Chat context | Main 保存知识索引并广播 |
| Work Project / WorkSession | `work/work-store.js`：项目、Workspace、Work 会话、用户/最终消息与操作结果 | Work Renderer、`action-ipc.js` | Work IPC 调用 Owner；Action Runtime 不持久化它 |

下列子域有明确的纯领域算法，但当前正常 Writer 仍以 Main 编排为主，不能在文档中假称已存在独立 state service：

| 子域 | 当前计算/规范化模块 | 当前 Writer 场景 |
|---|---|---|
| `facts`、corrections、历史召回 | `memory-engine.js`、`memory-extractor.js`、`context-engine.js` | Chat 提取/合并、记忆管理 IPC、重建与修复 |
| `episodes`、`topicThreads`、`timeline`、`people`、digests | `shared-life.js`、`life-hub.js` | Chat 副作用、手动维护、从历史重建 |
| `projects`、`habits`、`continuityMeta` | `continuity-engine.js` | Chat 候选合并、连续性维护、手动 IPC、同步 |
| `lifeItems` | `intelligence.js` 的事项规范化与 Main 编排 | 手动 CRUD、Chat commitments、提醒与 assistant Promise 联动 |
| `moments`、`momentsMeta` | `moments.js` | 手动/自动发帖、评论、排程 |
| `behaviorPatterns`、`world`、`reality.weather` | `intelligence.js`、`world-engine.js` | Chat 后处理、Prompt 上下文推进、设置/天气刷新 |

这张表描述的是当前事实，不是重构待办。若未来要收束某个子域，必须先盘点 writer、建立契约测试，并避免把 save/broadcast/scheduling 混入纯状态模块。

## 检索、Prompt 与写入约束

事实召回按 Core / Relevant / Recent 分层动态选择，默认总数受限；相关性高于新近性。历史事实和 uncertain 内容默认降权，只有明确询问过去时才提高权重。facts、共同事件、人物/摘要与历史聊天片段会相互排除重复证据，避免同一件事多次灌入 Prompt。

`retrievalCount` 与 `lastRetrievedAt` 记录实际进入上下文的事实；`useCount` 不参与召回排序，避免“越被召回越容易继续被召回”的反馈循环。assistant 或模型文本不能单独成为用户事实来源；没有可定位用户原话的记忆应保持不确定或拒绝写入。

## 备份、恢复与迁移

完整备份格式 v2 包含 Memory、Settings（移除 API Key 及加密凭据字段）、Knowledge 索引/文档 chunks、Work 项目与工作记录、自定义壁纸和头像 JPEG；Knowledge 文档的外部 `sourcePath` 只作为引用，不会复制外部源文件。自动备份、手动完整备份和数据导出共用该数据快照和凭据排除规则。旧格式 v1 仍可读取；因旧备份没有 Work 和资源字段，恢复时保留当前 Work 与自定义资源。恢复任何格式都忽略备份中的凭据并保留本机当前 API Key；若本机没有可用凭据，恢复后提示重新配置。

恢复前会先完成结构/校验值验证、归一化和资源检查，并创建一份不含凭据的恢复前自动备份。Memory、Settings、Knowledge、Work、壁纸与两张头像通过 `file-set-transaction.js` 的恢复日志和原字节副本共同提交；中途失败会回滚，若进程中断则下次启动先恢复事务，再加载产品数据。缺失自定义资源会明确报告并回退相应外观选择；外部 Knowledge 源文件不属于备份内容，恢复后不可访问的引用会在结果中列出。恢复不会清理既有历史备份。

如果恢复在当前进程内无法完成回滚，Main 会进入 `restore-rollback-failed` 数据保护状态：Memory、Settings、Knowledge、WorkStore、自动/手动备份、数据导出、自定义资源导入/删除及退出保存都拒绝写入；后台定时器停止，Action Runtime 会收到取消请求，已在等待中的异步资源导入在提交文件前重新检查保护状态。Chat UI 会持续显示恢复失败、写入已停止和重启重试步骤，不会报告恢复成功。普通提交失败但事务已成功回滚时，保护状态仍保持可写。下次启动必须先成功处理事务日志及原始副本，Main 才开放产品数据加载和写入；启动恢复失败则停止启动，不执行退出自动保存。

新 API Key 只允许写入通过验证的 Electron `safeStorage` 加密字段；安全存储不可用时保存请求失败。已有旧明文 Key 在安全存储可用且加密回读验证成功前保留在本机设置中，并在 UI 显示处理提示；它不会进入备份或导出。

启动时会检查每日自动备份；用户也可通过 UI 创建、列出、恢复和导出备份。备份与恢复必须保留 Schema 兼容性，且不导出 API Key。

当旧 `memoryState.version` 低于 v16 时，Main 会在同一数据目录创建一次 `mai-pet-memory.before-v16-from-v<旧版本>.backup.json`，再规范化到 v16。早期版本需要的历史重建只在相应旧版本路径运行；重复启动不会反复创建相同升级备份。完整历史与回滚注意事项见 [MIGRATION-v6.md](MIGRATION-v6.md)。
