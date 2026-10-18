# Chat（聊天）

本文是 Mai 当前单轮 Chat Pipeline（对话链路）的说明。整体模块边界见 [ARCHITECTURE.md](ARCHITECTURE.md)，数据字段与 owner 见 [MEMORY-AND-DATA.md](MEMORY-AND-DATA.md)。

## 职责边界

`ChatService` 负责普通单轮对话的业务编排和可见副作用：会话落盘、记忆/生活更新、状态广播与回复交付。`ChatRequestService` 负责 Prompt、上下文预算、模型请求与结果解析。模型访问只能经过 `ModelGateway -> Provider`。

Chat 不负责，也不得获得以下能力：工具调用、任意文件读写、Shell 或外部程序执行、任务规划循环、权限申请或自主系统控制。

### 有限的 Workspace 只读上下文

Chat 可以在用户本轮明确请求、并通过界面亲自选择本地文件夹后，使用 Main Process 的 `workspace-capability:*` 网关取得一次目录列表或一个安全文本文件的有界上下文。这不是 Agent 功能：不调用 `agent:*`、Action Runtime、AgentLoop、Tool Runtime、`tools` 或 `tool_calls`，不复用 Work Project Workspace，也不能搜索、递归扫描、写入或执行多步任务。

授权 grant 只驻留 Main 内存，绑定当前 Chat session、真实 root、`list/read` 许可、签发时间与到期时间；切换聊天、重启、撤销或过期后必须重新选择。Renderer 从不接收 root，也不能指定绝对路径。每次路径仍经 `WorkspaceFileService -> WorkspaceSandbox` 校验，且额外拒绝 `.env`、`.pem`、`.key`、凭据与令牌类文件；非文本、二进制和超过 128 KiB 的文件同样拒绝。目录结果最多 300 项并携带 `truncated`，大文本只取有字符预算的开头摘录。

原始结果仅以一次性 context id 关联到当前 `chat:send`，由 Main 取回并在系统 Prompt 中明确标记为“不可信外部内容”。文件中的指令不能改变权限、系统规则或读取范围。文件正文不会加入会话 messages、长期记忆、共同生活数据或 Work Store；最终普通回复仍可作为会话记录保存。

会话记录追加与结构化候选消费由 `chat-turn-state.js` 分开处理。Main 将本轮是否带 Workspace context 传给 `ChatService`；Workspace 轮次的用户/助手消息标记 `contextSource: "workspace"`，后续历史重建也跳过这些用户消息。该轮只保留允许的会话和关系等待生命周期，不消费模型返回的 `mind`、behavior、episodes、topics、people、projects、habits、commitments 或 memories 候选，也不从本轮用户消息提取长期状态。普通 Chat 仍走原有的候选提取与合并路径。

Chat 工作区不会自动转入 Agent，也不会启动 Action Runtime。行动任务只能由用户通过顶栏产品选择器显式进入 Agent 后，经独立的 `agent:*` IPC 进入 `ActionRuntimeManager`；该路径不调用 `ChatService`，也不将 `ActionSession` 写入聊天历史或长期记忆。Chat 与 Agent 分别显示各自的侧栏、上下文与会话列表，避免把行动记录误认为陪伴对话。两种工作区共用本地壁纸和本地麻衣头像设置。

## 当前请求生命周期

```text
Renderer chat:send
  -> Main chatSendHandler
  -> ChatService.send
       -> sanitize messages
       -> noteUserReply（清除等待中的女友跟进，更新关系返回状态并保存）
       -> runChatRuntime
            ├─ directLocalTimeReply（确定性现实时间回答）
            └─ ChatRequestService.request
                 -> realityContext（按设置读取/刷新天气）
                 -> buildSystemPrompt
                 -> context budget trim
                 -> saveContextState
                 -> ModelGateway.generate / stream
                 -> selected Provider.complete
                 -> parseStructuredReply
       -> conversationState.appendConversationTurn
       -> applyReplyState（Workspace 只更新允许的会话/关系生命周期；普通 Chat 消费结构化状态候选）
       -> saveMemory + shared-life broadcast + girlfriend follow-up schedule
       -> 普通 Chat 的 commitments 与候选长期记忆合并
       -> life-hub broadcast + pet reply delivery
  -> IPC 返回 reply、sessionId 与公开 sessions
```

