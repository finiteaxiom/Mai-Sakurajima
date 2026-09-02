# AGENTS.md

本文件是 Mai v7.1.0 的顶层工程规则。修改前必须完整阅读本文件、任务涉及的真实代码与相关 `docs/`。源码是当前事实的最高依据；历史 audit、migration 与 changelog 文档只在其明确的历史范围内有效。

## 1. 产品定位与双 Runtime

Mai 首先是本地优先的 Windows 桌面 AI 伴侣，核心仍是自然对话、连续会话、长期记忆、人格、共同生活、语音、桌宠与用户明确操作的生活辅助。

Mai 可以拥有可选、受控、独立的 Action Runtime（行动运行时），但它不是通用 Agent 平台、Coding Agent、Workflow Engine、Shell frontend 或多代理产品。Agent 不得成为产品中心，也不得把普通对话包装成行动任务。

```text
Renderer
  ├─ Chat UI
  └─ Work / Action UI
        │
        ▼
Preload / narrow IPC
        │
        ▼
Electron Main Process
  ├─ Chat Runtime
  │    └─ ChatService -> ChatRequestService -> ModelGateway -> Provider
  └─ Action Runtime
       ├─ WorkStore（Project / WorkSession 持久化）
       ├─ ActionRuntimeManager / ActionSession / CapabilityPolicy
       └─ MaiAgentRuntime
            ├─ AgentLoop / AgentTaskState / AgentRunCoordinator
            ├─ AgentEventStream
            ├─ AgentModelAdapter / DeepSeekAgentAdapter
            └─ ToolRegistry / ToolOrchestrator / ToolResult
                 └─ WorkspaceFileService -> WorkspaceSandbox / WordDocumentService
```

## 2. Chat Runtime：不可 Agent 化

Chat 的调用链固定为：

```text
ChatService -> ChatRequestService -> ModelGateway -> Provider
```

Chat 只负责普通对话、Persona、conversation、Memory / relationship context、Chat model request 与 streaming response。业务层不得绕过 `ModelGateway` 判断 Provider 差异。

Chat 不得调用 `AgentLoop`、Tool Runtime、Action Runtime 或 `agent:*` IPC；不得使用 `tools`、`tool_choice` 或 `tool_calls`；不得自行发起 filesystem、Shell、process、network action 或任务循环。DeepSeek 是当前可用的 Chat Provider；本地模型仍是诚实的 unavailable 占位。

唯一的只读例外是 `workspace-capability:*`：它是 Main Process 持有的、按当前 Chat session 绑定且可撤销的临时授权网关，不属于 Agent、Tool Runtime 或通用能力系统。Renderer 只能请求状态、打开原生目录选择、撤销授权，以及对相对路径执行一次 `list` 或 `read`；它不能传入真实 root、绝对路径、递归扫描、搜索、写入或任意工具名。网关必须继续经 `WorkspaceFileService -> WorkspaceSandbox`，只允许安全文本类型与 128 KiB 原始文件上限，并对 `.env`、密钥、凭据和令牌类文件 fail closed。读取结果只能以有字符预算、标注为不可信的单次临时上下文进入既有 `ChatRequestService`；不得进入消息持久化、长期记忆、Agent、Task、Tool 调用或后续循环。用户没有明确授权时 Chat 不得读取任何 Workspace，也不得复用 Work Project 的 root。

## 3. Work / Action Runtime：独立且受控

Work 是面向用户的产品模式；底层继续由 Mai Agent Harness / Action Runtime 驱动。它只能由用户显式进入 Work 工作区并经受限 `agent:*` IPC 启动，并必须与 Chat 保持独立 execution path（执行路径）：

- 不复用 `ChatService` 语义、`ChatRequestService` 的 Chat Prompt 或 Chat 的结构化回复契约；
- 不自动读取 Chat history、完整 Persona、写入 Memory 或改变 relationship state；仅可注入与存储无关、固定且最小的 Work 身份事实（樱岛麻衣、用户是学弟），不得借此携带 Chat 私密上下文；
- `ActionSession`、Agent task state、结果与事件只驻留在独立运行时内存状态，不写入 `memoryState`、Chat sessions 或 Prompt；
- 如未来确实需要共享信息，必须新增明确、最小、可测试的数据边界。

