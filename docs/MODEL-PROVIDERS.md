# Model Providers（模型提供方）

## 调用关系

```text
ChatRequestService（聊天请求服务）
  -> ModelGateway（模型网关）
  -> ModelProviderRegistry（模型提供方注册表）
  -> Provider.complete（模型提供方完成请求）
```

`ModelGateway` 的 `generate`（普通生成）与 `stream`（流式生成）最终都调用 Provider 的 `complete`；它不接受工具定义。`configured()` 查询所选 Provider 的配置状态，`requestConfiguration()` 生成单轮 Provider、模型与上下文预算快照；异步上下文准备和一次纯文本重试沿用同一快照。

## Work 的独立模型适配器

Work 不通过 `ModelGateway` 取得工具调用。`agent/deepseek-agent-adapter.js` 只在 `MaiAgentRuntime -> AgentLoop` 路径中处理 DeepSeek 的工具定义、`tool_calls`、continuation、取消与超时，并把结果交给本地 `ToolOrchestrator`。它可与 Chat 共用安全保存的 API Key 和底层网络基础设施，但不共享 Chat Prompt、结构化回复契约、会话或 Memory 写入。

## DeepSeek

`deepseek-provider.js` 负责：

- API Key 鉴权；
- 模型白名单；
- JSON / SSE；
- token usage；
- HTTP 与网络错误；
- AbortSignal 和超时。

## Local

`local-model-provider.js` 使用固定 `http://127.0.0.1:11434` 的 Ollama 原生 `/api/tags`、`/api/show`、`/api/chat`。Main 经窄 IPC 提供模型发现，Renderer 不接收网络权限、API Key 或可修改的 endpoint。

metadata 中 `available: true` 表示适配器已实现，不代表后台服务正在运行；`configured()` 仅表示已保存合法模型名。真实请求仍验证服务、已安装模型、completion 能力、非远程模型和上下文容量；失败可见，不回退到云端。

适配器支持 JSON/NDJSON、UTF-8 分块、取消、超时与有限响应体；仅转发文字消息，忽略独立 thinking 字段，拒绝工具调用、提前断流及生成截断。模型选择保存在 `settings.model.localModel`，DeepSeek 模型和安全存储的 Key 独立保留。使用、限制及验证范围见 [OLLAMA.md](OLLAMA.md)。

## 禁止

Chat Provider 请求不得携带 `tools`、`tool_choice` 或消费 `tool_calls`。供应商条件判断不得散落到 Chat、Memory 或 Renderer；Work 的 DeepSeek tool-call 协议只能留在独立的 Agent Adapter。
