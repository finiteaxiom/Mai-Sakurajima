# Mai 当前架构

本文是 Mai 当前实现的系统结构说明。数据字段、持久化与 state ownership（状态所有权）的详细规则见 [MEMORY-AND-DATA.md](MEMORY-AND-DATA.md)；单轮聊天顺序见 [CHAT.md](CHAT.md)。

## 产品与进程边界

Chat 的 `structured-reply.js` 统一识别回复封装：截断 JSON 只恢复首个完整的顶层正文字符串，放弃该回复的全部结构化状态候选；正文不完整时返回可见错误，不回显原始 JSON。纯文本重试先缓冲并检查封装，再返回正文。历史消息仅在 Chat 显示和模型上下文序列化时过滤封装，不改写磁盘历史；用户消息与 Work 消息不经过这一显示过滤。

Mai 是本地优先的 Windows 桌面 AI 伴侣。Renderer（渲染进程）只负责界面和受限 IPC 调用；它没有 Node.js、数据库、API Key 或模型网络权限。所有数据、模型请求、文件导入与系统级窗口操作都在 Electron Main Process（主进程）中完成。

Renderer 的统一视觉 token、外观偏好和页面层级见 [MAI-DESIGN-SYSTEM.md](MAI-DESIGN-SYSTEM.md)。这些只改变呈现层，不改变下面的 Runtime 或 IPC 边界。

```text
Renderer
  ├─ Desktop Pet
  ├─ Chat（陪伴工作区）与 Work（工作模式）
  ├─ Life assistant / Knowledge
  └─ Timer / Voice / Settings
          │ contextBridge
          ▼
Preload
          │ narrow IPC
          ▼
main.js（composition root 与现有编排层）
  ├─ Window / tray / pet visibility
  ├─ ChatService -> ChatRequestService -> ModelGateway -> Provider
  ├─ optional ActionRuntimeManager -> Action Runtime Adapter
  ├─ Memory, shared-life, continuity, moments, life assistant
  ├─ Knowledge, Voice, reminder and proactive flows
  ├─ Settings, safeStorage and local JSON persistence
  └─ Backup / restore / export
```

Mai 首先是陪伴产品。顶栏的产品选择器提供两个互斥工作区：Chat 是 Chat Mode / Companion Runtime（陪伴运行时），负责人格、关系、记忆与共同生活；Work 是用户可见的 Work Mode，由 Action Runtime（行动运行时）与 Mai Agent Harness 在内部驱动，仅在用户显式选择并启用后完成明确工作。两个工作区分别显示自己的侧栏、上下文和会话记录；它们不共享会话或状态写入路径。两种工作区共用同一套外观设置，包括使用者主动导入的本地壁纸和本地麻衣头像；切换外观不会改变运行时数据边界。