`legacyAgentArchive` 继续只是 v5 历史 Agent 数据的只读归档：不得进入 Chat / Agent Prompt，不得重新执行、写回 Memory 或自动变成活跃 task。

当前 v7.1.0 的 Agent 模型路径为 `MaiAgentRuntime -> AgentLoop -> DeepSeekAgentAdapter`。它独立处理 DeepSeek 的工具调用、取消、超时和 tool-call continuation；不得把这些字段加入 Chat 的 `ModelGateway` 或普通 Provider contract。`FakeAgentModelAdapter` 只保留为确定性测试替身。

`work/work-store.js` 是 Work 产品数据的 Owner：`WorkProject` 持有用户选择的 Workspace，`WorkSession` 持有用户消息、最终回复和有边界的操作结果。它独立持久化到用户数据目录；`ActionSession` 仍只表示一次运行，不能取代 WorkSession 或写入 Chat/Memory。`MockActionRuntime` 仅供测试显式构造，不是正式 Work 后备运行时。

## 4. 当前 Work 能力边界

当前允许的能力是 DeepSeek Agent tool loop、结构化事件、取消、运行时上限以及静态工具 `echo`、`get_current_time`。用户明确选择具体 Work Workspace 后，才额外提供 `get_workspace_info`、`list_files`、`get_file_info`、按名称的 `search_files`、经单次确认的 `read_file` 与 `search_file_content`，以及同样逐次审批的 `create_file`、`write_file`、`create_word_document`、`append_word_document`、`create_directory`、`rename_path`、`move_path`、`copy_file`、`delete_path`。Word 工具只可新建或向标准、未加密 `.docx` 末尾追加段落，既有 Word 正文不得进入模型上下文。`safe-local` 仅代表无副作用工具；`workspace-read` 只代表已选 Workspace 内受 Sandbox 保护的读取；`workspace-write` 仅代表 Runtime 有资格请求写入，绝不代表自动允许具体操作。

所有文件操作都必须经由 `WorkspaceFileService` 与 `WorkspaceSandbox` 的 relative path、realpath、链接、Workspace 边界与审批后基线复核；Explorer 与 Work Tools 复用这一访问层，Renderer 只可通过窄 IPC 请求当前 Project 的目录与基础信息，不得直接以模型路径或 UI 路径调用 `fs`。`write_file` 必须采用 prepare -> fingerprint -> approval -> revalidate -> atomic replace；`delete_path` 只可删除文件或空目录，禁止递归删除。禁止 Shell、任意 process execution、network tool、browser automation、Git、MCP、Skills、remote execution、插件发现或 multi-agent；Work 不得自行选择或更换 Workspace。

## 5. Tool Runtime 与 CapabilityPolicy

Tool Runtime 允许作为 Action Runtime 的内部机制，但不是通用 Plugin Framework：

- Tool 必须静态、显式注册，默认 fail closed；不允许动态任意代码执行；
- `CapabilityPolicy` 是 Action Runtime 的安全边界。任何有副作用的 Tool 都必须经过 `CapabilityPolicy -> validation / prepare -> single approval -> revalidate -> execution`；Renderer、Model 和 Tool 自身均不得绕过；
- Tool capability 不得由模型自行提升；
- Tool failure 应形成 structured `ToolResult` / observation，由 AgentLoop 依限制处理，不得无边界破坏 Runtime。

## 6. Event、Task 与取消所有权

Action Runtime 的结构化 event 是运行时事实，Renderer 的 phase、日志与卡片只是投影；Renderer 不得维护另一套权威 task state，也不得拥有 `AbortController`。

