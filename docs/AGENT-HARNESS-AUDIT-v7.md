# Mai v5 Agent Harness 与 OpenAI Codex 对照审计

> 研究日期：2026-08-22。本文是下一轮实现前的架构研究报告，不是已实现功能说明，也不授权直接复制 v5 或 Codex 源码。

## 结论先行

Mai v7 应建设 **Mai-native Agent Harness + Codex-inspired engineering**。它不是 Codex 的内嵌版，也不应成为 DeepSeek Harness、MCP 或多代理平台。

- 保留 v7 的 `ActionRuntimeManager`、`ActionRuntime`、`ActionSession` 与 `CapabilityPolicy` 作为独立行动子系统的入口和总开关；
- 复用并重构 v5 中已经成熟的 Agent Loop、`AgentTaskState`、`ToolSpec` / `ToolRegistry` / `ToolResult`、`ToolOrchestrator`、`WorkspaceSandbox`、审批和取消链；
- 学习 Codex 的 Thread / Turn / Item 生命周期、结构化事件流、上下文压缩、工具输出截断、精确的工具调用关联和项目指令加载；
- 新建 `AgentModelAdapter`，先由 `DeepSeekAgentAdapter` 实现工具调用，不让 Agent 把 `ChatService`、`ChatRequestService` 或 Chat 的结构化回复契约重新带回来；
- 不复制 Codex Rust，不接入 Codex runtime，不加入 MCP、Skills、多代理、远程执行、IDE 或 TUI。

换句话说，v7 不应“恢复 v5 原样”，也不应“重新发明 v5 已正确解决的问题”；应当是 **复用 v5 的安全内核，重新实现其编排边界**。

## 审计范围与证据

本报告从真实代码追踪以下版本：