v7.1 的正式 Work 通过 `agent/production-action-runtime.js` 只组合 `MaiAgentRuntime` 与独立的 `DeepSeekAgentAdapter` 执行模型工具调用；遗留 `mock` 设置会规范化到 `mai-agent`，且缺少模型配置时会失败关闭，不会改用测试替身。`work/work-store.js` 是独立 Work 产品域：Project 拥有 Workspace，WorkSession 拥有可恢复的用户/最终回复消息及有边界的操作结果，ActionRuntime 只拥有一次执行。执行上下文由当前 Project 显式传入 Runtime，不能从全局 settings 读取 Workspace。`agent/workspace-file-service.js` 复用 `WorkspaceSandbox` 作为 Explorer 与 Work Tools 的受限文件访问层；Renderer 只能通过 `agent:list-workspace-directory` 与只读的 `agent:preview-workspace-file` 访问当前 Project，不能直接使用 `fs`。预览不经过 AgentLoop 或 Provider，并复用安全文本 allowlist、128 KiB 上限与 Sandbox。Explorer 每个目录最多显示 300 项并明确 `truncated`。Chat 不接受 tools；但在用户显式选择本地文件夹后，可经 Main 持有的 `workspace-capability:*` 临时网关对当前 Chat session 执行一次 `list` 或 `read`。该网关不复用 Work Project root、`agent:*` 或 AgentLoop；grant 不持久化，绑定 session、真实 root、允许操作、签发/到期时间，支持撤销与切换。网关仍走 `WorkspaceFileService -> WorkspaceSandbox`，拒绝绝对/越界/链接路径、二进制和超限文件，并额外拒绝 `.env`、密钥、凭据与令牌类文件。目录仅返回最多 300 项并保留 `truncated`，文件正文只形成有 Chat 字符预算的单次不可信临时上下文，不能写入记忆或会话持久化。静态 `echo`、`get_current_time` 要求 `safe-local`；用户明确选择 Project Workspace 后，`get_workspace_info`、`list_files`、`get_file_info`、`search_files`、以及经一次性确认的 `read_file`、`search_file_content` 要求 `workspace-read`，`create_file`、`write_file`、`create_word_document`、`append_word_document`、`create_directory`、`rename_path`、`move_path`、`copy_file`、`delete_path` 要求 `workspace-write` 与每次单独审批。`word-document-service.js` 只新建标准 `.docx` 或向未加密的标准 `.docx` 末尾追加段落，不把既有 Word 正文送入模型。所有能力都由 `WorkspaceSandbox` 保护。它不提供 Shell、Git、代码执行、网络工具或系统控制；`MockActionRuntime` 与 `FakeAgentModelAdapter` 只保留作兼容和确定性测试。

## Main Process 的当前角色

`main.js` 是应用的 composition root（依赖组合根）：初始化 storage、Provider、Chat service、窗口和 IPC，并在退出时协调保存与清理。它也仍承载不少历史遗留的业务编排、设置、备份、生活数据和 IPC handler；因此它**正在向协调层演进，但目前并不是只有 bootstrap 的薄文件**。

后续只在某项职责自然变更时，以明确边界小步提取。不得为了缩短 `main.js` 或统一文件命名强行拆开高度耦合的 Chat、Prompt、Memory 或 Schema 流程。

## 已实现的模块边界