`directLocalTimeReply` 只处理符合条件的简短“当前时间/日期”问题，不请求模型；它随后仍经过正常的会话追加、关系/心智更新和持久化流程。流式请求把增量经现有 callback 送往 Renderer，最终仍只落下一条完整助手消息。

## 会话与状态更新顺序

模型或本地回复产生后，`chat-turn-state.js#appendConversationHistory()` 调用 `conversation-state.js` 的 `appendConversationTurn()`，将最新用户消息与助手回复写入正确 session，并保持 `activeSessionId` 合法。Workspace 轮次同时为两条消息标记 context 来源，后续历史重建不会把这类用户消息重新提炼成长期数据。

随后 `chat-turn-state.js#applyReplyState()` 与 `ChatService` 按本轮策略编排：

1. 所有 Chat 回复都可以写入关系等待状态，并保存正常用户消息和最终助手回复；
2. 普通 Chat 可更新 `mind`、受限的 `behaviorPatterns`、episodes、topics、people、projects、habits、`world`、commitments 与长期记忆；
3. Workspace Chat 不消费本轮模型结构化候选，也不从本轮用户消息生成长期状态；
4. 保存 memory、广播状态并安排女友跟进；保存失败会使 IPC 返回错误，不交付成功回复。

`ChatService` 不直接实现会话数组 mutation，也不把 Prompt 或供应商协议复制进自己。状态 Owner 只负责状态变换；保存、广播和调度仍由 Main / Chat 编排决定。

## Prompt 组成与顺序

`buildSystemPrompt()` 将稳定或仅随设置变化的系统指令放在前缀，随后才附加每轮检索和现实上下文。该顺序既保留全部 Prompt 内容，也让模型 Provider 可以复用尽可能长的安全前缀；Persona、Memory、Prompt 或 Schema 的重构不得随意改变它。

1. `BASE_SYSTEM_PROMPT` 与不含本轮线索的基础 `buildPersonaGuidance()`；
2. 当前人格配置、女友陪伴模式和用户自定义人格补充；
3. structured 模式下的 JSON 输出契约；
4. 仅与本轮用户文本相关的 `behaviorPatterns`；
5. `world` context 与可选天气等 external reality；
6. `mind` context、分层 facts、相关 episodes 与待续 `topicThreads`；
7. continuity、life-hub、跨会话历史片段与 life context；
8. 每请求重新读取的当前时间；
9. 可选 response instruction。

`current_time` 包含秒和 ISO 毫秒，必然随请求改变，因此放在所有可先复用的系统规则及动态业务上下文之后。它仍在同一条 system message 内，且位于最终 conversation messages 之前；时间、日期和相对日期回答仍以它为准。

`behaviorPatterns` 的基础人格规则与本轮选中的行为线索由不同函数拼接；两者文本和选中条件保持不变。只有选中的线索会进入动态区段，因此不会让每轮不同的检索结果破坏前面的稳定系统指令。

Prompt 构建会推进部分可持久化上下文，例如 world、facts 的 retrieval metadata 和 episode recall metadata，因此 `ChatRequestService` 在外部模型请求开始前调用既有 `saveContextState()`。消息超出预算时先裁剪，再以裁剪后的消息重新构造 Prompt。

