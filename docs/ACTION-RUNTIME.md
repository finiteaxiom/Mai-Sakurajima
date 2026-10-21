# Action Runtime（行动运行时）

Work 是用户显式进入的产品模式，底层由 Action Runtime 与 Mai Agent Harness 驱动；它不读取 Chat 历史、完整 Persona、Memory 或 relationship state，也不把结果写入 `memoryState`。它只注入存储无关的最小身份事实：Mai 是樱岛麻衣，用户是她的学弟；此事实不携带 Chat 私密上下文，也不改变关系状态。

```text
Renderer -> Preload agent:* -> ActionRuntimeManager -> MaiAgentRuntime
  -> AgentTaskState / AgentRunCoordinator / AgentLoop
  -> DeepSeekAgentAdapter                 -> DeepSeek Agent Tool Call API
  -> ToolOrchestrator -> ToolRegistry -> CapabilityPolicy -> WorkspaceSandbox
```

Chat 仍固定为 `ChatService -> ChatRequestService -> ModelGateway -> Provider`。`ModelGateway` 与 Chat Provider 的普通生成 contract 不接受工具调用；Agent 的 `tools`、`tool_calls` 和 continuation 仅在 `DeepSeekAgentAdapter` 内处理。

## Work 产品数据与持久化

`work/work-store.js` 是 Work 产品记录的唯一 Owner，独立保存到 `%APPDATA%\\Mai Sakurajima\\mai-work.json`。`WorkProject` 拥有 `id`、`name`、`workspacePath` 和时间字段；`WorkSession` 属于一个 Project，持有可重新打开的用户消息和最终回复。`ActionSession` 仍只是 `ActionRuntimeManager.sessions` 中一次执行的短生命周期缓存，包含运行状态和受控结果，但不是历史记录 Owner。Main 内存缓存最多保留最近进入终态的 500 条，按终态顺序淘汰；运行中且仍关联 controller 的记录不会被淘汰。更早的终态 id 按未知 id 返回 `null`，当前执行结果仍由 `execute()` 返回并保留在缓存中供 Renderer 确认。此限制只作用于 Action Runtime 内存，不裁剪 WorkSession 或 Chat 历史。

执行时 `action-ipc.js` 从当前 `WorkProject` 读取 `workspacePath`、`projectId` 与 `workSessionId`，把它们作为显式 execution context 传给 `ActionRuntimeManager` 和 `MaiAgentRuntime`。Renderer 若在 Explorer 中明确选中一个安全路径，会额外传入已在 Main Process 复核的 `workspaceSelection`，它只作为本次 Work Prompt 的指向，不保存到 Chat、Memory 或 Persona。`MaiAgentRuntime` 为该次执行构造 Workspace 工具链，因此 Project A 不会读取 Project B 的 Workspace。Workspace 由用户通过当前 Project 的 Inspector 选择；模型没有切换 Project 或 Workspace 的工具。

Work Store 只保存用户消息、最终 Work 回复、执行状态和简短工具摘要；不持久化文件正文、完整内部 Event trace、reasoning content、Secret 或模型完整 Context。Store 具有版本、规范化、原子写入和损坏原文备份。旧 `settings.agent.workspacePath` 在首次启动时迁入一个保守的“默认项目”或“迁移的 Work 项目”，并在写回 settings 前备份旧 settings；不存在的历史 ActionSession 不会被伪造。

Renderer 每次启动固定进入 Chat，不再读取 `mai-runtime-mode` 作为启动偏好。上次打开的 Project 可保留为 Work 内部偏好，只有用户主动切换到 Work 后才加载。

## Renderer 工作区投影

`renderer/work-renderer-controller.js` 管理 Work 页面投影与异步请求身份，身份包含当前模式、视图代次、Project、WorkSession 和 Workspace 路径。它只把 `agent:*` 返回的状态与 `agent:event` 事件显示到当前视图，不拥有 task 状态或取消控制权；任务仍由 Main 的 `ActionRuntimeManager` 和 `AgentRunCoordinator` 管理。模式、Project、WorkSession 或 Workspace 改变后，旧的配置、选择、刷新、执行和错误回调会被丢弃。ActionSession 与 Agent event 订阅在 Renderer 页面释放时注销。

`renderer/workspace-explorer-controller.js` 为每个相对目录分别跟踪加载请求，允许互不相关的目录并行加载。刷新会按当前展开目录恢复列表，但只有完整身份仍匹配时才恢复旧选择。预览成功、失败及收尾更新都校验 Project、Workspace、WorkSession、视图代次和相对路径；切换身份后，旧请求不会改变新 Workspace 的选择或预览。缓存只服务于当前 Project Workspace，窗口重新聚焦时标记为可能过期，用户可手动刷新。

正式 Work 由 `agent/production-action-runtime.js` 组合：它只注册 `MaiAgentRuntime`，并显式注入 `DeepSeekAgentAdapter`。早期设置中遗留的 `agent.runtime: "mock"` 会在加载和运行时规范化为 `mai-agent`；`MockActionRuntime` 与 `FakeAgentModelAdapter` 只能由测试显式构造，绝不会作为正式 Work 的 fallback。若 DeepSeek Key、模型适配器或工具链不可用，任务进入失败状态并返回明确错误，不得伪造完成结果。