| 范围 | 当前模块与职责 | 不负责 |
|---|---|---|
| 窗口与托盘 | `window-manager.js` 创建并管理 pet、chat、timer、assistant 窗口、托盘与关闭行为 | Chat、Memory、Persona、Provider 规则 |
| 桌宠显隐 | `pet-visibility.js` 管理悬停/显隐定时器 | 业务状态与 Prompt |
| 桌宠衣橱 | `pet-wardrobe.js` 校验固定服装 ID 并调用 Main 保存设置；`renderer/pet-catalog.js` 与 `pet-sprites.js` 提供静态动作目录和共同播放器；详见 [PET-WARDROBE.md](PET-WARDROBE.md) | Chat、Memory、Voice 生命周期、动态脚本或外部资源加载 |
| 领域 IPC | `voice-ipc.js`、`assistant-ipc.js`、`timer-ipc.js`、`workspace-capability-ipc.js` 只注册各自 channel，并通过窄回调调用 Main 编排 | Prompt、持久化策略、跨域状态规则 |
| Chat Workspace 只读授权 | `workspace-capability-gateway.js` 持有会话绑定、可过期/撤销的 root grant 与单次 context；只允许 `list` / `read`，并委托 `WorkspaceFileService` | Work Project、Agent、写入、递归扫描、持久化文件正文 |
| Renderer Chat turn 投影 | `renderer/chat-turn-coordinator.js` 管理当前视图 turn token、session/view generation、乐观消息与 pending 清理、取消确认和 Voice 流订阅释放；同 session 完整 hydration 也会废弃旧投影 | Main 请求 AbortController、Provider、持久化与结构化状态候选 |
| Renderer Work / Explorer 投影 | `renderer/work-renderer-controller.js` 将 Work 数据、运行状态与事件投影到模式/Project/WorkSession/Workspace 身份绑定的视图；`renderer/workspace-explorer-controller.js` 按目录独立加载并校验预览回调；`renderer/work-renderer-bindings.js` 组合两者 | ActionSession / task 的权威状态、取消控制权、Workspace 外访问或超出现有 IPC 的能力 |
| Chat 请求生命周期 | Main 通过 `chat-request-lifecycle.js` 为 Chat 与主动请求绑定 requestId、session、sender 和取消信号；取消在会话切换、删除、窗口关闭、恢复和退出时生效 | Renderer 请求不能直接拥有 AbortController 或放宽持久化策略 |
| Chat 编排 | `chat-service.js` 协调一轮消息与副作用；`chat-turn-state.js` 分开追加会话记录和消费普通 Chat 的结构化状态候选 | Prompt 组装、供应商协议 |
| Chat 请求与上下文 | `chat-request-service.js` 控制上下文预算、执行普通/流式请求并解析结果；`chat-prompt-context.js` 只读生成 Prompt 与状态变更计划，`chat-reality-context.js` 准备可验证提交的现实上下文 | 会话持久化、生活数据更新；只有 Main 确认请求仍有效后才提交最终上下文计划 |
| 模型访问 | `model-gateway.js`、`model-provider-registry.js`、`deepseek-provider.js`、`local-model-provider.js` | Memory、Renderer、工具调用 |
| Work 产品与执行 | `work/work-store.js` 拥有 Project/WorkSession 持久化；`action-ipc.js` 连接产品域与执行上下文；`agent/action-runtime-manager.js`、`mai-agent-runtime.js`、`agent-loop.js`、`agent-task-state.js`、`deepseek-agent-adapter.js`、`tool-orchestrator.js`、`workspace-file-service.js`、`workspace-sandbox.js`、`workspace-tools.js`、`word-document-service.js`、`action-session.js` 负责单次执行 | ChatService、Memory、Persona、Chat ModelGateway、Shell 或系统执行能力 |
| 会话状态 | `conversation-state.js` 负责 sessions、active session、创建/选择/删除/重命名和追加消息的正常 mutation | 保存、广播、Prompt、模型请求 |
| Mind / Relationship | `companion-state.js` 写入 `mind` 与 `relationship`，复用 `intelligence.js` 的纯计算 | 保存、广播、主动消息调度 |
| Assistant 状态 | `life-assistant.js` 负责 `assistant` 的默认值、规范化、专注、简报、应用使用、提醒台账和 Promise 状态变换 | 跨域 life item 写入、保存、广播、调度 |
| 记忆与生活算法 | `memory-engine.js`、`memory-extractor.js`、`shared-life.js`、`life-hub.js`、`continuity-engine.js`、`moments.js` 提供提取、选择、合并和规范化逻辑 | Provider、窗口、IPC 注册 |
| 知识资料 | `knowledge-engine.js` 与 `knowledge-importer.js` 管理用户明确导入的本地资料与检索索引 | 后台任意扫描 |
| 语音 | `voice-service.js`、`local-tts-service.js`、`voice-emotion.js` | Chat/Memory 写入 |
| 持久化与备份 | `storage.js` 固定数据目录；`json-persistence.js` 提供可传播错误的同目录临时文件替换；`file-set-transaction.js` 管理多文件恢复和启动回滚；Main 在启动事务恢复成功前不加载产品数据，事务回滚失败后冻结 Memory、Settings、Knowledge、Work、自定义资源和后台保存入口；`automatic-backup-service.js` 写每日备份且保留既有备份；`backup-engine.js` 提供版本化备份、恢复与导出校验 | 业务决策 |

`main.js` 仍直接注册其余 chat、settings、knowledge、backup、window 与 proactive IPC。这是当前实现，不应被文档描述成已经完全模块化。

## IPC 与副作用

Preload 只暴露预定义 channel；Renderer 不得构造任意文件路径、读取 Secret 或绕过 Main。专门的 voice、assistant、timer IPC 注册器只接收它们需要的回调。其余 channel 暂由 `main.js#registerIpc()` 注册。