- v7：`agent/action-runtime-manager.js`、`action-runtime.js`、`action-session.js`、`capability-policy.js`、`action-ipc.js` 及对应测试；当前仅有 `MockActionRuntime`，没有真实工具、模型调用或事件流。
- v5.12：`agent-service.js`、`agent-runtime.js`、`agent-task-state.js`、`agent-run-coordinator.js`、`agent-tools.js`、`tool-runtime.js`、`tool-orchestrator.js`、`workspace-sandbox.js`、`agent-permissions.js`、`main.js`、测试与 Renderer 调用路径。
- Codex：官方 [`openai/codex`](https://github.com/openai/codex) 当前 `codex-rs` 的 app-server、工具路由、压缩、项目指令与 trace 设计；仅作参考实现。
- DeepSeek：官方 Tool Calls、Thinking Mode 与 Strict JSON Schema 文档。

## 1. 当前 v7.0.0 基础

v7 已经做对了最重要的产品隔离：Chat 经过 `ChatService -> ChatRequestService -> ModelGateway -> Provider`，行动必须经独立的 `agent:*` IPC 到 `ActionRuntimeManager`。`ActionSession` 只在运行时的 `Map` 中存在，不进入 `memoryState`、Chat 历史或长时记忆。

当前实现的缺口也很明确：`MockActionRuntime` 只返回固定的 structured result；`CapabilityPolicy` 只接受空 capability；会话不落盘；`ActionSession` 没有 Task / Turn / 工具记录；只有 `agent:session-started` 通知，没有可订阅事件流。因此它是正确的边界，不是可执行 Harness。

## 2. v5 真实 Agent 调用链

```text
Renderer Agent UI
  -> preload chat:send(runtimeMode=agent)
  -> main.js chatSendHandler
       -> createAgentStatusController
       -> AgentRunCoordinator.register(AbortController, webContents owner)
       -> AgentService.run
            -> build Agent prompt / budget messages
            -> runAgentRuntime / runAgentToolLoop
                 -> ModelService.toolCall(tools, signal)
                 -> assistant tool_calls ?
                    no  -> final response -> parseStructuredReply
                    yes -> ToolOrchestrator.execute
                            -> ToolRegistry lookup + ToolSpec.validate
                            -> permission check
                            -> ToolSpec.authorize / WorkspaceSandbox prepare
                            -> one-time approval when required
                            -> re-check + ToolExecutor(timeout, AbortSignal)
                            -> ToolResult
                         -> append role=tool observation
                         -> next model round
       -> appendAgentTaskHistory / appendAgentFailedRun
       -> independent agentSessions persistence + chat:agent-state updates
```

`runAgentToolLoop()` 是 v5 的核心：它把模型工具调用正规化，循环调用模型与工具；没有 `tool_calls` 才完成。每个 ToolResult 会写成 `role: tool` 消息并成为下一轮 observation。多工具返回时按顺序执行，不是并行执行。

任务的单一取消意图从 Renderer 停止、窗口关闭或应用退出进入 `AgentRunCoordinator`，再传给模型、审批等待和 `ToolExecutor` 的子 `AbortSignal`。重启时 `RUNNING` / `WAITING_USER` 任务被恢复为 `FAILED / application_restarted`，而不是自动重放。

## 3. v5 组件判定

| 组件 | 真实状态 | v7 判定 | 原因 |
| --- | --- | --- | --- |
| `runAgentToolLoop` | 有边界、会循环、会写 tool observation、会限制轮数 | **Refactor v5** | 保留循环语义；拆除对 Chat 消息形状和 UI callback 的依赖。 |
| `AgentTaskState` | 有状态机、计数、stop reason、重启恢复 | **Reuse v5** | 是合适的任务内核；改名或扩展为 v7 的 `ActionTask`。 |
| `ToolSpec` / `ToolRegistry` | 定义、校验、权限级别、sandbox、执行器 | **Reuse v5** | 小而清晰的原生工具抽象，不需要插件框架。 |
| `ToolResult` | `ok/tool/summary/data/error/code/retryable/details`，可序列化 | **Refactor v5** | 保留；补上 call id、duration、truncation、artifact ref 和公开/模型视图。 |
| `ToolOrchestrator` | 校验、授权、审批、执行前复核、稳定失败结果 | **Reuse v5** | 是工具副作用的正确唯一入口。 |
| `WorkspaceSandbox` | realpath、路径逃逸、链接、硬链接、文件类型/大小、写入前指纹复核 | **Reuse v5** | 成熟且有测试；禁止因为“重构整洁”重写。 |
| Permission levels | 0–5 但仅开放 0–2 | **Refactor v5** | 不能把连续等级当作完整授权模型；改成 capability + 精确 operation policy。 |
| 单次审批 | 审批前 prepare，审批后检查路径/内容/文件变化 | **Reuse v5** | 继续使用精确意图与 fail-closed 语义。 |
| `AgentRunCoordinator` | ownership、window close、app quit 的取消 | **Reuse v5** | 迁入 Action runtime lifecycle，不让 Renderer 拥有 AbortController。 |
| `AgentService` | Prompt、预算、模型、Loop、工具、UI phase、最终 Chat JSON 解析 | **Replace** | 职责过载，且错误地复用 Chat 形状。 |
| v5 Agent Session persistence | 独立 `agentSessions`，但写入同一 `memoryState` | **Refactor v5** | 保留独立记录，迁到独立 agent store，绝不重新污染 v7 memory schema。 |
| `chat:agent-state` | 展示 phase 和持久 TaskState 的混合推送 | **Replace** | 改为结构化、顺序化 event stream，UI 自己投影显示状态。 |

### v5 已成熟且最不应丢失的部分

1. **受限工具循环。** 模型仅提出函数调用，真正执行始终在本地 Tool Runtime；这是 DeepSeek 官方要求的宿主职责，不是模型能力本身。[DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)
2. **可测试的工作区边界。** `WorkspaceSandbox` 拒绝磁盘根、UNC / device path、越界、symlink/junction、硬链接和不安全文件名；replace 前后均复核 SHA-256。
3. **一次一意图的审批。** 读取正文、创建和替换文件均先准备精确目标，再要求确认；拒绝和超时没有副作用。
4. **结构化、可恢复的任务状态。** 限制、工具错误、观察、取消和重启恢复都能解释任务为什么停下。
5. **贯穿模型、审批、工具和窗口生命周期的取消。** 这是日后加入进程工具时必须保留的骨架。

### v5 的五个主要架构问题

1. **`AgentService` 过载。** 它同时做 Agent Prompt、上下文预算、模型请求、Loop 接线、工具阶段 UI 和最终 `parseStructuredReply()`；构造器还接收大量 Main callback。
2. **Agent 复用了 Chat 语义。** `buildSystemPrompt(..., 'agent')`、`realityContext()`、`saveContextState()` 和 Chat 的 JSON reply parser 使行动任务与陪伴 Prompt/持久副作用存在再次耦合风险。
3. **状态和展示状态重复。** `AgentTaskState` 与 `createAgentStatusController().steps/phase/status` 并列维护，事实状态和 Renderer 演示状态可能漂移。
4. **上下文只有一次初始裁剪。** v5 能裁剪输入消息，却没有把每次工具输出、长任务摘要、压缩 checkpoint 和模型上下文预算作为独立领域处理。
5. **同一 `memoryState` 里保存 Agent sessions。** 虽然 v5 避开了关系/记忆副作用，但数据边界仍不够硬；v7 正确地要求 Agent 独立存储。

## 4. Codex 中值得学习的 Harness 设计

Codex 的优势不是“有更多工具”，而是把生命周期事实拆成可关联的层：Thread、Turn、Item、tool dispatch、context compaction、approval 和 trace。App Server 的 `turn/start` 会流出 `turn/started`、`item/*`、`turn/completed`；取消是显式的 `turn/interrupt`。[Codex app-server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)

工具路由把 `session`、`turn`、step context、cancellation token、call id 和 payload 一起交给 registry，而不是只给一个工具名和参数。[Codex ToolRouter](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/router.rs) 对执行输出还带有退出码、时长、总行数和截断策略，避免巨大 stdout 直接占满模型上下文。[Codex tool output formatting](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/mod.rs)

Codex 的 compaction 作为可见 Item 运行，有独立 id、trace context 和 fallback；压缩后会滤掉过期 developer / wrapper 消息，并重新注入规范上下文。[Codex compaction](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact_remote.rs) 它也把 `AGENTS.md` 作为带来源的项目指令条目，而不是匿名字符串。[Codex project instructions](https://github.com/openai/codex/blob/main/codex-rs/core/src/agents_md.rs)

### Codex 最值得 Mai 学习的五点

1. **事件是底层事实，UI phase 是投影。** `item/started` / delta / `item/completed` 先于界面卡片；最终状态以完成事件为准。
2. **Thread / Turn / Item 分层。** 长期记录、一次用户行动和一次模型/工具单位不混用。
3. **上下文管理是运行时模块。** 预算、压缩、checkpoint、工具输出截断均不是 Prompt 拼接时的临时 if 语句。
4. **工具调用带完整关联上下文。** call id、任务、取消、权限、workspace/diff 信息必须贯穿一次执行。
5. **审计记录不等于模型对话。** Codex 的 trace 将模型可见 transcript 与工具、终端、推理调用等运行时对象分开；Mai 也应做最小化、私有的同类区分。[Codex rollout trace](https://github.com/openai/codex/blob/main/codex-rs/rollout-trace/README.md)

### Codex 对 Mai 的过度工程

以下均不属于 v7 初期必需能力：MCP、Skills 生态、App Server、TUI、IDE integration、云端/远程执行、多代理、复杂 shell 环境、完整 OS sandbox 实现、外部 telemetry、Code Mode、终端复用、fork/replay 工作流。

其中，Codex 的 OS sandbox 与 Mai 的 `WorkspaceSandbox` 也不是替代关系：前者隔离进程实际可做什么，后者在应用层验证“Mai 准备批准什么文件操作”。未来若有 Shell，两层可以共存；v7 初期先保持无 Shell。

## 5. 核心能力对照

| Capability | Mai v5 | Codex | Recommended v7 |
| --- | --- | --- | --- |
| Agent Loop | 多轮 model → tool → observation；有硬限制 | 成熟多工具运行时 | **Refactor v5**：保留 loop，独立于 Chat。 |
| Task State | 有状态、步骤、限制、stop reason | Turn / item lifecycle 更细 | **Reuse v5 + Borrow Codex design**：`ActionTask` + events。 |
| Thread / Turn | 独立 session，但任务/turn 混合 | Thread / Turn / Item 分层 | **Reimplement** 小型三层，不照抄名词。 |
| Tool Registry | `ToolSpec` / Registry / Executor | registry + router + runtime | **Reuse v5**，不引入插件系统。 |
| Tool Result | 已有稳定字段 | call / output / metadata 分离 | **Refactor v5** 为 result + execution event。 |
| Permission | 连续 Level，0–2 真正开放 | permission profile / approval policy | **Refactor v5** 为 capability + operation decision。 |
| Approval | 单次确认、精确准备、超时拒绝 | 结构化 approval lifecycle | **Reuse v5 + Borrow Codex design**。 |
| Workspace | 一个明确工作区 | 环境/根目录更复杂 | **Reuse v5** 的单工作区边界。 |
| Sandbox | 应用层安全文件操作 | OS sandbox + policy | **Reuse v5**；OS sandbox 以后再评估。 |
| Cancellation | AbortController 贯穿 | turn cancellation token | **Reuse v5**；进程阶段补强 kill semantics。 |
| Event Stream | phase callback + `chat:agent-state` | typed lifecycle items / deltas | **Reimplement**，事件成为主事实。 |
| Context | 初始 prompt budget | 预算、输出截断、compaction | **Borrow Codex design**，重写为模块。 |
| Context Compaction | 无 | 显式 compaction item / checkpoint | **Reimplement later**，Phase 2。 |
| Tool Output Limits | 文件读取有大小上限 | stdout / output truncation policy | **Refactor v5**，统一所有工具输出。 |
| Patch / Diff | `write_file` 完整 create/replace | patch/diff workflow | **Reimplement later**，不可直接覆盖。 |
| Shell | 明确未开放 | 成熟 terminal runtime | **Ignore for now**。 |
| Model Provider | `ModelService.toolCall` 直通 provider | provider / model context 丰富 | **Refactor v5** 为 `AgentModelAdapter`。 |
| MCP | 无 | 可配置生态 | **Ignore for now**。 |
| Skills | 无 | 多种项目/产品机制 | **Ignore for now**。 |

## 6. 推荐的 Mai v7 Harness

```text
Renderer Agent Workspace
  -> narrow agent:* IPC
  -> ActionRuntimeManager                 (显式启用、注册、会话 owner)
  -> MaiAgentRuntime                      (真实 ActionRuntime adapter)
       -> AgentSessionStore               (独立持久化，不写 memoryState)
       -> AgentTaskCoordinator            (单任务、生命周期、取消 owner)
       -> AgentLoop
            -> AgentContextManager
            -> AgentModelAdapter
                 -> DeepSeekAgentAdapter
            -> ToolRuntime
                 -> ToolRegistry / ToolOrchestrator / ToolExecutor
                 -> CapabilityPolicy
                 -> WorkspaceSandbox
       -> AgentEventStream
  -> IPC event subscription
  -> Renderer projections: task list, approval card, diff, progress
```

### 建议的数据层级

不要把 Codex 名词原样映射到 Mai。建议使用：

```text
ActionSession（独立、可持久化的行动记录）
  └─ ActionTask（一个用户目标；有权限快照、限制和最终状态）
       └─ ActionTurn（一次提交到最终结果；含 1..n 个 model round）
            └─ AgentEvent / Item（模型、工具、审批、输出、压缩、错误）
```

一个 `ActionTurn` 可以有多轮模型调用和工具调用；不要把每次 model request 错当作用户 Turn。初期一个 Task 只启动一个 Turn；后续追问/继续时再新增 Turn。这样既保持 UI 中“任务”的直觉，也可支持中断、恢复和审计。

### 最小事件契约

事件由 Main Process 产生，带 `eventId`、单调 `sequence`、`sessionId`、`taskId`、`turnId`、时间戳与安全的 public payload。Renderer 只根据事件投影状态，不能自行推断或改写任务。

```text
TaskStarted
TurnStarted
ContextPrepared
ModelRequestStarted
ModelDelta
ModelRequestCompleted
ToolCallRequested
ApprovalRequested
ApprovalResolved
ToolExecutionStarted
ToolOutputAvailable
ToolCompleted
ContextCompacted
TurnCompleted
TaskCompleted | TaskFailed | TaskCancelled
```

`ToolCompleted` 是某次工具的权威终态；`ModelDelta` 仅用于临时呈现。持久化需区分 public summary、模型可见 observation 和可能敏感的本地原始证据，避免把文件正文、Secret 或巨型输出无选择写进事件日志。

### Context 与工具输出策略

`AgentContextManager` 需要拥有每轮请求的选择权，而不是调用 Chat 的 `buildSystemPrompt()`：

1. 固定的 Mai Agent 指令和不可绕过的安全边界；
2. 当前 task 目标、获准的 capability、workspace 的安全摘要；
3. 当前 turn 的用户消息与最近相关 Action events；
4. 受预算限制的 ToolResult 摘要/片段；
5. 可验证的 `ContextCheckpoint`，必要时摘要旧的工具历史；
6. 当前模型上下文与输出预算。

每种工具必须声明 `modelOutputBudget`、`storageBudget` 与 `publicSummaryBudget`。超限输出保留 hash、大小、截断标志和少量首尾文本，而不是塞满下一轮 Prompt。压缩应产生明确事件、可回滚前的 checkpoint，并设最大压缩次数，防止摘要本身无限触发压缩。

项目指令可以在 Workspace 阶段引入，但只在以后进行：从选定 workspace root 到工作目录按固定顺序、固定字节上限读取 `AGENTS.md`，记录来源路径和 hash，在 UI 中展示“哪些指令参与了本任务”。它们永远不能提升 capability、关闭审批、修改 Mai 的安全政策或越过工作区边界。

### Model 解耦：`AgentModelAdapter`

Chat 的 `ModelGateway` 继续保持无工具契约。Agent 不调用它的 Chat methods，也不让 Provider 上浮 tool-call 细节。Agent 侧定义独立的最小接口：

```text
AgentModelAdapter.runRound({
  context, tools, responseMode, signal, onDelta
}) -> {
  model, usage, assistantItem, toolCalls, finishReason, continuation
}
```

`DeepSeekAgentAdapter` 首先实现它，并负责 DeepSeek 的 request/stream/error/timeout/abort 细节与 provider-specific continuation data。DeepSeek 支持 function tool calls、流式响应和 strict JSON Schema（strict 目前为 Beta）；无论 strict 是否开启，本地 `ToolSpec.validate()` 与 `WorkspaceSandbox` 都必须继续运行。[DeepSeek strict tool calls](https://api-docs.deepseek.com/guides/tool_calls/)

若开启 DeepSeek thinking mode，tool-call assistant message 的 `reasoning_content` 必须随后的子请求一并回传；官方示例明确要求这样做。因此不能沿用 v5 `normalizeToolCalls()` 只保留 `content` 和 `tool_calls` 的消息重建方式，必须由 adapter 保留原始 continuation 所需字段。[DeepSeek thinking-mode tool calls](https://api-docs.deepseek.com/guides/thinking_mode/)

结论：**DeepSeek 可以继续同时驱动 Chat 与 Agent，但只能共享 API key/安全存储和底层 HTTP 基础设施；Chat Model Path 与 AgentModelAdapter 是两条不同 execution path。**

### Patch、Diff 与未来 Shell

Phase 3 的写入不应复活 v5 的“模型给全文 → replace”体验。推荐链路为：read snapshot → generate patch → validate patch and allowed paths → preview diff → exact-patch approval → apply with baseline fingerprint → diff/result event。v5 的 create/replace、原子临时文件写入和 baseline SHA-256 可作为低层保护继续使用。

Shell 留到更后面。届时应有独立 `ProcessTool`：固定 cwd、无 shell string 拼接、参数数组、白名单/审批、stdout/stderr 截断、超时、Windows Job Object 或等价的进程树终止，以及退出时确定性清理。`AbortSignal` 只能停止等待；不能假设会自动杀掉忽略信号的子进程。

## 7. JS/TS 与 Rust 判断

选 **Option A：继续 JS/TS 的 Mai-native Harness**。

- Mai 是 Electron/Node 应用；v5 已证明这套工具边界、AbortSignal 和文件安全层可在 JS 中可靠实现。
- 直接 vendoring `codex-rs`（Option B）会同时引入 Rust workspace、模型协议、认证、终端、sandbox、MCP、trace 和跨平台打包维护，远超 Mai 需求。
- Rust sidecar（Option C）只有在确实需要进程级隔离、Windows Job Object 或高性能文件/patch 引擎且 Node 无法满足时，才值得以一个极窄协议引入；不是 Phase 1 的前置条件。

## 8. Codex 源码与许可证

Codex 仓库当前标明为 Apache-2.0。[Codex license](https://github.com/openai/codex/blob/main/docs/license.md) 本轮不复制任何源码。

若未来确实复制某一小段 Codex 代码，先逐文件核对来源和许可证，再至少：保留该文件的 copyright / license header；在分发物中携带 Apache-2.0 LICENSE；若来源发布物含适用 NOTICE 则保留其 notices；清楚标注本地修改；在 `THIRD_PARTY_NOTICES.md` 记录来源 commit、路径、用途和修改范围。不要复制整个 `codex-rs`，更不要把“受 Apache-2.0 许可”误解为无需维护归属、NOTICE 或安全责任。

## 9. 渐进式迁移路线（不在本轮执行）

### Phase 1：最小、无危险 Harness

- 保留并扩展 v7 `ActionRuntimeManager`；新增真实 `MaiAgentRuntime` 的空安全骨架；
- 将 v5 `AgentTaskState`、`AgentRunCoordinator`、`ToolSpec`、`ToolRegistry`、`ToolResult` 和 `ToolOrchestrator` 迁入独立 `agent/` 目录，并剥离 Main / Chat callback；
- 建立 `AgentEventStream`、独立 `AgentSessionStore` 和取消 lifecycle；
- 仅注册无副作用测试工具，例如 `get_current_time` / `echo_task_context`；不接 DeepSeek、不读取文件。

### Phase 2：Agent context 与 DeepSeek adapter

- 新增 `AgentContextManager`、token/output budgets、checkpoint；
- 新增 `AgentModelAdapter` / `DeepSeekAgentAdapter`；实现 non-thinking tool loop、abort、错误码和事件；
- 之后再单独验证 thinking-mode continuation、流式 delta、strict schema Beta fallback 与模型 retry；
- Chat pipeline、Chat Prompt、`ModelGateway` 无改动。

### Phase 3：Workspace read 与 patch preview

- 迁入 v5 `WorkspaceSandbox` 与 read/list 工具及其测试；
- 接入明确审批事件与独立 Agent UI；
- 先实现 read + patch proposal + diff preview；最后才实现精确批准后的 apply。

### Phase 4：受控进程

- 只有在 Phase 1–3 有稳定测试、日志和明确产品需求后，再评估 process tool；
- 无网络、无任意 shell、无系统控制的默认值不变。

### Phase 5：可选扩展

- 评估项目指令加载、有限的本地工具扩展与更完善 compaction；
- MCP、Skills、remote execution、多代理默认不在路线中，必须有新的产品与安全决策。

## 10. 下一轮第一批文件

下一轮开始代码前，先确认 Phase 1 的产品范围；建议优先新增/修改以下文件，而不是改写 `main.js`：

```text
agent/mai-agent-runtime.js                 新：真实 ActionRuntime 入口（初期无危险工具）
agent/agent-task-state.js                  基于 v5 迁入
agent/agent-run-coordinator.js             基于 v5 迁入
agent/agent-event-stream.js                新：有序、可订阅事件
agent/agent-session-store.js               新：独立于 memoryState 的持久化
agent/tool-runtime.js                      基于 v5 迁入
agent/tool-orchestrator.js                 基于 v5 迁入
agent/agent-tool-registry.js               新：Phase 1 工具清单与注册
agent/agent-ipc.js                         重构现 action-ipc，增加事件订阅/取消边界
test/agent-*.test.js                       新：状态、事件、取消、隔离和审批契约
```

Phase 2 才新增 `agent/agent-context-manager.js`、`agent/agent-model-adapter.js`、`agent/deepseek-agent-adapter.js`；Phase 3 才迁入 `workspace-sandbox.js` 与文件工具。只有实际 IPC 形状和依赖组合发生变化时，才小步修改 `main.js`、`preload.js` 与 Renderer。

## 11. 必答问题

**Q1：v5 最值得保留的五个设计？**

受限 Agent Loop、`AgentTaskState`、工具抽象与 `ToolResult`、`WorkspaceSandbox`、单次审批与全链取消。

**Q2：v5 最大的五个架构问题？**

`AgentService` 过载；复用 Chat Prompt/回复语义；任务事实与 UI phase 重复；无独立 context/compaction；Agent session 写入 `memoryState`。

**Q3：Codex 最值得学习的五个 Harness 设计？**

Thread/Turn/Item 分层；事件流优先；context checkpoint/compaction；有 call id 的工具调度和输出截断；项目指令带 provenance。

**Q4：哪些 Codex 能力对 Mai 属于 overengineering？**

MCP、Skills、App Server、TUI、IDE、remote/cloud execution、多代理、Code Mode、完整终端/OS sandbox、外部 telemetry。

**Q5：v7 应恢复 v5，还是重新实现？**

**重新实现编排，复用 v5 安全内核。** 不是二选一。

**Q6：DeepSeek 能否继续作为默认 Agent 模型？**

可以。它支持多轮 tool call、stream 和 strict JSON Schema；前提是通过独立 `DeepSeekAgentAdapter` 保留 continuation 字段并继续做本地校验与审批。

**Q7：是否有必要复制 Codex Rust？**

没有。当前收益不抵集成、打包和维护成本。

**Q8：是否更合理：Mai-native Harness + Codex-inspired engineering？**

是，这是本报告的明确推荐。

**Q9：v7 foundation 如何与 v5 Harness 融合？**

`ActionRuntimeManager` 继续做入口和总开关；`MaiAgentRuntime` 组合迁入后的任务、工具、取消和事件模块；所有 session 改存独立 agent store；Chat 不参与任何 Agent 调用或数据写入。

**Q10：下一轮第一批修改/新增哪些文件？**

以第 10 节的 Phase 1 `agent/` 文件和相应测试开始；不先迁工具、不先开 Shell、不先改 Chat。

## 本轮变更边界

本轮只新增本研究报告。没有迁移 v5 Agent，没有复制 Codex，没有新增工具、Shell、MCP、Skills 或模型调用，也没有修改 v7 的运行代码、数据 schema、IPC 运行行为或安装包。