## 生命周期、事件与取消

`AgentTaskState` 是唯一的任务状态 owner。它只允许 `created -> running -> waiting_user -> running`，并只可从运行或等待状态进入 `completed`、`failed`、`cancelled`；终态不可变。`AgentEventStream` 是 Renderer 的事实来源，事件经 `agent:event` 投影到 Work Inspector 的可见运行详情；它不再作为对话输入框上方的常驻事件面板。

取消链为 `agent:cancel` / 窗口关闭 / app quit -> ActionRuntimeManager -> MaiAgentRuntime -> AgentRunCoordinator -> AbortSignal -> model 请求、响应体读取、审批等待和工具执行`。等待中的模型请求与响应体可被中止；即使适配器在取消后返回迟到结果，AgentLoop 也会在消费结果前丢弃它，并只发出一个任务终态。轮次、工具调用、工具失败及总超时均 fail closed。

## 已启用工具与授权

- `echo`、`get_current_time`：无副作用，要求 `safe-local`。
- `get_workspace_info`、`list_files`、`get_file_info`、`search_files`、`read_file`、`search_file_content`：仅当用户在 Work UI 选择一个具体 Workspace 后提供，要求 `workspace-read`。`read_file` 与 `search_file_content` 会把正文或匹配片段发送给模型，均要求单次确认。
- `create_file`、`write_file`、`create_word_document`、`append_word_document`、`create_directory`、`rename_path`、`move_path`、`copy_file`、`delete_path`：要求 `workspace-write`，并始终逐次单独审批。`create_word_document` 仅新建标准 `.docx`；`append_word_document` 仅向现有、未加密的标准 `.docx` 末尾追加段落，不把既有 Word 正文送入模型。用户明确要求“写一写”且只给了字数或语气时，Work 要自行拟稿并请求创建/写入，不应因缺少额外背景而先反问；空 Workspace 未指定文件名时默认创建 `麻衣写给学弟.docx`。

`agent/workspace-file-service.js` 是 Explorer 与 Work Tools 复用的 Workspace 文件访问层。它只委托 `WorkspaceSandbox` 决定 root、相对路径、realpath、链接和文件基线；Renderer 通过 `agent:list-workspace-directory` 取得当前 Project 的目录条目与基础信息，不具备 `fs` 权限。Explorer 只按需读取一个目录，点击文件夹后才加载子目录，且提供手动刷新；它不递归扫描整个 Workspace。单个 Explorer 目录最多返回 `MAX_LIST_ENTRIES`（当前 300）项，并以 `truncated` 明确告知 UI 不完整结果，避免无界渲染。

Explorer 也可以通过窄 IPC `agent:preview-workspace-file` 直接请求安全文本的只读预览。预览仍经 `WorkspaceFileService -> WorkspaceSandbox`，复用同一文本扩展名 allowlist、128 KiB 上限、链接与路径校验；它不调用 AgentLoop、不请求模型、不会把文件正文发送给 Provider，也不产生 Chat / Memory 写入。二进制、非 allowlist 类型和超限文件只返回用户可理解的受限状态与基础元数据。

`read_file` 先经 WorkspaceSandbox/realpath/链接检查准备精确目标，再显示一次性原生确认；确认后会重新校验 root、路径、大小与 SHA-256。写入、目录和路径操作同样以准备对象绑定审批，提交时再次验证 Workspace、路径和基线；`write_file` 使用临时文件后 rename 的原子替换，`delete_path` 只允许文件或空目录，不支持递归删除。所有路径都必须是 Workspace-relative，Sandbox 拒绝绝对路径、`..`、UNC / device path、符号链接、junction、hard link 和 realpath escape。

`workspace-write` 只表示 Runtime 可以请求写操作，不授予模型自行选择 Workspace、跳过审批、Shell、进程、网络、Git、MCP、Skills、浏览器自动化或多 Agent 的能力。

`ToolOrchestrator` 是所有工具执行的唯一入口：参数校验、CapabilityPolicy、准备/授权、审批、再次验证、AbortSignal 和稳定 `ToolResult` 都在这里完成。`ToolResult` 保留 v5 的 `ok/tool/summary/data/error/code/retryable/details` 语义，并补充 `callId`、`durationMs`。

对 Workspace 写工具，`action-ipc.js` 会从运行时 `ToolCompleted` 事件提取已知文件操作的最小结构化结果，交给 `WorkStore` 与 Renderer 作为结果卡片使用；它不是模型自然语言的推断，也不保存文件正文或完整事件 trace。目录移动/重命名前的主进程确认会显示源、目标及有上限的文件/子目录影响统计；删除非空目录仍被拒绝，不增加递归删除能力。

模型每轮仅接收当前 capability 允许的静态工具定义。已选择 Workspace 时，可见 `get_workspace_info`、`list_files`、`get_file_info`、`search_files`、`read_file` 与 `search_file_content`；`list_files` 可省略 `path` 或传入 `"."` 来列出 Workspace 根目录。工具完成后，`AgentLoop` 保留 assistant tool call、以匹配的 `tool_call_id` 写入 Observation，并将其作为下一轮模型消息。最终 Work 文本来自模型最终回复，不由任务标题、步骤卡片或展示层改写。