状态模块和纯算法模块不默认保存、广播或调度。通常由 Main 的业务编排在 mutation 后决定是否调用 `saveMemory()`、`saveSettings()`、窗口广播、提醒调度或主动消息调度。这个分离避免把持久化和 UI 副作用隐藏在纯状态操作中。

## State ownership（状态所有权）

共享可变状态的 Owner、合法 writer 与读取方不能混为一谈：Owner 定义正常 mutation 边界；编排层可调用该边界，再负责保存与广播。当前已经明确的边界如下。

| 状态 | Owner / 正常写入边界 | 主要 Reader | 编排者 |
|---|---|---|---|
| `memoryState.sessions`、`activeSessionId` | `conversation-state.js` | Chat、历史 UI、主动消息 | Main / ChatService 调用后保存与广播 |
| `memoryState.mind`、`relationship` | `companion-state.js` | Prompt、主动消息、关系 UI | Chat、主动消息、设置流程 |
| `memoryState.assistant` | `life-assistant.js` | 生活助手 UI、Prompt、主动消息 | Main 负责 life item 联动、保存、广播与 timer |
| `settings` | Main 的 settings 流程与安全存储路径 | Renderer 的公开设置视图、Provider、窗口 | Main 保存与通知 |
| `knowledgeState` | Main 的知识资料流程，使用 `knowledge-engine.js` 规范化 | 知识 UI、Chat context | Main 保存与广播 |
| Work Project / WorkSession | `work/work-store.js` | Work Renderer 与 `action-ipc.js` | Work IPC 在产品边界写入；Action Runtime 不持久化它 |

其他 `memoryState` 子域仍主要由 Main 编排，并借助对应纯领域模块规范化。它们不是已经实现的独立 state service；详见数据文档的“仍由 Main 协调的子域”。

## 主要调用关系

```text
用户操作
  -> Renderer
  -> Preload / IPC
  -> Main handler 或领域 IPC 注册器
  -> 领域编排 / 状态边界
  -> persistence、Renderer broadcast、timer 或窗口副作用
```

Chat 的模型调用链固定为：

```text
ChatService
  -> ChatRequestService
  -> ModelGateway
  -> selected Provider
```

Provider 只能完成普通或流式文本生成，不接受 `tools`、`tool_choice` 或 `tool_calls`。更具体的 Prompt、消息与记忆更新顺序见 [CHAT.md](CHAT.md)。

行动链独立为：

```text
Renderer Agent explicit workspace
  -> Preload agent:* IPC
  -> ActionRuntimeManager
  -> MaiAgentRuntime -> AgentRunCoordinator -> AgentLoop
  -> DeepSeekAgentAdapter -> ToolOrchestrator -> ToolRegistry -> WorkspaceFileService -> WorkspaceSandbox
  -> ActionSession / AgentTaskState / structured ActionResult and agent:event
  -> Action presentation
```

`ActionSession` 只驻留在行动运行时，并可通过 `agent:list-sessions` 仅供 Agent 的任务侧栏读取；它的 task state、结果和事件日志不写入 `memoryState`、Chat sessions 或 Prompt。Main 内存最多保留最近进入终态的 500 条，运行中及仍关联 controller 的记录不参与淘汰；更早的终态 id 返回未知 id 的 `null` 语义。该缓存上限不会裁剪 WorkStore 或 Chat 历史。行动运行时未启用、不可用、失败或被整个模块移除时，现有 Companion Runtime 的启动与 Chat 链路仍可正常工作。

## 架构方向

长期方向是让 `main.js` 更集中于启动、依赖组合、IPC 注册和生命周期协调，并让共享状态经过明确领域边界。但这是方向，不是当前事实，也不授权引入 Event Bus、Service Container、CQRS、Repository、Agent 框架或大型 DI 框架。架构必须服务于陪伴产品的稳定性、数据兼容与可测试性。