默认 structured 回复包含 `reply`、桌宠 `action` / `emotion`，以及受严格证据约束的 memories、episodes、topics、people、projects、habits、commitments 和 `mind` 候选。`reply`（兼容 `content`、`message`、`answer`、`text`）是唯一 Critical 字段；动作、情绪和所有候选集合均可本地降级为既有默认值或空集合，不能单独造成重发。启用 `response_format: { type: 'json_object' }` 时，structured contract 只允许 JSON object：没有候选更新时使用空数组 / 空 `mind`，仍须给出非空 `reply`，不得要求模型改回普通文本。

当前 structured → plain-text fallback 的实际条件严格为：Provider 成功返回但 `rawContent` 为空、请求原本是 structured、尚未回退过、且 `finish_reason` 不是 `content_filter` 或 `length`。此时会在同一 turn 下再发一次 `structured:false` 请求；若是内容过滤、长度截断、Provider 异常、超时，或有效 JSON 缺少可见 reply，则不会自动重发，分别保持既有错误处理或本地解析结果。非空但非 JSON 的结果沿用既有普通可展示回复恢复，不会触发第二次模型请求。

## 记忆、人格与连续性约束

- 长期 fact、共同事件、人物、项目、习惯和承诺必须能追溯到最新用户原话；助手文本或无证据推测不能成为用户事实。
- `behaviorPatterns` 只在主题相关时进入 Persona guidance，不向用户显示内部标签或分数。
- `mind` 与 `relationship` 分别由 `companion-state.js` 的正常写入边界维护。普通聊天、聊天次数、夜晚或暧昧措辞不会自动推进关系。
- 会话列表与当前会话由 `conversation-state.js` 维护；删除、切换、重命名、新建和主动消息也必须经过它。

详细数据模型与 writer 规则见 [MEMORY-AND-DATA.md](MEMORY-AND-DATA.md)。

## 错误、取消与兼容性

Provider 负责稳定错误码、超时、取消和流式协议；Chat 将错误返回给 Renderer，不把失败请求写成永久 pending 会话。IPC channel、请求/响应形状、Prompt 顺序、Schema v16 和 DeepSeek 行为都属于兼容性契约。

## 临时开发诊断：DeepSeek Prompt Cache

`llm-cache-diagnostics.js` 是可删除的开发环境观测设施。仅当 `app.isPackaged === false` 时，`ChatRequestService` 在一次模型请求成功返回后输出 `[LLM Request Diagnostic]`、`[LLM Cache Diagnostic]`、`[Prompt Composition]`、`[Prompt Prefix Stability]` 与 `[LLM Turn Diagnostic]`；它不增删 Prompt 内容，也不改变 API 请求参数、保存、流式增量或异常处理。

`deepseek-provider.js` 从普通 JSON 的 `usage` 或流式 SSE 最终事件的 `usage` 读取 `prompt_tokens`、`completion_tokens`、`prompt_cache_hit_tokens` 与 `prompt_cache_miss_tokens`。缺失字段保持 `null`，命中率分母为 0 或 hit/miss 任一缺失时显示 `N/A`。

`[LLM Request Diagnostic]` 只输出内部 `turn_id`、`request_id`、`request_purpose`、调用方、是否流式和模型名。普通 Chat 的目的为 `chat_response`；只有 structured 响应为空且可安全回退时，才会在相同 turn 下出现 `chat_response_fallback`。主动问候、朋友圈、朋友圈评论、女友跟进和连接测试各有独立 purpose，避免与正常聊天混淆。

若 structured 请求收到空内容、截断、内容过滤、Provider 错误或超时，`[Structured Fallback Diagnostic]` 会记录标准 reason code、是否将回退、`finish_reason`、响应字符数、JSON/可见 reply 状态、Provider content 形态及非敏感错误码/HTTP 状态。当前标准代码包括 `EMPTY_RESPONSE`、`TRUNCATED_RESPONSE`、`CONTENT_FILTERED`、`PROVIDER_ERROR`、`TIMEOUT` 与 `RETRY_EXHAUSTED`；它们均不携带模型正文。