当前事件包含 `TaskStarted`、`TurnStarted`、`ModelRequestStarted`、`ModelRequestCompleted`、`ToolCallRequested`、`ToolExecutionStarted`、`ToolCompleted`、`TurnCompleted` 及唯一一个终态 `TaskCompleted`、`TaskFailed` 或 `TaskCancelled`。事件带 `eventId`、单调 `sequence`、`timestamp`、`sessionId`、`taskId` 与安全 payload。

Main / Action Runtime 负责 task lifecycle 与取消：`ActionRuntimeManager` 协调 session，`AgentRunCoordinator` 持有实际运行的取消范围。取消必须传播到 loop、model adapter 与 tool execution。`completed`、`failed`、`cancelled` 是不同终态；一个 task 只能产生一个 terminal state / event。轮次、工具调用、工具失败和超时上限必须继续 fail closed。

## 7. 用户数据、持久化与安全

稳定应用标识和数据目录必须保持：

- appId：`com.mai.sakurajima.desktop`
- userData：`%APPDATA%\Mai Sakurajima`

升级不得删除、重置或静默丢失 Chat 历史、长期记忆与修订证据、朋友圈、日程、项目、习惯、知识索引、API Key、设置或备份。Schema 变更必须先备份、可重复迁移、验证旧数据可读，并保留损坏文件原文后再恢复。

未来如需 Agent persistence，必须进入独立 Agent Store；不得重新使用 `memoryState.agentSessions`，除非是明确的只读 legacy migration。API Key 只保存在 Main Process 可访问的本地安全存储中，不进入 Renderer、日志、导出或 Git。

## 8. 渐进式维护与文档

`main.js` 的方向是 bootstrap、依赖组合、IPC 注册与生命周期协调；这不授权仓库级重写。重构以职责、状态所有权、耦合、测试保护与副作用边界为依据，不以行数或文件数量为 KPI。

`AGENTS.md` 不是 changelog。只有长期项目级原则、核心架构约束、主要模块职责或工作协议改变时才修改它。源码修改后检查 `docs/` 是否描述了受影响的当前事实：有实际变化才同步更新；没有则不机械改写。文档优先中文，源码标识保留英文；无法确认代码与文档哪个正确时必须报告冲突，不得创造架构事实。

## 9. 发布产物规则

- Windows 发布只生成 NSIS 安装版；不生成、不交付、也不在发布目录保留 Portable（免安装）包。
- 公开源码和安装包不内置用户提供的壁纸；壁纸只能由使用者在运行中主动选择，并保存在本机 `userData` 中。
- 公开源码和安装包不内置第三方头像素材；麻衣与用户头像只能由使用者在运行中主动选择，并保存在本机 `userData` 中。
- `完整源码/` 只保留可追踪的源码、资源、文档、测试与 lockfile；不得保留 `node_modules/`、`dist/`、`.git/`、日志、诊断输出或操作系统运行时目录。每次发布目录中的源码压缩包必须由该干净目录生成，压缩包内的文件与 `完整源码/` 保持一致，且 `package.json` 版本一致。
- 完成最后一次源码、文档或打包配置修改后，必须重新生成源码压缩包。`SHA256.txt` 仅在用户明确要求提供校验值时生成；未要求时不在发布目录保留该文件。发布目录不得混入上个版本的安装包、压缩包、日志、blockmap 或临时构建文件。

## 10. 修改与完成标准

修改前阅读调用方、被调用方、`package.json`、测试与构建配置；判断是否影响 Chat、Action、Memory、Voice、Model、Persistence、IPC 或 UI。保护用户数据和 IPC 兼容，不扩大到无关重构。

完成前按 `package.json` 运行相关测试；涉及 Chat、迁移、UI、窗口或打包时运行相应 smoke，并如实说明未验证内容。不得声称运行不存在或未实际运行的测试。

最终原则：Work 可以作为独立、受控的 Mai-native Agent Harness 产品入口存在，但绝不能污染 Chat，也不能未经明确决策扩张到 Workspace 外或高风险能力。