每次 structured 响应还会输出 `[DeepSeek Response Shape]`，并将相同的脱敏字段写入 JSONL：choice 数量、`finish_reason`、`content` / `reasoning_content` 的存在、类型和字符数、tool / function / refusal 的存在与计数。它不保留任何字段正文。`llm-turn-summary.csv` 还记录 structured 主请求的 `main_finish_reason`、`main_content_chars` 与 `main_content_non_whitespace_chars`，用于识别 API 实际返回 whitespace-only content 的情况。

`[LLM Turn Diagnostic]` 汇总同一 `turn_id` 内已完成请求的数量和 usage totals。日志只输出 usage 数值、system prompt 的总字符/估算 token、会话消息总字符/估算 token、最终 message count 和最终 prompt 的估算 token。`[Prompt Prefix Stability]` 逐段输出区段名、字符数、截短 SHA-256 hash、相对同 purpose / 同 streaming 上一请求的 `hash_changed`、`first_changed_section`、连续未变 `stable_prefix_chars` 及其估算 token；它不打印 Prompt、Memory、聊天正文、配置或凭据。

开发环境还会将无正文记录写入源码目录的 `logs/llm-diagnostics.jsonl`，并以当前运行进程内最多 120 个 turn 更新 `logs/llm-turn-summary.csv`。JSONL 达到 4 MB 时会安全清空后继续记录；写入失败不会影响聊天。运行 `npm run diagnostics:summary` 可从 JSONL 输出 turns、fallback rate、平均 token、缓存命中率和 fallback reason 分布。打包应用不会创建这些文件。

当需要定位真实 production Prompt 的 structured 空响应时，开发者可在临时 PowerShell 会话设置 `DEEPSEEK_API_KEY` 后运行 `npm run diagnostics:real-mai-smoke`。该 Electron 诊断只在 `MAI_DEEPSEEK_INCREMENTAL_SMOKE=1` 时执行：它通过同一个 `buildSystemPrompt()` 取得实际非空 sections，按生产顺序逐步组合并沿用 `ModelGateway -> DeepSeekProvider` 的 structured 参数。它只把 section 名、数量、长度、usage、response shape 与成功状态写入 `logs/deepseek-json-incremental-smoke.jsonl` 和 `logs/deepseek-json-incremental-summary.csv`，绝不记录 Prompt、记忆、用户消息、模型正文或 Key；正常聊天不会进入此路径。

`npm run diagnostics:real-session-smoke` 使用相同的隔离诊断路径，但以活动会话中最后一条用户消息为终点重放已保存的对话上下文，用于确认真实消息与动态检索内容的组合是否复现问题。它不修改会话、memory、设置或 Prompt，只记录消息数量、总字符数和 role 序列；由于会重复发送正常聊天已会发送给 Provider 的上下文，运行前必须由用户明确决定。

`npm run diagnostics:session-message-bisect` 在已确认真实会话可复现空白响应后使用。它固定 `core_system` 与 `structured_reply_contract`，先比较“仅最后一条用户消息”和“完整历史”，再以二分法检查历史回合范围；输出仅包括范围索引、数量、角色与响应结构，不包含任一消息正文。该诊断同样只读本地数据，且会发起多次真实 Provider 请求。

`npm run diagnostics:session-message-shape-audit` 在二分确认任意历史回合都可能复现后使用。它只选取第一条历史 user/assistant 回合，并比较原始 user、原始 assistant、原始成对消息、将 assistant 改为 user，以及固定的安全 assistant JSON/文本；输出不含原始内容，用于区分历史 role、内容形状与特定文本造成的影响。

对 DeepSeek structured Chat，历史中的 assistant 可见回复会在请求边界被包装为明确标注的历史上下文数据；原文不会删除或改写，持久化会话中的 role 和内容也不会改变。该边界只影响发送给 Provider 的临时 message 序列，用于避免 Provider 在 JSON mode 下对特定原生 `user → assistant` 历史组合返回空白内容。
